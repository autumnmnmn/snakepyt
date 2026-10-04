/* resolve — case resolution and the typed call constructor.

every function definition (operations/) declares which combinations of
types it accepts: a float base case (its top-level evaluate) plus
explicit cases — argument patterns, matchers for shapes no pattern
expresses (matmul's inner dimensions), and variadic cases (the n-ary
canonical forms). resolveCase matches actual argument types against
that list and answers the resolved case: the definition specialized by
the case's fields (its own evaluate, result type, template overrides,
derivative, ...) plus the promotion each argument needs. typedCallNode
is the constructor every call goes through — fill, the derivative
builders, the rewrite passes — so resolution and promotion happen
uniformly at construction time, and a combination no case accepts is a
type error there and then. valueApply is the same resolution at the
value level, for the passes' constant folds.

matching runs in two passes, then a fallback:

1. the exact pass: cases whose patterns the argument types satisfy
   with no promotion at all, in declaration order. a declared case
   never loses to a coercion.
2. the promotion pass: patterns match modulo the lattice (a float
   promotes to complex, a scalar splats into an aggregate, entries
   widen). the case needing the least total promotion wins
   (promotionDistance, lattice.js); ties keep declaration order.
3. the pointwise fallback: with a vector among the arguments and no
   case matching, the operation lifts over the vector's entries —
   the cases resolve against the entry types, scalars splat, and the
   result is a vector of the entry result (which must be scalar).
   this is where `uv + color`, `floor(uv)`, and `uv < color` (a
   vector of bools) get their meaning. a definition's `pointwise`
   field carries per-definition overrides for the lifted case
   (and/or render as & | on bool vectors).

argument patterns: a type object matches exactly that type; "vector",
"matrix", and "tensor" match the tensors of that dimension count
("tensor" any of them), with repeats unifying to one type
(dimensions must agree, entries join through the lattice) and
scalars promoting in as splats; "same" unifies every such position
to one type (select's branches). a case's `returns` is a
type, "arguments" (the unified argument type), or a function of the
promoted argument types. a matcher instead receives the argument
types and answers { returns, promotes?, fields? } or null; its fields
merge into the resolved definition (a modular-arithmetic matcher
bakes its modulus into evaluate and templates this way), templates
merging per-target with an explicitly undefined target suppressing. */

import { callNode } from "../semantics/nodes.js";
import { isMatrix, isTensor, isVector, typeOfValue, vectorType } from "./tensors.js";
import { joinTypes, promoteNode, promotable, promotionDistance } from "./lattice.js";
import { floatType } from "./scalars.js";

/* the type of a number leaf: the value's own type, or the exact ring
stamped on the node when the expression declared it (a natural literal
holds a bigint but types as natural). */

export function numberType(node) {
    return node.valueType ?? typeOfValue(node.value);
}

/* the static type of any node. a call's type is stamped on its callee
at construction; only an unresolved callee (a raw definition, before
fill) needs resolving on the spot. */

export function typeOf(tree) {
    switch (tree.type) {
        case "number":
            return numberType(tree);

        case "variable":
            return tree.valueType ?? floatType;

        case "convert":
            return tree.target;

        case "instance":
        case "cases":
            return tree.valueType;

        case "diff":
            if (tree.f) {
                return tree.valueType;
            }

            throw new Error(
                `The diff operator at index ${tree.index} has no f yet: ` +
                    "it is an operator, not a value — bind its f with a with block"
            );

        case "call":
            return tree.callee.type === "function"
                ? tree.callee.returns
                : resolveCase(
                      tree.callee,
                      tree.arguments.map(typeOf),
                      tree.index
                  ).definition.returns;

        default:
            throw new Error(`Unknown node type '${tree.type}' at index ${tree.index}`);
    }
}

/* the full case list of a definition: the float base case from its
top-level evaluate (its returns is the definition's own, float when
absent), then the explicit cases. */

export function casesOf(definition) {
    const cases = [];

    if (definition.evaluate) {
        cases.push({
            arguments: new Array(definition.evaluate.length).fill(floatType),
            returns: definition.returns ?? floatType,
            evaluate: definition.evaluate,
        });
    }

    return [...cases, ...(definition.cases ?? [])];
}

/* a constant's type and value, for fill: plain numbers read by the
default type; anything else's shape decides (typeOfValue), and the
decided type's constant hook validates and reads the value. */

export function inferConstant(value, name, defaultType) {
    const type = typeof value === "number" ? defaultType : typeOfValue(value);

    return { type, value: type.constant(value, name) };
}

/* the aggregate patterns: "vector" and "matrix" match the one- and
two-dimensional tensors, "tensor" any of them. repeats of one pattern
unify to one type (dimensions must agree, entries join through the
lattice) with scalars promoting in as splats. */

const aggregatePatterns = {
    vector: isVector,
    matrix: isMatrix,
    tensor: isTensor,
};

