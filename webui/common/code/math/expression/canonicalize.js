/* canonicalize

flattens additive and multiplicative chains into n-ary sum and product
nodes: subtraction joins the sum with its right operand negated,
division joins the product with its right operand raised to -1. literal
constants fold — a sum's literals fold into one signed constant, which
takes the position of the first constant term (1 + x + 2 → 3 + x, and
x + 2 + 1 → x + 3); a product's literals fold into one constant factor
per side of the fraction. equal terms with opposite signs cancel, and
equal factors on opposite sides of a fraction cancel. a product's
numerator and denominator constants cross-reduce when their type
reports an exact quotient (for floats: 2*x/4 is 0.5*x, but 2*x/3 keeps
its fraction). unlike simplify this re-associates, which for floats can
shift rounding; term order is otherwise preserved, and named constants
stay symbolic. idempotent, and composes with differentiate: sum and
product define their own derivatives.

once the chains are flat, the polynomial step (polynomialize below)
reads each subtree as a polynomial in its ATOMS — the variables and
the nodes that are not arithmetic (sin(x), log(1 - 1/x), a matmul
chain) — and actualizes every multiplication: the subtree becomes a
sum of monomials, each a constant coefficient times atoms raised to
integer exponents, with like terms (monomials over the same atoms)
combined. (x + y)·(x − y) is x^2 − y^2, x + x is 2·x, r·x·(1 − x) is
r·x − r·x^2. an expansion past a term cap is declined and keeps its
factored form. factor order inside a monomial normalizes (atoms sort
by structural key); the sum's term order stays first occurrence.

the product forms come in two families: product for the scalar ring
product (multiply/divide) and pointwiseProduct for the Hadamard
operations over vectors (pointwiseMultiply/pointwiseDivide); which one
a chain flattens into is its result type's business. matmul and scale
carry no canonical tag at all — matmul does not commute, and a
scaling's scalar is not a product factor — so their chains stay
associated exactly as written, structurally.

the folds and identity probes dispatch on each literal's own type
(types/); the folds themselves run through valueApply, so a complex
constant folds with the complex arithmetic. which calls flatten into
which form is the functions' own business: a callee's `canonical` tag
("sum" | "product") selects the pass, and its `terms`/`factors` tags
say how terms and factors collect through it ("expand",
"subtract"/"divide", "negate", "pass" — see operations/). */

import { arithmetic } from "./operations/arithmetic.js";
import { canonical } from "./operations/canonical.js";
import { products } from "./operations/products.js";
import { copyNode, numberNode } from "./semantics/nodes.js";
import { foldableValue, isLiteral, mapChildren, treesEqual } from "./semantics/trees.js";
import { simplify } from "./simplify.js";
import { integerType, isVector, numberType, oneOf, typeOf, typeOfValue, typedCallNode, valueApply, zeroOf } from "./types/index.js";

/* an exponent typed for its base's exactness: over the exact rings
(the type's integerExponents flag) an integer-valued exponent is a
bigint — valueApply's power fold and the power nodes built below then
match the exact integer-exponent cases — and a plain double anywhere
else. */

const exponentValue = (baseType, exponent) =>
    Number.isInteger(exponent) && baseType.integerExponents
        ? BigInt(exponent)
        : exponent;

const exponentNode = (baseType, exponent, index) => {
    const value = exponentValue(baseType, exponent);

    return typeof value === "bigint"
        ? numberNode(value, index, 0, integerType)
        : numberNode(value, index);
};

/* if node is a power with a negative literal exponent, its inverse:
{ base, exponent } with the sign flipped positive. the exponent must
be real by its type's lights (a complex literal exponent qualifies
only if its imaginary part is zero). shared with codegen, which
partitions product factors the same way. */

export function inverseOf(node) {
    if (
        node.type === "call" &&
        (node.callee.name === "power" || node.callee.name === "pow") &&
        isLiteral(node.arguments[1])
    ) {
        const value = node.arguments[1].value;
        const exponent = typeOfValue(value).asReal(value);

        if (exponent !== undefined && exponent < 0) {
            return {
                base: node.arguments[0],
                exponent: -exponent,
            };
        }
    }

    return null;
}

