/* scalars — the scalar value types: float (plain doubles, the default
for literals and undeclared variables), bool (what comparisons and
logical operators produce and the conditionals consume; isolated in
the promotion lattice), and complex (the complexes, values carried by the
Complex class of $math/complex).

the type contract, here and for the aggregates:

- name / kind: "float", "complex", "bool", "vector<n>", "matrix<r,c>"
  for error messages; kind is the bare word, for case patterns.
- commutative: whether canonicalize may flatten and cancel products of
  this type's values (false for matrices).
- lift(value): coerce a plain JS number to this type's value (splat for
  vectors and matrices). idempotent. also the value-level half of
  promotion: promotions always start from a float.
- constant(value, name): read a fill-time constant; throws on values
  the type cannot hold.
- isFinite(value): the folding guard — folds producing non-finite
  values are declined.
- literalEqual(a, b): literal value equality, for treesEqual's number
  comparison and cancellation.
- asReal(value): the real value of a literal, if it is one (complex:
  imaginary part zero) — power exponents and canonicalize's side flips
  need real exponents.
- isZero/isOne/isMinusOne(value): the identity/annihilator probes of
  the rewrite passes. for a matrix, "one" is the identity matrix — the
  multiplicative identity of matmul.
- splitSign(value) → { sign, value }: how a folded constant presents
  itself in a sum — floats show -3 as sign -1 with |3|, other types
  keep the value whole.
- crossReduce(numerator, denominator) → value | undefined: a product's
  numerator and denominator constants as one constant, or undefined to
  keep the fraction. the float type answers only exact, nicely
  rendering quotients (exactQuotient, format.js).
- renderNumber { wgsl(node), math(node) }: literal rendering per
  codegen target.
- renderConvert { wgsl(operand), math(operand) }: how a conversion TO
  this type renders, given the converted operand's rendering. */

import { Complex } from "../../complex.js";
import { exactQuotient, formatFloat, formatMathNumber } from "./format.js";

export const floatType = {
    isType: true,
    kind: "float",
    name: "float",
    commutative: true,
    // a promotion's value half: exact-tower literals (bigints,
    // rationals, modular integers) coerce to their nearest double
    lift: (value) => (typeof value === "number" ? value : Number(value)),
    constant(value, name) {
        const number = Number(value);

        if (Number.isNaN(number)) {
            throw new Error(
                `Constant '${name}' has a non-numeric value '${value}'`
            );
        }

        return number;
    },
    isFinite: Number.isFinite,
    literalEqual: (a, b) => a === b,
    asReal: (value) => value,
    isZero: (value) => value === 0,
    isOne: (value) => value === 1,
    isMinusOne: (value) => value === -1,
    splitSign: (value) => ({ sign: Math.sign(value), value: Math.abs(value) }),
    crossReduce: exactQuotient,
    renderNumber: {
        wgsl: (node) => formatFloat(node.value),
        math: formatMathNumber,
    },
    renderConvert: { wgsl: (operand) => operand, math: (operand) => operand },
};

export const boolType = {
    isType: true,
    kind: "bool",
    name: "bool",
    commutative: true,
    lift: (value) => Boolean(value),
    constant(value, name) {
        if (typeof value !== "boolean") {
            throw new Error(`Constant '${name}' is not a boolean`);
        }

        return value;
    },
    isFinite: () => true,
    literalEqual: (a, b) => a === b,
    asReal: () => undefined,
    isZero: (value) => value === false,
    isOne: (value) => value === true,
    isMinusOne: () => false,
    splitSign: (value) => ({ sign: 1, value }),
    crossReduce: () => undefined,
    renderNumber: {
        wgsl: (node) => (node.value ? "true" : "false"),
        math: (node) => (node.value ? "true" : "false"),
    },
    renderConvert: { wgsl: (operand) => operand, math: (operand) => operand },
};

const liftComplex = (value) =>
    value instanceof Complex
        ? value
        : Complex.cart(typeof value === "number" ? value : Number(value), 0);

const complexEqual = (a, b) => {
    const left = liftComplex(a);
    const right = liftComplex(b);

    return left.re === right.re && left.im === right.im;
};

function formatMathComplex(node) {
    const z = liftComplex(node.value);

    const realPart = () => formatMathNumber({ value: z.re, index: node.index });
    const imaginaryPart = () =>
        formatMathNumber({ value: Math.abs(z.im), index: node.index });

    if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
        throw new Error(
            `Cannot render a non-finite complex number as math ` +
                `at index ${node.index}`
        );
    }

    if (z.re === 0 && z.im === 0) {
        return "0";
    }

    const imaginaryText = z.im === 1 ? "i" : `${imaginaryPart()}i`;

    if (z.re === 0) {
        return z.im < 0 ? `-${imaginaryText}` : imaginaryText;
    }

    if (z.im === 0) {
        return realPart();
    }

    // both parts: parenthesized, so the literal stays one factor
    return z.im < 0
        ? `(${realPart()} - ${imaginaryText})`
        : `(${realPart()} + ${imaginaryText})`;
}

export const complexType = {
    isType: true,
    kind: "complex",
    name: "complex",
    commutative: true,
    lift: liftComplex,
    constant(value, name) {
        if (value instanceof Complex) {
            return value;
        }

        if (Array.isArray(value)) {
            if (value.length !== 2 || value.some((x) => Number.isNaN(Number(x)))) {
                throw new Error(
                    `Constant '${name}' is not a [re, im] numeric pair`
                );
            }

            return Complex.cart(Number(value[0]), Number(value[1]));
        }

        const number = Number(value);

        if (Number.isNaN(number)) {
            throw new Error(
                `Constant '${name}' has a non-numeric value '${value}'`
            );
        }

        return Complex.cart(number, 0);
    },
    isFinite: (value) => {
        const z = liftComplex(value);

        return Number.isFinite(z.re) && Number.isFinite(z.im);
    },
    literalEqual: complexEqual,
    asReal: (value) => {
        const z = liftComplex(value);

        return z.im === 0 ? z.re : undefined;
    },
    isZero: (value) => {
        const z = liftComplex(value);

        return z.re === 0 && z.im === 0;
    },
    isOne: (value) => {
        const z = liftComplex(value);

        return z.re === 1 && z.im === 0;
    },
    isMinusOne: (value) => {
        const z = liftComplex(value);

        return z.re === -1 && z.im === 0;
    },
    splitSign: (value) => ({ sign: 1, value }),
    crossReduce: (numerator, denominator) =>
        liftComplex(numerator).div(liftComplex(denominator)),
    renderNumber: {
        wgsl: (node) => {
            const z = liftComplex(node.value);

            return `vec2f(${formatFloat(z.re)}, ${formatFloat(z.im)})`;
        },
        math: (node) =>
            node.name !== undefined ? node.name : formatMathComplex(node),
    },
    renderConvert: {
        wgsl: (operand) => `vec2f(${operand}, 0.0)`,
        math: (operand) => operand,
    },
};
