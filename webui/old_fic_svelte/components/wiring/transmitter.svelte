<script lang="ts">
    import { onMount } from "svelte";
    import DragHandle from "../general/drag_handle.svelte";
    import coordinator from "../../coordinator";
    
    export let schemas: string[] = ["any"];
    
    export let style: string = "";

    let dragging = false;
    let dragHandleBaseStyle = "width: 0.5em; height: 0.5em; border-radius: 50%; background-color: green; cursor: pointer; z-index: 3;"
    let dragHandleStyle = dragHandleBaseStyle;
    let fontsize: number = 1;

    let handleX = 0;
    let handleY = 0;
    let controlOffset = 0;

    export function send(message: Message) {
        for (let connection of coordinator.transmitters[id].connections) {
            connection.onSignal(message);
        }
    }

    function onDragStart() {

        dragging = true;
        let position = `bottom: 1.25em; right: 0.75em;`;
        dragHandleStyle = `${dragHandleBaseStyle} ${position} position: absolute;`

        getFontSize();
        
        handleX = 0;
        handleY = 0;

        controlOffset = 0.5 * Math.abs(handleX);
        if (controlOffset < 0) controlOffset = 0;
    }

    function onDragEnd() {
        dragging = false;

        let rect = container.getBoundingClientRect();

        let x = handleX + container.clientWidth + rect.left - 1 * fontsize;
        let y = handleY + container.clientHeight + rect.top - 1 * fontsize;

        let receiverId = coordinator.idAtLocation(x, y, coordinator.prefixes.receiver);

        if (receiverId === null) return;
        if (coordinator.receivers[receiverId] === undefined) return;

        let acceptedSchemas = coordinator.receivers[receiverId].schemas;
        if (!acceptedSchemas.includes("any")) {
            if (!schemas.every(schema => acceptedSchemas.includes(schema))) return;
        }

        coordinator.connect(id, receiverId);
    }

    function svgPathVariables(receiver: Element, id: string) {
        let receiverRect = receiver.getBoundingClientRect();
        let containerRect = container.getBoundingClientRect();

        let x = receiverRect.left - container.clientWidth - containerRect.left + 1.5 * fontsize;
        let y = receiverRect.top - container.clientHeight - containerRect.top + 2 * fontsize;

        let offset = 0.5 * Math.abs(x);
        if (offset < 120) offset = 120;

        return {x, y, offset, id};
    }

    function onDrag(x: number | string | null, y: number | string | null) {
        let position = `left: calc(${x}px + 0.75em); top: calc(${y}px + 1.25em);`;
        dragHandleStyle = `${dragHandleBaseStyle} ${position} position: absolute;`

        if (typeof x !== "number") {
            x = 0;
        }
        if (typeof y !== "number") {
            y = 0;
        }

        handleX = x - container.clientWidth + 1.5 * fontsize;
        handleY = y - container.clientHeight + 2 * fontsize;

        controlOffset = 0.5 * Math.abs(handleX);
        if (controlOffset < 0) controlOffset = 0;
    }

    function getFontSize() {
        fontsize = parseFloat(getComputedStyle(container).fontSize);
    }

    function getOffset() {
        return {
            x: container.clientWidth - fontsize * 1.5,
            y: container.clientHeight - fontsize * 2
        }
    }

    let id: string = coordinator.prefixes.transmitter + "-" + crypto.randomUUID();

    let container: HTMLElement;

    onMount(() => {
        coordinator.registerTransmitter(id, container, () => { foo = true; }, schemas, []);
        getFontSize();
    });

    let connectionDisplayData: { x: number, y: number, offset: number, id: string }[] = []

    let foo = false;

    $: {
        if (foo && coordinator.transmitters[id] !== undefined) {
            foo = false;
            connectionDisplayData = [];
            for (let connection of coordinator.transmitters[id].connections) {
                connectionDisplayData.push(svgPathVariables(connection.element, connection.id));
            }
        }
    }
</script>

<div {id} class="container" bind:this={container} {style}>
    <div class="transmitter {schemas.join(' ')}" {...$$restProps} style={dragging ? "" : "visibility: hidden;"} />

    {#if dragging}
        <svg xmlns="http://www.w3.org/2000/svg" style="overflow: visible; position: absolute; top: calc(100% - 0.5em); left: calc(100% - 0.5em); z-index: 3; pointer-events: none;">
            <path d="M {0} {0} C {controlOffset} {0}, {handleX - controlOffset} {handleY}, {handleX} {handleY}" class="connection {schemas.join(' ')}" stroke-width="4" fill="none" style="pointer-events: auto;" />
        </svg>
    {/if}

    <DragHandle {onDragStart} {onDrag} {onDragEnd} {getOffset} style={dragging ? dragHandleStyle : ""}>
        <div class="transmitter {schemas.join(' ')}" {...$$restProps} style={dragging ? "visibility: hidden;" : ""}>
        </div>
    </DragHandle>
</div>

<style>
    .container {
        position: absolute;
        height: 1em;
        width: 1em;
        z-index: 3;
    }

    .transmitter {
        background-color: red;
        position: absolute;
        height: 1em;
        width: 1em;
        border-radius: 50%;
        cursor: pointer;
        z-index: 100;
    }

    .transmitter.any {
        background-color: var(--wire-any);
    }

    .transmitter.command {
        background-color: var(--wire-command);
    }

    .connection {
        stroke: red;
        z-index: -10;
    }

    .connection.any {
        stroke: var(--wire-any);
    }

    .connection.command {
        stroke: var(--wire-command);
    }

    .connection-selector {
        stroke: transparent;
    }

    .connection-selector:hover {
        stroke: #FFF5;
    }
</style>