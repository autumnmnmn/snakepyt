
const TEXT = "builtin_text";
const BREAK = "builtin_break";

// elements that are themselves inline
const inlineElements = ["b", "i", "span", "sub", "sup", "a", "abbr", "q"];
// elements whose innards are meant to be inline
const inlineChildrenElements = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "legend", "a", "b", "i"];
const namespacedElements = {
    "svg": "http://www.w3.org/2000/svg"
};

const DEBUG = true;

const spaceAfter = /[\w,;.:]/;

export async function build(nodes, source, inline=false, namespace=null) {
    let segment = inline ? document.createDocumentFragment() : document.createElement("p");
    if (DEBUG && !inline) { segment.dataset.provenance = "0" };
    let inlineEnded = false;
    let pendingSpace = false;

    const domNodes = [];

    const outer_namespace = namespace;

    for (const node of nodes) {
        let namespace = outer_namespace;
        const tag = node.tag.symbol;

        if (tag === TEXT) {
            const content = source.substring(node.content.start, node.content.end + 1);
            if (inlineEnded && /[\w(]/.test(content[0])) {
                segment.appendChild(document.createTextNode(" "));
            }
            segment.appendChild(document.createTextNode(content));
            inlineEnded = false;
            pendingSpace = spaceAfter.test(content.at(-1));
            continue;
        }

        if (tag === BREAK) {
            if (inline) {
                const br = document.createElement("br");
                if (DEBUG) { br.dataset.provenance = "2" };
                segment.appendChild(br);
            } else {
                if (segment.childNodes.length > 0) {
                    segment.$contextMenu = { override: true };
                    domNodes.push(segment);
                    segment = document.createElement("p");
                    if (DEBUG) { segment.dataset.provenance = "3" };
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
            if (DEBUG) { tagElement.dataset.provenance = "4" }
            if (pendingSpace || inlineEnded) {
                segment.appendChild(document.createTextNode(" "));
            }
            pendingSpace = false;
            const inlineContents = inlineChildrenElements.includes(tag);
            const children = await build(node.content.nodes, source, inlineContents, namespace);
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
                if (!inline) segment.$contextMenu = { items: [], override: true };
                domNodes.push(segment);
                segment = inline ? document.createDocumentFragment() : document.createElement("p");
                if (DEBUG && !inline) { segment.dataset.provenance = "5" }
            }
            try {
                const tagElement = namespace === null ? document.createElement(tag) : document.createElementNS(namespace, tag);
                if (DEBUG) { tagElement.dataset.provenance = "6" }
                for (const arg of bracketArgs) {
                    const split = arg.split("=");
                    tagElement.setAttribute(split[0].trim(), split[1]);
                }
                const inlineContents = inlineChildrenElements.includes(tag);
                const children = await build(node.content.nodes, source, inlineContents, namespace);
                tagElement.append(...children);
                domNodes.push(tagElement);
            }
            catch {
                const _sp = document.createElement("span");
                if (DEBUG) { _sp.dataset.provenance = "7" }
                _sp.innerText = ` [no tag "${tag}"] `;
                segment.appendChild(_sp);
            }
            continue;
        }

        const modNameStr = tag.substring(1);

        if (tag === "$") {
            const span = $element("span");
            if (DEBUG) { span.dataset.provenance = "9" }
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
        if (DEBUG) { script.dataset.provenance = "9" }
        const modName = JSON.stringify(tag.substring(1));
        const modContent = JSON.stringify(source.substring(node.content.start, node.content.end));
        const modArgs = JSON.stringify(bracketArgs);
        script.innerText = `$replace(document.currentScript, ${modName}, ...${modArgs}, ${modContent});`;

        if (pendingSpace || inlineEnded) {
            segment.appendChild(document.createTextNode(" "));
            console.log("here");
        }
        pendingSpace = false;
        segment.appendChild(script);
        inlineEnded = true;
    }

    if (segment.childNodes.length > 0) {
        if (!inline) segment.$contextMenu = { items: [], override: true };
        domNodes.push(segment);
    }

    return domNodes;
}

