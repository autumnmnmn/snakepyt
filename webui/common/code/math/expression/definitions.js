/* definitions — the function vocabulary, one object per function.

every function the expression language knows is defined here, with
everything about it in one place: how it parses, what it computes on
floats, its derivative, how it renders in each codegen target, its
typing rule, and its rewrite rules. makeBuiltins (autodiff.js)
assembles a domain's builtin table from these plus the domain's ops;
functionNode spreads a definition onto each callee node, so the
passes — fill, simplify, canonicalize, differentiate, analyzeTypes,
codegen — read what they need straight off the callee.

the fields, all optional except name:

- name — the function's name in source and in semantic trees.
- structural: true — the function exists for tree structure rather
  than user source: the operators (which surface syntax produces)
  and the n-ary canonical forms (which canonicalize produces).
  standardFunctionsOf filters these out of the offered vocabulary.
- syntax — how an operator is spelled: { symbol, binary:
  { precedence, associativity } } for a binary operator, { symbol,
  prefix: { precedence } } for a prefix one. a spelling shared by a
  binary and a prefix operator ("-" is minus and negate) tokenizes
  once, as the binary's type; ast.js maps it to the prefix node.
  non-operator functions have no syntax; the ternary (select) and
  |x| (abs) are punctuation-driven and mapped in ast.js/fill.js.
- evaluate(...values) — the float domain's value-level semantics;
  collected into floatOps. other domains supply their own ops
  (domains.js). sum and product have none: their evaluation derives
  from the domain's plus/multiply at table assembly.
- derivative(args, derivatives, builders) → tree — the chain rule
  recipe, built out of the call's arguments and their derivatives.
  builders is arithmetic of the builtin table under construction,
  so the recipes are domain-neutral: a domain that redefines
  multiply gets product rules built from *its* multiply. the
  recipes assume a commutative arithmetic; noncommutative domains
  supply their own overrides (and see domain.commutative). absent,
  the function does not differentiate.
- template — { wgsl?, math? } per-target rendering templates with
  {0}, {1}, ... argument placeholders; only the functions not
  spelled as a plain name(arg, ...) call in a target need one.
- mathClass — the binding class of the rendered form, for math
  parenthesization: "additive", "multiplicative", "comparison",
  "negate", "atom" (the default), or "pass" (transparent: the
  operand's class).
- mathParens — { position | any: [class, ...] }: operand positions
  that get visible parens in the math target when the operand's
  mathClass is listed. positions not listed group structurally
  (fraction operands, exponents, |...|, call arguments).
- signature — the number/boolean typing rule analyzeTypes
  validates; absent means number arguments and a number result.
  { arguments: "floats" | "bools", returns } — every argument is
  that type. { arguments: "same", returns: "bool" } — the operands
  share one type (equality). { arguments: [{ type, context }, ...],
  returns } — fixed arity with per-argument types and error-message
  context.
- canonical — "sum" or "product": canonicalize flattens the call
  into that n-ary form.
- terms / factors — how a sum's terms or a product's factors are
  collected through the call: "expand" (n-ary: the arguments join
  as-is), "subtract" / "divide" (binary: the left operand joins,
  the right joins negated / inverted), "negate" (unary: the operand
  joins negated / the product's sign flips), "pass" (unary
  transparent).
- expand — "sum" or "product": codegen re-nests this n-ary
  canonical form into binary operator chains for rendering.
- simplify(tree, args, tools) → tree | undefined — the function's
  local rewrite rules; undefined means no rewrite. args are the
  already-simplified arguments. tools carries the domain-bound
  probes and helpers: { domain, table, isZero, isOne, isMinusOne,
  isLiteral, treesEqual, isNegationOf, negate, resimplify }. the
  generic rules (constant folding, subtree sharing) live in
  simplify.js itself. */

import { callNode, constantValue, functionNode, numberNode } from "./nodes.js";

/* d/dx a^b, with a constant exponent or a constant base. the constant
exponent's b-1 is computed in the domain's own arithmetic (a complex
exponent reduces to a complex literal). the constant base keeps its
log symbolic — log(2) renders as log(2) rather than a baked decimal,
and a negative real base renders log((-2)) (its value is NaN over the
reals; leaving it symbolic keeps that visible instead of crashing
codegen). a variable base with a variable exponent is rejected: over
the complexes a^b is exp(b*log(a)) by definition, but the real domain
has no such lift. shared by power and pow. */

