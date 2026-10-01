# the expression library

a parser, simplifier, differentiator, and code generator for
user-written math expressions. users type something like
`sin(2*pi*x) / (1 + y^2)`; the library turns that into a tree it can
simplify, differentiate symbolically, and render as wgsl (for shaders)
or as input to the $math/math module (for mathml display).

everything is plain javascript ES modules. there is no build step.

## the pipeline

```
source text
  │  tokenize.js        tokenize(source) → tokens
  ▼
tokens
  │  ast.js             buildTree(tokens, source?) → syntax tree
  ▼
syntax tree
  │  fill.js            fill(tree, source, constants, variables, functions?, domain?) → semantic tree
  ▼
semantic tree ── simplify.js / canonicalize.js (rewrite passes)
  │             ── autodiff.js    differentiate(tree, variableName)
  │             ── types.js       analyzeTypes(tree) (bool/float validation)
  ▼
codegen.js            toWgsl(tree, options) / toMath(tree, options) → string
```

`parse` (core.js) runs the first three stages in one call and returns a
semantic tree. core.js also re-exports the public api of every module;
import from core.js unless you need something it does not re-export.

## the files

- **tokenize.js** — source text to tokens. owns the punctuation
  tokens; the operator spellings come from the definitions' `syntax`
  fields. also `symbolForOperator`, for spelling a token type in an
  error message.
- **ast.js** — tokens to a syntax tree (precedence-climbing parser;
  c-like operator precedence, right-associative `^`, a ternary). the
  operator tables (precedence, associativity, prefix mapping) derive
  from the definitions' `syntax` fields.
- **fill.js** — syntax tree to semantic tree. resolves identifiers to
  constants, variables, or functions; resolves operators against the
  domain's builtin table; lifts literals onto domain values. after
  fill, every call's callee is a resolved `function` node.
- **definitions.js** — the function vocabulary: one object per
  function holding everything about it — its operator syntax, its
  float-level `evaluate`, its derivative recipe, its rendering
  templates and math parenthesization, its typing signature, and its
  rewrite rules. the field schema is documented at the top of the
  file.
- **nodes.js** — the semantic node constructors (`numberNode`,
  `functionNode`, `callNode`) and `constantValue`. `functionNode`
  spreads the whole definition onto the node, so passes read a
  function's hooks straight off the callee.
- **autodiff.js** — builtin table assembly (`makeBuiltins`,
  `makeDomain`): a domain's ops table merged with the stock
  definitions, plus the float domain and `differentiate`.
- **simplify.js** — cheap local rewrites: constant folding and
  subtree sharing here; the function-specific rules (identities,
  annihilators, cancellation) are the functions' `simplify` hooks,
  called with domain-bound probes.
- **canonicalize.js** — the normalizing pass: flattens sums and
  products into n-ary `sum`/`product` nodes, folds constants, cancels
  equal terms/factors, cross-reduces fractions. re-associates (float
  rounding can shift). idempotent. which calls flatten, and how terms
  and factors collect through them, is read off the callees'
  `canonical`/`terms`/`factors` tags.
- **trees.js** — utilities shared by the passes: `treesEqual`,
  `collectVariables`, `isLiteral`, `foldableValue`.
- **types.js** — `analyzeTypes`: validates the boolean/number typing
  rules — each function's rule is its `signature` — and returns the
  set of variables used only as booleans (toWgsl renders those as
  `name != 0u`).
- **codegen.js** — semantic tree to a string: `toWgsl`, `toMath`, and
  the number formatters `formatFloat`/`formatMathNumber`. templates,
  binding classes, and paren rules come off the callee nodes; the
  n-ary canonical forms re-nest via their `expand` tags.
- **domains.js** — the non-float value domains: `complexDomain` and
  `pointwiseDomain(size)`.
- **core.js** — the module map above, re-exports, and `parse`.

## the data structures

**token** — `{ type, index, length }`. `index`/`length` are the span
in the source text. tokens do not carry their text; slice the source.

