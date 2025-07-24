<script lang="ts">
    export let message: UiParameter;

    let value = "INIT";
    let type = "INIT";

    function submit() {
        console.log("foo");
        fetch(`http://localhost:8000/set_value/${message.cache_id}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                value: value
            })
        })
        .then(async response => {
            console.log(await response.json());
        })
        .catch(error => {
            console.log(error);
        });
    }

    $: {
        if (value === "INIT" && message !== undefined) {
            value = message.value;
            type = message.type;
        }
    }
</script>

<div class=display-container>
    <div class="display">
        {#if type === "INIT"}
            <div></div>
        {:else if type.startsWith("prompt")}
            <textarea class="param prompt" bind:value={value} on:blur={submit} />
        {:else if type.startsWith("int")}
            <input class="param int" type="number" bind:value={value} on:blur={submit} />
        {:else if type.startsWith("number")}
            <input class="param num" type="number" bind:value={value} on:blur={submit} />
        {:else if type.startsWith("seed")}
            <input class="param prompt" bind:value={value} on:blur={submit} />
        {/if}
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
