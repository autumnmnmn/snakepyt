/* fill

resolves a syntax tree into a semantic tree against the caller's
constants, variables, and functions — and decides the type of every
leaf. this is where types enter: a semantic tree always has its leaf
types decided, and derives the types of its compound expressions from
them (types/).

- constants are { name, value, kind?, type? }. a declared type reads
  the value with its own rules (complexType accepts a [re, im] pair);
  without one, the value's shape decides — booleans are bool, Complex
  instances complex, arrays tensors, and plain numbers are read by the
  default type.
- variables are names or { name, type }. a { name, type } variable is
  typed as declared; a bare name is provisional, exactly like an
  implicit variable (below) — the list declares existence (and shadows
  function names), not a type.
- functions defaults to the standard vocabulary; operators always
  resolve against the definitions.
- defaultType (default floatType) types literals, plain-number
  constants, and variables that don't declare one.

an identifier that is neither constant, variable, nor function is an
implicit variable. a provisional variable's type is decided by its use
sites: where every case of the callee pins its position to a boolean
(and/or/not's operands, a cases block's conditions), the variable is
boolean —
a 0/1 u32 by the shaders' $bool uniform convention — and the default
type anywhere else. a variable wanted both ways is an error, as is
applying a function to types no case of it accepts.

the with operator (`subtree { name := expr; ... }`, see
syntax/ast.js) attaches a subtree — a local, an earlier definition, or
the expression on its left — with some of its variables replaced. the
replacement expressions fill in the current environment (the literal
among them reads in the type the replaced variable has in the
subtree), and the subtree re-fills with the replacements as a splice:
a name→tree substitution applied where the subtree's own variables
resolve, reaching through its locals (a local is inlining, so a
replacement reaches its free variables too). the one exception to
"substitute, then re-fill": a replacement naming the variable a diff
differentiates by belongs to the DERIVATIVE — substituting it into f
before differentiating would differentiate a constant — so the diff
executes without it and the binding applies to the result
(executeDiff below). a definition referencing
ITSELF under construction cannot re-fill — that is recursion — so the
reference defers to an instance node: an opaque atom holding the
definition's closure and the replacements. instances do not traverse
in the rewrite passes (they would not terminate) and do not render or
differentiate; unroll.js expands the ones an `assume` statement has
cleared once their watched variables actualize. a definition's
references to EARLIER definitions fill their trees (shared, like a
local's).

a `:=` body may be a block at every level (a definition's, a
local's, a replacement's — syntax/ast.js); the nested blocks'
declarations and locals scope over their bodies (fillBlock below).

every error names the source index of the node that caused it. */

import {
    boolType,
    casesOf,
    complexType,
    ducksType,
    duckType,
    floatType,
    inferConstant,
    joinTypes,
    promoteNode,
    resolveTypeName,
    typeOf,
    typedCallNode,
} from "../types/index.js";
import { Complex } from "../../complex.js";
import {
    definitions,
    divideDispatch,
    multiplyDispatch,
    standardFunctions,
} from "../operations/index.js";
import { differentiate } from "../autodiff.js";
import { Expression } from "./expression.js";
import { functionNode } from "./nodes.js";
import { childrenOf, collectVariables, substituteVariable } from "./trees.js";
import { symbolForOperator } from "../syntax/tokenize.js";
import { locateError, showLocation } from "../syntax/locate.js";

export function fill(tree, source, constants, variables, functions, defaultType = floatType, locals, context) {
    try {
        return fillRoot(tree, source, constants, variables, functions, defaultType, locals, context);
    } catch (error) {
        throw locateError(error, source);
    }
}