**syntax node** — `{ type, index, length, ...fields }`. types: the
binary operator names (`plus`, `minus`, ...), `negate`, `positive`,
`not`, `ternary` (`condition`/`then`/`else`), `absolute`, `call`
(`callee`, `arguments`), `number`, `identifier`. parens produce no
node — the tree already records the grouping.

**semantic node** — same span convention, four types:

- `{ type: "number", index, length, value, name? }` — a literal.
  `value` is a domain value (a double in the float domain, a Complex
  in the complex domain, an array in a pointwise domain). `name` is
  present on named constants (pi, ...) and keeps them symbolic:
  nothing with a `name` ever folds.
- `{ type: "variable", index, length, name }`
- `{ type: "function", index, length, name, ... }` — a resolved
  function. the node carries its whole definition (see below), so a
  pass never looks a name up in a table of its own: it reads
  `callee.evaluate`, `callee.derivative`, `callee.template`,
  `callee.simplify`, `callee.signature`, `callee.mathClass`, ...
  straight off the node, and a definition lacking a hook simply gets
  the default behavior.
- `{ type: "call", index, length, callee, arguments }` — `callee` is a
  function node.

every node carries its source span. keep it that way: passes that
build new nodes should give them a sensible index (usually the index
of the node they replace or combine), because **every error message
in the library ends in `at index N`**, and N is a node's index.

**function definition** — one object per function in definitions.js,
holding everything about it: `syntax` (operator spelling and
precedence), `evaluate`, `derivative`, `template`, `mathClass`,
`mathParens`, `signature`, `simplify`, `canonical`/`terms`/`factors`,
`expand`, `structural`. the full schema is documented at the top of
definitions.js. the two fields with calling conventions worth
repeating:

- `derivative(args, derivatives) → tree` — the chain rule, built from
  the call's arguments and their derivatives. at table-assembly time
  (makeBuiltins) it is wrapped from a recipe `(args, derivatives,
  builders)`; see below. a definition passed straight to `fill` is
  not wrapped: its `derivative` is the `(args, derivatives)` form.
- `simplify(tree, args, tools) → tree | undefined` — the function's
  local rewrite rules, called by simplify with the already-simplified
  arguments and the domain-bound probes (`tools.isZero`, `tools.isOne`,
  `tools.treesEqual`, `tools.negate`, `tools.resimplify`, ...).
  returning undefined means "no rewrite".

**builders** — the object recipes build trees with. it exists so the
stock recipes are domain-neutral: `builders.multiply(x, dy)` builds a
multiply call using the builtin table *under construction*, so a
domain that redefines multiply gets product rules built from its own
multiply. methods: `plus`, `minus`, `multiply`, `divide`, `power`,
`negate`, `apply(name, ...args)`, `square`, `literal(value, node)`,
plus the raw `table` (the builtin table) and `ops` (the value-level
ops table).

**domain** — the value-level semantics of a tree, bundled with the
hooks the passes need. the full contract is documented with
`makeDomain` in autodiff.js; the short version:

- `ops` — name → value function. fixes which functions exist and what
  they mean on the domain's values.
- `lift(value)` — a plain JS number → a domain value. idempotent.
- `constant(value, name)` — read a fill-time constant; throws on
  values the domain cannot hold.
- `isFinite`, `literalEqual`, `asReal`, `isZero`, `isOne`,
  `isMinusOne`, `splitSign`, `crossReduce` — the probes the rewrite
  passes fold and cancel through.
- `commutative` — whether canonicalize may flatten and cancel
  products (false keeps multiplication associated as written).
- `renderNumber` — optional `{ wgsl, math }` literal formatters.
- `builtins` / `standard` — the assembled tables (makeBuiltins +
  standardFunctionsOf); `standard` is the vocabulary fill offers when
  the caller does not pass functions.

## invariants worth knowing

- **fill is the boundary between syntax and semantics.** before fill,
  a call's callee is an identifier node and operators are just node
  types; after fill, everything is a resolved function node and
  `differentiate`, the passes, and codegen can rely on that. handing
  an unfilled tree to differentiate is an error by design.
