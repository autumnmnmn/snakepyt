
struct Uniforms /* buffer 0 0 */ {
    width: u32,
    height: u32,
    center: vec2f,
    p: vec2f, // -3 to 3 = 0,0
    q: f32, // 0 to 1 = 0
    zoom: f32,
    iterations: u32, // hard 0 to 500 = 100
    escape_distance: f32 // 0 to 10 = 2
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
    return vec2<f32>(x, y);
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

fn pcg_hash(x: u32) -> u32 {
    let state = x * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
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

    var nq = 1.0 - uniforms.q;
    var c = ${pixel_mapping}(px, py) * nq + uniforms.p * uniforms.q;
    var z = uniforms.p * nq + ${pixel_mapping}(px, py) * uniforms.q;
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


