/* simplify

a deliberately shallow canonicalization pass, working bottom-up and sharing
unchanged subtrees with the input. the generic rules live here:

- constant folding for calls whose arguments are all plain numbers.
  named constants (pi, ...) are left symbolic so "pi / 2" doesn't degrade
  into an illegible decimal, and non-finite results (1 / 0) are left alone.
- subtree sharing: a call whose arguments all simplified to themselves
  is returned as-is.

everything function-specific — the identity and annihilator rules of the
arithmetic primitives (x + 0, x * 1, x * 0, ...), double negation and sign
cancellation, self-cancellation, pulling constant factors out of nested
products — is the functions' own `simplify` hooks (operations/), which
this pass calls with the simplified arguments and a tools object of
probes and helpers. rewrites that build new nodes are re-simplified
(tools.resimplify) so reductions cascade. the probes dispatch on the
literal's own type, so the same rules apply on any type's values, and
the zeros and ones the hooks produce take the rewritten call's type. */

import { arithmetic } from "./operations/arithmetic.js";
import { copyNode, numberNode } from "./semantics/nodes.js";
import { isLiteral, treesEqual } from "./semantics/trees.js";
import { numberType, oneOf, typeOf, typeOfValue, typedCallNode, zeroOf } from "./types/index.js";

const hasValue = (node, probe) =>
    node.type === "number" && probe(node.value, numberType(node));

const isNegationOf = (node, operand) =>
    node.type === "call" &&
    node.callee.name === "negate" &&
    treesEqual(node.arguments[0], operand);

export function simplify(tree) {
    const tools = {
        isZero: (node) => hasValue(node, (value, type) => type.isZero(value)),
        isOne: (node) => hasValue(node, (value, type) => type.isOne(value)),
        isMinusOne: (node) =>
            hasValue(node, (value, type) => type.isMinusOne(value)),
        isLiteral,
        treesEqual,
        isNegationOf,
        resimplify: (node) => simplifyNode(node, tools),
        zero: (node) => numberNode(zeroOf(typeOf(node)), node.index, node.length),
        one: (node) => numberNode(oneOf(typeOf(node)), node.index, node.length),
        negate: (operand, index, length) =>
            simplifyNode(
                typedCallNode(arithmetic.negate, [operand], index, length),
                tools
            ),
    };

    return simplifyNode(tree, tools);
}

function simplifyNode(tree, tools) {
    /* a deferred diff simplifies its f; the operator itself is inert
    until its missing slot is bound */
    if (tree.type === "diff") {
        if (!tree.f) {
            return tree;
        }

        const f = simplifyNode(tree.f, tools);

        return f === tree.f ? tree : copyNode(tree, { f });
    }

    /* a cases block: simplify the cases, drop the ones with a
    literal-false condition (they can never hold, and order carries no
    meaning), and once every remaining condition is literal settle the
    block's semantics: exactly one case must hold. that fold is what
    resolves a recursion's base case in unroll. shorter than that:
    when every live case agrees on the body the conditions are
    irrelevant — whichever case holds, the value is the same. */
    if (tree.type === "cases") {
        const simplified = tree.cases.map(({ condition, body }) => ({
            condition: simplifyNode(condition, tools),
            body: simplifyNode(body, tools),
        }));

        const live = simplified.filter(
            ({ condition }) => !(isLiteral(condition) && condition.value === false)
        );

        if (live.every(({ condition }) => isLiteral(condition))) {
            const held = live.filter(({ condition }) => condition.value === true);

            if (held.length === 1) {
                return held[0].body;
            }

            throw new Error(
                held.length === 0
                    ? `No case of the cases block holds at index ${tree.index}`
                    : `${held.length} cases of the cases block hold at once; ` +
                          `exactly one must at index ${tree.index}`
            );
        }

        if (
            live.length > 0 &&
            live.every(({ body }) => treesEqual(body, live[0].body))
        ) {
            return live[0].body;
        }

        return live.length === simplified.length &&
            live.every(
                ({ condition, body }, i) =>
                    condition === tree.cases[i].condition && body === tree.cases[i].body
            )
            ? tree
            : copyNode(tree, { cases: live });
    }

    if (tree.type === "convert") {
        // a conversion of a literal folds to the lifted literal
        const operand = simplifyNode(tree.operand, tools);

        return isLiteral(operand)
            ? numberNode(tree.target.lift(operand.value), tree.index, tree.length, tree.target)
            : copyNode(tree, { operand });
    }

    if (tree.type !== "call") {
        return tree;
    }

    const args = tree.arguments.map((argument) => simplifyNode(argument, tools));

    const evaluate = tree.callee.evaluate;

    if (evaluate && args.every(isLiteral)) {
        let value = NaN;

        try {
            value = evaluate(...args.map((argument) => argument.value));
        } catch {
            // leave anything that can't be evaluated alone
        }

        if (typeOfValue(value).isFinite(value)) {
            return numberNode(value, tree.index, tree.length);
        }
    }

    /* the definition's own simplify hook. hasOwn, not ?.: every callee
    is an Expression now, and the prototype's simplify method (the
    pass, on the trees) must not be mistaken for the hook */
    const hook = Object.hasOwn(tree.callee, "simplify")
        ? tree.callee.simplify
        : undefined;

    const rewritten = hook?.(tree, args, tools);

    if (rewritten !== undefined) {
        return rewritten;
    }

    return args.some((argument, i) => argument !== tree.arguments[i])
        ? copyNode(tree, { arguments: args })
        : tree;
}
