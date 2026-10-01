/* nodes — semantic node constructors and the constant-value probe.

a semantic tree is plain data plus the function definitions its call
nodes carry: functionNode spreads the whole definition (see
definitions.js), so every pass reads what it needs — evaluate,
derivative, template, signature, simplify, ... — straight off the
callee node rather than looking the name up in a table of its own. */

export function numberNode(value, index = 0, length = 0) {
    return {
        type: "number",
        index,
        length,
        value,
    };
}

export function functionNode(definition, index, length) {
    return {
        type: "function",
        index,
        length,
        ...definition,
    };
}

export function callNode(definition, args, index, length = 0) {
    return {
        type: "call",
        index,
        length,
        callee: functionNode(definition, index, 0),
        arguments: args,
    };
}

/* the value of a constant expression, or undefined if any part of it
isn't constant. unlike trees.js's foldableValue this counts named
constants as constant (differentiate needs that: x^pi has a constant
exponent even though pi stays symbolic for rendering). */

export function constantValue(node) {
    if (node.type === "number") {
        return node.value;
    }

    if (node.type !== "call" || !node.callee.evaluate) {
        return undefined;
    }

    const values = node.arguments.map(constantValue);

    if (values.includes(undefined)) {
        return undefined;
    }

    try {
        return node.callee.evaluate(...values);
    } catch {
        return undefined;
    }
}
