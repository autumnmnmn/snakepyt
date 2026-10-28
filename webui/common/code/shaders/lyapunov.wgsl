
struct Uniforms /* buffer 0 0 */ {
    width: u32,
    height: u32,
    center_low: vec2f,
    center_high: vec2f,
    zoom: f32,
    x_0: f32, // 0 to 1 = 0.5
    iterations: u32, // hard 0 to 500 = 100
    skip: u32, // hard 0 to 500 = 50
    seq_mask: u32, // hard 0 to hard 4294967295 = 5
    seq_len: u32, // hard 1 to hard 32 = 2
    seq_offset: u32, // hard 0 to hard 31 = 0 $depend(offset_mode=single)
    offset_mode: u32, // hard 0 to hard 3 = 0 $select(single, minimum, maximum, average, min_abs, count_distinct, avgAbsDiff)
    do_discont: u32, // hard 0 to hard 1 = 0 $bool $test
    discont_alpha: f32, // 0 to 1 = 0.907 $depend(do_discont=true)
    do_tent: u32, // hard 0 to hard 1 = 0 $bool
    do_neg: u32, // hard 0 to hard 1 = 0 $bool
    stochasticity: u32, // hard 0 to 1 = 0 $bool
    stochastic_modulus: u32, // 1 to 200 = 100 $depend(stochasticity=true)
    rotation: f32, // 0 to 1 = 0
    epsilon: f32, // 0 to 0.01 = 0.0001 $depend(offset_mode=count_distinct)
    do_frac: u32 // hard 0 to hard 1 = 0 $bool
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba32float, write>;

$paste(core.wgsl);
$paste(complex.wgsl);
$paste(rng.wgsl);

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let px = id.x;
    let py = id.y;

    if (px >= uniforms.width || py >= uniforms.height) {
        return;
    }

    var r_vals = ${pixel_mapping}(id.xy, uniforms.center_low, uniforms.center_high, vec2u(uniforms.width, uniforms.height), uniforms.rotation, uniforms.zoom);


    var x: array<f32, 32>;
    for (var i = 0u; i < 32u; i++) {
        x[i] = uniforms.x_0;
    }

    var lyapunov: array<f32, 32> = array<f32, 32>();

    var flipped: bool = false;

    var diverged_at: u32 = 0;

    var fprime: array<f32, 32> = array<f32, 32>();

    var final_offset = select(uniforms.seq_len,1,uniforms.offset_mode == 0u);

    var seq_position: u32 = uniforms.seq_offset % uniforms.seq_len;

    for (var iter = 0u; iter < uniforms.iterations; iter = iter + 1u) {
        for (var offset = 0u; offset < final_offset; offset = offset + 1u) {
            var inner_position: u32 = seq_position + offset;
            if (inner_position >= uniforms.seq_len) {
                inner_position -= uniforms.seq_len;
            }
            var cond = ((uniforms.seq_mask >> inner_position) & 1u) != 0u;
            if (offset == 0u && uniforms.stochasticity == 1) {
                let rng_seed = pcg_hash(px + pcg_hash(py << 1)) ^ pcg_hash(iter) ^ pcg_hash(bitcast<u32>(r_vals.x) + pcg_hash(bitcast<u32>(r_vals.y) << 1));
                flipped = select(flipped, !flipped, rng_seed % uniforms.stochastic_modulus == 0);
            }
            if (flipped) {
                cond = !cond;
            }

            var r = select(r_vals.x, r_vals.y, cond);
            var x_next = r * x[offset] * (1.0 - x[offset]);
            if (uniforms.do_tent == 1) {
                x_next = r * min(x[offset], 1.0 - x[offset]);
            }
            if (uniforms.do_neg == 1) {
                x_next = 1.0 - x_next;
            }
            if (uniforms.do_discont == 1 && x[offset] <= 0.5) {
                x_next = x_next + (uniforms.discont_alpha - 1.0) * (r - 2.0) / 4.0;
            }
            fprime[offset] = r * (1.0 - 2.0 * x[offset]);

            if (iter >= uniforms.skip) {
                var term = log(abs(fprime[offset]));
                lyapunov[offset] = c_avg(lyapunov[offset], term, iter - uniforms.skip + 1);
            }
            if (uniforms.do_frac == 1u) {
                x[offset] = fract(x_next);
            } else {
                x[offset] = x_next;
            }

        }
        if (hacky_isnan(x[0]) && diverged_at == 0) {
            diverged_at = iter;
        }
        seq_position++;
        if (seq_position == uniforms.seq_len) { seq_position = 0; }
    }

