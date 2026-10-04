/* codegen

renders a semantic tree to an expression string in a target language:
wgsl for shaders, and "math" — input for the $math/math module, which
renders the tree as mathml.

how a call renders is its function's own data (operations/): a
per-target `template` — a string with {0}, {1}, ... argument
placeholders, like "({0} + {1})" or "pow({0}, {1})" — resolved for the
call's types and stamped on the callee at construction (typedCallNode).
a call whose function has no template for the target renders as a plain
`name(arg, ...)` call in wgsl, or `name{(arg, ...)}` in math. the n-ary
canonical forms carry an `expand` tag and re-nest into binary operator
chains before rendering (expandCanonical below). for the math target,
a function's `mathClass` (binding class) and `mathParens` (operand
positions that parenthesize) decide where visible parens go.

math templates may wrap placeholders in literal braces, as in divide's
"{{0}}/{{1}}": the braces make each operand a single mrow, which the
module's infix grouping (/, ^, _, root) requires, and they group without
rendering anything themselves. visible parens are added only where a
child would otherwise bind more loosely than its position, so canonical
trees render with next to no parens.

literals render through their own type (types/), and an explicit
conversion (a convert node) renders through its target type — wgsl gets
its constructors (vec2f(x, 0.0) and the like), while math leaves the
operand's rendering untouched: a scalar among vectors reads fine.

variables are caller-mapped: `variables` may be an object of
name → replacement source or a function (name) => string | undefined, and
any name left unmapped renders as itself — the identity fallback.
a boolean-typed variable is assumed to be a 0/1 u32 (the shaders'
$bool uniform convention) and renders as `name != 0u`. `functions` is
an object of name → template overriding the template a function
carries, for when the same tree must be spelled differently in
different shaders or posts. */

import { arithmetic } from "./operations/arithmetic.js";
import { comparison } from "./operations/comparison.js";
import { products } from "./operations/products.js";
import { numberNode } from "./semantics/nodes.js";
import { childrenOf, treesEqual } from "./semantics/trees.js";
import { inverseOf } from "./canonicalize.js";
import { boolType, floatType, isMatrix, isTensor, isVector, numberType, octonionType, typeOf, typedCallNode, valueApply } from "./types/index.js";

function applyTemplate(template, name, args, nodeIndex) {
    return template.replace(/\{(\d+)\}/g, (placeholder, index) => {
        if (Number(index) >= args.length) {
            throw new Error(
                `Template '${template}' for '${name}' references ` +
                    `argument ${index}, but the call has ${args.length} ` +
                    `at index ${nodeIndex}`
            );
        }

        return args[Number(index)];
    });
}

function mapVariables(variables) {
    return typeof variables === "function"
        ? variables
        : (name) => variables?.[name];
}

/* wgsl natively has only the float tensors up to size 4 (vecNf and
matCxRf, N/C/R in 2..4) and bool vectors (vecN<bool>): a complex
tensor's arithmetic renders through the entries' scalar templates,
which the vec2f representation does not support, and higher tensors
have no representation yet. nor is there a wgsl octonion. checked up
front over the atoms, the only place either can enter. (the exact
integers and rationals lower to f32 literals; quaternions render as
vec4f.) */

function assertWgslTypes(node) {
    const check = (type, index) => {
        if (type === octonionType) {
            throw new Error(
                `Cannot render an octonion as wgsl: ` +
                    `there is no wgsl representation at index ${index}`
            );
        }

        if (isTensor(type)) {
            const native =
                (isVector(type) &&
                    type.size >= 2 &&
                    type.size <= 4 &&
                    (type.entry === floatType || type.entry === boolType)) ||
                (isMatrix(type) &&
                    type.rows >= 2 &&
                    type.rows <= 4 &&
                    type.cols >= 2 &&
                    type.cols <= 4 &&
                    type.entry === floatType);

            if (!native) {
                throw new Error(
                    `Cannot render ${type.name} as wgsl: only float vectors ` +
                        "and matrices and bool vectors of sizes 2 through 4 " +
                        `have a wgsl representation yet at index ${index}`
                );
            }
        }
    };

    switch (node.type) {
        case "number":
            check(numberType(node), node.index);
            return;

        case "variable":
            check(node.valueType ?? floatType, node.index);
            return;

        case "convert":
            check(node.target, node.index);
            break;

        case "instance":
            check(node.valueType, node.index);
            break;
    }

    for (const child of childrenOf(node)) {
        assertWgslTypes(child);
    }
}

