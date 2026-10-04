/* arithmetic — the additive operators and power: plus, minus, negate,
positive (the additive group; subtraction canonicalizes as a sum with
the right term negated) and power. the products — multiply, divide,
scale, pointwiseMultiply, pointwiseDivide, matmul — are products.js.
also home of the shared power recipes that pow reuses. */

import { Rational } from "../../rational.js";
import { constantValue, numberNode } from "../semantics/nodes.js";
import {
    integerType,
    naturalType,
    octonionType,
    oneOf,
    quaternionType,
    rationalType,
    typedCallNode,
    typeOfValue,
    valueApply,
} from "../types/index.js";
import {
    complex,
    complexWgsl,
    define,
    entryBinary,
    entryUnary,
    liftComplex,
    mapEntries,
    modularMatch,
    modWgsl,
    zipEntries,
} from "./helpers.js";

/* d/dx a^b, with a constant exponent or a constant base. the constant
exponent's b-1 is computed in the exponent's own arithmetic (a complex
exponent reduces to a complex literal). the constant base keeps its
log symbolic — log(2) renders as log(2) rather than a baked decimal,
and a negative real base renders log((-2)) (its value is NaN over the
reals; leaving it symbolic keeps that visible instead of crashing
codegen). a variable base with a variable exponent is rejected: over
the complexes a^b is exp(b*log(a)) by definition, but the real domain
has no such lift (the complex case below carries the general rule).
shared by power and pow. */

export function powerDerivative([base, exponent], [dBase, dExponent], builders) {
    const exponentValue = constantValue(exponent);

    if (exponentValue !== undefined) {
        // the constant exponent's b-1 is computed in the exponent's
        // own arithmetic (a complex exponent reduces to a complex
        // literal, a rational to a rational)
        return builders.multiply(
            exponent,
            builders.multiply(
                builders.power(
                    base,
                    numberNode(
                        valueApply(
                            arithmetic.minus,
                            exponentValue,
                            oneOf(typeOfValue(exponentValue))
                        ),
                        exponent.index
                    )
                ),
                dBase
            )
        );
    }

    const baseValue = constantValue(base);

    if (baseValue !== undefined) {
        return builders.multiply(
            builders.power(base, exponent),
            builders.multiply(builders.apply("log", base), dExponent)
        );
    }

    throw new Error(
        "Cannot differentiate a power with variable base and exponent " +
            `at index ${base.index}`
    );
}

/* d/dz a^b over the complexes. a constant exponent takes the stock
path; anything else lifts a^b = exp(b·log a), giving the general rule
a^b·(b·a′/a + b′·log a) — which also covers the constant base, once
simplify clears the dead term. a variable base with a variable
exponent, rejected over the reals, differentiates fine here. */

export const complexPowerDerivative = (args, derivatives, builders) => {
    const [base, exponent] = args;
    const [dBase, dExponent] = derivatives;

    if (constantValue(exponent) !== undefined) {
        return powerDerivative(args, derivatives, builders);
    }

    return builders.multiply(
        builders.power(base, exponent),
        builders.plus(
            builders.multiply(exponent, builders.divide(dBase, base)),
            builders.multiply(dExponent, builders.apply("log", base))
        )
    );
};

/* the power rules of simplify, shared by power and pow. */

export function powerSimplify(tree, [a, b], { isZero, isOne, one }) {
    if (isZero(b)) return one(tree);
    if (isOne(b)) return a;
    if (isOne(a)) return one(tree);

    return undefined;
}