function fillRoot(tree, source, constants, variables, functions, defaultType = floatType, locals, context) {
    functions ??= standardFunctions;

    const constantsByName = new Map(
        constants.map((constant) => [constant.name, constant])
    );

    /* the fill-time context: scope is the definitions in view (earlier
    ones and self), self the definition under construction (for the
    recursive instances), selfType its instances' provisional result
    type, splice the active with-replacements (name → tree), memo
    the per-splice re-fill cache (splice → resource → tree), so one
    fill's repeated references under one splice share one re-fill, and
    duckGroups / defaultDuck the definition's own duck declarations
    (`duck x y;` groups, `default duck;`). */

    context ??= {};
    context.memo ??= new Map();

    const splice = context.splice;

    /* the context for a nested fill under a given splice (the with
    re-fills and executeDiff's wrt-stripped one) */
    const splicedContext = (next) => ({
        scope: context.scope,
        self: context.self,
        selfType: context.selfType,
        splice: next,
        memo: context.memo,
        duckGroups: context.duckGroups,
        defaultDuck: context.defaultDuck,
    });

    // name → declared type, or null for a provisional variable
    const declaredVariables = new Map();

    /* the duck-typed names (the binding rule applies: a replacement
    imposes nothing), and the unified groups (the members must take
    one type). groups arrive through the context (the definition's
    own `duck x y;` declarations); the js api declares ducks
    individually. */
    const duckNames = new Set();
    const duckGroupOf = new Map();

    for (const group of context.duckGroups ?? []) {
        for (const name of group) {
            duckGroupOf.set(name, group);
        }
    }

    for (const variable of variables) {
        if (typeof variable === "string") {
            declaredVariables.set(variable, null);
        } else {
            // a duck-declared variable is provisional: its type is
            // decided by its use sites, and bindings impose nothing
            const duck =
                variable.type === duckType || variable.type === ducksType;

            if (duck) {
                duckNames.add(variable.name);
            }

            declaredVariables.set(
                variable.name,
                duck ? null : (variable.type ?? null)
            );
        }
    }

    /* the duck binding rule for one name: declared ducks, and every
    undeclared variable of a `default duck;` block. */

    const isDuck = (name) =>
        duckNames.has(name) ||
        (context.defaultDuck === true && !declaredVariables.has(name));

    /* a unified group's bound type under the active splice: the
    members' bindings must agree, and the agreed type decides every
    member, bound or not. */

    const duckBound = new Map();

    if (splice) {
        for (const group of context.duckGroups ?? []) {
            const bound = group.filter((name) => splice.has(name));

            if (bound.length === 0) {
                continue;
            }

            const types = new Map(
                bound.map((name) => [name, typeOf(splice.get(name))])
            );
            const [firstName, firstType] = types.entries().next().value;

            for (const [name, type] of types) {
                if (type !== firstType) {
                    throw new Error(
                        `The unified duck variables '${group.join("', '")}' ` +
                            `must be bound to the same type, but '${firstName}' ` +
                            `is bound to a ${firstType.name} and '${name}' to ` +
                            `a ${type.name} at index ${splice.get(name).index}`
                    );
                }
            }

            for (const name of group) {
                duckBound.set(name, firstType);
            }
        }
    }

    for (const [name, type] of duckBound) {
        declaredVariables.set(name, type);
    }

    const functionsByName = new Map(
        functions.map((definition) => [definition.name, definition])
    );

    /* the type inference for implicit variables: first use decides,
    later conflicting uses error. the members of a unified duck
    group share one inference cell — what one is used as, all are. */
    const inferred = new Map();
    const occurrences = new Map();

    const provisionalKey = (name) => duckGroupOf.get(name) ?? name;

    function describe(type) {
        return type === boolType ? "a boolean" : "a number";
    }

    function constrain(node, type) {
        const key = provisionalKey(node.name);
        const seen = inferred.get(key);

        if (seen) {
            if (seen.type !== type) {
                const [first, second] =
                    seen.type === boolType
                        ? [seen, { type, index: node.index }]
                        : [{ type, index: node.index }, seen];

                throw new Error(
                    `Variable '${node.name}' is used as ${describe(first.type)} ` +
                        `${showLocation(source, first.index)}\n` +
                        `and as ${describe(second.type)} ` +
                        showLocation(source, second.index)
                );
            }

            return;
        }

        inferred.set(key, { type, index: node.index });

        for (const occurrence of occurrences.get(key) ?? []) {
            occurrence.valueType = type;
        }
    }

    function sourceText(node) {
        return source.slice(node.index, node.index + node.length);
    }

    /* re-fill a local's or definition's body under the active splice,
    cached per (splice, resource) so repeated references share. */

    function memoized(key, compute) {
        let byKey = context.memo.get(splice);

        if (!byKey) {
            byKey = new Map();
            context.memo.set(splice, byKey);
        }

        if (!byKey.has(key)) {
            byKey.set(key, compute());
        }

        return byKey.get(key);
    }

    function resolveIdentifier(node) {
        const name = sourceText(node);

        // a local definition (fillProgram's blocks) is the most local
        // binding: the filled subtree, shared at every use — no
        // semantic difference from inlining it. under an active splice
        // the local re-fills with it: a replacement reaches the free
        // variables of everything the body references, exactly as if
        // the local were inlined.
        const local = locals?.get(name);

        if (local !== undefined) {
            if (splice) {
                return memoized(local, () =>
                    fillLocal(
                        local.definition,
                        source,
                        constants,
                        variables,
                        functions,
                        defaultType,
                        local.locals,
                        context
                    )
                );
            }

            return local.tree;
        }

        // the with-splice: the replaced variables of the subtree under
        // construction resolve to their replacements
        if (splice?.has(name)) {
            return splice.get(name);
        }

        const constant = constantsByName.get(name);
        if (constant) {
            let type, value;

            try {
                if (constant.type) {
                    type = constant.type;
                    value = type.constant(constant.value, name);
                } else {
                    ({ type, value } = inferConstant(constant.value, name, defaultType));
                }
            } catch (error) {
                throw new Error(`${error.message} at index ${node.index}`);
            }

            return new Expression({
                type: "number",
                index: node.index,
                length: node.length,
                value,
                valueType: type,
                ...(constant.kind === "named" ? { name } : {}),
            });
        }

        if (!declaredVariables.has(name)) {
            // a definition in scope: earlier ones share their filled
            // tree (re-filled under an active splice); the one under
            // construction defers to a recursive instance
            const definition = context.scope?.get(name);

            if (definition !== undefined) {
                if (definition === context.self) {
                    return makeInstance(definition, [], node.index, node.length);
                }

                if (splice) {
                    return memoized(definition, () =>
                        fillClosureTree(definition, splice, context.memo)
                    );
                }

                return fillClosureTree(definition);
            }

            const functionDefinition = functionsByName.get(name);
            if (functionDefinition) {
                return functionNode(functionDefinition, node.index, node.length);
            }
        }

        const variable = new Expression({
            type: "variable",
            index: node.index,
            length: node.length,
            name,
        });

        const declared = declaredVariables.get(name);

        if (declared) {
            variable.valueType = declared;
        } else {
            // a provisional variable: constrained by a use site, then
            // stamped; earlier occurrences of the same name (or duck
            // group) may already know it
            const key = provisionalKey(name);
            const seen = inferred.get(key);

            if (seen) {
                variable.valueType = seen.type;
            }

            if (!occurrences.has(key)) {
                occurrences.set(key, []);
            }

            occurrences.get(key).push(variable);
        }

        return variable;
    }

    function resolveOperator(node) {
        const definition = definitions[node.type];

        if (!definition) {
            throw new SyntaxError(
                `Operator '${symbolForOperator(node.type)}' is not defined at index ${node.index}`
            );
        }

        return definition;
    }

    /* whether every case of the definition pins argument i to a
    boolean — the constraint an implicit variable gets in that
    position. */

    function slotIsAlwaysBool(definition, i) {
        return casesOf(definition).every((case_) => {
            if (case_.match) {
                return false;
            }

            if (case_.variadic) {
                return case_.arguments === boolType;
            }

            return case_.arguments[i] === boolType;
        });
    }

    /* `*` and `/` are not one operation each but a family sharing a
    spelling — the products (products.js). which one a spelling means
    is decided by the operand types, once provisional variables are
    constrained. */

    function fillCall(definition, args, index, length, dispatch) {
        // constrain provisional variable operands before resolution:
        // boolean where the callee demands one (enforced at every use,
        // so a variable already decided numeric conflicts here), the
        // default type at a first use anywhere else
        for (const [i, arg] of args.entries()) {
            if (
                arg.type !== "variable" ||
                !occurrences.has(provisionalKey(arg.name))
            ) {
                continue;
            }

            if (slotIsAlwaysBool(definition, i)) {
                constrain(arg, boolType);
                arg.valueType = boolType;
            } else {
                constrain(arg, defaultType);
                arg.valueType ??= defaultType;
            }
        }

        if (dispatch) {
            definition = dispatch(args[0], args[1]);
        }

        return typedCallNode(definition, args, index, length);
    }

    /* the types the subtree's own variables carry in it, for typing
    the replacement literals: the declared types where declared, the
    fill-decided types read off the base tree otherwise. */

    function subtreeVariableTypes(baseTree) {
        const types = new Map();

        (function walk(node) {
            if (node.type === "variable") {
                if (!types.has(node.name)) {
                    types.set(node.name, node.valueType);
                }

                return;
            }

            for (const child of childrenOf(node)) {
                walk(child);
            }
        })(baseTree);

        return types;
    }

    /* a recursive reference: the definition under construction, with
    replacements. the instance is an opaque atom to the passes; its
    result type is provisional (context.selfType, the fixed-point
    guess of fillClosureTree). it remembers the splice it was created
    under (its ambient): expansion re-fills the definition with
    ambient and replacements together, so bindings from enclosing
    withs reach every level of the recursion. the watched set is the
    assumption machinery's: the condition variables of the
    definition's "unrollable when ... is actualized" assumptions,
    minus the ones this reference replaces, plus the free variables
    of whatever replaces them — a replacement removing a watched
    variable hands the watch to the replacement's own unbound
    variables. no watched variables left: the instance is actualized,
    and unroll may expand it. without an assumption the instance
    stays opaque forever. */

    function makeInstance(closure, replacements, index, length) {
        const filled = fillReplacements(replacements, closure.declaredTypes);

        let watched;

        if (closure.unrollable) {
            const remaining = new Set(
                closure.watchedVariables.filter(
                    (name) => !filled.some((replacement) => replacement.name === name)
                )
            );

            for (const replacement of filled) {
                if (closure.watchedVariables.includes(replacement.name)) {
                    for (const name of collectVariables(replacement.tree)) {
                        remaining.add(name);
                    }
                }
            }

            watched = [...remaining];
        }

        const instance = new Expression({
            type: "instance",
            index,
            length,
            of: closure,
            replacements: filled,
            ambient: splice,
            watched,
            valueType: context.selfType ?? defaultType,
        });

        closure.instances.push(instance);

        return instance;
    }

    /* fill a with block's replacements in the current environment.
    variableTypes gives the type a replacement's literals read as (the
    replaced variable's own type in the subtree); unknown variables
    (only possible for the recursive instances, validated after the
    body fills) fall back to the current default. */

    function fillReplacements(replacements, variableTypes) {
        return replacements.map((replacement) => {
            /* the type a replacement's literals read as: the replaced
            variable's own type in the subtree — except a duck, which
            imposes nothing: its replacement's literals read by the
            ambient default. (the with paths filter ducks out of
            variableTypes; makeInstance passes the definition's
            declared types directly, ducks included — hence the
            marker check here.) */
            const type = variableTypes.get(replacement.name);
            const imposes =
                type === duckType || type === ducksType ? undefined : type;

            return {
                name: replacement.name,
                nameIndex: replacement.nameIndex,
                tree: hasOwnBlock(replacement)
                    ? fillBlock(
                          replacement,
                          source,
                          constants,
                          variables,
                          functions,
                          imposes ?? defaultType,
                          locals,
                          context,
                          `the replacement '${replacement.name}'`
                      )
                    : fill(
                          replacement.body,
                          source,
                          constants,
                          variables,
                          functions,
                          imposes ?? defaultType,
                          locals,
                          context
                      ),
            };
        });
    }

    function fillWith(node) {
        const { left, replacements } = node;

        /* the target: a local, an earlier definition, the definition
        under construction (a recursive instance), or the expression
        on the left as a subtree of the current environment. */

        let closure;

        if (left.type === "identifier") {
            const name = sourceText(left);
            const local = locals?.get(name);

            const notSubtree = (what) => {
                throw new Error(
                    `with applies to a subtree — a local or a definition — ` +
                        `not the ${what} '${name}' at index ${left.index}`
                );
            };

            if (local !== undefined) {
                closure = {
                    local: local.definition,
                    locals: local.locals,
                    baseTree: local.tree,
                    defaultType,
                };
            } else if (constantsByName.has(name)) {
                notSubtree("constant");
            } else if (declaredVariables.has(name)) {
                notSubtree("variable");
            } else {
                const definition = context.scope?.get(name);

                if (definition !== undefined) {
                    if (definition === context.self) {
                        // recursion: defer to an instance, its
                        // replacement names validated once the body
                        // has filled (fillProgram)
                        return makeInstance(definition, replacements, node.index, node.length);
                    }

                    closure = { definition };
                } else if (functionsByName.has(name)) {
                    notSubtree("function");
                } else {
                    throw new Error(
                        `with applies to a subtree — a local or a definition — ` +
                            `but '${name}' is neither at index ${left.index}`
                    );
                }
            }
        } else {
            closure = {
                body: left,
                locals,
                baseTree: null, // filled below, alongside the splice
                defaultType,
            };
        }

        /* the subtree's variables, for validating the replacement
        names and typing their literals. a definition answers from its
        settled tree; an expression on the left fills here (in the
        current environment, current splice included) — its remaining
        free variables are the replaceable ones. */

        const baseTree = closure.definition
            ? fillClosureTree(closure.definition)
            : closure.baseTree ??
              fill(left, source, constants, variables, functions, defaultType, locals, context);

        /* a with on a deferred diff: replacements naming the diff's
        slots (wrt, f) bind them — binding the last one executes the
        differentiation — and any others splice into the diff's f, the
        way they would into any subtree (the generic path re-fills the
        target's body, and the diff re-fills under the splice). a
        slot name always names the slot, even if f has a variable by
        that name. the one ordering exception: a replacement naming
        the variable the diff will differentiate by belongs to the
        DERIVATIVE, not to f — it is held back and bound after the
        diff executes (executeDiff does the same for a splice it
        finds itself under). */
        if (
            baseTree.type === "diff" &&
            replacements.some(
                (replacement) => replacement.name === "wrt" || replacement.name === "f"
            )
        ) {
            const slots = replacements.filter(
                (replacement) => replacement.name === "wrt" || replacement.name === "f"
            );
            const spliced = replacements.filter(
                (replacement) => replacement.name !== "wrt" && replacement.name !== "f"
            );

            const wrtSlot = slots.find((replacement) => replacement.name === "wrt");
            const eventualWrt = baseTree.wrt ?? (wrtSlot ? diffSlot(wrtSlot) : null);

            const deferred = spliced.filter(
                (replacement) => replacement.name === eventualWrt
            );
            const immediate = spliced.filter(
                (replacement) => replacement.name !== eventualWrt
            );

            const current = immediate.length
                ? spliceSubtree(closure, baseTree, immediate)
                : baseTree;

            const result = completeDiff(current, slots, node);

            if (deferred.length === 0) {
                return result;
            }

            /* the diff did not execute (a slot is still missing):
            there is no derivative to bind the name in — and it names
            no variable of a bare wrt-or-f-less diff's subtree */
            if (result.type === "diff") {
                throw new Error(
                    `'${deferred[0].name}' is not a variable of the subtree ` +
                        `at index ${deferred[0].nameIndex}`
                );
            }

            const variableNames = new Set(collectVariables(baseTree));
            const variableTypes = subtreeVariableTypes(baseTree);

            for (const replacement of deferred) {
                if (!variableNames.has(replacement.name)) {
                    throw new Error(
                        `'${replacement.name}' is not a variable of the subtree ` +
                            `at index ${replacement.nameIndex}`
                    );
                }
            }

            return fillReplacements(deferred, variableTypes).reduce(
                (tree, replacement) =>
                    substituteVariable(tree, replacement.name, replacement.tree),
                result
            );
        }

        return spliceSubtree(closure, baseTree, replacements);
    }

    /* the generic with path: validate the replacement names against
    the subtree's variables, fill the replacements, and re-fill the
    subtree with them spliced in. */

    function spliceSubtree(closure, baseTree, replacements) {
        /* a block-bodied local's own declarations: they govern its
        variables' types and the duck binding rule, the way a
        definition's do */
        const localBlock =
            closure.local && hasOwnBlock(closure.local)
                ? resolveDeclarations(
                      closure.local.declarations,
                      source,
                      closure.defaultType
                  )
                : null;

        const variableNames = new Set(collectVariables(baseTree));
        const variableTypes = closure.definition
            ? new Map([...closure.definition.declaredTypes, ...subtreeVariableTypes(baseTree)])
            : localBlock
              ? new Map([...localBlock.declaredTypes, ...subtreeVariableTypes(baseTree)])
              : subtreeVariableTypes(baseTree);

        /* a duck's replacement reads its literals by the ambient
        default, whatever type the duck took in the subtree — so a
        duck name carries no type into fillReplacements. which names
        are ducks is the target's business: a definition's declared
        ducks, and every undeclared variable of a `default duck;`
        definition or block local; for an expression on the left, the
        current environment's ducks. */
        const declared = closure.definition?.declaredTypes ?? localBlock?.declaredTypes;
        const defaultDuckTarget = closure.definition
            ? closure.definition.localDefaultDuck
            : (localBlock?.localDefaultDuck ?? false);

        for (const name of [...variableTypes.keys()]) {
            const duck = declared
                ? declared.get(name) === duckType ||
                  declared.get(name) === ducksType ||
                  (declared.get(name) === undefined && defaultDuckTarget)
                : isDuck(name);

            if (duck) {
                variableTypes.delete(name);
            }
        }

        for (const replacement of replacements) {
            if (!variableNames.has(replacement.name)) {
                throw new Error(
                    `'${replacement.name}' is not a variable of the subtree at index ${replacement.nameIndex}`
                );
            }
        }

        const filled = fillReplacements(replacements, variableTypes);

        /* re-fill the subtree with the replacements spliced in (inner
        replacements win over an enclosing splice), and the target's
        own declarations governing its internals. */

        if (filled.length === 0 && !splice) {
            return baseTree;
        }

        const merged = new Map([...(splice ?? []), ...filled.map((r) => [r.name, r.tree])]);

        if (closure.definition) {
            return fillClosureTree(closure.definition, merged, context.memo, typeOf(baseTree));
        }

        if (closure.local) {
            return fillLocal(
                closure.local,
                source,
                constants,
                variables,
                functions,
                closure.defaultType,
                closure.locals,
                splicedContext(merged)
            );
        }

        return fill(
            closure.body,
            source,
            constants,
            variables,
            functions,
            closure.defaultType,
            closure.locals,
            splicedContext(merged)
        );
    }

    /* a condition position: a bare provisional variable is boolean,
    like any condition position; anything must be boolean without
    coercion. */

    function checkCondition(condition) {
        if (
            condition.type === "variable" &&
            occurrences.has(provisionalKey(condition.name))
        ) {
            constrain(condition, boolType);
            condition.valueType = boolType;
        }

        if (typeOf(condition) !== boolType) {
            throw new Error(
                `A condition must be a boolean without coercion, ` +
                    `but this one is a ${typeOf(condition).name} ` +
                    `at index ${condition.index}`
            );
        }

        return condition;
    }

    /* a cases block: exactly one case must hold when the expression
    is evaluated — no static exhaustiveness or overlap checking, and
    the order of cases carries no meaning (these are semantic
    expression trees, not sequential programs). the conditions must be
    boolean without coercion; the bodies unify to one type (promotions
    inserted where they need them), which the node is stamped with.
    simplify folds the block once every condition is literal —
    resolving the recursion's base case is its whole reason for being —
    and throws when no case or several hold. the cases arrive filled;
    the ternary builds its two cases directly (see fillNode). */

    function makeCases(index, length, filled) {
        for (const { condition } of filled) {
            checkCondition(condition);
        }

        let result = typeOf(filled[0].body);

        for (const { body } of filled.slice(1)) {
            const joined = joinTypes(result, typeOf(body));

            if (joined === null) {
                throw new Error(
                    `The cases' bodies must unify to one type, but a ` +
                        `${typeOf(body).name} body does not join the ` +
                        `${result.name} of the ones before it at index ${body.index}`
                );
            }

            result = joined;
        }

        return new Expression({
            type: "cases",
            index,
            length,
            cases: filled.map(({ condition, body }) => ({
                condition,
                body:
                    typeOf(body) === result ? body : promoteNode(body, result),
            })),
            valueType: result,
        });
    }

    function fillCases(node) {
        return makeCases(
            node.index,
            node.length,
            node.cases.map(({ condition, body }) => ({
                condition: fillNode(condition),
                body: fillNode(body),
            }))
        );
    }

    /* a diff binding's f, filled: a block body as a nested block, a
    bare expression directly. fillFUnder fills under a given context —
    the wrt-stripped splice of executeDiff. */

    const fillF = (binding) =>
        hasOwnBlock(binding)
            ? fillBlock(
                  binding,
                  source,
                  constants,
                  variables,
                  functions,
                  defaultType,
                  locals,
                  context,
                  "the diff's f"
              )
            : fillNode(binding.body);

    const fillFUnder = (binding, childContext) =>
        hasOwnBlock(binding)
            ? fillBlock(
                  binding,
                  source,
                  constants,
                  variables,
                  functions,
                  defaultType,
                  locals,
                  childContext,
                  "the diff's f"
              )
            : fill(
                  binding.body,
                  source,
                  constants,
                  variables,
                  functions,
                  defaultType,
                  locals,
                  childContext
              );

    /* diff { wrt := x; f := expression } — differentiation in the
    language, behaving as if it were a fully in-language recursive
    definition over f's structure (it is the differentiate pass,
    reached from inside). wrt is a compile-time NAME — its body must
    be a bare identifier, read as written, never filled; f fills in
    the current environment. with both slots given the diff executes
    here and the result IS the derivative's tree — no diff node
    survives. with one, the node defers: an opaque atom to the other
    passes (they refuse it, the way they refuse an unactualized
    instance), actualized by a with block binding the missing slot —
    fillWith handles that.

    the one ordering rule: a splice binding the wrt variable itself
    belongs to the DERIVATIVE, never to f — differentiating with it
    substituted into f would differentiate a constant (`diff
    { wrt := x; f := x^2 } { x := 2 }` is 4, never d/dx 4 = 0). f
    fills with that binding stripped and the binding applies to the
    derivative (substituteVariable); every other binding commutes
    with differentiation and may reach f. fBinding is f's syntax (a
    with's slot body — re-filled stripped); fTree is an already
    filled f (a deferred diff's own, which the current splice has
    never touched) and differentiates as-is. */

    function executeDiff(node, wrt, fBinding, fTree) {
        if (wrt === null || (fBinding === null && fTree === null)) {
            const f = fTree ?? (fBinding ? fillF(fBinding) : null);

            return new Expression({
                type: "diff",
                index: node.index,
                length: node.length,
                wrt,
                f,
                ...(f ? { valueType: typeOf(f) } : {}),
            });
        }

        const wrtReplacement = splice?.get(wrt) ?? null;

        let f = fTree;

        if (fBinding) {
            if (wrtReplacement) {
                const stripped = new Map(splice);
                stripped.delete(wrt);

                f = fillFUnder(
                    fBinding,
                    splicedContext(stripped.size ? stripped : undefined)
                );
            } else {
                f = fillF(fBinding);
            }
        }

        const derivative = differentiate(f, wrt);

        return wrtReplacement
            ? substituteVariable(derivative, wrt, wrtReplacement)
            : derivative;
    }

    function diffSlot(binding) {
        if (binding.name !== "wrt" && binding.name !== "f") {
            throw new Error(
                `diff takes wrt and f, not '${binding.name}', ` +
                    `at index ${binding.nameIndex}`
            );
        }

        if (
            binding.name === "wrt" &&
            (hasOwnBlock(binding) || binding.body.type !== "identifier")
        ) {
            throw new Error(
                `diff's wrt must be a variable name, not an expression ` +
                    `at index ${binding.nameIndex}`
            );
        }

        return binding.name === "wrt" ? sourceText(binding.body) : null;
    }

    function fillDiff(node) {
        let wrt = null;
        let fBinding = null;

        for (const binding of node.bindings) {
            const name = diffSlot(binding);

            if (name !== null) {
                wrt = name;
            } else {
                fBinding = binding;
            }
        }

        return executeDiff(node, wrt, fBinding, null);
    }

    /* a with block on a deferred diff — `diff { f := foo } { wrt := x }`
    — actualizes the missing slot (and only that: both slots bound is
    execution, which already happened). */

    function completeDiff(diffNode, replacements, withNode) {
        let wrt = diffNode.wrt;
        let fTree = diffNode.f;
        let fBinding = null;

        for (const replacement of replacements) {
            const name = diffSlot(replacement);

            if (name !== null) {
                if (wrt !== null) {
                    throw new Error(
                        `The diff's wrt is already '${wrt}' ` +
                            `at index ${replacement.nameIndex}`
                    );
                }

                wrt = name;
            } else {
                if (fTree !== null || fBinding !== null) {
                    throw new Error(
                        `The diff's f is already given ` +
                            `at index ${replacement.nameIndex}`
                    );
                }

                fBinding = replacement;
            }
        }

        return executeDiff(withNode, wrt, fBinding, fTree);
    }

    function fillNode(node) {
        switch (node.type) {
            case "number": {
                const text = sourceText(node);
                const value = Number(node.imaginary ? text.slice(0, -1) : text);

                if (Number.isNaN(value)) {
                    throw new SyntaxError(
                        `Invalid number literal '${text}' at index ${node.index}`
                    );
                }

                /* an imaginary literal (2i) is a complex number — the
                one type that holds it, whatever the default type */
                if (node.imaginary) {
                    return new Expression({
                        type: "number",
                        index: node.index,
                        length: node.length,
                        value: Complex.cart(0, value),
                        valueType: complexType,
                    });
                }

                let lifted, narrowed;

                try {
                    lifted = defaultType.lift(value);

                    /* the default type may read a literal narrower than
                    itself: an integer-valued rational literal is an
                    integer (an integer-valued float is just a float —
                    floats are the fallible types, read as written) */
                    narrowed = defaultType.narrowLiteral?.(lifted);
                } catch (error) {
                    throw new Error(`${error.message} at index ${node.index}`);
                }

                return new Expression({
                    type: "number",
                    index: node.index,
                    length: node.length,
                    value: narrowed?.value ?? lifted,
                    valueType: narrowed?.type ?? defaultType,
                });
            }

            case "identifier":
                return resolveIdentifier(node);

            case "with":
                return fillWith(node);

            case "cases":
                return fillCases(node);

            case "diff":
                return fillDiff(node);

            case "negate":
            case "positive":
            case "not":
                return fillCall(
                    resolveOperator(node),
                    [fillNode(node.operand)],
                    node.index,
                    node.length
                );

            /* the ternary is syntactic shorthand for the two-case
            block: `c ? a : b` is `cases { c ? a; !c ? b }`. the
            filled condition subtree is shared between the two
            cases. */
            case "ternary": {
                const condition = checkCondition(fillNode(node.condition));

                return makeCases(node.index, node.length, [
                    { condition, body: fillNode(node.then) },
                    {
                        condition: typedCallNode(
                            definitions.not,
                            [condition],
                            condition.index,
                            condition.length
                        ),
                        body: fillNode(node.else),
                    },
                ]);
            }

            case "absolute": {
                const abs = functionsByName.get("abs") ?? definitions.abs;

                if (!abs) {
                    throw new SyntaxError(
                        `|...| requires 'abs', which is not defined at index ${node.index}`
                    );
                }

                return fillCall(
                    abs,
                    [fillNode(node.operand)],
                    node.index,
                    node.length
                );
            }

            case "call": {
                const callee = fillNode(node.callee);

                if (callee.type !== "function") {
                    throw new SyntaxError(
                        `'${sourceText(node.callee)}' is not a function at index ${node.callee.index}`
                    );
                }

                return fillCall(
                    callee,
                    node.arguments.map(fillNode),
                    node.index,
                    node.length
                );
            }
        }

        // every other node type with operands is a binary operator
        if (definitions[node.type]?.syntax?.binary) {
            const dispatch =
                node.type === "multiply"
                    ? multiplyDispatch
                    : node.type === "divide"
                      ? divideDispatch
                      : undefined;

            return fillCall(
                resolveOperator(node),
                [fillNode(node.left), fillNode(node.right)],
                node.index,
                node.length,
                dispatch
            );
        }

        throw new Error(
            `Unknown AST node type '${node.type}' at index ${node.index}`
        );
    }

    const filled = fillNode(tree);

    // a provisional variable no call constrained (the whole tree is
    // one) takes the default type
    for (const nodes of occurrences.values()) {
        for (const node of nodes) {
            node.valueType ??= defaultType;
        }
    }

    return filled;
}