function powerDerivative([base, exponent], [dBase, dExponent], builders) {
    const exponentValue = constantValue(exponent);

    if (exponentValue !== undefined) {
        if (!builders.ops.minus) {
            throw new Error(
                "Differentiating a constant-exponent power requires 'minus' " +
                    `at index ${base.index}`
            );
        }

        return builders.multiply(
            exponent,
            builders.multiply(
                builders.power(
                    base,
                    numberNode(builders.ops.minus(exponentValue, 1), exponent.index)
                ),
                dBase
            )
        );
    }

    const baseValue = constantValue(base);

    if (baseValue !== undefined) {
        return builders.multiply(
            builders.power(base, exponent),
            builders.multiply(builders.apply("log", base), dExponent)
        );
    }

    throw new Error(
        "Cannot differentiate a power with variable base and exponent " +
            `at index ${base.index}`
    );
}

/* the derivative of a piecewise-constant function: zero. comparisons,
logical operators, sign, the rounding functions, and step all share
it. */

const zeroDerivative = ([x], _, builders) => builders.literal(0, x);

/* the power rules of simplify, shared by power and pow. */

function powerSimplify(tree, [a, b], { isZero, isOne }) {
    if (isZero(b)) return numberNode(1, tree.index, tree.length);
    if (isOne(b)) return a;
    if (isOne(a)) return numberNode(1, tree.index, tree.length);

    return undefined;
}

/* pulling a constant factor out of a nested product: 2 * (3 * x) is
6 * x, in either nesting or argument order. multiply's simplify rule. */

function foldProductConstants(a, b, tree, tools) {
    for (const [factor, product] of [[a, b], [b, a]]) {
        if (
            !tools.isLiteral(factor) ||
            product.type !== "call" ||
            product.callee.name !== "multiply"
        ) {
            continue;
        }

        const [x, y] = product.arguments;

        for (const [constant, rest] of [[x, y], [y, x]]) {
            if (tools.isLiteral(constant)) {
                return callNode(
                    tools.table.multiply,
                    [
                        numberNode(
                            tools.domain.ops.multiply(factor.value, constant.value),
                            tree.index
                        ),
                        rest,
                    ],
                    tree.index,
                    tree.length
                );
            }
        }
    }

    return null;
}

