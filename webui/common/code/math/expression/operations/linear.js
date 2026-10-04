/* linear — the vector and matrix functions: dot, cross, length,
normalize, transpose, determinant, inverse. vectors are fixed-size
number arrays (wgsl vecNf), matrices arrays of row arrays (wgsl
matCxRf — C columns of R-vectors). differentiation is with respect to
a scalar, so a vector or matrix derivative is componentwise, and the
recipes are the usual ones: product rules for dot and cross, the
quotient rule for normalize, Jacobi's formula for the inverse. */

import { floatType, tensorType, vectorType } from "../types/index.js";
import { arithmetic } from "./arithmetic.js";
import { divideDerivative, products } from "./products.js";
import {
    crossValues,
    define,
    determinantValue,
    dotMatch,
    dotValues,
    entryBinary,
    entryUnary,
    floatVectorMatch,
    inverseValue,
    lengthValue,
    normalizeValue,
    squareMatch,
    transposeValue,
} from "./helpers.js";

/* the entry arithmetic for the linear operations' value-level
procedures. */

const entryMul = entryBinary(products.multiply, (x, y) => x * y);
const entryDiv = entryBinary(products.divide, (x, y) => x / y);
const entryAdd = entryBinary(arithmetic.plus, (x, y) => x + y);
const entrySub = entryBinary(arithmetic.minus, (x, y) => x - y);
const entryNeg = entryUnary(arithmetic.negate, (x) => -x);

/* the length recipe, shared by length and normalize. */

const lengthDerivative = ([v], [dv], builders) =>
    builders.divide(
        builders.apply("dot", v, dv),
        builders.apply("length", v)
    );

export const linear = define({
    dot: {
        cases: [
            {
                match: dotMatch,
                evaluate: (a, b) => dotValues(a, b, entryAdd, entryMul),
                derivative: ([u, v], [du, dv], builders) =>
                    builders.plus(
                        builders.apply("dot", du, v),
                        builders.apply("dot", u, dv)
                    ),
            },
        ],
    },

    cross: {
        cases: [
            {
                arguments: [vectorType(3), vectorType(3)],
                returns: vectorType(3),
                evaluate: crossValues,
                derivative: ([u, v], [du, dv], builders) =>
                    builders.plus(
                        builders.apply("cross", du, v),
                        builders.apply("cross", u, dv)
                    ),
            },
        ],
    },

    length: {
        cases: [
            {
                match: floatVectorMatch(floatType),
                evaluate: lengthValue,
                derivative: lengthDerivative,
            },
        ],
    },

    normalize: {
        cases: [
            {
                match: floatVectorMatch((v) => v),
                evaluate: normalizeValue,
                derivative: ([v], [dv], builders) =>
                    divideDerivative(
                        [v, builders.apply("length", v)],
                        [dv, lengthDerivative([v], [dv], builders)],
                        builders
                    ),
            },
        ],
    },

    transpose: {
        template: { math: "{{0}}^{T}" },
        cases: [
            {
                arguments: ["matrix"],
                returns: ([a]) => tensorType([a.cols, a.rows], a.entry),
                evaluate: transposeValue,
                derivative: ([a], [da], builders) =>
                    builders.apply("transpose", da),
            },
        ],
    },

    determinant: {
        cases: [
            {
                match: squareMatch((a) => a.entry),
                evaluate: (a) => determinantValue(a, entryAdd, entrySub, entryMul, entryNeg),
            },
        ],
    },

    /* wgsl has no inverse builtin: the wgsl target renders the plain
    call (a shader supplies its own helper, the way complex_* helpers
    come from $paste(shared/complex.wgsl)). */

    inverse: {
        template: { math: "{{0}}^{{-1}}" },
        cases: [
            {
                match: squareMatch((a) => a),
                evaluate: (a) =>
                    inverseValue(a, entryAdd, entrySub, entryMul, entryDiv, entryNeg),
                derivative: ([a], [da], builders) =>
                    builders.negate(
                        builders.multiply(
                            builders.multiply(builders.apply("inverse", a), da),
                            builders.apply("inverse", a)
                        )
                    ),
            },
        ],
    },
});
