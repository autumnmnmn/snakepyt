/* shaping — min, max, clamp, saturate, mix, step, smoothstep: the
shader shaping vocabulary. real-only (no order on the complexes);
the derivatives are the usual piecewise ones, min and max written
through sign so the recipes compose every type the functions accept. */

import { Rational } from "../../rational.js";
import { integerType, naturalType, rationalType } from "../types/index.js";
import { complex, complexWgsl, define, liftComplex, zeroDerivative } from "./helpers.js";

/* the exact-order cases of the shapings: naturals and integers as
bigints, rationals by compare. */

const rationalMin = (a, b) => (a.compare(b) <= 0 ? a : b);
const rationalMax = (a, b) => (a.compare(b) >= 0 ? a : b);

const exactOrder = (arity, bigintEvaluate, rationalEvaluate) =>
    [naturalType(), integerType, rationalType].map((type) => ({
        arguments: new Array(arity).fill(type),
        returns: "arguments",
        evaluate:
            type === rationalType ? rationalEvaluate : bigintEvaluate,
    }));

/* the min/max recipes, shared by min, max, clamp, and saturate. */

const minDerivative = ([x, y], [dx, dy], builders) =>
    builders.divide(
        builders.minus(
            builders.plus(dx, dy),
            builders.multiply(
                builders.apply("sign", builders.minus(x, y)),
                builders.minus(dx, dy)
            )
        ),
        builders.literal(2, x)
    );

const maxDerivative = ([x, y], [dx, dy], builders) =>
    builders.divide(
        builders.plus(
            builders.plus(dx, dy),
            builders.multiply(
                builders.apply("sign", builders.minus(x, y)),
                builders.minus(dx, dy)
            )
        ),
        builders.literal(2, x)
    );

const clampDerivative = ([x, low, high], [dx, dLow, dHigh], builders) =>
    minDerivative(
        [builders.apply("max", x, low), high],
        [maxDerivative([x, low], [dx, dLow], builders), dHigh],
        builders
    );

export const shaping = define({
    min: {
        evaluate: Math.min,
        derivative: minDerivative,
        cases: exactOrder(2, 
            (a, b) => (a < b ? a : b),
            (a, b) => rationalMin(a, b)
        )
    },

    max: {
        evaluate: Math.max,
        derivative: maxDerivative,
        cases: exactOrder(2, 
            (a, b) => (a > b ? a : b),
            (a, b) => rationalMax(a, b)
        )
    },

    clamp: {
        evaluate: (x, low, high) => Math.min(Math.max(x, low), high),
        derivative: clampDerivative,
        cases: exactOrder(3, 
            (x, low, high) => (x < low ? low : x > high ? high : x),
            (x, low, high) => rationalMin(rationalMax(x, low), high)
        )
    },

    saturate: {
        evaluate: (x) => Math.min(Math.max(x, 0), 1),
        derivative: ([x], [dx], builders) =>
            clampDerivative(
                [x, builders.literal(0, x), builders.literal(1, x)],
                [dx, builders.literal(0, x), builders.literal(0, x)],
                builders
            ),
        cases: [
            {
                arguments: [rationalType],
                returns: rationalType,
                evaluate: (x) => rationalMin(rationalMax(x, Rational.zero), Rational.one),
            },
        ]
    },

    mix: {
        evaluate: (x, y, a) => x * (1 - a) + y * a,
        derivative: ([x, y, amount], [dx, dy, dAmount], builders) =>
            builders.plus(
                dx,
                builders.plus(
                    builders.multiply(amount, builders.minus(dy, dx)),
                    builders.multiply(dAmount, builders.minus(y, x))
                )
            ),
        cases: [
            complex(
                (x, y, a) =>
                    liftComplex(x)
                        .mul(liftComplex(1).sub(liftComplex(a)))
                        .add(liftComplex(y).mul(liftComplex(a))),
                { template: { wgsl: complexWgsl("mix", [0, 1, 2]) } }
            ),
            {
                arguments: [rationalType, rationalType, rationalType],
                returns: "arguments",
                evaluate: (x, y, a) => x.mul(Rational.one.sub(a)).add(y.mul(a)),
            },
        ],
    },

    step: {
        evaluate: (edge, x) => (x < edge ? 0 : 1),
        derivative: zeroDerivative,
        cases: exactOrder(2, 
            (edge, x) => (x < edge ? 0n : 1n),
            (edge, x) => (x.compare(edge) < 0 ? Rational.zero : Rational.one)
        )
    },

    smoothstep: {
        evaluate: (low, high, x) => {
            const t = Math.min(Math.max((x - low) / (high - low), 0), 1);

            return t * t * (3 - 2 * t);
        },
        cases: [
            {
                arguments: [rationalType, rationalType, rationalType],
                returns: "arguments",
                evaluate: (low, high, x) => {
                    const t = rationalMin(
                        rationalMax(x.sub(low).div(high.sub(low)), Rational.zero),
                        Rational.one
                    );

                    return t.mul(t).mul(Rational.of(3).sub(Rational.of(2).mul(t)));
                },
            },
        ],
        derivative: ([low, high, x], [dLow, dHigh, dx], builders) => {
            const span = builders.minus(high, low);
            const t = builders.divide(builders.minus(x, low), span);
            const dt = builders.divide(
                builders.minus(
                    builders.multiply(builders.minus(dx, dLow), span),
                    builders.multiply(
                        builders.minus(x, low),
                        builders.minus(dHigh, dLow)
                    )
                ),
                builders.square(span)
            );
            const window = builders.multiply(
                builders.apply("step", low, x),
                builders.minus(builders.literal(1, x), builders.apply("step", high, x))
            );

            return builders.multiply(
                window,
                builders.multiply(
                    builders.multiply(builders.literal(6, x), builders.multiply(t, builders.minus(builders.literal(1, x), t))),
                    dt
                )
            );
        }
    },
});
