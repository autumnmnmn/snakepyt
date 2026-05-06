
function vec2_of(x, y) {
    return { x, y };
}

function vec2_from_mouse(event, element) {
    const rect = element.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function vec2_sub(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y
    };
}

function vec2_scalar_mult(v, s) {
    return {
        x: v.x * s,
        y: v.y * s
    };
}

function vec3_of(x, y, z) {
    return { x, y, z };
}

function vec3_left_matmul_3x3(m, v) {
    const a = [v.x, v.y, v.z];
    return vec3_of(
        m[0][0]*a[0] + m[0][1]*a[1] + m[0][2]*a[2],
        m[1][0]*a[0] + m[1][1]*a[1] + m[1][2]*a[2],
        m[2][0]*a[0] + m[2][1]*a[1] + m[2][2]*a[2]
    );
}

function mat3x3_rot_x(t) {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [
        [1, 0, 0],
        [0, c,-s],
        [0, s, c]
    ];
}

function mat3x3_rot_y(t) {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [
        [ c, 0, s],
        [ 0, 1, 0],
        [-s, 0, c]
    ];
}

function mat3x3_rot_z(t) {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [
        [c, -s, 0],
        [s,  c, 0],
        [0,  0, 1]
    ];
}

const mat3x3_ident = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
];

function mat3x3_mat3x3_matmul(a, b) {
    return [0, 1, 2].map(i =>
        [0, 1, 2].map(j =>
            a[i][0]*b[0][j] + a[i][1]*b[1][j] + a[i][2]*b[2][j]
        )
    );
}

export const v2 = {
    of: vec2_of,
    fromMouse: vec2_from_mouse,
    sub: vec2_sub,
    scale: vec2_scalar_mult
};

    // TODO m22, rot, ident
export const v3 = {
    of: vec3_of,
    matmul: vec3_left_matmul_3x3
};

export const m33 = {
    rot_x: mat3x3_rot_x,
    rot_y: mat3x3_rot_y,
    rot_z: mat3x3_rot_z,
    matmul: mat3x3_mat3x3_matmul,
    ident: mat3x3_ident
}

