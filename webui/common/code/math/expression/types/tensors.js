/* tensors — the fixed-size aggregate types of any dimension count:
tensorType(dims, entry) is a dims-shaped tensor of entry-typed leaves,
carried as nested plain arrays (a [2, 3] tensor is an array of two
arrays of three). the entry defaults to float: tensorType([3]) is the
familiar float vector (wgsl vecNf), and tensorType([2, 3], complexType)
a 2x3 matrix of complexes. bool entries arise from the pointwise
comparisons (wgsl vecN<bool>).

vectors and matrices are the one- and two-dimensional cases, and
vectorType(size, entry) / matrixType(rows, columns, entry) are
shorthand aliases: vectorType(3) === tensorType([3]). a matrix
multiplies by matmul whatever its entries, so the matrix types are
noncommutative; vectors are commutative (their product is Hadamard).

the factory is cached, so types compare by identity. the kind is
"tensor" for every dimension count; isVector / isMatrix are the
dimension-count predicates. also typeOfValue, reading a raw value's
type from its shape. */

import { Complex } from "../../complex.js";
import { ModularInteger } from "../../modular.js";
import { Octonion } from "../../octonion.js";
import { Quaternion } from "../../quaternion.js";
import { Rational } from "../../rational.js";
import { integerType, modularIntegerType, rationalType } from "./exact.js";
import { octonionType, quaternionType } from "./hypercomplex.js";
import { boolType, complexType, floatType } from "./scalars.js";
import { formatFloat } from "./format.js";

export const isTensor = (type) => type.kind === "tensor";
export const isVector = (type) => isTensor(type) && type.dims.length === 1;
export const isMatrix = (type) => isTensor(type) && type.dims.length === 2;

/* the value-level shape helpers: leaves are the entry-typed scalars,
everything above them arrays. lift splats a bare scalar to the full
shape and passes an array's leaves through the entry's lift, so a
float tensor promotes into a complex tensor. */

const mapLeaves = (value, fn) =>
    Array.isArray(value) ? value.map((sub) => mapLeaves(sub, fn)) : fn(value);

const everyLeaf = (value, predicate) =>
    Array.isArray(value)
        ? value.every((sub) => everyLeaf(sub, predicate))
        : predicate(value);

const types = new Map();

/* the wgsl constructor spelling for one entry of the given entry
type's tensor literal. complex entries have no wgsl aggregate
representation: codegen refuses them (see codegen.js's guard), so
this is only ever asked about float and bool entries. */

const entryWgsl = (entry, value) =>
    entry === boolType ? (value ? "true" : "false") : formatFloat(value);