/* the analysis states and events the assume statements may name. a
state is a tag an instance of the target may carry (unrollable: unroll
may expand it); an event is something that happens to a variable
(actualized: fully determined, no unbound variables left). */

const analysisStates = new Set(["unrollable"]);
const analysisEvents = new Set(["actualized"]);

/* a block's declaration statements, resolved: the declared variables
in order and by name, the unified duck groups, and the block's local
default type and duck flag (`default duck;` types nothing but makes
every undeclared variable an individualized duck). shared by
makeClosure (a definition's block) and fillBlock (the nested blocks a
`:=` body may be). */

function resolveDeclarations(declarations, source, defaultType) {
    const declared = [];
    const declaredTypes = new Map();
    const duckGroups = [];
    let localDefault = defaultType;
    let localDefaultDuck = false;

    for (const declaration of declarations) {
        const type = resolveTypeName(declaration.typeName, source);

        /* `default duck;` — every undeclared variable of the block is
        an individualized duck. the default itself stays the enclosing
        one: a default still types the block's literals, and a duck is
        no value type. */
        if (declaration.type === "defaultDeclaration") {
            if (type === duckType || type === ducksType) {
                localDefaultDuck = true;
            } else {
                localDefault = type;
            }

            continue;
        }

        /* `duck x y;` unifies its names into one group (they must
        take the same type); `ducks x y;` is individualized. a
        singleton group is no group at all. */
        const group =
            type === duckType && declaration.names.length > 1 ? [] : null;

        for (const { name, index } of declaration.names) {
            if (declaredTypes.has(name)) {
                throw new Error(
                    `Variable '${name}' is declared twice at index ${index}`
                );
            }

            declaredTypes.set(name, type);
            declared.push({ name, type });
            group?.push(name);
        }

        if (group) {
            duckGroups.push(group);
        }
    }

    return { declared, declaredTypes, duckGroups, localDefault, localDefaultDuck };
}

