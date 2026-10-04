/* expression — the semantic tree node, reified as a class.

every semantic tree the library builds is an Expression: the node
constructors (nodes.js) wrap their fields in this class, and every
rebuild in the passes goes through copyNode, so the free functions
that consume trees are reachable as methods on the trees themselves —

    const t = parse("x * r * (1 - x)");
    t.differentiate("x").simplify().wgsl()
    t.with("r", 3.8)        // fill in a variable, in place; returns the tree
    t.clone()               // a true deep clone
    t.pretty                // the abstract div/span tree (prettyPrint)
    t.log()                 // console.log the text form
    t.markup                // input for the $math/math module (toMath)
    await t.mathml          // rendered through $mod("math/math", ...)
    t.variables()           // ["x", "r"]

— on subtrees too: a call's callee and arguments, a cases block's
conditions and bodies, and every tree a pass returns are Expressions.
the methods are exactly the free functions with the tree in front
(t.differentiate("x") IS differentiate(t, "x")); the free functions
remain the api of the passes.

one collision, by design: a call's callee spreads its definition onto
the node (see nodes.js), so a definition's own `simplify` field — the
rewrite hook — shadows the prototype's simplify method on callee
nodes. internal callers reaching for callee.simplify want the hook;
the method is for the trees a user holds. */

import { differentiate } from "../autodiff.js";
import { canonicalize } from "../canonicalize.js";
import { toMath, toWgsl } from "../codegen.js";
import { prettyPrint, prettyToDom, prettyToText } from "../pretty.js";
import { simplify } from "../simplify.js";
import { unroll } from "../unroll.js";
import { parse } from "../core.js";
import { constantValue, foldableValue, numberNode } from "./nodes.js";
import { childrenOf, collectVariables, isLiteral, treesEqual } from "./trees.js";
import { promotable, promoteNode, typeOf } from "../types/index.js";

/* the deep clone behind .clone(): every node rebuilt (still
Expressions), literal array values copied. shared by reference: the
function definitions on callees, the type objects, the scalar value
instances (Complex, Rational, ... — treated as immutable), and
instances' definition closures. */

const cloneValue = (value) =>
    Array.isArray(value) ? value.map(cloneValue) : value;

function cloneTree(node) {
    switch (node.type) {
        case "number":
            return new Expression({ ...node, value: cloneValue(node.value) });

        case "call":
            return new Expression({
                ...node,
                callee: cloneTree(node.callee),
                arguments: node.arguments.map(cloneTree),
            });

        case "convert":
            return new Expression({ ...node, operand: cloneTree(node.operand) });

        case "cases":
            return new Expression({
                ...node,
                cases: node.cases.map(({ condition, body }) => ({
                    condition: cloneTree(condition),
                    body: cloneTree(body),
                })),
            });

        case "instance":
            return new Expression({
                ...node,
                watched: node.watched ? [...node.watched] : undefined,
                replacements: node.replacements.map((replacement) => ({
                    ...replacement,
                    tree: cloneTree(replacement.tree),
                })),
                ...(node.ambient
                    ? {
                          ambient: new Map(
                              [...node.ambient].map(([name, tree]) => [
                                  name,
                                  cloneTree(tree),
                              ])
                          ),
                      }
                    : {}),
            });

        case "diff":
            return new Expression({
                ...node,
                f: node.f ? cloneTree(node.f) : node.f,
            });

        default:
            /* the atoms: variable and function nodes copy their fields
            (a function node's definition fields share by reference) */
            return new Expression({ ...node });
    }
}

export class Expression {
    /* nodes are plain fields on the instance: { type, index, length,
    ... } — see "the data structures" in guide.md. constructed by the
    node constructors and copyNode (nodes.js), not by hand. */
    constructor(fields) {
        Object.assign(this, fields);
    }

    /* the passes */

    differentiate(withRespectTo) {
        return differentiate(this, withRespectTo);
    }

    simplify() {
        return simplify(this);
    }

    canonicalize() {
        return canonicalize(this);
    }

    unroll(options) {
        return unroll(this, options);
    }

    /* this node promoted to the target type: a re-lifted literal, or
    a convert node wrapping it (promoteNode) */
    convert(target) {
        return promoteNode(this, target);
    }