export const arithmetic = define({
    plus: {
        structural: true,
        syntax: { symbol: "+", binary: { precedence: 10, associativity: "left" } },
        evaluate: (a, b) => a + b,
        derivative: ([x, y], [dx, dy], builders) => builders.plus(dx, dy),
        template: { wgsl: "({0} + {1})", math: "{0} + {1}" },
        mathClass: "additive",
        mathParens: { 1: ["negate"] },
        canonical: "sum",
        terms: "expand",
        cases: [
            complex((a, b) => liftComplex(a).add(liftComplex(b))),
            {
                arguments: [naturalType(), naturalType()],
                returns: "arguments",
                evaluate: (a, b) => a + b,
            },
            {
                arguments: [integerType, integerType],
                returns: "arguments",
                evaluate: (a, b) => a + b,
            },
            {
                match: modularMatch((modulus) => ({
                    evaluate: (a, b) => a.add(b),
                    template: { wgsl: modWgsl(modulus, "({0} + {1})") },
                })),
            },
            {
                arguments: [rationalType, rationalType],
                returns: "arguments",
                evaluate: (a, b) => a.add(b),
            },
            {
                arguments: [quaternionType, quaternionType],
                returns: quaternionType,
                evaluate: (a, b) => a.add(b),
            },
            {
                arguments: [octonionType, octonionType],
                returns: octonionType,
                evaluate: (a, b) => a.add(b),
            },
            {
                arguments: ["tensor", "tensor"],
                returns: "arguments",
                evaluate: (a, b) =>
                    zipEntries(a, b, entryBinary(arithmetic.plus, (x, y) => x + y)),
            }
        ],
        simplify: (tree, [a, b], tools) => {
            if (tools.isZero(a)) return b;
            if (tools.isZero(b)) return a;

            if (tools.isNegationOf(a, b) || tools.isNegationOf(b, a)) {
                return tools.zero(tree);
            }

            // a sum with a negated right term is a subtraction
            if (b.type === "call" && b.callee.name === "negate") {
                return tools.resimplify(
                    typedCallNode(
                        arithmetic.minus,
                        [a, b.arguments[0]],
                        tree.index,
                        tree.length
                    )
                );
            }

            return undefined;
        },
    },

    minus: {
        structural: true,
        syntax: { symbol: "-", binary: { precedence: 10, associativity: "left" } },
        evaluate: (a, b) => a - b,
        derivative: ([x, y], [dx, dy], builders) => builders.minus(dx, dy),
        template: { wgsl: "({0} - {1})", math: "{0} - {1}" },
        mathClass: "additive",
        mathParens: { 1: ["additive", "negate"] },
        canonical: "sum",
        terms: "subtract",
        cases: [
            complex((a, b) => liftComplex(a).sub(liftComplex(b))),
            {
                arguments: [integerType, integerType],
                returns: "arguments",
                evaluate: (a, b) => a - b,
            },
            {
                match: modularMatch((modulus) => ({
                    evaluate: (a, b) => a.sub(b),
                    template: { wgsl: modWgsl(modulus, "({0} - {1})") },
                })),
            },
            {
                arguments: [rationalType, rationalType],
                returns: "arguments",
                evaluate: (a, b) => a.sub(b),
            },
            {
                arguments: [quaternionType, quaternionType],
                returns: quaternionType,
                evaluate: (a, b) => a.sub(b),
            },
            {
                arguments: [octonionType, octonionType],
                returns: octonionType,
                evaluate: (a, b) => a.sub(b),
            },
            {
                arguments: ["tensor", "tensor"],
                returns: "arguments",
                evaluate: (a, b) =>
                    zipEntries(a, b, entryBinary(arithmetic.minus, (x, y) => x - y)),
            }
        ],
        simplify: (tree, [a, b], tools) => {
            if (tools.isZero(b)) return a;
            if (tools.isZero(a)) return tools.negate(b, tree.index, tree.length);

            if (tools.treesEqual(a, b)) {
                return tools.zero(tree);
            }

            // subtracting a negation adds
            if (b.type === "call" && b.callee.name === "negate") {
                return tools.resimplify(
                    typedCallNode(
                        arithmetic.plus,
                        [a, b.arguments[0]],
                        tree.index,
                        tree.length
                    )
                );
            }

            return undefined;
        },
    },

    power: {
        structural: true,
        syntax: { symbol: "^", binary: { precedence: 30, associativity: "right" } },
        evaluate: (a, b) => a ** b,
        derivative: powerDerivative,
        template: { wgsl: "pow({0}, {1})", math: "{{0}}^{{1}}" },
        mathParens: { 0: ["additive", "multiplicative", "negate"] },
        cases: [
            complex((a, b) => liftComplex(a).pow(liftComplex(b)), {
                template: { wgsl: complexWgsl("pow", [0, 1]) },
                derivative: complexPowerDerivative,
            }),
            {
                arguments: [naturalType(), naturalType()],
                returns: "arguments",
                evaluate: (a, b) => a ** b,
            },
            {
                arguments: [integerType, naturalType()],
                returns: integerType,
                evaluate: (a, b) => a ** b,
            },
            /* a general integer exponent lifts into the field
            completion, the way integer division does: 2^-3 is 1/8 */
            {
                arguments: [integerType, integerType],
                returns: rationalType,
                evaluate: (a, b) => Rational.of(a).pow(b),
            },
            {
                arguments: [rationalType, integerType],
                returns: rationalType,
                evaluate: (a, b) => a.pow(b),
            },
            {
                arguments: [quaternionType, integerType],
                returns: quaternionType,
                evaluate: (a, b) => a.pow(b),
                template: { wgsl: "quaternion_pow({0}, i32({1}))" },
            },
            {
                arguments: [octonionType, integerType],
                returns: octonionType,
                evaluate: (a, b) => a.pow(b),
            },
            /* the modular power: repeated squaring over the residues.
            the exponent is a natural or plain integer — or a residue
            of the same modulus, whose value is the exponent. wgsl
            renders the plain call — a shader supplies its own helper
            (the complex_* convention), so the case suppresses the
            inherited template */
            {
                match: ([base, exponent]) =>
                    base?.kind === "integer" &&
                    base.modulus !== undefined &&
                    (exponent?.kind === "natural" ||
                        exponent === integerType ||
                        exponent === base)
                        ? {
                              returns: base,
                              fields: {
                                  evaluate: (a, b) =>
                                      a.pow(typeof b === "bigint" ? b : b.value),
                                  template: { wgsl: undefined },
                              },
                          }
                        : null,
            },
        ],
        simplify: powerSimplify,
    },

    negate: {
        structural: true,
        syntax: { symbol: "-", prefix: { precedence: 25 } },
        evaluate: (a) => -a,
        derivative: ([x], [dx], builders) => builders.negate(dx),
        template: { wgsl: "(-{0})", math: "{-{0}}" },
        mathClass: "negate",
        mathParens: { any: ["additive", "negate"] },
        canonical: "sum",
        terms: "negate",
        factors: "negate",
        cases: [
            complex((a) => liftComplex(a).neg()),
            {
                arguments: [integerType],
                returns: "arguments",
                evaluate: (a) => -a,
            },
            {
                match: modularMatch((modulus) => ({
                    evaluate: (a) => a.neg(),
                    template: { wgsl: modWgsl(modulus, "(-{0})") },
                })),
            },
            {
                arguments: [rationalType],
                returns: "arguments",
                evaluate: (a) => a.neg(),
            },
            {
                arguments: [quaternionType],
                returns: quaternionType,
                evaluate: (a) => a.neg(),
            },
            {
                arguments: [octonionType],
                returns: octonionType,
                evaluate: (a) => a.neg(),
            },
            {
                arguments: ["tensor"],
                returns: "arguments",
                evaluate: (a) => mapEntries(a, entryUnary(arithmetic.negate, (x) => -x)),
            }
        ],
        simplify: (tree, [a]) =>
            a.type === "call" && a.callee.name === "negate"
                ? a.arguments[0]
                : undefined,
    },

    positive: {
        structural: true,
        syntax: { symbol: "+", prefix: { precedence: 25 } },
        evaluate: (a) => a,
        derivative: ([x], [dx]) => dx,
        template: { wgsl: "{0}", math: "{0}" },
        mathClass: "pass",
        canonical: "sum",
        terms: "pass",
        factors: "pass",
        cases: [
            /* unary plus is the identity everywhere, so it accepts
            anything as-is (and keeps the exact types exact) */
            { arguments: ["same"], returns: "arguments", evaluate: (a) => a },
        ],
        simplify: (tree, [a]) => a,
    },
});
