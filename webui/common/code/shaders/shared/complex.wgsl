
fn complex_mag_sq(z: vec2f) -> f32 {
    return z.x * z.x + z.y * z.y;
}

fn complex_mag(z: vec2f) -> f32 {
    return sqrt(complex_mag_sq(z));
}

fn complex_angle(z: vec2f) -> f32 {
    return atan2(z.y, z.x);
}

fn complex_mul(za: vec2f, zb: vec2f) -> vec2f {
    return vec2f(
        za.x * zb.x - za.y * zb.y,
        za.x * zb.y + za.y * zb.x
    );
}

fn pixel_to_complex(pixel: vec2u, center_low: vec2f, center_high: vec2f, extent: vec2u, rotation: f32, zoom: f32) -> vec2f {
    var theta = rotation * 3.14159265 * 2.0;
    var c = cos(theta);
    var s = sin(theta);
    let half_extent = vec2f(extent) * 0.5;
    var coords = mat2x2f(c,s,-s,c) * (vec2f(pixel) - half_extent);
    let aspect = f32(extent.x) / f32(extent.y);
    let scale = 1.0 / zoom;

    let px = ((coords.x / f32(extent.x)) * scale * aspect);
    let py = ((coords.y / f32(extent.y)) * scale);

    let sx = px + center_high.x;
    let err_x = (px - (sx - center_high.x)) + (center_high.x - (sx - px));
    let x = sx + (err_x + center_low.x);

    let sy = py + center_high.y;
    let err_y = (py - (sy - center_high.y)) + (center_high.y - (sy - py));
    let y = sy + (err_y + center_low.y);


    return vec2<f32>(x, -y);
}

const ln2 = 0.6931471805599453;
const log2e = 1.4426950408889634;

fn complex_div(za: vec2f, zb: vec2f) -> vec2f {
    let d = zb.x * zb.x + zb.y * zb.y;
    return vec2f(
        (za.x * zb.x + za.y * zb.y) / d,
        (za.y * zb.x - za.x * zb.y) / d
    );
}

fn complex_exp(z: vec2f) -> vec2f {
    let r = exp(z.x);
    return vec2f(r * cos(z.y), r * sin(z.y));
}

fn complex_exp2(z: vec2f) -> vec2f {
    return complex_exp(z * ln2);
}

fn complex_log(z: vec2f) -> vec2f {
    return vec2f(log(complex_mag(z)), atan2(z.y, z.x));
}

fn complex_log2(z: vec2f) -> vec2f {
    return complex_log(z) * log2e;
}

fn complex_pow(za: vec2f, zb: vec2f) -> vec2f {
    return complex_exp(complex_mul(complex_log(za), zb));
}

fn complex_sqrt(z: vec2f) -> vec2f {
    let r = complex_mag(z);
    let t = atan2(z.y, z.x) * 0.5;
    return vec2f(sqrt(r) * cos(t), sqrt(r) * sin(t));
}

fn complex_inverseSqrt(z: vec2f) -> vec2f {
    return complex_div(vec2f(1.0, 0.0), complex_sqrt(z));
}

fn complex_sin(z: vec2f) -> vec2f {
    return vec2f(sin(z.x) * cosh(z.y), cos(z.x) * sinh(z.y));
}

fn complex_cos(z: vec2f) -> vec2f {
    return vec2f(cos(z.x) * cosh(z.y), -sin(z.x) * sinh(z.y));
}

fn complex_tan(z: vec2f) -> vec2f {
    return complex_div(complex_sin(z), complex_cos(z));
}

fn complex_sinh(z: vec2f) -> vec2f {
    return vec2f(sinh(z.x) * cos(z.y), cosh(z.x) * sin(z.y));
}

fn complex_cosh(z: vec2f) -> vec2f {
    return vec2f(cosh(z.x) * cos(z.y), sinh(z.x) * sin(z.y));
}

fn complex_tanh(z: vec2f) -> vec2f {
    return complex_div(complex_sinh(z), complex_cosh(z));
}

fn complex_mix(x: vec2f, y: vec2f, a: vec2f) -> vec2f {
    return complex_mul(x, vec2f(1.0, 0.0) - a) + complex_mul(y, a);
}

