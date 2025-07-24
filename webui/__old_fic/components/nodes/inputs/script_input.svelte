<script lang="ts">
    // @ts-nocheck
    // typescript hates what we're doing here

    import { onMount } from 'svelte';
    import Transmitter from '../../wiring/transmitter.svelte';

    Prism.languages['fictionscript'] = {
        'fic-comment': /^\s*#.*/,
        'message': {
            pattern: /^\s*(.|\n)*/,
            inside: {
                'method-no-at': {
                    pattern: /<[^@]*>.*/,
                    inside: {
                        'fic-variable': {
                            pattern: /(<)[^\+-\?>]*/,
                            lookbehind: true,
                        },
                        //'operator': /(\+\+|--|\+|-|\?|\?\?)\s*>/,
                        'fic-brackets': /(<|@|(|\+\+|--|\+|-|\?|\?\?)\s*>)/,
                    }
                },
                'method-at': {
                    pattern: /<.*@.*>.*/,
                    inside: {
                        'fic-variable': {
                            pattern: /(@)[^\+-\?>@]*/,
                            lookbehind: true,
                        },
                        'fic-method': {
                            pattern: /(<)[^@>]*(?<![@>])/,
                            lookbehind: true,
                        },
                        //'operator': /(\+\+|--|\+|-|\?|\?\?)\s*>/,
                        'fic-brackets': /(<|@|(|\+\+|--|\+|-|\?|\?\?)\s*>)/,
                    }
                },
                'set-literal': {
                    pattern: /(\.|arg|var|insert).*?:=.*/,
                    inside: {
                        'fic-string': {
                            pattern: /(\:=).*/,
                            lookbehind: true,
                        },
                        'fic-variable': {
                            pattern: /(\.)[^.:]*/,
                            lookbehind: true,
                            greedy: true,
                        },
                        'fic-accessors': /(\.|args?|var|insert|:=)/,
                    }
                },
                'set': {
                    pattern: /(\.|arg|var|insert).*?=.*/,
                    inside: {
                        'expression': {
                            pattern: /(\=).*/,
                            lookbehind: true,
                            inside: null
                        },
                        'fic-variable': {
                            pattern: /(\.)[^.=]*/,
                            lookbehind: true,
                            greedy: true,
                        },
                        'fic-accessors': /(\.|arg|var|insert|=)/,
                    }
                },
                'get': {
                    pattern: /(\.|args?|retrieve).*/,
                    inside: {
                        'fic-variable': {
                            pattern: /(\.)(\s|[^.(\?\s*$)])*/,
                            lookbehind: true,
                            greedy: true,
                        },
                        'fic-accessors': /(\.|args?|retrieve|=|\?)/,
                    }
                }
            }
        }
        //'number': /(\.|arg|var|insert|retrieve)(?:\s*(.*?)\s*(\.))*?\s*(.*?)\s*(:=).*\n.*/,
    };

    Prism.languages['fictionscript']['message'].inside['set'].inside['expression'].inside = Prism.languages['fictionscript']['message'].inside;

    /**
     * @param {string} text
     */
    function update(text) {
        // Handle final newlines (see article)
        if(text[text.length-1] == "\n") {
            text += " ";
        }
        // Update code
        code_display_content_element.innerHTML = text.replace(new RegExp("&", "g"), "&amp;").replace(new RegExp("<", "g"), "&lt;"); /* Global RegExp */
        // Syntax Highlight
        Prism.highlightElement(code_display_content_element);
    }

    /**
     * @param {HTMLTextAreaElement} element
     */
    function sync_scroll(element) {
        /* Scroll result to scroll coords of event - sync with textarea */
        // Get and set x and y
        code_display_element.scrollTop = element.scrollTop;
        code_display_element.scrollLeft = element.scrollLeft;
    }

    /**
     * @param {{ value: string; selectionStart: number; selectionEnd: number; }} element
     * @param {{ key: string; preventDefault: () => void; }} event
     */
    function on_key(element, event) {
        let code = element.value;
        if(event.key == "Tab") {
            /* Tab key pressed */
            event.preventDefault(); // stop normal
            let before_tab = code.slice(0, element.selectionStart); // text before tab
            let after_tab = code.slice(element.selectionEnd, element.value.length); // text after tab
            let cursor_pos = element.selectionStart + 1; // where cursor moves after tab - moving forward by 1 char to after tab
            element.value = before_tab + "\t" + after_tab; // add tab char
            // move cursor
            element.selectionStart = cursor_pos;
            element.selectionEnd = cursor_pos;
            update(element.value); // Update text to include indent
        }

        if(!event.shiftKey && (event.key === "Enter" || event.keyCode === 13)) {
            onSubmit(code);
            //transmitter.send({ schema: "script", code: code, language: "fictionscript" });
            transmitter.send({ schema: "command", command: code });
            element.value = "";
            update("");
            event.preventDefault();
        }
    }

    /**
     * @type {HTMLTextAreaElement}
     */
    let code_input_element;

    /**
     * @type {HTMLPreElement}
     */
    let code_display_element;

    /**
     * @type {HTMLCodeElement}
     */
    let code_display_content_element;

    let transmitter;

    export let width = "100%";
    export let height = "100%";
    export let padding = "10";

    export let font_size = "1em";

    export let code = "";

    export let onSubmit = (value) => {};

    let code_style = `width: calc(100% - ${padding * 2}px); height: calc(100% - ${padding * 2}px); top: ${padding}px; left: ${padding}px; font-size: ${font_size} !important;`;

    onMount(async () => {
        update(code);
    });
