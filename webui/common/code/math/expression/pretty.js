/* pretty — pretty-printing of semantic trees.

prettyPrint(tree) renders a semantic tree to an ABSTRACT tree of divs
and spans ({ tag, classes, text?, children? }): everything the
semantic system knows about the tree, laid out for reading — every
node with its fill-decided type, every literal with its value (large
tensor literals elided, their shape carried by the type annotation),
calls with their resolved result types, cases with their conditions
and bodies, instances with their watched sets and replacements. the
abstract tree actualizes two ways: prettyToDom builds real dom nodes
(styled by the pt-* classes), and prettyToText renders it as an
indented text tree for the console.

    console.log(prettyToText(prettyPrint(simplify(parse("2*x + 1", [], ["x"])))))

    plus : float
    ├─ multiply : float
    │  ├─ 2 : float
    │  └─ x : float
    └─ 1 : float

options: { locations: true } appends each node's source span,
{ elideTensorsAbove: n } sets the leaf count past which a tensor
literal's contents elide (default 8). */

import { numberType } from "./types/index.js";

/* the value of a literal, readably. the value classes are read by
their fields (Rational's num/den, Complex's re/im, ModularInteger's
value and modulus, the hypercomplex components); tensors nest, and
elide past the threshold. */

function countLeaves(value) {
    return Array.isArray(value)
        ? value.reduce((sum, sub) => sum + countLeaves(sub), 0)
        : 1;
}