- **named constants never fold.** `pi / 2` stays `pi / 2`; a named
  constant is not a literal (`isLiteral` checks `name === undefined`).
- **simplify does not re-associate; canonicalize does.** simplify is
  safe under any float-rounding sensitivity and any commutativity
  assumptions; canonicalize is the pass that normalizes for display.
- **`sum` and `product` exist only as canonical forms.** surface
  syntax never produces them; canonicalize produces them; codegen
  re-nests them into binary chains for rendering. they define their
  own derivatives, so differentiate composes with canonicalize.
- **the ternary is `select` after fill**, and conditionals are
  piecewise-constant for differentiation: comparisons and logical
  operators have a zero derivative, select differentiates its
  branches.
- **passes share unchanged subtrees.** simplify and canonicalize
  return the input node object when nothing changed. do not mutate
  nodes in place anywhere.
- **errors name a source index.** when you add an error, end the
  message with `at index ${node.index}`; when you build a node, give
  it the best index you have. buildTree takes the source as an
  optional second argument purely so its errors can quote the
  offending text.

## how to ...

**add a function** — add one object to `definitions` in
definitions.js: its float-level `evaluate` and, if it should
differentiate, a `derivative` recipe. the recipe gets
`(args, derivatives, builders)` and returns the derivative tree, e.g.
`([x], [dx], builders) => builders.multiply(builders.apply("cos", x), dx)`.
if the name or argument order does not already spell right in a
target, add a `template`. that is all: table assembly, fill,
simplify, differentiate, types, and codegen pick it up. non-float
domains opt in by putting the name in their own ops table
(domains.js).

**add an operator** — write the function's definition as above and
give it a `syntax` field: `{ symbol, binary: { precedence,
associativity } }` for a binary operator, `{ symbol, prefix:
{ precedence } }` for a prefix one. tokenize, ast, and fill derive
their tables from it. a `signature` is needed if the operator
produces or consumes booleans. new punctuation (the way `?`/`:` and
`|` are not operator spellings) is a tokenize.js/ast.js change, not
a definition.

**add a value domain** — call `makeDomain({ name, ops, ...hooks })`;
domains.js has two worked examples. the minimal domain is an ops
table; hooks default to plain-number behavior. non-holomorphic or
otherwise unsupported functions are simply absent from the ops table
— parsing one then fails at fill with a clear error. supply
`renderNumber` if literals are not doubles. differentiation comes
free if the stock recipes are right for your algebra (they assume
commutativity; otherwise supply `derivative` overrides and set
`commutative: false`).

