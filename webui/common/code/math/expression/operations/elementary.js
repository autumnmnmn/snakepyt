/* elementary — abs and sign, the roots, exponentials and logarithms,
the trigonometric and hyperbolic functions and their inverses, and
angle-unit conversion. the holomorphic ones carry complex cases; abs,
sign, the inverse trig/hyperbolic pairs and atan2 are real-only. */

import { Rational } from "../../rational.js";
import { integerType, naturalType, rationalType } from "../types/index.js";
import { complex, complexWgsl, define, liftComplex, zeroDerivative } from "./helpers.js";
import {
    complexPowerDerivative,
    powerDerivative,
    powerSimplify,
} from "./arithmetic.js";

export const elementary = define({
    abs: {
        evaluate: Math.abs,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("sign", x), dx),
        template: { math: "|{0}|" },
        cases: [
            /* an integer's absolute value is a natural */
            {
                arguments: [integerType],
                returns: naturalType(),
                evaluate: (a) => (a < 0n ? -a : a),
            },
            {
                arguments: [rationalType],
                returns: rationalType,
                evaluate: (a) => a.abs(),
            },
        ],
    },

    sign: {
        evaluate: Math.sign,
        derivative: zeroDerivative,
        cases: [
            {
                arguments: [integerType],
                returns: integerType,
                evaluate: (a) => (a < 0n ? -1n : a > 0n ? 1n : 0n),
            },
            {
                arguments: [rationalType],
                returns: rationalType,
                evaluate: (a) => Rational.of(a.sign()),
            },
        ],
    },

    sqrt: {
        evaluate: Math.sqrt,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.multiply(builders.literal(2, x), builders.apply("sqrt", x))
            ),
        template: { math: "{{0}} root 2" },
        cases: [
            complex((a) => liftComplex(a).sqrt(), {
                template: { wgsl: complexWgsl("sqrt", [0]) },
            })
        ],
    },

    inverseSqrt: {
        evaluate: (x) => 1 / Math.sqrt(x),
        derivative: ([x], [dx], builders) =>
            builders.negate(
                builders.divide(
                    dx,
                    builders.multiply(
                        builders.literal(2, x),
                        builders.power(x, builders.literal(1.5, x))
                    )
                )
            ),
        cases: [
            complex((a) => liftComplex(a).sqrt().inv(), {
                template: { wgsl: complexWgsl("inverseSqrt", [0]) },
            })
        ],
    },

    exp: {
        evaluate: Math.exp,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("exp", x), dx),
        cases: [
            complex((a) => liftComplex(a).exp(), {
                template: { wgsl: complexWgsl("exp", [0]) },
            })
        ],
    },

    exp2: {
        evaluate: (x) => 2 ** x,
        derivative: ([x], [dx], builders) =>
            builders.multiply(
                builders.multiply(builders.apply("exp2", x), builders.literal(Math.LN2, x)),
                dx
            ),
        cases: [
            complex((a) => liftComplex(a).scale(Math.LN2).exp(), {
                template: { wgsl: complexWgsl("exp2", [0]) },
            })
        ],
    },

    log: {
        evaluate: Math.log,
        derivative: ([x], [dx], builders) => builders.divide(dx, x),
        cases: [
            complex((a) => liftComplex(a).log(), {
                template: { wgsl: complexWgsl("log", [0]) },
            })
        ],
    },

    log2: {
        evaluate: Math.log2,
        derivative: ([x], [dx], builders) =>
            builders.divide(dx, builders.multiply(x, builders.literal(Math.LN2, x))),
        cases: [
            complex((a) => liftComplex(a).log().scale(1 / Math.LN2), {
                template: { wgsl: complexWgsl("log2", [0]) },
            })
        ],
    },

    sin: {
        evaluate: Math.sin,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("cos", x), dx),
        cases: [
            complex((a) => liftComplex(a).sin(), {
                template: { wgsl: complexWgsl("sin", [0]) },
            })
        ],
    },

    cos: {
        evaluate: Math.cos,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.negate(builders.apply("sin", x)), dx),
        cases: [
            complex((a) => liftComplex(a).cos(), {
                template: { wgsl: complexWgsl("cos", [0]) },
            })
        ],
    },

    tan: {
        evaluate: Math.tan,
        derivative: ([x], [dx], builders) =>
            builders.divide(dx, builders.square(builders.apply("cos", x))),
        cases: [
            complex((a) => liftComplex(a).tan(), {
                template: { wgsl: complexWgsl("tan", [0]) },
            })
        ],
    },

    asin: {
        evaluate: Math.asin,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.apply(
                    "sqrt",
                    builders.minus(builders.literal(1, x), builders.square(x))
                )
            )
    },

    acos: {
        evaluate: Math.acos,
        derivative: ([x], [dx], builders) =>
            builders.negate(
                builders.divide(
                    dx,
                    builders.apply(
                        "sqrt",
                        builders.minus(builders.literal(1, x), builders.square(x))
                    )
                )
            )
    },

    atan: {
        evaluate: Math.atan,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.plus(builders.literal(1, x), builders.square(x))
            )
    },

    atan2: {
        evaluate: Math.atan2,
        derivative: ([y, x], [dy, dx], builders) =>
            builders.divide(
                builders.minus(builders.multiply(x, dy), builders.multiply(y, dx)),
                builders.plus(builders.square(x), builders.square(y))
            )
    },

    sinh: {
        evaluate: Math.sinh,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("cosh", x), dx),
        cases: [
            complex((a) => liftComplex(a).sinh(), {
                template: { wgsl: complexWgsl("sinh", [0]) },
            })
        ],
    },

    cosh: {
        evaluate: Math.cosh,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("sinh", x), dx),
        cases: [
            complex((a) => liftComplex(a).cosh(), {
                template: { wgsl: complexWgsl("cosh", [0]) },
            })
        ],
    },

    tanh: {
        evaluate: Math.tanh,
        derivative: ([x], [dx], builders) =>
            builders.divide(dx, builders.square(builders.apply("cosh", x))),
        cases: [
            complex((a) => liftComplex(a).tanh(), {
                template: { wgsl: complexWgsl("tanh", [0]) },
            })
        ],
    },

    asinh: {
        evaluate: Math.asinh,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.apply(
                    "sqrt",
                    builders.plus(builders.square(x), builders.literal(1, x))
                )
            )
    },

    acosh: {
        evaluate: Math.acosh,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.apply(
                    "sqrt",
                    builders.minus(builders.square(x), builders.literal(1, x))
                )
            )
    },

    atanh: {
        evaluate: Math.atanh,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.minus(builders.literal(1, x), builders.square(x))
            )
    },

    /* pow is power's user-callable spelling (wgsl's pow matches it);
    they share the derivative and rewrite rules. */

    pow: {
        evaluate: (a, b) => a ** b,
        derivative: powerDerivative,
        template: { math: "{{0}}^{{1}}" },
        cases: [
            complex((a, b) => liftComplex(a).pow(liftComplex(b)), {
                template: { wgsl: complexWgsl("pow", [0, 1]) },
                derivative: complexPowerDerivative,
            })
        ],
        simplify: powerSimplify,
    },

    radians: {
        evaluate: (x) => (x * Math.PI) / 180,
        derivative: ([x], [dx], builders) =>
            builders.multiply(dx, builders.literal(Math.PI / 180, x)),
        cases: [
            // scaling commutes with the vec2f representation, so wgsl's
            // native (componentwise) radians/degrees spell the complex
            // case with no template of their own
            complex((a) => liftComplex(a).scale(Math.PI / 180))
        ],
    },

    degrees: {
        evaluate: (x) => (x * 180) / Math.PI,
        derivative: ([x], [dx], builders) =>
            builders.multiply(dx, builders.literal(180 / Math.PI, x)),
        cases: [
            complex((a) => liftComplex(a).scale(180 / Math.PI))
        ],
    },
});