export const definitions = [
    /* the arithmetic operators. subtraction and division canonicalize
    with their operations: minus is a sum with the right term negated,
    divide a product with the right factor inverted. */

    {
        name: "plus",
        structural: true,
        syntax: { symbol: "+", binary: { precedence: 10, associativity: "left" } },
        evaluate: (a, b) => a + b,
        derivative: ([x, y], [dx, dy], builders) => builders.plus(dx, dy),
        template: { wgsl: "({0} + {1})", math: "{0} + {1}" },
        mathClass: "additive",
        mathParens: { 1: ["negate"] },
        canonical: "sum",
        terms: "expand",
        simplify: (tree, [a, b], tools) => {
            if (tools.isZero(a)) return b;
            if (tools.isZero(b)) return a;

            if (tools.isNegationOf(a, b) || tools.isNegationOf(b, a)) {
                return numberNode(0, tree.index, tree.length);
            }

            // a sum with a negated right term is a subtraction
            if (b.type === "call" && b.callee.name === "negate") {
                return tools.resimplify({
                    ...tree,
                    callee: functionNode(tools.table.minus, tree.index, 0),
                    arguments: [a, b.arguments[0]],
                });
            }

            return undefined;
        },
    },

    {
        name: "minus",
        structural: true,
        syntax: { symbol: "-", binary: { precedence: 10, associativity: "left" } },
        evaluate: (a, b) => a - b,
        derivative: ([x, y], [dx, dy], builders) => builders.minus(dx, dy),
        template: { wgsl: "({0} - {1})", math: "{0} - {1}" },
        mathClass: "additive",
        mathParens: { 1: ["additive", "negate"] },
        canonical: "sum",
        terms: "subtract",
        simplify: (tree, [a, b], tools) => {
            if (tools.isZero(b)) return a;
            if (tools.isZero(a)) return tools.negate(b, tree.index, tree.length);

            if (tools.treesEqual(a, b)) {
                return numberNode(0, tree.index, tree.length);
            }

            // subtracting a negation adds
            if (b.type === "call" && b.callee.name === "negate") {
                return tools.resimplify({
                    ...tree,
                    callee: functionNode(tools.table.plus, tree.index, 0),
                    arguments: [a, b.arguments[0]],
                });
            }

            return undefined;
        },
    },

    {
        name: "multiply",
        structural: true,
        syntax: { symbol: "*", binary: { precedence: 20, associativity: "left" } },
        evaluate: (a, b) => a * b,
        derivative: ([x, y], [dx, dy], builders) =>
            builders.plus(builders.multiply(x, dy), builders.multiply(y, dx)),
        template: { wgsl: "({0} * {1})", math: "{0} dot {1}" },
        mathClass: "multiplicative",
        mathParens: { any: ["additive"] },
        canonical: "product",
        factors: "expand",
        simplify: (tree, [a, b], tools) => {
            if (tools.isZero(a) || tools.isZero(b)) {
                return numberNode(0, tree.index, tree.length);
            }

            if (tools.isOne(a)) return b;
            if (tools.isOne(b)) return a;
            if (tools.isMinusOne(a)) return tools.negate(b, tree.index, tree.length);
            if (tools.isMinusOne(b)) return tools.negate(a, tree.index, tree.length);

            const folded = foldProductConstants(a, b, tree, tools);

            if (folded) {
                return tools.resimplify(folded);
            }

            return undefined;
        },
    },

    {
        name: "divide",
        structural: true,
        syntax: { symbol: "/", binary: { precedence: 20, associativity: "left" } },
        evaluate: (a, b) => a / b,
        derivative: ([x, y], [dx, dy], builders) =>
            builders.divide(
                builders.minus(builders.multiply(dx, y), builders.multiply(x, dy)),
                builders.multiply(y, y)
            ),
        template: { wgsl: "({0} / {1})", math: "{{0}}/{{1}}" },
        canonical: "product",
        factors: "divide",
        simplify: (tree, [a, b], tools) => {
            if (tools.isZero(a)) {
                return numberNode(0, tree.index, tree.length);
            }

            if (tools.isOne(b)) return a;
            if (tools.isMinusOne(b)) return tools.negate(a, tree.index, tree.length);

            if (tools.treesEqual(a, b)) {
                return numberNode(1, tree.index, tree.length);
            }

            return undefined;
        },
    },

    {
        name: "power",
        structural: true,
        syntax: { symbol: "^", binary: { precedence: 30, associativity: "right" } },
        evaluate: (a, b) => a ** b,
        derivative: powerDerivative,
        template: { wgsl: "pow({0}, {1})", math: "{{0}}^{{1}}" },
        mathParens: { 0: ["additive", "multiplicative", "negate"] },
        simplify: powerSimplify,
    },

    {
        name: "negate",
        structural: true,
        syntax: { symbol: "-", prefix: { precedence: 25 } },
        evaluate: (a) => -a,
        derivative: ([x], [dx], builders) => builders.negate(dx),
        template: { wgsl: "(-{0})", math: "-{0}" },
        mathClass: "negate",
        mathParens: { any: ["additive", "negate"] },
        canonical: "sum",
        terms: "negate",
        factors: "negate",
        simplify: (tree, [a]) =>
            a.type === "call" && a.callee.name === "negate"
                ? a.arguments[0]
                : undefined,
    },

    {
        name: "positive",
        structural: true,
        syntax: { symbol: "+", prefix: { precedence: 25 } },
        evaluate: (a) => a,
        derivative: ([x], [dx]) => dx,
        template: { wgsl: "{0}", math: "{0}" },
        mathClass: "pass",
        canonical: "sum",
        terms: "pass",
        factors: "pass",
        simplify: (tree, [a]) => a,
    },

    /* comparisons and logical operators produce booleans; select
    consumes one. for differentiation the conditionals are
    piecewise-constant: their derivatives are zero, and select
    differentiates its branches. */

    {
        name: "less",
        structural: true,
        syntax: { symbol: "<", binary: { precedence: 8, associativity: "left" } },
        evaluate: (a, b) => a < b,
        derivative: zeroDerivative,
        template: { wgsl: "({0} < {1})", math: "{0} < {1}" },
        mathClass: "comparison",
        signature: { arguments: "floats", returns: "bool" },
    },

    {
        name: "lessEqual",
        structural: true,
        syntax: { symbol: "<=", binary: { precedence: 8, associativity: "left" } },
        evaluate: (a, b) => a <= b,
        derivative: zeroDerivative,
        template: { wgsl: "({0} <= {1})", math: "{0} <= {1}" },
        mathClass: "comparison",
        signature: { arguments: "floats", returns: "bool" },
    },

    {
        name: "greater",
        structural: true,
        syntax: { symbol: ">", binary: { precedence: 8, associativity: "left" } },
        evaluate: (a, b) => a > b,
        derivative: zeroDerivative,
        template: { wgsl: "({0} > {1})", math: "{0} > {1}" },
        mathClass: "comparison",
        signature: { arguments: "floats", returns: "bool" },
    },

    {
        name: "greaterEqual",
        structural: true,
        syntax: { symbol: ">=", binary: { precedence: 8, associativity: "left" } },
        evaluate: (a, b) => a >= b,
        derivative: zeroDerivative,
        template: { wgsl: "({0} >= {1})", math: "{0} >= {1}" },
        mathClass: "comparison",
        signature: { arguments: "floats", returns: "bool" },
    },

    {
        name: "equal",
        structural: true,
        syntax: { symbol: "==", binary: { precedence: 7, associativity: "left" } },
        evaluate: (a, b) => a === b,
        derivative: zeroDerivative,
        template: { wgsl: "({0} == {1})", math: "{0} = {1}" },
        mathClass: "comparison",
        mathParens: { any: ["comparison"] },
        signature: { arguments: "same", returns: "bool" },
    },

    {
        name: "notEqual",
        structural: true,
        syntax: { symbol: "!=", binary: { precedence: 7, associativity: "left" } },
        evaluate: (a, b) => a !== b,
        derivative: zeroDerivative,
        template: { wgsl: "({0} != {1})", math: "{0} != {1}" },
        mathClass: "comparison",
        mathParens: { any: ["comparison"] },
        signature: { arguments: "same", returns: "bool" },
    },

    {
        name: "and",
        structural: true,
        syntax: { symbol: "&&", binary: { precedence: 5, associativity: "left" } },
        evaluate: (a, b) => a && b,
        derivative: zeroDerivative,
        template: { wgsl: "({0} && {1})" },
        signature: { arguments: "bools", returns: "bool" },
    },

    {
        name: "or",
        structural: true,
        syntax: { symbol: "||", binary: { precedence: 4, associativity: "left" } },
        evaluate: (a, b) => a || b,
        derivative: zeroDerivative,
        template: { wgsl: "({0} || {1})" },
        signature: { arguments: "bools", returns: "bool" },
    },

    {
        name: "not",
        structural: true,
        syntax: { symbol: "!", prefix: { precedence: 25 } },
        evaluate: (a) => !a,
        derivative: zeroDerivative,
        template: { wgsl: "(!{0})" },
        signature: {
            arguments: [{ type: "bool", context: "The operand of 'not'" }],
            returns: "bool",
        },
    },

    /* the ternary's function. wgsl's select takes its condition last,
    hence the argument shuffle in the template. */

    {
        name: "select",
        evaluate: (condition, then, otherwise) => (condition ? then : otherwise),
        derivative: ([condition], [, dThen, dOtherwise], builders) =>
            builders.apply("select", condition, dThen, dOtherwise),
        template: { wgsl: "select({2}, {1}, {0})" },
        signature: {
            arguments: [
                { type: "bool", context: "The condition of a ternary/select" },
                { type: "float", context: "A branch of a ternary/select" },
                { type: "float", context: "A branch of a ternary/select" },
            ],
            returns: "float",
        },
        simplify: (tree, args, { treesEqual }) =>
            // both branches agree — the condition is irrelevant
            treesEqual(args[1], args[2]) ? args[1] : undefined,
    },

    /* the n-ary canonical forms. surface syntax never produces these;
    canonicalize flattens additive and multiplicative chains into them,
    and codegen re-nests them for rendering. they define their own
    derivatives, so differentiate composes with canonicalize. their
    evaluate is derived at table assembly from the domain's plus and
    multiply. */

    {
        name: "sum",
        structural: true,
        derivative: (args, derivatives, builders) =>
            callNode(builders.table.sum, derivatives, args[0]?.index ?? 0),
        mathClass: "additive",
        canonical: "sum",
        terms: "expand",
        expand: "sum",
    },

    {
        name: "product",
        structural: true,
        derivative: (args, derivatives, builders) =>
            callNode(
                builders.table.sum,
                args.map((factor, differentiated) =>
                    callNode(
                        builders.table.product,
                        args.map((other, i) =>
                            i === differentiated ? derivatives[differentiated] : other
                        ),
                        factor.index
                    )
                ),
                args[0]?.index ?? 0
            ),
        mathClass: "multiplicative",
        canonical: "product",
        factors: "expand",
        expand: "product",
    },

    /* the functions of the standard vocabulary, in floatOps order. */

    {
        name: "abs",
        evaluate: Math.abs,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("sign", x), dx),
        template: { math: "|{0}|" },
    },

    {
        name: "sign",
        evaluate: Math.sign,
        derivative: zeroDerivative,
    },

    {
        name: "sqrt",
        evaluate: Math.sqrt,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.multiply(builders.literal(2, x), builders.apply("sqrt", x))
            ),
        template: { math: "{{0}} root 2" },
    },

    {
        name: "inverseSqrt",
        evaluate: (x) => 1 / Math.sqrt(x),
        derivative: ([x], [dx], builders) =>
            builders.negate(
                builders.divide(
                    dx,
                    builders.multiply(
                        builders.literal(2, x),
                        builders.power(x, builders.literal(1.5, x))
                    )
                )
            ),
    },

    {
        name: "exp",
        evaluate: Math.exp,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("exp", x), dx),
    },

    {
        name: "exp2",
        evaluate: (x) => 2 ** x,
        derivative: ([x], [dx], builders) =>
            builders.multiply(
                builders.multiply(builders.apply("exp2", x), builders.literal(Math.LN2, x)),
                dx
            ),
    },

    {
        name: "log",
        evaluate: Math.log,
        derivative: ([x], [dx], builders) => builders.divide(dx, x),
    },

    {
        name: "log2",
        evaluate: Math.log2,
        derivative: ([x], [dx], builders) =>
            builders.divide(dx, builders.multiply(x, builders.literal(Math.LN2, x))),
    },

    {
        name: "sin",
        evaluate: Math.sin,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("cos", x), dx),
    },

    {
        name: "cos",
        evaluate: Math.cos,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.negate(builders.apply("sin", x)), dx),
    },

    {
        name: "tan",
        evaluate: Math.tan,
        derivative: ([x], [dx], builders) =>
            builders.divide(dx, builders.square(builders.apply("cos", x))),
    },

    {
        name: "asin",
        evaluate: Math.asin,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.apply(
                    "sqrt",
                    builders.minus(builders.literal(1, x), builders.square(x))
                )
            ),
    },

    {
        name: "acos",
        evaluate: Math.acos,
        derivative: ([x], [dx], builders) =>
            builders.negate(
                builders.divide(
                    dx,
                    builders.apply(
                        "sqrt",
                        builders.minus(builders.literal(1, x), builders.square(x))
                    )
                )
            ),
    },

    {
        name: "atan",
        evaluate: Math.atan,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.plus(builders.literal(1, x), builders.square(x))
            ),
    },

    {
        name: "atan2",
        evaluate: Math.atan2,
        derivative: ([y, x], [dy, dx], builders) =>
            builders.divide(
                builders.minus(builders.multiply(x, dy), builders.multiply(y, dx)),
                builders.plus(builders.square(x), builders.square(y))
            ),
    },

    {
        name: "sinh",
        evaluate: Math.sinh,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("cosh", x), dx),
    },

    {
        name: "cosh",
        evaluate: Math.cosh,
        derivative: ([x], [dx], builders) =>
            builders.multiply(builders.apply("sinh", x), dx),
    },

    {
        name: "tanh",
        evaluate: Math.tanh,
        derivative: ([x], [dx], builders) =>
            builders.divide(dx, builders.square(builders.apply("cosh", x))),
    },

    {
        name: "asinh",
        evaluate: Math.asinh,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.apply(
                    "sqrt",
                    builders.plus(builders.square(x), builders.literal(1, x))
                )
            ),
    },

    {
        name: "acosh",
        evaluate: Math.acosh,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.apply(
                    "sqrt",
                    builders.minus(builders.square(x), builders.literal(1, x))
                )
            ),
    },

    {
        name: "atanh",
        evaluate: Math.atanh,
        derivative: ([x], [dx], builders) =>
            builders.divide(
                dx,
                builders.minus(builders.literal(1, x), builders.square(x))
            ),
    },

    {
        name: "floor",
        evaluate: Math.floor,
        derivative: zeroDerivative,
    },

    {
        name: "ceil",
        evaluate: Math.ceil,
        derivative: zeroDerivative,
    },

    {
        name: "round",
        evaluate: (x) => Math.sign(x) * Math.round(Math.abs(x)),
        derivative: zeroDerivative,
    },

    {
        name: "trunc",
        evaluate: Math.trunc,
        derivative: zeroDerivative,
    },

    {
        name: "fract",
        evaluate: (x) => x - Math.floor(x),
        derivative: ([x], [dx]) => dx,
    },

    {
        name: "min",
        evaluate: Math.min,
        derivative: ([x, y], [dx, dy], builders) =>
            builders.divide(
                builders.minus(
                    builders.plus(dx, dy),
                    builders.multiply(
                        builders.apply("sign", builders.minus(x, y)),
                        builders.minus(dx, dy)
                    )
                ),
                builders.literal(2, x)
            ),
    },

    {
        name: "max",
        evaluate: Math.max,
        derivative: ([x, y], [dx, dy], builders) =>
            builders.divide(
                builders.plus(
                    builders.plus(dx, dy),
                    builders.multiply(
                        builders.apply("sign", builders.minus(x, y)),
                        builders.minus(dx, dy)
                    )
                ),
                builders.literal(2, x)
            ),
    },

    {
        name: "clamp",
        evaluate: (x, low, high) => Math.min(Math.max(x, low), high),
        derivative: ([x, low, high], [dx, dLow, dHigh], builders) =>
            builders.table.min.derivative(
                [builders.apply("max", x, low), high],
                [builders.table.max.derivative([x, low], [dx, dLow]), dHigh]
            ),
    },

    {
        name: "saturate",
        evaluate: (x) => Math.min(Math.max(x, 0), 1),
        derivative: ([x], [dx], builders) =>
            builders.table.clamp.derivative(
                [x, builders.literal(0, x), builders.literal(1, x)],
                [dx, builders.literal(0, x), builders.literal(0, x)]
            ),
    },

    {
        name: "mix",
        evaluate: (x, y, a) => x * (1 - a) + y * a,
        derivative: ([x, y, amount], [dx, dy, dAmount], builders) =>
            builders.plus(
                dx,
                builders.plus(
                    builders.multiply(amount, builders.minus(dy, dx)),
                    builders.multiply(dAmount, builders.minus(y, x))
                )
            ),
    },

    {
        name: "step",
        evaluate: (edge, x) => (x < edge ? 0 : 1),
        derivative: zeroDerivative,
    },

    {
        name: "smoothstep",
        evaluate: (low, high, x) => {
            const t = Math.min(Math.max((x - low) / (high - low), 0), 1);

            return t * t * (3 - 2 * t);
        },
        derivative: ([low, high, x], [dLow, dHigh, dx], builders) => {
            const span = builders.minus(high, low);
            const t = builders.divide(builders.minus(x, low), span);
            const dt = builders.divide(
                builders.minus(
                    builders.multiply(builders.minus(dx, dLow), span),
                    builders.multiply(
                        builders.minus(x, low),
                        builders.minus(dHigh, dLow)
                    )
                ),
                builders.square(span)
            );
            const window = builders.multiply(
                builders.apply("step", low, x),
                builders.minus(builders.literal(1, x), builders.apply("step", high, x))
            );

            return builders.multiply(
                window,
                builders.multiply(
                    builders.multiply(builders.literal(6, x), builders.multiply(t, builders.minus(builders.literal(1, x), t))),
                    dt
                )
            );
        },
    },

    /* pow is power's user-callable spelling (wgsl's pow matches it);
    they share the derivative and rewrite rules. */

    {
        name: "pow",
        evaluate: (a, b) => a ** b,
        derivative: powerDerivative,
        template: { math: "{{0}}^{{1}}" },
        simplify: powerSimplify,
    },

    {
        name: "radians",
        evaluate: (x) => (x * Math.PI) / 180,
        derivative: ([x], [dx], builders) =>
            builders.multiply(dx, builders.literal(Math.PI / 180, x)),
    },

    {
        name: "degrees",
        evaluate: (x) => (x * 180) / Math.PI,
        derivative: ([x], [dx], builders) =>
            builders.multiply(dx, builders.literal(180 / Math.PI, x)),
    },
];

export const definitionByName = Object.fromEntries(
    definitions.map((definition) => [definition.name, definition])
);
