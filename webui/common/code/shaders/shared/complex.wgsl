
fn complex_mag_sq(z: vec2f) -> f32 {
    return z.x * z.x + z.y * z.y;
}

fn complex_mag(z: vec2f) -> f32 {
    return sqrt(complex_mag_sq(z));
}

fn complex_angle(z: vec2f)-> f32 {
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

