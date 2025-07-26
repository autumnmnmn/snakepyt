
const TEXT = "builtin_text";
const BREAK = "builtin_break";

const inlineElements = ["b", "i"];

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

        let bracketArgs = [];
        if (node.args.start !== null) {
            bracketArgs = source.substring(node.args.start, node.args.end + 1).split("|");
        }

        if (inlineElements.includes(tag)) {
            const tagElement = document.createElement(tag);
            await build(tagElement, node.content.nodes, source, true);
            for (const arg of bracketArgs) {
                const split = arg.split("=");
                console.log(split);
                tagElement[split[0].trim()] = split[1];
            }
            segment.appendChild(document.createTextNode(" "));
            segment.appendChild(tagElement);
            inlineEnded = true;
            continue;
        }

        if (tag[0] !== "$") {
            if (segment.childNodes.length > 0) {
                target.appendChild(segment);
                segment = document.createElement(inline ? "span" : "p");
            }
            try {
                const tagElement = document.createElement(tag);
                for (const arg of bracketArgs) {
                    const split = arg.split("=");
                    console.log(split);
                    tagElement[split[0].trim()] = split[1];
                }
                await build(tagElement, node.content.nodes, source);
                target.appendChild(tagElement);
            }
            catch {
                const _sp = document.createElement("span");
                _sp.innerText = ` [no tag "${tag}"] `;
                segment.appendChild(_sp);
            }
            continue;
        }

        try {
            if (segment.childNodes.length > 0) {
                target.appendChild(segment);
                segment = document.createElement(inline ? "span" : "p");
            }
            await $mod(tag.substring(1), target, [...bracketArgs, source.substring(node.content.start, node.content.end)]);
        }
        catch {
            const _sp = document.createElement("span");
            _sp.innerText = ` [no module "${tag}"] `;
            segment.appendChild(_sp);
        }
    }

    if (segment.childNodes.length > 0) {
        target.appendChild(segment);
    }
}

