/* products — the different notions of "product", each its own
operation. the `*` and `/` syntax never names one directly: fill and
the builders dispatch on the operand types (multiplyDispatch /
divideDispatch below).

- multiply — the ring product of scalars (float, complex).
- scale — the scalar ring acting on a tensor: scalar·vector,
  vector·scalar, scalar·matrix, matrix·scalar, and the same for
  higher tensors. the scalar stays a scalar (it is not the splat
  product 2⊙[x,x,...]; it is 2·x, the module action).
- pointwiseMultiply / pointwiseDivide — the product-ring (Hadamard)
  operations on vectors: entrywise, commutative, and canonicalize
  flattens them into the n-ary pointwiseProduct form.
- matmul — the matrix-ring product: mat·mat, mat·vec, vec·mat — the
  product of linear maps and their application. it does not commute,
  so it never flattens: it carries no canonical tag, and a matmul
  chain stays associated exactly as written.
- dot and cross are not ring products at all (an inner product and a
  lie bracket); they live with the other vector functions in
  linear.js.

division by a scalar is divide's own (tensor, scalar) case —
scaling by the reciprocal, rendered (u / 2.0) — while vector/vector
and scalar/vector division are pointwiseDivide. */

import { numberNode } from "../semantics/nodes.js";
import {
    integerType,
    isMatrix,
    isRingScalar,
    isTensor,
    isVector,
    naturalType,
    octonionType,
    quaternionType,
    rationalType,
    typedCallNode,
    typeOf,
    valueApply,
} from "../types/index.js";
import { arithmetic } from "./arithmetic.js";
import {
    complex,
    complexWgsl,
    define,
    entryBinary,
    liftComplex,
    mapEntries,
    matmulMatch,
    matmulValues,
    matvecMatch,
    matvecValues,
    modularMatch,
    modWgsl,
    scaleMatch,
    vecmatMatch,
    vecmatValues,
} from "./helpers.js";

/* the quotient recipe, shared by divide and by normalize (a vector
over its length). */

export const divideDerivative = ([x, y], [dx, dy], builders) =>
    builders.divide(
        builders.minus(builders.multiply(dx, y), builders.multiply(x, dy)),
        builders.multiply(y, y)
    );

/* the quotient recipe over a skew field, order-preserving:
d(x/y) = dx/y − (x/y)·(dy/y). the quaternion and octonion divide
cases carry it. */

export const noncommutativeDivideDerivative = ([x, y], [dx, dy], builders) =>
    builders.minus(
        builders.divide(dx, y),
        builders.divide(builders.multiply(builders.divide(x, y), dy), y)
    );

/* the product rule, order-preserving: right for matmul's
noncommutative products and for every commutative one besides. shared
by multiply, scale, pointwiseMultiply, and matmul. */

const productDerivative = ([x, y], [dx, dy], builders) =>
    builders.plus(builders.multiply(dx, y), builders.multiply(x, dy));

/* pulling a constant factor out of a nested product: 2 * (3 * x) is
6 * x, in either nesting or argument order. shared by multiply and
pointwiseMultiply (over vectors the constants are splats and fold
entrywise). the operation is the family's own, so the fold uses its
evaluate. */

function foldProductConstants(operation, a, b, tree, tools) {
    for (const [factor, product] of [[a, b], [b, a]]) {
        if (
            !tools.isLiteral(factor) ||
            product.type !== "call" ||
            product.callee.name !== operation.name
        ) {
            continue;
        }

        const [x, y] = product.arguments;

        for (const [constant, rest] of [[x, y], [y, x]]) {
            if (tools.isLiteral(constant)) {
                return typedCallNode(
                    operation,
                    [
                        numberNode(
                            valueApply(operation, factor.value, constant.value),
                            tree.index
                        ),
                        rest,
                    ],
                    tree.index,
                    tree.length
                );
            }
        }
    }

    return null;
}

/* the identity/annihilator rules of a commutative product: 0·x is 0,
1·x is x, -1·x is -x. multiply and pointwiseMultiply share it (over
vectors the splat one is the Hadamard identity). scale and matmul
carry their own below: their two sides play different roles. */

