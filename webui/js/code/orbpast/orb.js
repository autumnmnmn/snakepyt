
export async function main(target) {
    const response = await fetch("test.orb");
    if (!response.ok) {
        throw new Error(`Failed to load test.orb`);
    }
    const orbSource = await response.text();

    console.log(orbSource);

    console.log(dumpNodes(parseOrb(orbSource), orbSource));
}

function parseOrb(input, startIndex = 0, endIndex = input.length) {
    const nodes = [];
    let scanPosition = startIndex;
    let escapeNext = false;

    while (scanPosition < endIndex) {
        let current_node = {
            tag: 'NONE',
            content_start: scanPosition,
            content_end: scanPosition,
            last_nonws_start: -1,
            last_nonws_end: -1
        };

        while (scanPosition < endIndex) {
            const char = input[scanPosition];

            if (escapeNext) {
                current_node.content_end = scanPosition + 1;
                escapeNext = false;
                scanPosition++;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                current_node.content_end = scanPosition + 1;
                scanPosition++;
                continue;
            }

            if (char === '{') {
                let tag = 'NONE';
                let contentEndBeforeTag = current_node.content_end;

                // Extract tag if we have non-whitespace
                if (current_node.last_nonws_start !== -1) {
                    tag = input.substring(current_node.last_nonws_start, current_node.last_nonws_end);
                    contentEndBeforeTag = current_node.last_nonws_start;
                }

                // Push text node before the tag (if any content exists)
                if (contentEndBeforeTag > current_node.content_start) {
                    nodes.push({
                        tag: 'NONE',
                        content_start: current_node.content_start,
                        content_end: contentEndBeforeTag
                    });
                }

                scanPosition++; // skip the {

                const closing_pos = findClosingBracket(input, scanPosition);

                if (!shouldParseContent(tag)) {
                    const raw_content = input.substring(scanPosition, closing_pos);
                    nodes.push({
                        tag: tag,
                        raw_content: raw_content,
                        content_start: scanPosition,
                        content_end: closing_pos
                    });
                } else {
                    const nested_content = parseOrb(input, scanPosition, closing_pos);
                    nodes.push({
                        tag: tag,
                        content: nested_content,
                        content_start: scanPosition,
                        content_end: closing_pos
                    });
                }

                scanPosition = closing_pos + 1; // skip }
                break;
            }

            if (char === '}') {
                break;
            }

            // Update content end and track non-whitespace
            current_node.content_end = scanPosition + 1;

            if (!/\s/.test(char)) {
                if (current_node.last_nonws_start === -1 ||
                    (scanPosition > 0 && /\s/.test(input[scanPosition - 1]))) {
                    // Starting a new word (either first word or after whitespace)
                    current_node.last_nonws_start = scanPosition;
                }
                current_node.last_nonws_end = scanPosition + 1;
            }

            scanPosition++;
        }

        // Finish the current node if it has content
        if (current_node.content_end > current_node.content_start) {
            nodes.push({
                tag: current_node.tag,
                content_start: current_node.content_start,
                content_end: current_node.content_end
            });
        }

        // Break if we hit end or closing bracket
        if (scanPosition >= endIndex || (scanPosition < input.length && input[scanPosition] === '}')) {
            break;
        }
    }

    return nodes;
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
    if (!Array.isArray(nodes)) {
        throw new Error('nodes must be an array');
    }
    if (typeof input !== 'string') {
        throw new Error('input must be a string');
    }

    for (const node of nodes) {
        let content;

        if (node.raw_content !== undefined) {
            content = node.raw_content;
        } else if (node.content !== undefined) {
            dumpNodes(node.content, input);
            content = `[${node.content.length} nested nodes]`;
        } else {
            content = input.substring(node.content_start, node.content_end);
        }

        console.log(`TAG{${node.tag}} | CONTENT{${content}}`);
    }
}

