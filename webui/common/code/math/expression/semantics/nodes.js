/* nodes — semantic node constructors and the constant-value probe.

a semantic tree is plain data plus the function definitions its call
nodes carry: functionNode spreads the (case-resolved) definition (see
operations/ and typedCallNode in types/resolve.js), so every pass reads what
it needs — evaluate, derivative, template, simplify, ... — straight off
the callee node rather than looking the name up in a table of its own.
also home of the constant-subtree evaluator (constantValue and
foldableValue below).
beyond number/variable/function/call there is one more node type:
convert ({ type: "convert", index, length, target, operand }), an
explicit promotion inserted by typedCallNode; it carries the target
type, so evaluation lifts through it, differentiation differentiates
its operand, and codegen renders the target's conversion.
every node is an Expression (expression.js), so the tree-consuming
passes are methods on the trees; copyNode is the rebuild the passes
share — the node with some fields replaced, still an Expression. */

import { Expression } from "./expression.js";

export function numberNode(value, index = 0, length = 0, valueType) {
    return new Expression({
        type: "number",
        index,
        length,
        value,
        ...(valueType ? { valueType } : {}),
    });
}

export function functionNode(definition, index, length) {
    return new Expression({
        type: "function",
        index,
        length,
        ...definition,
    });
}

export function callNode(definition, args, index, length = 0) {
    return new Expression({
        type: "call",
        index,
        length,
        callee: functionNode(definition, index, 0),
        arguments: args,
    });
}

/* the node with some fields replaced: the one sanctioned way to
rebuild a node, so every tree a pass returns is still an Expression. */

export function copyNode(node, overrides) {
    return new Expression({ ...node, ...overrides });
}

/* the value of a constant expression, or undefined if any part of it
isn't constant. named constants (pi, ...) count as constant only with
allowNamed: constantValue allows them (differentiate needs that — x^pi
has a constant exponent even though pi stays symbolic for rendering),
foldableValue declines them (nothing with a name ever folds). a cases
block is constant when every condition is a constant boolean and
exactly one holds — the one true body's value. */

function evaluableValue(node, allowNamed) {
    if (node.type === "diff") {
        return undefined;
    }

    if (node.type === "cases") {
        const values = node.cases.map(({ condition }) =>
            evaluableValue(condition, allowNamed)
        );

        if (values.includes(undefined)) {
            return undefined;
        }

        const trueAt = values.findIndex((value) => value === true);

        return trueAt !== -1 && values.every((value, i) => i === trueAt || value === false)
            ? evaluableValue(node.cases[trueAt].body, allowNamed)
            : undefined;
    }

    if (node.type === "number") {
        return allowNamed || node.name === undefined ? node.value : undefined;
    }

    if (node.type === "convert") {
        const value = evaluableValue(node.operand, allowNamed);

        return value === undefined ? undefined : node.target.lift(value);
    }

    if (node.type !== "call" || !node.callee.evaluate) {
        return undefined;
    }

    const values = node.arguments.map((argument) =>
        evaluableValue(argument, allowNamed)
    );

    if (values.includes(undefined)) {
        return undefined;
    }

    try {
        return node.callee.evaluate(...values);
    } catch {
        return undefined;
    }
}

export const constantValue = (node) => evaluableValue(node, true);

export const foldableValue = (node) => evaluableValue(node, false);
