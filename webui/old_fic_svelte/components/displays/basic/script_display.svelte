<script lang="ts">
    // @ts-nocheck
    // typescript hates what we're doing here

    import { afterUpdate } from 'svelte';
    import Prism from 'prismjs';

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
     * @type {HTMLPreElement}
     */
    let code_display_element;

    /**
     * @type {HTMLCodeElement}
     */
    let code_display_content_element;

    export let padding = 0;

    export let font_size = "1em";

    export let message: Command | Script;

    let language: string = "fictionscript";

    Prism.load

    $: {
        if (message !== undefined) {
            if (message.schema === "command") {
                language = "fictionscript";
            }
            else {
                language = message.language;
            }
        }
    }

    let code_style = `width: calc(100% - ${padding * 2}em); top: ${padding}em; left: ${padding}em; font-size: ${font_size} !important;`;

    $: {
        code_style = `width: calc(100% - ${padding * 2}em); top: ${padding}em; left: ${padding}em; font-size: ${font_size} !important;`;
    }

    afterUpdate(async () => {
        let text;
        if (message.schema === "command") {
            text = message.command;
        }
        else {
            text = message.code;
        }

        if(text[text.length-1] == "\n") {
            text += " ";
        }

        code_display_content_element.innerHTML = text.replace(new RegExp("&", "g"), "&amp;").replace(new RegExp("<", "g"), "&lt;");

        Prism.highlightElement(code_display_content_element);
    });
</script>
    
<div class=display-container
    style="font-size: {font_size} !important; padding-bottom: {padding * 1.5}em;">
    <div class=backdrop></div>
    <pre class="code-display" style={code_style} aria-hidden=true bind:this={code_display_element}
        ><code class="language-{language} code-display-content"
            bind:this={code_display_content_element}>{message.schema === "command" ? message.command : message.code}</code></pre>
</div>

<svelte:head>
    <link rel="stylesheet" href="css/prism.css" />
    <link rel="stylesheet" href="css/syntax.css" />
</svelte:head>

<style>
    /* adapted from https://css-tricks.com/creating-an-editable-textarea-that-supports-syntax-highlighted-code/ */
    
    .display-container {
        display: inline-block;
        position: relative;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        height: 100%;
        line-height: 0;
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
        z-index: 0;
    }
    
    .code-display {
        /* Both elements need the same text and space styling so they are directly on top of each other */
        position: relative;
        padding: 0;
        margin: 0;
        border: 0;
        width: calc(100% - 1em);
        word-wrap: break-word;
        white-space: pre-wrap;
        overflow: auto;
        white-space: normal;
        z-index: 1;
    }

    pre {
        box-shadow: none;
        background-color: none !important;
    }
    
    code {
        background-color: none !important;
        border: 0;
    }

    .code-display, .code-display * {
        /* Also add text styles to highlighing tokens */
        font-family: var(--code-font);
        line-height: 1.5;
        tab-size: 4;
    }

    /* Move the textarea in front of the result */
    
    * {
        font-family: var(--code-font);
    }
    
    code[class*="language-"] {
        font-family: var(--code-font);
        text-align: left;
        white-space: pre-wrap;
        word-spacing: normal;
        word-break: normal;
        word-wrap: break-word;
        line-height: 1.5;
    
        -moz-tab-size: 4;
        -o-tab-size: 4;
        tab-size: 4;
    
        -webkit-hyphens: none;
        -moz-hyphens: none;
        -ms-hyphens: none;
        hyphens: none;
    }

    pre[class*="code-display"] {
        background-color: transparent;
    }

    ::-webkit-scrollbar {
        width: 0.5em;
        position: absolute;
        right: 0.5em;
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
</style>