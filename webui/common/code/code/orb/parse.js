
const TEXT = "builtin_text";
const BREAK = "builtin_break";

const cache = {};

const invalidTagCharacters = new Set("{}()<>,;:");

// TODO debug bracket escaping issues

export async function parse(uri) {
    if (uri in cache) {
        return cache[uri];
    }

    const response = await fetch(uri);

    if (!response.ok) {
        throw new Error(`could not load ${uri}`);
    }

    const source = await response.text();

    const parsed = parseSource(source);

    if (parsed.scanPosition != source.length) {
        console.warn(`parse concluded before end of file for ${uri}`);
    }

    parsed.source = source;

    cache[uri] = parsed;

    return parsed;
}

export async function debugParse(uri) {
    const parsed = await parse(uri);
    dumpNodes(parsed.nodes, parsed.source);
}

function parseSource(input, startIndex = 0) {
    const nodes = [];
    let scanPosition = startIndex;
    let escapeNext = false;

    let preContentStart = null;
    let preContentEnd = null;
    let tagStart = null;
    let tagEnd = null;
    let argStart = null;
    let argEnd = null;

    let newlineCount = 0;

    const scanLimit = input.length;

    while (scanPosition < scanLimit) {
        const char = input[scanPosition];

        if (!escapeNext && char === "\\") {
            escapeNext = true;
            scanPosition++;
            continue;
        }

        if (!escapeNext && char === "]" && argStart !== null && argEnd === null) {
            argEnd = scanPosition - 1;
            scanPosition++;
            continue;
        }

        if (!escapeNext && char === "{") {
            if (preContentStart !== null) {
                nodes.push({
                    tag: {symbol: TEXT, start: null, end: null},
                    content: {start: preContentStart, end: preContentEnd},
                    args: {start: null, end: null},
                    origin: "text_before_block"
                });

                preContentStart = null;
                preContentEnd = null;
            }

            scanPosition += 1; // skip the {

            let tag;
            if (argStart !== null && argEnd === null) {
                // args-only tag => implicit div
                tag = tagStart === argStart - 1 ?
                    "div" : input.substring(tagStart, argStart - 1);
                argEnd = tagEnd;
            } else {
                if (argStart !== null) {
                    tag = tagStart === argStart - 1 ?
                        "div" : input.substring(tagStart, argStart - 1);
                } else {
                    tag = tagStart === null ? TEXT : input.substring(tagStart, tagEnd + 1);
                }
            }

            if (shouldParseContent(tag)) {
                const parsed = parseSource(input, scanPosition);

                nodes.push({
                    tag: {symbol: tag, start: tagStart, end: tagEnd},
                    content: {
                        nodes: parsed.nodes,
                        start: scanPosition,
                        end: parsed.scanPosition
                    },
                    args: {start: argStart, end: argEnd},
                    origin: "parsed_block"
                });
                scanPosition = parsed.scanPosition + 1;
            } else {
                // ideally this will actually pass off parsing to the module,
                // which can then operate in a single pass & return its end position
                const closingPosition = findClosingBracket(input, scanPosition);
                nodes.push({
                    tag: {symbol: tag, start: tagStart, end: tagEnd},
                    content: {start: scanPosition, end: closingPosition},
                    args: {start: argStart, end: argEnd},
                    origin: "unparsed_block"
                });
                scanPosition = closingPosition + 1;
            }

            tagStart = null;
            tagEnd = null;
            argStart = null;
            argEnd = null;

            newlineCount = 0;

            continue;
        }

        if (!escapeNext && char === "}") {
            break;
        }
        escapeNext = false;

        const isWhitespace = /\s/.test(char);
        const takingArgs = argStart !== null && argEnd === null;

        if (!takingArgs && isWhitespace) {
            if (char === "\n") {
                newlineCount += 1;
                if (newlineCount === 2) {
                    newlineCount = 0;
                    const textStart = preContentStart ?? tagStart;
                    const textEnd = tagEnd ?? preContentEnd;
                    if (textStart !== null) {
                        nodes.push({
                            tag: {symbol: TEXT, start: null, end: null},
                            content: {start: textStart, end: textEnd},
                            args: {start: argStart, end: argEnd},
                            origin: "text_before_break"
                        });
                        preContentStart = null;
                        preContentEnd = null;
                        tagStart = null;
                        tagEnd = null;
                        argStart = null;
                        argEnd = null;
                    }
                    nodes.push({
                        tag: {symbol: BREAK, start: null, end: null},
                        content: {start: null, end: null},
                        args: {start: null, end: null},
                        origin: "break"
                    });
                }
            }
            scanPosition += 1;
            continue;
        }

        newlineCount = 0;


        if (char === "[" && !takingArgs) {
            argStart = scanPosition + 1;
            argEnd = null;
        }


        const canBeTag = !invalidTagCharacters.has(char);

        if (!canBeTag && !takingArgs) {
            if (preContentStart === null) {
                preContentStart = scanPosition;
                preContentEnd = scanPosition;
            } else {
                preContentEnd = scanPosition;
            }
            if (tagStart !== null) {
                preContentStart = Math.min(tagStart, preContentStart);
                tagStart = null;
                tagEnd = null;
            }
            scanPosition += 1;
            continue;
        }



        if (tagStart === null) { // we are at the start of what may be a tag
            tagStart = scanPosition;
            tagEnd = scanPosition;
        } else { // we are already parsing what may be a tag
            if (tagEnd === scanPosition - 1) { // ... and it didn't get interrupted
                tagEnd += 1;
            } else { // ... or it did get interrupted
                if (preContentStart === null) {
                    preContentStart = tagStart; // so we declare that that was content actually
                }
                preContentEnd = tagEnd;
                tagStart = scanPosition; // and now this is the start of the tag
                tagEnd = scanPosition;
            }
        }


        scanPosition += 1;
    }

    // Finish the current node if it has content
    if (preContentStart !== null || tagStart !== null) {
        const start = Math.min(preContentStart ?? Infinity, tagStart ?? Infinity);
        const end = Math.max(preContentEnd ?? -Infinity, tagEnd ?? -Infinity);
        nodes.push({
            tag: {symbol: TEXT, start: null, end: null},
            content: { start: start, end: end },
            args: {start: null, end: null},
            origin: "trailing_text"
        });
    }

    return { nodes, scanPosition };
}

function findClosingBracket(input, startIndex) {
    let scanPosition = startIndex;
    let depth = 1;
    let escapeNext = false;

    while (scanPosition < input.length && depth > 0) {
        const char = input[scanPosition];

        if (escapeNext) {
            escapeNext = false;
        } else if (char === "\\") {
            escapeNext = true;
        } else if (char === "{") {
            depth++;
        } else if (char === "}") {
            depth--;
        }

        scanPosition++;
    }

    return scanPosition - 1;
}

function shouldParseContent(tag) {
    return tag !== "$" && tag !== "$css";
}

function dumpNodes(nodes, input) {
    for (const node of nodes) {
        if (node.content.nodes !== undefined) {
            const args = node.args.start === null ?
                "" : input.substring(node.args.start, node.args.end + 1);
            console.log(`<${node.tag.symbol}>[${args}](${node.origin}){next ${node.content.nodes.length} nodes}`);
            dumpNodes(node.content.nodes, input);
        } else {
            const content = input.substring(node.content.start, node.content.end + 1);
            const args = node.args.start === null ?
                "" : input.substring(node.args.start, node.args.end + 1);
            console.log(`<${node.tag.symbol}>[${args}](${node.origin}){${content}}`);
        }
    }
}

