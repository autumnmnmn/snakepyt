
const TEXT = "builtin_text";
const BREAK = "builtin_break";

const inlineElements = ["b", "i", "span", "sub", "sup", "a"];
const inlineModules = ["math/inline"];
const namespacedElements = {
    "svg": "http://www.w3.org/2000/svg"
};

// TODO deal w/ extraneous span generation
// TODO elide spaces in cases like "( a[href=foo]{bar})",
// maybe make such spaces unnecessary in the parser

export async function build(nodes, source, inline=false, namespace=null) {
    let segment = document.createElement(inline ? "span" : "p");
    let inlineEnded = false;
    let pendingSpace = false;

    const domNodes = [];

    const outer_namespace = namespace;

    for (const node of nodes) {
        let namespace = outer_namespace;
        const tag = node.tag.symbol;

        if (tag === TEXT) {
            const span = document.createElement("span");
            const content = source.substring(node.content.start, node.content.end + 1);
            span.textContent = content;
            if (inlineEnded && /[\w(]/.test(content[0])) {
                segment.appendChild(document.createTextNode(" "));
            }
            segment.appendChild(span);
            inlineEnded = false;
            pendingSpace = /[\w,;.]/.test(content.at(-1));
            continue;
        }

        if (tag === BREAK) {
            if (inline) {
                const br = document.createElement("br");
                segment.appendChild(br);
            } else {
                if (segment.childNodes.length > 0) {
                    segment.$contextMenu = { override: true };
                    domNodes.push(segment);
                    segment = document.createElement("p");
                }
            }
            continue;
        }

        let bracketArgs = [];
        if (node.args.start !== null) {
            bracketArgs = source.substring(node.args.start, node.args.end + 1).split("|");
        }

        if (tag in namespacedElements) {
            namespace = namespacedElements[tag];
        }

        if (inlineElements.includes(tag)) {
            const tagElement = namespace === null ? document.createElement(tag) : document.createElementNS(namespace, tag);
            if (pendingSpace) {
                segment.appendChild(document.createTextNode(" "));
            }
            pendingSpace = false;
            const children = await build(node.content.nodes, source, true, namespace);
            tagElement.append(...children);
            for (const arg of bracketArgs) {
                const split = arg.split("=");
                tagElement.setAttribute(split[0].trim(), split[1]);
            }
            segment.appendChild(tagElement);
            inlineEnded = true;
            continue;
        }

        if (tag[0] !== "$") {
            if (segment.childNodes.length > 0) {
                segment.$contextMenu = { items: [], override: true };
                domNodes.push(segment);
                segment = document.createElement(inline ? "span" : "p");
            }
            try {
                const tagElement = namespace === null ? document.createElement(tag) : document.createElementNS(namespace, tag);
                for (const arg of bracketArgs) {
                    const split = arg.split("=");
                    tagElement.setAttribute(split[0].trim(), split[1]);
                }
                const children = await build(node.content.nodes, source, false, namespace);
                tagElement.append(...children);
                domNodes.push(tagElement);
            }
            catch {
                const _sp = document.createElement("span");
                _sp.innerText = ` [no tag "${tag}"] `;
                segment.appendChild(_sp);
            }
            continue;
        }

        const modNameStr = tag.substring(1);
        const isInlineModule = inlineModules.includes(modNameStr);

        if (!isInlineModule && segment.childNodes.length > 0) {
            segment.$contextMenu = { items: [], override: true };
            domNodes.push(segment);
            segment = document.createElement(inline ? "span" : "p");
        }

        if (tag === "$") {
            const span = $element("span");
            for (const arg of bracketArgs) {
                const split = arg.split("=");
                span.setAttribute(split[0].trim(), split[1]);
            }
            span.innerText = source.substring(node.content.start, node.content.end);
            span.$contextMenu = { items: [], override: true };
            domNodes.push(span);
            continue;
        }

        if (tag.substring(1) === "css") {
            $css(source.substring(node.content.start, node.content.end), true);
            continue;
        }

        if (tag.substring(1) === "title") {
            const title = source.substring(node.content.start, node.content.end).trim();
            document.title = title;
            document.querySelector('meta[property="og:title"]').setAttribute('content', title)
            continue;
        }

        if (tag.substring(1,4) === "og_") {
            const content = source.substring(node.content.start, node.content.end).trim();
            document.querySelector(`meta[property="og:${tag.substring(4)}"]`).setAttribute('content', content)
            continue;
        }

        const script = $element("script");
        const modName = JSON.stringify(tag.substring(1));
        const modContent = JSON.stringify(source.substring(node.content.start, node.content.end));
        const modArgs = JSON.stringify(bracketArgs);
        script.innerText = `$replace(document.currentScript, ${modName}, ...${modArgs}, ${modContent});`;

        if (isInlineModule) {
            if (pendingSpace) {
                segment.appendChild(document.createTextNode(" "));
            }
            pendingSpace = false;
            segment.appendChild(script);
            inlineEnded = true;
        } else {
            domNodes.push(script);
        }
    }

    if (segment.childNodes.length > 0) {
        segment.$contextMenu = { items: [], override: true };
        domNodes.push(segment);
    }

    return domNodes;
}