const productSimplify = (tree, [a, b], tools) => {
    if (tools.isZero(a) || tools.isZero(b)) {
        return tools.zero(tree);
    }

    if (tools.isOne(a)) return b;
    if (tools.isOne(b)) return a;
    if (tools.isMinusOne(a)) return tools.negate(b, tree.index, tree.length);
    if (tools.isMinusOne(b)) return tools.negate(a, tree.index, tree.length);

    return undefined;
};

/* scale: the identity rules belong to the scalar side alone — 1·x is
x and -1·x is -x, but a splat-one aggregate is not an identity for
scaling. */

const scaleSimplify = (tree, [a, b], tools) => {
    if (tools.isZero(a) || tools.isZero(b)) {
        return tools.zero(tree);
    }

    const aScalar = isRingScalar(typeOf(a));
    const [scalar, aggregate] = aScalar ? [a, b] : [b, a];

    if (tools.isOne(scalar)) return aggregate;

    if (tools.isMinusOne(scalar)) {
        return tools.negate(aggregate, tree.index, tree.length);
    }

    return undefined;
};

/* matmul: the identity MATRIX is the one, on whichever side it
appears; the one-vector is no identity here (matmul(A, [1,1]) is the
column sums, not A). */

const matmulSimplify = (tree, [a, b], tools) => {
    if (tools.isZero(a) || tools.isZero(b)) {
        return tools.zero(tree);
    }

    if (isMatrix(typeOf(a))) {
        if (tools.isOne(a)) return b;
        if (tools.isMinusOne(a)) return tools.negate(b, tree.index, tree.length);
    }

    if (isMatrix(typeOf(b))) {
        if (tools.isOne(b)) return a;
        if (tools.isMinusOne(b)) return tools.negate(a, tree.index, tree.length);
    }

    return undefined;
};


/* which operation `*` means for these operands: the ring product on
scalars, the module action on a scalar and a tensor, the Hadamard
product on two vectors, and the matrix product wherever a matrix
meets a vector or matrix. anything else (bools, complex against
vector, mismatched kinds, higher tensors) falls through to multiply,
whose cases raise the type error. */

export function multiplyDispatch(a, b) {
    const left = typeOf(a);
    const right = typeOf(b);

    if (isRingScalar(left) && isRingScalar(right)) {
        return products.multiply;
    }

    if (
        (isRingScalar(left) && isTensor(right)) ||
        (isRingScalar(right) && isTensor(left))
    ) {
        return products.scale;
    }

    if (isVector(left) && isVector(right)) {
        return products.pointwiseMultiply;
    }

    if (isMatrix(left) || isMatrix(right)) {
        return products.matmul;
    }

    return products.multiply;
}

/* and `/`: scalar division, pointwise division on two vectors (a
scalar numerator splats), and divide's own scaling case for a
tensor over a scalar. */

export function divideDispatch(a, b) {
    const left = typeOf(a);
    const right = typeOf(b);

    if (isRingScalar(left) && isRingScalar(right)) {
        return products.divide;
    }

    if (isVector(right)) {
        return products.pointwiseDivide;
    }

    if (isTensor(left) && isRingScalar(right)) {
        return products.divide;
    }

    return products.divide;
}

