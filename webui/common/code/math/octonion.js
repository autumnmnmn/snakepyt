/* octonion — the octonions, the last normed division algebra: eight
double components, built Cayley-Dickson from quaternion pairs. an
octonion is (a, b) with a, b quaternions, and

    (a, b) * (c, d) = (a*c - conj(d)*b, d*a + b*conj(c))

multiplication neither commutes nor ASSOCIATES — but the octonions
are alternative, and every nonzero octonion has an inverse
(conj(o) / |o|^2, with conj((a, b)) = (conj(a), -b)), so division
a/b = a*b^-1 is well-defined and powers of a single element associate.
the expression library ($math/expression) carries octonions as a value
type; there is no wgsl representation. */

import { Quaternion } from "./quaternion.js";

export class Octonion {
    constructor(a, b) {
        this.a = Quaternion.from(a);
        this.b = Quaternion.from(b);
    }

    /* Octonion.from(value): number → (value, 0); a quaternion → (q, 0);
    anything with re/im (a Complex) → ((re, im), 0); an octonion
    passes through. */

    static from(value) {
        if (value instanceof Octonion) {
            return value;
        }

        return new Octonion(Quaternion.from(value), Quaternion.zero);
    }

    /* the eight components, real part first */

    static fromComponents(components) {
        const [c0, c1, c2, c3, c4, c5, c6, c7] = components;

        return new Octonion(
            new Quaternion(c0, c1, c2, c3),
            new Quaternion(c4, c5, c6, c7)
        );
    }

    get components() {
        const { a, b } = this;

        return [a.w, a.x, a.y, a.z, b.w, b.x, b.y, b.z];
    }

    static zero = new Octonion(Quaternion.zero, Quaternion.zero);
    static one = new Octonion(Quaternion.one, Quaternion.zero);

    add(other) {
        const o = Octonion.from(other);

        return new Octonion(this.a.add(o.a), this.b.add(o.b));
    }

    sub(other) {
        return this.add(Octonion.from(other).neg());
    }

    neg() {
        return new Octonion(this.a.neg(), this.b.neg());
    }

    scale(scalar) {
        return new Octonion(this.a.scale(scalar), this.b.scale(scalar));
    }

    /* the Cayley-Dickson product */

    mul(other) {
        const { a, b } = this;
        const { a: c, b: d } = Octonion.from(other);

        return new Octonion(
            a.mul(c).sub(d.conj().mul(b)),
            d.mul(a).add(b.mul(c.conj()))
        );
    }

    conj() {
        return new Octonion(this.a.conj(), this.b.neg());
    }

    norm2() {
        return this.a.norm2() + this.b.norm2();
    }

    abs() {
        return Math.sqrt(this.norm2());
    }

    inv() {
        const norm = this.norm2();

        if (norm === 0) {
            throw new Error("Cannot invert the zero octonion");
        }

        return this.conj().scale(1 / norm);
    }

    div(other) {
        return this.mul(Octonion.from(other).inv());
    }

    pow(exponent) {
        let n = typeof exponent === "bigint" ? Number(exponent) : exponent;

        if (!Number.isInteger(n)) {
            throw new Error(
                `An octonion power needs an integer exponent, got ${exponent}`
            );
        }

        if (n < 0) {
            return this.inv().pow(-n);
        }

        let result = Octonion.one;
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
        const o = Octonion.from(other);

        return this.a.equals(o.a) && this.b.equals(o.b);
    }

    /* the real value, if the octonion is one */

    asScalar() {
        const a = this.a.asScalar();

        return a !== undefined && this.b.equals(Quaternion.zero)
            ? a
            : undefined;
    }

    toString() {
        return `(${this.components.join(", ")})`;
    }
}
