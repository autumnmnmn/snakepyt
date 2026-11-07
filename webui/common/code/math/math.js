
$css(`
    .math-inline {
        display: inline-block;
        vertical-align: bottom;
    }

    .math-inline math {
        display: inline-block;
    }

    @supports (display: inline math) {
        .math-inline math {
            display: inline math;
            padding-bottom: 0;
        }
    }

    .math-block {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        padding-left: 0.75rem;
        padding-top: 0.5rem;
        border-left: 3px double var(--main-faded);
        max-width: 100%;
        overflow-x: auto;
    }

    .math-block math {
        display: block;
        width: fit-content;
        max-width: 100%;
    }

    .math-block math:not(last-child) {
        padding-bottom: 0.5em;
    }

    @supports (display: math) {
        .math-block math {
            display: math;
            width: max-content;
            max-width: max-content;
        }
    }
`, true);

function makeLeaf(tag, content) {
    return () => {
        const element = $mathElement(tag);
        element.textContent = content;
        return element;
    };
}

function make(node) {
    if (node.type === "group" || node.type === "annoying_group") {
        return node.make(node.children);
    }
    else if (node.type === "leaf") {
        return node.make();
    }
    else {
        throw new Error(`Node of type ${node.type} should not exist by the final make stage.`);
    }
}

function makeGroup(tag) {
    return (children) => {
        const element = $mathElement(tag);
        for (const child of children) {
            element.appendChild(make(child));
        }
        return element;
    };
}

export const greek = {
    "alpha": "α",
    "beta": "β",
    "gamma": "γ",
    "delta": "δ",
    "epsilon": "ε",
    "zeta": "ζ",
    "eta": "η",
    "theta": "θ",
    "iota": "ι",
    "kappa": "κ",
    "lambda": "λ",
    "mu": "μ",
    "nu": "ν",
    "xi": "ξ",
    "omicron": "ο",
    "pi": "π",
    "rho": "ρ",
    "sigma": "σ",
    "tau": "τ",
    "upsilon": "υ",
    "phi": "ϕ",
    "curlyphi": "φ",
    "chi": "χ",
    "psi": "ψ",
    "omega": "ω",

    "Alpha": "Α",
    "Beta": "Β",
    "Gamma": "Γ",
    "Delta": "Δ",
    "Epsilon": "Ε",
    "Zeta": "Ζ",
    "Eta": "Η",
    "Theta": "Θ",
    "Iota": "Ι",
    "Kappa": "Κ",
    "Lambda": "Λ",
    "Mu": "Μ",
    "Nu": "Ν",
    "Xi": "Ξ",
    "Omicron": "Ο",
    "Pi": "Π",
    "Rho": "Ρ",
    "Sigma": "Σ",
    "Tau": "Τ",
    "Upsilon": "Υ",
    "Phi": "Φ",
    "Chi": "Χ",
    "Psi": "Ψ",
    "Omega": "Ω"
};

const commonIdents = {
    "inf": "∞"
}

const commonOps = {
    "interpunct": "·"
};

const autoOps = {
    "+": "+",
    "-": "−",
    "posneg": "±",
    "dot": commonOps.interpunct, // * on the keyboard, · on the screen
    "cross": "×",
    "div": "÷",
    "=": "=",
    "defineeq": "≔",
    "<": "<",
    ">": ">",
    "<=": "≤",
    ">=": "≥",
    "!=": "≠",
    "kindaeq": "≈",
    "(": "(",
    ")": ")",
    "[": "[",
    "]": "]",
    ",": ",",
    ";": ";",
    ":": ":",
    "!": "!",
    "|": "|",
    "arrowr": "→",
    "in": "∈",
    "!in": "∉",
    "union": "∪",
    "intersect": "∩",
    "subset": "⊂",
    "strictsubset": "⊆",
    "empty": "∅",
    "diff": "∂",
    "sum": "∑",
    "product": "∏",
    "...": "…",
    "'": "′"
};

const rowOpeners = {
    "{": "mrow",
    "underover{": "munderover",
    "under{": "munder"
};

const whitespace = /\s/;
const numeric = /[\d.]/;
const hasNumber = /\d/;
const alphabet = /[a-zA-Z]/;

