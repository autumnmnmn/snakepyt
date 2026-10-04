/* hypercomplex — the Cayley-Dickson tower above the complexes:
quaternions (Hamilton's skew field — multiplication does not commute)
and octonions (the last normed division algebra — multiplication
neither commutes nor associates). values are Quaternion and Octonion
instances with double components; the reals embed as the scalar part
and the complexes as (scalar, i), so float and complex promote into
the quaternions. the octonions stand alone in the lattice: nothing
promotes in or out.

in wgsl a quaternion is a vec4f, its products through the
quaternion_* helpers of $paste(shared/quaternion.wgsl) (the way
complex arithmetic spells through complex_*). there is no wgsl
octonion; codegen refuses it with a clear error. */

import { Octonion } from "../../octonion.js";
import { Quaternion } from "../../quaternion.js";
import { formatFloat, formatMathNumber } from "./format.js";

const quaternionFinite = (q) =>
    Number.isFinite(q.w) && Number.isFinite(q.x) &&
    Number.isFinite(q.y) && Number.isFinite(q.z);

function formatMathQuaternion(node) {
    const q = node.value;

    if (!quaternionFinite(q)) {
        throw new Error(
            `Cannot render a non-finite quaternion as math at index ${node.index}`
        );
    }

    const terms = [];
    const push = (value, unit) => {
        if (value === 0) return;

        const sign = value < 0 ? " - " : terms.length ? " + " : "";
        const magnitude =
            unit && Math.abs(value) === 1
                ? ""
                : formatMathNumber({ value: Math.abs(value), index: node.index });

        terms.push(`${sign}${magnitude}${unit}`);
    };

    push(q.w, "");
    push(q.x, "i");
    push(q.y, "j");
    push(q.z, "k");

    const text = terms.length ? terms.join("") : "0";

    // a sum of parts parenthesizes, so the literal stays one factor
    return terms.length > 1 ? `(${text})` : text;
}

export const quaternionType = {
    isType: true,
    kind: "quaternion",
    name: "quaternion",
    commutative: false,
    integerExponents: true,
    lift: (value) => Quaternion.from(value),
    constant(value, name) {
        if (
            Array.isArray(value) &&
            (value.length !== 4 || value.some((x) => Number.isNaN(Number(x))))
        ) {
            throw new Error(
                `Constant '${name}' is not a [w, x, y, z] numeric quadruple`
            );
        }

        return Array.isArray(value)
            ? new Quaternion(...value.map(Number))
            : Quaternion.from(value);
    },
    isFinite: quaternionFinite,
    literalEqual: (a, b) => a.equals(b),
    asReal: (value) => value.asScalar(),
    isZero: (value) => value.w === 0 && value.x === 0 && value.y === 0 && value.z === 0,
    isOne: (value) => value.w === 1 && value.x === 0 && value.y === 0 && value.z === 0,
    isMinusOne: (value) => value.w === -1 && value.x === 0 && value.y === 0 && value.z === 0,
    splitSign: (value) => ({ sign: 1, value }),
    crossReduce: () => undefined,
    renderNumber: {
        wgsl: (node) => {
            const q = node.value;

            return `vec4f(${formatFloat(q.w)}, ${formatFloat(q.x)}, ` +
                `${formatFloat(q.y)}, ${formatFloat(q.z)})`;
        },
        math: (node) =>
            node.name !== undefined ? node.name : formatMathQuaternion(node),
    },
    renderConvert: {
        // a complex arrives as a vec2f and fills the first two lanes
        wgsl: (operand, from) =>
            from?.kind === "complex"
                ? `vec4f(${operand}, 0.0, 0.0)`
                : `vec4f(${operand}, 0.0, 0.0, 0.0)`,
        math: (operand) => operand,
    },
};

export const octonionType = {
    isType: true,
    kind: "octonion",
    name: "octonion",
    commutative: false,
    integerExponents: true,
    lift: (value) => Octonion.from(value),
    constant(value, name) {
        if (
            Array.isArray(value) &&
            (value.length !== 8 || value.some((x) => Number.isNaN(Number(x))))
        ) {
            throw new Error(
                `Constant '${name}' is not an 8-component numeric array`
            );
        }

        return Array.isArray(value)
            ? Octonion.fromComponents(value.map(Number))
            : Octonion.from(value);
    },
    isFinite: (value) => value.components.every(Number.isFinite),
    literalEqual: (a, b) => a.equals(b),
    asReal: (value) => value.asScalar(),
    isZero: (value) => value.components.every((c) => c === 0),
    isOne: (value) => value.equals(Octonion.one),
    isMinusOne: (value) => value.equals(Octonion.one.neg()),
    splitSign: (value) => ({ sign: 1, value }),
    crossReduce: () => undefined,
    renderNumber: {
        wgsl: (node) => {
            throw new Error(
                `Cannot render an octonion as wgsl: ` +
                    `there is no wgsl representation at index ${node.index}`
            );
        },
        math: (node) =>
            node.name !== undefined
                ? node.name
                : `(${node.value.components.join(", ")})`,
    },
    renderConvert: {
        wgsl: (operand, from, index) => {
            throw new Error(
                "Cannot render an octonion as wgsl: there is no wgsl representation"
            );
        },
        math: (operand) => operand,
    },
};
