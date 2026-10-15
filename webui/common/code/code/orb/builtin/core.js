

const spaceAfter = /[\w,;.:]/;

export async function text(node, state) {
    const content = state.content(node);
    if (state.inlineEnded && /[\w(]/.test(content[0])) {
        state.segment.appendChild(document.createTextNode(" "));
    }
    state.segment.appendChild(document.createTextNode(content));
    state.inlineEnded = false;
    state.pendingSpace = spaceAfter.test(content.at(-1));
}

export async function builtin_break(node, state) {
    if (state.inline) {
        const br = $element("br", "builtin break");
        state.segment.appendChild(br);
        return;
    }
    if (state.segment.childNodes.length > 0) {
        state.segment.$contextMenu = { override: true };
        state.domNodes.push(state.segment);
        state.segment = (state.inline || state.wrapperType === null) ?
            document.createDocumentFragment() :
            $element(state.wrapperType, "post-break wrapper");
    }
}

export async function comment(node, state) { /* :3 */ }

export async function scare(node, state) {
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
}

export async function title(node, state) {
    const title = state.content(node).trim();
    document.title = title;
    document.querySelector('meta[property="og:title"]')
        .setAttribute('content', title);
}