/* whether 1 over a literal power's base is worth keeping symbolic as
a fraction: exact-tower values keep it (the fraction is the canonical
shape), doubles keep it unless the inverse comes out an integer
(1/0.5 folds to 2, but 1/3 is no 0.333..., and 1/0.45 no
2.2222222222222223). */

const keepsFraction = (baseValue, exponent) => {
    if (typeof baseValue === "bigint") {
        return true;
    }

    if (typeof baseValue === "number") {
        return !Number.isInteger(baseValue ** -exponent);
    }

    if (typeof baseValue?.isInteger === "function") {
        return baseValue.isInteger();
    }

    return false;
};

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

function cancelSigned(pairs) {
    const kept = [];
    const used = new Set();

    for (let i = 0; i < pairs.length; i++) {
        if (used.has(i)) continue;

        let cancelled = false;

        for (let j = i + 1; j < pairs.length; j++) {
            if (used.has(j)) continue;

            if (
                pairs[i].sign !== pairs[j].sign &&
                treesEqual(pairs[i].node, pairs[j].node)
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

function canonicalSum(tree) {
    const collected = [];
    collectTerms(tree, 1, collected);

    let constant;
    let constantAt = -1;
    let fold = true;
    const terms = [];

    for (const { sign, node } of collected) {
        let term = canonicalizeShallow(node);
        let termSign = sign;

        // a negated term merges its sign into the sum
        if (term.type === "call" && term.callee.name === "negate") {
            termSign = -termSign;
            term = term.arguments[0];
        }

        if (isLiteral(term) && fold) {
            const signed =
                termSign < 0 ? valueApply(arithmetic.negate, term.value) : term.value;
            const next =
                constant === undefined
                    ? signed
                    : valueApply(arithmetic.plus, constant, signed);

            if (typeOfValue(next).isFinite(next)) {
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

    const kept = cancelSigned(terms);

    if (constant !== undefined && !typeOfValue(constant).isZero(constant)) {
        const { sign, value } = typeOfValue(constant).splitSign(constant);

        kept.splice(Math.min(constantAt, kept.length), 0, {
            sign,
            node: numberNode(value, tree.index),
        });
    }

    if (kept.length === 0) {
        return numberNode(zeroOf(typeOf(tree)), tree.index, tree.length);
    }

    const nodes = kept.map(({ sign, node }) =>
        sign > 0
            ? node
            : typedCallNode(arithmetic.negate, [node], node.index, node.length)
    );

    return nodes.length === 1
        ? nodes[0]
        : typedCallNode(canonical.sum, nodes, tree.index, tree.length);
}

function canonicalProduct(tree) {
    const context = { sign: 1 };
    const collected = [];
    collectFactors(tree, 1, context, collected);

    /* the family the chain flattens into, by its result type: the
    Hadamard operations over vectors, the ring product over scalars.
    dispatch guarantees a chain is one family. */
    const family = isVector(typeOf(tree))
        ? { form: canonical.pointwiseProduct, times: products.pointwiseMultiply }
        : { form: canonical.product, times: products.multiply };

    // each side's literals fold into that side's own constant
    let numeratorConstant;
    let denominatorConstant;
    let hasNumeratorConstant = false;
    let hasDenominatorConstant = false;
    const entries = [];

    for (const { side, node } of collected) {
        /* a power with a literal base and a negative integer exponent
        is this pass's own emission shape for a fraction's
        denominator; leave it be when folding it into a decimal would
        be inexact — re-canonicalizing folds it, and the fraction does
        not survive a second pass (idempotency). an exact inverse
        (0.5^-1 is 2) still folds, to the decimal. */
        const emittedInverse = inverseOf(node);
        let factor =
            emittedInverse !== null &&
            Number.isInteger(emittedInverse.exponent) &&
            isLiteral(emittedInverse.base) &&
            keepsFraction(emittedInverse.base.value, emittedInverse.exponent)
                ? node
                : canonicalizeShallow(node);

        // a negated factor flips the product's sign instead of
        // surviving as a factor: x * -(y) is -(x * y)
        if (factor.type === "call" && factor.callee.name === "negate") {
            context.sign = -context.sign;
            factor = factor.arguments[0];
        }

        // a power with a negative literal exponent flips sides:
        // x * y^-1 is a numerator x over a denominator y
        const inverse = inverseOf(factor);
        const base = inverse ? inverse.base : factor;
        const exponent = inverse ? inverse.exponent : 1;
        const isDenominator = side < 0 !== Boolean(inverse);

        if (isLiteral(base)) {
            const value = valueApply(
                arithmetic.power,
                base.value,
                exponentValue(typeOfValue(base.value), exponent)
            );
            const previous = isDenominator
                ? denominatorConstant
                : numeratorConstant;
            const next =
                previous === undefined
                    ? value
                    : valueApply(family.times, previous, value);

            if (typeOfValue(next).isFinite(next)) {
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

    if (hasNumeratorConstant && typeOfValue(numeratorConstant).isZero(numeratorConstant)) {
        return numberNode(zeroOf(typeOf(tree)), tree.index, tree.length);
    }

    // numerator and denominator constants cross-reduce when their type
    // can divide them exactly: 2*x/4 is 0.5*x, but 2*x/3 keeps its
    // fraction
    if (hasNumeratorConstant && hasDenominatorConstant) {
        const quotient = typeOfValue(numeratorConstant).crossReduce(
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
        entries.filter((factor) => factor.exponent === 1)
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
    if (
        hasNumeratorConstant &&
        typeOfValue(numeratorConstant).isMinusOne(numeratorConstant)
    ) {
        sign = -sign;
        hasNumeratorConstant = false;
    }

    if (
        hasDenominatorConstant &&
        typeOfValue(denominatorConstant).isMinusOne(denominatorConstant)
    ) {
        sign = -sign;
        hasDenominatorConstant = false;
    }

    const applyExponent = ({ node, exponent }) =>
        exponent === 1
            ? node
            : typedCallNode(
                  arithmetic.power,
                  [node, exponentNode(typeOf(node), exponent, node.index)],
                  node.index
              );

    const factors = [];

    if (
        hasNumeratorConstant &&
        (!typeOfValue(numeratorConstant).isOne(numeratorConstant) ||
            (numerator.length === 0 && denominator.length === 0))
    ) {
        factors.push(
            numberNode(
                sign < 0
                    ? valueApply(arithmetic.negate, numeratorConstant)
                    : numeratorConstant,
                tree.index
            )
        );
        sign = 1;
    }

    factors.push(...numerator.map(applyExponent));

    if (
        hasDenominatorConstant &&
        !typeOfValue(denominatorConstant).isOne(denominatorConstant)
    ) {
        factors.push(
            typedCallNode(
                arithmetic.power,
                [
                    numberNode(denominatorConstant, tree.index),
                    exponentNode(typeOfValue(denominatorConstant), -1, tree.index),
                ],
                tree.index
            )
        );
    }

    for (const factor of denominator) {
        factors.push(
            typedCallNode(
                arithmetic.power,
                [
                    factor.node,
                    exponentNode(typeOf(factor.node), -factor.exponent, factor.node.index),
                ],
                factor.node.index
            )
        );
    }

    if (factors.length === 0) {
        return numberNode(
            sign < 0 ? valueApply(arithmetic.negate, oneOf(typeOf(tree))) : oneOf(typeOf(tree)),
            tree.index,
            tree.length
        );
    }

    // a fully constant product folds to one literal — this is what
    // collapses a lone 2^-1 (from x/y*y/2/x) to 0.5. anything with a
    // non-constant factor keeps its shape: x/3 renders as a fraction,
    // not x * 0.333...
    const values = factors.map(foldableValue);

    if (!values.includes(undefined)) {
        const folded = values.reduce((product, factor) =>
            valueApply(family.times, product, factor)
        );
        const value = sign < 0 ? valueApply(arithmetic.negate, folded) : folded;

        if (typeOfValue(value).isFinite(value)) {
            return numberNode(value, tree.index, tree.length);
        }
    }

    const result =
        factors.length === 1
            ? factors[0]
            : typedCallNode(family.form, factors, tree.index, tree.length);

    return sign > 0
        ? result
        : typedCallNode(arithmetic.negate, [result], tree.index, tree.length);
}

/* the default branch: canonicalize the arguments only, sharing the
call when nothing changed, then simplify. */

function canonicalizeArguments(tree) {
    const args = tree.arguments.map((argument) => canonicalizeShallow(argument));

    const next = args.some((argument, i) => argument !== tree.arguments[i])
        ? copyNode(tree, { arguments: args })
        : tree;

    return simplify(next);
}

function canonicalizeShallow(tree) {
    if (tree.type === "diff") {
        if (!tree.f) {
            return tree;
        }

        const f = canonicalizeShallow(tree.f);

        return f === tree.f ? tree : copyNode(tree, { f });
    }

    if (tree.type === "cases") {
        const cases = tree.cases.map(({ condition, body }) => ({
            condition: canonicalizeShallow(condition),
            body: canonicalizeShallow(body),
        }));

        const next = cases.some(
            ({ condition, body }, i) =>
                condition !== tree.cases[i].condition || body !== tree.cases[i].body
        )
            ? copyNode(tree, { cases })
            : tree;

        return simplify(next);
    }

    if (tree.type === "convert") {
        const operand = canonicalizeShallow(tree.operand);

        return operand === tree.operand ? tree : copyNode(tree, { operand });
    }

    if (tree.type !== "call") {
        return tree;
    }

    switch (tree.callee.canonical) {
        case "sum":
            return canonicalSum(tree);

        case "product":
            return canonicalProduct(tree);

        default:
            return canonicalizeArguments(tree);
    }
}

/* polynomialize — the polynomial step of canonicalization.

a subtree is polynomial in a set of ATOMS — variables, and nodes that
are not arithmetic (sin(x), log(1 - 1/x), a matmul chain, a cases
block) — when it is built from atoms and literals by addition,
multiplication, negation, and powers with literal integer exponents.
polynomialize actualizes every multiplication of such a subtree: the
result is a sum of monomials, each a constant coefficient times atoms
raised to integer exponents, with like terms — monomials over the
same atoms to the same exponents — combined into one. (x + y)·(x − y)
is x^2 − y^2, x + x is 2·x, 2·sin(x) + sin(x) is 3·sin(x), and
x^2·x^-1 is x.

the reading is type-neutral: coefficients fold through the literals'
own arithmetic, so rationals combine exactly, and a fraction the type
cannot divide exactly stays a symbolic numerator/denominator pair in
the coefficient — the same shape canonicalProduct keeps, so 2·x/3's
coefficient is 2 over 3 and x/6 + x/6 combines to (2·x)/6. the
Hadamard family over vectors polynomializes through its own product.
the noncommutative products never reach the reading: their cases
carry no canonical tags, so no canonical product node holds their
factors — they are atoms.

distribution is exponential in the worst case, so an expansion past
maxPolynomialTerms monomials is declined: the overflowing node reads
as an atom and keeps its factored form, while the polynomial
structure around it still actualizes (huge + huge is 2·huge).
non-finite coefficient folds decline the same way, as canonicalize's
own folds do. factor order inside a monomial normalizes (atoms sort
by their structural key); the sum's term order is first occurrence,
the way canonicalSum's folded constant keeps its position. */

const maxPolynomialTerms = 256;

/* a polynomial is a Map of monomial key → monomial in first-occurrence
order (the Map's insertion order — a combined term keeps the position
of its first occurrence, the way canonicalSum's folded constant does).
a monomial is { num, den, factors }: the coefficient as a
numerator/denominator pair of folded literal values (den is the
type's one unless the type could not divide exactly) and the atoms as
a key-sorted array of [key, { atom, exponent }] with nonzero integer
exponents. the zero polynomial is the empty Map. */

const monomialKey = (factors) =>
    factors.map(([key, { exponent }]) => `${exponent}#${key}`).join("|");

/* the structural key of an atom: two atoms are the same factor of a
monomial exactly when their keys match. literals key by type and
value (bigints tagged for JSON), everything else by shape. a finer
distinction than treesEqual (a float 2 and a complex 2+0i key
differently though treesEqual) costs a missed combination, never a
wrong one. */

const jsonValue = (value) =>
    JSON.stringify(value, (key, v) => (typeof v === "bigint" ? `${v}n` : v));

function atomKey(node) {
    switch (node.type) {
        case "number":
            return (
                `n${numberType(node).name}:${jsonValue(node.value)}:` +
                `${node.name ?? ""}`
            );

        case "variable":
            return `v${node.name}:${node.valueType?.name ?? ""}`;

        case "convert":
            return `c${node.target.name}(${atomKey(node.operand)})`;

        case "call":
            return (
                `f${node.callee.name}:${node.callee.returns?.name ?? ""}` +
                `(${node.arguments.map(atomKey).join(",")})`
            );

        case "cases":
            return (
                `s${node.valueType.name}(` +
                node.cases
                    .map(
                        ({ condition, body }) =>
                            `${atomKey(condition)}?${atomKey(body)}`
                    )
                    .join(",") +
                ")"
            );

        case "diff":
            return `d${node.wrt ?? ""}(${node.f ? atomKey(node.f) : ""})`;

        case "instance":
            return (
                `i${node.of.name}(` +
                node.replacements
                    .map((replacement) => `${replacement.name}=${atomKey(replacement.tree)}`)
                    .join(",") +
                ")"
            );

        default:
            return `?${node.type}`;
    }
}

/* coefficient arithmetic over the num/den pairs, mirroring
canonicalProduct: multiply into both sides and cross-reduce when the
type divides exactly; add like terms over a shared denominator (the
cross-multiplication canonicalProduct never needs otherwise). every
fold runs through valueApply — with the product family's own times
for multiplication — so rationals are exact and floats round as
floats do. a fold producing a non-finite value declines (null), and
the node collapses to an atom. */

function reduceCoefficient(coefficient) {
    /* the cross-reduction mirrors canonicalProduct: it fires with a
    numerator to reduce against (2·x/4 is 0.5·x); a bare denominator
    keeps its fraction (x/2 is x over 2, not 0.5·x) */
    const quotient = typeOfValue(coefficient.num).isOne(coefficient.num)
        ? undefined
        : typeOfValue(coefficient.num).crossReduce(
              coefficient.num,
              coefficient.den
          );

    const reduced =
        quotient === undefined
            ? coefficient
            : { num: quotient, den: oneOf(typeOfValue(quotient)) };

    return typeOfValue(reduced.num).isFinite(reduced.num) &&
        typeOfValue(reduced.den).isFinite(reduced.den)
        ? reduced
        : null;
}

function multiplyCoefficients(a, b, times) {
    return reduceCoefficient({
        num: valueApply(times, a.num, b.num),
        den: valueApply(times, a.den, b.den),
    });
}

function addCoefficients(a, b, times) {
    const sameDenominator = typeOfValue(a.den).literalEqual(a.den, b.den);

    return reduceCoefficient({
        num: sameDenominator
            ? valueApply(arithmetic.plus, a.num, b.num)
            : valueApply(
                  arithmetic.plus,
                  valueApply(times, a.num, b.den),
                  valueApply(times, b.num, a.den)
              ),
        den: sameDenominator ? a.den : valueApply(times, a.den, b.den),
    });
}

/* the polynomial constructors: the zero polynomial is the empty Map,
the identity a single factorless monomial of the node's type's one,
an atom a single monomial of the node itself, a literal a single
factorless monomial of its value (zero literals are the zero
polynomial). */

function onePolynomial(node) {
    const one = oneOf(typeOf(node));

    return new Map([["", { num: one, den: one, factors: [] }]]);
}

function atomPolynomial(node) {
    const one = oneOf(typeOf(node));
    const factors = [[atomKey(node), { atom: node, exponent: 1 }]];

    return new Map([[monomialKey(factors), { num: one, den: one, factors }]]);
}

function constantPolynomial(node) {
    const type = numberType(node);

    if (type.isZero(node.value)) {
        return new Map();
    }

    return new Map([
        ["", { num: node.value, den: oneOf(typeOfValue(node.value)), factors: [] }],
    ]);
}

/* the polynomial operations. each returns null when it declines — a
size explosion or a non-finite fold — and the reading collapses the
node to an atom. */

function addPolynomials(a, b, times) {
    const result = new Map(a);

    for (const monomial of b.values()) {
        const key = monomialKey(monomial.factors);
        const existing = result.get(key);

        if (!existing) {
            result.set(key, monomial);
            continue;
        }

        const summed = addCoefficients(existing, monomial, times);

        if (summed === null) {
            return null;
        }

        if (typeOfValue(summed.num).isZero(summed.num)) {
            result.delete(key);
        } else {
            result.set(key, { ...monomial, num: summed.num, den: summed.den });
        }
    }

    return result;
}

const negatePolynomial = (poly) =>
    new Map(
        [...poly].map(([key, monomial]) => [
            key,
            { ...monomial, num: valueApply(arithmetic.negate, monomial.num) },
        ])
    );

/* merge-join of the key-sorted factor arrays: equal keys sum their
exponents, and a zero sum drops the factor (x·x^-1 leaves no atom). */

function mergeFactors(a, b) {
    const merged = [];

    let i = 0;
    let j = 0;

    while (i < a.length || j < b.length) {
        if (j === b.length || (i < a.length && a[i][0] < b[j][0])) {
            merged.push(a[i++]);
        } else if (i === a.length || b[j][0] < a[i][0]) {
            merged.push(b[j++]);
        } else {
            const exponent = a[i][1].exponent + b[j][1].exponent;

            if (exponent !== 0) {
                merged.push([a[i][0], { atom: a[i][1].atom, exponent }]);
            }

            i++;
            j++;
        }
    }

    return merged;
}

function multiplyPolynomials(a, b, times) {
    if (a.size === 0 || b.size === 0) {
        return new Map();
    }

    /* the cap is on the convolution's potential size, checked before
    the work: merging only shrinks it */
    if (a.size * b.size > maxPolynomialTerms) {
        return null;
    }

    const result = new Map();

    for (const ma of a.values()) {
        for (const mb of b.values()) {
            const coefficient = multiplyCoefficients(ma, mb, times);

            if (coefficient === null) {
                return null;
            }

            if (typeOfValue(coefficient.num).isZero(coefficient.num)) {
                continue;
            }

            const factors = mergeFactors(ma.factors, mb.factors);
            const key = monomialKey(factors);
            const existing = result.get(key);

            if (!existing) {
                result.set(key, { num: coefficient.num, den: coefficient.den, factors });
                continue;
            }

            const summed = addCoefficients(existing, coefficient, times);

            if (summed === null) {
                return null;
            }

            if (typeOfValue(summed.num).isZero(summed.num)) {
                result.delete(key);
            } else {
                result.set(key, { num: summed.num, den: summed.den, factors });
            }
        }
    }

    return result;
}

function powerPolynomial(poly, exponent, times, node) {
    let result = onePolynomial(node);
    let base = poly;
    let remaining = exponent;

    while (remaining > 0) {
        if (remaining % 2 === 1) {
            result = multiplyPolynomials(result, base, times);

            if (result === null) {
                return null;
            }
        }

        remaining = Math.floor(remaining / 2);

        if (remaining > 0) {
            base = multiplyPolynomials(base, base, times);

            if (base === null) {
                return null;
            }
        }
    }

    return result;
}

/* 1 over a polynomial: only a single monomial inverts — the
coefficient's sides swap and the exponents negate. anything else (a
sum, a zero coefficient) declines: the node is an atom. */

function invertPolynomial(poly) {
    if (poly.size !== 1) {
        return null;
    }

    const [monomial] = poly.values();

    if (typeOfValue(monomial.num).isZero(monomial.num)) {
        return null;
    }

    const factors = monomial.factors.map(([key, { atom, exponent }]) => [
        key,
        { atom, exponent: -exponent },
    ]);

    return new Map([
        [
            monomialKey(factors),
            { num: monomial.den, den: monomial.num, factors },
        ],
    ]);
}

/* the subtree as a polynomial. additive and multiplicative chains
read through the same terms/factors tags canonicalize collects with;
a power with a literal integer exponent reads through its base (a
negative exponent inverts a single-monomial base — x^-2 is the atom x
to the −2 — and anything wider is an atom whole); every other node is
an atom. overflow and non-finite folds collapse the offending node to
a single-atom polynomial, keeping its form. */

function readPolynomial(node) {
    if (node.type === "number") {
        // named constants stay symbolic: pi is an atom, not a coefficient
        return isLiteral(node) ? constantPolynomial(node) : atomPolynomial(node);
    }

    if (node.type !== "call") {
        return atomPolynomial(node);
    }

    const times = isVector(typeOf(node))
        ? products.pointwiseMultiply
        : products.multiply;

    if (node.callee.terms) {
        const terms = [];
        collectTerms(node, 1, terms);

        let poly = new Map();

        for (const { sign, node: term } of terms) {
            let termPoly = readPolynomial(term);

            if (sign < 0) {
                termPoly = negatePolynomial(termPoly);
            }

            poly = addPolynomials(poly, termPoly, times);

            if (poly === null) {
                return atomPolynomial(node);
            }
        }

        return poly;
    }

    if (node.callee.factors) {
        const context = { sign: 1 };
        const factors = [];
        collectFactors(node, 1, context, factors);

        let poly = onePolynomial(node);

        for (const { side, node: factor } of factors) {
            let factorPoly = readPolynomial(factor);

            if (side < 0) {
                factorPoly = invertPolynomial(factorPoly);

                if (factorPoly === null) {
                    return atomPolynomial(node);
                }
            }

            poly = multiplyPolynomials(poly, factorPoly, times);

            if (poly === null) {
                return atomPolynomial(node);
            }
        }

        return context.sign > 0 ? poly : negatePolynomial(poly);
    }

    if (node.callee.name === "power") {
        const [base, exponentArgument] = node.arguments;
        const exponent = isLiteral(exponentArgument)
            ? typeOfValue(exponentArgument.value).asReal(exponentArgument.value)
            : undefined;

        if (exponent === undefined || !Number.isInteger(exponent)) {
            return atomPolynomial(node);
        }

        if (exponent === 0) {
            // simplify has normally folded x^0 already
            return onePolynomial(node);
        }

        if (exponent < 0) {
            /* a literal base with a negative exponent is a coefficient
            (canonicalProduct's denominator constant), kept symbolic —
            even a non-invertible one (1/0 keeps its shape) */
            if (isLiteral(base)) {
                const denominator = valueApply(
                    arithmetic.power,
                    base.value,
                    exponentValue(typeOfValue(base.value), -exponent)
                );
                return new Map([
                    [
                        "",
                        {
                            num: oneOf(typeOfValue(base.value)),
                            den: denominator,
                            factors: [],
                        },
                    ],
                ]);
            }

            const inverted = invertPolynomial(readPolynomial(base));

            return (
                (inverted && powerPolynomial(inverted, -exponent, times, node)) ??
                atomPolynomial(node)
            );
        }

        return (
            powerPolynomial(readPolynomial(base), exponent, times, node) ??
            atomPolynomial(node)
        );
    }

    return atomPolynomial(node);
}

/* the polynomial as a tree, in the conventions canonicalSum and
canonicalProduct emit: the coefficient first (a -1 factors out as a
negation of the whole term), the atoms after it (positive exponents,
then the denominator constant as a power, then the negative ones, so
codegen's fraction renders numerator first), and the sum's constant
term at the position of the first constant term. */

function emitMonomial(monomial, family, index) {
    const { num, den, factors } = monomial;
    let { sign, value: magnitude } = typeOfValue(num).splitSign(num);

    // -1 factors out as a negation of the term (a splat -1 over
    // vectors too, as canonicalProduct's isMinusOne rule has it)
    if (
        typeOfValue(magnitude).isMinusOne(magnitude) &&
        typeOfValue(den).isOne(den)
    ) {
        magnitude = oneOf(typeOfValue(magnitude));
        sign = -sign;
    }

    const nodes = [];

    if (!typeOfValue(magnitude).isOne(magnitude)) {
        nodes.push(numberNode(magnitude, index));
    }

    for (const [, { atom, exponent }] of factors) {
        if (exponent > 0) {
            nodes.push(
                exponent === 1
                    ? atom
                    : typedCallNode(
                          arithmetic.power,
                          [atom, exponentNode(typeOf(atom), exponent, atom.index)],
                          atom.index
                      )
            );
        }
    }

    if (!typeOfValue(den).isOne(den)) {
        nodes.push(
            typedCallNode(
                arithmetic.power,
                [
                    numberNode(den, index),
                    exponentNode(typeOfValue(den), -1, index),
                ],
                index
            )
        );
    }

    for (const [, { atom, exponent }] of factors) {
        if (exponent < 0) {
            nodes.push(
                typedCallNode(
                    arithmetic.power,
                    [atom, exponentNode(typeOf(atom), exponent, atom.index)],
                    atom.index
                )
            );
        }
    }

    const body =
        nodes.length === 1 ? nodes[0] : typedCallNode(family.form, nodes, index);

    return sign < 0
        ? typedCallNode(arithmetic.negate, [body], index, body.length)
        : body;
}

/* the constant term, in canonicalProduct's shape: the numerator
literal, and the denominator kept as a symbolic power factor (x/3's
coefficient is 1 over 3, not 0.333... — a standalone literal power is
the shallow pass's simplify's fold, already done before the
polynomial reading). a bare denominator emits the bare power, so a
factor-context 3^-1 reads clean. */

function emitConstant(monomial, family, index) {
    const { num, den } = monomial;
    const { sign, value: magnitude } = typeOfValue(num).splitSign(num);

    let body;

    if (typeOfValue(den).isOne(den)) {
        body = numberNode(magnitude, index);
    } else {
        const denominator = typedCallNode(
            arithmetic.power,
            [numberNode(den, index), exponentNode(typeOfValue(den), -1, index)],
            index
        );

        body = typeOfValue(magnitude).isOne(magnitude)
            ? denominator
            : typedCallNode(
                  family.form,
                  [numberNode(magnitude, index), denominator],
                  index
              );
    }

    return sign < 0
        ? typedCallNode(arithmetic.negate, [body], index, body.length)
        : body;
}

function emitPolynomial(poly, node) {
    const family = isVector(typeOf(node))
        ? { form: canonical.pointwiseProduct }
        : { form: canonical.product };

    const terms = [];
    let constant;
    let constantAt = 0;

    for (const monomial of poly.values()) {
        if (monomial.factors.length === 0) {
            constant = monomial;
            constantAt = terms.length;
        } else {
            terms.push(emitMonomial(monomial, family, node.index));
        }
    }

    if (constant) {
        terms.splice(constantAt, 0, emitConstant(constant, family, node.index));
    }

    if (terms.length === 0) {
        return numberNode(zeroOf(typeOf(node)), node.index, node.length);
    }

    return terms.length === 1
        ? terms[0]
        : typedCallNode(canonical.sum, terms, node.index, node.length);
}

/* bottom-up over the canonicalized tree: children first (so the
reading at each node sees polynomial normal forms), then the node
itself. an atom-rooted or clean node keeps its tree — shared, the
passes' convention — which treesEqual decides: a read that
actualized nothing emits a tree equal to the input. instances are
opaque atoms here as everywhere. */

function polynomialize(node) {
    if (node.type === "instance") {
        return node;
    }

    const rebuilt = mapChildren(node, polynomialize);

    if (rebuilt.type !== "call") {
        return rebuilt;
    }

    /* the reading merges factors of one monomial into another's —
    valid only when the atoms' multiplication commutes (matrices,
    quaternions, and octonions keep their products as written, the
    same rule the canonical tags encode) */
    if (!typeOf(rebuilt).commutative) {
        return rebuilt;
    }

    const vocabulary =
        rebuilt.callee.terms ||
        rebuilt.callee.factors ||
        rebuilt.callee.name === "power";

    if (!vocabulary) {
        return rebuilt;
    }

    const emitted = emitPolynomial(readPolynomial(rebuilt), rebuilt);

    return treesEqual(emitted, rebuilt) ? rebuilt : emitted;
}

/* canonicalize — the normalizing pass: the shallow flattening above,
then the polynomial step. */

export function canonicalize(tree) {
    return polynomialize(canonicalizeShallow(tree));
}
