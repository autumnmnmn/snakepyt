
import * as parserModule from "/code/code/orb/parse.js";
import { asciiModernRomanNumeral as roman } from "/code/math/roman.js";
import { text, builtin_break, scare, title } from "/code/code/orb/builtin/core.js";
import * as notes from "/code/code/orb/builtin/notes.js";
import * as figure from "/code/code/orb/builtin/figure.js";
import * as article from "/code/code/orb/builtin/article.js";

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

const dispatch = {
    ...notes,
    ...figure,
    ...article,
    scare,
    title,
    "css": (node, state) => $css(state.content(node), true),
    "comment": () => {}
};

function unpackSymbol(symbol) {
    let state = null;
    let segment = "";
    let tag = null;
    let id = null;
    let classes = [];

    const transition = (nextState) => {
        if (state === null) {
            tag = (segment === "") ? "div" : segment;
        }
        if (state === "#" && segment !== "") {
            id = segment;
        }
        if (state === "." && segment !== "") {
            classes.push(segment);
        }
        segment = "";
        if (nextState === "#" && id !== null) {
            console.warn(`multiple ids in symbol "${symbol}"`);
        }
        state = nextState;
        segment = "";
    }

    for (let i = 0; i < symbol.length; i++) {
        const char = symbol[i];

        if (char === ".") {
            transition(".");
            continue;
        }
        if (char === "#") {
            transition("#");
            continue;
        }

        segment += char;
    }

    transition("!");

    if (classes.length === 0) classes = null;

    if (tag === "$m") {
        tag = "$math/math";
    }

    if (id) id = $id(id);

    return {
        tag,
        id,
        classes
    }
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

        const symbol = node.tag.symbol;

        if (symbol === TEXT) {
            await text(node, state);
            continue;
        }

        if (symbol === BREAK) {
            await builtin_break(node, state);
            continue;
        }

        const unpack = unpackSymbol(node.tag.symbol);

        const tag = unpack.tag;

        const wrapperType = wrapMap[tag] ?? null;

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

            if (unpack.id) tagElement.id = unpack.id;

            if (unpack.classes) tagElement.classList.add(...unpack.classes);

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
                state.domNodes.push(state.segment);
                state.segment = (state.wrapperType !== null) ?
                    document.createDocumentFragment() :
                    $element(state.wrapperType, "post-noninline wrapper");
            }
            try {
                const tagElement = namespace === null ?
                    $element(tag, "element") :
                    document.createElementNS(namespace, tag);

                if (unpack.id) tagElement.id = unpack.id;

                if (unpack.classes) tagElement.classList.add(...unpack.classes);

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

        const handler = dispatch[tag.substring(1)];

        if (handler !== undefined) {
            await handler(node, state, bracketArgs);
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
        state.domNodes.push(state.segment);
    }

    return state;
}

