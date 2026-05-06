
fn c_avg(prev: f32, val: f32, n: u32) -> f32 {
    var next = prev + (val - prev) / f32(n);
    return next;
}

fn hacky_isnan(x: f32) -> bool {
    let bits = bitcast<u32>(x);
    return (bits & 0x7f800000u) == 0x7f800000u
        && (bits & 0x007fffffu) != 0u;
}

