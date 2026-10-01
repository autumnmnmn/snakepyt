/* analyzeTypes

the expression language is implicitly f32 everywhere, with one
exception introduced by the conditionals: comparisons and logical
operators produce booleans, and select's condition must be one. wgsl
is strictly typed, so codegen runs this pass before rendering. each
function's typing rule is its own `signature` (definitions.js);
absent a signature, a function takes number arguments and returns a
number. the signatures:

- { arguments: "floats" | "bools", returns } — every argument is
  that type (comparisons, and/or).
- { arguments: "same", returns: "bool" } — the operands share one
  type (equality).
- { arguments: [{ type, context }, ...], returns } — fixed arity
  with per-argument types and error-message context (select, not).

the pass validates the typing rules and classifies each variable by
the positions it appears in. a variable used only where a boolean is
expected is assumed to be a u32 holding 0 or 1 (the shaders' $bool
uniform convention); toWgsl renders it as `name != 0u`. a variable
used in both kinds of position is ambiguous, and an error. returns
the set of boolean variable names. */

export function analyzeTypes(tree) {
    // first-seen source index per variable, for error messages
    const booleanVariables = new Map();
    const floatVariables = new Map();

    function classify(node, type) {
        const variables = type === "bool" ? booleanVariables : floatVariables;

        if (!variables.has(node.name)) {
            variables.set(node.name, node.index);
        }
    }

    function expect(node, type, context) {
        if (node.type === "variable") {
            classify(node, type);

            return;
        }

        const actual = infer(node);

        if (actual !== type) {
            throw new Error(
                `${context} must be a ${type === "bool" ? "boolean" : "number"}, ` +
                    `but it is a ${actual === "bool" ? "boolean" : "number"} ` +
                    `at index ${node.index}`
            );
        }
    }

    function infer(node) {
        switch (node.type) {
            case "number":
                return "float";

            case "variable":
                classify(node, "float");

                return "float";

            case "call": {
                const name = node.callee.name;
                const args = node.arguments;
                const signature = node.callee.signature;

                if (signature?.arguments === "same") {
                    const types = args.map(infer);

                    if (types.some((type) => type !== types[0])) {
                        throw new Error(
                            `Both sides of '${name}' must have the same type ` +
                                `at index ${node.index}`
                        );
                    }

                    return signature.returns;
                }

                if (Array.isArray(signature?.arguments)) {
                    const parameters = signature.arguments;

                    if (args.length !== parameters.length) {
                        throw new Error(
                            `'${name}' takes ${parameters.length} ` +
                                `argument${parameters.length === 1 ? "" : "s"}, ` +
                                `got ${args.length} at index ${node.index}`
                        );
                    }

                    for (const [i, parameter] of parameters.entries()) {
                        expect(args[i], parameter.type, parameter.context);
                    }

                    return signature.returns;
                }

                if (
                    signature?.arguments === "floats" ||
                    signature?.arguments === "bools"
                ) {
                    const type =
                        signature.arguments === "floats" ? "float" : "bool";

                    for (const argument of args) {
                        expect(argument, type, `An operand of '${name}'`);
                    }

                    return signature.returns;
                }

                for (const argument of args) {
                    expect(argument, "float", `An argument of '${name}'`);
                }

                return "float";
            }

            default:
                throw new Error(
                    `Cannot type a node of type '${node.type}' at index ${node.index}`
                );
        }
    }

    expect(tree, "float", "The expression as a whole");

    for (const [name, boolIndex] of booleanVariables) {
        if (floatVariables.has(name)) {
            throw new Error(
                `Variable '${name}' is used as a boolean at index ${boolIndex} ` +
                    `and as a number at index ${floatVariables.get(name)}`
            );
        }
    }

    return new Set(booleanVariables.keys());
}
