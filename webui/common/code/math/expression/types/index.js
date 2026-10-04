/* types — the value types a semantic tree's leaves carry, and the type
system built over them.

every leaf of a semantic tree has a decided type: number nodes by their
value (typeOfValue), variable nodes by their `valueType` field (decided
at fill — see semantics/fill.js). the type of a compound expression
derives unambiguously from its operands: typeOf(node) computes it, and
a call built by typedCallNode carries its resolved result type stamped
on its callee (`callee.returns`).

the provided types:

- floatType (scalars.js): plain doubles, the default for literals and
  undeclared variables. boolType: the booleans comparisons and logical
  operators produce and the conditionals consume; isolated in the lattice
  (nothing promotes to or from it). complexType: the complexes, values
  carried by the Complex class of $math/complex.
- the exact tower (exact.js): naturalType(includeZero) and integerType
  (bigint values), modularIntegerType(modulus) (residues, ModularInteger
  values, joining nothing but themselves), rationalType (exact BigInt
  pairs, Rational values). arithmetic on them never rounds; the tower
  sits below float in the lattice, and operations the semirings cannot
  perform exactly lift into the completion (naturals subtract as
  integers, integers divide as rationals).
- the hypercomplex tower (hypercomplex.js): quaternionType (a skew
  field — multiplication does not commute) and octonionType (which
  does not even associate, and joins no lattice promotion).
- tensorType(dims) (tensors.js): fixed-size tensors of any dimension
  count as nested arrays. the 1- and 2-dimensional cases are the
  vectors and matrices — vectorType(size) and matrixType(rows,
  columns) are shorthand aliases — with componentwise arithmetic for
  vectors (rgb colors, 2d points, per-channel math) and matmul for
  matrices (so the matrix types are noncommutative).

promotion follows the usual conventions (pytorch, wgsl): a scalar
meeting anything wider is upcast — float to complex, or splatted to a
vector or matrix — and the operation proceeds at the wider type. the
lattice is joinTypes (lattice.js); promotion of a tree node is
promoteNode, which re-lifts literals in place and wraps anything else
in an explicit `convert` node (codegen renders the conversion,
evaluation applies the target type's lift, differentiation
differentiates the operand).

how a function behaves for each combination of types is the function's
own business (operations/): each definition declares its cases and
resolveCase (resolve.js) matches them against actual argument types —
first without promotions, then along the lattice. typedCallNode is the
typed call constructor every pass builds calls with; a combination no
case covers is a type error at construction time. */

import { matrixType, tensorType, vectorType } from "./tensors.js";
import { boolType, complexType, floatType } from "./scalars.js";
import { integerType, modularIntegerType, naturalType, rationalType } from "./exact.js";
import { octonionType, quaternionType } from "./hypercomplex.js";

export { exactQuotient, formatFloat, formatMathNumber } from "./format.js";
export { boolType, complexType, floatType } from "./scalars.js";
export {
    isMatrix,
    isTensor,
    isVector,
    matrixType,
    tensorType,
    typeOfValue,
    vectorType,
} from "./tensors.js";
export {
    integerType,
    modularIntegerType,
    naturalType,
    rationalType,
} from "./exact.js";
export { octonionType, quaternionType } from "./hypercomplex.js";
export {
    isRingScalar,
    joinTypes,
    oneOf,
    promotable,
    promoteNode,
    promotionDistance,
    zeroOf,
} from "./lattice.js";
export {
    casesOf,
    inferConstant,
    numberType,
    resolveCase,
    typedCallNode,
    typeOf,
    valueApply,
} from "./resolve.js";

/* the source-level type names, for the definition syntax's
declarations (`real r x;`, `default complex;`, `vector<3> uv;`,
`matrix<2, 2, complex> m;`, `tensor<2, 3, 4> t;`). resolveTypeName maps
a parsed type name (syntax/ast.js) to a type; the registry is the
extension point for new types — each entry validates its parameters
and builds the type, with errors naming the source index. */