export function toWgsl(tree, { variables, functions } = {}) {
    const mapVariable = mapVariables(variables);

    if (typeOf(tree) === boolType) {
        throw new Error(
            "The expression as a whole must be a number, " +
                `but it is a boolean at index ${tree.index}`
        );
    }

    assertWgslTypes(tree);

    function renderCall(callee, args) {
        const template = functions?.[callee.name] ?? callee.template?.wgsl;

        if (template === undefined) {
            return `${callee.name}(${args.join(", ")})`;
        }

        return applyTemplate(template, callee.name, args, callee.index);
    }

    function render(node) {
        switch (node.type) {
            case "number":
                return numberType(node).renderNumber.wgsl(node);

            case "instance":
                throw new Error(
                    `Cannot render the recursive instance of '${node.of.name}' ` +
                        `as wgsl: unroll it first at index ${node.index}`
                );

            case "diff":
                throw new Error(
                    `Cannot render a deferred diff as wgsl at index ${node.index}: ` +
                        "bind its wrt and f first"
                );

            case "variable": {
                const mapped = mapVariable(node.name) ?? node.name;

                return node.valueType === boolType
                    ? `(${mapped} != 0u)`
                    : mapped;
            }

            case "function":
                throw new Error(
                    `Cannot render the bare function '${node.name}' ` +
                        `as a wgsl value at index ${node.index}`
                );

            case "convert":
                return node.target.renderConvert.wgsl(
                    render(node.operand),
                    typeOf(node.operand)
                );

            case "cases":
                return render(expandCases(node));

            case "call": {
                const expanded = expandCanonical(node);

                return renderCall(
                    expanded.callee,
                    expanded.arguments.map(render)
                );
            }

            default:
                throw new Error(
                    `Cannot render a node of type '${node.type}' ` +
                        `as wgsl at index ${node.index}`
                );
        }
    }

    return render(tree);
}

/* canonical sum/product nodes re-nest into binary chains for
rendering: a sum folds into plus/minus by term sign, a product into a
multiply chain over a single divide by the inverted factors' multiply
chain — each product family through its own operations (multiply/divide
for scalars, the pointwise pair for vectors). the binary templates and
paren rules then apply as usual. */

function sumToBinary(node) {
    const [first, ...rest] = node.arguments;

    let result = first;

    for (const term of rest) {
        if (term.type === "call" && term.callee.name === "negate") {
            result = typedCallNode(
                arithmetic.minus,
                [result, term.arguments[0]],
                node.index
            );
        } else if (
            term.type === "number" &&
            (numberType(term).asReal(term.value) ?? 0) < 0
        ) {
            result = typedCallNode(
                arithmetic.minus,
                [
                    result,
                    numberNode(valueApply(arithmetic.negate, term.value), term.index),
                ],
                node.index
            );
        } else {
            result = typedCallNode(arithmetic.plus, [result, term], node.index);
        }
    }

    return result;
}

function productToBinary(node, times, divide) {
    const numerator = [];
    const denominator = [];

    for (const factor of node.arguments) {
        const inverse = inverseOf(factor);

        if (!inverse) {
            numerator.push(factor);
        } else {
            denominator.push(
                inverse.exponent === 1
                    ? inverse.base
                    : typedCallNode(
                          arithmetic.power,
                          [inverse.base, numberNode(inverse.exponent, factor.index)],
                          factor.index
                      )
            );
        }
    }

    const chain = (factors) =>
        factors.reduce((result, factor) =>
            typedCallNode(times, [result, factor], node.index)
        );

    const numeratorChain = numerator.length
        ? chain(numerator)
        : numberNode(1, node.index);

    return denominator.length
        ? typedCallNode(
              divide,
              [numeratorChain, chain(denominator)],
              node.index
          )
        : numeratorChain;
}