/* whether a `:=` body is a block with content of its own —
declarations, locals, or assumptions, or nothing at all (an empty
block's missing expression is fillBlock's error). a block holding
only an expression, `x := { 2 }`, fills as the expression. */

const hasOwnBlock = (node) =>
    node.body === null ||
    node.declarations.length > 0 ||
    node.locals.length > 0 ||
    node.assumptions.length > 0;

/* fill a nested block — a `:=` body in braces — against an
environment: its declarations resolve, its locals fill in order (each
seeing the enclosing locals and the block locals before it, shadowing
by name), and its body fills with both in view. the environment's
splice, scope, and self carry through, so a with reaches into the
block the way it reaches into any local. shared by block-bodied
locals, replacements, and diff bindings. `what` names the construct
for the errors. */

function fillBlock(block, source, constants, variables, functions, defaultType, locals, context, what) {
    if (block.assumptions.length > 0) {
        throw new Error(
            `An assume statement belongs to a definition, ` +
                `not to ${what} at index ${block.assumptions[0].index}`
        );
    }

    if (block.body === null) {
        const What = what[0].toUpperCase() + what.slice(1);

        throw new SyntaxError(
            `${What} has no expression at index ${block.nameIndex}`
        );
    }

    const resolved = resolveDeclarations(block.declarations, source, defaultType);
    const blockVariables = [...resolved.declared, ...variables];

    /* an explicit `default ...;` governs the block's undeclared
    variables (duck or not); without one the enclosing rule carries */
    const hasDefault = block.declarations.some(
        (declaration) => declaration.type === "defaultDeclaration"
    );

    const blockContext = {
        ...context,
        duckGroups: [...(context?.duckGroups ?? []), ...resolved.duckGroups],
        defaultDuck: hasDefault ? resolved.localDefaultDuck : context?.defaultDuck,
    };

    const blockLocals = new Map(locals ?? []);
    const ownLocals = new Set();

    for (const local of block.locals) {
        if (ownLocals.has(local.name)) {
            throw new Error(
                `'${local.name}' is defined twice at index ${local.nameIndex}`
            );
        }

        if (resolved.declaredTypes.has(local.name)) {
            throw new Error(
                `'${local.name}' conflicts with the declared variable ` +
                    `of the same name at index ${local.nameIndex}`
            );
        }

        ownLocals.add(local.name);

        blockLocals.set(local.name, {
            tree: fillLocal(
                local,
                source,
                constants,
                blockVariables,
                functions,
                resolved.localDefault,
                blockLocals,
                blockContext
            ),
            definition: local,
            locals: blockLocals,
        });
    }

    return fill(
        block.body,
        source,
        constants,
        blockVariables,
        functions,
        resolved.localDefault,
        blockLocals,
        blockContext
    );
}

