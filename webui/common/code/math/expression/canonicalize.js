/* canonicalize

flattens additive and multiplicative chains into n-ary sum and product
nodes: subtraction joins the sum with its right operand negated,
division joins the product with its right operand raised to -1. literal
constants fold — a sum's literals fold into one signed constant, which
takes the position of the first constant term (1 + x + 2 → 3 + x, and
x + 2 + 1 → x + 3); a product's literals fold into one constant factor
per side of the fraction. equal terms with opposite signs cancel, and
equal factors on opposite sides of a fraction cancel. a product's
numerator and denominator constants cross-reduce when the domain
reports an exact quotient (for floats: 2*x/4 is 0.5*x, but 2*x/3 keeps
its fraction). unlike simplify this re-associates, which for floats can
shift rounding; term order is otherwise preserved, and named constants
stay symbolic. idempotent, and composes with differentiate: sum and
product define their own derivatives. the folds and identity probes run
through the tree's domain; a domain with commutative: false keeps its
products associated.

which calls flatten into which form is the functions' own business:
a callee's `canonical` tag ("sum" | "product") selects the pass, and
its `terms`/`factors` tags say how terms and factors collect through
it ("expand", "subtract"/"divide", "negate", "pass" — see
definitions.js). */

import { floatDomain } from "./autodiff.js";
import { callNode, numberNode } from "./nodes.js";
import { foldableValue, isLiteral, treesEqual } from "./trees.js";
import { simplify } from "./simplify.js";

/* if node is a power with a negative literal exponent, its inverse:
{ base, exponent } with the sign flipped positive. the exponent must
be real by the domain's lights (a complex literal exponent qualifies
only if its imaginary part is zero). shared with codegen, which
partitions product factors the same way. */

export function inverseOf(node, domain = floatDomain) {
    if (
        node.type === "call" &&
        (node.callee.name === "power" || node.callee.name === "pow") &&
        isLiteral(node.arguments[1])
    ) {
        const exponent = domain.asReal(node.arguments[1].value);

        if (exponent !== undefined && exponent < 0) {
            return {
                base: node.arguments[0],
                exponent: -exponent,
            };
        }
    }

    return null;
}

function collectTerms(node, sign, terms) {
    if (node.type === "call") {
        switch (node.callee.terms) {
            case "expand":
                for (const argument of node.arguments) {
                    collectTerms(argument, sign, terms);
                }

                return;

            case "subtract":
                collectTerms(node.arguments[0], sign, terms);
                collectTerms(node.arguments[1], -sign, terms);
                return;

            case "negate":
                collectTerms(node.arguments[0], -sign, terms);
                return;

            case "pass":
                collectTerms(node.arguments[0], sign, terms);
                return;
        }
    }

    terms.push({ sign, node });
}

function collectFactors(node, side, context, factors) {
    if (node.type === "call") {
        switch (node.callee.factors) {
            case "expand":
                for (const argument of node.arguments) {
                    collectFactors(argument, side, context, factors);
                }

                return;

            case "divide":
                collectFactors(node.arguments[0], side, context, factors);
                collectFactors(node.arguments[1], -side, context, factors);
                return;

            case "negate":
                context.sign = -context.sign;
                collectFactors(node.arguments[0], side, context, factors);
                return;

            case "pass":
                collectFactors(node.arguments[0], side, context, factors);
                return;
        }
    }

    factors.push({ side, node });
}

/* drops pairs of equal nodes with opposite signs. */

function cancelSigned(pairs, domain) {
    const kept = [];
    const used = new Set();

    for (let i = 0; i < pairs.length; i++) {
        if (used.has(i)) continue;

        let cancelled = false;

        for (let j = i + 1; j < pairs.length; j++) {
            if (used.has(j)) continue;

            if (
                pairs[i].sign !== pairs[j].sign &&
                treesEqual(pairs[i].node, pairs[j].node, domain)
            ) {
                used.add(j);
                cancelled = true;
                break;
            }
        }

        if (!cancelled) kept.push(pairs[i]);
    }

    return kept;
}

function canonicalSum(tree, domain) {
    const collected = [];
    collectTerms(tree, 1, collected);

    const ops = domain.ops;

    let constant;
    let constantAt = -1;
    let fold = true;
    const terms = [];

    for (const { sign, node } of collected) {
        let term = canonicalize(node, domain);
        let termSign = sign;

        // a negated term merges its sign into the sum
        if (term.type === "call" && term.callee.name === "negate") {
            termSign = -termSign;
            term = term.arguments[0];
        }

        if (isLiteral(term) && fold) {
            const signed = termSign < 0 ? ops.negate(term.value) : term.value;
            const next =
                constant === undefined ? signed : ops.plus(constant, signed);

            if (domain.isFinite(next)) {
                constant = next;

                if (constantAt === -1) {
                    constantAt = terms.length;
                }

                continue;
            }

            fold = false;
        }

        terms.push({ sign: termSign, node: term });
    }

    const kept = cancelSigned(terms, domain);

    if (constant !== undefined && !domain.isZero(constant)) {
        const { sign, value } = domain.splitSign(constant);

        kept.splice(Math.min(constantAt, kept.length), 0, {
            sign,
            node: numberNode(value, tree.index),
        });
    }

    if (kept.length === 0) {
        return numberNode(0, tree.index, tree.length);
    }

    const nodes = kept.map(({ sign, node }) =>
        sign > 0
            ? node
            : callNode(domain.builtins.negate, [node], node.index, node.length)
    );

    return nodes.length === 1
        ? nodes[0]
        : callNode(domain.builtins.sum, nodes, tree.index, tree.length);
}

