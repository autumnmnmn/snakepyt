
function mathElement(tag) { return document.createElementNS("http://www.w3.org/1998/Math/MathML", tag); }

function leafMaker(tag) {
    return (content) => {
        const element = mathElement(tag);
        element.textContent = content;
        return element;
    }
}

const ident = leafMaker("mi");
const num = leafMaker("mn");
const op = leafMaker("mo");
const text = leafMaker("mtext");

const commonIdents = {
    'alpha': 'α',
    'beta': 'β',
    'gamma': 'γ',
    'delta': 'δ',
    'epsilon': 'ε',
    'zeta': 'ζ',
    'eta': 'η',
    'theta': 'θ',
    'iota': 'ι',
    'kappa': 'κ',
    'lambda': 'λ',
    'mu': 'μ',
    'nu': 'ν',
    'xi': 'ξ',
    'omicron': 'ο',
    'pi': 'π',
    'rho': 'ρ',
    'sigma': 'σ',
    'tau': 'τ',
    'upsilon': 'υ',
    'phi': 'φ',
    'chi': 'χ',
    'psi': 'ψ',
    'omega': 'ω'
}; // TODO: capital letters

const commonOps = {
    "interpunct": "·"
};

export async function main(target, expression) {
    const math = mathElement("math");

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
            const declarations = trimmed.split(" ").filter(_=>_).slice(1);

            for (const declaration of declarations) {
                const splitAt = declaration.indexOf(':');

                if (splitAt === -1) {
                    idents[declaration] = declaration;
                } else {
                    const key = declaration.slice(0, splitAt);
                    const value = declaration.slice(splitAt + 1);

                    idents[key] = value === "~" ? commonIdents[key] : value;
                }
            }
        }

        if (trimmed.startsWith("op ")) {
            const declarations = trimmed.split(" ").filter(_=>_).slice(1);

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

                while (i < declarations.length && declarations[i] === ' ') {
                    i += 1;
                }
            }
        }

    }

    console.log(idents);
    console.log(ops);
    console.log(texts);

for (const line of contentLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const tokens = tokenize(trimmed);
    const elements = parseTokens(tokens, idents, ops, texts);
    
    elements.forEach(el => math.appendChild(el));
}

function tokenize(input) {
    const tokens = [];
    let current = '';
    let i = 0;
    
    while (i < input.length) {
        const char = input[i];
        
        if (char === ' ') {
            if (current) tokens.push(current);
            current = '';
        } else if (char === '_' || char === '^') {
            if (current) tokens.push(current);
            tokens.push(char);
            current = '';
        } else if (/[a-zA-Z]/.test(char)) {
            if (current && /\d/.test(current[current.length - 1])) {
                tokens.push(current);
                current = char;
            } else {
                current += char;
            }
        } else if (/\d/.test(char)) {
            if (current && /[a-zA-Z]/.test(current[current.length - 1])) {
                tokens.push(current);
                current = char;
            } else {
                current += char;
            }
        } else {
            if (current) tokens.push(current);
            tokens.push(char);
            current = '';
        }
        i++;
    }
    
    if (current) tokens.push(current);
    return tokens.filter(t => t.length > 0);
}

function parseTokens(tokens, idents, ops, texts) {
    const elements = [];
    let i = 0;
    
    while (i < tokens.length) {
        const token = tokens[i];
        
        if (token === '_' || token === '^') {
            if (elements.length === 0) {
                console.error(`Unexpected ${token} at start of expression`);
                return elements;
            }
            
            if (i + 1 >= tokens.length) {
                console.error(`Missing argument after ${token}`);
                return elements;
            }
            
            const base = elements.pop();
            const script = createTokenElement(tokens[i + 1], idents, ops, texts);
            const container = mathElement(token === '_' ? 'msub' : 'msup');
            
            container.appendChild(base);
            container.appendChild(script);
            elements.push(container);
            i += 2;
        } else {
            elements.push(createTokenElement(token, idents, ops, texts));
            i++;
        }
    }
    
    return elements;
}

function createTokenElement(token, idents, ops, texts) {
    if (/^\d+(\.\d+)?$/.test(token)) return num(token);
    if (idents[token]) return ident(idents[token]);
    if (ops[token]) return op(ops[token]);
    if (texts[token]) return text(texts[token]);
    
    console.error(`Unknown token: ${token}`);
    return text(`[${token}?]`); // visible error in output
}

    target.appendChild(math);
}

