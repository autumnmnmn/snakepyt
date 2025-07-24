<!-- A window pane, containing anything or nothing. -->

<script context="module" lang="ts">
    /**
     * @type
     */
    export let instances: ({z_index: number, container: HTMLDivElement, onUpdate: ((z_index: number) => void)})[] = [];
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import { onDestroy } from "svelte";

    import DragHandle from "../general/drag_handle.svelte";
    import Emptiness from "./emptiness.svelte";
    import { tick } from "svelte";
    import coordinator from "../../coordinator";

    export let width = 300;
    export let height = 200;
    
    export let x = `50% - ${width / 2}px`;
    export let y = `50% - ${height / 2}px`;
    
    export let title = "Untitled";
    export let scale = "1em";

    export let content: HTMLElement | null = null;

    // The exported values are only used for initialization
    let w = 0;
    let h = 0;
    let z_index = 10;

    let container: HTMLDivElement;
    let contentParent: HTMLElement;

    let container_position = "";
    let container_size = "";
    let body_style = "";


    let title_style = ``;

    resize(width, height);

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

    function getOffset() {
        return {
            x: container.offsetLeft,
            y: container.offsetTop
        }
    }

    function brOffset() {
        return {
            x: container.offsetLeft + w,
            y: container.offsetTop + h
        }
    }

    function resize(width: string | number | null, height: string | number | null) {
        let left, top, wLimit, hLimit;
        if (container === undefined) {
            left = 0;
            top = 0;
            wLimit = null;
            hLimit = null;
        } else {
            left = container.offsetLeft;
            top = container.offsetTop;

            wLimit = container.parentElement?.clientWidth ?? null;
            hLimit = container.parentElement?.clientHeight ?? null;
        }

        if (width === null) {
            width = w + left;
        }
        if (height === null) {
            height = h + top;
        }
        
        if (typeof(width) !== "number" || typeof(height) !== "number") {
            return;
        }


        w = width - left;
        h = height - top;

        if (wLimit !== null) {
            w = Math.min(w, wLimit - left);
        }

        if (hLimit !== null) {
            h = Math.min(h, hLimit - top);
        }

        let width_style = `calc(min(max(${w}px, 8em), 100%))`;
        let height_style = `calc(min(max(${h}px, 5em), 100%))`;

        container_size = `width: ${width_style}; height: ${height_style};`;
        body_style = `height: calc(min(max(${h}px - 1.5em, 5em), 100% - 1.5em));`;

        tick().then(triggerUpdate);
    }

    function takeFront(event: MouseEvent) {
        let old_index = z_index;
        instances.forEach((pane, i) => {
            if (pane.container === container) {
                z_index = instances.length + 10;
                pane.z_index = z_index;
            } else if (pane.z_index >= old_index) {
                pane.z_index = pane.z_index - 1;
                pane.onUpdate(pane.z_index);
            }
        });
    }

    function headerMouseDown(event: MouseEvent) {
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

    let dh_offset = 15;
    let dh_separation = 20;
    let dh_height = 10;

    let bar0 = dh_offset;
    let bar1 = dh_offset + dh_separation + dh_height;
    let bar2 = dh_offset + 2 * (dh_separation + dh_height);

    onMount(() => {
        z_index = instances.length + 11;
        instances.push({z_index, container, onUpdate});

        if (content !== null) {
            while (contentParent.firstChild !== null) contentParent.removeChild(contentParent.firstChild);
            contentParent.appendChild(content);
        }

        resize(width, height);
        setPosition(x, y);
    });

    function onUpdate(new_z_index: number) {
        z_index = new_z_index;
    }

    onDestroy(() => {
        let index = instances.findIndex(pane => pane.container === container);
        if (index !== -1) {
            instances.splice(index, 1);
        }
    });
</script>

<div class=pane-container style="{container_position} {container_size} font-size: {scale}; z-index: {z_index}" bind:this={container} on:mousedown={takeFront}>
    <div class=relativizer>
        <DragHandle onDrag={setPosition} getOffset={getOffset}>
            <div class=pane-header
                on:mousedown={headerMouseDown}>
                <span class=pane-title style={title_style}>
                    {title}
                </span>
                <div class=drag-handle>
                    <div class=drag-handle-bar style="top: {bar0}%; height: {dh_height}%;"></div>
                    <div class=drag-handle-bar style="top: {bar1}%; height: {dh_height}%;"></div>
                    <div class=drag-handle-bar style="top: {bar2}%; height: {dh_height}%;"></div>
                </div>
            </div>
        </DragHandle>
        <div class=pane-body style={body_style}>
            <div class=pane-content bind:this={contentParent}>
                <slot>
                    <Emptiness />
                </slot>
            </div>
        </div>
    </div>
    <DragHandle onDrag={resize} getOffset={brOffset}>
        <div class="pane-resize-handle corner">
            
        </div>
    </DragHandle>
    <DragHandle onDrag={resize} getOffset={brOffset} yEnabled={false}>
        <div class="pane-resize-handle right">
            
        </div>
    </DragHandle>
    <DragHandle onDrag={resize} getOffset={brOffset} xEnabled={false}>
        <div class="pane-resize-handle bottom">
            
        </div>
    </DragHandle>
</div>

<style>
    .pane-container {
        position: absolute;
    }

    .relativizer {
        position: relative;
        width: 100%;
        height: 100%;
    }

    .pane-header {
        position: absolute;
        background-color: var(--pane-header);
        width: 100%; 
        border-radius: 0.75em 0.75em 0 0; 
        height: 1.7em;
        right: 0;
    }

    .pane-title {
        color: var(--pane-title);
        font-size: 1em;
        position: absolute; 
        top: 0.35em; 
        left: 1.5em;
        max-width: calc(100% - 2.5em); 
        overflow: hidden; 
        white-space: nowrap;
        user-select: none;
    }

    .pane-body {
        position: absolute;
        width: 100%;
        top: 1.7em;
        border-bottom: 1px solid var(--pane-border);
    }

    .pane-content {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
    }

    .pane-resize-handle {
        position: absolute;
        user-select: none;
        z-index: 2;
    }
    
    .pane-resize-handle.corner {
        right: -0.5em;
        bottom: -0.5em;
        width: 1em;
        height: 1em;
        border-radius: 50%;
        cursor: nwse-resize;
    }

    .pane-resize-handle.right {
        right: -0.5em;
        bottom: 0.5em;
        width: 0.8em;
        height: calc(100% - 2em);
        border-radius: 30%;
        cursor: ew-resize;
    }

    .pane-resize-handle.bottom {
        right: 0.5em;
        bottom: -0.5em;
        width: calc(100% - 0.5em);
        height: 0.8em;
        border-radius: 30%;
        cursor: ns-resize;
    }

    .drag-handle {
        position: absolute;
        right: 1em;
        width: 1.7em;
        height: 1.7em;
        user-select: none;
        cursor: move;
    }

    .drag-handle-bar {
        position: absolute;
        background-color: var(--drag-handle);
        width: 80%;
        left: 10%;
        border-radius: 0.5em;
    }
</style>