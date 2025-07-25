
const TEXT = "builtin_text";
const BREAK = "builtin_break";

const inlineElements = {
    bold: "b",
    italic: "i"
}

const simpleBlocks = {
    demo: { element: "div", class: "demo" },
    height300: { element: "div", class: "height300" }
}

export async function build(target, nodes, source, inline=false) {
    let segment = document.createElement(inline ? "span" : "p");
    let inlineEnded = false;

    for (const node of nodes) {
        const tag = node.tag.symbol;

        if (tag === TEXT) {
            const span = document.createElement("span");
            span.innerText = source.substring(node.content.start, node.content.end + 1);
            if (inlineEnded && /\w/.test(span.innerText[0])) {
                segment.appendChild(document.createTextNode(" "));
            }
            segment.appendChild(span);
            inlineEnded = false;
            continue;
        }

        if (tag === BREAK) {
            if (inline) {
                const br = document.createElement("br");
                segment.appendChild(br);
            } else {
                target.appendChild(segment);
                segment = document.createElement("p");
            }
            continue;
        }

        if (tag in inlineElements) {
            const bold = document.createElement(inlineElements[tag]);
            await build(bold, node.content.nodes, source, true);
            segment.appendChild(document.createTextNode(" "));
            segment.appendChild(bold);
            inlineEnded = true;
            continue;
        }

        if (tag in simpleBlocks) {
            target.appendChild(segment);
            segment = document.createElement(inline ? "span" : "p");
            const block = simpleBlocks[tag];
            const container = document.createElement(block.element);
            container.classList = block.class;
            await build(container, node.content.nodes, source);
            target.appendChild(container);
            continue;
        }

        try {
            target.appendChild(segment);
            segment = document.createElement(inline ? "span" : "p");
            await $mod(tag, target, [source.substring(node.content.start, node.content.end)]);
        }
        catch {
            const _sp = document.createElement("span");
            _sp.innerText = ` [unrecognized tag "${tag}"] `;
            segment.appendChild(_sp);
        }
    }

    target.appendChild(segment);
}