function canonicalProduct(tree, domain) {
    const context = { sign: 1 };
    const collected = [];
    collectFactors(tree, 1, context, collected);

    const ops = domain.ops;

    // each side's literals fold into that side's own constant
    let numeratorConstant;
    let denominatorConstant;
    let hasNumeratorConstant = false;
    let hasDenominatorConstant = false;
    const entries = [];

    for (const { side, node } of collected) {
        let factor = canonicalize(node, domain);

        // a negated factor flips the product's sign instead of
        // surviving as a factor: x * -(y) is -(x * y)
        if (factor.type === "call" && factor.callee.name === "negate") {
            context.sign = -context.sign;
            factor = factor.arguments[0];
        }

        // a power with a negative literal exponent flips sides:
        // x * y^-1 is a numerator x over a denominator y
        const inverse = inverseOf(factor, domain);
        const base = inverse ? inverse.base : factor;
        const exponent = inverse ? inverse.exponent : 1;
        const isDenominator = side < 0 !== Boolean(inverse);

        if (isLiteral(base)) {
            const value = ops.power(base.value, exponent);
            const previous = isDenominator
                ? denominatorConstant
                : numeratorConstant;
            const next =
                previous === undefined ? value : ops.multiply(previous, value);

            if (domain.isFinite(next)) {
                if (isDenominator) {
                    denominatorConstant = next;
                    hasDenominatorConstant = true;
                } else {
                    numeratorConstant = next;
                    hasNumeratorConstant = true;
                }

                continue;
            }
        }

        entries.push({
            sign: isDenominator ? -1 : 1,
            node: base,
            exponent,
        });
    }

    if (hasNumeratorConstant && domain.isZero(numeratorConstant)) {
        return numberNode(0, tree.index, tree.length);
    }

    // numerator and denominator constants cross-reduce when the domain
    // can divide them exactly: 2*x/4 is 0.5*x, but 2*x/3 keeps its
    // fraction
    if (hasNumeratorConstant && hasDenominatorConstant) {
        const quotient = domain.crossReduce(
            numeratorConstant,
            denominatorConstant
        );

        if (quotient !== undefined) {
            numeratorConstant = quotient;
            hasDenominatorConstant = false;
        }
    }

    // exact-inverse pairs cancel; powers stay (x over x^2 is fine)
    const kept = cancelSigned(
        entries.filter((factor) => factor.exponent === 1),
        domain
    );

    const numerator = [
        ...entries.filter((factor) => factor.exponent !== 1 && factor.sign > 0),
        ...kept.filter((factor) => factor.sign > 0),
    ];
    const denominator = [
        ...entries.filter((factor) => factor.exponent !== 1 && factor.sign < 0),
        ...kept.filter((factor) => factor.sign < 0),
    ];

    let sign = context.sign;

    // -1 on either side factors out as a negation
    if (hasNumeratorConstant && domain.isMinusOne(numeratorConstant)) {
        sign = -sign;
        hasNumeratorConstant = false;
    }

    if (hasDenominatorConstant && domain.isMinusOne(denominatorConstant)) {
        sign = -sign;
        hasDenominatorConstant = false;
    }

    const applyExponent = ({ node, exponent }) =>
        exponent === 1
            ? node
            : callNode(
                  domain.builtins.power,
                  [node, numberNode(exponent, node.index)],
                  node.index
              );

    const factors = [];

    if (
        hasNumeratorConstant &&
        (!domain.isOne(numeratorConstant) ||
            (numerator.length === 0 && denominator.length === 0))
    ) {
        factors.push(
            numberNode(
                sign < 0 ? ops.negate(numeratorConstant) : numeratorConstant,
                tree.index
            )
        );
        sign = 1;
    }

    factors.push(...numerator.map(applyExponent));

    if (hasDenominatorConstant && !domain.isOne(denominatorConstant)) {
        factors.push(
            callNode(
                domain.builtins.power,
                [
                    numberNode(denominatorConstant, tree.index),
                    numberNode(-1, tree.index),
                ],
                tree.index
            )
        );
    }

    for (const factor of denominator) {
        factors.push(
            callNode(
                domain.builtins.power,
                [factor.node, numberNode(-factor.exponent, factor.node.index)],
                factor.node.index
            )
        );
    }

    if (factors.length === 0) {
        return numberNode(sign, tree.index, tree.length);
    }

    // a fully constant product folds to one literal — this is what
    // collapses a lone 2^-1 (from x/y*y/2/x) to 0.5. anything with a
    // non-constant factor keeps its shape: x/3 renders as a fraction,
    // not x * 0.333...
    const values = factors.map(foldableValue);

    if (!values.includes(undefined)) {
        const folded = values.reduce((product, factor) =>
            ops.multiply(product, factor)
        );
        const value = sign < 0 ? ops.negate(folded) : folded;

        if (domain.isFinite(value)) {
            return numberNode(value, tree.index, tree.length);
        }
    }

    const result =
        factors.length === 1
            ? factors[0]
            : callNode(domain.builtins.product, factors, tree.index, tree.length);

    return sign > 0
        ? result
        : callNode(domain.builtins.negate, [result], tree.index, tree.length);
}

export function canonicalize(tree, domain = floatDomain) {
    if (tree.type !== "call") {
        return tree;
    }

    switch (tree.callee.canonical) {
        case "sum":
            return canonicalSum(tree, domain);

        case "product":
            if (domain.commutative !== false) {
                return canonicalProduct(tree, domain);
            }
        // a noncommutative product keeps its association: fall through
        // to the default branch, which canonicalizes the factors only

        default: {
            const args = tree.arguments.map((argument) =>
                canonicalize(argument, domain)
            );

            const next = args.some((argument, i) => argument !== tree.arguments[i])
                ? { ...tree, arguments: args }
                : tree;

            return simplify(next, domain);
        }
    }
}
