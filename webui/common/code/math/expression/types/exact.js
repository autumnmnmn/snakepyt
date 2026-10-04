/* exact — the exact scalar tower: naturals (parametrized by whether
they include zero), integers (optionally parametrized by a modulus —
integer<7> is Z/7Z), and rationals (exact BigInt pairs). values are
bigints (naturals, integers), ModularInteger instances (modular
integers, carrying their modulus), and Rational instances (rationals)
— arithmetic on them never rounds.

the tower sits below float in the lattice: natural<false> → natural →
integer → rational → float (→ complex → quaternion), each embedding
exact. modular integers join nothing but themselves (Z/mZ is a
quotient, not a subset, of Z); there is no subtraction on the
naturals (a semiring) and no division on naturals or integers (not
fields) — the operations' cases say so, and the lattice lifts such
arithmetic into the ring/field completion (naturals subtract as
integers, integers divide as rationals).

a bigint literal is ambiguous between natural and integer: number
nodes carry a fill-stamped valueType for that (see types/resolve.js's
numberType); the type of a bare bigint value reads as integer.

wgsl has no exact integers here: literals and conversions lower to
f32 (the task's "nasty fallible types of the real world"), with
modular operations rendering an explicit f32 mod. */

import { ModularInteger } from "../../modular.js";
import { Rational } from "../../rational.js";
import { exactQuotient, formatFloat } from "./format.js";

/* the shared bigint scalar behavior: lift validates integer-valuedness
(a natural lift of a negative or a non-integer throws — the semiring
has no negatives), literals render lowered. */

const bigintLift = (minimum, typeName) => (value) => {
    const bigint =
        typeof value === "bigint"
            ? value
            : typeof value === "number" && Number.isInteger(value)
              ? BigInt(value)
              : undefined;

    if (bigint === undefined) {
        throw new Error(`Cannot read '${value}' as a ${typeName}: not an integer`);
    }

    if (minimum !== undefined && bigint < minimum) {
        throw new Error(
            `Cannot read '${value}' as a ${typeName}: below ${minimum}`
        );
    }

    return bigint;
};

const bigintConstant = (lift) => (value, name) => {
    try {
        return lift(value);
    } catch (error) {
        throw new Error(`Constant '${name}': ${error.message}`);
    }
};

const bigintRenderMath = (node) =>
    node.name !== undefined ? node.name : String(node.value);

const naturals = new Map();

export function naturalType(includeZero = true) {
    const key = includeZero ? "natural" : "natural<false>";

    if (!naturals.has(key)) {
        const minimum = includeZero ? 0n : 1n;
        const lift = bigintLift(minimum, key);

        naturals.set(key, {
            isType: true,
            kind: "natural",
            name: key,
            includeZero,
            commutative: true,
            integerExponents: true,
            lift,
            constant: bigintConstant(lift),
            isFinite: () => true,
            literalEqual: (a, b) => a === b,
            asReal: (value) => Number(value),
            isZero: (value) => value === 0n,
            isOne: (value) => value === 1n,
            isMinusOne: () => false,
            splitSign: (value) => ({ sign: 1, value }),
            crossReduce: integerCrossReduce,
            renderNumber: {
                wgsl: (node) => formatFloat(Number(node.value)),
                math: bigintRenderMath,
            },
            renderConvert: {
                wgsl: (operand) => operand,
                math: (operand) => operand,
            },
        });
    }

    return naturals.get(key);
}

/* a numerator/denominator pair of exact integers as one constant:
the integer quotient when it is one, else the exact rational. */

function integerCrossReduce(numerator, denominator) {
    if (denominator === 0n) {
        return undefined;
    }

    if (numerator % denominator === 0n) {
        return numerator / denominator;
    }

    return Rational.of(numerator).div(Rational.of(denominator));
}

const integerLift = bigintLift(undefined, "integer");