export function tensorType(dims, entry = floatType) {
    const shape =
        dims.length === 1
            ? `vector<${dims[0]}>`
            : dims.length === 2
              ? `matrix<${dims[0]},${dims[1]}>`
              : `tensor<${dims.join(",")}>`;

    const key = entry === floatType ? shape : `${shape.slice(0, -1)},${entry.name}>`;
    let type = types.get(key);

    if (type) {
        return type;
    }

    const splat = (value, depth = 0) =>
        depth === dims.length
            ? entry.lift(value)
            : Array.from({ length: dims[depth] }, () => splat(value, depth + 1));

    const lift = (value) =>
        Array.isArray(value)
            ? mapLeaves(value, (leaf) => entry.lift(leaf))
            : splat(value);

    const probe = (predicate) => (value) =>
        everyLeaf(lift(value), (leaf) => entry[predicate](leaf));

    /* "one" of a square matrix is the identity matrix — the
    multiplicative identity of matmul. everywhere else it is the
    all-entries splat (the Hadamard identity), and a non-square
    matrix has no one at all. */

    const identity = (predicate) => (value) =>
        lift(value).every((row, i) =>
            row.every((x, j) => (i === j ? entry[predicate](x) : entry.isZero(x)))
        );

    type = {
        isType: true,
        kind: "tensor",
        name: key,
        dims,
        entry,
        ...(dims.length === 1 ? { size: dims[0] } : {}),
        ...(dims.length === 2 ? { rows: dims[0], cols: dims[1] } : {}),
        // matmul does not commute, whatever the entries
        commutative: dims.length === 1,
        lift,
        constant(value, name) {
            const bad =
                dims.length === 1
                    ? `Constant '${name}' is not a ${dims[0]}-component vector`
                    : `Constant '${name}' is not a ${dims.join("x")} ${dims.length === 2 ? "matrix" : "tensor"}`;

            if (!Array.isArray(value)) {
                // a bare scalar reads as a splat (the vector
                // convenience); anything wider wants the full shape
                if (dims.length !== 1) {
                    throw new Error(bad);
                }

                return splat(entry.constant(value, name));
            }

            const shaped = (v, depth = 0) =>
                depth === dims.length
                    ? !Array.isArray(v)
                    : Array.isArray(v) &&
                      v.length === dims[depth] &&
                      v.every((sub) => shaped(sub, depth + 1));

            if (!shaped(value)) {
                throw new Error(bad);
            }

            return mapLeaves(value, (leaf) => entry.constant(leaf, name));
        },
        isFinite: (value) => everyLeaf(lift(value), (leaf) => entry.isFinite(leaf)),
        literalEqual: (a, b) => {
            const left = lift(a);
            const right = lift(b);

            const equal = (x, y) =>
                Array.isArray(x)
                    ? x.every((sub, i) => equal(sub, y[i]))
                    : entry.literalEqual(x, y);

            return equal(left, right);
        },
        asReal: (value) => {
            if (dims.length !== 1) {
                return undefined;
            }

            const components = lift(value);

            // a splat acts as its single component: x^[2,2] is x^2
            const first = entry.asReal(components[0]);

            if (first === undefined) {
                return undefined;
            }

            return components.every(
                (component) => entry.asReal(component) === first
            )
                ? first
                : undefined;
        },
        isZero: probe("isZero"),
        isOne:
            dims.length === 2
                ? dims[0] === dims[1]
                    ? identity("isOne")
                    : () => false
                : probe("isOne"),
        isMinusOne:
            dims.length === 2
                ? dims[0] === dims[1]
                    ? identity("isMinusOne")
                    : () => false
                : probe("isMinusOne"),
        splitSign: (value) => ({ sign: 1, value }),
        crossReduce:
            dims.length === 1
                ? (numerator, denominator) => {
                      const numerators = lift(numerator);
                      const denominators = lift(denominator);
                      const quotient = numerators.map((component, i) =>
                          entry.crossReduce(component, denominators[i])
                      );

                      return quotient.includes(undefined) ? undefined : quotient;
                  }
                : () => undefined,
        renderNumber: {
            wgsl(node) {
                const value = lift(node.value);

                if (dims.length === 1) {
                    return entry === boolType
                        ? `vec${dims[0]}<bool>(${value.map((v) => entryWgsl(entry, v)).join(", ")})`
                        : `vec${dims[0]}f(${value.map((v) => entryWgsl(entry, v)).join(", ")})`;
                }

                if (dims.length === 2) {
                    // wgsl matrices are matCxRf — C columns of
                    // vecRf — so the row-major literal transposes
                    // into column constructors
                    const [rows, columns] = dims;

                    return `mat${columns}x${rows}f(${Array.from({ length: columns }, (_, j) =>
                        `vec${rows}f(${Array.from({ length: rows }, (_, i) =>
                            formatFloat(value[i][j])
                        ).join(", ")})`
                    ).join(", ")})`;
                }

                throw new Error(
                    `Cannot render ${key} as wgsl: there is no wgsl representation yet`
                );
            },
            math(node) {
                if (node.name !== undefined) {
                    return node.name;
                }

                const tuple = (v) =>
                    Array.isArray(v)
                        ? `(${v.map(tuple).join(", ")})`
                        : entry.renderNumber.math({ value: v, index: node.index });

                return tuple(lift(node.value));
            },
        },
        renderConvert: {
            wgsl(operand) {
                if (dims.length === 1) {
                    return entry === boolType
                        ? `vec${dims[0]}<bool>(${operand})`
                        : `vec${dims[0]}f(${operand})`;
                }

                if (dims.length === 2) {
                    // a scalar promotes to a splat matrix: every
                    // entry, not just the diagonal (wgsl's scalar
                    // mat constructor builds a diagonal, hence the
                    // explicit columns)
                    const [rows, columns] = dims;

                    return `mat${columns}x${rows}f(${Array.from({ length: columns }, () =>
                        `vec${rows}f(${Array.from({ length: rows }, () => operand).join(", ")})`
                    ).join(", ")})`;
                }

                throw new Error(
                    `Cannot render ${key} as wgsl: there is no wgsl representation yet`
                );
            },
            math: (operand) => operand,
        },
    };

    types.set(key, type);

    return type;
}

export const vectorType = (size, entry = floatType) => tensorType([size], entry);

export const matrixType = (rows, columns, entry = floatType) =>
    tensorType([rows, columns], entry);

/* the type of a raw value: booleans are bool, bigints integers (a bare
bigint is ambiguous with the naturals; number nodes carry a fill-stamped
valueType for that), Complex instances complex, Rational instances
rational, ModularInteger instances integers of their modulus, Quaternion
and Octonion instances their types, arrays tensors of their nesting
shape over the entry type their leaves carry, anything else float. */

const entryOf = (value) => {
    if (typeof value === "boolean") return boolType;
    if (typeof value === "bigint") return integerType;
    if (value instanceof Complex) return complexType;
    if (value instanceof Rational) return rationalType;
    if (value instanceof ModularInteger) return modularIntegerType(value.modulus);
    if (value instanceof Quaternion) return quaternionType;
    if (value instanceof Octonion) return octonionType;

    return floatType;
};

export function typeOfValue(value) {
    if (!Array.isArray(value)) {
        return entryOf(value);
    }

    const dims = [];
    let rest = value;

    while (Array.isArray(rest)) {
        dims.push(rest.length);
        rest = rest[0];
    }

    return tensorType(dims, entryOf(rest));
}
