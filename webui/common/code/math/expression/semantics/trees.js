/* trees — small utilities shared by the semantic passes:
treesEqual, collectVariables, isLiteral, the children walkers, and
(re-exported) foldableValue. */

import { copyNode } from "./nodes.js";
import { joinTypes, numberType } from "../types/index.js";

/* the immediate child trees of a node, in a stable order: a convert's
operand, a call's arguments, a cases block's conditions and bodies,
an instance's ambient splice values and replacement trees, a deferred
diff's f. atoms (number, variable, function) have none. the one place
that knows the tree's shape: the passes walk or rebuild through it,
so a new node type means one update, not seven. */

export function childrenOf(node) {
    switch (node.type) {
        case "convert":
            return [node.operand];

        case "call":
            return node.arguments;

        case "cases":
            return node.cases.flatMap(({ condition, body }) => [condition, body]);

        case "instance":
            return [
                ...(node.ambient?.values() ?? []),
                ...node.replacements.map((replacement) => replacement.tree),
            ];

        case "diff":
            return node.f ? [node.f] : [];

        default:
            return [];
    }
}

/* the node with fn applied to each immediate child, sharing the node
object when no child changed. */

export function mapChildren(node, fn) {
    switch (node.type) {
        case "convert": {
            const operand = fn(node.operand);

            return operand === node.operand ? node : copyNode(node, { operand });
        }

        case "call": {
            const args = node.arguments.map(fn);

            return args.some((argument, i) => argument !== node.arguments[i])
                ? copyNode(node, { arguments: args })
                : node;
        }

        case "cases": {
            let changed = false;

            const cases = node.cases.map(({ condition, body }) => {
                const nextCondition = fn(condition);
                const nextBody = fn(body);

                changed ||=
                    nextCondition !== condition || nextBody !== body;

                return { condition: nextCondition, body: nextBody };
            });

            return changed ? copyNode(node, { cases }) : node;
        }

        case "instance": {
            let changed = false;
            let ambient = node.ambient;

            if (ambient) {
                const next = new Map(
                    [...ambient].map(([name, tree]) => [name, fn(tree)])
                );
                const values = [...ambient.values()];

                if ([...next.values()].some((tree, i) => tree !== values[i])) {
                    ambient = next;
                    changed = true;
                }
            }

            const replacements = node.replacements.map((replacement) => {
                const tree = fn(replacement.tree);

                if (tree === replacement.tree) {
                    return replacement;
                }

                changed = true;

                return { ...replacement, tree };
            });

            return changed ? copyNode(node, { ambient, replacements }) : node;
        }

        case "diff": {
            if (!node.f) {
                return node;
            }

            const f = fn(node.f);

            return f === node.f ? node : copyNode(node, { f });
        }

        default:
            return node;
    }
}

/* structural equality over semantic trees, ignoring source spans.
literal values compare through their own type, so two separately built
complex 2+3i literals are equal; literals of different types compare
through a promotion (a float 2 equals a complex 2+0i). */

export function treesEqual(a, b) {
    if (a.type !== b.type) {
        return false;
    }

    switch (a.type) {
        case "number": {
            const aType = numberType(a);
            const bType = numberType(b);

            if (aType === bType) {
                return aType.literalEqual(a.value, b.value);
            }

            const joined = joinTypes(aType, bType);

            return (
                joined !== null &&
                joined.literalEqual(joined.lift(a.value), joined.lift(b.value))
            );
        }

        case "variable":
        case "function":
            return a.name === b.name;

        case "convert":
            return a.target === b.target && treesEqual(a.operand, b.operand);

        case "call":
            return (
                treesEqual(a.callee, b.callee) &&
                a.arguments.length === b.arguments.length &&
                a.arguments.every((argument, i) =>
                    treesEqual(argument, b.arguments[i])
                )
            );

        case "cases":
            return (
                a.cases.length === b.cases.length &&
                a.cases.every(
                    ({ condition, body }, i) =>
                        treesEqual(condition, b.cases[i].condition) &&
                        treesEqual(body, b.cases[i].body)
                )
            );

        case "diff":
            return (
                a.wrt === b.wrt &&
                (a.f === null || b.f === null
                    ? a.f === b.f
                    : treesEqual(a.f, b.f))
            );

        case "instance": {
            if (
                a.of.name !== b.of.name ||
                a.replacements.length !== b.replacements.length ||
                (a.ambient?.size ?? 0) !== (b.ambient?.size ?? 0)
            ) {
                return false;
            }

            const contextEqual =
                a.ambient === undefined ||
                [...a.ambient].every(
                    ([name, tree]) =>
                        b.ambient.has(name) && treesEqual(tree, b.ambient.get(name))
                );

            return (
                contextEqual &&
                a.replacements.every((replacement, i) =>
                    replacement.name === b.replacements[i].name &&
                    treesEqual(replacement.tree, b.replacements[i].tree)
                )
            );
        }

        default:
            return false;
    }
}

/* the tree with every variable called `name` replaced by the
replacement tree: a rebuild sharing everything untouched (the passes'
convention). fill uses it for the diff execution's wrt binding (the
binding belongs to the derivative, never to f — see fill.js). the
replacement is shared into every occurrence, the way a local's tree
is shared. an instance's hidden variables (its definition's own,
minus the replaced) are out of reach — they are not this tree's
nodes. */

export function substituteVariable(tree, name, replacement) {
    if (tree.type === "variable") {
        return tree.name === name ? replacement : tree;
    }

    return mapChildren(tree, (child) => substituteVariable(child, name, replacement));
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

        /* every other compound node is walked through its children.
        an instance's free variables are the ones of its ambient
        splice and its replacements (its definition's own are a subset
        of the enclosing body's — the expansion re-fills the same
        body — so they need no collecting), and a deferred diff's are
        its f's: wrt is a compile-time name, not a value dependency */
        for (const child of childrenOf(node)) {
            walk(child);
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

/* foldableValue lives with constantValue in nodes.js: the one
constant-subtree evaluator, with named constants declined. */

export { foldableValue } from "./nodes.js";