export const integerType = {
    isType: true,
    kind: "integer",
    name: "integer",
    commutative: true,
    integerExponents: true,
    lift: integerLift,
    constant: bigintConstant(integerLift),
    isFinite: () => true,
    literalEqual: (a, b) => a === b,
    asReal: (value) => Number(value),
    isZero: (value) => value === 0n,
    isOne: (value) => value === 1n,
    isMinusOne: (value) => value === -1n,
    splitSign: (value) =>
        value < 0n ? { sign: -1, value: -value } : { sign: 1, value },
    crossReduce: integerCrossReduce,
    renderNumber: {
        wgsl: (node) => formatFloat(Number(node.value)),
        math: bigintRenderMath,
    },
    renderConvert: { wgsl: (operand) => operand, math: (operand) => operand },
};

const modulars = new Map();

export function modularIntegerType(modulus) {
    const key = `integer<${modulus}>`;

    if (!modulars.has(key)) {
        modulars.set(key, {
            isType: true,
            kind: "integer",
            name: key,
            modulus,
            commutative: true,
            integerExponents: true,
            lift: (value) => ModularInteger.of(value, modulus),
            constant(value, name) {
                try {
                    return ModularInteger.of(value, modulus);
                } catch (error) {
                    throw new Error(`Constant '${name}': ${error.message}`);
                }
            },
            isFinite: () => true,
            literalEqual: (a, b) => a.value === b.value,
            // residues have no sign: no order, no real reading
            asReal: () => undefined,
            isZero: (value) => value.value === 0n,
            isOne: (value) => value.value === 1n,
            isMinusOne: (value) => value.value === modulus - 1n,
            splitSign: (value) => ({ sign: 1, value }),
            crossReduce(numerator, denominator) {
                try {
                    return numerator.div(denominator);
                } catch {
                    return undefined;
                }
            },
            renderNumber: {
                wgsl: (node) => formatFloat(Number(node.value.value)),
                math: (node) =>
                    node.name !== undefined ? node.name : String(node.value.value),
            },
            renderConvert: {
                wgsl: (operand) => operand,
                math: (operand) => operand,
            },
        });
    }

    return modulars.get(key);
}

const rationalLift = (value) => Rational.of(value);

export const rationalType = {
    isType: true,
    kind: "rational",
    name: "rational",
    commutative: true,
    integerExponents: true,
    lift: rationalLift,
    constant(value, name) {
        try {
            return Rational.of(value);
        } catch (error) {
            throw new Error(`Constant '${name}': ${error.message}`);
        }
    },
    isFinite: () => true,
    literalEqual: (a, b) => a.equals(b),
    /* an integer-valued rational literal IS an integer: fill types it
    as one (a natural when non-negative), so x^2 over a rational
    default takes the exact integer-exponent power case */
    narrowLiteral(value) {
        if (!value.isInteger()) {
            return undefined;
        }

        return value.num >= 0n
            ? { type: naturalType(), value: value.num }
            : { type: integerType, value: value.num };
    },
    asReal(value) {
        const number = Number(value);

        // guard the sign against underflow: a tiny rational reads as
        // zero no sooner than a huge one as infinity, for sign's sake
        if (number === 0 && value.num !== 0n) {
            return value.sign() * Number.MIN_VALUE;
        }

        return number;
    },
    isZero: (value) => value.num === 0n,
    isOne: (value) => value.num === 1n && value.den === 1n,
    isMinusOne: (value) => value.num === -1n && value.den === 1n,
    splitSign: (value) => ({ sign: value.sign(), value: value.abs() }),
    crossReduce(numerator, denominator) {
        try {
            return numerator.div(denominator);
        } catch {
            return undefined;
        }
    },
    renderNumber: {
        wgsl(node) {
            const { num, den } = node.value;

            if (den === 1n) {
                return formatFloat(Number(num));
            }

            const quotient = exactQuotient(Number(num), Number(den));

            return quotient !== undefined
                ? formatFloat(quotient)
                : `(${formatFloat(Number(num))} / ${formatFloat(Number(den))})`;
        },
        math: (node) =>
            node.name !== undefined
                ? node.name
                : node.value.den === 1n
                  ? String(node.value.num)
                  : `{${node.value.num}}/{${node.value.den}}`,
    },
    renderConvert: { wgsl: (operand) => operand, math: (operand) => operand },
};
