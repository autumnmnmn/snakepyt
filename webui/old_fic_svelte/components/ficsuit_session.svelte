<script context="module">
    let last_user = 0;
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import ScriptInput from "./nodes/inputs/script_input.svelte";
    import PaneColumn from "./layout/pane_column.svelte";
    import Feed from "./nodes/feed.svelte";
    import Emptiness from "./layout/emptiness.svelte";

    let nextCommand = "";
    let container: HTMLDivElement;

    last_user++;
    let session_name = `user_${last_user}`;

    onMount(async () => {
        onSubmit("motd", true);
    });

    let onMessage: (m: Message) => void;

    function onSubmit(command: string, hide_command: boolean = false) {
        if (command === "exit") {
            remove();
            return;
        }
        if (command === "clear") {
            feed.clear();
            return;
        }
        if (!hide_command) {
            onMessage({ schema: "command", command: command });
        }
        fetch("http://localhost:8000/fic",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    request_text: command,
                    user_name: session_name
                })
            })
            .then(async response => {
                onMessage(await response.json());
            })
            .catch(error => {
                onMessage({ schema: "failure", explanation: "In ficsuit_session.svelte: " + error})
            });
    }

    function remove() {
        let parent = container.parentElement!;
        parent.removeChild(container);
        let emptiness = new Emptiness({
            target: parent,
            props: {
            }
        });
    }

    let feed: Feed;
</script>

<div class=container bind:this={container}>
    <PaneColumn topPercent={80} bottomPercent={20}>
        <Feed slot=top bind:onReceive={onMessage} bind:this={feed} />
        <ScriptInput slot=bottom bind:code={nextCommand} onSubmit={onSubmit} />
    </PaneColumn>
</div>

<style>
    .container {
        position: absolute;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        height: 100%;
    }
</style>