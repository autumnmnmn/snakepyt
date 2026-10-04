/* operations — the function vocabulary, one definition per function,
organized by category: arithmetic.js (the arithmetic operators and the
shared power/quotient recipes), comparison.js (comparisons, logic,
select), canonical.js (the n-ary sum/product canonical forms),
elementary.js (abs, sign, roots, exp/log, trig, hyperbolic),
rounding.js, shaping.js (min/max/clamp/mix/step/smoothstep), linear.js
(dot, cross, length, normalize, transpose, determinant, inverse).
helpers.js carries the machinery the definitions are written with.

every function the expression language knows is defined here, with
everything about it in one place: how it parses, which combinations of
types make sense for it, what it computes for each of them, its
derivative, how it renders in each codegen target, and its rewrite
rules. typedCallNode (types/) resolves a call against a definition's
cases and stamps the case-specialized definition onto the callee node,
so the passes — fill, simplify, canonicalize, differentiate, codegen —
read what they need straight off the callee.

the fields, all optional except name:

- name — the function's name in source and in semantic trees. stamped
  from the object key by define() (helpers.js).
- structural: true — the function exists for tree structure rather
  than user source: the operators (which surface syntax produces)
  and the n-ary canonical forms (which canonicalize produces).
  standardFunctions filters these out of the offered vocabulary.
- syntax — how an operator is spelled: { symbol, binary:
  { precedence, associativity } } for a binary operator, { symbol,
  prefix: { precedence } } for a prefix one. a spelling shared by a
  binary and a prefix operator ("-" is minus and negate) tokenizes
  once, as the binary's type; syntax/ast.js maps it to the prefix
  node.
  non-operator functions have no syntax; the ternary (shorthand for
  a two-case block, filled in semantics/fill.js) and |x| (abs) are
  punctuation-driven, mapped in syntax/ast.js and semantics/fill.js.
  select — the conditional primitive codegen renders cases blocks
  with — is structural: surface conditionals are the ternary and
  `cases`.
- evaluate(...values) — the FLOAT case's value-level semantics, and
  the base case's arity. functions that do not accept floats
  (and/or/not, select, dot, ...) have no top-level evaluate: their
  cases are the whole story.
- returns — the base case's result type when it is not float
  (comparisons return boolType).
- cases — the other combinations of types the function accepts, each
  { arguments, returns, evaluate, ...specialized fields }. argument
  patterns: a type object matches exactly; "vector"/"matrix"/"tensor"
  match the tensors of that dimension count ("tensor" any of them;
  repeats unify on dimensions, floats promote into them); "same"
  unifies all such arguments to one type. returns is a type object,
  "arguments" (the unified argument type), or a function of the
  promoted argument types. instead of patterns, a case may
  supply match: (argTypes) → { returns, promotes? } | null (matmul's
  inner dimensions), and variadic: true applies a single pattern to
  every argument (sum, product). { pointwise: true } is sugar for the
  float behavior lifted over vector components. any other field
  (template, derivative, ...) specializes the definition for the case;
  templates merge per-target. see types/resolve.js for resolution.
- derivative(args, derivatives, builders) → tree — the chain rule
  recipe, built out of the call's arguments and their derivatives.
  the recipes are type-neutral: builders constructs typed calls, so a
  recipe written for floats composes complex and vector arithmetic
  through the same cases (componentwise for vectors, the complex cases
  for complex). the recipes assume a commutative arithmetic; matrix
  cases carry their own order-preserving recipes. absent, the function
  does not differentiate.
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
- canonical — "sum" or "product": canonicalize flattens the call
  into that n-ary form (products only over commutative types).
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
  already-simplified arguments. tools carries the probes and helpers:
  { isZero, isOne, isMinusOne, isLiteral, treesEqual, isNegationOf,
  negate, resimplify, zero, one }. the generic rules (constant
  folding, subtree sharing) live in simplify.js itself. */

import { numberNode } from "../semantics/nodes.js";
import { typedCallNode } from "../types/index.js";
import { arithmetic } from "./arithmetic.js";
import { canonical } from "./canonical.js";
import { comparison } from "./comparison.js";
import { elementary } from "./elementary.js";
import { linear } from "./linear.js";
import { divideDispatch, multiplyDispatch, products } from "./products.js";
import { rounding } from "./rounding.js";
import { shaping } from "./shaping.js";
export const definitions = {
    ...arithmetic,
    ...products,
    ...comparison,
    ...canonical,
    ...elementary,
    ...rounding,
    ...shaping,
    ...linear,
};

export { divideDispatch, multiplyDispatch } from "./products.js";

/* standardFunctions is everything in the vocabulary but the structural
functions — what a caller offers as the function vocabulary. */

export const standardFunctions = Object.values(definitions).filter(
    (definition) => !definition.structural
);

/* the tree builders derivative recipes are written against: typed
arithmetic over the vocabulary, so recipe-built trees resolve and
stamp their callees like any filled tree. apply looks names up in the
vocabulary; literal makes a float literal (promotion lifts it to
whatever the surrounding call needs). */

/* multiply and divide are the `*` and `/` the recipe means, dispatched
on the operand types exactly as fill does: a matmul recipe asking for
builders.multiply(dA, B) gets the matmul call. */

export const builders = {
    literal: (value, node) => numberNode(value, node.index),
    plus: (a, b) => typedCallNode(definitions.plus, [a, b], a.index),
    minus: (a, b) => typedCallNode(definitions.minus, [a, b], a.index),
    multiply: (a, b) => typedCallNode(multiplyDispatch(a, b), [a, b], a.index),
    divide: (a, b) => typedCallNode(divideDispatch(a, b), [a, b], a.index),
    power: (a, b) => typedCallNode(definitions.power, [a, b], a.index),
    negate: (a) => typedCallNode(definitions.negate, [a], a.index),
    apply: (name, ...args) => {
        const definition = definitions[name];

        if (!definition) {
            throw new Error(`'${name}' is not defined in the function vocabulary`);
        }

        return typedCallNode(definition, args, args[0].index);
    },
    square: (x) =>
        typedCallNode(definitions.power, [x, numberNode(2, x.index)], x.index),
};
