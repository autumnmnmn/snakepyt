
// WIP

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

