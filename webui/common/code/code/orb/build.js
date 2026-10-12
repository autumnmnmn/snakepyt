
import * as parserModule from "/code/code/orb/parse.js";
import { asciiModernRomanNumeral as roman } from "/code/math/roman.js";

const TEXT = "builtin_text";
const BREAK = "builtin_break";
const NOSPACE = "$nospace";

// elements that are themselves inline
const inlineElements = ["b", "i", "span", "sub", "sup", "a", "abbr", "q", "cite", "em", "strong"];
// elements whose innards are meant to be inline
const inlineChildrenElements = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "legend", "a", "b", "i", "sup", "sub", "cite", "em", "strong", "li", "summary", "aside", "abbr", "th", "td", "noscript"];
const namespacedElements = {
    "svg": "http://www.w3.org/2000/svg"
};

const spaceAfter = /[\w,;.:†]/;

const wrapMap = {
    section: "p",
    hgroup: "p"
};

function verbatimText(source, node) {
    let text = source
        .substring(node.content.start, node.content.end + 1)
        .replace(/\\([{}])/g, "$1");
    if (text.startsWith("\n")) text = text.substring(1);
    if (text.endsWith("\n")) text = text.substring(0, text.length - 1);
    return text;
}

export function initialState(parserResult) {
    const state = {
        nodes: parserResult.nodes,
        source: parserResult.source,
        segment: null,
        wrapperType: null,
        inlineEnded: false,
        pendingSpace: false,
        inline: false,
        namespace: null,
        domNodes: [],
        pendingFootnotes: [],
        noteGroup: 0,
        noteIndex: 0,
        content: node => parserResult.source.substring(node.content.start, node.content.end),
        contentP: node => parserResult.source.substring(node.content.start, node.content.end + 1),
        args: node => parserResult.source.substring(node.args.start, node.args.end + 1),
        verbatim: node => verbatimText(parserResult.source, node)
    };
    state.upper = state;
    return state;
}

