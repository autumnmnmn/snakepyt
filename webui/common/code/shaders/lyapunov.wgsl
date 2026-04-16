
struct Uniforms /* buffer 0 0 */ {
    width: u32,
    height: u32,
    center: vec2f,
    zoom: f32,
    nan_color: vec3f,
    x_0: f32, // 0 to 1 = 0.5
    iterations: u32, // hard 0 to 500 = 100
    seq_mask: u32, // hard 0 to 65536 = 5
    seq_len: u32, // hard 1 to 30 = 2
    do_discont: u32, // hard 0 to 1 = 0
    discont_alpha: f32, // 0 to 1 = 0.907
    do_tent: u32, // hard 0 to 1 = 0
    do_neg: u32, // hard 0 to 1 = 0
    do_stochasticity: u32, // hard 0 to 1 = 0
    stochastic_modulus: u32, // 1 to 200 = 100
    pow_r: f32, // 0 to 3 = 1
    pow_g: f32, // 0 to 3 = 1
    pow_b: f32 // 0 to 3 = 1
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;

fn add12(ab: vec2<f32>) -> vec2<f32> {
    let s = ab.x + ab.y;
    let v = s - ab.x;
    let r = (ab.x - (s - v)) + (ab.y - v);
    return vec2<f32>(s, r);
}

fn split(a: f32) -> vec2<f32> {
    let c = 4097 * a;
    let a_b = c - a;
    let a_h = c - a_b;
    let a_l = a - a_h;
    return vec2<f32>(a_h, a_l);
}

fn mul12(ab: vec2<f32>) -> vec2<f32> {
    let x = ab.x * ab.y;
    let a_split = split(ab.x);
    let b_split = split(ab.y);
    let err1 = x - (a_split.x * b_split.x); // high * high
    let err2 = err1 - (a_split.y * b_split.x); // low * high
    let err3 = err2 - (a_split.x * b_split.y); // high * low
    let y = (a_split.y * b_split.y) - err3; // low * low
    return vec2<f32>(x, y);
}

fn complex_mag_sq(z: vec2<f32>) -> f32 {
    return z.x * z.x + z.y * z.y;
}

fn complex_mag(z: vec2<f32>) -> f32 {
    return sqrt(complex_mag_sq(z));
}

fn complex_angle(z: vec2<f32>) -> f32 {
    return atan2(z.y, z.x);
}

fn complex_mul(za: vec2<f32>, zb: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        za.x * zb.x - za.y * zb.y,
        za.x * zb.y + za.y * zb.x
    );
}

fn pixel_to_complex(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 1.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;
    let x = (f32(px) - half_width) * scale * aspect / f32(uniforms.width) + uniforms.center.x;
    let y = (f32(py) - half_height) * scale / f32(uniforms.height) + uniforms.center.y;
    return vec2<f32>(x, -y);
}

fn pixel_to_complex_alt(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;

    // map y-axis to magnitude, x-axis to angle
    let angle = (f32(px) - half_width) * scale * aspect / f32(uniforms.width) + uniforms.center.x;
    let mag = (f32(py) - half_height) * scale / (2.0 * f32(uniforms.height)) + uniforms.center.y;

    return vec2<f32>(mag * cos(angle), mag * sin(angle));
}

fn pixel_to_complex_inverted(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;

    let x = (f32(px) - half_width) * scale * aspect / f32(uniforms.width) + uniforms.center.x;
    let y = (f32(py) - half_height) * scale / f32(uniforms.height) + uniforms.center.y;

    let z = vec2<f32>(x, y);
    let mag_sq = x * x + y * y;

    // handle singularity at origin
    if (mag_sq < 1e-10) {
        return vec2<f32>(1e10, 0.0); // or whatever you want infinity to map to
    }

    return vec2<f32>(x / mag_sq, -y / mag_sq);
}

fn pixel_to_complex_inverted_d(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 16.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;
    
    // get position relative to center
    let x = (f32(px) - half_width) * scale * aspect / f32(uniforms.width);
    let y = (f32(py) - half_height) * scale / f32(uniforms.height);
    
    let mag_sq = x * x + y * y;
    if (mag_sq < 1e-10) {
        return vec2<f32>(uniforms.center.x + 1e10, uniforms.center.y);
    }
    
    // invert then add center back
    return vec2<f32>(
        uniforms.center.x + x / mag_sq,
        uniforms.center.y - y / mag_sq
    );
}


fn hash(seed: u32) -> u32 {
    var x = seed;
    x = ((x >> 16u) ^ x) * 0x45d9f3bu;
    x = ((x >> 16u) ^ x) * 0x45d9f3bu;
    x = (x >> 16u) ^ x;
    return x;
}

fn pcg_hash(x: u32) -> u32 {
    let state = x * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn random_float(seed: u32) -> f32 {
    return f32(hash(seed)) / 4294967296.0; // 2^32
}

fn c_avg(prev: f32, val: f32, n: u32) -> f32 {
    // TODO nan and inf checks
    var next = prev + (val - prev) / f32(n);
    return next;
}

fn hacky_isnan(x: f32) -> bool {
    let bits = bitcast<u32>(x);
    return (bits & 0x7f800000u) == 0x7f800000u
        && (bits & 0x007fffffu) != 0u;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let px = id.x;
    let py = id.y;

    if (px >= uniforms.width || py >= uniforms.height) {
        return;
    }

    var r_vals = ${pixel_mapping}(px, py);


    var iter = 0u;

    var x: f32 = uniforms.x_0;

    var lyapunov: f32 = 0;

    var flipped: bool = false;

    for (iter = 0u; iter < uniforms.iterations; iter = iter + 1u) {
        let rng_seed = pcg_hash(px + pcg_hash(py << 1)) ^ pcg_hash(iter) ^ pcg_hash(bitcast<u32>(r_vals.x) + pcg_hash(bitcast<u32>(r_vals.y) << 1));
        // todo nan and inf checks
        var cond = ((uniforms.seq_mask >> (iter % uniforms.seq_len)) & 1u) != 0u;
        if (uniforms.do_stochasticity == 1) {
            flipped = select(flipped, !flipped, rng_seed % uniforms.stochastic_modulus == 0);
        }
        if (flipped) {
            cond = !cond;
        }

        var r = select(r_vals.x, r_vals.y, cond);
        var x_next = r * x * (1.0 - x);
        if (uniforms.do_tent == 1) {
            x_next = r * min(x, 1.0 - x);
        }
        if (uniforms.do_neg == 1) {
            x_next = 1.0 - x_next;
        }
        if (uniforms.do_discont == 1 && x <= 0.5) {
            x_next = x_next + (uniforms.discont_alpha - 1.0) * (r - 2.0) / 4.0;
        }
        var term = log(abs(r * (1.0 - 2.0 * x)));
        if (iter > 10) {
            lyapunov = c_avg(lyapunov, term, iter);
        }
        x = x_next;
    }

    var color: vec4<f32>;
    var b = pow(-tanh(lyapunov), uniforms.pow_b);
    color = vec4<f32>(pow(lyapunov, uniforms.pow_r), pow(-lyapunov, uniforms.pow_g), b, 1.0);

    let isnan = hacky_isnan(lyapunov);

    //let nancolor = vec4<f32>(0.0667, 0.1333, 0.2, 1.0);

    color = select(color, vec4<f32>(uniforms.nan_color, 1.0), isnan);

    //color = vec4<f32>(1.0 - cavg / 10.0, 1.0 - (-cavg / 5.0), 1.0 - (-cavg / 5.0), 1.0);

    textureStore(output_texture, vec2<i32>(i32(px), i32(py)), color);
}



