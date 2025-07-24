<script lang="ts">
    import ScriptDisplay from "./script_display.svelte";

    export let message: Other;

    let asJson: Script;

    $: {
        if (message !== undefined) {
            if (message.description !== undefined) {
                asJson = { "schema": "script", "language": "javascript", "code": message.description, "source_file": "" };
            } else {
                asJson = { "schema": "script", "language": "javascript", "code": JSON.stringify(message), "source_file": "" };
            }
        } else {
            asJson = { "schema": "script", "language": "javascript", "code": "[nothing]", "source_file": "" };
        }
    }
</script>

<div class=display-container>
    <ScriptDisplay message={asJson} padding={0} />
</div>

<style>
    .display-container {
        display: inline-block;
        position: relative;
        margin: 0;
        padding: 0;
        border: 0;
        top: 0.5em;
        left: 0.5em;
        padding-bottom: 0.75em;
        width: 100%;
        background-color: var(--code-editor-background);
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