<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import coordinator, { type Transmitter } from "../../coordinator";

    export let schemas: string[] = ["any"];

    export let style: string = "";

    export let onReceive: (message: Message) => void = m => { console.log(`Received message with schema ${m.schema}.`); };

    let id: string = coordinator.prefixes.receiver + "-" + crypto.randomUUID();

    let element: HTMLDivElement;

    onMount(() => {
        coordinator.registerReceiver(id, element, schemas, onReceive, []);
    });

    onDestroy(() => {
        coordinator.removeReceiver(id);
    });
</script>

<div bind:this={element} class=container {style} {...$$restProps}>
    <div {id} class=dish>
        <div class="receiver {schemas.join(' ')}" />
    </div>
</div>

<style>
    .container {
        position: absolute;
        height: 1em;
        width: 1em;
        z-index: 3;
    }

    .dish {
        background-color: transparent;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 3em;
        height: 3em;
        border-radius: 50%;
    }

    .receiver {
        background-color: blue;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 1em;
        height: 1em;
        border-radius: 50%;
        cursor: pointer;
        z-index: 100;
    }

    .receiver.any {
        background-color: var(--wire-any);
    }

    .receiver.command {
        background-color: var(--wire-command);
    }
</style>