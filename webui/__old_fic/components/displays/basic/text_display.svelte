<script lang="ts">
    import SvelteMarkdown from "svelte-markdown";
    import CodeBlock from "./markdown/code_block.svelte";

    export let message: PlainText;
</script>

<div class=display-container>
    <!-- TODO: make "use markdown" a setting in PlainText
        <pre class=display>{message.value}</pre>
    -->
    <pre class=display><SvelteMarkdown 
        source={message.value} 
        renderers={{ code: CodeBlock }}
        /></pre>
</div>

<svelte:head>
    <link rel="stylesheet" href="css/markdown.css" />
</svelte:head>

<style>
    .display-container {
        display: inline-block;
        position: relative;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        height: 100%;
        padding-bottom: 0.75em;
        line-height: 0;
        background-color: var(--code-editor-background);
    }

    .display {
        position: relative;
        padding: 0;
        margin: 0;
        top: 0.5em;
        left: 0.5em;
        width: calc(100% - 1em);
        word-wrap: break-word;
        overflow: auto;
        white-space: pre-wrap;
        line-height: 0;
    }

    /* Identical to scrollbar styling of script_input.svelte. consider extracting to site.css */
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