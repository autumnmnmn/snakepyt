/* comparison — comparisons and logical operators produce booleans;
the conditionals consume them (select here, the cases node and the
ternary in semantics/). for differentiation the conditionals are
piecewise-constant: comparisons' and logic's derivatives are zero,
and a conditional's branches differentiate. the order comparisons
are float-only (there is no order on the complexes, and a
componentwise order is not a boolean); equality accepts any one
type on both sides. */

import {
    boolType,
    complexType,
    floatType,
    integerType,
    naturalType,
    octonionType,
    quaternionType,
    rationalType,
} from "../types/index.js";
import { define, entryEqual, liftComplex, zeroDerivative } from "./helpers.js";

/* the exact-order cases: naturals and integers compare as bigints,
rationals by their compare (the complexes have no order, and the
residues have no sign). */

const exactOrder = (bigintCompare, rationalCompare) => [
    {
        arguments: [naturalType(), naturalType()],
        returns: boolType,
        evaluate: bigintCompare,
    },
    {
        arguments: [integerType, integerType],
        returns: boolType,
        evaluate: bigintCompare,
    },
    {
        arguments: [rationalType, rationalType],
        returns: boolType,
        evaluate: rationalCompare,
    },
];

/* modular equality: same modulus, same residue. the wgsl template is
inherited — the lowered f32 residues compare directly */

const modularEqual = (evaluate) => ({
    match: ([a, b]) =>
        a?.kind === "integer" && a.modulus !== undefined && a === b
            ? { returns: boolType, fields: { evaluate } }
            : null,
});

