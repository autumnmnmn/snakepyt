/* domains — value domains beyond float

a domain (the contract is documented with makeDomain in autodiff.js)
fixes what values a tree operates on: fill reads literals and constants
onto them, the rewrite passes fold and cancel through them,
differentiate's recipes build with their arithmetic, and codegen
renders their literals. two provided here:

- complexDomain: the complexes, values carried by the Complex class of
  $math/complex. the holomorphic subset of the vocabulary — everything
  analytic extends, while the non-holomorphic functions (abs, sign,
  floor/ceil/round/trunc/fract, min/max/clamp/saturate, atan2, the
  order comparisons, step/smoothstep) are simply absent: parsing one
  fails at fill, differentiating one never arises. differentiation is
  unchanged — the chain rules of a field — and the derivative is a
  single complex tree (no Wirtinger calculus; there is no conj or arg
  to differentiate through). wgsl renders values as vec2f with
  complex_* helper calls — $paste(shared/complex.wgsl) supplies them —
  and equality as all()/any() since vec2f == is componentwise.

- pointwiseDomain(size): fixed-size vectors with componentwise
  arithmetic, values carried as plain number arrays. the full float
  vocabulary lifts componentwise (order comparisons excepted — only
  equality is meaningfully a boolean), so this is the quickest mode to
  write shaders in: rgb colors, 2d points, any per-channel math.
  literals render as vecNf (sizes 2–4 for wgsl) and the stock infix
  templates apply unchanged. */

import { Complex } from "../complex.js";
import {
    floatDomain,
    floatOps,
    makeDomain,
    recipes,
} from "./autodiff.js";
import { constantValue } from "./nodes.js";
import { formatFloat, formatMathNumber } from "./codegen.js";

const liftComplex = (value) =>
    value instanceof Complex ? value : Complex.cart(value, 0);

const complexOps = {
    plus: (a, b) => liftComplex(a).add(liftComplex(b)),
    minus: (a, b) => liftComplex(a).sub(liftComplex(b)),
    multiply: (a, b) => liftComplex(a).mul(liftComplex(b)),
    divide: (a, b) => liftComplex(a).div(liftComplex(b)),
    power: (a, b) => liftComplex(a).pow(liftComplex(b)),
    pow: (a, b) => liftComplex(a).pow(liftComplex(b)),
    negate: (a) => liftComplex(a).neg(),
    positive: (a) => a,
    equal: (a, b) => {
        const left = liftComplex(a);
        const right = liftComplex(b);

        return left.re === right.re && left.im === right.im;
    },
    notEqual: (a, b) => !complexOps.equal(a, b),
    and: (a, b) => a && b,
    or: (a, b) => a || b,
    not: (a) => !a,
    sqrt: (a) => liftComplex(a).sqrt(),
    inverseSqrt: (a) => liftComplex(a).sqrt().inv(),
    exp: (a) => liftComplex(a).exp(),
    exp2: (a) => liftComplex(a).scale(Math.LN2).exp(),
    log: (a) => liftComplex(a).log(),
    log2: (a) => liftComplex(a).log().scale(1 / Math.LN2),
    sin: (a) => liftComplex(a).sin(),
    cos: (a) => liftComplex(a).cos(),
    tan: (a) => liftComplex(a).tan(),
    sinh: (a) => liftComplex(a).sinh(),
    cosh: (a) => liftComplex(a).cosh(),
    tanh: (a) => liftComplex(a).tanh(),
    mix: (x, y, a) =>
        liftComplex(x)
            .mul(liftComplex(1).sub(liftComplex(a)))
            .add(liftComplex(y).mul(liftComplex(a))),
    radians: (a) => liftComplex(a).scale(Math.PI / 180),
    degrees: (a) => liftComplex(a).scale(180 / Math.PI),
};

const complexWgsl = (name, args) =>
    `complex_${name}(${args.map((i) => `{${i}}`).join(", ")})`;

/* d/dz a^b over the complexes. a constant exponent takes the stock
path; anything else lifts a^b = exp(b·log a), giving the general rule
a^b·(b·a′/a + b′·log a) — which also covers the constant base, once
simplify clears the dead term. a variable base with a variable
exponent, rejected over the reals, differentiates fine here. */

const complexPowerDerivative = (args, derivatives, builders) => {
    const [base, exponent] = args;
    const [dBase, dExponent] = derivatives;

    if (constantValue(exponent) !== undefined) {
        return recipes.power(args, derivatives, builders);
    }

    return builders.multiply(
        builders.power(base, exponent),
        builders.plus(
            builders.multiply(exponent, builders.divide(dBase, base)),
            builders.multiply(dExponent, builders.apply("log", base))
        )
    );
};

/* vec2f arithmetic is native in wgsl for + - and unary -, so only the
operations with complex-specific spellings override their templates.
the helpers live in shared/complex.wgsl. */

