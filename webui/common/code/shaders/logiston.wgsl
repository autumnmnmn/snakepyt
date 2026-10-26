struct Uniforms /* buffer 0 0 */ {
    width: u32,
    height: u32,
    center_low: vec2f,
    center_high: vec2f,
    zoom: f32,
    rotation: f32, // 0 to 1 = 0
    product: u32, // hard 0 to hard 8 = 0 $select(Q-row,D-swap,tangent,post-split,vector-heat,dot-heat,reducer-in,mixed-wiring,endogenous-L)
    protocol: u32, // hard 0 to hard 3 = 0 $select(unforced,additive,left,right)
    heat: f32, // -8 to 8 = 4 $depend(product=Q-row,D-swap,post-split,reducer-in,mixed-wiring,endogenous-L)
    row_balance: f32, // -3 to 3 = 1 $depend(product=Q-row)
    argument_scale: f32, // -3 to 3 = 1 $depend(product=D-swap,mixed-wiring)
    argument_shift: f32, // -3 to 3 = 0 $depend(product=D-swap,mixed-wiring)
    tangent_t: f32, // 0 to 1 = 0.055 $depend(product=tangent)
    vector_gain_x: f32, // -6 to 6 = 2.5 $depend(product=vector-heat)
    vector_gain_y: f32, // -6 to 6 = 2.5 $depend(product=vector-heat)
    dot_gain: f32, // -6 to 6 = 2 $depend(product=dot-heat)
    escape_radius: f32, // hard 2 to 10000 = 10000
    tail_fraction: f32, // 0 to 0.95 = 0.5
    iterations: u32, // hard 1 to hard 2000 = 320
    initial_x: f32, // -4 to 4 = 0.17 $depend(protocol=left,right)
    initial_y: f32, // -4 to 4 = 0.23 $depend(protocol=left,right)
    a: f32, // -5 to 5 = 0
    b: f32, // -5 to 5 = 0
    c: f32, // 0 to 1 = 0
    d: f32, // 0 to 1 = 0
    ac: f32, // 0 to 1 = 0
    bd: f32, // 0 to 1 = 0
    ad: f32, // 0 to 1 = 0
    bc: f32, // 0 to 1 = 0
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba32float, write>;

$paste(core.wgsl);
$paste(complex.wgsl);

fn pixel_to_logiston(pixel: vec2u, center_low: vec2f, center_high: vec2f, extent: vec2u, rotation: f32, zoom: f32) -> vec2f {
    let p = pixel_to_complex(pixel, center_low, center_high, extent, rotation, zoom);
    return vec2f(p.x, -p.y);
}

fn ell(s: f32, heat: f32) -> f32 {
    return heat * s * (1.0 - s);
}

fn logiston_product(z: vec2f, w: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;
    let c = w.x;
    let d = w.y;
    let ac = a * c;
    let bd = b * d;
    let ad = a * d;
    let bc = b * c;
    let r = uniforms.heat;

    if (uniforms.product == 0u) {
        let row = c + uniforms.row_balance * d;
        return vec2f(ell(a * row, r), ell(b * row, r));
    }
    if (uniforms.product == 1u) {
        let k = uniforms.argument_scale;
        let shift = uniforms.argument_shift;
        return vec2f(
            bd * ell(k * ac + shift, r),
            ac * ell(k * bd + shift, r)
        );
    }
    if (uniforms.product == 2u) {
        let t = uniforms.tangent_t;
        let tau_ac = ac - t * ac * ac;
        let tau_bd = bd - t * bd * bd;
        let tau_ad = ad - t * ad * ad;
        let tau_bc = bc - t * bc * bc;
        return vec2f(tau_ac - tau_bd, tau_ad + tau_bc);
    }
    if (uniforms.product == 3u) {
        return vec2f(
            ell(ell(ac, r) + ell(bd, r), r),
            ell(ell(ad, r) + ell(bc, r), r)
        );
    }
    if (uniforms.product == 4u) {
        return vec2f(
            bd * ell(ac, uniforms.vector_gain_x * (a + c)),
            ac * ell(bd, uniforms.vector_gain_y * (b + d))
        );
    }
    if (uniforms.product == 5u) {
        let rho = uniforms.dot_gain * (ac + bd);
        return vec2f(ell(ac, rho), ell(bd, rho));
    }
    if (uniforms.product == 6u) {
        return vec2f(ell(ac - bd, r), ell(ad + bc, r));
    }
    if (uniforms.product == 7u) {
        let k = uniforms.argument_scale;
        let shift = uniforms.argument_shift;
        return vec2f(
            bc * ell(k * ac + shift, r),
            ad * ell(k * bd + shift, r)
        );
    }

    let rho = a * uniforms.a + b * uniforms.b + c * uniforms.c + d * uniforms.d + ac * uniforms.ac + ad * uniforms.ad + bc * uniforms.bc + bd * uniforms.bd;
    return vec2f(b*c*(1.0-c), a*d*(1.0-d));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let px = id.x;
    let py = id.y;
    if (px >= uniforms.width || py >= uniforms.height) {
        return;
    }

    let p = ${pixel_mapping}(
        id.xy,
        uniforms.center_low,
        uniforms.center_high,
        vec2u(uniforms.width, uniforms.height),
        uniforms.rotation,
        uniforms.zoom
    );

    var z = p;
    var parameter = vec2f(uniforms.a, uniforms.b);
    if (uniforms.protocol == 1u) {
        z = vec2f(uniforms.a, uniforms.b);
        parameter = p;
    } else if (uniforms.protocol >= 2u) {
        z = vec2f(uniforms.initial_x, uniforms.initial_y);
        parameter = p;
    }

    let escape_sq = uniforms.escape_radius * uniforms.escape_radius;
    let burn = min(
        uniforms.iterations - 1u,
        max(32u, u32(f32(uniforms.iterations) * clamp(uniforms.tail_fraction, 0.0, 0.95)))
    );
    let samples = f32(uniforms.iterations - burn);

    var escaped = false;
    var escape_n = uniforms.iterations;
    var escape_abs = uniforms.escape_radius;
    var activity = 0.0;
    var mean_magnitude = 0.0;

    for (var iter = 0u; iter < uniforms.iterations; iter += 1u) {
        let previous = z;
        var next: vec2f;
        if (uniforms.protocol <= 1u) {
            next = logiston_product(z, z);
        } else if (uniforms.protocol == 2u) {
            next = logiston_product(parameter, z);
        } else {
            next = logiston_product(z, parameter);
        }
        if (uniforms.protocol == 1u) {
            next += parameter;
        }
        z = next;

        let magnitude_sq = dot(z, z);
        if (magnitude_sq > escape_sq || hacky_isfucked(magnitude_sq)) {
            escaped = true;
            escape_n = iter + 1u;
            escape_abs = select(sqrt(magnitude_sq), 1.0e12, hacky_isfucked(magnitude_sq));
            break;
        }

        if (iter >= burn) {
            activity += length(z - previous) / samples;
            mean_magnitude += sqrt(clamp(magnitude_sq, 0.0, escape_sq)) / samples;
        }
    }

    var display_escape = f32(escape_n);
    if (escaped) {
        let log_ratio = log(max(escape_abs, uniforms.escape_radius)) / log(uniforms.escape_radius);
        let fraction = 1.0 - clamp(log2(max(log_ratio, 1.0e-6)), 0.0, 1.0);
        display_escape += fraction;
    }

    textureStore(
        output_texture,
        vec2i(i32(px), i32(py)),
        vec4f(display_escape, activity, mean_magnitude, select(1.0, 1.0, escaped))
    );
}
