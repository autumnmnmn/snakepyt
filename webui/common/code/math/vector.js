
export class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    static of(x, y) { return new Vec2(x, y) }

    get u() { return this.x; } set u(v) { this.x = v; }
    get v() { return this.y; } set v(v) { this.y = v; }

    get width() { return this.x; } set width(v) { this.x = v; }
    get height() { return this.y; } set height(v) { this.y = v; }

    static fromMouse(event, element) {
        const rect = element.getBoundingClientRect();
        return new Vec2(
            event.clientX - rect.left,
            event.clientY - rect.top
        );
    }

    sub(other) {
        return new Vec2(this.x - other.x, this.y - other.y);
    }

    scale(s) {
        return new Vec2(this.x * s, this.y * s);
    }
}

export class Vec3 {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    static of(x, y, z) { return new Vec3(x, y, z) }

    get r() { return this.x; } set r(v) { this.x = v; }
    get g() { return this.y; } set g(v) { this.y = v; }
    get b() { return this.z; } set b(v) { this.z = v; }

    get i() { return this.x; } set i(v) { this.x = v; }
    get j() { return this.y; } set j(v) { this.y = v; }
    get k() { return this.z; } set k(v) { this.z = v; }

    get u() { return this.x; } set u(v) { this.x = v; }
    get v() { return this.y; } set v(v) { this.y = v; }
    get w() { return this.z; } set w(v) { this.z = v; }

    leftMatmul(m) {
        const mat = m.data || m;

        return new Vec3(
            mat[0] * this.x + mat[1] * this.y + mat[2] * this.z,
            mat[3] * this.x + mat[4] * this.y + mat[5] * this.z,
            mat[6] * this.x + mat[7] * this.y + mat[8] * this.z
        );
    }
}

export class Mat3x3 {
    constructor(data) {
        this.data = data instanceof Float32Array ? data : new Float32Array(data);
    }

    static rotX(t) {
        const c = Math.cos(t);
        const s = Math.sin(t);
        return new Mat3x3([
            1, 0, 0,
            0, c,-s,
            0, s, c
        ]);
    }

    static rotY(t) {
        const c = Math.cos(t);
        const s = Math.sin(t);
        return new Mat3x3([
             c, 0, s,
             0, 1, 0,
            -s, 0, c
        ]);
    }

    static rotZ(t) {
        const c = Math.cos(t);
        const s = Math.sin(t);
        return new Mat3x3([
            c, -s, 0,
            s,  c, 0,
            0,  0, 1
        ]);
    }

    static get ident() {
        return new Mat3x3([
            1, 0, 0,
            0, 1, 0,
            0, 0, 1
        ]);
    }

    apply(v3) {
        return v3.leftMatmul(this);
    }

    matmul(other) {
        const a = this.data;
        const b = other.data || other;

        const out = new Float32Array(9);

        out[0] = a[0]*b[0] + a[1]*b[3] + a[2]*b[6];
        out[1] = a[0]*b[1] + a[1]*b[4] + a[2]*b[7];
        out[2] = a[0]*b[2] + a[1]*b[5] + a[2]*b[8];

        out[3] = a[3]*b[0] + a[4]*b[3] + a[5]*b[6];
        out[4] = a[3]*b[1] + a[4]*b[4] + a[5]*b[7];
        out[5] = a[3]*b[2] + a[4]*b[5] + a[5]*b[8];

        out[6] = a[6]*b[0] + a[7]*b[3] + a[8]*b[6];
        out[7] = a[6]*b[1] + a[7]*b[4] + a[8]*b[7];
        out[8] = a[6]*b[2] + a[7]*b[5] + a[8]*b[8];

        return new Mat3x3(out);
    }
}

/*
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
*/