const isAggregatePattern = (pattern) => pattern in aggregatePatterns;

/* match one case's patterns against the argument types. answers {
promoted (per-argument final types), promotes (the ones that change),
unified (the join over the unifying positions, for returns:
"arguments"), distance (total promotion) } or null. without
promotion every position must match as-is. */

function matchPatterns(patterns, argTypes, allowPromotion) {
    const promoted = [...argTypes];
    const unifyPositions = [];
    let distance = 0;

    const promoteTo = (i, target) => {
        if (argTypes[i] === target) {
            return true;
        }

        if (!allowPromotion || !promotable(argTypes[i], target)) {
            return false;
        }

        promoted[i] = target;
        distance += promotionDistance(argTypes[i], target);

        return true;
    };

    /* a unifying group: the positions holding one pattern must join
    to one type, each promoting to the join. the "same" group admits
    any type; an aggregate-pattern group ("vector", "matrix",
    "tensor") requires at least one matching tensor among its
    positions (the scalars splat into it), and a tensor the pattern
    does not match never matches (a vector in a "matrix" position). */

    const unifyGroup = (positions, predicate, requireAggregate) => {
        if (!positions.length) {
            return true;
        }

        if (
            positions.some((i) => isTensor(argTypes[i]) && !predicate(argTypes[i]))
        ) {
            return false;
        }

        const aggregates = positions.filter((i) => predicate(argTypes[i]));

        if (requireAggregate && !aggregates.length) {
            return false;
        }

        let joined = argTypes[aggregates[0] ?? positions[0]];

        for (const i of positions.slice(1)) {
            joined = joined && joinTypes(joined, argTypes[i]);
        }

        if (joined === null || joined === undefined) {
            return false;
        }

        if (!allowPromotion && !positions.every((i) => argTypes[i] === joined)) {
            return false;
        }

        return positions.every((i) => promoteTo(i, joined));
    };

    if (
        !unifyGroup(
            patterns.flatMap((pattern, i) => (pattern === "same" ? [i] : [])),
            () => true,
            false
        )
    ) {
        return null;
    }

    for (const [pattern, predicate] of Object.entries(aggregatePatterns)) {
        if (
            !unifyGroup(
                patterns.flatMap((p, i) => (p === pattern ? [i] : [])),
                predicate,
                true
            )
        ) {
            return null;
        }
    }

    for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];

        if (pattern === "same" || isAggregatePattern(pattern)) {
            unifyPositions.push(i);
            continue;
        }

        if (!promoteTo(i, pattern)) {
            return null;
        }
    }

    const unified = unifyPositions.length
        ? unifyPositions.reduce((a, i) => joinTypes(a, promoted[i]), promoted[unifyPositions[0]])
        : promoted[0];

    return {
        promoted,
        promotes: promoted.map((type, i) => (type === argTypes[i] ? null : type)),
        unified,
        distance,
    };
}

/* a matcher case: the matcher sees the raw argument types and answers
{ returns, promotes?, fields? } or null. without promotion the match
counts only when it asks for none. */

function matchMatcher(case_, argTypes, allowPromotion) {
    const result = case_.match(argTypes);

    if (result === null) {
        return null;
    }

    const promoted = argTypes.map((type, i) => result.promotes?.[i] ?? type);

    if (!allowPromotion && promoted.some((type, i) => type !== argTypes[i])) {
        return null;
    }

    let distance = 0;

    for (let i = 0; i < argTypes.length; i++) {
        if (promoted[i] !== argTypes[i]) {
            if (!promotable(argTypes[i], promoted[i])) {
                return null;
            }

            distance += promotionDistance(argTypes[i], promoted[i]);
        }
    }

    return {
        promoted,
        promotes: promoted.map((type, i) => (type === argTypes[i] ? null : type)),
        unified: promoted[0],
        distance,
        matchResult: result,
    };
}

function matchCase(case_, argTypes, allowPromotion) {
    if (case_.match) {
        return matchMatcher(case_, argTypes, allowPromotion);
    }

    const patterns = case_.variadic
        ? argTypes.map(() => case_.arguments)
        : case_.arguments;

    if (!case_.variadic && patterns.length !== argTypes.length) {
        return null;
    }

    if (case_.variadic && argTypes.length === 0) {
        return null;
    }

    return matchPatterns(patterns, argTypes, allowPromotion);
}

/* templates merge per-target: a case's wgsl template overrides while
its math template inherits, and an explicitly undefined target
suppresses (a case that must render as a plain call). */

function mergeTemplate(base, extra) {
    if (!extra) {
        return base;
    }

    const merged = { ...base };

    for (const target of Object.keys(extra)) {
        merged[target] = extra[target];
    }

    return merged;
}

