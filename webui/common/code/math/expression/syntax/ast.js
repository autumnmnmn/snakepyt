/* ast — tokens to syntax trees: expressions by precedence-climbing
(c-like precedence: the ternary sits below every binary operator, then
the logical operators, equality, relational, and the arithmetic
operators as they were), and whole programs of definitions.

a program is a sequence of definitions `name := body`, where a body is
either a block or a bare expression terminated by ";":

    logistic := {
        default real;       // the type undeclared variables take
        real r x;           // r and x are reals
        foo := x * (1 - x); // a named subtree, inlined at its uses
        r * foo             // everything after the final ";" is the
    }                       // expression (one trailing ";" is allowed)

    autologistic := r * x * (1 - x);   // no block, no declarations

every `:=` takes the same choice of body — a bare expression or a
block — at every level: a definition's, a local's inside a block
(`foo := { ... }` above would scope its own declarations and locals),
and a replacement's in a with or diff block. a bare expression with
no definition statement parses as the single
definition `expr := ...` (buildTree returns its body, for the
one-expression callers). declarations and local definitions belong to
their block; the semantics — what the type names mean, how locals
fill — are fill's (semantics/fill.js).

the operator tables derive from the function definitions
(operations/): each binary operator's precedence and associativity
is its function's `syntax.binary`, and each prefix operator parses to
its function's node type at `syntax.prefix`'s precedence. the token
type a prefix spelling arrives as is whatever tokenize assigned — a
spelling shared with a binary operator ("-", "+") tokenizes as the
binary's type, and maps here to the prefix function's node. above
every binary operator sits the with operator (`f { b := 3 }` — a "{"
directly after an expression can only ever be a with block, so it
needs no mark of its own), a postfix operator attaching a subtree
with some of its variables replaced. blocks also carry the
`assume NAME is STATE when NAME is STATE;` statements, the
analysis-state assumptions. */

import { operators, symbolForOperator } from "./tokenize.js";
import { locateError } from "./locate.js";
import { definitions } from "../operations/index.js";

const ternaryPrecedence = 2;

export const binaryOperators = {};

for (const definition of Object.values(definitions)) {
    if (definition.syntax?.binary) {
        binaryOperators[definition.name] = definition.syntax.binary;
    }
}

const prefixOperators = {};

for (const definition of Object.values(definitions)) {
    if (definition.syntax?.prefix) {
        prefixOperators[operators[definition.syntax.symbol]] = {
            node: definition.name,
            precedence: definition.syntax.prefix.precedence,
        };
    }
}

/* buildProgram(tokens, source?) — tokens to a program: a list of
definitions. `source` is the text the tokens came from; it is used
only to quote the offending text in error messages, which point at
source indices throughout. */

export function buildProgram(tokens, source) {
    try {
        return parseProgram(tokens, source);
    } catch (error) {
        throw locateError(error, source);
    }
}

