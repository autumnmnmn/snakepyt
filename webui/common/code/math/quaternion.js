/* quaternion — the quaternions, Hamilton's skew field: values
w + xi + yj + zk with double components, multiplied by the Hamilton
product (i^2 = j^2 = k^2 = ijk = -1). multiplication does not commute.
the reals embed as (w, 0, 0, 0) and the complexes as (w, x, 0, 0).
every nonzero quaternion has an inverse — conj(q) / |q|^2 — so the
quaternions are a division ring. the expression library
($math/expression) carries quaternions as a value type; in wgsl a
quaternion is a vec4f. */

export class Quaternion {
    constructor(w, x, y, z) {
        this.w = w;
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /* Quaternion.from(value): number → (value, 0, 0, 0); anything with
    re/im (a Complex) → (re, im, 0, 0); a quaternion passes through. */

    static from(value) {
        if (value instanceof Quaternion) {
            return value;
        }

        if (typeof value === "object" && value !== null && "re" in value) {
            return new Quaternion(Number(value.re), Number(value.im), 0, 0);
        }

        return new Quaternion(Number(value), 0, 0, 0);
    }

    static zero = new Quaternion(0, 0, 0, 0);
    static one = new Quaternion(1, 0, 0, 0);

    add(other) {
        const q = Quaternion.from(other);

        return new Quaternion(
            this.w + q.w,
            this.x + q.x,
            this.y + q.y,
            this.z + q.z
        );
    }

    sub(other) {
        return this.add(Quaternion.from(other).neg());
    }

    neg() {
        return new Quaternion(-this.w, -this.x, -this.y, -this.z);
    }

    scale(scalar) {
        const s = Number(scalar);

        return new Quaternion(this.w * s, this.x * s, this.y * s, this.z * s);
    }

    /* the Hamilton product */

    mul(other) {
        const a = this;
        const b = Quaternion.from(other);

        return new Quaternion(
            a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
            a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
        );
    }

    conj() {
        return new Quaternion(this.w, -this.x, -this.y, -this.z);
    }

    norm2() {
        return this.w ** 2 + this.x ** 2 + this.y ** 2 + this.z ** 2;
    }

    abs() {
        return Math.sqrt(this.norm2());
    }

    inv() {
        const norm = this.norm2();

        if (norm === 0) {
            throw new Error("Cannot invert the zero quaternion");
        }

        return this.conj().scale(1 / norm);
    }

    div(other) {
        return this.mul(Quaternion.from(other).inv());
    }

    pow(exponent) {
        let n = typeof exponent === "bigint" ? Number(exponent) : exponent;

        if (!Number.isInteger(n)) {
            throw new Error(
                `A quaternion power needs an integer exponent, got ${exponent}`
            );
        }

        if (n < 0) {
            return this.inv().pow(-n);
        }

        let result = Quaternion.one;
        let base = this;

        while (n > 0) {
            if (n & 1) {
                result = result.mul(base);
            }

            base = base.mul(base);
            n >>= 1;
        }

        return result;
    }

    equals(other) {
        const q = Quaternion.from(other);

        return (
            this.w === q.w && this.x === q.x && this.y === q.y && this.z === q.z
        );
    }

    /* the real value, if the quaternion is one */

    asScalar() {
        return this.x === 0 && this.y === 0 && this.z === 0
            ? this.w
            : undefined;
    }

    toString() {
        const parts = [];
        const terms = [
            [this.w, ""],
            [this.x, "i"],
            [this.y, "j"],
            [this.z, "k"],
        ];

        for (const [value, unit] of terms) {
            if (value === 0) continue;

            const sign = value < 0 ? "-" : parts.length ? "+" : "";
            const magnitude =
                unit && Math.abs(value) === 1 ? "" : String(Math.abs(value));

            parts.push(`${sign}${magnitude}${unit}`);
        }

        return parts.length ? parts.join("") : "0";
    }
}
