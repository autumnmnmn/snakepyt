/* codegen

renders a semantic tree to an expression string in a target language:
wgsl for shaders, and "math" — input for the $math/math module, which
renders the tree as mathml.

how a call renders is its function's own data (definitions.js): a
per-target `template` — a string with {0}, {1}, ... argument
placeholders, like "({0} + {1})" or "pow({0}, {1})" — and a call
whose function has no template for the target renders as a plain
`name(arg, ...)` call in wgsl, or `name{(arg, ...)}` in math. the
n-ary canonical forms carry an `expand` tag and re-nest into binary
chains before rendering (expandCanonical below). for the math target,
a function's `mathClass` (binding class) and `mathParens` (operand
positions that parenthesize) decide where visible parens go.

math templates may wrap placeholders in literal braces, as in divide's
"{{0}}/{{1}}": the braces make each operand a single mrow, which the
module's infix grouping (/, ^, _, root) requires, and they group without
rendering anything themselves. visible parens are added only where a
child would otherwise bind more loosely than its position, so canonical
trees render with next to no parens.

variables are caller-mapped: `variables` may be an object of
name → replacement source or a function (name) => string | undefined, and
any name left unmapped renders as itself — the identity fallback.
`functions` is an object of name → template overriding the template a
function carries, for when the same tree must be spelled differently in
different shaders or posts. `domain` is the value domain the tree was
filled in (default float): it supplies literal rendering for non-double
values (domain.renderNumber) and the exponent probes of canonical
product expansion. */

import { floatDomain } from "./autodiff.js";
import { callNode, numberNode } from "./nodes.js";
import { inverseOf } from "./canonicalize.js";
import { analyzeTypes } from "./types.js";

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

export function formatFloat(value) {
    if (!Number.isFinite(value)) {
        throw new Error(`Cannot render the non-finite number ${value} as wgsl`);
    }

    if (!Number.isFinite(Math.fround(value))) {
        throw new Error(
            `Cannot render ${value} as a wgsl f32 literal: out of range`
        );
    }

    let text = String(value);

    if (!/[.eE]/.test(text)) {
        text += ".0";
    }

    return value < 0 ? `(${text})` : text;
}

/* wgsl is strictly typed: analyzeTypes (types.js) validates the
boolean/float rules — throwing on a boolean anywhere a number belongs
or a variable used as both — and returns the variables used only as
booleans. those are assumed to be 0/1 u32s (the $bool uniform
convention) and render as `name != 0u`. */

export function toWgsl(tree, { variables, functions, domain = floatDomain } = {}) {
    const mapVariable = mapVariables(variables);

    const booleanVariables = analyzeTypes(tree);

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
                return domain.renderNumber?.wgsl
                    ? domain.renderNumber.wgsl(node)
                    : formatFloat(node.value);

            case "variable": {
                const mapped = mapVariable(node.name) ?? node.name;

                return booleanVariables.has(node.name)
                    ? `(${mapped} != 0u)`
                    : mapped;
            }

            case "function":
                throw new Error(
                    `Cannot render the bare function '${node.name}' ` +
                        `as a wgsl value at index ${node.index}`
                );

            case "call": {
                const expanded = expandCanonical(node, domain);

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

/* named constants (pi, ...) stay symbolic — auto mode maps the greek
names — and scientific notation becomes a mantissa times a power of
ten, since the module has no exponent literal. */

export function formatMathNumber(node) {
    if (node.name !== undefined) {
        return node.name;
    }

    const value = node.value;

    if (Number.isNaN(value)) {
        throw new Error(`Cannot render NaN as math at index ${node.index}`);
    }

    if (!Number.isFinite(value)) {
        return value > 0 ? "inf" : "-inf";
    }

    const text = String(value);

    if (!/[eE]/.test(text)) {
        return text;
    }

    const [mantissa, exponent] = text.split(/[eE]/);

    return `${mantissa} dot 10^{${Number(exponent)}}`;
}

/* canonical sum/product nodes re-nest into binary chains for
rendering: a sum folds into plus/minus by term sign, a product into a
multiply chain over a single divide by the inverted factors' multiply
chain. the binary templates and paren rules then apply as usual. */

function sumToBinary(node, domain) {
    const [first, ...rest] = node.arguments;

    let result = first;

    for (const term of rest) {
        if (term.type === "call" && term.callee.name === "negate") {
            result = callNode(domain.builtins.minus, [result, term.arguments[0]], node.index);
        } else if (term.type === "number" && domain.asReal(term.value) < 0) {
            result = callNode(
                domain.builtins.minus,
                [result, numberNode(domain.ops.negate(term.value), term.index)],
                node.index
            );
        } else {
            result = callNode(domain.builtins.plus, [result, term], node.index);
        }
    }

    return result;
}

function productToBinary(node, domain) {
    const numerator = [];
    const denominator = [];

    for (const factor of node.arguments) {
        const inverse = inverseOf(factor, domain);

        if (!inverse) {
            numerator.push(factor);
        } else {
            denominator.push(
                inverse.exponent === 1
                    ? inverse.base
                    : callNode(
                          domain.builtins.power,
                          [inverse.base, numberNode(inverse.exponent, factor.index)],
                          factor.index
                      )
            );
        }
    }

    const chain = (factors) =>
        factors.reduce((result, factor) =>
            callNode(domain.builtins.multiply, [result, factor], node.index)
        );

    const numeratorChain = numerator.length
        ? chain(numerator)
        : numberNode(1, node.index);

    return denominator.length
        ? callNode(
              domain.builtins.divide,
              [numeratorChain, chain(denominator)],
              node.index
          )
        : numeratorChain;
}

function expandCanonical(node, domain) {
    switch (node.callee.expand) {
        case "sum":
            return sumToBinary(node, domain);
        case "product":
            return productToBinary(node, domain);
        default:
            return node;
    }
}

/* the binding class of a node's rendered form: its function's
mathClass, with "pass" (unary plus) transparent and anything else an
atom. negative numbers count as negations: as a power base, -2^2
would misread as -(2^2). */

function mathClass(node) {
    if (node.type === "number") {
        return node.value < 0 ? "negate" : "atom";
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

export function toMath(tree, { variables, functions, header = "inline auto", domain = floatDomain } = {}) {
    const mapVariable = mapVariables(variables);

    function renderCall(node) {
        const expanded = expandCanonical(node, domain);

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
                return domain.renderNumber?.math
                    ? domain.renderNumber.math(node)
                    : formatMathNumber(node);

            case "variable":
                return mapVariable(node.name) ?? node.name;

            case "function":
                throw new Error(
                    `Cannot render the bare function '${node.name}' ` +
                        `as a math value at index ${node.index}`
                );

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
