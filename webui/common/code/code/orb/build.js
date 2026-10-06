
import * as parserModule from "/code/code/orb/parse.js";
import { asciiModernRomanNumeral as roman } from "/code/math/roman.js";

const TEXT = "builtin_text";
const BREAK = "builtin_break";
const NOSPACE = "$nospace";

// elements that are themselves inline
const inlineElements = ["b", "i", "span", "sub", "sup", "a", "abbr", "q", "cite", "em", "strong"];
// elements whose innards are meant to be inline
const inlineChildrenElements = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "legend", "a", "b", "i", "sup", "sub", "cite", "em", "strong", "li", "summary", "aside"];
const namespacedElements = {
    "svg": "http://www.w3.org/2000/svg"
};

const DEBUG = true;

const spaceAfter = /[\w,;.:†]/;

const pendingFootnotes = [];
let noteGroup = 0;
let noteIndex = 0;

function verbatimText(source, node) {
    let text = source
        .substring(node.content.start, node.content.end)
        .replace(/\\([{}])/g, "$1");
    if (text.startsWith("\n")) text = text.substring(1);
    if (text.endsWith("\n")) text = text.substring(0, text.length - 1);
    return text;
}

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
            const children = node.content.nodes === undefined ?
                [document.createTextNode(verbatimText(source, node))] :
                await build(node.content.nodes, source, inlineContents, namespace);
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
                if (!inline) segment.$contextMenu = { override: true };
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
                const children = node.content.nodes === undefined ?
                    [document.createTextNode(verbatimText(source, node))] :
                    await build(node.content.nodes, source, inlineContents, namespace);
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

        if (tag === NOSPACE) {
            pendingSpace = false;
            inlineEnded = false;
            continue;
        }

        if (tag === "$") {
            const span = $element("span");
            if (DEBUG) { span.dataset.provenance = "9" }
            for (const arg of bracketArgs) {
                const split = arg.split("=");
                span.setAttribute(split[0].trim(), split[1]);
            }
            span.innerText = source.substring(node.content.start, node.content.end);
            span.$contextMenu = { override: true };

            if (pendingSpace) {
                segment.appendChild(document.createTextNode(" "));
            }
            segment.appendChild(span);
            pendingSpace = true;
            inlineEnded = true;
            continue;
        }

        if (tag.substring(1) === "comment") {
            continue;
        }

        if (tag.substring(1) === "scare") {
            if (pendingSpace) {
                segment.appendChild(document.createTextNode(" "));
            }
            segment.appendChild(document.createTextNode("“"));
            // TODO properly parse the innards of this...
            segment.appendChild(document.createTextNode(source.substring(node.content.start, node.content.end)));
            segment.appendChild(document.createTextNode("”"));
            pendingSpace = true;
            inlineEnded = true;
            continue;
        }

        if (tag.substring(1) === "css") {
            $css(source.substring(node.content.start, node.content.end), true);
            continue;
        }

        if (tag.substring(1) === "noted") {
            let content = source.substring(node.content.start, node.content.end);

            content = content.split("$note");

            const noteSource = content.pop().trim();
            const noted = content.join("$note");

            if (pendingSpace) {
                segment.appendChild(document.createTextNode(" "));
            }

            const groupNumeral = roman(noteGroup + 1).toLowerCase();

            const notedElement = $element("span");
            notedElement.classList = "noted";

            const parsedContent = parserModule.parseSource(noted);
            await (async () => {
                const notedContent = await build(parsedContent.nodes, noted, true);
                notedElement.append(...notedContent);
            })();

            noteIndex += 1;
            const noteNumeral = roman(noteIndex).toLowerCase();
            notedElement.id = `footnote_backref_${groupNumeral}_${noteNumeral}`;

            const link = $element("a");
            link.href = `#footnote_${groupNumeral}_${noteNumeral}`
            link.textContent = `${noteNumeral}`;

            segment.append(notedElement, $element("sup").$with(link));

            const parsedNote = parserModule.parseSource(noteSource);
            const notePromise = build(parsedNote.nodes, noteSource, true);

            pendingFootnotes.push(notePromise);

            inlineEnded = true;
            pendingSpace = true;

            continue;
        }

        if (tag.substring(1) === "footnotes") {
            let content = source.substring(node.content.start, node.content.end);

            const header = $element("summary");
            header.textContent = content;

            const section = $element("details").$with(header);
            section.classList = "footnotes";

            const groupNumeral = roman(noteGroup + 1).toLowerCase();
            noteGroup += 1;

            for (const [index, notePromise] of pendingFootnotes.entries()) {
                const noteNumeral = roman(index + 1).toLowerCase();

                const note = $element("aside");
                note.id = `footnote_${groupNumeral}_${noteNumeral}`;

                const backlink = $element("a");
                backlink.href = `#footnote_backref_${groupNumeral}_${noteNumeral}`;
                backlink.textContent = noteNumeral;

                (async () => {
                    note.append(...(await notePromise));
                })();

                section.appendChild(note.$with(
                    $element("sup").$with(backlink),
                    document.createTextNode(" ")
                ));
            }

            segment.appendChild(section);

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

