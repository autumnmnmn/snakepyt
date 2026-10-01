/* tokenize

source text to tokens. punctuation is this module's own; the operator
spellings come from the function definitions (definitions.js): a
binary operator's token type is its function's name, and a prefix-only
operator no binary claims ("!") takes its function's name too. a
spelling shared by a binary and a prefix operator ("-" is minus and
negate) tokenizes as the binary's type; ast.js maps it to the prefix
node when it appears in prefix position. */

import { definitions } from "./definitions.js";

const isWhitespace = /\s/;
const isDigit = /[0-9]/;
const isDigitOrDot = /[0-9.]/;
const isIdentifierStart = /[a-zA-Z_]/;
const isIdentifierChar = /[a-zA-Z0-9_]/;

const punctuation = {
    "?": "question",
    ":": "colon",
    "(": "left_paren",
    ")": "right_paren",
    "|": "vertical_bar",
    ",": "comma",
};

const operatorTokens = {};

for (const definition of definitions) {
    if (definition.syntax?.binary) {
        operatorTokens[definition.syntax.symbol] = definition.name;
    }
}

for (const definition of definitions) {
    if (
        definition.syntax?.prefix &&
        !(definition.syntax.symbol in operatorTokens)
    ) {
        operatorTokens[definition.syntax.symbol] = definition.name;
    }
}

export const operators = { ...punctuation, ...operatorTokens };

const operatorKeys = Object.keys(operators).sort((a, b) => b.length - a.length);

// the inverse of `operators`, for spelling a token type in an error message
const operatorTypes = Object.fromEntries(
    Object.entries(operators).map(([symbol, type]) => [type, symbol])
);

export function symbolForOperator(type) {
    return operatorTypes[type] ?? type;
}

export function tokenize(source) {
    const tokens = [];

    let index = 0;

    while (index < source.length) {
        const char = source[index];

        if (isWhitespace.test(char)) {
            index++;
            continue;
        }

        if (isDigit.test(char)) {
            const start = index;
            let dots = 0;

            while (index < source.length && isDigitOrDot.test(source[index])) {
                if (source[index] === ".") {
                    dots++;
                }

                index++;
            }

            if (dots > 1) {
                throw new SyntaxError(
                    `Invalid number literal '${source.slice(start, index)}' at index ${start}`
                );
            }

            if (source[index] === "e" || source[index] === "E") {
                index++;

                if (source[index] === "+" || source[index] === "-") {
                    index++;
                }

                const exponentStart = index;

                while (index < source.length && isDigit.test(source[index])) {
                    index++;
                }

                if (index === exponentStart) {
                    throw new SyntaxError(`Invalid exponent at index ${index}`);
                }
            }

            tokens.push({
                type: "number",
                index: start,
                length: index - start
            });

            continue;
        }

        if (isIdentifierStart.test(char)) {
            const start = index++;

            while (index < source.length && isIdentifierChar.test(source[index])) {
                index++;
            }

            tokens.push({
                type: "identifier",
                index: start,
                length: index - start,
            });

            continue;
        }

        let matchedOperator = null;

        for (const symbol of operatorKeys) {
            if (source.startsWith(symbol, index)) {
                matchedOperator = symbol;
                break;
            }
        }

        if (matchedOperator !== null) {
            tokens.push({
                type: operators[matchedOperator],
                index: index,
                length: matchedOperator.length,
            });

            index += matchedOperator.length;
            continue;
        }

        throw new SyntaxError(`Unexpected character '${char}' at index ${index}`);
    }

    return tokens;
}
