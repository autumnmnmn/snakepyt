
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
    return tokens.map(token => renderToken(token)).join('');
}


function renderCssToken(token) {
    const escaped = escapeHtml(token.value);

    // Map CSS token types to appropriate classes
    switch (token.type) {
        case 'at-rule':
            return `<span class="token-operator">${escaped}</span>`;
        case 'property':
            return `<span class="token-property">${escaped}</span>`;
        case 'color':
            return `<span class="token-color">${escaped}</span>`;
        case 'number':
        case 'number-unit':
            return `<span class="token-number">${escaped}</span>`;
        case 'string':
            return `<span class="token-string">${escaped}</span>`;
        case 'url':
            return `<span class="token-regex">${escaped}</span>`;
        case 'function':
            return `<span class="token-function">${escaped}</span>`;
        case 'pseudo-class':
        case 'pseudo-element':
            return `<span class="token-css-pseudo">${escaped}</span>`;
        case 'variable':
            return `<span class="token-identifier">${escaped}</span>`;
        case 'comment':
            return `<span class="token-comment">${escaped}</span>`;
        case 'important':
            return `<span class="token-keyword">${escaped}</span>`;
        case 'punctuation':
            if ('{}[]()'.includes(token.value)) {
                return `<span class="token-bracket">${escaped}</span>`;
            }
            return `<span class="token-punctuation">${escaped}</span>`;
        case 'operator':
            return `<span class="token-operator">${escaped}</span>`;
        case 'delimiter':
            return `<span class="token-punctuation">${escaped}</span>`;
        case 'identifier':
            return `<span class="token-identifier">${escaped}</span>`;
        default:
            return `<span class="token-css-${token.type}">${escaped}</span>`;
    }
}

function renderToken(token) {
    const escaped = escapeHtml(token.value);

    // Language-specific token rendering can be overridden
    if (token.type === 'template-expression') {
        const inner = token.value.slice(2, -1); // Remove ${ and }
        const innerHighlighted = highlight(inner);
        return `<span class="token-template-expression">\${${innerHighlighted}}</span>`;
    }

    if (token.type === 'css-string') {
        // Extract the CSS content and render it with CSS highlighting
        const openQuote = token.value[0];
        const cssMarker = '/* css */';
        const markerStart = token.value.indexOf(cssMarker);
        const cssStart = markerStart + cssMarker.length;
        const cssEnd = token.value.lastIndexOf(openQuote);
        
        if (markerStart !== -1 && cssEnd > cssStart) {
            const prefix = escapeHtml(token.value.slice(0, cssStart));
            const suffix = escapeHtml(token.value.slice(cssEnd));
            const cssHighlighted = token.cssTokens.map(renderCssToken).join('');
            return `<span class="token-string">${prefix}${cssHighlighted}${suffix}</span>`;
        }
        // Fallback to regular string rendering if parsing fails
        return `<span class="token-string">${escaped}</span>`;
    }

    if (token.type === 'punctuation' && '{}[]()'.includes(token.value)) {
        return `<span class="token-bracket">${escaped}</span>`;
    }

    return `<span class="token-${token.type}">${escaped}</span>`;
}

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
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
    editor.value = `function fibonacci(n) {
    // Base cases
    if (n <= 1) return n;

    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
        const temp = a + b;
        a = b;
        b = temp;
    }
    return b;
}

// Example usage
const result = fibonacci(10);
console.log(\`Fibonacci of 10 is: \${result}\`);

// Arrow function with regex
const validate = (str) => /^[a-zA-Z]+$/.test(str);
const template = \`Hello \${name}, today is \${new Date().toDateString()}\`;`;

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
        output.innerHTML = highlighted;
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