function parseProgram(tokens, source) {
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
                `Expected '${symbolForOperator(type)}', got ${spelling(token)} instead at index ${token.index}`
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

        left = parseWith(left);

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

    /* the with operator: `subtree { name := expr; ... }` — a "{"
    directly after an expression can only ever be a with block, so
    the operator needs no mark of its own. it attaches a subtree with
    some of its variables replaced. a postfix operator binding tighter
    than every binary one: `f {b := 3}^2` is `(f {b := 3})^2`. the
    replacement block holds ";"-separated `name := expression`
    statements (a trailing ";" is optional, the empty block allowed);
    what the names may be and how the replacements apply is fill's
    business (semantics/fill.js). mind the tokenizer: a number literal
    eats its decimal point whole, so `2.{ x := 3 }` reads as the
    number 2. followed by a brace — which parses as a with on 2 (and
    fill refuses it: a number has no variables to replace). */

    /* the contextual keywords (cases, diff, assume): only readable
    when the source text accompanied the tokens. */

    const keyword = (text) => {
        const token = current();

        return (
            token?.type === "identifier" &&
            source !== undefined &&
            source.slice(token.index, token.index + token.length) === text
        );
    };

    function parseWith(left) {
        while (current()?.type === "left_brace") {
            const block = parseReplacementBlock("replaced");

            left = makeNode("with", left.index, block.close.index + block.close.length, {
                left,
                replacements: block.replacements,
            });
        }

        return left;
    }

    /* a brace block of ";"-separated `name := body` statements, each
    body an expression or a block (parseBody; a trailing ";" is
    optional, the empty block allowed): the with operator's
    replacements and the diff operator's slots share the shape.
    `what` is the verb for the duplicate-name error. */

    function parseReplacementBlock(what) {
        consume("left_brace");
        const replacements = [];
        const names = new Set();

        while (current()?.type !== "right_brace") {
            if (!current()) {
                throw new SyntaxError(
                    `Expected '}' but the input ends at index ${endOfInput}`
                );
            }

            const name = consume("identifier");
            consume("define");

            const text = source?.slice(name.index, name.index + name.length);

            if (names.has(text)) {
                throw new SyntaxError(
                    `'${text}' is ${what} twice in one block at index ${name.index}`
                );
            }

            names.add(text);

            const { end: _end, ...parsed } = parseBody();

            replacements.push({
                name: text,
                nameIndex: name.index,
                ...parsed,
            });

            /* ";" separates the statements; it may be omitted
            where the next statement's identifier (or the closing
            brace) makes the boundary unambiguous */
            if (current()?.type === "semicolon") {
                position++;
            } else if (
                current()?.type !== "right_brace" &&
                current()?.type !== "identifier"
            ) {
                consume("semicolon");
            }
        }

        const close = consume("right_brace");

        return { replacements, close };
    }

    /* diff { wrt := x; f := expression } — differentiation in the
    language. a keyword in prefix position followed by "{" (the same
    deal as `cases`); anywhere else `diff` is an ordinary
    identifier. with both slots given it differentiates at once; with
    one it defers — `diff { wrt := x }` is an operator awaiting an f,
    `diff { f := foo }` an expression awaiting its variable — and a
    with block actualizes the missing slot (fill's business). */

    function parseDiffBlock() {
        const open = consume("identifier");
        const block = parseReplacementBlock("given");

        return makeNode("diff", open.index, block.close.index + block.close.length, {
            bindings: block.replacements,
        });
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

    /* cases { condition ? body; condition ? body; ... } — a
    multi-branch conditional: each case's condition parses up to the
    "?" (so a ternary condition needs parens), each body is a full
    expression terminated by ";". the last ";" is optional, like
    everywhere else here; what the block MEANS is fill's and the
    passes' business (exactly one case must hold when evaluated). */

    function parseCasesBlock() {
        const open = consume("identifier");
        consume("left_brace");

        const cases = [];

        while (current()?.type !== "right_brace") {
            if (!current()) {
                throw new SyntaxError(
                    `Expected '}' but the input ends at index ${endOfInput}`
                );
            }

            const condition = parseExpression(ternaryPrecedence + 1);

            consume("question");

            const body = parseExpression();

            cases.push({ condition, body });

            if (current()?.type === "semicolon") {
                position++;
            } else if (current()?.type !== "right_brace") {
                consume("semicolon");
            }
        }

        const close = consume("right_brace");

        if (cases.length === 0) {
            throw new SyntaxError(
                `A cases block needs at least one case at index ${open.index}`
            );
        }

        return makeNode("cases", open.index, close.index + close.length, { cases });
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
                    token.index + token.length,
                    token.imaginary ? { imaginary: true } : {}
                );
            }

            case "identifier": {
                /* the cases and diff blocks: keywords only in
                prefix position followed by "{"; anywhere else they
                are ordinary identifiers */
                if (keyword("cases") && tokens[position + 1]?.type === "left_brace") {
                    return parseCasesBlock();
                }

                if (keyword("diff") && tokens[position + 1]?.type === "left_brace") {
                    return parseDiffBlock();
                }

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

    /* the program level: definitions and blocks. */

    /* a type name: identifier with optional <...> parameters. params
    are number literals, true/false, or nested type names. */

    function parseTypeName() {
        const token = consume("identifier");
        const params = [];

        if (current()?.type === "less") {
            position++;

            while (true) {
                const param = current();

                if (param?.type === "number") {
                    position++;
                    params.push({ kind: "number", index: param.index, length: param.length });
                } else if (param?.type === "identifier" && source !== undefined &&
                    ["true", "false"].includes(source.slice(param.index, param.index + param.length))) {
                    position++;
                    params.push({ kind: "bool", value: source.slice(param.index, param.index + param.length) === "true", index: param.index });
                } else if (param?.type === "identifier") {
                    params.push({ kind: "type", type: parseTypeName(), index: param.index });
                } else {
                    throw new SyntaxError(
                        `Expected a type parameter at index ${param?.index ?? endOfInput}`
                    );
                }

                if (current()?.type !== "comma") {
                    break;
                }

                position++;
            }

            consume("greater");
        }

        return { name: source?.slice(token.index, token.index + token.length), params, index: token.index };
    }

    /* a declaration statement: "default" typeName, or typeName with
    one or more variable names, terminated by ";". returns null (and
    restores the position) when the tokens do not parse as one — the
    block's expression starts here instead. a `<` after the opening
    identifier is genuinely ambiguous (a type's parameters or a
    comparison: `vector<3> v;` vs `n < 2 ? a : b`), so a syntax error
    anywhere in the attempt also falls back to the expression. */

    function tryParseDeclaration() {
        const saved = position;

        try {
            const declaration = parseDeclaration();

            if (declaration === null) {
                position = saved;
            }

            return declaration;
        } catch (error) {
            if (error instanceof SyntaxError) {
                position = saved;
                return null;
            }

            throw error;
        }
    }

    function parseDeclaration() {
        const token = current();

        if (token?.type !== "identifier") {
            return null;
        }

        const word = source?.slice(token.index, token.index + token.length);

        if (word === "default" && tokens[position + 1]?.type === "identifier" &&
            tokens[position + 2]?.type !== "define") {
            position++;

            const typeName = parseTypeName();

            consume("semicolon");

            return {
                type: "defaultDeclaration",
                typeName,
                index: token.index,
                length: typeName.index + (typeName.length ?? 0) - token.index,
            };
        }

        const typeName = parseTypeName();
        const names = [];

        while (current()?.type === "identifier" && tokens[position + 1]?.type !== "define") {
            const name = current();

            // an identifier followed by punctuation other than "," or
            // ";" is an expression, not a declaration
            if (!["semicolon"].includes(tokens[position + 1]?.type) &&
                tokens[position + 1]?.type !== "identifier") {
                return null;
            }

            names.push({
                name: source?.slice(name.index, name.index + name.length),
                index: name.index,
            });

            position++;
        }

        if (names.length === 0 || current()?.type !== "semicolon") {
            return null;
        }

        const close = consume("semicolon");

        return {
            type: "variableDeclaration",
            typeName,
            names,
            index: token.index,
            length: close.index + close.length - token.index,
        };
    }

    /* assume NAME is STATE, ... when NAME is STATE, ... ; — an
    analysis-state assumption: the states (tags) the target may be
    treated as having once the condition variable reaches the
    condition states (events). the states and events themselves are
    fill's vocabulary (semantics/fill.js); the parser only reads the
    shape. */

    function parseAssumption() {
        const assume = consume("identifier");
        const target = consume("identifier");

        const keywordToken = (text) => {
            const token = current();

            if (!keyword(text)) {
                throw new SyntaxError(
                    `Expected '${text}' at index ${token?.index ?? endOfInput}` +
                        (token ? `, got ${spelling(token)} instead` : "")
                );
            }

            position++;
        };

        const stateList = () => {
            const states = [consume("identifier")];

            while (current()?.type === "comma") {
                position++;
                states.push(consume("identifier"));
            }

            return states.map((token) => ({
                name: source?.slice(token.index, token.index + token.length),
                index: token.index,
            }));
        };

        keywordToken("is");
        const states = stateList();
        keywordToken("when");
        const condition = consume("identifier");
        keywordToken("is");
        const conditionStates = stateList();
        const close = consume("semicolon");

        return {
            type: "assumption",
            target: {
                name: source?.slice(target.index, target.index + target.length),
                index: target.index,
            },
            states,
            condition: {
                name: source?.slice(condition.index, condition.index + condition.length),
                index: condition.index,
            },
            conditionStates,
            index: assume.index,
            length: close.index + close.length - assume.index,
        };
    }

    /* name := expression ; — a local definition inside a block. the
    ";" may be omitted where the next statement's identifier or the
    closing brace makes the boundary unambiguous (an expression never
    continues into either). */

    function parseLocalDefinition() {
        const token = consume("identifier");
        consume("define");

        const { end: bodyEnd, ...parsed } = parseBody();

        let end;

        if (current()?.type === "identifier" || current()?.type === "right_brace") {
            end = bodyEnd;
        } else {
            const close = consume("semicolon");
            end = close.index + close.length;
        }

        return {
            type: "localDefinition",
            name: source?.slice(token.index, token.index + token.length),
            nameIndex: token.index,
            ...parsed,
            index: token.index,
            length: end - token.index,
        };
    }

    /* the body of a `:=` at any level — a definition's, a local's, a
    replacement's: a `{` directly after the `:=` opens a block of
    declarations, locals, and assumptions around its expression
    (parseBlock); anything else is one expression. */

    function parseBody() {
        if (current()?.type === "left_brace") {
            const block = parseBlock();

            return {
                declarations: block.declarations,
                locals: block.locals,
                assumptions: block.assumptions,
                body: block.body,
                end: block.close.index + block.close.length,
            };
        }

        const body = parseExpression();

        return {
            declarations: [],
            locals: [],
            assumptions: [],
            body,
            end: body.index + body.length,
        };
    }

    function parseBlock() {
        const open = consume("left_brace");
        const declarations = [];
        const locals = [];
        const assumptions = [];
        let body = null;

        while (current()?.type !== "right_brace") {
            if (!current()) {
                throw new SyntaxError(
                    `Expected '}' but the input ends at index ${endOfInput}`
                );
            }

            if (body !== null) {
                throw new SyntaxError(
                    `Unexpected ${spelling(current())}: ` +
                        `the expression must come last in a block at index ${current().index}`
                );
            }

            if (current().type === "identifier" && tokens[position + 1]?.type === "define") {
                locals.push(parseLocalDefinition());
                continue;
            }

            if (keyword("assume")) {
                assumptions.push(parseAssumption());
                continue;
            }

            const declaration = tryParseDeclaration();

            if (declaration) {
                declarations.push(declaration);
                continue;
            }

            body = parseExpression();

            // one trailing semicolon is allowed after the expression
            if (current()?.type === "semicolon") {
                position++;
            }
        }

        const close = consume("right_brace");

        return { declarations, locals, assumptions, body, open, close };
    }

    function parseDefinition() {
        const token = consume("identifier");
        consume("define");

        const name = source?.slice(token.index, token.index + token.length);
        const { end: bodyEnd, ...parsed } = parseBody();

        let end = bodyEnd;

        if (current()?.type === "semicolon") {
            end = current().index + current().length;
            position++;
        }

        return {
            type: "definition",
            name,
            nameIndex: token.index,
            ...parsed,
            index: token.index,
            length: end - token.index,
        };
    }

    const definitions = [];

    while (position < tokens.length) {
        if (
            current().type === "identifier" &&
            tokens[position + 1]?.type === "define"
        ) {
            definitions.push(parseDefinition());
            continue;
        }

        // a bare expression: the anonymous definition, allowed once
        const anonymous = definitions.find((definition) => definition.anonymous);

        if (anonymous) {
            throw new SyntaxError(
                `Unexpected ${spelling(current())}: an anonymous expression ` +
                    `already appeared; name the others with 'name :=' at index ${current().index}`
            );
        }

        const body = parseExpression();
        let end = body.index + body.length;

        if (current()?.type === "semicolon") {
            end = current().index + current().length;
            position++;
        }

        definitions.push({
            type: "definition",
            name: "expr",
            nameIndex: body.index,
            declarations: [],
            locals: [],
            assumptions: [],
            body,
            index: body.index,
            length: end - body.index,
            anonymous: true,
        });
    }

    return { type: "program", definitions };
}

/* buildTree(tokens, source?) — the one-expression callers' view: the
program must be exactly one definition; its body is the syntax tree. */

export function buildTree(tokens, source) {
    const { definitions } = buildProgram(tokens, source);

    if (definitions.length !== 1) {
        throw new SyntaxError(
            `Expected a single expression, but the input has ${definitions.length} definitions`
        );
    }

    const [definition] = definitions;

    if (definition.body === null) {
        throw new SyntaxError(
            `The definition '${definition.name}' has no expression at index ${definition.index}`
        );
    }

    return definition.body;
}
