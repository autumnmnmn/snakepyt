
// Courtesy of Claude :)

import * as cssTokenizer from "/code/css_tokenizer.js";

const keywords = new Set([
    "abstract", "arguments", "await", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "debugger", "default", "delete", "do",
    "double", "else", "enum", "eval", "export", "extends", "false", "final",
    "finally", "float", "for", "function", "goto", "if", "implements", "import",
    "in", "instanceof", "int", "interface", "let", "long", "native", "new",
    "null", "package", "private", "protected", "public", "return", "short",
    "static", "super", "switch", "synchronized", "this", "throw", "throws",
    "transient", "true", "try", "typeof", "var", "void", "volatile", "while",
    "with", "yield", "async", "of"
]);

const builtins = new Set([
    "console", "window", "document", "Array", "Object", "String", "Number",
    "Boolean", "Date", "RegExp", "Math", "JSON", "parseInt", "parseFloat",
    "isNaN", "isFinite", "undefined", "NaN", "Infinity", "Promise", "Set",
    "Map", "WeakSet", "WeakMap", "Symbol", "Proxy", "Reflect"
]);

const operators = new Set([
    "+", "-", "*", "/", "%", "**", "++", "--", "=", "+=", "-=", "*=", "/=", "%=",
    "**=", "==", "===", "!=", "!==", "<", ">", "<=", ">=", "&&", "||", "!",
    "&", "|", "^", "~", "<<", ">>", ">>>", "?", ":", "=>", "...", "??", "??=",
    "&&=", "||=", "&=", "|=", "^=", "<<=", ">>=", ">>>="
]);

export function tokenize(code) {
    const tokens = [];
    let i = 0;

    while (i < code.length) {
        const char = code[i];

        // Whitespace
        if (/\s/.test(char)) {
            const start = i;
            while (i < code.length && /\s/.test(code[i])) i++;
            tokens.push({ type: "whitespace", value: code.slice(start, i) });
            continue;
        }

        // Single-line comment
        if (char === '/' && code[i + 1] === '/') {
            const start = i;
            while (i < code.length && code[i] !== '\n') i++;
            tokens.push({ type: "comment", value: code.slice(start, i) });
            continue;
        }

        // Multi-line comment
        if (char === '/' && code[i + 1] === '*') {
            const start = i;
            i += 2;
            while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
            if (i < code.length - 1) i += 2;
            tokens.push({ type: "comment", value: code.slice(start, i) });
            continue;
        }

        // Template literals
        if (char === '`') {
            const templateTokens = tokenizeTemplateLiteral(code, i);
            tokens.push(...templateTokens.tokens);
            i = templateTokens.newIndex;
            continue;
        }

        // Strings
        if (char === '"' || char === '\'') {
            const stringToken = tokenizeString(code, i, char);
            tokens.push(stringToken.token);
            i = stringToken.newIndex;
            continue;
        }

        // Regular expressions
        if (char === '/' && isRegexContext(tokens)) {
            const regexToken = tokenizeRegex(code, i);
            if (regexToken) {
                tokens.push(regexToken.token);
                i = regexToken.newIndex;
                continue;
            }
        }

        // Numbers
        if (/\d/.test(char) || (char === '.' && /\d/.test(code[i + 1]))) {
            const numberToken = tokenizeNumber(code, i);
            tokens.push(numberToken.token);
            i = numberToken.newIndex;
            continue;
        }

        // Identifiers and keywords
        if (/[a-zA-Z_$]/.test(char)) {
            const identifierToken = tokenizeIdentifier(code, i);
            tokens.push(identifierToken.token);
            i = identifierToken.newIndex;
            continue;
        }

        // Multi-character operators
        const twoChar = code.slice(i, i + 2);
        const threeChar = code.slice(i, i + 3);

        if (operators.has(threeChar)) {
            tokens.push({ type: "operator", value: threeChar });
            i += 3;
            continue;
        }

        if (operators.has(twoChar)) {
            tokens.push({ type: "operator", value: twoChar });
            i += 2;
            continue;
        }

        // Single-character operators and punctuation
        if (operators.has(char)) {
            tokens.push({ type: "operator", value: char });
            i++;
            continue;
        }

        if ("{}[]().,;".includes(char)) {
            tokens.push({ type: "punctuation", value: char });
            i++;
            continue;
        }

        // Unknown character
        tokens.push({ type: "unknown", value: char });
        i++;
    }

    return tokens;
}

