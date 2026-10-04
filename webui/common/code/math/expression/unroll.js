/* unroll

expands the actualized recursive instances (semantics/fill.js) until
none are left: the recursion's answer to "the static analysis involved
in unrolling is gnarly" — the user says when it is safe (`assume D is
unrollable when n is actualized;`), and unroll does it. an instance is
actualized when its watched set — the assumptions' condition variables,
minus the ones the instance replaces, plus the free variables of their
replacements — has emptied: every variable the recursion's depth
depends on is fully determined. leftmost first, each expansion
re-simplified so the recursion's own arithmetic folds (n - 1 becomes
a literal, and the cases block folds to its one true body). a recursion that keeps producing actualized instances without
settling (n := n + 1) is cut off by the expansion bound.

a recursion with several instances of itself in one logical branch
(fibonacci's `fib { n := n - 1 } + fib { n := n - 2 }`) expands the
same bindings over and over — the naive walk is exponential. those
definitions are memoized per unroll call: an instance's fully
unrolled expansion is computed once per (definition, replacements,
ambient) and shared at every repeat. which definitions qualify is a
heuristic: the definition's own tree has a cases body — a logical
branch — with more than one recursive instance among its
descendents. not every
definition that looks like that benefits, but every definition that
benefits looks like that. the memo is discarded when the unrolling is
done: this system is for analyzing and processing expressions, not
sequential programming — twenty unrelated trees recursing into the
same definition rebuild the memo twenty times, and that is fine.

the unrolled instances are gone from the result; instances that never
actualized stay, opaque as ever, for codegen to refuse. */

import { expandInstance } from "./semantics/fill.js";
import { childrenOf, mapChildren } from "./semantics/trees.js";
import { numberType } from "./types/index.js";
import { simplify } from "./simplify.js";

/* the first expandable instance in depth-first order, or null. an
unexpandable instance's replacements may themselves hold expandable
ones. */

function findExpandable(node) {
    if (
        node.type === "instance" &&
        node.watched !== undefined &&
        node.watched.length === 0
    ) {
        return node;
    }

    for (const child of childrenOf(node)) {
        const found = findExpandable(child);

        if (found) {
            return found;
        }
    }

    return null;
}

/* the tree with target replaced by expansion, sharing everything
untouched. */

const replace = (node, target, expansion) =>
    node === target
        ? expansion
        : mapChildren(node, (child) => replace(child, target, expansion));

/* an instance with its replacements and ambient splice simplified:
the expansion splices their values, and the memo keys on them, so
they are folded first — otherwise fib's instance arrives as
n := (5 - 1) - 1 at one site and n := (5 - 2) - 0 ... at another,
structurally different trees over the same values, and the memo
never hits. */

const normalizeInstance = (instance) => mapChildren(instance, simplify);

/* a structural key for a tree, ignoring source spans: two instances
with equal keys expand to equal trees. values serialize through JSON
with bigints tagged (the value classes — Complex, Rational, and
friends — serialize by their fields, consistent within one process);
types and functions go by name, which is enough within a single
unroll. */

const jsonValue = (value) =>
    JSON.stringify(value, (key, v) => (typeof v === "bigint" ? `${v}n` : v));

function structuralKey(node) {
    switch (node.type) {
        case "number":
            return (
                `n${numberType(node).name}:` +
                `${jsonValue(node.value)}:${node.name ?? ""}`
            );

        case "variable":
            return `v${node.name}:${node.valueType?.name ?? ""}`;

        case "convert":
            return `c${node.target.name}(${structuralKey(node.operand)})`;

        case "call":
            return (
                `f${node.callee.name}:${node.callee.returns?.name ?? ""}` +
                `(${node.arguments.map(structuralKey).join(",")})`
            );

        case "cases":
            return (
                `s${node.valueType.name}(` +
                node.cases
                    .map(
                        ({ condition, body }) =>
                            `${structuralKey(condition)}?${structuralKey(body)}`
                    )
                    .join(",") +
                ")"
            );

        case "instance":
            return instanceKey(node);

        case "diff":
            return `d${node.wrt ?? ""}(${node.f ? structuralKey(node.f) : ""})`;

        default:
            throw new Error(
                `Cannot key a node of type '${node.type}' for unroll's memo`
            );
    }
}

function instanceKey(node) {
    /* the expansion depends on the instance's merged splice — the
    ambient bindings with the replacements winning — not on how the
    bindings happen to split between the two (an ambient binding a
    replacement shadows might as well not be there), so the key
    serializes the merge, name-sorted for a canonical order. */
    const splice = new Map([
        ...(node.ambient ?? []),
        ...node.replacements.map((replacement) => [
            replacement.name,
            replacement.tree,
        ]),
    ]);

    const entries = [...splice].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return (
        `i${node.of.name}(` +
        entries
            .map(([name, tree]) => `${name}=${structuralKey(tree)}`)
            .join(",") +
        ")"
    );
}

/* the memoization heuristic: the definition's own tree has a cases
body — a logical branch — with more than one recursive instance
among its descendents. */

function wantsMemo(closure) {
    const tree = closure.tree;

    if (!tree) {
        return false;
    }

    function countInstances(node) {
        return (
            (node.type === "instance" && node.of === closure ? 1 : 0) +
            childrenOf(node).reduce((sum, child) => sum + countInstances(child), 0)
        );
    }

    function scan(node) {
        if (
            node.type === "cases" &&
            node.cases.some(({ body }) => countInstances(body) >= 2)
        ) {
            return true;
        }

        return childrenOf(node).some(scan);
    }

    return scan(tree);
}

/* expand an instance, memoized per unroll call when the definition
looks worth it — and memoized all the way: the table holds the
instance's FULLY unrolled expansion, so a repeat binding inserts a
finished tree instead of fresh instances to find and expand all over
again (memoizing the single step would still walk exponentially many
of them; that was the blowup this is for). the tables key on the
closure object, so same-named definitions never cross. */

function expandFully(instance, state) {
    let table = state.memos.get(instance.of);

    if (table === undefined) {
        table = wantsMemo(instance.of) ? new Map() : null;
        state.memos.set(instance.of, table);
    }

    if (table === null) {
        return expandInstance(instance);
    }

    const key = instanceKey(instance);

    if (!table.has(key)) {
        table.set(key, unrollLoop(expandInstance(instance), state));
    }

    return table.get(key);
}

function unrollLoop(tree, state) {
    let result = tree;

    for (;;) {
        result = simplify(result);

        const target = findExpandable(result);

        if (!target) {
            return result;
        }

        if (state.expansions >= state.maxExpansions) {
            throw new Error(
                `unroll did not terminate after ${state.maxExpansions} expansions: ` +
                    `the instances of '${target.of.name}' keep coming — ` +
                    "is the recursion bounded?"
            );
        }

        state.expansions++;

        result = replace(
            result,
            target,
            expandFully(normalizeInstance(target), state)
        );
    }
}

export function unroll(tree, { maxExpansions = 1000 } = {}) {
    /* the memo tables: definition closure → Map of key → fully
    unrolled expansion, or null for a definition the heuristic
    declined. created here, shared by the nested unrollings of
    expandFully, discarded when the unrolling is done. */
    const state = { memos: new Map(), expansions: 0, maxExpansions };

    return unrollLoop(tree, state);
}
