
const sheet = new CSSStyleSheet();
sheet.replaceSync(`/* css */
    .highlight-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background-color: var(--main-background);
        color: var(--main-solid);
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    }

    .highlight-toolbar {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem 1rem;
        background-color: var(--main-faded);
        border-bottom: 1px solid var(--main-border);
        font-size: 0.9rem;
    }

    .highlight-content {
        flex: 1;
        display: flex;
        overflow: hidden;
        position: relative;
        word-wrap: break-word;
        white-space: pre-wrap;
    }

    .highlight-editor {
        flex: 1;
        background-color: transparent;
        color: transparent;
        caret-color: var(--main-solid);
        border: none;
        padding: 1rem;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.4;
        resize: none;
        outline: none;
        tab-size: 4;
        overflow: scroll;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2;
    }

    .highlight-editor::selection { background-color: rgba(255, 255, 255, 0.2); }

    .highlight-output {
        flex: 1;
        background-color: transparent;
        padding: 1rem;
        overflow: scroll;
        font-size: 14px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-wrap: break-word;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 1;
    }

    /* Syntax highlighting styles */
    .token-keyword { color: var(--code-keyword); font-weight: bold; }
    .token-string { color: var(--code-string); }
    .token-template-literal { color: var(--code-template-literal); }
    .token-template-expression { color: var(--main-solid); background-color: var(--main-faded); }
    .token-comment { color: var(--code-comment); font-style: italic; }
    .token-number { color: var(--code-number); }
    .token-operator { color: var(--code-operator); }
    .token-punctuation { color: var(--code-punctuation); }
    .token-function { color: var(--code-function); }
    .token-property { color: var(--code-property); }
    .token-bracket { color: var(--code-bracket); }
    .token-builtin { color: var(--code-builtin); }
    .token-regex { color: var(--code-regex); }
    .token-identifier { color: var(--code-identifier); }
    .token-whitespace { color: var(--code-whitespace); }
    .token-unknown { color: var(--code-unknown); }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

const tokenizer_js = await import("/js_tokenizer.js");

function highlight(code) {
    const tokens = tokenizer_js.tokenize(code);
    const fragment = document.createDocumentFragment();

    tokens.forEach(token => {
        const element = renderToken(token);
        fragment.appendChild(element);
    });

    return fragment;
}

function renderCssToken(token) {
    if (!token || typeof token.value !== 'string') {
        console.error(token);
    }

    const tokenTypeMap = {
        'at-rule': 'token-operator',
        'property': 'token-property',
        'color': 'token-color',
        'number': 'token-number',
        'number-unit': 'token-number',
        'string': 'token-string',
        'url': 'token-regex',
        'function': 'token-function',
        'pseudo-class': 'token-css-pseudo',
        'pseudo-element': 'token-css-pseudo',
        'variable': 'token-identifier',
        'comment': 'token-comment',
        'important': 'token-keyword',
        'operator': 'token-operator',
        'delimiter': 'token-punctuation',
        'identifier': 'token-identifier',
        'unknown': 'token-unknown'
    };

    const span = document.createElement('span');
    span.textContent = token.value;

    if (token.type === 'punctuation') {
        span.className = '{}[]()'.includes(token.value) ? 'token-bracket' : 'token-punctuation';
    } else {
        span.className = tokenTypeMap[token.type] || `token-${token.type}`;
    }

    return span;
}

function renderToken(token) {
    // Language-specific token rendering can be overridden
    if (token.type === 'template-expression') {
        const span = document.createElement('span');
        span.className = 'token-template-expression';

        // Add the opening ${
        span.appendChild(document.createTextNode('${'));

        // Extract and highlight the inner expression
        const inner = token.value.slice(2, -1); // Remove ${ and }
        const innerHighlighted = highlight(inner);
        span.appendChild(innerHighlighted);

        // Add the closing }
        span.appendChild(document.createTextNode('}'));

        return span;
    }

    if (token.type === 'css-string') {
        const span = document.createElement('span');
        span.className = 'token-string';

        // Extract the CSS content and render it with CSS highlighting
        const openQuote = token.value[0];
        const cssMarker = '/* css */';
        const markerStart = token.value.indexOf(cssMarker);
        const cssStart = markerStart + cssMarker.length;
        const cssEnd = token.value.lastIndexOf(openQuote);

        if (markerStart !== -1 && cssEnd > cssStart) {
            const prefix = token.value.slice(0, cssStart);
            const suffix = token.value.slice(cssEnd);

            span.appendChild(document.createTextNode(prefix));

            // Render CSS tokens
            const cssFragment = document.createDocumentFragment();
            token.cssTokens.forEach(cssToken => {
                cssFragment.appendChild(renderCssToken(cssToken));
            });
            span.appendChild(cssFragment);

            span.appendChild(document.createTextNode(suffix));

            return span;
        }
        // Fallback to regular string rendering if parsing fails
        span.textContent = token.value;
        return span;
    }

    const span = document.createElement('span');
    span.textContent = token.value;

    if (token.type === 'punctuation' && '{}[]()'.includes(token.value)) {
        span.className = 'token-bracket';
    } else {
        span.className = `token-${token.type}`;
    }

    return span;
}

export async function main(target) {
    const container = document.createElement('div');
    container.className = 'highlight-container';

    const content = document.createElement('div');
    content.className = 'highlight-content';

    const editor = document.createElement('textarea');
    editor.className = 'highlight-editor';
    editor.spellcheck = false;
    editor.placeholder = '...';
    editor.value = ``;

    const preformatted = document.createElement('pre');

    const output = document.createElement('code');
    output.className = 'highlight-output';

    preformatted.appendChild(output);

    content.appendChild(editor);
    content.appendChild(preformatted);

    container.appendChild(content);

    function updateHighlight() {
        const code = editor.value;
        const highlighted = highlight(code);

        // Clear existing content
        output.innerHTML = '';

        // Append the highlighted DOM fragment
        output.appendChild(highlighted);

        if (code.endsWith('\n')) {
            // zero-width space to preserve trailing newline
            output.appendChild(document.createTextNode('\u200B'));
        }
    }

    editor.addEventListener('input', updateHighlight);
    editor.addEventListener('scroll', () => {
        output.scrollTop = editor.scrollTop;
        output.scrollLeft = editor.scrollLeft;
    });

    // Initial highlight
    updateHighlight();

    target.appendChild(container);

    return {
        replace: true
    };
}

