
struct Uniforms /* buffer 0 0 */ {
    extent: vec2u,
    center_low: vec2f,
    center_high: vec2f,
    zoom: f32,
    rotation: f32, // 0 to 1 = 0
    c: vec2f, // 0 to 1 = 0.85,0
    iterations: u32, // hard 0 to 500 = 100
    twist: f32, // -pi to pi = 0
    phi: f32, // 0 to tau = 0
    psi: f32, // 0 to 12 = 1
    squoosh: vec2f, // 0 to 10 = 1,1
    escape_distance: f32 // 0 to 10 = 2
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;

$paste(core.wgsl);
$paste(complex.wgsl);
$paste(rng.wgsl);

fn projective_shift(x: vec2<f32>, phi: f32, psi: f32) -> vec2<f32> {
    let x_mag = complex_mag(x);
    let x_angle = complex_angle(x);
    let angle_diff = x_angle - phi;
    let new_mag = x_mag + cos(angle_diff);
    return vec2<f32>(new_mag * cos(x_angle * psi), new_mag * sin(x_angle * psi));
}

fn iterate_polar(
    x: vec2<f32>,
    phi: f32, psi: f32,
    c: vec2f,
    cosTwist: f32, sinTwist: f32,
    squoosh: vec2f
    ) -> vec2<f32> {
    let shifted = projective_shift(x, phi, psi);
    let halfEbb = -c * 0.5;
    let mid = shifted + halfEbb;
    let mids = vec2<f32>(mid.x / squoosh.x, mid.y / squoosh.y);
    let rotated = vec2<f32>(
        mids.x * cosTwist - mids.y * sinTwist,
        mids.x * sinTwist + mids.y * cosTwist
    );
    return rotated + halfEbb;
}

fn iterate_cartesian(z: vec2<f32>, phi: f32, c: vec2f) -> vec2<f32> {
    let phi_hat = vec2<f32>(cos(phi), sin(phi));
    let z_mag_sq = complex_mag_sq(z);

    // Avoid division by zero
    if (z_mag_sq < 1e-10) {
        return -c;
    }

    let z_dot_phi = z.x * phi_hat.x + z.y * phi_hat.y;
    let projection_scale = z_dot_phi / z_mag_sq;

    // z' = z + (z · φ̂) / |z|² * z - c
    let result = z + projection_scale * z;
    return result - c;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let px = id.x;
    let py = id.y;

    if (px >= uniforms.extent.x || py >= uniforms.extent.y) {
        return;
    }

    var z = ${pixel_mapping}(id.xy, uniforms.center_low, uniforms.center_high, uniforms.extent, uniforms.rotation, uniforms.zoom);
    let orig_z = z;
    let n_perturbations = 1u;
    let escape_threshold = uniforms.escape_distance * uniforms.escape_distance;

    var escaped = false;
    var iter = 0u;
    var cavg = f32(0.0);
    let epsilon = 1.19e-6;

    let transient_skip = u32(f32(uniforms.iterations) * f32(0.95));

    let cosTwist = cos(uniforms.twist);
    let sinTwist = sin(uniforms.twist);

    for (iter = 0u; iter < uniforms.iterations; iter = iter + 1u) {
        let mag_sq = complex_mag_sq(z);
        if (mag_sq > escape_threshold) {
            escaped = true;
            //break;
        }
        var z_p: array<vec2<f32>, 10>;
        var df_z_p: array<vec2<f32>, 10>;
        var abs_df_z_p: array<f32, 10>;
        var avg_abs_df_z_p = f32(0.0);

        var f_z = iterate_polar(z, uniforms.phi, uniforms.psi, uniforms.c, cosTwist, sinTwist, uniforms.squoosh);

        if (iter >= transient_skip) {
            if (cavg < -10.0) { continue; }
            if (cavg > 10.0) { continue; }
            for (var p = 0u; p < n_perturbations; p = p + 1u) {
                let rng_seed = pcg_hash(px + pcg_hash(py << 1)) ^ pcg_hash(p);
                let random_angle = random_float(rng_seed) * 6.283185307;
                let perturb_direction = vec2<f32>(cos(random_angle), sin(random_angle));
                z_p[p] = z + perturb_direction * epsilon;
                df_z_p[p] = iterate_polar(z_p[p], uniforms.phi, uniforms.psi, uniforms.c, cosTwist, sinTwist, uniforms.squoosh) - orig_z;
                abs_df_z_p[p] = abs(complex_mag(df_z_p[p]));
                avg_abs_df_z_p += abs_df_z_p[p];
            }

            avg_abs_df_z_p /= f32(n_perturbations);

            cavg = c_avg(cavg, log(avg_abs_df_z_p), u32(iter + 1 - transient_skip));
        }

        z = f_z;
        //z = avg_abs_df_z_p;
    }

    var color: vec4<f32>;
    if (escaped) {
        let escape_speed = 1.0 - pow(f32(iter) / f32(uniforms.iterations), 2.0);
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

    //color = vec4<f32>(1.0 - cavg / 10.0, 1.0 - (-cavg / 5.0), 1.0 - (-cavg / 5.0), 1.0);

    textureStore(output_texture, vec2<i32>(i32(px), i32(py)), color);
}

