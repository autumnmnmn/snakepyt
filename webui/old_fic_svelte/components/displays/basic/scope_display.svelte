<script lang="ts">
    import MessageDisplay from "../message_display.svelte";
    import ScriptDisplay from "./script_display.svelte";
    import Toggle from "../../general/toggle.svelte";
    import TextDisplay from "./text_display.svelte";

    export let message: Scope;

    let title: PlainText;

    let variableNames: {name: string, class: string}[] = [];

    let specialNames = ["default", "increment", "decrement", "add", "subtract", "inspect", "dump"]

    let props = {
        context: "scope",
        padding: 0.5
    }

    $: {
        title = { "schema": "text", "value": `### ${message.name}` };
        if (message !== undefined && message.content !== undefined) {
            variableNames = [];
            for (let variable in message.content) {
                variableNames.push({name: variable, class: specialNames.includes(variable) ? "special" : ""})
            }
        }
    }
</script>

<div class=scope>
    <TextDisplay message="{title}" {...props} />
    {#each variableNames as variable}
    <div class=scope-content-container>
        <div class=scope-content>
            <Toggle state={true}>
                <div slot=on style="user-select: none; cursor: pointer;">
                    <span class={variable.class}>
                        {variable.name}
                    </span>
                    <div style="user-select: text; cursor: auto;" class="animate-open" on:mousedown|stopPropagation={()=>{}}>
                        <MessageDisplay message="{message.content[variable.name]}" {...props} />
                    </div>
                </div>
                <div slot=off style="user-select: none; cursor: pointer;">
                    <span class={variable.class}>
                        {variable.name}
                    </span>
                </div>
            </Toggle>
        </div>
    </div>
    {/each}
</div>
    
<style>
    .scope {
        position: relative;
        line-height: 1.5;
    }

    .animate-open {
        animation: open 0.5s ease-in-out;
        width: calc(100% - 1px);
        height: calc(100% - 1px);
        border-top: 1px solid var(--pane-divider);
        border-left: 1px solid var(--pane-divider);
        top: 0;
        margin: 0;
        padding: 0;
        line-height: 0;
    }

    .special {
        color: var(--ficscript-method);
    }

    @keyframes open {
        0% {
            max-height: 0;
            max-width: 0;
        }
        100% {
            max-height: 500em;
            max-width: 500em;
        }
    }

    .scope-content-container {
        display: inline-block;
        position: relative;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        background-color: var(--code-editor-background);
    }

    .scope-content {
        position: relative;
        padding: 0;
        margin: 0;
        left: 0.5em;
        width: calc(100% - 2px);
        word-wrap: break-word;
        overflow: auto;
        white-space: pre-wrap;

        color: var(--ficscript-variable);
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