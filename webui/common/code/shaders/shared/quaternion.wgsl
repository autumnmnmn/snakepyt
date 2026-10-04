/* quaternions as vec4f: the scalar part in .x, the vector part
(i, j, k) in .yzw — so vec4f(w, x, y, z) as the expression library's
quaternion type renders it. quaternion_mul is the Hamilton product
(a * b), quaternion_div a * b^-1, quaternion_pow repeated squaring
with an integer exponent (negative inverts first). paste alongside
complex.wgsl the same way ($paste(shared/quaternion.wgsl)). */

fn quaternion_mul(a: vec4f, b: vec4f) -> vec4f {
    let av = a.yzw;
    let bv = b.yzw;
    let v = a.x * bv + b.x * av + cross(av, bv);
    return vec4f(a.x * b.x - dot(av, bv), v);
}

fn quaternion_div(a: vec4f, b: vec4f) -> vec4f {
    let inverse = vec4f(b.x, -b.yzw) / dot(b, b);
    return quaternion_mul(a, inverse);
}

fn quaternion_pow(q: vec4f, n: i32) -> vec4f {
    var base = q;
    var exponent = n;
    if (exponent < 0) {
        base = vec4f(base.x, -base.yzw) / dot(base, base);
        exponent = -exponent;
    }
    var result = vec4f(1.0, 0.0, 0.0, 0.0);
    while (exponent > 0) {
        if ((exponent & 1) != 0) {
            result = quaternion_mul(result, base);
        }
        base = quaternion_mul(base, base);
        exponent = exponent >> 1;
    }
    return result;
}
