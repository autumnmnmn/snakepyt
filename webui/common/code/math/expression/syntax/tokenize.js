/* tokenize

source text to tokens. punctuation is this module's own; the operator
spellings come from the function definitions (operations/): a
binary operator's token type is its function's name, and a prefix-only
operator no binary claims ("!") takes its function's name too. a
spelling shared by a binary and a prefix operator ("-" is minus and
negate) tokenizes as the binary's type; ast.js maps it to the prefix
node when it appears in prefix position.

beyond expressions, the tokenizer knows the definition syntax's own
marks: := ; { }, and // line comments, which it swallows whole. "//"
is claimed before the operator table sees "/", so a // b is a
comment, not a misplaced division — write a / b with spaces like
everyone else. a number literal eats its decimal point whole, so
`2.{ x := 3 }` reads as the number 2. followed by a brace — which the
parser reads as a with on 2 (and fill refuses it: a number has no
variables to replace). an "i" directly after a number literal makes
it imaginary (2i, 2.5i, 1e3i), claimed only when it does not begin
an identifier (2if stays the number 2 followed by "if"). */

import { definitions } from "../operations/index.js";
import { locateError } from "./locate.js";

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
    ":=": "define",
    ";": "semicolon",
    "{": "left_brace",
    "}": "right_brace",
};

const operatorTokens = {};

for (const definition of Object.values(definitions)) {
    if (definition.syntax?.binary) {
        operatorTokens[definition.syntax.symbol] = definition.name;
    }
}

for (const definition of Object.values(definitions)) {
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
    try {
        return tokenizeText(source);
    } catch (error) {
        throw locateError(error, source);
    }
}

function tokenizeText(source) {
    const tokens = [];

    let index = 0;

    while (index < source.length) {
        const char = source[index];

        if (isWhitespace.test(char)) {
            index++;
            continue;
        }

        // a line comment runs to the end of the line
        if (char === "/" && source[index + 1] === "/") {
            while (index < source.length && source[index] !== "\n") {
                index++;
            }

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

            /* an "i" directly after the literal makes it imaginary —
            claimed only when it does not begin an identifier (2if
            stays the number 2 followed by "if") */
            let imaginary = false;

            if (
                source[index] === "i" &&
                !isIdentifierChar.test(source[index + 1] ?? "")
            ) {
                imaginary = true;
                index++;
            }

            tokens.push({
                type: "number",
                index: start,
                length: index - start,
                ...(imaginary ? { imaginary: true } : {}),
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
