/* trees — small utilities shared by the semantic passes */

import { floatDomain } from "./autodiff.js";

/* structural equality over semantic trees, ignoring source spans.
literal values compare through the domain, so two separately built
complex 2+3i literals are equal. */

export function treesEqual(a, b, domain = floatDomain) {
    if (a.type !== b.type) {
        return false;
    }

    switch (a.type) {
        case "number":
            return domain.literalEqual(a.value, b.value);

        case "variable":
        case "function":
            return a.name === b.name;

        case "call":
            return (
                treesEqual(a.callee, b.callee, domain) &&
                a.arguments.length === b.arguments.length &&
                a.arguments.every((argument, i) =>
                    treesEqual(argument, b.arguments[i], domain)
                )
            );

        default:
            return false;
    }
}

/* the names of every variable appearing in a filled tree, in order of first
appearance. with fill treating unknown identifiers as implicit variables,
this is how a caller discovers what an expression actually needs. */

export function collectVariables(tree) {
    const names = [];
    const seen = new Set();

    function walk(node) {
        if (node.type === "variable") {
            if (!seen.has(node.name)) {
                seen.add(node.name);
                names.push(node.name);
            }

            return;
        }

        if (node.type === "call") {
            for (const argument of node.arguments) {
                walk(argument);
            }
        }
    }

    walk(tree);

    return names;
}

/* a literal is a plain number node; named constants (pi, ...) stay
symbolic, so they are not literals and never fold. */

export function isLiteral(node) {
    return node.type === "number" && node.name === undefined;
}

/* the value of a constant expression built from plain literals, or
undefined if anything in it isn't one (named constants stay symbolic). */

export function foldableValue(node) {
    if (node.type === "number") {
        return node.name === undefined ? node.value : undefined;
    }

    if (node.type !== "call" || !node.callee.evaluate) {
        return undefined;
    }

    const values = node.arguments.map(foldableValue);

    if (values.includes(undefined)) {
        return undefined;
    }

    try {
        return node.callee.evaluate(...values);
    } catch {
        return undefined;
    }
}
