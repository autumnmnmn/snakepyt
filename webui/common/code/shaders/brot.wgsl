
struct Uniforms /* buffer 0 0 */ {
    width: u32,
    height: u32,
    center_low: vec2f,
    center_high: vec2f,
    rotation: f32, // 0 to 1 = 0
    p: vec2f, // -3 to 3 = 0,0
    q: f32, // 0 to 1 = 0
    zoom: f32,
    iterations: u32, // hard 0 to 500 = 100
    escape_distance: f32 // 0 to 10 = 2
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;

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

    var nq = 1.0 - uniforms.q;
    var c = ${pixel_mapping}(id.xy, uniforms.center_low, uniforms.center_high, vec2u(uniforms.width, uniforms.height), uniforms.rotation, uniforms.zoom) * nq + uniforms.p * uniforms.q;

    var z = uniforms.p * nq + ${pixel_mapping}(id.xy, uniforms.center_low, uniforms.center_high, vec2u(uniforms.width, uniforms.height), uniforms.rotation, uniforms.zoom) * uniforms.q;
    let orig_z = z;
    let n_perturbations = 1u;
    let escape_threshold = uniforms.escape_distance * uniforms.escape_distance;

    var escaped = false;
    var iter = 0u;
    var cavg = f32(0.0);
    let epsilon = 1.19e-6;

    let transient_skip = u32(f32(uniforms.iterations) * f32(0.95));

    for (iter = 0u; iter < uniforms.iterations; iter = iter + 1u) {
        let mag_sq = complex_mag_sq(z);
        if (mag_sq > escape_threshold) {
            escaped = true;
            break;
        }

        z = complex_mul(z, z) + c;
        //z = avg_abs_df_z_p;
    }

    var color: vec4<f32>;
    if (escaped) {
        let escape_speed = log(f32(iter));//1.0 - pow(f32(iter) / f32(uniforms.iterations), 2.0);
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


