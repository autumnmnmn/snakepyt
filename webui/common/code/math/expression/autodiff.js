/* autodiff

builtin table assembly, the value domains, and differentiate.

the function vocabulary lives in definitions.js: one object per
function holding everything about it — its float-level evaluate, its
derivative recipe, its rendering templates, its typing rule, its
rewrite rules (the full schema is documented there). makeBuiltins
assembles a domain's builtin TABLE from a domain's ops table — a
name → value function map that fixes what exists in the domain and
what each name means on its values — plus optional per-name
overrides: each table entry is the stock definition from
definitions.js with the overridden fields replaced (templates merged
per-target). the stock derivative recipes
are domain-neutral: they are written against the table under
construction (via the builders object), so a domain that redefines
multiply gets product rules built from *its* multiply. the recipes
assume a commutative arithmetic; noncommutative domains should
supply their own derivative overrides (and see domain.commutative
for the rewrite passes).

builtins/standardFunctions are the assembled tables of the float
domain (floatDomain), the default everywhere a domain is accepted. */

import { definitions, definitionByName } from "./definitions.js";
import { callNode, numberNode } from "./nodes.js";

/* the tree builders derivative recipes are written against: arithmetic
of the table under construction, so recipe-built trees carry the
domain's own definitions (its templates, its evaluate) rather than the
float domain's. apply looks names up lazily, so recipes can reference
siblings regardless of assembly order. ops is the domain's value-level
table, for recipes that must compute on literal values directly. */

function makeBuilders(table, ops) {
    const literal = (value, node) => numberNode(value, node.index);
    const build = (name, args, index) => {
        const definition = table[name];

        if (!definition) {
            throw new Error(
                `'${name}' is not defined in this domain's builtin table`
            );
        }

        return callNode(definition, args, index);
    };

    return {
        literal,
        ops,
        table,
        plus: (a, b) => build("plus", [a, b], a.index),
        minus: (a, b) => build("minus", [a, b], a.index),
        multiply: (a, b) => build("multiply", [a, b], a.index),
        divide: (a, b) => build("divide", [a, b], a.index),
        power: (a, b) => build("power", [a, b], a.index),
        negate: (a) => build("negate", [a], a.index),
        apply: (name, ...args) => build(name, args, args[0].index),
        square: (x) => build("power", [x, literal(2, x)], x.index),
    };
}

/* assemble a builtin table from an ops table — name → value function,
fixing which functions exist in a domain and what they mean on its
values — plus optional per-name overrides of any definition field
(evaluate, derivative, template, ...). a derivative, stock or
override, is a recipe (args, derivatives, builders) → tree (builders
may be ignored by recipes that don't build with the domain's
arithmetic). names present in ops get the stock definition from
definitions.js unless overridden; names only in overrides define new
builtins; names in neither are simply not part of the table.

the structural builtins derive from the binary ops: sum/product are
the n-ary forms of plus/multiply (their canonicalize role), and
select is the ternary's target. */

export function makeBuiltins(ops = {}, overrides = {}) {
    const derived = {
        ...(ops.plus && { sum: (...args) => args.reduce(ops.plus) }),
        ...(ops.multiply && {
            product: (...args) => args.reduce(ops.multiply),
        }),
        select: (condition, then, otherwise) =>
            condition ? then : otherwise,
    };

    ops = { ...derived, ...ops };

    const table = {};
    const builders = makeBuilders(table, ops);

    for (const name of new Set([...Object.keys(ops), ...Object.keys(overrides)])) {
        const override = overrides[name];
        const stock = definitionByName[name];
        const evaluate = override?.evaluate ?? ops[name];
        const recipe = override?.derivative ?? stock?.derivative;

        if (evaluate === undefined && recipe === undefined) {
            continue;
        }

        const definition = { ...stock, name };

        if (evaluate !== undefined) {
            definition.evaluate = evaluate;
        } else {
            delete definition.evaluate;
        }

        if (recipe !== undefined) {
            definition.derivative = (args, derivatives) =>
                recipe(args, derivatives, builders);
        } else {
            delete definition.derivative;
        }

        const template = { ...stock?.template, ...override?.template };

        if (Object.keys(template).length > 0) {
            definition.template = template;
        } else {
            delete definition.template;
        }

        for (const [field, value] of Object.entries(override ?? {})) {
            if (
                field !== "name" &&
                field !== "evaluate" &&
                field !== "derivative" &&
                field !== "template"
            ) {
                definition[field] = value;
            }
        }

        table[name] = definition;
    }

    return table;
}

/* the float domain's ops: the stock definitions' evaluate fields,
plain doubles. */

export const floatOps = Object.fromEntries(
    definitions
        .filter((definition) => definition.evaluate !== undefined)
        .map((definition) => [definition.name, definition.evaluate])
);

/* the stock derivative recipes, name → (args, derivatives, builders) →
tree. exported for override authors delegating to the stock behavior. */

export const recipes = Object.fromEntries(
    definitions
        .filter((definition) => definition.derivative !== undefined)
        .map((definition) => [definition.name, definition.derivative])
);

/* numerator/denominator as a single constant, when the division is
exact in doubles and worth showing as one number: for integer constants
the reduced denominator must be 2/5-smooth, i.e. the quotient must be a
terminating decimal (2/4 → 0.5, 6/4 → 1.5, but 2/3 stays a fraction —
0.666... is a longer rendering of an inexact value). the round-trip
check rejects quotients the division itself rounded. */

