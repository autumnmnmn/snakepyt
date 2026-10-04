/* autodiff

differentiate.

the function vocabulary lives in operations/: one definition per
function holding everything about it — which combinations of types it
accepts and what it computes for each, its derivative recipe, its
rendering templates, its rewrite rules (the full schema is documented
there). the derivative recipes are type-neutral: they are written
against the builders object, which constructs typed calls
(typedCallNode), so a recipe written for floats composes whatever
types the call's arguments actually carry — complex arithmetic through
the complex cases, componentwise arithmetic through the vector ones.
the recipes assume a commutative arithmetic; the matrix cases carry
their own order-preserving recipes (operations/), and canonicalize
leaves products over matrices associated as written.

differentiation is with respect to a scalar variable; a vector or
matrix expression differentiates componentwise. the zeros and ones the
walk produces take the type of the node they stand for. */

import { builders } from "./operations/index.js";
import { copyNode, numberNode } from "./semantics/nodes.js";
import { floatType, isMatrix, numberType, oneOf, zeroOf } from "./types/index.js";

export function differentiate(tree, withRespectTo) {
    switch (tree.type) {
        case "number":
            return numberNode(
                zeroOf(numberType(tree)),
                tree.index,
                tree.length
            );

        case "variable": {
            const type = tree.valueType ?? floatType;

            if (tree.name !== withRespectTo) {
                return numberNode(zeroOf(type), tree.index, tree.length);
            }

            if (isMatrix(type) || type.kind === "bool") {
                throw new Error(
                    `Cannot differentiate with respect to '${tree.name}', ` +
                        `a ${type.name} variable: differentiation is with ` +
                        `respect to numeric variables at index ${tree.index}`
                );
            }

            // a vector differentiation variable takes the componentwise
            // convention: its one and zero are splats
            return numberNode(oneOf(type), tree.index, tree.length);
        }

        case "convert":
            return copyNode(tree, {
                operand: differentiate(tree.operand, withRespectTo),
            });

        /* conditions are piecewise-constant; a cases block
        differentiates its bodies */
        case "cases":
            return copyNode(tree, {
                cases: tree.cases.map(({ condition, body }) => ({
                    condition,
                    body: differentiate(body, withRespectTo),
                })),
            });

        case "diff":
            throw new Error(
                `Cannot differentiate the deferred diff at index ${tree.index}: ` +
                    "bind its wrt and f first"
            );

        case "instance":
            throw new Error(
                `Cannot differentiate the recursive instance of ` +
                    `'${tree.of.name}': recursion has no derivative — ` +
                    `unroll it first at index ${tree.index}`
            );

        case "call": {
            if (tree.callee.type !== "function") {
                throw new Error(
                    "Cannot differentiate an unresolved call; " +
                        "run the tree through fill first " +
                        `at index ${tree.index}`
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

            return tree.callee.derivative(tree.arguments, derivatives, builders);
        }

        default:
            throw new Error(
                `Cannot differentiate a node of type '${tree.type}' ` +
                    `at index ${tree.index}`
            );
    }
}
