/* helpers — the shared machinery the operation definitions are written
with: the case sugar (complex(), componentwise()), the value-level
vector/matrix operations the cases' evaluate hooks share, the case
matchers for shapes no declarative pattern expresses, the define()
that stamps a category's names onto its definitions, and recipes
(zeroDerivative) shared across categories. */

import { Complex } from "../../complex.js";
import { ModularInteger } from "../../modular.js";
import { Octonion } from "../../octonion.js";
import { Quaternion } from "../../quaternion.js";
import { Rational } from "../../rational.js";
import {
    complexType,
    floatType,
    formatFloat,
    isMatrix,
    isRingScalar,
    isTensor,
    isVector,
    joinTypes,
    matrixType,
    tensorType,
    valueApply,
    vectorType,
} from "../types/index.js";

/* exact-tower literals (bigints, rationals, modular integers) coerce
to their nearest double when they meet the complexes */

export const liftComplex = (value) =>
    value instanceof Complex
        ? value
        : Complex.cart(typeof value === "number" ? value : Number(value), 0);

export const complexWgsl = (name, args) =>
    `complex_${name}(${args.map((i) => `{${i}}`).join(", ")})`;

/* shorthand for a function's all-complex case: complex argument
patterns by arity, complex result, the given value-level semantics,
and any specialized fields (a wgsl template, a derivative). the
holomorphic functions extend; the non-holomorphic ones (abs, sign, the
rounding functions, min/max/clamp, atan2, the order comparisons,
step/smoothstep) simply have no complex case, and applying one to a
complex argument is a type error at fill. */

export const complex = (evaluate, fields = {}) => ({
    arguments: new Array(evaluate.length).fill(complexType),
    returns: complexType,
    evaluate,
    ...fields,
});

/* stamp a category's definitions with their names: the object key is
the name, so the definitions themselves needn't repeat it. */

export const define = (definitions) =>
    Object.fromEntries(
        Object.entries(definitions).map(([name, definition]) => [
            name,
            { name, ...definition },
        ])
    );

/* value-level entry arithmetic for the aggregate cases: the fast path
is JS operators on floats; anything else resolves through the
vocabulary, so a complex entry adds by the complex case. the
definition arrives from the caller, keeping helpers a leaf. */

export const entryBinary = (definition, floats) => (x, y) =>
    typeof x === "number" && typeof y === "number"
        ? floats(x, y)
        : valueApply(definition, x, y);

export const entryUnary = (definition, floats) => (x) =>
    typeof x === "number" ? floats(x) : valueApply(definition, x);

/* literal equality of two entries (treesEqual compares literals across
types); primitives compare directly, the value classes by their own
equality (a modular integer is its residue — and only alongside the
same modulus). */

export const entryEqual = (x, y) => {
    if (x instanceof Complex || y instanceof Complex) {
        return (
            liftComplex(x).re === liftComplex(y).re &&
            liftComplex(x).im === liftComplex(y).im
        );
    }

    if (x instanceof Rational || y instanceof Rational) {
        return Rational.of(x).equals(Rational.of(y));
    }

    if (x instanceof Quaternion || y instanceof Quaternion) {
        return Quaternion.from(x).equals(Quaternion.from(y));
    }

    if (x instanceof Octonion || y instanceof Octonion) {
        return Octonion.from(x).equals(Octonion.from(y));
    }

    if (x instanceof ModularInteger || y instanceof ModularInteger) {
        return (
            x instanceof ModularInteger &&
            y instanceof ModularInteger &&
            x.modulus === y.modulus &&
            x.value === y.value
        );
    }

    return x === y;
};

/* map or zip over the leaves of tensor values, at any depth. */

export const mapEntries = (value, fn) =>
    Array.isArray(value) ? value.map((sub) => mapEntries(sub, fn)) : fn(value);

export const zipEntries = (a, b, fn) =>
    Array.isArray(a) ? a.map((sub, i) => zipEntries(sub, b[i], fn)) : fn(a, b);

/* matrix and vector value-level operations. matrices are arrays of
row arrays, vectors plain arrays. the arithmetic arrives as arguments
(entryBinary of the caller's own operation), so the same procedures
serve float and complex entries. */

export const matmulValues = (a, b, add, mul) =>
    a.map((row) =>
        b[0].map((_, j) => row.map((x, k) => mul(x, b[k][j])).reduce(add))
    );

export const matvecValues = (a, v, add, mul) =>
    a.map((row) => row.map((x, k) => mul(x, v[k])).reduce(add));

export const vecmatValues = (v, a, add, mul) =>
    a[0].map((_, j) => v.map((x, k) => mul(x, a[k][j])).reduce(add));

export const transposeValue = (a) => a[0].map((_, j) => a.map((row) => row[j]));

export const dotValues = (a, b, add, mul) =>
    a.map((x, i) => mul(x, b[i])).reduce(add);

export const crossValues = ([x1, y1, z1], [x2, y2, z2]) => [
    y1 * z2 - z1 * y2,
    z1 * x2 - x1 * z2,
    x1 * y2 - y1 * x2,
];

export const lengthValue = (a) => Math.sqrt(dotValues(a, a, (x, y) => x + y, (x, y) => x * y));

export const normalizeValue = (a) => {
    const length = lengthValue(a);

    return a.map((x) => x / length);
};

export const minorOf = (a, row, column) =>
    a.filter((_, i) => i !== row).map((r) => r.filter((_, j) => j !== column));