function formatScalar(value) {
    if (typeof value === "bigint") {
        return String(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    // Rational
    if (value.num !== undefined && value.den !== undefined) {
        return value.den === 1n ? String(value.num) : `${value.num}/${value.den}`;
    }

    // ModularInteger
    if (value.modulus !== undefined && value.value !== undefined) {
        return `${value.value} (mod ${value.modulus})`;
    }

    // Complex
    if (value.re !== undefined && value.im !== undefined) {
        if (value.im === 0) {
            return String(value.re);
        }

        const imaginary = value.im === 1 ? "i" : value.im === -1 ? "-i" : `${value.im}i`;

        return value.re === 0
            ? imaginary
            : value.im < 0
              ? `${value.re} - ${imaginary.slice(1)}`
              : `${value.re} + ${imaginary}`;
    }

    // Quaternion
    if (value.w !== undefined) {
        const parts = [];
        const push = (component, unit) => {
            if (component !== 0) {
                parts.push(
                    `${parts.length && component >= 0 ? "+ " : ""}${component}${unit}`
                );
            }
        };

        push(value.w, "");
        push(value.x, "i");
        push(value.y, "j");
        push(value.z, "k");

        return parts.length ? parts.join(" ") : "0";
    }

    // Octonion
    if (value.components !== undefined) {
        return `(${value.components.join(", ")})`;
    }

    return String(value);
}

function formatValue(value, elideAbove) {
    if (!Array.isArray(value)) {
        return formatScalar(value);
    }

    if (countLeaves(value) > elideAbove) {
        return "[…]";
    }

    return `[${value.map((sub) => formatValue(sub, elideAbove)).join(", ")}]`;
}

const span = (classes, text) => ({ tag: "span", classes, text });

const typeSpan = (type) => span(["pt-type"], ` : ${type?.name ?? "?"}`);

const locationSpan = (node) =>
    span(["pt-location"], ` [${node.index}${node.length ? ` +${node.length}` : ""}]`);

export function prettyPrint(tree, { locations = false, elideTensorsAbove = 8 } = {}) {
    const node = (classes, header, children = []) => ({
        tag: "div",
        classes: ["pt-node", ...classes],
        children: [
            ...header,
            ...(locations ? [locationSpan(tree)] : []),
            ...children,
        ],
    });

    switch (tree.type) {
        case "number": {
            const type = numberType(tree);
            const text = formatValue(tree.value, elideTensorsAbove);

            return node(
                ["pt-number"],
                [
                    span(["pt-value"], text),
                    /* a named constant's value is shown too: pi is
                    symbolic, but the system knows what it holds */
                    ...(tree.name !== undefined
                        ? [span(["pt-name"], ` ${tree.name}`)]
                        : []),
                    typeSpan(type),
                ]
            );
        }

        case "variable":
            return node(
                ["pt-variable"],
                [span(["pt-name"], tree.name), typeSpan(tree.valueType)]
            );

        case "function":
            return node(
                ["pt-function"],
                [span(["pt-name"], tree.name), span(["pt-type"], " (bare function)")]
            );

        case "call":
            return node(
                ["pt-call"],
                [span(["pt-name"], tree.callee.name), typeSpan(tree.callee.returns)],
                tree.arguments.map((argument) =>
                    prettyPrint(argument, { locations, elideTensorsAbove })
                )
            );

        case "convert":
            return node(
                ["pt-convert"],
                [span(["pt-name"], "convert"), typeSpan(tree.target)],
                [prettyPrint(tree.operand, { locations, elideTensorsAbove })]
            );

        case "cases":
            return node(
                ["pt-cases"],
                [span(["pt-name"], "cases"), typeSpan(tree.valueType)],
                tree.cases.map(({ condition, body }, i) => ({
                    tag: "div",
                    classes: ["pt-node", "pt-case"],
                    children: [
                        span(["pt-label"], `case ${i + 1}`),
                        {
                            tag: "div",
                            classes: ["pt-node", "pt-condition"],
                            children: [
                                span(["pt-label"], "if"),
                                prettyPrint(condition, { locations, elideTensorsAbove }),
                            ],
                        },
                        {
                            tag: "div",
                            classes: ["pt-node", "pt-body"],
                            children: [
                                span(["pt-label"], "then"),
                                prettyPrint(body, { locations, elideTensorsAbove }),
                            ],
                        },
                    ],
                }))
            );

        case "instance": {
            const header = [
                span(["pt-name"], `instance of ${tree.of.name}`),
                typeSpan(tree.valueType),
            ];

            const details = [
                {
                    tag: "div",
                    classes: ["pt-node", "pt-watched"],
                    children: [
                        span(
                            ["pt-label"],
                            tree.watched === undefined
                                ? "no assume: never expands"
                                : tree.watched.length === 0
                                  ? "actualized: unroll expands"
                                  : `watched: ${tree.watched.join(", ")}`
                        ),
                    ],
                },
                ...tree.replacements.map((replacement) => ({
                    tag: "div",
                    classes: ["pt-node", "pt-replacement"],
                    children: [
                        span(["pt-label"], `${replacement.name} :=`),
                        prettyPrint(replacement.tree, { locations, elideTensorsAbove }),
                    ],
                })),
            ];

            if (tree.ambient) {
                details.push({
                    tag: "div",
                    classes: ["pt-node", "pt-ambient"],
                    children: [
                        span(
                            ["pt-label"],
                            `ambient: ${[...tree.ambient.keys()].join(", ")}`
                        ),
                    ],
                });
            }

            return node(["pt-instance"], header, details);
        }

        case "diff": {
            const slots = [
                `wrt: ${tree.wrt ?? "?"}`,
                `f: ${tree.f ? "bound" : "?"}`,
            ].join(", ");

            return node(
                ["pt-diff"],
                [span(["pt-name"], `diff (${slots})`), typeSpan(tree.valueType)],
                tree.f
                    ? [prettyPrint(tree.f, { locations, elideTensorsAbove })]
                    : []
            );
        }

        default:
            return node(
                ["pt-unknown"],
                [span(["pt-value"], `<unknown node type '${tree.type}'>`)]
            );
    }
}

/* the abstract tree to real dom nodes. */

export function prettyToDom(node, doc = document) {
    const element = doc.createElement(node.tag);

    element.className = node.classes.join(" ");

    if (node.text !== undefined) {
        element.append(document.createTextNode(node.text));
    }

    for (const child of node.children ?? []) {
        element.append(prettyToDom(child, doc));
    }

    return element;
}

/* the abstract tree to an indented text tree. a div's spans form its
line; its div children follow, indented under it. */

function inlineText(node) {
    return (
        (node.text ?? "") +
        (node.children ?? [])
            .filter((child) => child.tag === "span")
            .map(inlineText)
            .join("")
    );
}

function textLines(node, prefix, connector, continuation) {
    const divs = (node.children ?? []).filter((child) => child.tag === "div");

    return [
        prefix + connector + inlineText(node),
        ...divs.flatMap((div, i) =>
            textLines(
                div,
                prefix + continuation,
                i === divs.length - 1 ? "└─ " : "├─ ",
                i === divs.length - 1 ? "   " : "│  "
            )
        ),
    ];
}

export function prettyToText(node) {
    return textLines(node, "", "", "").join("\n");
}
