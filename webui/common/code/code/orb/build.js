
import * as parserModule from "/code/code/orb/parse.js";
import { asciiModernRomanNumeral as roman } from "/code/math/roman.js";
import { text, builtin_break, scare, title } from "/code/code/orb/builtin/core.js";
import { noted, footnotes } from "/code/code/orb/builtin/notes.js";
import { figure } from "/code/code/orb/builtin/figure.js";
import { contents, header } from "/code/code/orb/builtin/article.js";

const TEXT = "builtin_text";
const BREAK = "builtin_break";
const NOSPACE = "$nospace";

// elements that are themselves inline
const inlineElements = ["b", "i", "span", "sub", "sup", "a", "abbr", "q", "cite", "em", "strong"];
const namespacedElements = {
    "svg": "http://www.w3.org/2000/svg"
};


const wrapMap = {
    section: "p",
    hgroup: "p"
};

function verbatimText(source, node) {
    let text = source
        .substring(node.content.start, node.content.end)
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
        namespace: null,
        domNodes: [],
        pendingFootnotes: [],
        noteGroup: 0,
        noteIndex: 0,
        content: node => parserResult.source.substring(node.content.start, node.content.end),
        args: node => parserResult.source.substring(node.args.start, node.args.end),
        verbatim: node => verbatimText(parserResult.source, node),
        build: build
    };
    state.upper = state;
    return state;
}

export async function build(state) {
    if (state.segment === null) {
        state.segment = (state.wrapperType === null) ?
            document.createDocumentFragment() :
            $element(state.wrapperType, "first wrapper");
    }

    const outer_namespace = state.namespace;

    for (const node of state.nodes) {

        let namespace = outer_namespace;
        const tag = node.tag.symbol;

        const wrapperType = wrapMap[tag] ?? null;

        if (tag === TEXT) {
            await text(node, state);
            continue;
        }

        if (tag === BREAK) {
            await builtin_break(node, state);
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
            const children = node.content.nodes === undefined ?
                [document.createTextNode(state.verbatim(node))] :
                (await build({ ...state,
                    nodes: node.content.nodes,
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
                //if (!state.inline) state.segment.$contextMenu = { override: true };
                state.domNodes.push(state.segment);
                state.segment = (state.wrapperType !== null) ?
                    document.createDocumentFragment() :
                    $element(state.wrapperType, "post-noninline wrapper");
            }
            try {
                const tagElement = namespace === null ?
                    $element(tag, "element") :
                    document.createElementNS(namespace, tag);
                for (const arg of bracketArgs) {
                    const split = arg.split("=");
                    tagElement.setAttribute(split[0].trim(), split[1]);
                }
                const children = node.content.nodes === undefined ?
                    [document.createTextNode(state.verbatim(node))] :
                    (await build({ ...state,
                        nodes: node.content.nodes,
                        domNodes: [],
                        segment: null,
                        wrapperType
                    })).domNodes;
                tagElement.append(...children);
                state.domNodes.push(tagElement);
            }
            catch {
                const _sp = $element("span", "unknown tag");
                _sp.innerText = ` [error building tag "${tag}"] `;
                state.segment.appendChild(_sp);
                console.warn(`error in tag: ${tag}`);
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

        if (tag.substring(1) === "figure") {
            await figure(node, state, bracketArgs);
            continue;
        }

        if (tag.substring(1) === "contents") {
            await contents(node, state, bracketArgs);
            continue;
        }

        if (tag.substring(1) === "header") {
            await header(node, state, bracketArgs);
            continue;
        }

        if (tag.substring(1) === "scare") {
            await scare(node, state);
            continue;
        }

        if (tag.substring(1) === "css") {
            $css(state.content(node), true);
            continue;
        }

        if (tag.substring(1) === "noted") {
            await noted(node, state);
            continue;
        }

        if (tag.substring(1) === "footnotes") {
            await footnotes(node, state);
            continue;
        }

        if (tag.substring(1) === "title") {
            await title(node, state);
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
        //if (!state.inline) state.segment.$contextMenu = { items: [], override: true };
        state.domNodes.push(state.segment);
    }

    return state;
}

