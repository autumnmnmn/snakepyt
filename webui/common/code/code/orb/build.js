
const TEXT = "builtin_text";
const BREAK = "builtin_break";

const inlineElements = ["b", "i", "span", "sub", "sup", "a"];
const namespacedElements = {
    "svg": "http://www.w3.org/2000/svg"
};

// TODO deal w/ extraneous span generation
// TODO elide spaces in cases like "( a[href=foo]{bar})",
// maybe make such spaces unnecessary in the parser

export async function build(target, nodes, source, inline=false, namespace=null) {
    let segment = document.createElement(inline ? "span" : "p");
    let inlineEnded = false;
    let pendingSpace = false;

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
                    target.appendChild(segment);
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
            build(tagElement, node.content.nodes, source, true, namespace);
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
                target.appendChild(segment);
                segment = document.createElement(inline ? "span" : "p");
            }
            try {
                const tagElement = namespace === null ? document.createElement(tag) : document.createElementNS(namespace, tag);
                for (const arg of bracketArgs) {
                    const split = arg.split("=");
                    tagElement.setAttribute(split[0].trim(), split[1]);
                }
                build(tagElement, node.content.nodes, source, false, namespace);
                target.appendChild(tagElement);
            }
            catch {
                const _sp = document.createElement("span");
                _sp.innerText = ` [no tag "${tag}"] `;
                segment.appendChild(_sp);
            }
            continue;
        }

        if (segment.childNodes.length > 0) {
            segment.$contextMenu = { items: [], override: true };
            target.appendChild(segment);
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
            target.appendChild(span);
            continue;
        }

        if (tag.substring(1) === "css") {
            $css(source.substring(node.content.start, node.content.end));
            continue;
        }

        if (tag.substring(1) === "title") {
            document.title = source.substring(node.content.start, node.content.end);
            continue;
        }

        const errTarget = segment;
        const noth = document.createElement("div");
        noth.style = "display: none";
        segment.appendChild(noth);
        $mod(tag.substring(1), target, [...bracketArgs, source.substring(node.content.start, node.content.end)])
            .catch((err) => {
                console.log(err)
                noth.remove();
                const _sp = document.createElement("span");
                // TODO better error message, differentiate btwn module error & lack of module
                _sp.innerText = ` [no module "${tag}"] `;
                errTarget.appendChild(_sp);
            });
    }

    if (segment.childNodes.length > 0) {
        segment.$contextMenu = { items: [], override: true };
        target.appendChild(segment);
    }
}

