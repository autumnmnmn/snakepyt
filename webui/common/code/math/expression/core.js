/* differentiable expression parser

a unified user-facing language for defining automatically differentiable math expressions
which can then be actualized as javascript expressions and wgsl expressions, along with
expressions for their derivatives.

the module is split by pipeline stage: tokenize.js (source to tokens),
ast.js (tokens to syntax tree), fill.js (syntax tree to semantic tree),
definitions.js (the function vocabulary: one object per function holding
its syntax, evaluation, derivative, rendering, typing, and rewrite
rules), nodes.js (semantic node constructors), autodiff.js (builtin
table assembly from the definitions plus a domain's ops, the value
domains, differentiate), simplify.js and canonicalize.js (the rewrite
passes), trees.js (tree utilities: equality, variable collection,
literal probes), types.js (the boolean/float typing analysis codegen
needs), codegen.js (semantic tree to target-language source: wgsl, and
input for the $math/math module), and domains.js (value domains beyond
float: complex, pointwise vectors). this file re-exports the public api
and defines parse, the whole pipeline in one call.

every stage from fill onward takes a value domain (default floatDomain)
— see autodiff.js for the domain contract, makeDomain to build one from
an ops table, and domains.js for the provided non-float domains. this
is the seam along which "modes" are built: a mode bundles a parser with
the domain its trees live in. */

import { tokenize } from "./tokenize.js";
import { buildTree } from "./ast.js";
import { fill } from "./fill.js";
import { floatDomain } from "./autodiff.js";

export { symbolForOperator, tokenize } from "./tokenize.js";
export { buildTree } from "./ast.js";
export { fill } from "./fill.js";
export { definitions, definitionByName } from "./definitions.js";
export {
    callNode,
    constantValue,
    functionNode,
    numberNode,
} from "./nodes.js";
export {
    builtins,
    differentiate,
    floatDomain,
    floatOps,
    makeBuiltins,
    makeDomain,
    recipes,
    standardFunctions,
    standardFunctionsOf,
} from "./autodiff.js";
export { simplify } from "./simplify.js";
export { canonicalize, inverseOf } from "./canonicalize.js";
export {
    collectVariables,
    foldableValue,
    isLiteral,
    treesEqual,
} from "./trees.js";
export { analyzeTypes } from "./types.js";
export { formatFloat, toMath, toWgsl } from "./codegen.js";
export { complexDomain, pointwiseDomain } from "./domains.js";

/* parse(source, constants, variables, functions?, domain?) — the whole
pipeline in one call. functions defaults to the domain's standard
vocabulary, and the domain itself may occupy the functions slot:
parse(source, constants, variables, complexDomain). */

export function parse(source, constants, variables, functions, domain) {
    if (functions?.builtins) {
        domain = functions;
        functions = undefined;
    }

    domain ??= floatDomain;
    functions ??= domain.standard;

    return fill(
        buildTree(tokenize(source), source),
        source,
        constants,
        variables,
        functions,
        domain
    );
}
