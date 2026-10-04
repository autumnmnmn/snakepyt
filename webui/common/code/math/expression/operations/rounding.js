/* rounding — floor, ceil, round, trunc, fract. piecewise-constant
almost everywhere, so their derivatives are zero (fract's is one). */

import { integerType, rationalType } from "../types/index.js";
import { define, zeroDerivative } from "./helpers.js";

/* the rational cases round to an exact bigint (fract stays
rational) — the exact tower's rounding never lowers to a double. */

const toInteger = (evaluate) => ({
    arguments: [rationalType],
    returns: integerType,
    evaluate,
});

export const rounding = define({
    floor: {
        evaluate: Math.floor,
        derivative: zeroDerivative,
        cases: [toInteger((a) => a.floor())]
    },

    ceil: {
        evaluate: Math.ceil,
        derivative: zeroDerivative,
        cases: [toInteger((a) => a.ceil())]
    },

    round: {
        evaluate: (x) => Math.sign(x) * Math.round(Math.abs(x)),
        derivative: zeroDerivative,
        cases: [toInteger((a) => a.round())]
    },

    trunc: {
        evaluate: Math.trunc,
        derivative: zeroDerivative,
        cases: [toInteger((a) => a.trunc())]
    },

    fract: {
        evaluate: (x) => x - Math.floor(x),
        derivative: ([x], [dx]) => dx,
        cases: [
            {
                arguments: [rationalType],
                returns: rationalType,
                evaluate: (a) => a.fract(),
            },
        ]
    },
});
