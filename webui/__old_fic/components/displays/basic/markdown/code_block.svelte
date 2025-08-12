<!-- Renderer for markdown code blocks -->

<script lang="ts">
    import ScriptDisplay from "../script_display.svelte";

    export let lang: string = "";
    export let text: string = "";

    let script: Script = {
        schema: "script",
        code: text,
        language: lang,
        source_file: ""
    };

    $: {
        script = {
            schema: "script",
            code: text,
            language: lang,
            source_file: ""
        };
    }
</script>

<div class=container>
    <ScriptDisplay message={script} padding={0} />
</div>

<style>
    .container {
        position: relative;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        border: 0;
        line-height: 0;
        border-left: 1px solid var(--pane-divider);
        border-top: 1px solid var(--pane-divider);
        padding-left: 0.5em;
        padding-top: 0.5em;
        margin-bottom: 0.5em;
    }
</style>