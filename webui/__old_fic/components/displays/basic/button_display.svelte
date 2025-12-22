<script lang="ts">
    export let message: UiButton;

    let text = "INIT";

    function submit() {
        console.log("foo");
        fetch(`http://localhost:8000/button/${message.cache_id}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then(async response => {
            console.log(await response.json());
        })
        .catch(error => {
            console.log(error);
        });
    }

    $: {
        if (text === "INIT" && message !== undefined) {
            text = message.text;
        }
    }
</script>

<div class=display-container>
    <div class="display">
        <button class="param" on:click={submit}>{text}</button>
    </div>
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

    .param {
        font-family: var(--code-font);
        font-size: var(--code-font-size);
        line-height: 1.5;
        width: 100%;
        padding: 0;
        margin: 0;
        background-color: transparent;
        border: 0;
        border-bottom: 2px solid var(--pane-divider);
        color: var(--plaintext);
        font-size: 1em;
    }

    .param.prompt {
        width: 100%;
        height: 5em;
        resize: vertical;
    }

    .param:focus {
        outline: none;
        background-color: var(--workspace-grid);
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