/* fill one local definition: a block body fills as a nested block
(fillBlock), a bare expression directly. */

function fillLocal(local, source, constants, variables, functions, defaultType, locals, context) {
    if (hasOwnBlock(local)) {
        return fillBlock(
            local,
            source,
            constants,
            variables,
            functions,
            defaultType,
            locals,
            context,
            `the local definition '${local.name}'`
        );
    }

    return fill(
        local.body,
        source,
        constants,
        variables,
        functions,
        defaultType,
        locals,
        context
    );
}

/* a definition as a re-fillable closure: its syntax, its declarations
(resolved eagerly — they need no fill), its assumptions (validated
eagerly), the definitions in its view, and the program environment it
fills against. the filled tree and locals memoize here. */

function makeClosure(definition, env) {
    const resolved = resolveDeclarations(
        definition.declarations,
        env.source,
        env.defaultType
    );

    const closure = {
        name: definition.name,
        nameIndex: definition.nameIndex,
        body: definition.body,
        localDefs: definition.locals,
        envSource: env.source,
        envConstants: env.constants,
        envVariables: env.variables,
        envFunctions: env.functions,
        envDefaultType: env.defaultType,
        localDefault: resolved.localDefault,
        localDefaultDuck: resolved.localDefaultDuck,
        declared: resolved.declared,
        declaredTypes: resolved.declaredTypes,
        duckGroups: resolved.duckGroups,
        scope: null, // set by fillProgram: the earlier definitions + self
        unrollable: false,
        watchedVariables: [],
        assumptions: [],
        instances: [],
        tree: null,
        localsMap: null,
    };

    for (const assumption of definition.assumptions) {
        if (assumption.target.name !== closure.name) {
            throw new Error(
                `An assume statement's target must be the definition itself ` +
                    `('${closure.name}'), not '${assumption.target.name}', ` +
                    `at index ${assumption.target.index}`
            );
        }

        for (const state of assumption.states) {
            if (!analysisStates.has(state.name)) {
                throw new Error(
                    `Unknown analysis state '${state.name}' at index ${state.index}`
                );
            }
        }

        for (const event of assumption.conditionStates) {
            if (!analysisEvents.has(event.name)) {
                throw new Error(
                    `Unknown analysis event '${event.name}' at index ${event.index}`
                );
            }
        }

        if (
            assumption.states.some((state) => state.name === "unrollable") &&
            assumption.conditionStates.some((event) => event.name === "actualized")
        ) {
            closure.unrollable = true;
            closure.watchedVariables.push(assumption.condition.name);
        }

        closure.assumptions.push(assumption);
    }

    return closure;
}