export async function build(state) {
    if (state.segment === null) {
        state.segment = (state.inline || state.wrapperType === null) ?
            document.createDocumentFragment() :
            $element(state.wrapperType, "first wrapper");
    }

    const outer_namespace = state.namespace;

    for (const node of state.nodes) {

        let namespace = outer_namespace;
        const tag = node.tag.symbol;

        const wrapperType = wrapMap[tag] ?? null;

        if (tag === TEXT) {
            const content = state.contentP(node);
            if (state.inlineEnded && /[\w(]/.test(content[0])) {
                state.segment.appendChild(document.createTextNode(" "));
            }
            state.segment.appendChild(document.createTextNode(content));
            state.inlineEnded = false;
            state.pendingSpace = spaceAfter.test(content.at(-1));
            continue;
        }

        if (tag === BREAK) {
            if (state.inline) {
                const br = $element("br", "builtin break");
                state.segment.appendChild(br);
            } else {
                if (state.segment.childNodes.length > 0) {
                    state.segment.$contextMenu = { override: true };
                    state.domNodes.push(state.segment);
                    state.segment = (state.inline || state.wrapperType === null) ?
                        document.createDocumentFragment() :
                        $element(state.wrapperType, "post-break wrapper");
                }
            }
            continue;
        }

        let bracketArgs = [];
        if (node.args.start !== null) {
            bracketArgs = state.args(node).split("|");
        }

        if (tag in namespacedElements) {
            namespace = namespacedElements[tag];
        }

        if (inlineElements.includes(tag)) {
            const tagElement = namespace === null ?
                $element(tag, "inline element noNS") :
                document.createElementNS(namespace, tag);

            if (state.pendingSpace || state.inlineEnded) {
                state.segment.appendChild(document.createTextNode(" "));
            }
            state.pendingSpace = false;
            const inlineContents = inlineChildrenElements.includes(tag); // TODO mark
            const children = node.content.nodes === undefined ?
                [document.createTextNode(state.verbatim(node))] :
                (await build({ ...state,
                    nodes: node.content.nodes,
                    inline: inlineContents,
                    domNodes: [],
                    segment: null,
                    wrapperType
                })).domNodes;
            tagElement.append(...children);
            for (const arg of bracketArgs) {
                const split = arg.split("=");
                tagElement.setAttribute(split[0].trim(), split[1]);
            }
            state.segment.appendChild(tagElement);
            state.inlineEnded = true;
            continue;
        }

        if (tag[0] !== "$") {
            if (state.segment.childNodes.length > 0) {
                if (!state.inline) state.segment.$contextMenu = { override: true };
                state.domNodes.push(state.segment);
                state.segment = (state.inline || state.wrapperType !== null) ?
                    document.createDocumentFragment() :
                    $element(state.wrapperType, "post-noninline wrapper");
            }
            try {
                const tagElement = namespace === null ?
                    $element(tag, "element") :
                    document.createElementNS(namespace, tag);
                for (const arg of bracketArgs) {
                    const split = arg.split("=");
                    console.log(split);
                    tagElement.setAttribute(split[0].trim(), split[1]);
                }
                const inlineContents = inlineChildrenElements.includes(tag);
                const children = node.content.nodes === undefined ?
                    [document.createTextNode(state.verbatim(node))] :
                    (await build({ ...state,
                        nodes: node.content.nodes,
                        inline: inlineContents,
                        domNodes: [],
                        segment: null,
                        wrapperType
                    })).domNodes;
                tagElement.append(...children);
                state.domNodes.push(tagElement);
            }
            catch {
                const _sp = $element("span", "unknown tag");
                _sp.innerText = ` [no tag "${tag}"] `;
                state.segment.appendChild(_sp);
                console.warn(`Nonsense tag: ${tag}`);
            }
            continue;
        }

        const modNameStr = tag.substring(1);

        if (tag === NOSPACE) {
            state.pendingSpace = false;
            state.inlineEnded = false;
            continue;
        }

        if (tag === "$") {
            const span = $element("span", "shorthand span");
            for (const arg of bracketArgs) {
                const split = arg.split("=");
                span.setAttribute(split[0].trim(), split[1]);
            }
            span.innerText = state.content(node);
            span.$contextMenu = { override: true };

            if (state.pendingSpace) {
                state.segment.appendChild(document.createTextNode(" "));
            }
            state.segment.appendChild(span);
            state.pendingSpace = true;
            state.inlineEnded = true;
            continue;
        }

        if (tag.substring(1) === "comment") {
            continue;
        }

        if (tag.substring(1) === "scare") {
            if (state.pendingSpace) {
                state.segment.appendChild(document.createTextNode(" "));
            }
            state.segment.appendChild(document.createTextNode("“"));
            // TODO properly parse the innards of this...
            const content = state.content(node);
            state.segment.appendChild(document.createTextNode(content));
            state.segment.appendChild(document.createTextNode("”"));
            state.pendingSpace = true;
            state.inlineEnded = true;
            continue;
        }

        if (tag.substring(1) === "css") {
            $css(state.content(node), true);
            continue;
        }

        if (tag.substring(1) === "noted") {
            let content = state.content(node);

            content = content.split("$note");

            const noteSource = content.pop().trim();
            const noted = content.join("$note");

            if (state.pendingSpace) {
                state.segment.appendChild(document.createTextNode(" "));
            }

            const groupNumeral = roman(state.upper.noteGroup + 1).toLowerCase();

            const notedElement = $element("span", "footnote backlink target");
            notedElement.classList = "noted";

            const parsedContent = parserModule.parseSource(noted);
            await (async () => {
                const notedContent = await build({ ...initialState(parsedContent),
                    inline: true,
                    upper: state.upper
                });
                notedElement.append(...notedContent.domNodes);
            })();

            state.upper.noteIndex += 1;
            const noteNumeral = roman(state.upper.noteIndex).toLowerCase();
            notedElement.id = `footnote_backref_${groupNumeral}_${noteNumeral}`;

            const link = $element("a", "footnote link");
            link.href = `#footnote_${groupNumeral}_${noteNumeral}`
            link.textContent = `${noteNumeral}`;

            state.segment.append(notedElement, $element("sup", "footnote").$with(link));

            const parsedNote = parserModule.parseSource(noteSource);
            const notePromise = build({ ...initialState(parsedNote),
                inline: true,
            });

            state.pendingFootnotes.push(notePromise);

            state.inlineEnded = true;
            state.pendingSpace = true;

            continue;
        }

        if (tag.substring(1) === "footnotes") {
            let content = state.content(node);

            const header = $element("summary", "footnotes");
            header.textContent = content;

            const section = $element("details", "footnotes").$with(header);
            section.classList = "footnotes";

            const groupNumeral = roman(state.upper.noteGroup + 1).toLowerCase();
            state.upper.noteGroup += 1;

            const notes = state.pendingFootnotes;
            state.upper.pendingFootnotes = [];
            state.upper.noteIndex = 0;

            for (const [index, notePromise] of notes.entries()) {
                const noteNumeral = roman(index + 1).toLowerCase();

                const note = $element("aside", "footnote");
                note.id = `footnote_${groupNumeral}_${noteNumeral}`;

                const backlink = $element("a", "footnote backlink");
                backlink.href = `#footnote_backref_${groupNumeral}_${noteNumeral}`;
                backlink.textContent = noteNumeral;

                (async () => {
                    note.append(...(await notePromise).domNodes);
                })();

                section.appendChild(note.$with(
                    $element("sup").$with(backlink),
                    document.createTextNode(" ")
                ));
            }

            state.domNodes.push(section);



            continue;
        }

        if (tag.substring(1) === "title") {
            const title = state.content(node).trim();
            document.title = title;
            document.querySelector('meta[property="og:title"]')
                .setAttribute('content', title)
            continue;
        }

        if (tag.substring(1,4) === "og_") {
            const content = state.content(node).trim();
            document.querySelector(`meta[property="og:${tag.substring(4)}"]`)
                .setAttribute('content', content)
            continue;
        }

        const script = $element("script", "self-removing script");
        script.classList = "to-replace";
        const modName = JSON.stringify(tag.substring(1));
        const modContent = JSON.stringify(state.content(node));
        const modArgs = JSON.stringify(bracketArgs);
        script.innerText = `$replace(document.currentScript, ${modName}, ...${modArgs}, ${modContent});`;

        if (state.pendingSpace || state.inlineEnded) {
            state.segment.appendChild(document.createTextNode(" "));
        }
        state.pendingSpace = false;
        state.segment.appendChild(script);
        state.inlineEnded = true;
    }

    if (state.segment.childNodes.length > 0) {
        if (!state.inline) state.segment.$contextMenu = { items: [], override: true };
        state.domNodes.push(state.segment);
    }

    return state;
}

