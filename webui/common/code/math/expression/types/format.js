/* format — the literal formatters (wgsl and math) the types'
renderNumber hooks build on, and exactQuotient: numerator/denominator
as a single constant, when the division is exact in doubles and worth
showing as one number. */

export function formatFloat(value) {
    if (!Number.isFinite(value)) {
        throw new Error(`Cannot render the non-finite number ${value} as wgsl`);
    }

    if (!Number.isFinite(Math.fround(value))) {
        throw new Error(
            `Cannot render ${value} as a wgsl f32 literal: out of range`
        );
    }

    let text = String(value);

    if (!/[.eE]/.test(text)) {
        text += ".0";
    }

    return value < 0 ? `(${text})` : text;
}

/* named constants (pi, ...) stay symbolic — auto mode maps the greek
names — and scientific notation becomes a mantissa times a power of
ten, since the module has no exponent literal. */

export function formatMathNumber(node) {
    if (node.name !== undefined) {
        return node.name;
    }

    const value = node.value;

    if (Number.isNaN(value)) {
        throw new Error(`Cannot render NaN as math at index ${node.index}`);
    }

    if (!Number.isFinite(value)) {
        return value > 0 ? "inf" : "-inf";
    }

    const text = String(value);

    if (!/[eE]/.test(text)) {
        return text;
    }

    const [mantissa, exponent] = text.split(/[eE]/);

    return `${mantissa} dot 10^{${Number(exponent)}}`;
}

/* numerator/denominator as a single constant, when the division is
exact in doubles and worth showing as one number: for integer constants
the reduced denominator must be 2/5-smooth, i.e. the quotient must be a
terminating decimal (2/4 → 0.5, 6/4 → 1.5, but 2/3 stays a fraction —
0.666... is a longer rendering of an inexact value). the round-trip
check rejects quotients the division itself rounded. */

export function exactQuotient(numerator, denominator) {
    const quotient = numerator / denominator;

    if (!Number.isFinite(quotient) || quotient * denominator !== numerator) {
        return undefined;
    }

    if (Number.isInteger(numerator) && Number.isInteger(denominator)) {
        let gcd = Math.abs(denominator);

        for (
            let remainder = Math.abs(numerator);
            remainder;
            [remainder, gcd] = [gcd % remainder, remainder]
        );

        let rest = Math.abs(denominator) / gcd;

        while (rest % 2 === 0) rest /= 2;
        while (rest % 5 === 0) rest /= 5;

        if (rest !== 1) {
            return undefined;
        }
    }

    return quotient;
}
