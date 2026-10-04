/* differentiable expression parser

a unified user-facing language for defining automatically differentiable math expressions
which can then be actualized as javascript expressions and wgsl expressions, along with
expressions for their derivatives.

the module is split by pipeline stage: syntax/ (source to tokens to
syntax tree — tokenize.js, ast.js; locate.js, the source locations of
error messages), semantics/ (the semantic tree —
expression.js (the Expression class every node is an instance of, so
the tree-consuming passes are also methods on the trees),
nodes.js (node constructors), trees.js (tree utilities: equality,
variable collection, literal probes, the children walkers), fill.js
(syntax tree to semantic
tree — where the types of leaf nodes are decided, and where the with
operator's splices, the cases and diff blocks, and the recursive
instances live)), types/ (the value
types — float, the default; complex; vectors; matrices; bool; the
exact tower; duck, the declaration marker — the
promotion lattice, case resolution, and typedCallNode, the typed call
constructor), operations/ (the function vocabulary: one definition per
function holding its syntax, its cases (which combinations of types it
accepts and what it computes for each), its derivative recipe, its
rendering, and its rewrite rules), autodiff.js (differentiate),
simplify.js and canonicalize.js (the rewrite passes), unroll.js (the
recursion pass, memoized per call for the fibonacci-shaped
definitions), and codegen.js
(semantic tree to target-language source: wgsl, and input for the
$math/math module), pretty.js (semantic tree to abstract divs and
spans, for dom or console viewing). this file re-exports the public
api and defines parse, the whole pipeline in one call.

types travel with the tree: every leaf's type is decided at fill, and
every compound expression's type derives from its operands, so no pass
takes a value domain anymore — a tree may mix types, with promotions
inserted where operands meet (see types/). */

import { tokenize } from "./syntax/tokenize.js";
import { locateError } from "./syntax/locate.js";
import { buildProgram, buildTree } from "./syntax/ast.js";
import { fill, fillProgram } from "./semantics/fill.js";
import { standardFunctions } from "./operations/index.js";
import { floatType } from "./types/index.js";

export { symbolForOperator, tokenize } from "./syntax/tokenize.js";
export { lineColOf, locateError, showLocation } from "./syntax/locate.js";
export { buildProgram, buildTree } from "./syntax/ast.js";
export { fill, fillProgram } from "./semantics/fill.js";
export {
    builders,
    definitions,
    standardFunctions,
} from "./operations/index.js";
export { Expression } from "./semantics/expression.js";
export {
    callNode,
    constantValue,
    copyNode,
    functionNode,
    numberNode,
} from "./semantics/nodes.js";
export { differentiate } from "./autodiff.js";
export {
    boolType,
    complexType,
    ducksType,
    duckType,
    floatType,
    formatFloat,
    formatMathNumber,
    integerType,
    isMatrix,
    isRingScalar,
    isTensor,
    isVector,
    joinTypes,
    matrixType,
    modularIntegerType,
    naturalType,
    numberType,
    octonionType,
    promoteNode,
    promotionDistance,
    quaternionType,
    rationalType,
    resolveCase,
    resolveTypeName,
    tensorType,
    typedCallNode,
    typeOf,
    typeOfValue,
    valueApply,
    vectorType,
} from "./types/index.js";
export { simplify } from "./simplify.js";
export { unroll } from "./unroll.js";
export { canonicalize, inverseOf } from "./canonicalize.js";
export {
    childrenOf,
    collectVariables,
    foldableValue,
    isLiteral,
    mapChildren,
    substituteVariable,
    treesEqual,
} from "./semantics/trees.js";
export { toMath, toWgsl } from "./codegen.js";
export { prettyPrint, prettyToDom, prettyToText } from "./pretty.js";

/* parse(source, constants?, variables?, functions?, defaultType?) — the
whole pipeline in one call, for a single expression (or a single
definition). constants and variables default to empty; constants are
{ name, value, kind?, type? }, variables names or { name, type };
functions defaults to the standard vocabulary, and defaultType
(default floatType) types literals, plain-number constants, and
variables that don't declare one. a type may occupy the functions
slot: parse(source, constants, variables, complexType).

the source may use the definition syntax (syntax/ast.js): `f := 2*x`
parses to the same tree as `2*x`. a program of several definitions is
parseExpressions' business. */

export function parse(source, constants, variables, functions, defaultType) {
    try {
        if (functions?.isType) {
            defaultType = functions;
            functions = undefined;
        }

        const program = buildProgram(tokenize(source), source);

        if (program.definitions.length !== 1) {
            throw new SyntaxError(
                `parse handles a single expression, but the source has ` +
                    `${program.definitions.length} definitions (use parseExpressions); ` +
                    `the second starts at index ${program.definitions[1].nameIndex}`
            );
        }

        const [result] = fillProgram(program, source, {
            constants,
            variables,
            functions,
            defaultType,
        });

        return result.tree;
    } catch (error) {
        throw locateError(error, source);
    }
}

/* parseExpressions(source, { constants?, variables?, functions?,
defaultType? }?) — the pipeline for a whole program: one entry per
definition, [{ name, tree, variables, index }]. a source with no
definition statement is the single definition `expr := ...`. the
declarations in a definition's block (default T; T a b;) set its
default type and declare its variables; its named subtrees fill once
and share at every use. */

export function parseExpressions(source, { constants, variables, functions, defaultType } = {}) {
    return fillProgram(buildProgram(tokenize(source), source), source, {
        constants,
        variables,
        functions,
        defaultType,
    });
}
