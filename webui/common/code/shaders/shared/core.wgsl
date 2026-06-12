
fn hacky_isnan(x: f32) -> bool {
    let bits = bitcast<u32>(x);
    return (bits & 0x7f800000u) == 0x7f800000u
        && (bits & 0x007fffffu) != 0u;
}

fn hacky_isfucked(x: f32) -> bool {
    let bits = bitcast<u32>(x);
    let abs_bits = bits & 0x7fffffffu;
    return abs_bits >= 0x7f800000u;
}

fn hacky_isinf(x: f32) -> bool {
    let bits = bitcast<u32>(x);
    return bits == 0x7f800000u;
}

fn hacky_isneginf(x: f32) -> bool {
    let bits = bitcast<u32>(x);
    return bits == 0xff800000u;
}

fn c_avg(prev: f32, val: f32, n: u32) -> f32 {
    if (hacky_isfucked(prev)) {
        return prev;
    }
    var next = prev + (val - prev) / f32(n);
    return next;
}