function tokenize(expression, declarations, isAuto) {
    const tokens = [];
    let current = "";
    let i = 0;

    function token(source) {
        let result;
        if (hasNumber.test(source)) {
            result = declarations["_auto_numeric"](source);
        } else {
            result = declarations[source];
        }
        if (!result) {
            if (!isAuto) throw new Error(`Undeclared token "${source}"`);

            result = declarations["_auto_ident"](source);
        }
        tokens.push(result);
    }

    while (i < expression.length) {
        const char = expression[i];
        const begun = current !== "";

        if (whitespace.test(char)) {
            if (begun) token(current);
            current = "";
        } else if (alphabet.test(char)) {
            if (begun && !alphabet.test(current[current.length - 1])) {
                token(current);
                current = char;
            } else {
                current += char;
            }
        } else if (numeric.test(char)) {
            if (begun && !numeric.test(current[current.length - 1])) {
                token(current);
                current = char;
            } else {
                current += char;
            }
        } else {
            if (begun) {
                if (char === "{" && declarations[current + char]) {
                    token(current + char);
                } else {
                    token(current);
                    token(char);
                }
            } else {
                token(char);
            }
            current = "";
        }
        i++;
    }

    if (current !== "") token(current);

    return tokens;
}

const allModifiers = new Set(["block", "manual"])

export const staticModule = true;

const cache = new Map();

