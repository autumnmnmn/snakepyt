/* modular — the integers modulo m: values are bigints normalized to
[0, m), carrying their modulus, so Z/mZ arithmetic is exact and the
modulus is never lost. addition, subtraction, multiplication and
negation always work; division is multiplication by the modular
inverse, which exists exactly when the divisor is coprime with the
modulus (every nonzero element when the modulus is prime) — anything
else is an error. the expression library ($math/expression) carries
modular integers as a value type. */

export class ModularInteger {
    constructor(value, modulus) {
        if (typeof modulus !== "bigint" || modulus < 2n) {
            throw new Error(`A modulus must be an integer >= 2, got ${modulus}`);
        }

        this.modulus = modulus;
        this.value = ((BigInt(value) % modulus) + modulus) % modulus;
    }

    static of(value, modulus) {
        return value instanceof ModularInteger && value.modulus === modulus
            ? value
            : new ModularInteger(
                  value instanceof ModularInteger ? value.value : value,
                  modulus
              );
    }

    #peer(other) {
        if (
            other instanceof ModularInteger &&
            other.modulus !== this.modulus
        ) {
            throw new Error(
                `Cannot mix arithmetic modulo ${this.modulus} and modulo ${other.modulus}`
            );
        }

        return ModularInteger.of(other, this.modulus);
    }

    add(other) {
        const b = this.#peer(other);

        return new ModularInteger(this.value + b.value, this.modulus);
    }

    sub(other) {
        const b = this.#peer(other);

        return new ModularInteger(this.value - b.value, this.modulus);
    }

    mul(other) {
        const b = this.#peer(other);

        return new ModularInteger(this.value * b.value, this.modulus);
    }

    neg() {
        return new ModularInteger(-this.value, this.modulus);
    }

    /* the modular inverse, by the extended Euclidean algorithm */

    inv() {
        let [r0, r1] = [this.value, this.modulus];
        let [t0, t1] = [1n, 0n];

        while (r1) {
            const q = r0 / r1;

            [r0, r1] = [r1, r0 % r1];
            [t0, t1] = [t1, t0 - q * t1];
        }

        if (r0 !== 1n) {
            throw new Error(
                `${this.value} has no inverse modulo ${this.modulus}: ` +
                    `they share a factor of ${r0}`
            );
        }

        return new ModularInteger(t0, this.modulus);
    }

    div(other) {
        return this.mul(this.#peer(other).inv());
    }

    pow(exponent) {
        let n = typeof exponent === "bigint" ? exponent : BigInt(exponent);

        if (n < 0n) {
            return this.inv().pow(-n);
        }

        let result = new ModularInteger(1n, this.modulus);
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

    equals(other) {
        return (
            other instanceof ModularInteger &&
            other.modulus === this.modulus &&
            other.value === this.value
        );
    }

    toString() {
        return `${this.value} (mod ${this.modulus})`;
    }

    valueOf() {
        return Number(this.value);
    }
}