function tokenizeTemplateLiteral(code, start) {
    const tokens = [];
    let i = start;
    let current = "";

    // Opening backtick
    current += code[i++];

    // Check for CSS string
    const remainingCode = code.slice(i);
    if (remainingCode.startsWith("/* css */")) {
        // Find the closing quote
        let j = i;
        while (j < code.length && code[j] !== '`') {
            if (code[j] === '\\') j += 2;
            else j++;
        }

        if (j < code.length) {
            const cssContent = code.slice(i + 9, j); // Skip "/* css */"
            const cssTokens = cssTokenizer.tokenize(cssContent);

            // Create a compound token for the CSS string
            current += code.slice(i, j + 1);
            return {
                tokens: [{
                    type: "css-string",
                    value: current,
                    cssTokens
                }],
                newIndex: j + 1
            };
        }
    }


    while (i < code.length) {
        const char = code[i];

        if (char === '`') {
            current += char;
            tokens.push({ type: "template-literal", value: current });
            i++;
            break;
        }

        if (char === '$' && code[i + 1] === '{') {
            if (current) {
                tokens.push({ type: "template-literal", value: current });
            }

            // Find matching closing brace
            let braceCount = 1;
            let j = i + 2;
            while (j < code.length && braceCount > 0) {
                if (code[j] === '{') braceCount++;
                else if (code[j] === '}') braceCount--;
                j++;
            }

            const expression = code.slice(i, j);
            tokens.push({ type: "template-expression", value: expression });
            i = j;
            current = "";
            continue;
        }

        if (char === '\\') {
            current += char;
            i++;
            if (i < code.length) {
                current += code[i];
                i++;
            }
            continue;
        }

        current += char;
        i++;
    }

    return { tokens, newIndex: i };
}

function tokenizeString(code, start, quote) {
    let i = start;
    let value = "";

    value += code[i++]; // Opening quote

    // Check for CSS string
    const remainingCode = code.slice(i);
    if (remainingCode.startsWith("/* css */")) {
        // Find the closing quote
        let j = i;
        while (j < code.length && code[j] !== quote) {
            if (code[j] === '\\') j += 2;
            else j++;
        }

        if (j < code.length) {
            const cssContent = code.slice(i + 9, j); // Skip "/* css */"
            const cssTokens = cssTokenizer.tokenize(cssContent);

            // Create a compound token for the CSS string
            value += code.slice(i, j + 1);
            return {
                token: {
                    type: "css-string",
                    value,
                    cssTokens
                },
                newIndex: j + 1
            };
        }
    }


    while (i < code.length) {
        const char = code[i];

        if (char === quote) {
            value += char;
            i++;
            break;
        }

        if (char === "\\") {
            value += char;
            i++;
            if (i < code.length) {
                value += code[i];
                i++;
            }
            continue;
        }

        value += char;
        i++;
    }

    return { token: { type: "string", value }, newIndex: i };
}

function tokenizeRegex(code, start) {
    let i = start + 1; // Skip opening /
    let value = "/";

    while (i < code.length) {
        const char = code[i];

        if (char === '/') {
            value += char;
            i++;

            // Parse flags
            while (i < code.length && /[gimsuvy]/.test(code[i])) {
                value += code[i];
                i++;
            }

            return { token: { type: "regex", value }, newIndex: i };
        }

        if (char === '\\') {
            value += char;
            i++;
            if (i < code.length) {
                value += code[i];
                i++;
            }
            continue;
        }

        if (char === '\n') {
            return null; // Invalid regex
        }

        value += char;
        i++;
    }

    return null; // Unterminated regex
}

function tokenizeNumber(code, start) {
    let i = start;
    let value = "";

    // Handle hex numbers
    if (code[i] === '0' && (code[i + 1] === 'x' || code[i + 1] === 'X')) {
        value += code[i++];
        value += code[i++];
        while (i < code.length && /[0-9a-fA-F]/.test(code[i])) {
            value += code[i++];
        }
        return { token: { type: "number", value }, newIndex: i };
    }

    // Handle decimal numbers
    let hasDecimal = false;
    while (i < code.length && (/\d/.test(code[i]) || (code[i] === '.' && !hasDecimal))) {
        if (code[i] === '.') hasDecimal = true;
        value += code[i++];
    }

    // Handle scientific notation
    if (i < code.length && (code[i] === 'e' || code[i] === 'E')) {
        value += code[i++];
        if (i < code.length && (code[i] === '+' || code[i] === '-')) {
            value += code[i++];
        }
        while (i < code.length && /\d/.test(code[i])) {
            value += code[i++];
        }
    }

    return { token: { type: "number", value }, newIndex: i };
}

function tokenizeIdentifier(code, start) {
    let i = start;
    let value = "";

    while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i])) {
        value += code[i++];
    }

    let type = "identifier";
    if (keywords.has(value)) type = "keyword";
    else if (builtins.has(value)) type = "builtin";

    return { token: { type, value }, newIndex: i };
}

function isRegexContext(tokens) {
    // Look at the last non-whitespace token to determine if / starts a regex
    for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        if (token.type === "whitespace") continue;

        // Regex is likely after these tokens
        if (["operator", "keyword", "punctuation"].includes(token.type)) {
            if (token.value === ')' || token.value === ']') return false;
            return true;
        }

        // Not a regex after identifiers or numbers
        if (["identifier", "number"].includes(token.type)) return false;

        break;
    }

    return true; // Default to regex at start of input
}

