
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

fn iterate_polar(x: vec2<f32>, phi: f32, psi: f32, c: f32) -> vec2<f32> {
    let shifted = projective_shift(x, phi, psi);
    return vec2<f32>(shifted.x - c, shifted.y);
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
    let scale = 4.0 / uniforms.zoom;
    let half_width = f32(uniforms.width) * 0.5;
    let half_height = f32(uniforms.height) * 0.5;
    let x = (f32(px) - half_width) * scale / f32(uniforms.width) + uniforms.center_x;
    let y = (f32(py) - half_height) * scale / f32(uniforms.height) + uniforms.center_y;
    return vec2<f32>(x, y);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let px = id.x;
    let py = id.y;

    if (px >= uniforms.width || py >= uniforms.height) {
        return;
    }

    var z = pixel_to_complex(px, py);
    let escape_threshold = uniforms.escape_distance * uniforms.escape_distance;

    var escaped = false;
    var iter = 0u;

    for (iter = 0u; iter < uniforms.max_iter; iter = iter + 1u) {
        let mag_sq = complex_mag_sq(z);
        if (mag_sq > escape_threshold) {
            escaped = true;
            break;
        }
        //z = iterate_cartesian(z, uniforms.phi, uniforms.c);
        z = iterate_polar(z, uniforms.phi, uniforms.psi, uniforms.c);
    }

    var color: vec4<f32>;
    if (escaped) {
        let escape_speed = pow(f32(iter) / f32(uniforms.max_iter), 0.5);
        color = vec4<f32>(0.0, escape_speed, 0.0, 1.0);
    } else {
        let final_mag = complex_mag(z);
        let scaled_mag = log(final_mag);
        let final_x = scaled_mag * (z.x / final_mag);
        let final_y = scaled_mag * (z.y / final_mag);
        color = vec4<f32>(0.5 + 0.5 * final_x, 0.0, 0.5 + 0.5 * final_y, 1.0);
    }

    textureStore(output_texture, vec2<i32>(i32(px), i32(py)), color);
}

