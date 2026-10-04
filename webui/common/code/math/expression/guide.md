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
  │  syntax/tokenize.js tokenize(source) → tokens
  ▼
tokens
  │  syntax/ast.js      buildTree(tokens, source?) → syntax tree
  ▼
syntax tree
  │  semantics/fill.js  fill(tree, source, constants, variables, functions?, defaultType?) → semantic tree
  ▼
semantic tree ── simplify.js / canonicalize.js (rewrite passes)
  │             ── autodiff.js    differentiate(tree, variableName)
  │             ── unroll.js      unroll(tree) — expands actualized recursive instances
  │             ── types/         typeOf(node) — the tree's types, derived from the leaves
  ▼
codegen.js            toWgsl(tree, options) / toMath(tree, options) → string
pretty.js             prettyPrint(tree) → abstract divs/spans (dom or console)
```

`parse` (core.js) runs the first three stages in one call and returns a
semantic tree; `parseExpressions` runs them for a whole program of
`name := ...` definitions (syntax/ast.js's buildProgram) and returns
one entry per definition. core.js also re-exports the public api of
every module; import from core.js unless you need something it does
not re-export.

every semantic tree is an **Expression** (semantics/expression.js), so
the tree-consuming functions above are also methods on the trees
themselves — `t.differentiate("x")`, `t.simplify()`, `t.wgsl()`,
`t.markup`, `t.pretty`, `t.log()`, `t.variables()`, ... — on subtrees
too. see "the data structures" below.

## the files

- **syntax/tokenize.js** — source text to tokens. owns the punctuation
  tokens; the operator spellings come from the definitions' `syntax`
  fields. an `i` directly after a number literal is the imaginary
  suffix (`2i` — a complex literal). also `symbolForOperator`, for
  spelling a token type in an error message.
- **syntax/locate.js** — source locations for error messages:
  `lineColOf`, `showLocation` (line, column, and the offending source
  line with a caret under the position), and `locateError`, which
  upgrades a thrown "at index N" error once. every pipeline stage that
  holds the source applies it, so syntax and fill errors surface with
  line:column and the excerpt; passes that never see the source keep
  their plain "at index N" messages (wrap them with `locateError`
  yourself if you hold the source).
- **syntax/ast.js** — tokens to a syntax tree (precedence-climbing parser;
  c-like operator precedence, right-associative `^`, a ternary, the
  postfix with operator (`subtree { ... }` — a bare `{`), the `cases
  { ... }` and `diff { ... }` blocks), and tokens to a whole program
  of `name := ...` definitions (buildProgram; blocks with
  `default T;` / `T a b;` / `duck x y;` / `ducks x y;` declarations,
  local `name := ...` subtrees, and `assume ... is ... when ... is
  ...;` analysis-state statements). every `:=` takes a bare
  expression OR a block, at every level — a definition's, a local's,
  a replacement's; the block's declarations and locals scope over its
  expression (assume statements belong to definitions only). the
  operator tables (precedence,
  associativity, prefix mapping) derive from the definitions'
  `syntax` fields. a `<` after an identifier that opened a would-be
  declaration is disambiguated by backtracking (`vector<3> v;` is a
  declaration; `n < 2 ? a : b` is an expression). an `i` directly
  after a number literal makes it imaginary (`2i`, `1e3i`), claimed
  only when it does not begin an identifier.
- **semantics/fill.js** — syntax tree to semantic tree. resolves
  identifiers to constants, variables, or functions; resolves
  operators against the definitions; lifts literals. **this is where
  the types of leaf nodes are decided** — see below. after fill, every
  call's callee is a resolved, case-stamped `function` node.
  fillProgram fills a whole program, one tree per definition, each
  with its block's declarations and locals. this is also where the
  with operator attaches: a subtree (a local, an earlier definition,
  or any expression) re-fills with the replacements spliced in, and a
  definition referencing itself defers to a recursive `instance`
  node.
- **types/** — the type system: the value types (scalars.js: float,
  complex, bool; exact.js: naturals, integers, modular integers,
  rationals; hypercomplex.js: quaternions, octonions; tensors.js:
  tensors of any dimension count over an entry type — vectors and
  matrices are the 1- and 2-dimensional cases), the promotion lattice
  (lattice.js), case resolution and the typed call constructor
  (resolve.js: `resolveCase`, `typedCallNode`, `valueApply`,
  `typeOf`/`typeOfValue`/`numberType`), the float literal formatters
  (format.js), and the source-level type-name registry (index.js).
- **operations/** — the function vocabulary, one directory of
  categories: one object per function holding everything about it —
  its operator syntax, its cases (which combinations of types it
  accepts and what it computes for each), its float-level `evaluate`,
  its derivative recipe, its rendering templates and math
  parenthesization, and its rewrite rules. index.js also carries
  `builders` (the typed tree constructors the derivative recipes are
  written against).
- **semantics/expression.js** — the `Expression` class every semantic
  node is an instance of: the tree-consuming free functions as
  methods and getters (`differentiate`, `simplify`, `canonicalize`,
  `unroll`, `convert`, `wgsl`, `toMath`, `markup`, `mathml`,
  `pretty`, `text`, `dom`, `log`, `variables`, `children`, `typeOf`,
  `equals`, `isLiteral`, `constantValue`, `foldableValue`), so
  `t.differentiate("x").simplify().wgsl()` reads left to right, and
  every subtree offers the same. the methods ARE the free functions
  with the tree in front — the free functions remain the api of the
  passes. two conveniences live here too, since they are about
  holding trees rather than running passes: `with(name, value)`
  (fill in a variable in place — a JS literal, a string to parse, or
  a semantic tree; mutates and returns the tree) and `clone()` (a
  true deep clone).
- **semantics/nodes.js** — the semantic node constructors (`numberNode`,
  `functionNode`, `callNode` — each returning an Expression) and the
  constant-subtree evaluator (`constantValue`, `foldableValue`: named
  constants count as constant for the former, never for the latter).
  `functionNode` spreads the case-resolved definition onto the node,
  so passes read a function's hooks straight off the callee.
  `copyNode(node, overrides)` is the one sanctioned rebuild — the
  node with some fields replaced, still an Expression.
- **autodiff.js** — `differentiate`.
- **unroll.js** — `unroll`: expands the recursive instances an
  `assume` statement has cleared, once their watched variables
  actualize. definitions whose own tree has a logical branch holding
  more than one recursive instance (the fibonacci shape) are memoized
  per unroll call.
- **simplify.js** — cheap local rewrites: constant folding and
  subtree sharing here; the function-specific rules (identities,
  annihilators, cancellation) are the functions' `simplify` hooks,
  called with probes that dispatch on each literal's own type.
- **canonicalize.js** — the normalizing pass: flattens sums and
  products into n-ary `sum`/`product` nodes, folds constants, cancels
  equal terms/factors, cross-reduces fractions — then the polynomial
  step: a subtree that is polynomial in its atoms (variables and
  non-arithmetic nodes like `sin(x)` or `log(1 - 1/x)` — anything the
  sum/product/power tags do not reach) has every multiplication
  actualized into a sum of monomials, each a constant coefficient
  times atoms to integer exponents, with like terms combined.
  `(x + y)*(x - y)` is `x^2 - y^2`, `x + x` is `2*x`,
  `r*x*(1 - x)` is `r*x - r*x^2`. expansion past a term cap is
  declined and keeps its factored form. re-associates (float
  rounding can shift) — except where association is load-bearing:
  operations that do not commute or do not always invert (matmul,
  scale, the quaternion and octonion products, modular division) opt
  out of the canonical forms, and their chains stay associated exactly
  as written; the polynomial step likewise merges monomial factors
  only over commutative types. idempotent — including the fractions:
  a denominator factor like `x/3`'s keeps its symbolic form across
  passes rather than folding to a decimal.
- **semantics/trees.js** — utilities shared by the passes: `treesEqual`,
  `collectVariables`, `isLiteral`, and `childrenOf` / `mapChildren` —
  the one place that knows the tree's shape (which nodes hold which
  child trees), so the passes' walks and rebuilds share it and a new
  node type means one update. (`foldableValue` is re-exported here
  from nodes.js.)
- **codegen.js** — semantic tree to a string: `toWgsl`, `toMath`.
  templates come off the (case-stamped) callee nodes; literals render
  through their own type; conversions render through their target
  type; the n-ary canonical forms re-nest via their `expand` tags;
  cases blocks become nested selects (one select for the ternary's
  negation-pair shape).
- **pretty.js** — semantic tree to an abstract tree of divs and spans
  (`prettyPrint`), actualized to real dom nodes (`prettyToDom`) or to
  an indented text tree for the console (`prettyToText`). shows
  everything the semantic system knows: every node's fill-decided
  type, literal values (large tensor literals elided), resolved call
  result types, cases' conditions and bodies, instances' watched sets
  and replacements. see "pretty-printing" below.
- **core.js** — the module map above, re-exports, and `parse`.

## types

every leaf of a semantic tree has a decided type, and every compound
expression's type derives from its operands — `typeOf(node)` computes
it. the provided types, in source-name form (the registry in
types/index.js):

- **real** (or **float**) — plain doubles. the default for literals,
  plain-number constants, and variables that declare none. floats are
  the fallible types of the real world: exact arithmetic happens in
  the types below, and wgsl lowers everything to f32 anyway.
- **natural** / **natural\<false\>** — the naturals as bigints,
  parametrized by whether zero is included. a semiring: no
  subtraction, no division — `2 - 3` over the naturals computes in
  the integers, `7 / 2` in the rationals (the lattice lifts into the
  completion, exactly).
- **integer** — the integers as bigints. **integer\<m\>** is the
  modular integers Z/mZ (residues carried by ModularInteger values):
  a quotient, not a subset, of Z — it joins nothing in the lattice
  but itself, and a real literal does not reduce mod m (write
  `default integer<7>;` to type literals as residues). modular
  addition, subtraction, multiplication, negation, and powers are
  total; division is partial (the divisor may not be invertible).
- **rational** — the rationals as exact BigInt numerator/denominator
  pairs (Rational values). a field: every arithmetic is exact,
  including division — `2*x/4` canonicalizes to `(1/2)*x`, and
  `0.1 + 0.2` is the exact sum of the doubles' exact readings, not
  0.30000000000000004. an integer-valued rational literal IS an
  integer (fill's narrowLiteral: `2` over a rational default types as
  a natural), so `x^2` takes the exact integer-exponent power case.
  sqrt/exp/log/the trigs have no rational cases — that is the
  exactness boundary, and applying one lowers to float.
- **complex** — the complexes, carried by the Complex class of
  $math/complex, rendered as wgsl `vec2f` with `complex_*` helpers
  ($paste(shared/complex.wgsl) supplies them). the holomorphic
  functions have complex cases; the non-holomorphic ones (abs, sign,
  the rounding functions, min/max/clamp, atan2, the order comparisons,
  step/smoothstep) do not, and applying one to a complex argument is a
  type error.
- **quaternion** — Hamilton's skew field (Quaternion values, wgsl
  `vec4f` with `quaternion_*` helpers from
  $paste(shared/quaternion.wgsl)). multiplication and division do not
  commute: their chains never flatten into canonical products, and
  their divide derivative is the order-preserving one. a power needs
  an integer-typed exponent (declare `integer n;` or default
  integer).
- **octonion** — the last Cayley-Dickson algebra (Octonion values):
  multiplication neither commutes nor associates. isolated in the
  lattice — nothing promotes in or out — and with no wgsl
  representation (toWgsl refuses it with a clear error).
- **bool** — what comparisons and logical operators produce and
  the conditionals' conditions consume. isolated in the lattice:
  nothing promotes to or from bool. a boolean variable is assumed to be a 0/1
  u32 (the shaders' $bool uniform convention) and renders in wgsl as
  `name != 0u`.
- **duck** / **ducks** — not value types but declaration markers:
  a duck-typed variable can be bound to anything that quacks the
  right way. in the definition's pristine tree the variable is
  provisional (typed by its use sites, like an implicit variable);
  what the declaration adds over an implicit variable is the intent
  and the binding rule: a with-replacement binding a duck imposes
  nothing on the replacement — the replacement's literals read by the
  ambient default type rather than by any type the variable took in
  the subtree, and the binding tree's own type governs at every use
  (so `sq := { duck x; x * x }` computes in the naturals when bound
  `sq { x := 2 }` inside a `default rational` block, where a
  `real x;` would pin the literal to float). binding something the
  body cannot use — a float where the body applies `&&` — is an
  ordinary type error at the use site. the two spellings differ in
  how one declaration's names relate: `duck x y;` is a UNIFIED duck
  — x and y must take the same type (they share one provisional
  type, bindings of one decide the other, and binding two members
  to different types is an error) — while `ducks x y;` is
  individualized: each can be anything. (`duck x;` and `ducks x;`
  are the same singleton, as are `duck x; duck y;` and
  `ducks x y;`.) as a block's default — `default duck;` — every
  undeclared variable of the block is an individualized duck; the
  default still types the block's literals (a duck is no value
  type), so write `default rational; duck x;` for exact literals
  AND duck variables.
- **vector\<n\>** / **vector\<n, entry\>** — fixed-size vectors as
  plain arrays, componentwise arithmetic (wgsl `vecNf`). rgb colors,
  2d points, per-channel math. the entry defaults to float; complex
  (or any scalar) entries work, with wgsl restricted to float and
  bool entries.
- **matrix\<r,c\>** / **matrix\<r,c,entry\>** — matrices as arrays
  of row arrays (wgsl `matCxRf` — C columns of R-vectors).
  multiplication is matmul, so the type is noncommutative whatever
  the entries.
- **tensor\<d1, d2, ...\>** / **tensor\<d1, ..., entry\>** — the
  general fixed-size tensor as nested arrays. vectors and matrices
  are the 1- and 2-dimensional cases: `tensor<3>` *is* `vector<3>`
  and `tensor<2, 3>` is `matrix<2, 3>` (one type factory, cached, so
  they compare identical). addition, negation, and scaling work over
  any dimension count; everything else — the products, the linear
  functions, the pointwise fallback — is the vectors' and matrices'
  own. wgsl lowers only the native shapes: float vectors of sizes
  2–4, bool vectors of sizes 2–4, and float matrices up to 4×4;
  anything else throws a "no wgsl representation yet" error.

fill learns the leaves' types from its arguments: constants are
`{ name, value, kind?, type? }` (a declared type reads the value with
its own rules — complexType accepts a `[re, im]` pair, quaternionType
a `[w, x, y, z]` quadruple; without one the value's shape decides),
variables are names or `{ name, type }`, and `defaultType` (default
float) types literals, plain-number constants, and variables that
don't declare one. an identifier that is neither constant, variable,
nor function is an implicit variable; a variable without a declared
type is provisional: boolean where every case of the callee pins its
position to one (and/or/not's operands) or where a condition position
takes it (a cases block's, a ternary's), the default type anywhere
else, and an error when wanted both ways.

**promotion** follows the usual conventions (pytorch, wgsl): a scalar
meeting anything wider is upcast — along the exact tower
`natural<false> → natural → integer → rational → float → complex →
quaternion` (each embedding exact through rational, approximate from
float on), or splatted to a vector or matrix — and the operation
proceeds at the wider type (scalar + vector is pointwise addition).
bool, the modular integers, and the octonions are isolated. a
promoted literal simply re-lifts its value (and is stamped with its
new type); anything else wraps in an explicit `convert` node.
combinations no case covers — complex plus vector, mismatched vector
sizes, matmul with disagreeing inner dimensions, bool arithmetic, a
float meeting a modular integer — are type errors at fill. case
resolution tries the exact cases in declaration order, then the case
needing the least total promotion (`promotionDistance`), then lifts
the operation over vector entries (the pointwise fallback: `uv +
color`, `floor(uv)`, `uv < color` as a vector of bools).

## the data structures

**token** — `{ type, index, length }`. `index`/`length` are the span
in the source text. tokens do not carry their text; slice the source.

**syntax node** — `{ type, index, length, ...fields }`. types: the
binary operator names (`plus`, `minus`, ...), `negate`, `positive`,
`not`, `ternary` (`condition`/`then`/`else`), `absolute`, `call`
(`callee`, `arguments`), `number`, `identifier`, `cases`
(`cases: [{ condition, body }]`) for the cases block, `diff`
(`bindings: [binding]`) for the diff block, and
`with` (`left`, `replacements: [binding]`) for the
with operator (`subtree { ... }`). a binding is `{ name, nameIndex,
declarations, locals, assumptions, body }` — `body` the expression,
the rest the block's when the `:=` was followed by one (empty
arrays otherwise); local definitions in a block share the shape
(`type: "localDefinition"`). parens produce no node — the tree
already records the grouping.

**semantic node** — an `Expression` (semantics/expression.js):
plain fields as below, plus the passes and renderers as methods.
same span convention, eight types (number,
variable, function, call, convert, instance, cases, diff):

- `{ type: "number", index, length, value, name?, valueType? }` — a
  literal. `value` is a typed value (a double, a bigint, a Complex, a
  Rational, an array, ...); its type is `numberType(node)` — the
  fill-stamped `valueType` when present (a natural literal holds a
  bigint but types as natural), `typeOfValue(value)` otherwise.
  `name` is present on named constants (pi, ...) and keeps them
  symbolic: nothing with a `name` ever folds.
- `{ type: "variable", index, length, name, valueType }` — `valueType`
  is the fill-decided type.
- `{ type: "function", index, length, name, ... }` — a resolved
  function. the node carries its whole (case-resolved) definition, so
  a pass never looks a name up in a table of its own: it reads
  `callee.evaluate`, `callee.derivative`, `callee.template`,
  `callee.simplify`, `callee.mathClass`, ... straight off the node,
  and `callee.returns` is the call's result type.
- `{ type: "call", index, length, callee, arguments }` — `callee` is a
  function node.
- `{ type: "convert", index, length, target, operand }` — an explicit
  promotion inserted by typedCallNode. it carries the target type:
  evaluation lifts through it, differentiation differentiates the
  operand, codegen renders the target's conversion (wgsl constructors;
  invisible in math).
- `{ type: "instance", index, length, of, replacements, ambient?,
  watched?, valueType }` — a recursive reference, deferred: the
  definition (`of`, its closure), the replacements it was referenced
  with, and the splice ambient to its creation (`ambient`, so that
  bindings from enclosing withs reach every level of the expansion).
  instances appear only inside a definition's own tree; the passes
  treat them as opaque atoms (they would not terminate otherwise),
  differentiation and codegen refuse them, and `unroll` expands the
  ones whose `watched` set has emptied (see "definitions, with, and
  recursion" below).
- `{ type: "cases", index, length, cases, valueType }` — a cases
  block: `cases: [{ condition, body }]`, each condition a bool-typed
  tree (no coercion), the bodies unified to `valueType` (promotions
  inserted where they need them). exactly one case must hold when the
  block is evaluated — simplify settles that as soon as every
  condition is literal (folding to the one true body, throwing on
  none or several), which is what resolves a recursion's base case in
  unroll. the ternary `c ? a : b` is shorthand for the two-case block
  `cases { c ? a; !c ? b }`: after fill every conditional is a cases
  node. codegen renders the block as nested selects, folding from
  the left (the first case is the fallthrough; its condition never
  renders) — with a special case for the two-case block whose
  conditions are a condition and its negation (the ternary's shape):
  one select on the positive condition. see "cases" below.
- `{ type: "diff", index, length, wrt, f, valueType? }` — a deferred
  diff: the operator with one slot missing (`wrt` a variable name,
  `f` a filled tree — the present one is held, the other null).
  opaque like an instance: simplify and canonicalize traverse `f`,
  differentiation and codegen refuse it, and a with block binds the
  missing slot (see "diff" below). a fully-bound diff executes at
  fill and leaves no node at all — the result IS the derivative's
  tree.

the methods on every node (subtrees included), each exactly the
free function of the same name with the tree in front:

- the passes: `t.differentiate("x")`, `t.simplify()`,
  `t.canonicalize()`, `t.unroll({ maxExpansions }?)`,
  `t.convert(type)` (promoteNode: a re-lifted literal or a convert
  node).
- holding trees: `t.with(name, value)` and `t.clone()`.
  `with` fills in a variable IN PLACE — every occurrence replaced,
  the tree returned for chaining. the value may be a JS literal
  (read by the variable's own type, so `10` fills a complex variable
  as 10+0i), a string (parsed as an expression, with the variable's
  type as its literals' default), or a semantic tree. a parsed or
  given tree must carry the variable's type or one promotable to it
  (the tree's stamped types cannot recompute after the fact), and is
  shared across the occurrences like a local's tree. instances'
  replacement trees take part (their `watched` sets are recomputed);
  their hidden variables are not nodes of the tree and stay
  untouched. an unknown name is an error. mind the sharing: trees
  from one program share subtrees (a definition referenced without
  a with shares its tree with every reference), and the mutation
  reaches whatever shares the nodes — clone first if that matters.
  `clone()` is a true deep
  clone: every node rebuilt (still Expressions), literal array
  values copied; function definitions, type objects, the scalar
  value instances, and instances' closures share by reference.
  mutating the clone never touches the original.
- codegen: `t.wgsl({ variables, functions }?)`, `t.toMath({ variables,
  functions, header }?)`, the getters `t.markup` (toMath's default
  rendering — the string for the $math/math module) and `t.mathml`
  (a promise of that string rendered through `$mod("math/math", ...)`
  — the module's `{ dom, inline }` result; needs the webui's module
  loader, and rejects with a pointer to `t.markup` without it).
- inspection: the getters `t.pretty` (prettyPrint's abstract
  div/span tree), `t.text` (its indented text form), `t.dom` (real
  dom nodes), and `t.log(options?)` — console.log the text form,
  returning the tree for chaining. `t.variables()`, `t.children()`,
  `t.typeOf()`.
- probes: `t.equals(other)`, `t.isLiteral()`, `t.constantValue()`,
  `t.foldableValue()`.

one collision, by design: a call's callee spreads its definition
onto the node, so a definition's own `simplify` field — the rewrite
hook — shadows the prototype's simplify method ON CALLEE NODES.
internal callers reaching for the hook read it by own-ness
(`Object.hasOwn(tree.callee, "simplify")` in simplify.js): an
optional-chain read would otherwise never be undefined. every other
method name is collision-free.

every node carries its source span. keep it that way: passes that
build new nodes should give them a sensible index (usually the index
of the node they replace or combine), because **every error message
in the library ends in `at index N`**, and N is a node's index. the
pipeline stages that hold the source upgrade that to the line,
column, and a pretty-printed excerpt with a caret (syntax/locate.js),
so a user sees `at line 3, column 9 (index 30):` above the offending
line; an already-upgraded error is flagged and never rewritten
twice. errors thrown by the source-less passes (differentiate, the
rewrite passes, codegen) keep the bare index — a caller holding the
source can upgrade them with `locateError(error, source)`.

**function definition** — one object per function in operations/,
holding everything about it: `syntax`, `evaluate` (the float case),
`returns` (the float case's result type when not float), `cases`,
`derivative`, `template`, `mathClass`, `mathParens`, `simplify`,
`canonical`/`terms`/`factors`, `expand`, `structural`. the full schema
is documented at the top of operations/index.js. the fields with
calling conventions worth repeating:

- `cases` — the combinations of types the function accepts beyond its
  float base, each `{ arguments, returns, evaluate, ...fields }`.
  argument patterns: a type object matches exactly; `"vector"` /
  `"matrix"` / `"tensor"` match the tensors of that dimension count
  (`"tensor"` any of them; repeats unify to one tensor — dimensions
  agree, entries join — with scalars splatting in); `"same"` unifies
  all such arguments to one type (select's branches). `variadic: true` applies a single pattern to
  every argument (sum, product). a case may instead supply
  `match: (argTypes) → { returns, promotes?, fields? } | null` for
  shapes no pattern expresses (matmul's inner dimensions, modular
  arithmetic's shared modulus); the matcher's `fields` merge into the
  resolved definition (its evaluate and templates baked per match —
  templates per-target, an explicitly undefined target suppressing).
  resolution runs the exact matches in declaration order, then the
  least total promotion, then lifts over vector entries (the
  pointwise fallback). any other field (`template`, `derivative`,
  `canonical`, ...) specializes the definition for the case;
  `canonical: null, factors: null` is how a noncommutative or
  partial case opts out of the canonical forms.
- `derivative(args, derivatives, builders) → tree` — the chain rule,
  built from the call's arguments and their derivatives. the recipes
  are type-neutral: builders constructs typed calls, so a recipe
  written for floats composes complex and vector arithmetic through
  the same cases. the recipes assume a commutative arithmetic; matrix
  cases carry their own order-preserving recipes.
- `simplify(tree, args, tools) → tree | undefined` — the function's
  local rewrite rules, called by simplify with the already-simplified
  arguments and the probes (`tools.isZero`, `tools.treesEqual`,
  `tools.negate`, `tools.resimplify`, `tools.zero`, ...). returning
  undefined means "no rewrite".

**builders** — the object recipes build trees with
(`builders.multiply(x, dy)` and friends): typed arithmetic over the
vocabulary. every call goes through typedCallNode, so recipe-built
trees resolve and stamp their callees like any filled tree, with
promotions inserted where argument types meet (a float literal in a
complex recipe lifts to a complex literal). methods: `plus`, `minus`,
`multiply`, `divide`, `power`, `negate`, `apply(name, ...args)`,
`square`, `literal(value, node)`.

**type** — the value-level semantics of a kind of value, bundled with
the hooks the passes need: `lift` (a plain number → this type's
value), `constant`, the probes (`isFinite`, `literalEqual`, `asReal`,
`isZero`, `isOne`, `isMinusOne`, `splitSign`, `crossReduce`),
`commutative` (whether canonicalize may merge products of this
type's values into monomials — false for matrices, quaternions, and
octonions; the shallow flattening instead runs on the operations'
tags), `integerExponents` (a power
with an integer exponent stays exact), `narrowLiteral` (optional:
read an integer-valued literal as the narrower exact type),
`renderNumber` (literal rendering per target), and `renderConvert`
(how a promotion to this type renders, given the operand's type).
the full contract is documented with the types in types/scalars.js.

## definitions, with, and recursion

a program's definitions see the ones before them: an earlier
definition's name shares its filled tree (no semantic difference from
inlining it, the same as a block-local `name := ...`), and the with
operator attaches a subtree with some of its variables replaced:

```
logistic := { default real; r * x * (1 - x) }
orbit2 := logistic { x := logistic { r := 2 } }
```

a local's body may be a block of its own — `name := { ... }`, with
its own declarations and locals scoped to it — as may a
replacement's in a with or diff block: the `:=` takes a bare
expression or a block at every level (assume statements still
belong to definitions only):

```
orbit2 := {
    step := { next := r_a * x * (1 - x); r_b * next * (1 - next) };
    logistic { x := step { r_a := r; r_b := r } }
}
```

the with operator has no mark of its own: `a { ... }` (a `{`
directly after an expression can only ever be a with block).
postfix, binding tighter than every binary operator. the block holds `;`-separated
`name := expression` statements (the last `;` optional); each name
must be a variable of the subtree. the replacements fill in the
current environment (a literal among them reads in the type the
replaced variable has in the subtree — except for a duck variable,
whose replacement's literals read by the ambient default), and the
subtree — a local, an earlier definition, or any expression on the
left — re-fills with them spliced in. the splice reaches through the
subtree's locals and through plain references to other definitions:
a replacement is a substitution over everything the subtree's free
variables could mean, exactly as if it were inlined.

a definition referencing **itself** cannot re-fill — that is
recursion — so the reference defers to an `instance` node: an opaque
atom holding the definition and the replacements. instances never
traverse in simplify/canonicalize, never fold, and refuse to
differentiate or render. what expands them is the `assume` statement
plus the `unroll` pass:

```
logisticRepeated := {
    default real;
    natural n;
    assume logisticRepeated is unrollable when n is actualized;

    logistic {
        r := r;
        x := n == 1 ? x_0 : logisticRepeated { n := n - 1 };
    }
}

main := logisticRepeated { n := 3 }   // unroll(main's tree) → L(L(L(x_0)))
```

`assume NAME is STATE when NAME is EVENT;` declares: once the
condition variable is *actualized* — fully determined, no unbound
variables — the definition's instances may be treated as having the
state. an instance's *watched set* is the condition variables minus
the ones it replaces, plus the free variables of those replacements:
a replacement that removes a watched variable hands the watch to the
replacement's own unbound variables (replacing `n` with `m - 1` moves
the watch from `n` to `m`; replacing it with a literal empties the
set). `unroll(tree)` simplifies, finds an instance with an empty
watched set, expands it (the definition re-fills with the instance's
replacements), and repeats until no expandable instances remain; the
cases block folds once its conditions are literal, so the
recursion's base case resolves. an instance that never
actualizes stays in the tree, opaque; a recursion that keeps
producing actualized instances forever hits the expansion bound
(`maxExpansions`, default 1000) with a "did not terminate" error.
the only state so far is `unrollable`, the only event `actualized`;
the statement's target must be the definition itself.

a recursion with several instances of itself in one logical branch
(the fibonacci shape) would expand the same bindings exponentially
often, so those definitions are **memoized per unroll call**: an
instance's fully unrolled expansion is computed once per
(definition, replacements, ambient) and shared at every repeat. the
heuristic for which definitions qualify: the definition's own tree
has a cases body — a logical branch — with more than one recursive
instance among its descendents. not every definition
that looks like that benefits, but every definition that benefits
looks like that. the memo is discarded when the unrolling is done:
the library is for analyzing and processing expressions, not
sequential programming — twenty unrelated trees recursing into the
same definition rebuild the memo twenty times, by design.

## cases

`cases { condition ? body; condition ? body; ... }` is the
conditional-branching node of the semantic tree — the fully general
one, with the ternary as syntactic shorthand: `c ? a : b` fills as
`cases { c ? a; !c ? b }`, sharing the filled condition subtree.
there is no other conditional; the `select` operation the codegen
renders cases with is structural (not offered in the vocabulary).

```
fibonacci := {
    natural n;
    assume fibonacci is unrollable when n is actualized;

    cases {
        n == 0 ? 0;
        n == 1 ? 1;
        n > 1 ? fibonacci { n := n - 1 } + fibonacci { n := n - 2 };
    }
}
```

any number of cases; each case's `;` terminates it (the last is
optional, as everywhere here). a condition is anything that
evaluates to bool **without coercion** (a ternary condition needs
parens — the `?` ends the condition), a body anything that could go
on the right side of a `:=`. the bodies must unify to one type —
the block's type — with promotions inserted where they need them.

when a cases block is evaluated, **exactly one case must hold**: if
several hold or none does, that is an error. there is no static
exhaustiveness or overlap checking, and the order of cases carries
no meaning — these are semantic expression trees, not sequential
programs; exactly one case must hold *in actual use*, not
necessarily *upon rigorous static inspection*. that design makes the
implementation straightforward: simplify drops literal-false cases,
and once every condition is literal it settles the semantics on the
spot — folding to the one true body, throwing otherwise. shorter
than that, simplify also folds a block whose live cases all agree
on the body (the conditions are then irrelevant). these folds are
what resolve a recursion's base case in unroll. differentiation
differentiates the bodies (the conditions are piecewise-constant),
and codegen renders the block as nested selects folding from the
left — the first case is the fallthrough and its condition never
renders, which is exactly the no-exhaustiveness-checking spirit (a
shader cannot throw, so the error case's rendering is unspecified) —
with a special case for the two-case block whose conditions are a
condition and its negation (the ternary's shape): one select on the
positive condition, so `c ? a : b` renders as a single `select(a,
b, c)` as ever.

`cases` is a keyword only in prefix position followed by `{` —
everywhere else it is an ordinary identifier (the same deal as
`diff`).

## diff

`diff { wrt := x; f := expression }` differentiates f with respect
to x — the autodiff pass, in the language. it behaves as if diff had
a fully in-language cases-based recursive definition (d(u + v) is du
+ dv, and so on); it is implemented by delegating to differentiate,
for code-structure reasons.

the two slots are independent, and giving one without the other
**defers**: `diff { wrt := x }` is an operator awaiting an f, and
`diff { f := foo }` an expression awaiting its variable — it does
not execute until wrt is actualized. a with block actualizes the
missing slot:

```
d := diff { wrt := x }        // the d/dx operator
main := d { f := x^2 + sin(y) }       // → 2x
also := diff { f := x^3 } { wrt := x } // → 3x^2
both := diff { wrt := y; f := x^2 * y } // → x^2
```

slot mechanics: a with on a deferred diff binds its slots (`wrt`,
`f`) — a slot name always names the slot — and any other names
splice into the diff's f the way they would into any subtree (so a
definition holding a deferred diff can take its f's variables as
parameters, bound before the diff executes). the one ordering
exception: a replacement naming the variable the diff differentiates
by belongs to the DERIVATIVE, never to f — substituting it into f
before differentiating would differentiate a constant, and
`diff { wrt := x; f := x^2 } { x := 2 }` is 4, never d/dx 4 = 0. the
diff executes with that binding stripped and the binding applies to
the result, whether the binding arrives through the same with
(`diff { f := x^2 } { wrt := x; x := 2 }`) or an enclosing one; every
other binding commutes with differentiation and reaches f as before.
an executed diff's
result is an ordinary tree, so nested diffs give higher and mixed
partials (`diff { wrt := x; f := diff { wrt := y; f := x^2 * y } }`).
notes:

- `wrt`'s body must be a bare identifier — it is a compile-time
  name, read as written, never filled.
- an executed diff consumes its f at fill: if the derivative
  eliminates a variable (d/dx of x² + b has no b in it), that
  variable is no longer bindable — keep the diff deferred if you
  mean to bind it.
- the invariant about recursion applies: a diff whose f holds a
  recursive instance throws (recursion has no derivative) — unroll
  first.
- `diff` is a keyword only in prefix position followed by `{`, like
  `cases` and `with`.

## pretty-printing

for looking at a semantic tree — quick math in devtools, debugging a
definition, checking what fill decided — there is the pretty printer
(pretty.js). `prettyPrint(tree)` renders the tree to an ABSTRACT
tree of divs and spans (`{ tag, classes, text?, children? }`), which
actualizes two ways: `prettyToDom` builds real dom nodes (styled by
the `pt-*` classes), and `prettyToText` renders an indented text
tree for the console. on a tree in hand these are the `pretty`,
`text`, and `dom` getters and `log()`:

```
> parse("2*x + 1", [], ["x"]).simplify().log()
plus : float
├─ multiply : float
│  ├─ 2 : float
│  └─ x : float
└─ 1 : float
```

the print tells the user basically everything the semantic system
knows about the tree: every node with its fill-decided type, every
literal with its value (tensor literals past a leaf threshold —
default 8, `elideTensorsAbove` — elide their contents; the shape is
in the type annotation anyway), calls with their resolved result
types, cases blocks with their conditions and bodies, instances with
their watched sets, replacements, and ambient splices. the
`locations` option appends each node's source span.

## invariants worth knowing

- **fill is the boundary between syntax and semantics — and the place
  leaf types are decided.** before fill, a call's callee is an
  identifier node and operators are just node types; after fill,
  everything is a resolved, case-stamped function node, every leaf is
  typed, and `differentiate`, the passes, and codegen can rely on
  both. handing an unfilled tree to differentiate is an error by
  design.
- **every call is built by typedCallNode.** fill, the derivative
  builders, canonicalize, and codegen's canonical expansion all
  construct calls through it, so case resolution and promotion happen
  uniformly at construction time. a combination no case accepts is a
  type error there and then.
- **named constants never fold.** `pi / 2` stays `pi / 2`; a named
  constant is not a literal (`isLiteral` checks `name === undefined`).
- **simplify does not re-associate; canonicalize does** — except where
  association is load-bearing: operations that do not commute
  (matmul, the quaternion and octonion products) or do not always
  invert (modular division) carry no canonical tags, and their chains
  stay associated exactly as written. rewrites that would
  reorder factors (multiply's constant fold) are likewise restricted
  on the skew cases, and the polynomial step merges monomial factors
  only when the tree's type is `commutative` — `(p + q)^2` over the
  quaternions keeps its power, never becoming p^2 + 2pq + q^2.
- **`sum` and `product` exist only as canonical forms.** surface
  syntax never produces them; canonicalize produces them; codegen
  re-nests them into binary chains for rendering. they define their
  own derivatives, so differentiate composes with canonicalize.
- **the ternary is a cases block after fill** (`c ? a : b` is
  `cases { c ? a; !c ? b }`), and conditionals are piecewise-constant
  for differentiation: comparisons and logical operators have a zero
  derivative, and a cases block differentiates its bodies. a cases
  block folds once every condition is literal (and sooner when every
  live case agrees) — this is what lets unroll resolve a recursion's
  base case. the `select` operation codegen renders cases with is
  structural: it never appears in a pre-codegen tree.
- **instances are opaque atoms.** a recursive instance never
  traverses in the rewrite passes (recursion safety), never folds,
  and throws in differentiate, toWgsl, and toMath with an "unroll it
  first" error. `typeOf` reads the instance's fill-settled
  `valueType`; `treesEqual` compares the definition's name and the
  replacements; `collectVariables` collects the replacements' free
  variables (the hidden ones — the definition's own, minus the
  replaced — are a subset of the enclosing body's). a deferred diff
  is the same kind of atom: inert until its missing slot is bound,
  refused by differentiate and codegen with a "bind wrt and f first"
  error.
- **differentiation is with respect to a scalar variable** (float or
  complex). a vector or matrix expression differentiates
  componentwise; a vector differentiation variable takes splat ones
  and zeros (the componentwise convention); a matrix differentiation
  variable is an error.
- **semantic tree operations are exact.** over the exact tower
  (naturals, integers, modular integers, rationals) the passes never
  round: folds run through the values' own arithmetic, and an
  operation the type cannot perform exactly lifts into the
  completion (naturals subtract as integers, integers divide as
  rationals) rather than lowering to float. wgsl is the lossy
  boundary: literals and conversions lower to f32 there, by design.
- **passes share unchanged subtrees.** simplify and canonicalize
  return the input node object when nothing changed. do not mutate
  nodes in place anywhere — and rebuild with `copyNode`, never a
  bare object spread, so every tree a pass returns is still an
  Expression.
- **errors name a source index.** when you add an error, end the
  message with `at index ${node.index}`; when you build a node, give
  it the best index you have. the pipeline boundaries upgrade the
  trailing index to line, column, and a caret excerpt
  (syntax/locate.js), so keep the convention: the index last, always.
  buildTree takes the source as an optional second argument purely so
  its errors can quote the offending text.

## how to ...

**add a function** — add one object to its category in operations/
(arithmetic, products, comparison, canonical, elementary, rounding,
shaping, linear — or a new file in the same shape): its float-level
`evaluate` and, if it should differentiate, a `derivative` recipe.
the recipe gets `(args, derivatives, builders)` and returns the
derivative tree, e.g.
`([x], [dx], builders) => builders.multiply(builders.apply("cos", x), dx)`.
if the name or argument order does not already spell right in a
target, add a `template`. to accept other types, add `cases`: a
`complex(...)` case for the complexes, explicit patterns or matchers
for anything else (componentwise vector support needs no case — the
pointwise fallback lifts the float behavior). that is all: fill,
simplify, differentiate, types, and codegen pick it up.

**add an operator** — write the function's definition as above and
give it a `syntax` field: `{ symbol, binary: { precedence,
associativity } }` for a binary operator, `{ symbol, prefix:
{ precedence } }` for a prefix one. tokenize, ast, and fill derive
their tables from it. if the operator produces or consumes booleans,
its cases (or a `returns: boolType`) say so. new punctuation (the way
`?`/`:` and `|` are not operator spellings) is a syntax/tokenize.js +
syntax/ast.js change, not a definition.

**change what a function means for one type** — edit its case in its
definition in operations/. how log behaves on the complexes is in
log's definition (elementary.js); how `*` behaves with a matrix
operand is in products.js. there is no separate overrides catalogue.

**add a type** — write a type object in types/ (the contract is
documented in types/scalars.js): value representation, `lift`,
`constant`, the probes, `renderNumber`, `renderConvert`,
`commutative`. add it to the promotion lattice (types/lattice.js) if
scalars should upcast to it, and to the source-level registry
(types/index.js) if declarations should name it. then teach the
functions that should accept it by adding cases to their
definitions — each function says for itself which combinations make
sense and what it computes for them.

**add a codegen target** — codegen.js is the model. templates are
per-target keys on each definition (`template.wgsl`, `template.math`),
so a new target means: a new template key on the definitions that need
one, a renderer that walks the tree applying templates (with
`expandCanonical` or an equivalent for `sum`/`product`), and a
matching key on each type's `renderNumber` (and `renderConvert` for
promotions).

## pitfalls

- **`x^-2` at the top level is `power(x, -2)`, not `1/x^2`.** the
  inverse rewrite (`inverseOf`) applies only inside products, so
  division-like forms appear only where a product is canonicalized.
- **`parse("x + 1")` is complete on its own.** constants and
  variables default to empty; pass them positionally
  (`parse(source, constants, variables)`) only to declare them.
- **wgsl's scalar matrix constructor is diagonal, not splat.** a
  scalar promoting into a matrix renders as explicit column vectors
  full of the scalar — `mat2x2f(x)` would be `x·I`, which is not the
  pointwise convention.
- **vectors are componentwise; matrices are not.** `u * v` multiplies
  per component (use `dot(u, v)` for the dot product), while `A * B`
  is matmul. this is wgsl's convention, taken whole.
- **differentiating with respect to a vector is the componentwise
  convention.** sensible for pointwise expressions; not a gradient.
  differentiate `dot(u, v)` with respect to a scalar instead.
- **a real literal does not join the isolated types.** `integer<7> n;
  n + 1` is a type error (1.0 is a float, not a residue); give the
  block `default integer<7>;` so its literals type as residues. the
  same goes for the octonions.
- **exact powers want integer-typed exponents.** over a rational
  default `x^2` is exact (the literal narrows), but a quaternion's
  exponent must be declared (`integer n;` or `default integer;`) —
  there is no general quaternion power to fall back to.
- **a number literal eats its dot.** `2.{ x := 3 }` tokenizes as the
  number `2.` followed by a brace — which parses as a with on 2, and
  fill refuses it: a number has no variables to replace.
- **wgsl has only the small native tensors.** float vectors of sizes
  2–4, bool vectors of sizes 2–4, float matrices up to 4×4. a
  `vector<5>` or a 3-d tensor works fine in the tree; toWgsl throws
  "no wgsl representation yet".
- **recursion needs the assume.** without `assume D is unrollable
  when ... is actualized;`, a recursive instance stays in the tree
  forever and codegen throws. with it, the instance expands only
  once the condition variable is actually bound to something
  determined — a top-level `D { n := 5 }`, not an unbound `n`.
- **you cannot differentiate through recursion.** differentiate
  throws on an instance — including a `diff` whose f holds one;
  unroll first (and then only if the recursion actualized).
- **an executed diff consumes its f.** if the derivative eliminates
  a variable (d/dx of x² + b has no b in it), a later `with` cannot
  bind that variable — keep the diff deferred (give only one slot)
  when you mean to bind before differentiating. binding the wrt
  variable itself is the exception that works: it applies to the
  derivative, never to f (`diff { wrt := x; f := x^2 } { x := 2 }`
  is 4).

## future work

- **autodiff entirely in-language.** diff behaves as if it had a
  fully in-language cases-based recursive definition; today it
  delegates to the differentiate pass for code-structure reasons, but
  nothing in principle keeps it there.
- **passing operators through with.** a deferred diff binds via
  withs on locals, definitions, and its own syntax, but a
  with-replacement bound to a variable cannot then be with-ed (`op
  { f := ... }` where op is a variable): the pristine fill rejects
  with-on-a-variable before any splice could deliver an operator.
- **surface syntax for typed values.** the syntax has declarations
  (`integer<7> n;`) but no vector/matrix/quaternion literals, no
  swizzles or indexing (`v.x`, `m[0]`). today non-scalar atoms arrive
  through constants and declared variables. (`.` used to spell the
  with operator; with that gone, the mark is free for swizzles.)
- **more analysis states and events.** the assume statement's
  vocabulary is one state (`unrollable`) and one event
  (`actualized`); the shape — `assume TARGET is STATES when VARIABLE
  is EVENTS` — is built for more.
- **wgsl for higher tensors.** only the native shapes lower (float
  vec2–4/mat2–4, bool vec2–4); the rest throw. arrays of arrays or
  entrywise expansions could lower them later.
- **mathml rendering of matrices.** the math target renders a matrix
  literal as rows of tuples; proper matrix notation is a change to the
  $math/math module (an external dependency, not this library).
- **a wgsl `inverse` helper.** the inverse function's wgsl rendering
  is the plain call; a shader wanting it pastes its own (the way
  complex_* helpers come from $paste(shared/complex.wgsl)).
- **determinant's derivative** (Jacobi's formula, once a trace
  builtin exists).