export async function main(expression, inline=true) {
    const trimmed = expression.trim();

    const cache_hit = cache.get(trimmed);
    if (cache_hit !== undefined) return {
        ...cache_hit,
        dom: cache_hit.dom.map(element => element.cloneNode(true))
    };

    const lines = trimmed.split("\n");
    const mathContent = [];

    let idents = {};
    const texts = {};
    let ops = {};
    const contentLines = [];

    let isInline = true;
    let isAuto = true;

    let contentStarted = false;
    for (const line of lines) {
        if (contentStarted) {
            contentLines.push(line);
            continue;
        }
        const trimmed = line.trim();
        if (trimmed === "in") {
            contentStarted = true;
            continue;
        }

        const words = line.split(/\s+/);

        while (words.length && allModifiers.has(words[0])) {
            const modifier = words.shift();

            if (modifier === "block") isInline = false;
            if (modifier === "manual") isAuto = false;
        }

        const rest = words.join(" ");

        if (isAuto) {
            contentStarted = true;
            if (rest) contentLines.push(rest);
            continue;
        }

        if (trimmed.startsWith("ident ")) {
            const declarations = trimmed.split(' ').filter(_=>_).slice(1);

            for (const declaration of declarations) {
                const splitAt = declaration.indexOf(':');

                if (splitAt === -1) {
                    idents[declaration] = declaration;
                } else {
                    const key = declaration.slice(0, splitAt);
                    const value = declaration.slice(splitAt + 1);

                    idents[key] = value === '~' ? greek[key] : value;
                }
            }
        }

        if (trimmed.startsWith("op ")) {
            const declarations = trimmed.split(' ').filter(_=>_).slice(1);

            for (const declaration of declarations) {
                const splitAt = declaration.indexOf(':');

                if (splitAt === -1) {
                    ops[declaration] = declaration;
                } else {
                    const key = declaration.slice(0, splitAt);
                    const value = declaration.slice(splitAt + 1);

                    ops[key] = value.startsWith("$") ? commonOps[value.slice(1)] : value;
                }
            }
        }

        if (trimmed.startsWith("text ")) {
            const declarations = trimmed.slice(5);
            let i = 0;

            while (i < declarations.length) {
                const splitAt = declarations.indexOf(':', i);
                if (splitAt === -1) break;

                const key = declarations.slice(i, splitAt);
                i = splitAt + 1;

                if (i >= declarations.length) break;

                let value;
                if (declarations[i] === '~') {
                    value = key;
                    i += 1;
                } else if (declarations[i] === '"') {
                    i += 1;
                    const closingQuote = declarations.indexOf('"', i);
                    if (closingQuote === -1) {
                        console.error(`Unclosed quote in text declarations: ${declarations}`);
                        break;
                    }
                    value = declarations.slice(i, closingQuote);
                    i = closingQuote + 1;
                } else {
                    console.error(`Invalid declaration for text ${key}: ${declarations}`);
                    break;
                }

                texts[key] = value;

                while (i < declarations.length && declarations[i] === " ") {
                    i += 1;
                }
            }
        }

    }

    const declaredTokens = {
        "^": { type: "infix", make: makeGroup("msup") },
        "_": { type: "infix", make: makeGroup("msub") },
        "/": { type: "infix", make: makeGroup("mfrac") },
        "root": { type: "infix", make: makeGroup("mroot") },
        "}": { type: "row_end" },
        "_auto_numeric": n => ({ type: "leaf", make: makeLeaf("mn", n) }),
        "_auto_ident": content => ({ type: "leaf", make: makeLeaf("mi", content) })
    };

    for (const opener in rowOpeners) {
        declaredTokens[opener] = { type: "row_begin", make: makeGroup(rowOpeners[opener]) };
    }

    if (isAuto) {
        ops = { ...autoOps, ...ops };
        idents = { ...greek, ...commonIdents, ...idents };
    }

    for (const ident in idents) {
        declaredTokens[ident] = { type: "leaf", make: makeLeaf("mi", idents[ident]) };
    }
    for (const op in ops) {
        const leaf = { type: "leaf", make: makeLeaf("mo", ops[op]) };
        if (op === "(") {
            declaredTokens[op] = { type: "row_begin", make: makeGroup("mrow"), children: [leaf] };
        } else if (op === ")") {
            declaredTokens[op] = { type: "row_end", children: [leaf] };
        } else if (op === "|") {
            declaredTokens[op] = { type: "annoying", make: makeGroup("mrow"), children: [leaf] };
        } else {
            declaredTokens[op] = leaf;
        }
    }
    for (const text in texts) {
        declaredTokens[text] = { type: "leaf", make: makeLeaf("mtext", texts[text]) };
    }

    for (const [index, line] of contentLines.entries()) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const tokens = tokenize(trimmed, declaredTokens, isAuto);

        const root = { type: "group", make: makeGroup("math"), children: [] };
        const groupStack = [root];
        for (const token of tokens) {
            if (token.type === "row_begin") {
                groupStack.push({
                    type: "group",
                    make: token.make,
                    children: [...(token.children ?? [])]
                });
            }
            else if (token.type === "row_end") {
                const row = groupStack.pop();
                row.children.push(...(token.children ?? []));
                groupStack[groupStack.length - 1].children.push(row);
            }
            else if (token.type === "annoying") {
                const row = groupStack.at(-1);
                console.log(row);
                if (row.type === "annoying_group") {
                    console.log("here");
                    const r = groupStack.pop();
                    r.children.push(...(token.children ?? []));
                    groupStack[groupStack.length - 1].children.push(r);
                }
                else {
                    console.log("there");
                    groupStack.push({
                        type: "annoying_group",
                        make: token.make,
                        children: [...(token.children ?? [])]
                    });
                }
            }
            else {
                groupStack[groupStack.length - 1].children.push(token);
            }
        }

        while (groupStack.length > 0) {
            const node = groupStack.pop();
            const modified = [];

            let i = 0;
            for (; i <= node.children.length - 3; i++) {
                const [left, middle, right] = [node.children[i], node.children[i + 1], node.children[i + 2]];
                if (middle.type === "infix") {
                    const newGroup = { type: "group", make: middle.make, children: [left, right] };
                    modified.push(newGroup);
                    groupStack.push(newGroup);
                    i += 2;
                }
                else {
                    modified.push(left);
                    if (left.type === "group" || left.type === "annoying_group") groupStack.push(left);
                }
            }
            for (; i < node.children.length; i++) {
                modified.push(node.children[i]);
                if (node.children[i].type === "group" || node.children[i].type === "annoying_group") groupStack.push(node.children[i]);
            }

            node.children = modified;

        }



        mathContent.push(make(root));
        //if (index < contentLines.length - 1) {
        //    mathContent.push($element("br"));
        //}
    }

    // TODO clean this up: no longer using "math-inline" for inline
    const container = $element(isInline ? "span" : "div");

    container.className = isInline ? "math-inline" : "math-block";

    const content = isInline ? mathContent : [container.$with(...mathContent)];

    const result = { dom: content, inline: isInline };

    cache.set(trimmed, result);

    return {
        ...result,
        dom: result.dom.map(element => element.cloneNode(true))
    };
}