**override one function in a domain** — `makeBuiltins(ops, overrides)`
takes per-name overrides of any definition field: `evaluate` and
`derivative` replace the stock ones (a derivative override is a
recipe and may delegate to the exported stock `recipes` — the complex
domain's power rule does exactly this for constant exponents),
`template` merges per-target, and any other field (`signature`,
`simplify`, ...) replaces wholesale.

**add a codegen target** — codegen.js is the model. templates are
per-target keys on each builtin (`template.wgsl`, `template.math`),
so a new target means: a new template key on the builtins that need
one, a renderer that walks the tree applying templates (with
`expandCanonical` or an equivalent for `sum`/`product`), and a number
formatter. `domain.renderNumber` gets a matching key for non-double
literals.

## pitfalls

- **`x^-2` at the top level is `power(x, -2)`, not `1/x^2`.** the
  inverse rewrite (`inverseOf`) applies only inside products, so
  division-like forms appear only where a product is canonicalized.
- **differentiating a constant-exponent power needs `minus` in the
  ops table** (the exponent's `b - 1` is computed in the domain's own
  arithmetic). a domain without it gets a clear error at
  differentiation time.
- **`parse` requires the `constants` argument** (an array, possibly
  empty). this is a sharp edge left as is.
- **analyzeTypes only knows float and bool.** it runs inside toWgsl;
  it is not a general type system, and extending it is part of the
  multi-domain work below.
- **pointwise vectors are not matrices.** `pointwiseDomain(size)`
  lifts float ops componentwise; there is no dot product, no matmul,
  no shape checking. see the future work below.

## future work: mixed-domain semantic trees

today one tree lives in one domain, chosen at fill. the goal is a
single tree mixing complex, real, and vector values — e.g. a complex
expression with a real parameter and a vector constant. the parser is
explicitly out of scope: a diversely-typed surface syntax comes
later, and this work assumes the trees arrive already typed or
inferrable.

what the work looks like, in dependency order:

1. **a kind system.** number nodes carry (or are annotated with) a
   kind — real, complex, vec2/3/4, bool — instead of implicitly
   sharing one domain. `analyzeTypes` generalizes from {float, bool}
   to the kind set: per-builtin signatures, kind inference, and
   validation. types.js is small and self-contained; this is a
   rewrite of it, not an extension of everything.
2. **promotion rules and conversion nodes.** a kind lattice
   (real → complex, real → vecN by splat, ...) with explicit
   conversion nodes inserted at fill time where operands meet. this
   is the design decision with the most downstream effect: explicit
   conversions keep codegen and differentiation honest.
3. **per-node domains in the passes.** simplify/canonicalize/differen-
   tiate currently take one `domain` argument and ask it everything
   (`isZero`, `ops.multiply`, ...). with mixed kinds, the domain
   becomes a per-node lookup. the call sites are mechanical to change
   but numerous; the probes themselves already operate on values.
   cancellation and folding across kinds need care (a real 0 cancels
   a complex term only via promotion).
4. **codegen conversions and per-kind templates.** wgsl needs
   explicit constructors (`vec2f(x, 0.0)` etc.) at conversion nodes;
   `renderNumber` already exists per domain and carries over.

LOE estimate: **medium-large — roughly a week of focused work** for
someone already fluent with this codebase, including tests. the seams
are good (domains are already isolated behind hooks; tree nodes are
already domain-agnostic except `number.value`), so the risk is not
architectural; it is the sheer number of pass call sites and the
promotion edge cases in canonicalize and in real/complex power
differentiation.

## future work: non-pointwise vector and matrix ops

the goal: dot, cross, matrix multiply, transpose, determinant,
inverse, norm — vectors and matrices up to 4×4 — as first-class
builtins. `pointwiseDomain` shows componentwise lifting; this is the
structural version.

what the work looks like:

1. **shapes.** scalar, vec2..4, mat2×2..4×4 — a small kind system
   again, and in fact the cleanest path is to build this *on* the
   mixed-domain work above (shapes are kinds). standalone, it needs a
   shape-inference pass analogous to analyzeTypes. matmul's signature
   is shape-polymorphic (mat×mat, mat×vec, vec×mat), which the
   current per-name builtin table does not express; expect per-name
   signature functions rather than fixed arity.
2. **ops implementations.** plain-js matmul, determinant, inverse up
   to 4×4 — small, and constant folding picks them up for free
   through `evaluate`.
3. **derivative recipes.** dot is a per-component product rule —
   easy with builders. matmul is dA·B + A·dB: **noncommutative**, so
   the recipes must not reorder factors, and the domain needs
   `commutative: false` (already supported — canonicalize then keeps
   products associated as written). determinant and inverse use
   Jacobi's formulas (d det A = det A · tr(A⁻¹ dA); d A⁻¹ =
   −A⁻¹ dA A⁻¹) — expressible with builders once trace/adjugate
   builtins exist.
4. **codegen.** wgsl has native vec/mat types and operators, so
   templates are short; the mathml target needs matrix notation,
   which is a change to the $math/math module (an external
   dependency, not this library).

LOE estimate: **medium — a few days** if the kind system from the
mixed-domain work exists (shape signatures + ~10 recipes + ops +
templates + tests). without it, add a day or two for a minimal
standalone shape checker. the genuinely fiddly part is getting the
noncommutative recipes and the adjugate/inverse rules right, not the
plumbing.