/* the locals of a definition, filled in order against its environment:
each entry carries its filled tree alongside its syntax and the locals
it saw, so a with-splice can re-fill it. */

function buildLocalsMap(closure, memo, selfType) {
    const locals = new Map();

    for (const local of closure.localDefs) {
        if (locals.has(local.name)) {
            throw new Error(
                `'${local.name}' is defined twice at index ${local.nameIndex}`
            );
        }

        if (closure.declaredTypes.has(local.name)) {
            throw new Error(
                `'${local.name}' conflicts with the declared variable ` +
                    `of the same name at index ${local.nameIndex}`
            );
        }

        locals.set(local.name, {
            tree: fillLocal(
                local,
                closure.envSource,
                closure.envConstants,
                [...closure.declared, ...closure.envVariables],
                closure.envFunctions,
                closure.localDefault,
                locals,
                {
                    scope: closure.scope,
                    self: closure,
                    selfType,
                    memo,
                    duckGroups: closure.duckGroups,
                    defaultDuck: closure.localDefaultDuck,
                }
            ),
            definition: local,
            locals,
        });
    }

    return locals;
}

/* fill a definition closure's body, settling the recursive instances'
provisional result type by fixed point: guess the local default (or,
under a splice, the settled tree's type), fill, and re-fill with the
body's actual type until it holds still. a definition that does not
reference itself settles on the first pass. the pristine fill memoizes
on the closure (tree and locals); a spliced fill re-fills fresh. */

