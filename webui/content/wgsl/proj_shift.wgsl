
struct Uniforms {
    center_x: f32,
    center_y: f32,
    zoom: f32,
    phi: f32,
    c: f32,
    width: u32,
    height: u32,
    max_iter: u32,
    escape_distance: f32,
    psi: f32,
    d: f32,
    twist: f32,
    squoosh_x: f32,
    squoosh_y: f32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;

fn complex_mag_sq(z: vec2<f32>) -> f32 {
    return z.x * z.x + z.y * z.y;
}

fn complex_mag(z: vec2<f32>) -> f32 {
    return sqrt(complex_mag_sq(z));
}


fn complex_angle(z: vec2<f32>) -> f32 {
    return atan2(z.y, z.x);
}

fn projective_shift(x: vec2<f32>, phi: f32, psi: f32) -> vec2<f32> {
    let x_mag = complex_mag(x);
    let x_angle = complex_angle(x);
    let angle_diff = x_angle - phi;
    let new_mag = x_mag + cos(angle_diff);
    return vec2<f32>(new_mag * cos(x_angle * psi), new_mag * sin(x_angle * psi));
}

fn iterate_polar(x: vec2<f32>, phi: f32, psi: f32, c: f32, d: f32, cosTwist: f32, sinTwist: f32, squoosh_x: f32, squoosh_y: f32) -> vec2<f32> {
    let shifted = projective_shift(x, phi, psi);
    let halfEbb = vec2<f32>(-c * 0.5, -d * 0.5);
    let mid = shifted + halfEbb;
    let mids = vec2<f32>(mid.x / squoosh_x, mid.y / squoosh_y);
    let rotated = vec2<f32>(mids.x * cosTwist - mids.y * sinTwist, mids.x * sinTwist + mids.y * cosTwist);
    return rotated + halfEbb;
}

fn iterate_cartesian(z: vec2<f32>, phi: f32, c: f32) -> vec2<f32> {
    let phi_hat = vec2<f32>(cos(phi), sin(phi));
    let z_mag_sq = complex_mag_sq(z);

    // Avoid division by zero
    if (z_mag_sq < 1e-10) {
        return vec2<f32>(-c, 0.0);
    }

    let z_dot_phi = z.x * phi_hat.x + z.y * phi_hat.y;
    let projection_scale = z_dot_phi / z_mag_sq;

    // z' = z + (z · φ̂) / |z|² * z - c
    let result = z + projection_scale * z;
    return vec2<f32>(result.x - c, result.y);
}

fn pixel_to_complex(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;
    let x = (f32(px) - half_width) * scale * aspect / f32(uniforms.width) + uniforms.center_x;
    let y = (f32(py) - half_height) * scale / f32(uniforms.height) + uniforms.center_y;
    return vec2<f32>(x, y);
}

fn pixel_to_complex_alt(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;

    // map y-axis to magnitude, x-axis to angle
    let angle = (f32(px) - half_width) * scale * aspect / f32(uniforms.width) + uniforms.center_x;
    let mag = (f32(py) - half_height) * scale / (2.0 * f32(uniforms.height)) + uniforms.center_y;

    return vec2<f32>(mag * cos(angle), mag * sin(angle));
}

fn pixel_to_complex_inverted(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;

    let x = (f32(px) - half_width) * scale * aspect / f32(uniforms.width) + uniforms.center_x;
    let y = (f32(py) - half_height) * scale / f32(uniforms.height) + uniforms.center_y;

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
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;
    
    // get position relative to center
    let x = (f32(px) - half_width) * scale * aspect / f32(uniforms.width);
    let y = (f32(py) - half_height) * scale / f32(uniforms.height);
    
    let mag_sq = x * x + y * y;
    if (mag_sq < 1e-10) {
        return vec2<f32>(uniforms.center_x + 1e10, uniforms.center_y);
    }
    
    // invert then add center back
    return vec2<f32>(
        uniforms.center_x + x / mag_sq,
        uniforms.center_y - y / mag_sq
    );
}

fn pixel_to_complex_inverted_b(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;
    
    let x = (f32(px) - half_width) * scale * aspect / f32(uniforms.width) + uniforms.center_x;
    let y = (f32(py) - half_height) * scale / f32(uniforms.height) + uniforms.center_y;
    
    // translate by (c/2, d/2)
    let tx = x + uniforms.c * 0.5;
    let ty = y + uniforms.d * 0.5;
    
    let mag_sq = tx * tx + ty * ty;
    
    if (mag_sq < 1e-10) {
        return vec2<f32>(1e10, 0.0);
    }
    
    // invert, then translate back
    return vec2<f32>(tx / mag_sq - uniforms.c * 0.5, -ty / mag_sq - uniforms.d * 0.5);
}

fn pixel_to_complex_inverted_c(px: u32, py: u32) -> vec2<f32> {
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;
    
    let x = (f32(px) - half_width) * scale * aspect / f32(uniforms.width) + uniforms.center_x;
    let y = (f32(py) - half_height) * scale / f32(uniforms.height) + uniforms.center_y;
    
    // translate by (c/2, d/2), then scale down by 0.5
    let tx = (x + uniforms.c * 0.5) * 2.0;
    let ty = (y + uniforms.d * 0.5) * 2.0;
    
    let mag_sq = tx * tx + ty * ty;
    
    if (mag_sq < 1e-10) {
        return vec2<f32>(1e10, 0.0);
    }
    
    // invert, scale up by 2x, then translate back
    return vec2<f32>((tx / mag_sq) * 0.5 - uniforms.c * 0.5, (-ty / mag_sq) * 0.5 - uniforms.d * 0.5);
}

fn c_avg(prev: f32, val: f32, n: f32) -> f32 {
    return prev + (val - prev) / n;
}

fn hash(seed: u32) -> u32 {
    var x = seed;
    x = ((x >> 16u) ^ x) * 0x45d9f3bu;
    x = ((x >> 16u) ^ x) * 0x45d9f3bu;
    x = (x >> 16u) ^ x;
    return x;
}

fn random_float(seed: u32) -> f32 {
    return f32(hash(seed)) / 4294967296.0; // 2^32
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let px = id.x;
    let py = id.y;

    if (px >= uniforms.width || py >= uniforms.height) {
        return;
    }

    var z = pixel_to_complex_inverted_d(px, py);
    let n_perturbations = 10u;
    let escape_threshold = uniforms.escape_distance * uniforms.escape_distance;

    var escaped = false;
    var iter = 0u;
    var cavg = f32(0.0);
    let epsilon = 1.19e-4;

    let transient_skip = u32(f32(uniforms.max_iter) * f32(0.9));

    let cosTwist = cos(uniforms.twist);
    let sinTwist = sin(uniforms.twist);

    for (iter = 0u; iter < uniforms.max_iter; iter = iter + 1u) {
        let mag_sq = complex_mag_sq(z);
        if (mag_sq > escape_threshold) {
            escaped = true;
            //break;
        }
        var z_p: array<vec2<f32>, 4>;
        var df_z_p: array<vec2<f32>, 4>;
        var abs_df_z_p: array<f32, 4>;
        var avg_abs_df_z_p = f32(0.0);


        var f_z = iterate_polar(z, uniforms.phi, uniforms.psi, uniforms.c, uniforms.d, cosTwist, sinTwist, uniforms.squoosh_x, uniforms.squoosh_y);

        /*
        if (iter >= transient_skip) {
            if (cavg < -10.0) { continue; }
            if (cavg > 10.0) { continue; }
            for (var p = 0u; p < n_perturbations; p = p + 1u) {
                let rng_seed = hash(px * 1000u + py * 2000u + p * 5000u);
                let random_angle = random_float(rng_seed) * 6.283185307;
                let perturb_direction = vec2<f32>(cos(random_angle), sin(random_angle));
                z_p[p] = z + perturb_direction * epsilon;
                df_z_p[p] = iterate_polar(z, uniforms.phi, uniforms.psi, uniforms.c) - f_z;
                abs_df_z_p[p] = abs(complex_mag(df_z_p[p]) / epsilon);
                avg_abs_df_z_p += abs_df_z_p[p];
            }

            avg_abs_df_z_p /= f32(n_perturbations);

            cavg = c_avg(cavg, log(avg_abs_df_z_p), f32(iter + 1 - transient_skip));
        }
        */

        z = f_z;
    }

    var color: vec4<f32>;
    if (escaped) {
        let escape_speed = 1.0 - pow(f32(iter) / f32(uniforms.max_iter), 2.0);
        color = vec4<f32>(escape_speed, escape_speed, escape_speed, 1.0);
    } else {
        let final_mag = complex_mag(z);
        let final_angle = complex_angle(z);
        //let scaled_mag = log(final_mag);
        //let final_x = scaled_mag * (z.x / final_mag);
        //let final_y = scaled_mag * (z.y / final_mag);
        //color = vec4<f32>(0.5 + 0.5 * final_x, 0.0, 0.5 + 0.5 * final_y, 1.0);
        let scaled_mag = pow(final_mag / escape_threshold, 0.5);
        let scaled_angle = (final_angle + 3.1415926535) / 6.283185307179586;
        let r = max(0, 2.0 * scaled_angle - 1.0);
        let b = max(0, 2.0 * (1.0 - scaled_angle) - 1.0);
        color = vec4<f32>(r, scaled_mag, b, 1.0);
    }

    //color = vec4<f32>(cavg / 1.0, -cavg / 20.0, -cavg / 20.0, 1.0);

    textureStore(output_texture, vec2<i32>(i32(px), i32(py)), color);
}

