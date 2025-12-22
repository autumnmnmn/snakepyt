<script lang="ts">
    import { onMount } from "svelte";
    import TextDisplay from "./basic/text_display.svelte";
    import FailureDisplay from "./basic/failure_display.svelte";
    import ScriptDisplay from "./basic/script_display.svelte";
    import OtherDisplay from "./basic/other_display.svelte";
    import NothingDisplay from "./basic/nothing_display.svelte";
    import ScopeDisplay from "./basic/scope_display.svelte";
    import ImageDisplay from "./basic/image_display.svelte";
    import ParameterDisplay from "./basic/parameter_display.svelte";
    import ButtonDisplay from "./basic/button_display.svelte";

    export let message: Message = { schema: "nothing" };
    export let height: string | null = null;


    export let context = "command_response";

    export let padding = 0.5;

    const displays: {[key: string]: any} = {
        "text": TextDisplay,
        "script": ScriptDisplay,
        "command": ScriptDisplay,
        "failure": FailureDisplay,
        "scope": ScopeDisplay,
        "other": OtherDisplay,
        "nothing": NothingDisplay,
        "image_reference": ImageDisplay,
        "ui_parameter": ParameterDisplay,
        "ui_button": ButtonDisplay
    }

    let props = {
        message,
        context,
        padding
    }

    let component: any = null;

    onMount(() => {
        if (message.schema in displays) {
            component = displays[message.schema];
        } else {
            component = displays["other"];
        }
        props = {
            message,
            context,
            padding
        }
    });

    $: {
        if (message !== undefined) {
            if (message.schema in displays) {
                component = displays[message.schema];
            } else {
                component = displays["other"];
            }
            props = {
                message,
                context,
                padding
            }
        }
    }

    let commandStyle = "";

    $: {
        if (height !== null) {
            commandStyle = `height: ${height};`;
        }
    }

</script>

<div class="message animate-open" style={commandStyle}>
    <svelte:component this={component} {...props} />
</div>


<style>
    .message {
        display: inline-block;
        position: relative;
        /*border: 2px solid var(--pane-divider);
        border-radius: 0.5em;
        */
        /* width: calc(100% - 0.5em - 4px); */
        width: 100%;
        height: 100%;
        overflow: hidden;
        color: red;
        line-height: 0;
    }

    .animate-open {
        /* animation: open 2s ease-in-out; */
    }

    @keyframes open {
        0% {
            max-height: 0;
        }
        100% {
            max-height: 500em;
        }
    }

    .message:not(:last-child) {
        margin-bottom: 0.25em;
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
</style>