/* a cases block renders as nested selects, folding from the LEFT:
the first case is the fallthrough and its condition never renders —
in well-formed use exactly one case holds (the block throws otherwise,
and a shader cannot throw). the two-case block whose conditions are a
condition and its negation — the ternary's shape — renders as one
select on the positive condition. */

const isNotOf = (maybeNegation, condition) =>
    maybeNegation.type === "call" &&
    maybeNegation.callee.name === "not" &&
    treesEqual(maybeNegation.arguments[0], condition);

function expandCases(node) {
    if (node.cases.length === 2) {
        const [first, second] = node.cases;

        const [positive, negative] = isNotOf(second.condition, first.condition)
            ? [first, second]
            : isNotOf(first.condition, second.condition)
              ? [second, first]
              : [];

        if (positive) {
            return typedCallNode(
                comparison.select,
                [positive.condition, positive.body, negative.body],
                node.index
            );
        }
    }

    let result = node.cases[0].body;

    for (const { condition, body } of node.cases.slice(1)) {
        result = typedCallNode(
            comparison.select,
            [condition, body, result],
            node.index
        );
    }

    return result;
}

function expandCanonical(node) {
    switch (node.callee.expand) {
        case "sum":
            return sumToBinary(node);
        case "product":
            return productToBinary(node, products.multiply, products.divide);
        case "pointwiseProduct":
            return productToBinary(
                node,
                products.pointwiseMultiply,
                products.pointwiseDivide
            );
        default:
            return node;
    }
}

/* the binding class of a node's rendered form: its function's
mathClass, with "pass" (unary plus) transparent and anything else an
atom. negative numbers count as negations: as a power base, -2^2
would misread as -(2^2). a conversion is transparent: it renders as
its operand. */

function mathClass(node) {
    if (node.type === "number") {
        return numberType(node).splitSign(node.value).sign < 0 ? "negate" : "atom";
    }

    if (node.type === "convert") {
        return mathClass(node.operand);
    }

    if (node.type !== "call") {
        return "atom";
    }

    const binding = node.callee.mathClass ?? "atom";

    return binding === "pass" ? mathClass(node.arguments[0]) : binding;
}

/* `header` is the declaration line prepended to the content: "inline
auto" for the usual in-text case, "auto" for a display block, or "" for
bare content to embed in a larger hand-written block — e.g.
`inline auto f'{(x)} = ${toMath(df, { header: "" })}`. */

export function toMath(tree, { variables, functions, header = "inline auto" } = {}) {
    const mapVariable = mapVariables(variables);

    function renderCall(node) {
        const expanded = expandCanonical(node);

        const parens = expanded.callee.mathParens;

        const args = expanded.arguments.map((argument, index) => {
            const rendered = render(argument);

            const classes = parens?.[index] ?? parens?.any;

            return classes?.includes(mathClass(argument))
                ? `(${rendered})`
                : rendered;
        });

        const template =
            functions?.[expanded.callee.name] ?? expanded.callee.template?.math;

        if (template === undefined) {
            return `${expanded.callee.name}{(${args.join(", ")})}`;
        }

        return applyTemplate(
            template,
            expanded.callee.name,
            args,
            expanded.callee.index
        );
    }

    function render(node) {
        switch (node.type) {
            case "number":
                return numberType(node).renderNumber.math(node);

            case "instance":
                throw new Error(
                    `Cannot render the recursive instance of '${node.of.name}' ` +
                        `as math: unroll it first at index ${node.index}`
                );

            case "diff":
                throw new Error(
                    `Cannot render a deferred diff as math at index ${node.index}: ` +
                        "bind its wrt and f first"
                );

            case "variable":
                return mapVariable(node.name) ?? node.name;

            case "function":
                throw new Error(
                    `Cannot render the bare function '${node.name}' ` +
                        `as a math value at index ${node.index}`
                );

            case "convert":
                return render(node.operand);

            case "cases":
                return render(expandCases(node));

            case "call":
                return renderCall(node);

            default:
                throw new Error(
                    `Cannot render a node of type '${node.type}' ` +
                        `as math at index ${node.index}`
                );
        }
    }

    const content = render(tree);

    return header ? `${header} ${content}` : content;
}