</script>

<div class=wrapper
    style="width: {width}; height: {height}; font-size: {font_size} !important;">
    <div class=backdrop></div>
    <textarea
    placeholder="..."
    class=code-input
    style={code_style}
    spellcheck=false
    bind:this={code_input_element}
    bind:value={code}
    on:input={() => {update(code_input_element.value); sync_scroll(code_input_element);}}
    on:scroll={() => {sync_scroll(code_input_element);}}
    on:keydown={(event) => {on_key(code_input_element, event);}}
    />

    <pre class="code-display" style={code_style} aria-hidden=true bind:this={code_display_element}>
        <code class="language-fictionscript code-display-content"
            bind:this={code_display_content_element} />
    </pre>

    <Transmitter schemas={["command"]} bind:this={transmitter} style="right: -1.5em;" />
</div>

<svelte:head>
    <link rel="stylesheet" href="css/prism.css" />
    <link rel="stylesheet" href="css/syntax.css" />
</svelte:head>

<style>
    /* adapted from https://css-tricks.com/creating-an-editable-textarea-that-supports-syntax-highlighted-code/ */

    .wrapper {
        cursor: default;
        position: relative;
        display: flex;
    }

    .backdrop {
        position: absolute;
        top: 0;
        left: 0;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        height: 100%;
        background-color: var(--code-editor-background);
    }

    .code-input, .code-display {
        /* Both elements need the same text and space styling so they are directly on top of each other */
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
    }

    pre {
        box-shadow: none;
        background-color: none !important;
    }

    code {
        background-color: none !important;
    }

    .code-input:focus {
        border: 0;
        outline: 0;
    }

    ::-webkit-scrollbar {
        width: 10px;
        position: absolute;
        right: 10px;
    }

    ::-webkit-scrollbar-track {
        background: #344;
        cursor: pointer !important;
    }

    ::-webkit-scrollbar-thumb {
        background: #788;
        cursor: pointer !important;
    }

    ::-webkit-scrollbar-track:hover, ::-webkit-scrollbar-thumb:hover {
        cursor: pointer !important;
        user-select: none;
    }

    .code-input, .code-display, .code-display * {
        /* Also add text styles to highlighing tokens */
        font-family: var(--code-font);
        line-height: 1.5em !important;
        tab-size: 4;
    }

    .code-input, .code-display {
        /* In the same place */
        position: absolute;
    }

    /* Move the textarea in front of the result */

    .code-input {
        z-index: 2;
    }
    .code-display {
        z-index: 1;
    }
    .backdrop {
        z-index: 0;
    }


    /* Make textarea almost completely transparent */

    .code-input {
        color: transparent;
        background: transparent;
        caret-color: white;

        /* Can be scrolled */
        overflow: auto;
        white-space: pre-wrap;
        word-wrap: break-word;

        /* Fix cursor of scrollbar */
        cursor: auto;
    }

    .code-display {
        overflow: auto;
        white-space: normal;
        word-wrap: break-word;
        user-select: none;
    }

    /* No resize on textarea */
    .code-input {
        resize: none;
    }

    /* Paragraphs; First Image */
    * {
        font-family: var(--code-font);
    }

    /* Syntax Highlighting from prism.js starts below, partly modified: */

    /* PrismJS 1.23.0
    https://prismjs.com/download.html#themes=prism-funky&languages=markup */
    /**
    * prism.js Funky theme
    * Based on “Polyfilling the gaps” talk slides http://lea.verou.me/polyfilling-the-gaps/
    * @author Lea Verou
    */

    code[class*="language-"] {
        font-family: var(--code-font);
        text-align: left;
        white-space: pre-wrap;
        word-spacing: normal;
        word-break: normal;
        word-wrap: break-word;
        line-height: 1.5;

        border: 0;

        -moz-tab-size: 4;
        -o-tab-size: 4;
        tab-size: 4;

        -webkit-hyphens: none;
        -moz-hyphens: none;
        -ms-hyphens: none;
        hyphens: none;
    }

    /* Inline code */
    :not(pre) > code[class*="language-"] {
        padding: .2em;
        border-radius: .3em;
        white-space: normal;
    }

    pre[class*="code-display"] {
        background-color: transparent;
    }
</style>
