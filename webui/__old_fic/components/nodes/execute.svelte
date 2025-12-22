<script lang="ts">
    import { tick } from "svelte";
    import coordinator from "../../coordinator";
    import DragHandle from "../general/drag_handle.svelte";
    import Receiver from "../wiring/receiver.svelte";
    import Transmitter from "../wiring/transmitter.svelte";

    let transmitter: Transmitter;
    export let x: string = "0";
    export let y: string = "0";

    function onReceive(message: Message) {
        if (message.schema !== "command") {
            transmitter.send({ schema: "failure", explanation: `Expected command, got ${message.schema}.` });
            return;
        }

        fetch("http://localhost:8000/fic",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    request_text: message.command,
                    user_name: "fic_api_node"
                })
            })
            .then(async response => {
                transmitter.send(await response.json());
            })
            .catch(error => {
                transmitter.send({ schema: "failure", explanation: "In ficsuit_session.svelte: " + error})
            });
    }

    function getOffset() {
        return {
            x: container.offsetLeft,
            y: container.offsetTop
        }
    }

    function triggerUpdate() {
        let transceivers = coordinator.childTransceivers(container);
            
        transceivers.receivers.forEach(receiver => {
            for (let transmitter of coordinator.receivers[receiver].connections) {
                transmitter.dirty = true;
            }
        });
        transceivers.transmitters.forEach(id => {
            coordinator.transmitters[id].dirty = true;
        });

        let workspaceElement = coordinator.seekParent(container, coordinator.prefixes.workspace);

        if (workspaceElement !== null) {
            let workspace = coordinator.workspaces[workspaceElement.id];
            if (workspace?.renderWires !== null) {
                workspace.renderWires();
            }
        }
    }

    function setPosition(x: string | number | null, y: string | number | null) {
        let left, top;
        
        if (typeof(x) === "number") {
            left = `calc(max(min(${x}px, 100% - ${container.clientWidth}px), 0%))`;
        } else {
            left = `calc(max(min(${x}, 100% - ${container.clientWidth}px), 0%))`;
        }
        if (typeof(y) === "number") {
            top = `calc(max(min(${y}px, 100% - ${container.clientHeight}px), 0%))`;
        } else {
            top = `calc(max(min(${y}, 100% - ${container.clientHeight}px), 0%))`;
        }

        container_position = `left: ${left}; top: ${top};`;

        tick().then(triggerUpdate);
    }

    function onMouseDown(event: MouseEvent) {
        if (event.button === 1) {
            let transceivers = coordinator.childTransceivers(container);
            for (const id of transceivers.receivers) {
                coordinator.removeReceiver(id);
            }
            for (const id of transceivers.transmitters) {
                coordinator.removeTransmitter(id);
            }
            
            let workspaceElement = coordinator.seekParent(container, coordinator.prefixes.workspace);
            
            if (workspaceElement !== null) {
                let workspace = coordinator.workspaces[workspaceElement.id];
                if (workspace?.renderWires !== null) {
                    workspace.renderWires();
                }
            }
            
            container.parentNode?.removeChild(container);
        }
    }

    let container: HTMLDivElement;

    let container_position = `left: ${x}; top: ${y};`;
</script>

<div bind:this={container} class="outer-container" style={container_position}>
    <Receiver schemas={["command"]} {onReceive} style="left: -1.5em; top: 1em;" />
    <DragHandle onDrag={setPosition} getOffset={getOffset}>
        <div class="inner-container" on:mousedown={onMouseDown}>
            <div class="innest-container">
               Execute
            </div>
        </div>
    </DragHandle>
    <Transmitter bind:this={transmitter} style="right: -1.5em; top: 1em;" />
</div>


<style>
    .outer-container {
        position: absolute;
        margin: 0;
        padding: 0;
        border: 0;
        z-index: 5;
    }

    .inner-container {
        position: relative;
        margin: 0;
        padding: 0;
        border: 0;
        width: 7em;
        height: 3em;
        background-color: var(--pane-header);
        border-radius: 1.5em;
    }

    .innest-container {
        position: absolute;
        margin: 0;
        padding: 0;
        border: 0;
        top: 50%;
        left: 50%;
        user-select: none;
        transform: translate(-50%, -50%);
        background-color: var(--pane-backdrop);
        color: var(--plaintext)
    }
</style>