export function fillClosureTree(closure, splice, memo, selfTypeGuess) {
    try {
        return fillClosureTreeRoot(closure, splice, memo, selfTypeGuess);
    } catch (error) {
        throw locateError(error, closure.envSource);
    }
}

function fillClosureTreeRoot(closure, splice, memo, selfTypeGuess) {
    if (!splice && closure.tree) {
        return closure.tree;
    }

    // a spliced fill stands on the pristine one (its locals, and its
    // type as the instances' first guess)
    if (splice && !closure.tree) {
        fillClosureTree(closure);
    }

    if (closure.body === null) {
        throw new SyntaxError(
            `The definition '${closure.name}' has no expression ` +
                `at index ${closure.nameIndex ?? closure.body?.index}`
        );
    }

    let guess =
        selfTypeGuess ??
        (splice && closure.tree ? typeOf(closure.tree) : closure.localDefault);

    for (let attempt = 0; attempt < 4; attempt++) {
        closure.instances = [];

        const locals = splice
            ? closure.localsMap
            : buildLocalsMap(closure, memo, guess);

        const tree = fill(
            closure.body,
            closure.envSource,
            closure.envConstants,
            [...closure.declared, ...closure.envVariables],
            closure.envFunctions,
            closure.localDefault,
            locals,
            {
                scope: closure.scope,
                self: closure,
                selfType: guess,
                splice,
                memo,
                duckGroups: closure.duckGroups,
                defaultDuck: closure.localDefaultDuck,
            }
        );

        // no self-reference: the guess played no part
        if (closure.instances.length === 0) {
            if (!splice) {
                closure.tree = tree;
                closure.localsMap = locals;
            }

            return tree;
        }

        const settled = typeOf(tree);

        if (settled === guess) {
            if (!splice) {
                closure.tree = tree;
                closure.localsMap = locals;
            }

            return tree;
        }

        guess = settled;
    }

    throw new Error(
        `Cannot settle on a result type for the recursive definition ` +
            `'${closure.name}': the instances' type keeps changing ` +
            `at index ${closure.nameIndex}`
    );
}

