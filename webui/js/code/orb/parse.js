

const TEXT = "builtin_text";
const BREAK = "builtin_break";

const cache = {};

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

    let contentStart = null;
    let contentEnd = null;
    let tagStart = null;
    let tagEnd = null;

    let newlineCount = 0;

    const scanLimit = input.length;

    while (scanPosition < scanLimit) {
        const char = input[scanPosition];

        if (!escapeNext && char === '\\') {
            escapeNext = true;
            scanPosition++;
            continue;
        }

        if (!escapeNext && char === '{') {
            if (contentStart !== null) {
                nodes.push({
                    tag: {symbol: TEXT, start: null, end: null},
                    content: {start: contentStart, end: contentEnd},
                    origin: 0
                });

                contentStart = null;
                contentEnd = null;
            }

            scanPosition += 1; // skip the {


            const tag = tagStart === null ? TEXT : input.substring(tagStart, tagEnd + 1);

            if (shouldParseContent(tag)) {
                const parsed = parseSource(input, scanPosition);

                nodes.push({
                    tag: {symbol: tag, start: tagStart, end: tagEnd},
                    content: {nodes: parsed.nodes, start: scanPosition, end: parsed.scanPosition}
                });
                scanPosition = parsed.scanPosition + 1;
            } else {
                // ideally this will actually pass off parsing to the module, which can ideally operate in a single pass & return its end position
                const closingPosition = findClosingBracket(input, scanPosition);
                nodes.push({
                    tag: {symbol: tag, start: tagStart, end: tagEnd},
                    content: {start: scanPosition, end: closingPosition}
                });
                scanPosition = closingPosition + 1;
            }

            tagStart = null;
            tagEnd = null;

            newlineCount = 0;

            continue;
        }

        if (!escapeNext && char === '}') {
            break;
        }
        escapeNext = false;

        const isWhitespace = /\s/.test(char);
        if (isWhitespace) {
            if (char === "\n") {
                newlineCount += 1;
                if (newlineCount === 2) {
                    newlineCount = 0;
                    if (contentStart !== null) {
                        nodes.push({
                            tag: {symbol: TEXT, start: null, end: null},
                            content: {start: contentStart, end: tagEnd},
                            origin: 1
                        });
                        contentStart = null;
                        contentEnd = null;
                        tagStart = null;
                        tagEnd = null;
                    }
                    nodes.push({
                        tag: {symbol: BREAK, start: null, end: null},
                        content: {start: null, end: null},
                        origin: 2
                    });
                }
            }
            scanPosition += 1;
            continue;
        }

        newlineCount = 0;

        if (tagStart === null) {
            tagStart = scanPosition;
            tagEnd = scanPosition;
        } else {
            if (tagEnd === scanPosition - 1) {
                tagEnd += 1;
            } else {
                if (contentStart === null) {
                    contentStart = tagStart;
                }
                contentEnd = tagEnd;
                tagStart = scanPosition;
                tagEnd = scanPosition;
            }
        }

        scanPosition += 1;
    }

    // Finish the current node if it has content
    if (tagStart !== null) {
        nodes.push({
            tag: {symbol: TEXT, start: null, end: null},
            content: { start: contentStart ?? tagStart, end: tagEnd },
            origin: 3
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
        } else if (char === '\\') {
            escapeNext = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
        }

        scanPosition++;
    }

    return scanPosition - 1;
}

function shouldParseContent(tag) {
    return tag !== "fractal";
}

function dumpNodes(nodes, input) {
    for (const node of nodes) {
        let content;

        if (node.content.nodes !== undefined) {
            console.log(`TAG{${node.tag.symbol}}[${node.origin}] | CONTENT[next ${node.content.nodes.length} nodes]`);
            dumpNodes(node.content.nodes, input);
        } else {
            content = input.substring(node.content.start, node.content.end + 1);
            console.log(`TAG{${node.tag.symbol}}[${node.origin}] | CONTENT{${content}}`);
        }
    }
}

