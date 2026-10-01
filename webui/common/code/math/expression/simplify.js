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
products — is the functions' own `simplify` hooks (definitions.js), which
this pass calls with the simplified arguments and a tools object of
domain-bound probes and helpers. rewrites that build new nodes are
re-simplified (tools.resimplify) so reductions cascade. the probes run
through the tree's domain (default float), so the same rules apply on any
domain's values. */

import { floatDomain } from "./autodiff.js";
import { callNode, numberNode } from "./nodes.js";
import { isLiteral, treesEqual } from "./trees.js";

const hasValue = (node, probe) =>
    node.type === "number" && probe(node.value);

const isNegationOf = (node, operand, domain) =>
    node.type === "call" &&
    node.callee.name === "negate" &&
    treesEqual(node.arguments[0], operand, domain);

export function simplify(tree, domain = floatDomain) {
    const tools = {
        domain,
        table: domain.builtins,
        isZero: (node) => hasValue(node, domain.isZero),
        isOne: (node) => hasValue(node, domain.isOne),
        isMinusOne: (node) => hasValue(node, domain.isMinusOne),
        isLiteral,
        treesEqual: (a, b) => treesEqual(a, b, domain),
        isNegationOf: (node, operand) => isNegationOf(node, operand, domain),
        resimplify: (node) => simplifyNode(node, tools),
        negate: (operand, index, length) =>
            simplifyNode(
                callNode(domain.builtins.negate, [operand], index, length),
                tools
            ),
    };

    return simplifyNode(tree, tools);
}

function simplifyNode(tree, tools) {
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

        if (tools.domain.isFinite(value)) {
            return numberNode(value, tree.index, tree.length);
        }
    }

    const rewritten = tree.callee.simplify?.(tree, args, tools);

    if (rewritten !== undefined) {
        return rewritten;
    }

    return args.some((argument, i) => argument !== tree.arguments[i])
        ? { ...tree, arguments: args }
        : tree;
}