/* the variables of a settled closure: the declared names and every
free variable of its tree. */

function variablesOf(closure) {
    closure.variableNames ??= new Set([
        ...closure.declaredTypes.keys(),
        ...collectVariables(closure.tree),
    ]);

    return closure.variableNames;
}

/* one expansion step of unroll (unroll.js): the instance's definition
re-fills with the instance's ambient splice and its replacements
together (the replacements win) as the splice. */

export function expandInstance(instance) {
    const closure = instance.of;
    const splice = new Map([
        ...(instance.ambient ?? []),
        ...instance.replacements.map((replacement) => [replacement.name, replacement.tree]),
    ]);

    return fillClosureTree(closure, splice, new Map());
}

/* fillProgram(program, source, env) — a whole parsed program
(syntax/ast.js's buildProgram) to one filled tree per definition.

each definition's block resolves its own declarations: `default T;`
types its literals, plain constants, and undeclared variables (the
env's defaultType otherwise); `T a b c;` declares variables with the
given types; and `name := body;` names a subtree, filled once and
shared at each use — no semantic difference from inlining it. locals
see the locals declared before them, and conflict with nothing but
each other and the block's declared variables. definitions see the
definitions before them: an earlier definition's name shares its
filled tree, and `name { ... }` re-fills it with the given
variables replaced; the definition's own name is recursion and
defers to an instance node (see fill's header).

returns [{ name, tree, variables, index }] where variables is the
definition's signature: the declared variables in declaration order,
then every implicit variable the body actually uses, in order of
first appearance, each with its fill-decided type. */

export function fillProgram(program, source, { constants = [], variables = [], functions, defaultType } = {}) {
    try {
        return fillProgramRoot(program, source, { constants, variables, functions, defaultType });
    } catch (error) {
        throw locateError(error, source);
    }
}

function fillProgramRoot(program, source, { constants = [], variables = [], functions, defaultType } = {}) {
    functions ??= standardFunctions;
    defaultType ??= floatType;

    const env = { source, constants, variables, functions, defaultType };
    const closures = program.definitions.map((definition) => makeClosure(definition, env));

    const scope = new Map();

    for (const closure of closures) {
        closure.scope = new Map([...scope, [closure.name, closure]]);
        scope.set(closure.name, closure);
    }

    return closures.map((closure) => {
        const tree = fillClosureTree(closure);

        /* the definition's own variables, for the signature and the
        validations below. an instance's hidden free variables (its
        definition's, minus the replaced ones) are a subset of the
        enclosing body's own — the expansion re-fills the same body —
        so the body's variables plus the instances' replacement
        variables are the whole story. */

        const variableNames = new Set(collectVariables(tree));
        const variableTypes = new Map();

        (function walk(node) {
            if (node.type === "variable") {
                if (!closure.declaredTypes.has(node.name) && !variableTypes.has(node.name)) {
                    variableTypes.set(node.name, node.valueType ?? closure.localDefault);
                }

                return;
            }

            if (node.type === "instance") {
                // an instance's replacement names belong to ITS OWN
                // definition's namespace (an instance of an earlier
                // definition may sit inside this one's tree)
                const names = variablesOf(node.of);

                for (const replacement of node.replacements) {
                    if (!names.has(replacement.name)) {
                        throw new Error(
                            `'${replacement.name}' is not a variable of ` +
                                `'${node.of.name}' at index ${replacement.nameIndex}`
                        );
                    }
                }
            }

            for (const child of childrenOf(node)) {
                walk(child);
            }
        })(tree);

        for (const assumption of closure.assumptions) {
            if (
                !variableNames.has(assumption.condition.name)
            ) {
                throw new Error(
                    `'${assumption.condition.name}' in the assume statement of ` +
                        `'${closure.name}' is not a variable of the definition ` +
                        `at index ${assumption.condition.index}`
                );
            }
        }

        /* the signature reports the fill-decided types — except the
        ducks: a `default duck;` block's undeclared variables are
        reported as the individualized ducks they are (their
        fill-decided types are provisional and bind nothing) */
        const signature = [
            ...closure.declared,
            ...collectVariables(tree)
                .filter((name) => !closure.declaredTypes.has(name))
                .map((name) => ({
                    name,
                    type: closure.localDefaultDuck
                        ? ducksType
                        : variableTypes.get(name),
                })),
        ];

        return { name: closure.name, tree, variables: signature, index: closure.nameIndex };
    });
}
