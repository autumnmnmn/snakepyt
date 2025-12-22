<script lang="ts">
    export let message: Failure;
</script>

<div class=display-container>
    <pre class=display>Failure: {message.explanation}</pre>
</div>

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
        background-color: var(--code-editor-background);
        line-height: 1.5;
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

        color: var(--ficscript-failure);
        font-weight: bold;
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