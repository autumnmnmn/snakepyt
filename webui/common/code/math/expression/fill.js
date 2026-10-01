/* fill

resolves a syntax tree into a semantic tree against the caller's
constants, variables, and functions, in a value domain (default
floatDomain — see autodiff.js for what a domain provides). the domain
supplies the builtin table operators resolve against, reads constant
values, and lifts source literals onto its own values, so a tree
filled in the complex domain holds complex literals and calls complex
arithmetic. functions defaults to the domain's standard vocabulary.

every error names the source index of the node that caused it. */

import { floatDomain } from "./autodiff.js";
import { callNode, functionNode } from "./nodes.js";
import { binaryOperators } from "./ast.js";
import { symbolForOperator } from "./tokenize.js";

export function fill(tree, source, constants, variables, functions, domain = floatDomain) {
    functions ??= domain.standard;

    const constantsByName = new Map(
        constants.map((constant) => [constant.name, constant])
    );

    const variableNames = new Set(variables);

    const functionsByName = new Map(
        functions.map((definition) => [definition.name, definition])
    );

    function sourceText(node) {
        return source.slice(node.index, node.index + node.length);
    }

    function resolveIdentifier(node) {
        const name = sourceText(node);

        const constant = constantsByName.get(name);
        if (constant) {
            let value;

            try {
                value = domain.constant(constant.value, name);
            } catch (error) {
                throw new Error(`${error.message} at index ${node.index}`);
            }

            return {
                type: "number",
                index: node.index,
                length: node.length,
                value,
                ...(constant.kind === "named" ? { name } : {}),
            };
        }

        if (!variableNames.has(name)) {
            const definition = functionsByName.get(name);
            if (definition) {
                return functionNode(definition, node.index, node.length);
            }
        }

        return {
            type: "variable",
            index: node.index,
            length: node.length,
            name,
        };
    }

    function resolveOperator(node) {
        const definition = domain.builtins[node.type];

        if (!definition) {
            throw new SyntaxError(
                `Operator '${symbolForOperator(node.type)}' is not defined in the ${domain.name} domain at index ${node.index}`
            );
        }

        return definition;
    }

    function fillNode(node) {
        switch (node.type) {
            case "number": {
                const text = sourceText(node);
                const value = Number(text);

                if (Number.isNaN(value)) {
                    throw new SyntaxError(
                        `Invalid number literal '${text}' at index ${node.index}`
                    );
                }

                return {
                    type: "number",
                    index: node.index,
                    length: node.length,
                    value: domain.lift(value),
                };
            }

            case "identifier":
                return resolveIdentifier(node);

            case "negate":
            case "positive":
            case "not":
                return callNode(
                    resolveOperator(node),
                    [fillNode(node.operand)],
                    node.index,
                    node.length
                );

            case "ternary":
                return callNode(
                    domain.builtins.select,
                    [
                        fillNode(node.condition),
                        fillNode(node.then),
                        fillNode(node.else),
                    ],
                    node.index,
                    node.length
                );

            case "absolute": {
                const abs = functionsByName.get("abs") ?? domain.builtins.abs;

                if (!abs) {
                    throw new SyntaxError(
                        `|...| requires 'abs', which is not defined in the ${domain.name} domain at index ${node.index}`
                    );
                }

                return callNode(
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

                return {
                    type: "call",
                    index: node.index,
                    length: node.length,
                    callee,
                    arguments: node.arguments.map(fillNode),
                };
            }
        }

        // every other node type with operands is a binary operator
        if (binaryOperators[node.type]) {
            return callNode(
                resolveOperator(node),
                [fillNode(node.left), fillNode(node.right)],
                node.index,
                node.length
            );
        }

        throw new Error(
            `Unknown AST node type '${node.type}' at index ${node.index}`
        );
    }

    return fillNode(tree);
}