const complexOverrides = {
    multiply: { template: { wgsl: complexWgsl("mul", [0, 1]) } },
    divide: { template: { wgsl: complexWgsl("div", [0, 1]) } },
    power: {
        derivative: complexPowerDerivative,
        template: { wgsl: complexWgsl("pow", [0, 1]) },
    },
    pow: {
        derivative: complexPowerDerivative,
        template: { wgsl: complexWgsl("pow", [0, 1]) },
    },
    sqrt: { template: { wgsl: complexWgsl("sqrt", [0]) } },
    inverseSqrt: { template: { wgsl: complexWgsl("inverseSqrt", [0]) } },
    exp: { template: { wgsl: complexWgsl("exp", [0]) } },
    exp2: { template: { wgsl: complexWgsl("exp2", [0]) } },
    log: { template: { wgsl: complexWgsl("log", [0]) } },
    log2: { template: { wgsl: complexWgsl("log2", [0]) } },
    sin: { template: { wgsl: complexWgsl("sin", [0]) } },
    cos: { template: { wgsl: complexWgsl("cos", [0]) } },
    tan: { template: { wgsl: complexWgsl("tan", [0]) } },
    sinh: { template: { wgsl: complexWgsl("sinh", [0]) } },
    cosh: { template: { wgsl: complexWgsl("cosh", [0]) } },
    tanh: { template: { wgsl: complexWgsl("tanh", [0]) } },
    mix: { template: { wgsl: complexWgsl("mix", [0, 1, 2]) } },
    equal: { template: { wgsl: "all({0} == {1})" } },
    notEqual: { template: { wgsl: "any({0} != {1})" } },
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

export const complexDomain = makeDomain({
    name: "complex",
    ops: complexOps,
    overrides: complexOverrides,
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
    literalEqual: (a, b) => complexOps.equal(a, b),
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
    crossReduce: (num, den) => liftComplex(num).div(liftComplex(den)),
    renderNumber: {
        wgsl: (node) => {
            const z = liftComplex(node.value);

            return `vec2f(${formatFloat(z.re)}, ${formatFloat(z.im)})`;
        },
        math: (node) =>
            node.name !== undefined ? node.name : formatMathComplex(node),
    },
});

export function pointwiseDomain(size) {
    const lift = (value) =>
        Array.isArray(value) ? value : new Array(size).fill(value);

    const ops = {
        equal: (a, b) => {
            const left = lift(a);
            const right = lift(b);

            return left.every((component, i) => component === right[i]);
        },
        and: (a, b) => a && b,
        or: (a, b) => a || b,
        not: (a) => !a,
    };

    ops.notEqual = (a, b) => !ops.equal(a, b);

    // the order comparisons have no boolean meaning componentwise,
    // and select's condition is a scalar boolean; everything else in
    // the float vocabulary lifts
    const excluded = new Set([
        "less",
        "lessEqual",
        "greater",
        "greaterEqual",
        "equal",
        "notEqual",
        "and",
        "or",
        "not",
        "select",
    ]);

    for (const [name, floatOp] of Object.entries(floatOps)) {
        if (excluded.has(name)) {
            continue;
        }

        ops[name] = (...args) => {
            const lifted = args.map(lift);

            return Array.from({ length: size }, (_, i) =>
                floatOp(...lifted.map((vector) => vector[i]))
            );
        };
    }

    const probe = (predicate) => (value) => lift(value).every(predicate);

    return makeDomain({
        name: `pointwise-${size}`,
        ops,
        overrides: {
            equal: { template: { wgsl: "all({0} == {1})" } },
            notEqual: { template: { wgsl: "any({0} != {1})" } },
        },
        lift,
        constant(value, name) {
            if (Array.isArray(value)) {
                if (value.length !== size || value.some((x) => Number.isNaN(Number(x)))) {
                    throw new Error(
                        `Constant '${name}' is not a ${size}-component numeric vector`
                    );
                }

                return value.map(Number);
            }

            const number = Number(value);

            if (Number.isNaN(number)) {
                throw new Error(
                    `Constant '${name}' has a non-numeric value '${value}'`
                );
            }

            return lift(number);
        },
        isFinite: (value) => lift(value).every(Number.isFinite),
        literalEqual: (a, b) => ops.equal(a, b),
        asReal: (value) => {
            const components = lift(value);

            // a splat acts as its single component: x^[2,2] is x^2
            return components.every((component) => component === components[0])
                ? components[0]
                : undefined;
        },
        isZero: probe((component) => component === 0),
        isOne: probe((component) => component === 1),
        isMinusOne: probe((component) => component === -1),
        splitSign: (value) => ({ sign: 1, value }),
        crossReduce: (numerator, denominator) => {
            const numerators = lift(numerator);
            const denominators = lift(denominator);
            const quotient = numerators.map((component, i) =>
                floatDomain.crossReduce(component, denominators[i])
            );

            return quotient.includes(undefined) ? undefined : quotient;
        },
        renderNumber: {
            wgsl: (node) =>
                `vec${size}f(${lift(node.value).map(formatFloat).join(", ")})`,
            math: (node) =>
                node.name !== undefined
                    ? node.name
                    : `(${lift(node.value)
                          .map((component) =>
                              formatMathNumber({
                                  value: component,
                                  index: node.index,
                              })
                          )
                          .join(", ")})`,
        },
    });
}
