/* rational — exact rational numbers: a normalized BigInt numerator
and denominator (denominator positive, gcd one), so arithmetic never
rounds. the expression library ($math/expression) carries rationals as
a value type; plain JS numbers convert exactly (every finite double is
a rational), and lowering back to a double is the only fallible step. */

const gcd = (a, b) => {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;

    while (b) {
        [a, b] = [b, a % b];
    }

    return a;
};

export class Rational {
    /* use Rational.of — the constructor trusts its arguments to be
    normalized already. */

    constructor(num, den) {
        this.num = num;
        this.den = den;
    }

    static #normalize(num, den) {
        if (den === 0n) {
            throw new Error("A rational number cannot have a zero denominator");
        }

        if (den < 0n) {
            num = -num;
            den = -den;
        }

        const common = gcd(num, den);

        return new Rational(num / common, den / common);
    }

    /* Rational.of(value): rational from rational (idempotent), from a
    bigint, or from a finite double — exactly, via the IEEE 754 bit
    decomposition, so 0.1 is 1/10? no: it is the exact double the
    literal spelled (0.1 → 3602879701896397/36028797018963968). integer
    -valued doubles take the short path. */

    static of(value) {
        if (value instanceof Rational) {
            return value;
        }

        if (typeof value === "bigint") {
            return new Rational(value, 1n);
        }

        if (typeof value !== "number" || !Number.isFinite(value)) {
            throw new Error(`Cannot read '${value}' as a rational number`);
        }

        if (Number.isInteger(value)) {
            return new Rational(BigInt(value), 1n);
        }

        const bits = new DataView(new ArrayBuffer(8));
        bits.setFloat64(0, value);

        const high = bits.getUint32(0);
        const low = bits.getUint32(4);
        const sign = high >> 31 ? -1n : 1n;
        const exponent = (high >> 20) & 0x7ff;
        const mantissa =
            (BigInt(high & 0xfffff) << 32n) | BigInt(low);

        // subnormals have no implicit leading one and one more exponent
        const [mantissaFull, shift] =
            exponent === 0
                ? [mantissa, -1074]
                : [mantissa | (1n << 52n), exponent - 1075];

        const num = sign * mantissaFull;

        return shift >= 0
            ? new Rational(num << BigInt(shift), 1n)
            : Rational.#normalize(num, 1n << BigInt(-shift));
    }

    static zero = new Rational(0n, 1n);
    static one = new Rational(1n, 1n);

    add(other) {
        const b = Rational.of(other);

        return Rational.#normalize(
            this.num * b.den + b.num * this.den,
            this.den * b.den
        );
    }

    sub(other) {
        return this.add(Rational.of(other).neg());
    }

    mul(other) {
        const b = Rational.of(other);

        // cross-cancel before multiplying, keeping the operands small
        const left = gcd(this.num < 0n ? -this.num : this.num, b.den);
        const right = gcd(b.num < 0n ? -b.num : b.num, this.den);

        return Rational.#normalize(
            (this.num / left) * (b.num / right),
            (this.den / right) * (b.den / left)
        );
    }

    div(other) {
        return this.mul(Rational.of(other).inv());
    }

    neg() {
        return new Rational(-this.num, this.den);
    }

    inv() {
        if (this.num === 0n) {
            throw new Error("Cannot invert zero");
        }

        return new Rational(this.den, this.num);
    }

    abs() {
        return this.num < 0n ? this.neg() : this;
    }

    sign() {
        return this.num < 0n ? -1 : this.num > 0n ? 1 : 0;
    }

    /* → -1 | 0 | 1 */

    compare(other) {
        const b = Rational.of(other);
        const left = this.num * b.den;
        const right = b.num * this.den;

        return left < right ? -1 : left > right ? 1 : 0;
    }

    equals(other) {
        const b = Rational.of(other);

        return this.num === b.num && this.den === b.den;
    }

    /* floor/ceil/trunc → bigint; round rounds half away from zero (the
    expression library's round convention). */

    floor() {
        const quotient = this.num / this.den;

        return this.num < 0n && this.num % this.den !== 0n
            ? quotient - 1n
            : quotient;
    }

    ceil() {
        return -this.neg().floor();
    }

    trunc() {
        return this.num / this.den;
    }

    round() {
        const doubled = this.abs().mul(Rational.of(2n)).floor();

        return (doubled + 1n) / 2n * BigInt(this.sign() || 1);
    }

    fract() {
        return this.sub(Rational.of(this.floor()));
    }

    isInteger() {
        return this.den === 1n;
    }

    pow(exponent) {
        let n = typeof exponent === "bigint" ? exponent : BigInt(exponent);

        if (n < 0n) {
            return this.inv().pow(-n);
        }

        let result = Rational.one;
        let base = this;

        while (n > 0n) {
            if (n & 1n) {
                result = result.mul(base);
            }

            base = base.mul(base);
            n >>= 1n;
        }

        return result;
    }

    toString() {
        return this.den === 1n ? String(this.num) : `${this.num}/${this.den}`;
    }

    valueOf() {
        return Number(this.num) / Number(this.den);
    }
}