/* duck and ducks — the declaration markers of duck-typing. neither is
a value type: no lift, no constants, no seat in the lattice. a
duck-typed variable is bound to anything that quacks the right way:
fill treats it as provisional — its type in a definition's pristine
tree is decided by its use sites, like an implicit variable's — and a
with-replacement binding it imposes nothing on the replacement: the
replacement's literals read by the ambient default type rather than
by any type the variable took in the subtree, and the binding tree's
own type governs at every use.

`duck x y;` declares one unified duck: x and y must take the SAME
type — they share one provisional type, and bindings of one decide
the other. `ducks x y;` declares individualized ducks: each can be
anything. (`duck x;` and `ducks x;` are the same singleton.) as a
block's default (`default duck;`), every undeclared variable is an
individualized duck. */

export const duckType = {
    isType: true,
    kind: "duck",
    name: "duck",
};

export const ducksType = {
    isType: true,
    kind: "ducks",
    name: "ducks",
};

const namedTypes = {
    real: () => floatType,
    float: () => floatType,
    complex: () => complexType,
    bool: () => boolType,
    natural: (params, index) => {
        const [includeZero] = params;

        if (includeZero !== undefined && typeof includeZero !== "boolean") {
            throw new Error(
                `A natural's parameter must be a boolean at index ${index}`
            );
        }

        return naturalType(includeZero ?? true);
    },
    integer: (params, index) => {
        const [modulus] = params;

        if (modulus === undefined) {
            return integerType;
        }

        if (!Number.isInteger(modulus) || modulus < 2) {
            throw new Error(
                `A modular integer's modulus must be an integer ` +
                    `of at least 2 at index ${index}`
            );
        }

        return modularIntegerType(BigInt(modulus));
    },
    rational: () => rationalType,
    duck: (params, index) => {
        if (params.length !== 0) {
            throw new Error(
                `A duck takes no parameters at index ${index}`
            );
        }

        return duckType;
    },
    ducks: (params, index) => {
        if (params.length !== 0) {
            throw new Error(
                `A ducks takes no parameters at index ${index}`
            );
        }

        return ducksType;
    },
    quaternion: () => quaternionType,
    octonion: () => octonionType,
    vector: (params, index) => {
        const [size, entry] = params;

        if (!Number.isInteger(size) || size <= 0) {
            throw new Error(`A vector's size must be a positive integer at index ${index}`);
        }

        return vectorType(size, entry ?? floatType);
    },
    matrix: (params, index) => {
        const [rows, columns, entry] = params;

        if (
            !Number.isInteger(rows) ||
            !Number.isInteger(columns) ||
            rows <= 0 ||
            columns <= 0
        ) {
            throw new Error(
                `A matrix's dimensions must be positive integers at index ${index}`
            );
        }

        return matrixType(rows, columns, entry ?? floatType);
    },
    tensor: (params, index) => {
        const trailing = params[params.length - 1];
        const entry = trailing?.isType ? trailing : floatType;
        const dims = trailing?.isType ? params.slice(0, -1) : params;

        if (
            dims.length === 0 ||
            dims.some((dim) => !Number.isInteger(dim) || dim <= 0)
        ) {
            throw new Error(
                `A tensor's dimensions must be positive integers at index ${index}`
            );
        }

        return tensorType(dims, entry);
    },
};

const paramValue = (param, source) =>
    param.kind === "number"
        ? Number(source.slice(param.index, param.index + param.length))
        : param.kind === "bool"
          ? param.value
          : resolveTypeName(param.type, source);

export function resolveTypeName(typeName, source) {
    const factory = namedTypes[typeName.name];

    if (!factory) {
        throw new Error(`Unknown type '${typeName.name}' at index ${typeName.index}`);
    }

    return factory(
        typeName.params.map((param) => paramValue(param, source)),
        typeName.index
    );
}