    var val: f32;
    var lya: f32;
    var prime: f32;

    var scratch: array<f32, 32>;

    var npairs: f32 = f32((uniforms.seq_len * uniforms.seq_len - uniforms.seq_len)/2);

    if (uniforms.offset_mode == 0) { // single
        val = x[0];
        lya = lyapunov[0];
        prime = fprime[0];
    } else if (uniforms.offset_mode == 1) { // min
        val = x[0];
        lya = lyapunov[0];
        prime = fprime[0];
        for (var i = 1u; i < uniforms.seq_len; i++) {
            lya = min(lya, lyapunov[i]);
            prime = min(prime, fprime[i]);
            val = min(val, x[i]);
        }
    } else if (uniforms.offset_mode == 2) { // max
        val = x[0];
        lya = lyapunov[0];
        prime = fprime[0];
        for (var i = 1u; i < uniforms.seq_len; i++) {
            lya = max(lya, lyapunov[i]);
            val = max(val, x[i]);
            prime = max(prime, fprime[i]);
        }
    } else if (uniforms.offset_mode == 3) { // avg
        val = x[0];
        lya = lyapunov[0];
        prime = fprime[0];
        for (var i = 1u; i < uniforms.seq_len; i++) {
            val = val + x[i];
            lya = lya + lyapunov[i];
            prime = prime + fprime[i];
        }
        val = val / f32(uniforms.seq_len);
        lya = lya / f32(uniforms.seq_len);
        prime = prime / f32(uniforms.seq_len);
    } else if (uniforms.offset_mode == 4) { // min abs
        val = abs(x[0]);
        lya = abs(lyapunov[0]);
        prime = abs(fprime[0]);
        for (var i = 1u; i < uniforms.seq_len; i++) {
            lya = min(lya, abs(lyapunov[i]));
            prime = min(prime, abs(fprime[i]));
            val = min(val, abs(x[i]));
        }
    } else if (uniforms.offset_mode == 5) { // count distinct
        lya = 0.0;
        prime = fprime[0];
        val = x[0];
        for (var i = 0u; i < uniforms.seq_len; i++) {
            scratch[i] = 1.0;
        }
        for (var i = 0u; i < uniforms.seq_len; i++) {
            if (scratch[i] == 0.0) { continue; }
            for (var j = i+1; j < uniforms.seq_len; j++) {
                if (abs(lyapunov[j] - lyapunov[i]) < uniforms.epsilon) {
                    scratch[j] = 0.0;
                }
            }
        }
        for (var i = 0u; i < uniforms.seq_len; i++) {
            lya += scratch[i];
        }
        lya /= f32(uniforms.seq_len);
    } else if (uniforms.offset_mode == 6) { // avg abs diff
        lya = 0.0;
        prime = 0.0;
        val = 0.0;
        for (var i = 0u; i < uniforms.seq_len; i++) {
            for (var j = i+1; j < uniforms.seq_len; j++) {
                lya += abs(lyapunov[i] - lyapunov[j]);
                val += abs(x[i] - x[j]);
                prime += abs(fprime[i] - fprime[j]);
            }
        }
        lya /= npairs;
        val /= npairs;
        prime /= npairs;
    }

    textureStore(output_texture, vec2<i32>(i32(px), i32(py)), vec4f(lya, prime, val, 0.0));
}



