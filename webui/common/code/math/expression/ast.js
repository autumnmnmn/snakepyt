/* c-like precedence: the ternary sits below every binary operator
(and parses its branches itself, below), then the logical operators,
equality, relational, and the arithmetic operators as they were.

the operator tables derive from the function definitions
(definitions.js): each binary operator's precedence and associativity
is its function's `syntax.binary`, and each prefix operator parses to
its function's node type at `syntax.prefix`'s precedence. the token
type a prefix spelling arrives as is whatever tokenize assigned — a
spelling shared with a binary operator ("-", "+") tokenizes as the
binary's type, and maps here to the prefix function's node. */

import { operators, symbolForOperator } from "./tokenize.js";
import { definitions } from "./definitions.js";

const ternaryPrecedence = 2;

export const binaryOperators = {};

for (const definition of definitions) {
    if (definition.syntax?.binary) {
        binaryOperators[definition.name] = definition.syntax.binary;
    }
}

const prefixOperators = {};

for (const definition of definitions) {
    if (definition.syntax?.prefix) {
        prefixOperators[operators[definition.syntax.symbol]] = {
            node: definition.name,
            precedence: definition.syntax.prefix.precedence,
        };
    }
}

/* buildTree(tokens, source?) — tokens to syntax tree. `source` is the
text the tokens came from; it is used only to quote the offending text
in error messages, which point at source indices throughout. */

export function buildTree(tokens, source) {
    let position = 0;

    const endOfInput = tokens.length
        ? tokens[tokens.length - 1].index + tokens[tokens.length - 1].length
        : 0;

    function current() {
        return tokens[position];
    }

    function spelling(token) {
        if (source !== undefined) {
            return `'${source.slice(token.index, token.index + token.length)}'`;
        }

        return `'${symbolForOperator(token.type)}'`;
    }

    function consume(type) {
        const token = current();

        if (!token) {
            throw new SyntaxError(
                `Expected '${symbolForOperator(type)}' but the expression ends at index ${endOfInput}`
            );
        }

        if (token.type !== type) {
            throw new SyntaxError(
                `Expected '${symbolForOperator(type)}' at index ${token.index}, got ${spelling(token)} instead`
            );
        }

        position++;
        return token;
    }

    function makeNode(type, index, end, fields = {}) {
        return {
            type,
            index,
            length: end - index,
            ...fields,
        };
    }

    function parseExpression(minPrecedence = 0) {
        let left = parsePrefix();

        while (true) {
            const operator = current();

            if (operator?.type === "question") {
                if (ternaryPrecedence < minPrecedence) {
                    break;
                }

                return parseTernary(left);
            }

            const info = operator && binaryOperators[operator.type];

            if (!info || info.precedence < minPrecedence) {
                break;
            }

            position++;

            const nextPrecedence =
                info.associativity === "left"
                    ? info.precedence + 1
                    : info.precedence;

            const right = parseExpression(nextPrecedence);

            left = makeNode(
                operator.type,
                left.index,
                right.index + right.length,
                {
                    left,
                    right,
                }
            );
        }

        return left;
    }

    /* condition ? then : else — right-associative, and the middle
    branch is a full expression (a ? b ? c : d : e nests as in c). */

    function parseTernary(condition) {
        consume("question");

        const then = parseExpression();

        consume("colon");

        const otherwise = parseExpression(ternaryPrecedence);

        return makeNode(
            "ternary",
            condition.index,
            otherwise.index + otherwise.length,
            {
                condition,
                then,
                else: otherwise,
            }
        );
    }

    function parsePrefix() {
        const token = current();

        if (!token) {
            throw new SyntaxError(
                `The expression ends unexpectedly at index ${endOfInput}`
            );
        }

        switch (token.type) {
            case "number": {
                position++;

                return makeNode(
                    "number",
                    token.index,
                    token.index + token.length
                );
            }

            case "identifier": {
                position++;

                const identifier = makeNode(
                    "identifier",
                    token.index,
                    token.index + token.length
                );

                if (current()?.type === "left_paren") {
                    return parseCall(identifier);
                }

                return identifier;
            }

            case "left_paren":
                return parseParenthesized();

            case "vertical_bar":
                return parseAbsoluteValue();
        }

        const prefix = prefixOperators[token.type];

        if (prefix) {
            position++;

            const operand = parseExpression(prefix.precedence);

            return makeNode(
                prefix.node,
                token.index,
                operand.index + operand.length,
                { operand }
            );
        }

        throw new SyntaxError(
            `Unexpected ${spelling(token)} at index ${token.index}`
        );
    }

    /* parens are grouping only — the tree already records it, so the
    node keeps its own span rather than growing to include them (a
    parenthesized literal or identifier must still read as its own
    source text downstream). */

    function parseParenthesized() {
        consume("left_paren");

        const expression = parseExpression();

        consume("right_paren");

        return expression;
    }

    function parseAbsoluteValue() {
        const open = consume("vertical_bar");

        const expression = parseExpression();

        const close = consume("vertical_bar");

        return makeNode(
            "absolute",
            open.index,
            close.index + close.length,
            {
                operand: expression,
            }
        );
    }

    function parseCall(callee) {
        consume("left_paren");

        const arguments_ = [];

        if (current()?.type !== "right_paren") {
            while (true) {
                arguments_.push(parseExpression());

                if (current()?.type !== "comma") {
                    break;
                }

                position++;
            }
        }

        const close = consume("right_paren");

        return makeNode(
            "call",
            callee.index,
            close.index + close.length,
            {
                callee,
                arguments: arguments_,
            }
        );
    }

    const tree = parseExpression();

    if (position !== tokens.length) {
        const token = current();

        throw new SyntaxError(
            `Unexpected ${spelling(token)} at index ${token.index}`
        );
    }

    return tree;
}