export const products = define({
    multiply: {
        structural: true,
        syntax: { symbol: "*", binary: { precedence: 20, associativity: "left" } },
        evaluate: (a, b) => a * b,
        derivative: productDerivative,
        template: { wgsl: "({0} * {1})", math: "{0} dot {1}" },
        mathClass: "multiplicative",
        mathParens: { any: ["additive"] },
        canonical: "product",
        factors: "expand",
        cases: [
            complex((a, b) => liftComplex(a).mul(liftComplex(b)), {
                template: { wgsl: complexWgsl("mul", [0, 1]) },
            }),
            {
                arguments: [naturalType(), naturalType()],
                returns: "arguments",
                evaluate: (a, b) => a * b,
            },
            {
                arguments: [integerType, integerType],
                returns: "arguments",
                evaluate: (a, b) => a * b,
            },
            {
                match: modularMatch((modulus) => ({
                    evaluate: (a, b) => a.mul(b),
                    template: { wgsl: modWgsl(modulus, "({0} * {1})") },
                })),
            },
            {
                arguments: [rationalType, rationalType],
                returns: "arguments",
                evaluate: (a, b) => a.mul(b),
            },
            /* the skew products: multiplication does not commute over
            the quaternions (nor the octonions), so these never join a
            canonical product — the chain stays associated as written —
            and the constant-fold rewrite (which reorders factors) is
            restricted to the identity rules */
            {
                arguments: [quaternionType, quaternionType],
                returns: quaternionType,
                evaluate: (a, b) => a.mul(b),
                canonical: null,
                factors: null,
                template: { wgsl: "quaternion_mul({0}, {1})" },
                simplify: productSimplify,
            },
            {
                arguments: [octonionType, octonionType],
                returns: octonionType,
                evaluate: (a, b) => a.mul(b),
                canonical: null,
                factors: null,
                simplify: productSimplify,
            },
        ],
        simplify: (tree, [a, b], tools) => {
            const simplified = productSimplify(tree, [a, b], tools);

            if (simplified !== undefined) {
                return simplified;
            }

            const folded = foldProductConstants(products.multiply, a, b, tree, tools);

            return folded ? tools.resimplify(folded) : undefined;
        },
    },

    scale: {
        derivative: productDerivative,
        template: { wgsl: "({0} * {1})", math: "{0} dot {1}" },
        mathClass: "multiplicative",
        mathParens: { any: ["additive"] },
        cases: [
            {
                match: scaleMatch,
                evaluate: (a, b) => {
                    // one side is the scalar; scale entrywise
                    const [s, v] = Array.isArray(a) && !Array.isArray(b) ? [b, a] : [a, b];

                    return mapEntries(v, (x) => entryMul(s, x));
                },
            },
        ],
        simplify: (tree, [a, b], tools) => {
            const simplified = scaleSimplify(tree, [a, b], tools);

            if (simplified !== undefined) {
                return simplified;
            }

            // nested scalings fold their scalars: s·(t·x) is (s·t)·x
            for (const [scalar, scaled] of [[a, b], [b, a]]) {
                if (
                    tools.isLiteral(scalar) &&
                    scaled.type === "call" &&
                    scaled.callee.name === "scale"
                ) {
                    const [x, y] = scaled.arguments;
                    const xScalar = isRingScalar(typeOf(x));
                    const [inner, rest] = xScalar ? [x, y] : [y, x];

                    if (tools.isLiteral(inner)) {
                        return tools.resimplify(
                            typedCallNode(
                                products.scale,
                                [
                                    numberNode(
                                        valueApply(products.multiply, scalar.value, inner.value),
                                        tree.index
                                    ),
                                    rest,
                                ],
                                tree.index,
                                tree.length
                            )
                        );
                    }
                }
            }

            return undefined;
        },
    },

    pointwiseMultiply: {
        derivative: productDerivative,
        template: { wgsl: "({0} * {1})", math: "{0} dot {1}" },
        mathClass: "multiplicative",
        mathParens: { any: ["additive"] },
        canonical: "product",
        factors: "expand",
        cases: [
            {
                arguments: ["vector", "vector"],
                returns: "arguments",
                evaluate: (a, b) => a.map((x, i) => entryMul(x, b[i])),
            },
        ],
        simplify: (tree, [a, b], tools) => {
            const simplified = productSimplify(tree, [a, b], tools);

            if (simplified !== undefined) {
                return simplified;
            }

            const folded = foldProductConstants(products.pointwiseMultiply, a, b, tree, tools);

            return folded ? tools.resimplify(folded) : undefined;
        },
    },

    pointwiseDivide: {
        derivative: divideDerivative,
        template: { wgsl: "({0} / {1})", math: "{{0}}/{{1}}" },
        canonical: "product",
        factors: "divide",
        cases: [
            {
                arguments: ["vector", "vector"],
                returns: "arguments",
                evaluate: (a, b) => a.map((x, i) => entryDiv(x, b[i])),
            },
        ],
        simplify: (tree, [a, b], tools) => {
            if (tools.isZero(a)) {
                return tools.zero(tree);
            }

            if (tools.isOne(b)) return a;
            if (tools.isMinusOne(b)) return tools.negate(a, tree.index, tree.length);

            if (tools.treesEqual(a, b)) {
                return tools.one(tree);
            }

            return undefined;
        },
    },

    divide: {
        structural: true,
        syntax: { symbol: "/", binary: { precedence: 20, associativity: "left" } },
        evaluate: (a, b) => a / b,
        derivative: divideDerivative,
        template: { wgsl: "({0} / {1})", math: "{{0}}/{{1}}" },
        canonical: "product",
        factors: "divide",
        cases: [
            complex((a, b) => liftComplex(a).div(liftComplex(b)), {
                template: { wgsl: complexWgsl("div", [0, 1]) },
            }),
            /* a tensor over a scalar: scaling by the reciprocal.
            it does not join a canonical product (the n-ary forms are
            one family each, and this is the scalar family's operation
            returning a tensor) — the case opts out, so u/2 stays
            divide(u, 2) and renders (u / 2.0). */
            {
                match: ([v, s]) =>
                    isTensor(v) && isRingScalar(s)
                        ? { returns: v }
                        : null,
                evaluate: (v, s) => mapEntries(v, (x) => entryDiv(x, s)),
                canonical: null,
                factors: null,
            },
            /* the rationals are a field: their division is exact and
            keeps the canonical product tags (2*x/4 is (1/2)*x, exactly) */
            {
                arguments: [rationalType, rationalType],
                returns: "arguments",
                evaluate: (a, b) => a.div(b),
            },
            /* modular division is partial (the divisor may not be
            invertible), so it stays out of the canonical product: no
            x·y^-1 forms. wgsl renders the plain call — a shader
            supplies its own helper */
            {
                match: modularMatch((modulus) => ({
                    evaluate: (a, b) => a.div(b),
                    canonical: null,
                    factors: null,
                    template: { wgsl: undefined },
                })),
            },
            {
                arguments: [quaternionType, quaternionType],
                returns: quaternionType,
                evaluate: (a, b) => a.div(b),
                canonical: null,
                factors: null,
                template: { wgsl: "quaternion_div({0}, {1})" },
                derivative: noncommutativeDivideDerivative,
            },
            {
                arguments: [octonionType, octonionType],
                returns: octonionType,
                evaluate: (a, b) => a.div(b),
                canonical: null,
                factors: null,
                derivative: noncommutativeDivideDerivative,
            },
        ],
        simplify: (tree, [a, b], tools) => {
            if (tools.isZero(a)) {
                return tools.zero(tree);
            }

            if (tools.isOne(b)) return a;
            if (tools.isMinusOne(b)) return tools.negate(a, tree.index, tree.length);

            if (tools.treesEqual(a, b)) {
                return tools.one(tree);
            }

            return undefined;
        },
    },

    matmul: {
        template: { wgsl: "({0} * {1})", math: "{0} dot {1}" },
        mathClass: "multiplicative",
        mathParens: { any: ["additive"] },
        cases: [
            {
                match: matmulMatch,
                evaluate: (a, b) => matmulValues(a, b, entryAdd, entryMul),
                derivative: productDerivative,
            },
            {
                match: matvecMatch,
                evaluate: (a, b) => matvecValues(a, b, entryAdd, entryMul),
                derivative: productDerivative,
            },
            {
                match: vecmatMatch,
                evaluate: (a, b) => vecmatValues(a, b, entryAdd, entryMul),
                derivative: productDerivative,
            },
        ],
        simplify: matmulSimplify,
    },
});

/* the value-level entry products: fast JS path on floats, the
operation's own resolved case otherwise. */

const entryMul = entryBinary(products.multiply, (x, y) => x * y);
const entryDiv = entryBinary(products.divide, (x, y) => x / y);
const entryAdd = entryBinary(arithmetic.plus, (x, y) => x + y);