export const comparison = define({
    less: {
        structural: true,
        syntax: { symbol: "<", binary: { precedence: 8, associativity: "left" } },
        evaluate: (a, b) => a < b,
        returns: boolType,
        cases: exactOrder((a, b) => a < b, (a, b) => a.compare(b) < 0),
        derivative: zeroDerivative,
        template: { wgsl: "({0} < {1})", math: "{0} < {1}" },
        mathClass: "comparison",
    },

    lessEqual: {
        structural: true,
        syntax: { symbol: "<=", binary: { precedence: 8, associativity: "left" } },
        evaluate: (a, b) => a <= b,
        returns: boolType,
        cases: exactOrder((a, b) => a <= b, (a, b) => a.compare(b) <= 0),
        derivative: zeroDerivative,
        template: { wgsl: "({0} <= {1})", math: "{0} <= {1}" },
        mathClass: "comparison",
    },

    greater: {
        structural: true,
        syntax: { symbol: ">", binary: { precedence: 8, associativity: "left" } },
        evaluate: (a, b) => a > b,
        returns: boolType,
        cases: exactOrder((a, b) => a > b, (a, b) => a.compare(b) > 0),
        derivative: zeroDerivative,
        template: { wgsl: "({0} > {1})", math: "{0} > {1}" },
        mathClass: "comparison",
    },

    greaterEqual: {
        structural: true,
        syntax: { symbol: ">=", binary: { precedence: 8, associativity: "left" } },
        evaluate: (a, b) => a >= b,
        returns: boolType,
        cases: exactOrder((a, b) => a >= b, (a, b) => a.compare(b) >= 0),
        derivative: zeroDerivative,
        template: { wgsl: "({0} >= {1})", math: "{0} >= {1}" },
        mathClass: "comparison",
    },

    equal: {
        structural: true,
        syntax: { symbol: "==", binary: { precedence: 7, associativity: "left" } },
        derivative: zeroDerivative,
        template: { wgsl: "({0} == {1})", math: "{0} = {1}" },
        mathClass: "comparison",
        mathParens: { any: ["comparison"] },
        cases: [
            {
                arguments: [floatType, floatType],
                returns: boolType,
                evaluate: (a, b) => a === b,
            },
            {
                arguments: [boolType, boolType],
                returns: boolType,
                evaluate: (a, b) => a === b,
            },
            {
                arguments: [complexType, complexType],
                returns: boolType,
                evaluate: (a, b) => {
                    const left = liftComplex(a);
                    const right = liftComplex(b);

                    return left.re === right.re && left.im === right.im;
                },
                template: { wgsl: "all({0} == {1})" },
            },
            {
                arguments: [naturalType(), naturalType()],
                returns: boolType,
                evaluate: (a, b) => a === b,
            },
            {
                arguments: [integerType, integerType],
                returns: boolType,
                evaluate: (a, b) => a === b,
            },
            modularEqual((a, b) => a.value === b.value),
            {
                arguments: [rationalType, rationalType],
                returns: boolType,
                evaluate: (a, b) => a.equals(b),
            },
            {
                arguments: [quaternionType, quaternionType],
                returns: boolType,
                evaluate: (a, b) => a.equals(b),
                template: { wgsl: "all({0} == {1})" },
            },
            {
                arguments: [octonionType, octonionType],
                returns: boolType,
                evaluate: (a, b) => a.equals(b),
            },
            {
                arguments: ["vector", "vector"],
                returns: boolType,
                evaluate: (a, b) => a.every((x, i) => entryEqual(x, b[i])),
                template: { wgsl: "all({0} == {1})" },
            },
        ],
    },

    notEqual: {
        structural: true,
        syntax: { symbol: "!=", binary: { precedence: 7, associativity: "left" } },
        derivative: zeroDerivative,
        template: { wgsl: "({0} != {1})", math: "{0} != {1}" },
        mathClass: "comparison",
        mathParens: { any: ["comparison"] },
        cases: [
            {
                arguments: [floatType, floatType],
                returns: boolType,
                evaluate: (a, b) => a !== b,
            },
            {
                arguments: [boolType, boolType],
                returns: boolType,
                evaluate: (a, b) => a !== b,
            },
            {
                arguments: [complexType, complexType],
                returns: boolType,
                evaluate: (a, b) => {
                    const left = liftComplex(a);
                    const right = liftComplex(b);

                    return left.re !== right.re || left.im !== right.im;
                },
                template: { wgsl: "any({0} != {1})" },
            },
            {
                arguments: [naturalType(), naturalType()],
                returns: boolType,
                evaluate: (a, b) => a !== b,
            },
            {
                arguments: [integerType, integerType],
                returns: boolType,
                evaluate: (a, b) => a !== b,
            },
            modularEqual((a, b) => a.value !== b.value),
            {
                arguments: [rationalType, rationalType],
                returns: boolType,
                evaluate: (a, b) => !a.equals(b),
            },
            {
                arguments: [quaternionType, quaternionType],
                returns: boolType,
                evaluate: (a, b) => !a.equals(b),
                template: { wgsl: "any({0} != {1})" },
            },
            {
                arguments: [octonionType, octonionType],
                returns: boolType,
                evaluate: (a, b) => !a.equals(b),
            },
            {
                arguments: ["vector", "vector"],
                returns: boolType,
                evaluate: (a, b) => a.some((x, i) => !entryEqual(x, b[i])),
                template: { wgsl: "any({0} != {1})" },
            },
        ],
    },

    /* && and || are scalar-only spellings in wgsl; over bool vectors
    (the pointwise fallback) they render as the componentwise & and |. */

    and: {
        structural: true,
        syntax: { symbol: "&&", binary: { precedence: 5, associativity: "left" } },
        derivative: zeroDerivative,
        template: { wgsl: "({0} && {1})" },
        pointwise: { template: { wgsl: "({0} & {1})" } },
        cases: [
            {
                arguments: [boolType, boolType],
                returns: boolType,
                evaluate: (a, b) => a && b,
            },
        ],
    },

    or: {
        structural: true,
        syntax: { symbol: "||", binary: { precedence: 4, associativity: "left" } },
        derivative: zeroDerivative,
        template: { wgsl: "({0} || {1})" },
        pointwise: { template: { wgsl: "({0} | {1})" } },
        cases: [
            {
                arguments: [boolType, boolType],
                returns: boolType,
                evaluate: (a, b) => a || b,
            },
        ],
    },

    not: {
        structural: true,
        syntax: { symbol: "!", prefix: { precedence: 25 } },
        derivative: zeroDerivative,
        template: { wgsl: "(!{0})" },
        cases: [
            {
                arguments: [boolType],
                returns: boolType,
                evaluate: (a) => !a,
            },
        ],
    },

    /* the conditional primitive codegen renders cases blocks with —
    not surface syntax (structural): the ternary is shorthand for a
    two-case block, and `cases` is the fully general one, so semantic
    trees only ever hold selects codegen built, and the semantic hooks
    (a derivative, rewrite rules) are the cases node's own business
    (semantics/). wgsl's select takes its condition last, hence the
    argument shuffle in the template. the branches unify:
    select(bool, float, complex) promotes the float branch. */

    select: {
        structural: true,
        template: { wgsl: "select({2}, {1}, {0})" },
        cases: [
            {
                arguments: [boolType, "same", "same"],
                returns: "arguments",
                evaluate: (condition, then, otherwise) =>
                    condition ? then : otherwise,
            },
        ],
    },
});