function exactQuotient(numerator, denominator) {
    const quotient = numerator / denominator;

    if (!Number.isFinite(quotient) || quotient * denominator !== numerator) {
        return undefined;
    }

    if (Number.isInteger(numerator) && Number.isInteger(denominator)) {
        let gcd = Math.abs(denominator);

        for (
            let remainder = Math.abs(numerator);
            remainder;
            [remainder, gcd] = [gcd % remainder, remainder]
        );

        let rest = Math.abs(denominator) / gcd;

        while (rest % 2 === 0) rest /= 2;
        while (rest % 5 === 0) rest /= 5;

        if (rest !== 1) {
            return undefined;
        }
    }

    return quotient;
}

/* standardFunctionsOf is everything in a builtin table but the
structural functions — what a caller offers as the function
vocabulary. */

export function standardFunctionsOf(table) {
    return Object.keys(table)
        .filter((name) => !table[name].structural)
        .map((name) => table[name]);
}

/* a domain is the value-level semantics of a tree, bundled with the
hooks the pipeline stages need:

- name: used in error messages ("not defined in the complex domain").
- ops / builtins / standard: the assembled tables (makeBuiltins +
  standardFunctionsOf).
- lift(value): coerce a plain JS number (a source literal or a
  recipe-built one) to a domain value. idempotent; identity for float.
- constant(value, name): read a fill-time constant; throws on values
  the domain can't hold.
- isFinite(value): the folding guard — folds producing non-finite
  values are declined.
- literalEqual(a, b): literal value equality, for treesEqual's number
  comparison and cancellation.
- asReal(value): the real value of a literal, if it is one (complex:
  imaginary part zero) — power exponents and canonicalize's side
  flips need real exponents.
- isZero/isOne/isMinusOne(value): the identity/annihilator probes of
  the rewrite passes.
- splitSign(value) → { sign, value }: how a folded constant presents
  itself in a sum — floats show -3 as sign -1 with |3|, other domains
  keep the value whole.
- crossReduce(numerator, denominator) → value | undefined: a
  product's numerator and denominator constants as one constant, or
  undefined to keep the fraction. the float domain answers only exact,
  nicely rendering quotients (exactQuotient above).
- commutative: whether canonicalize may flatten and cancel products
  (default true). false leaves multiplication associated as written.
- renderNumber: optional { wgsl(node), math(node) } hooks for
  non-double literals (codegen defaults to float literals). */

function numericConstant(value, name) {
    const number = Number(value);

    if (Number.isNaN(number)) {
        throw new Error(
            `Constant '${name}' has a non-numeric value '${value}'`
        );
    }

    return number;
}

/* makeDomain assembles a domain from its ops table and whatever hooks
differ from the plain-number defaults below. this is the way to
override the default operation implementations: makeDomain({ ops: {
...floatOps, multiply: myMultiply } }) gives a full pipeline — fill,
simplify, canonicalize, differentiate, codegen — over the overridden
operations, with the stock derivative recipes rebuilt against them. */

export function makeDomain({
    name = "custom",
    ops = {},
    overrides,
    lift = (value) => value,
    constant = numericConstant,
    isFinite = Number.isFinite,
    literalEqual = (a, b) => a === b,
    asReal = (value) => value,
    isZero = (value) => value === 0,
    isOne = (value) => value === 1,
    isMinusOne = (value) => value === -1,
    splitSign = (value) => ({ sign: Math.sign(value), value: Math.abs(value) }),
    crossReduce = () => undefined,
    commutative = true,
    renderNumber,
}) {
    const table = makeBuiltins(ops, overrides);

    return {
        name,
        ops,
        builtins: table,
        standard: standardFunctionsOf(table),
        lift,
        constant,
        isFinite,
        literalEqual,
        asReal,
        isZero,
        isOne,
        isMinusOne,
        splitSign,
        crossReduce,
        commutative,
        renderNumber,
    };
}

export const floatDomain = makeDomain({
    name: "float",
    ops: floatOps,
    crossReduce: exactQuotient,
});

export const builtins = floatDomain.builtins;

export const standardFunctions = floatDomain.standard;

export function differentiate(tree, withRespectTo) {
    switch (tree.type) {
        case "number":
            return numberNode(0, tree.index, tree.length);

        case "variable":
            return numberNode(
                tree.name === withRespectTo ? 1 : 0,
                tree.index,
                tree.length
            );

        case "call": {
            if (tree.callee.type !== "function") {
                throw new Error(
                    "Cannot differentiate an unresolved call " +
                        `at index ${tree.index}; ` +
                        "run the tree through fill first"
                );
            }

            if (!tree.callee.derivative) {
                throw new Error(
                    `Function '${tree.callee.name}' does not define ` +
                        `a derivative at index ${tree.index}`
                );
            }

            const derivatives = tree.arguments.map((argument) =>
                differentiate(argument, withRespectTo)
            );

            return tree.callee.derivative(tree.arguments, derivatives);
        }

        default:
            throw new Error(
                `Cannot differentiate a node of type '${tree.type}' ` +
                    `at index ${tree.index}`
            );
    }
}