/* the case's result type: a type, "arguments" (the unified argument
type), a function of the promoted argument types, or a matcher's
answer. an explicit case that says nothing defaults to "arguments"
(the variadic canonical forms). */

function resolveReturns(case_, matched) {
    const returns = matched.matchResult?.returns ?? case_.returns;

    if (returns === undefined || returns === "arguments") {
        return matched.unified;
    }

    return typeof returns === "function" ? returns(matched.promoted) : returns;
}

function buildResolution(definition, case_, matched) {
    const {
        arguments: _arguments,
        returns: _returns,
        evaluate: _evaluate,
        template: _template,
        match: _match,
        variadic: _variadic,
        ...caseFields
    } = case_;

    const fields = matched.matchResult?.fields;

    const resolved = {
        ...definition,
        ...caseFields,
        ...fields,
        returns: resolveReturns(case_, matched),
        evaluate: fields?.evaluate ?? case_.evaluate ?? definition.evaluate,
    };

    resolved.template = mergeTemplate(definition.template, case_.template);

    if (fields?.template) {
        resolved.template = mergeTemplate(resolved.template, fields.template);
    }

    return { definition: resolved, promotes: matched.promotes, distance: matched.distance };
}

/* the two passes over the case list: exact matches in declaration
order, then the least-promotion match (ties keep declaration order). */

function tryCases(definition, argTypes) {
    const cases = casesOf(definition);

    for (const case_ of cases) {
        const matched = matchCase(case_, argTypes, false);

        if (matched) {
            return buildResolution(definition, case_, matched);
        }
    }

    let best;

    for (const case_ of cases) {
        const matched = matchCase(case_, argTypes, true);

        if (matched && (!best || matched.distance < best.distance)) {
            best = { case_, matched, distance: matched.distance };
        }
    }

    return best ? buildResolution(definition, best.case_, best.matched) : null;
}

/* the pointwise fallback: no case matched, but a vector is among the
arguments. the cases resolve against the entry types (scalars as
themselves), the result must be scalar, and the operation lifts over
the vectors' entries: every argument promotes to the vector of its
(promoted) entry type — vectors widen entrywise, scalars splat — and
the lifted evaluate maps the entry case's over the entries. */

function resolvePointwise(definition, argTypes) {
    if (!argTypes.some(isVector)) {
        return null;
    }

    const vectors = argTypes.filter(isVector);

    if (!vectors.every((type) => type.size === vectors[0].size)) {
        return null;
    }

    const size = vectors[0].size;
    const entryTypes = argTypes.map((type) => (isVector(type) ? type.entry : type));
    const entry = tryCases(definition, entryTypes);

    if (!entry) {
        return null;
    }

    const entryReturns = entry.definition.returns;

    if (isTensor(entryReturns)) {
        return null;
    }

    const promotes = argTypes.map((type, i) => {
        const target = vectorType(size, entry.promotes[i] ?? entryTypes[i]);

        return type === target ? null : target;
    });

    const entryEvaluate = entry.definition.evaluate;

    const resolved = {
        ...entry.definition,
        returns: vectorType(size, entryReturns),
        evaluate: (...args) =>
            args[0].map((_, i) => entryEvaluate(...args.map((argument) => argument[i]))),
    };

    /* a definition's `pointwise` field overrides the lifted case
    (and/or's & | templates on bool vectors) */

    if (definition.pointwise) {
        const { template, ...overrides } = definition.pointwise;

        Object.assign(resolved, overrides);
        resolved.template = mergeTemplate(resolved.template, template);
    }

    return { definition: resolved, promotes };
}

export function resolveCase(definition, argTypes, index) {
    const resolution =
        tryCases(definition, argTypes) ?? resolvePointwise(definition, argTypes);

    if (!resolution) {
        throw new Error(
            `'${definition.name}' cannot be applied to ` +
                `(${argTypes.map((type) => type.name).join(", ")})` +
                (index === undefined ? "" : ` at index ${index}`)
        );
    }

    return resolution;
}

/* the typed call constructor: resolve the argument types against the
definition, promote the arguments the case needs promoted (literals
re-lift in place; anything else wraps in a convert node), and build
the call with the resolved definition stamped on its callee. */

export function typedCallNode(definition, args, index, length = 0) {
    const resolution = resolveCase(definition, args.map(typeOf), index);
    const converted = args.map((argument, i) =>
        resolution.promotes[i] ? promoteNode(argument, resolution.promotes[i]) : argument
    );

    return callNode(resolution.definition, converted, index, length);
}

/* value-level application, for the rewrite passes' constant folds:
resolve against the values' types, lift through the promotions, and
evaluate. */

export function valueApply(definition, ...values) {
    const resolution = resolveCase(definition, values.map(typeOfValue));
    const lifted = values.map((value, i) =>
        resolution.promotes[i] ? resolution.promotes[i].lift(value) : value
    );

    return resolution.definition.evaluate(...lifted);
}