    /* with(name, value) — fill in a variable, IN PLACE: every
    occurrence of the variable in the tree is replaced and the tree
    itself is returned, so calls chain. the value may be a JS literal
    (read by the variable's own type — 10 fills a complex variable as
    10+0i), a string (parsed as an expression, with the variable's
    type as the parsed literals' default), or a semantic tree. a
    parsed or given tree must carry the variable's type or one
    promotable to it — the tree's stamped types cannot recompute
    after the fact, so the replacement has to fit the slot the
    variable leaves; it is then shared across the occurrences, the
    way a local's tree is shared. an instance's hidden variables (its
    definition's own, minus the replaced) are not nodes of this tree
    and stay untouched. errors when the name is no variable of the
    tree. */
    with(name, value) {
        /* collect the occurrences first, so a bad replacement errors
        before anything mutates */
        const occurrences = [];

        (function find(node) {
            if (node.type === "variable" && node.name === name) {
                occurrences.push(node);
                return;
            }

            for (const child of childrenOf(node)) {
                find(child);
            }
        })(this);

        if (occurrences.length === 0) {
            const known = collectVariables(this);

            throw new Error(
                `'${name}' is not a variable of the tree` +
                    (known.length ? ` (it has: ${known.join(", ")})` : "")
            );
        }

        /* a string parses once, at the first occurrence's type */
        let parsed = null;

        const replacementFor = (variable) => {
            const type = typeOf(variable);

            if (value instanceof Expression || typeof value === "string") {
                const tree =
                    value instanceof Expression
                        ? value
                        : (parsed ??= parse(value, [], [], type));
                const given = typeOf(tree);

                if (given === type) {
                    return tree;
                }

                if (promotable(given, type)) {
                    return promoteNode(tree, type);
                }

                throw new Error(
                    `Cannot fill '${name}', a ${type.name} variable, ` +
                        `with a ${given.name} tree at index ${variable.index}`
                );
            }

            let lifted;

            try {
                lifted = type.lift(value);
            } catch (error) {
                throw new Error(
                    `Cannot fill '${name}', a ${type.name} variable, ` +
                        `with the value ${String(value)}: ${error.message} ` +
                        `at index ${variable.index}`
                );
            }

            return numberNode(lifted, variable.index, variable.length, type);
        };

        const replacements = new Map(
            occurrences.map((variable) => [variable, replacementFor(variable)])
        );

        const substitute = (node) => {
            if (replacements.has(node)) {
                return replacements.get(node);
            }

            switch (node.type) {
                case "call":
                    node.arguments = node.arguments.map(substitute);
                    break;

                case "convert":
                    node.operand = substitute(node.operand);
                    break;

                case "cases":
                    for (const case_ of node.cases) {
                        case_.condition = substitute(case_.condition);
                        case_.body = substitute(case_.body);
                    }
                    break;

                case "instance":
                    for (const replacement of node.replacements) {
                        replacement.tree = substitute(replacement.tree);
                    }

                    if (node.ambient) {
                        for (const [key, tree] of node.ambient) {
                            node.ambient.set(key, substitute(tree));
                        }
                    }

                    /* the watched set tracks the replacements' free
                    variables (makeInstance's rule): recompute it, or a
                    fully bound instance would wait on names that are
                    no longer there */
                    if (node.watched !== undefined) {
                        const watched = node.of.watchedVariables;
                        const remaining = new Set(
                            watched.filter(
                                (name) =>
                                    !node.replacements.some(
                                        (replacement) => replacement.name === name
                                    )
                            )
                        );

                        for (const replacement of node.replacements) {
                            if (watched.includes(replacement.name)) {
                                for (const name of collectVariables(replacement.tree)) {
                                    remaining.add(name);
                                }
                            }
                        }

                        node.watched = [...remaining];
                    }
                    break;

                case "diff":
                    if (node.f) {
                        node.f = substitute(node.f);
                    }
                    break;
            }

            return node;
        };

        if (replacements.has(this)) {
            /* the tree is the variable itself: become the replacement */
            const replacement = replacements.get(this);

            for (const key of Object.keys(this)) {
                delete this[key];
            }

            Object.assign(this, replacement);
        } else {
            substitute(this);
        }

        return this;
    }

    /* clone() — a true deep clone of the tree: mutating the clone
    (with .with, say) never touches the original. */
    clone() {
        return cloneTree(this);
    }

    /* codegen */

    wgsl(options) {
        return toWgsl(this, options);
    }

    toMath(options) {
        return toMath(this, options);
    }

    /* the default toMath rendering — the string to hand the
    $math/math module */
    get markup() {
        return toMath(this);
    }

    /* this markup rendered by the $math/math module: a promise of its
    { dom, inline } result. needs the webui's module loader — and every
    failure (no loader, unrenderable tree) arrives as a rejection */
    get mathml() {
        return (async () => {
            const load = globalThis.$mod;

            if (!load) {
                throw new Error(
                    "mathml renders through the webui's $mod module loader, " +
                        "which is not available here — the string to hand it " +
                        'is this.markup: $mod("math/math", tree.markup)'
                );
            }

            return await load("math/math", this.markup);
        })();
    }

    /* inspection */

    get pretty() {
        return prettyPrint(this);
    }

    get text() {
        return prettyToText(this.pretty);
    }

    get dom() {
        return prettyToDom(this.pretty);
    }

    /* console.log the text form, and return the tree for chaining */
    /* renamed from "log" because it's a bit evil to have something called ".log()" on a math expression object that is unrelated to logarithms :P */
    print(options) {
        console.log(prettyToText(prettyPrint(this, options)));

        return this;
    }

    variables() {
        return collectVariables(this);
    }

    children() {
        return childrenOf(this);
    }

    typeOf() {
        return typeOf(this);
    }

    /* probes */

    equals(other) {
        return treesEqual(this, other);
    }

    isLiteral() {
        return isLiteral(this);
    }

    constantValue() {
        return constantValue(this);
    }

    foldableValue() {
        return foldableValue(this);
    }
}
