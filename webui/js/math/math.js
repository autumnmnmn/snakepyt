
function makeLeaf(tag, content) {
    return () => {
        const element = $mathElement(tag);
        element.textContent = content;
        return element;
    };
}

function make(node) {
    if (node.type === "group") {
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
    "omega": "ω"
}; // TODO: capital letters

const commonOps = {
    "interpunct": "·"
};

const whitespace = /\s/;
const numeric = /[\d.,]/;
const alphabet = /[a-zA-Z]/;

function tokenize(expression, declarations) {
    const tokens = [];
    let current = "";
    let i = 0;

    function token(source) {
        let result;
        if (numeric.test(source[0])) {
            result = declarations["numeric"](source)
        } else {
            result = declarations[source];
        }
        if (!result) throw new Error(`Undeclared token "${source}"`);
        tokens.push(result);
    }

    while (i < expression.length) {
        const char = expression[i];
        const begun = current !== "";

        if (/\s/.test(char)) {
            if (begun) token(current);
            current = "";
        } else if (alphabet.test(char)) {
            if (begun && !alphabet.test(current[current.length - 1])) {
                token(current);
                current = char;
            } else {
                current += char;
            }
        } else if (numeric.test(char)) { // numerics
            if (begun && !numeric.test(current[current.length - 1])) {
                token(current);
                current = char;
            } else {
                current += char;
            }
        } else {
            if (begun) token(current);
            token(char);
            current = "";
        }
        i++;
    }

    if (current !== "") token(current);

    return tokens;
}

export async function main(target, expression) {

    const lines = expression.trim().split("\n");

    const idents = {};
    const texts = {};
    const ops = {};
    const contentLines = [];

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

        // Claude's work, not fully reviewed
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
        "{": { type: "row_begin" },
        "}": { type: "row_end" },
        "numeric": n => ({ type: "leaf", make: makeLeaf("mn", n) })
    };

    for (const ident in idents) {
        declaredTokens[ident] = { type: "leaf", make: makeLeaf("mi", idents[ident]) };
    }
    for (const op in ops) {
        declaredTokens[op] = { type: "leaf", make: makeLeaf("mo", ops[op]) };
    }
    for (const text in texts) {
        declaredTokens[text] = { type: "leaf", make: makeLeaf("mtext", texts[text]) };
    }

    for (const line of contentLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const tokens = tokenize(trimmed, declaredTokens);

        const root = { type: "group", make: makeGroup("math"), children: [] };
        const groupStack = [root];
        for (const token of tokens) {
            if (token.type === "row_begin") {
                groupStack.push({ type: "group", make: makeGroup("mrow"), children: [] });
            }
            else if (token.type === "row_end") {
                const row = groupStack.pop();
                groupStack[groupStack.length - 1].children.push(row);
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
                    if (left.type === "group") groupStack.push(left);
                }
            }
            for (; i < node.children.length; i++) {
                modified.push(node.children[i]);
                if (node.children[i].type === "group") groupStack.push(node.children[i]);
            }

            node.children = modified;

        }

        target.appendChild(make(root));
    }
}