export function determinantValue(a, add, sub, mul, neg) {
    if (a.length === 1) {
        return a[0][0];
    }

    let determinant;

    for (let j = 0; j < a.length; j++) {
        const term = mul(a[0][j], determinantValue(minorOf(a, 0, j), add, sub, mul, neg));
        const signed = j % 2 === 0 ? term : neg(term);

        determinant = determinant === undefined ? signed : add(determinant, signed);
    }

    return determinant;
}

/* the adjugate over the determinant. the 1x1 case's plain 1
promotes through the entry's divide. */

export function inverseValue(a, add, sub, mul, div, neg) {
    if (a.length === 1) {
        return [[div(1, a[0][0])]];
    }

    const determinant = determinantValue(a, add, sub, mul, neg);

    return transposeValue(
        a.map((row, i) =>
            row.map((_, j) => {
                const minor = determinantValue(minorOf(a, i, j), add, sub, mul, neg);
                const cofactor = (i + j) % 2 === 0 ? minor : neg(minor);

                return div(cofactor, determinant);
            })
        )
    );
}

/* the case matchers: shapes no declarative pattern expresses. matmul
needs the inner dimensions to agree, dot one shared length,
determinant and inverse a square, scale one scalar side. the entries
join through the lattice: a float matrix multiplying a complex one
promotes, and the product's entries are the join. */

const rewrap = (type, entry) => tensorType(type.dims, entry);

const joinEntries = (a, b) => {
    const entry = joinTypes(a.entry, b.entry);

    if (entry === null) {
        return null;
    }

    return {
        entry,
        promotes: [
            a.entry === entry ? null : rewrap(a, entry),
            b.entry === entry ? null : rewrap(b, entry),
        ],
    };
};

export const matmulMatch = ([a, b]) => {
    if (!isMatrix(a) || !isMatrix(b) || a.cols !== b.rows) {
        return null;
    }

    const joined = joinEntries(a, b);

    return joined && { returns: matrixType(a.rows, b.cols, joined.entry), promotes: joined.promotes };
};

export const matvecMatch = ([a, b]) => {
    if (!isMatrix(a) || !isVector(b) || a.cols !== b.size) {
        return null;
    }

    const joined = joinEntries(a, b);

    return joined && { returns: vectorType(a.rows, joined.entry), promotes: joined.promotes };
};

export const vecmatMatch = ([a, b]) => {
    if (!isVector(a) || !isMatrix(b) || a.size !== b.rows) {
        return null;
    }

    const joined = joinEntries(a, b);

    return joined && { returns: vectorType(b.cols, joined.entry), promotes: joined.promotes };
};

export const dotMatch = ([a, b]) => {
    if (!isVector(a) || !isVector(b) || a.size !== b.size) {
        return null;
    }

    const joined = joinEntries(a, b);

    return joined && { returns: joined.entry, promotes: joined.promotes };
};

/* scale's matcher: one scalar side, one tensor side, the scalar
kept whole (it is the module action, not a splat). the tensor's
entries widen to meet the scalar. */

export const scaleMatch = ([a, b]) => {
    const [s, aggregate, scalarFirst] = isRingScalar(a)
        ? [a, b, true]
        : isRingScalar(b)
          ? [b, a, false]
          : [];

    if (!s || !isTensor(aggregate)) {
        return null;
    }

    const entry = joinTypes(s, aggregate.entry);

    if (entry === null) {
        return null;
    }

    const target = rewrap(aggregate, entry);
    const promoteAggregate = target === aggregate ? null : target;

    return {
        returns: target,
        promotes: scalarFirst
            ? [null, promoteAggregate]
            : [promoteAggregate, null],
    };
};

/* determinants and inverses ask for commutative entries (Study
determinants over the quaternions are out of scope) */

export const squareMatch = (returns) => ([a]) =>
    isMatrix(a) && a.rows === a.cols && a.entry.commutative
        ? { returns: typeof returns === "function" ? returns(a) : returns }
        : null;

/* float-entry vectors only: length and normalize compute a euclidean
norm, which is a float notion (there is no such canonical norm over
the complexes — dot there is bilinear, not hermitian). */

export const floatVectorMatch = (returns) => ([v]) =>
    isVector(v) && v.entry === floatType
        ? { returns: typeof returns === "function" ? returns(v) : returns }
        : null;

/* the derivative of a piecewise-constant function: zero. comparisons,
logical operators, sign, the rounding functions, and step all share
it. */

export const zeroDerivative = ([x], _, builders) => builders.literal(0, x);

/* modular arithmetic (types/exact.js's integer<m>) renders in wgsl as
f32 arithmetic with an explicit mod: inner reduced into [0, m). the
literals themselves lower to f32 (formatFloat). */

export const modWgsl = (modulus, inner) => {
    const m = formatFloat(Number(modulus));

    return `((${inner}) - ${m} * floor((${inner}) / ${m}))`;
};

/* the matcher for modular cases: every argument the same integer<m>,
the resolved definition's fields baked for that modulus (evaluate over
ModularInteger values, wgsl templates reduced by modWgsl). make maps
the modulus to the case's fields. */

export const modularMatch = (make) => (argTypes) => {
    const [first] = argTypes;

    if (
        !first ||
        first.kind !== "integer" ||
        first.modulus === undefined ||
        !argTypes.every((type) => type === first)
    ) {
        return null;
    }

    return { returns: first, fields: make(first.modulus) };
};
