/* lattice — the promotion lattice. a scalar meeting anything wider is
upcast: along the scalar axis

    natural<false> → natural → integer → rational → float → complex → quaternion

(each embedding exact through rational, approximate from float on), or
splatted into a tensor whose entries it can lift into, and a
tensor's entries widen together (vector<3> to vector<3,complex>).
bool, the modular integers, and the octonions are isolated: bool
promotes only into bool-entry aggregates, an integer<m> joins nothing
but itself (Z/mZ is a quotient of Z, not a subset), and the octonions
connect to nothing (the Cayley-Dickson tower ends the division
algebras — there is no canonical embedding of the octonions into
anything else on offer).

joinTypes is the least upper bound: the type two operands meet at, or
null when no promotion connects them. promotionDistance counts the
lattice steps of a promotion (0 for identity, Infinity when
unconnected): case resolution prefers the case needing the least
promotion, so naturals subtract as integers rather than lowering to
floats. promoteNode promotes a tree node: a literal simply re-lifts
its value (named constants keep their name, and the node is stamped
with its new type); anything else wraps in an explicit convert node,
which carries the target type so every downstream pass — evaluation,
differentiation, codegen — reads the conversion straight off the
node. */

import { integerType, naturalType, rationalType } from "./exact.js";
import { quaternionType } from "./hypercomplex.js";
import { complexType, floatType } from "./scalars.js";
import { Expression } from "../semantics/expression.js";
import { copyNode } from "../semantics/nodes.js";
import { isTensor } from "./tensors.js";

const sameShape = (a, b) =>
    a.dims.length === b.dims.length && a.dims.every((dim, i) => dim === b.dims[i]);

/* the scalar axis ranks: a promotion along the axis exists exactly
when the rank rises. types off the axis (bool, integer<m>, octonion)
rank -1. */

const axisRanks = new Map([
    [naturalType(false), 0],
    [naturalType(), 1],
    [integerType, 2],
    [rationalType, 3],
    [floatType, 4],
    [complexType, 5],
    [quaternionType, 6],
]);

const axisRank = (type) => axisRanks.get(type) ?? -1;

export function promotable(from, to) {
    if (from === to) {
        return true;
    }

    if (isTensor(from)) {
        // tensors widen entrywise within one shape
        return (
            isTensor(to) && sameShape(from, to) && promotable(from.entry, to.entry)
        );
    }

    if (isTensor(to)) {
        // a scalar splats into a tensor whose entries it can lift into
        return promotable(from, to.entry);
    }

    const fromRank = axisRank(from);
    const toRank = axisRank(to);

    return fromRank !== -1 && toRank !== -1 && fromRank < toRank;
}

/* the lattice steps a promotion takes, or Infinity when no promotion
connects the types. a splat into a tensor costs one step beyond
the entry promotion. */

export function promotionDistance(from, to) {
    if (from === to) {
        return 0;
    }

    if (isTensor(from)) {
        return isTensor(to) && sameShape(from, to)
            ? promotionDistance(from.entry, to.entry)
            : Infinity;
    }

    if (isTensor(to)) {
        const entry = promotionDistance(from, to.entry);

        return entry === Infinity ? Infinity : entry + 1;
    }

    const fromRank = axisRank(from);
    const toRank = axisRank(to);

    return fromRank !== -1 && toRank !== -1 && fromRank < toRank
        ? toRank - fromRank
        : Infinity;
}

export function joinTypes(a, b) {
    if (a === b) {
        return a;
    }

    if (promotable(a, b)) {
        return b;
    }

    if (promotable(b, a)) {
        return a;
    }

    return null;
}

/* the commutative scalars of the ring kind — float, complex, and the
exact tower: what `*` means the ring product for, what scales a
tensor (the module action), what divides a scalar. bool is out
(not a ring), the hypercomplex scalars are out (noncommutative: the
side of a scalar multiplication matters), tensors are out. */

export const isRingScalar = (type) =>
    type.commutative && !isTensor(type) && type.kind !== "bool";

/* a typed zero or one literal value, for differentiate. */

export const zeroOf = (type) => type.lift(0);
export const oneOf = (type) => type.lift(1);

export function promoteNode(node, target) {
    if (node.type === "number") {
        return copyNode(node, {
            value: target.lift(node.value),
            valueType: target,
        });
    }

    return new Expression({
        type: "convert",
        index: node.index,
        length: node.length,
        target,
        operand: node,
    });
}
