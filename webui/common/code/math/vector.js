
import { smoothstep } from "/code/math/core.js";

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

    add(other) {
        return new Vec2(this.x + other.x, this.y + other.y);
    }

    sub(other) {
        return new Vec2(this.x - other.x, this.y - other.y);
    }

    scale(s) {
        return new Vec2(this.x * s, this.y * s);
    }

    static lerp(a, b, t) {
        return new Vec2(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t
        );
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

    add(other) {
        return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
    }

    sub(other) {
        return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
    }

    scale(s) {
        return new Vec3(this.x * s, this.y * s, this.z * s);
    }

    static lerp(a, b, t) {
        return new Vec3(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t
        );
    }

    static smoothstep(a, b, t) { return Vec3.lerp(a, b, smoothstep(t)); }

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

