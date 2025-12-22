<script lang="ts">
    import { onMount, tick } from "svelte";
    import DragHandle from "../general/drag_handle.svelte";
    import Emptiness from "./emptiness.svelte";

    export let dividers = true;

    export let leftPercent = 50;
    export let centerPercent = 0;
    export let rightPercent = 50;

    export let leftInit: HTMLElement | null = null;
    export let centerInit: HTMLElement | null = null;
    export let rightInit: HTMLElement | null = null;

    let container: HTMLDivElement;
    let left_slot: HTMLDivElement;
    let center_slot: HTMLDivElement;
    let right_slot: HTMLDivElement;

    onMount(() => {
        if ($$slots.center && (leftPercent === 50 && centerPercent === 0 && rightPercent === 50)) {
            leftPercent = 33;
            centerPercent = 33;
            rightPercent = 33;
        }
        if (leftInit !== null) {
            while (left_slot.firstChild) left_slot.removeChild(left_slot.firstChild);
            left_slot.appendChild(leftInit);
            console.log(left_slot);
        }
        if (centerInit !== null) {
            while (center_slot.firstChild) center_slot.removeChild(center_slot.firstChild);
            center_slot.appendChild(centerInit);
            console.log(center_slot);
        }
        if (rightInit !== null) {
            while (right_slot.firstChild) right_slot.removeChild(right_slot.firstChild);
            right_slot.appendChild(rightInit);
            console.log(right_slot);
        }
    });

    function onDragA(x: string | number | null, y: string | number | null) {
        if (x === null || typeof(x) !== "number") return;
        let width = container.clientWidth;
        if (centerPercent > 0) {
            leftPercent = x / width * 100;
            if (leftPercent > 97.9 - rightPercent) {
                leftPercent = 97.9 - rightPercent;
            }
            if (leftPercent < 0.1) {
                leftPercent = 0.1;
            }
            centerPercent = 99.8 - leftPercent - rightPercent; // .2% for the 2 dividers
        } else { 
            leftPercent = x / width * 100;
            rightPercent = 99.9 - leftPercent; // .1% for the divider
        }
    }

    function onDragB(x: string | number | null, y: string | number | null) {
        if (x === null || typeof(x) !== "number") return;
        let width = container.clientWidth;
        rightPercent = (width - x) / width * 100;
        if (rightPercent > 97.9 - leftPercent) {
            rightPercent = 97.9 - leftPercent;
        }
        if (rightPercent < 0.1) {
            rightPercent = 0.1;
        }
        centerPercent = 99.8 - leftPercent - rightPercent; // .2% for the 2 dividers

    }

    function getOffsetA() {
        return {
            x: container.offsetLeft + container.clientWidth * leftPercent / 100,
            y: 0, // don't care
        };
    }

    function getOffsetB() {
        return {
            x: container.offsetLeft + container.clientWidth * (leftPercent + centerPercent + .2) / 100,
            y: 0, // don't care
        };
    }

function onDividerClickA(event: MouseEvent) {
    if (event.button !== 1) return;
    
    let hasCenter = centerPercent > 0;

    let leftEmpty = left_slot.children[0].classList.contains('emptiness');
    
    if (hasCenter) {
        let centerEmpty = center_slot.children[0].classList.contains('emptiness');
        if (!leftEmpty && !centerEmpty) return;
        if (centerEmpty) {
            leftPercent += centerPercent;
            centerPercent = 0;
            return;
        }

        while (left_slot.firstChild) {
            left_slot.removeChild(left_slot.firstChild!);
        }
        while (center_slot.firstChild) {
            let child = center_slot.removeChild(center_slot.firstChild);
            left_slot!.appendChild(child);
        }

        leftPercent += centerPercent;
        centerPercent = 0;
    } else {
        let parent = container.parentElement;
        if (leftEmpty) {
            while (right_slot.firstChild) {
                let child = right_slot.removeChild(right_slot.firstChild);
                parent!.appendChild(child);
            }
            parent!.removeChild(container);
        }
        else if (right_slot.children[0].classList.contains('emptiness')) {
            while (left_slot.firstChild) {
                let child = left_slot.removeChild(left_slot.firstChild);
                parent!.appendChild(child);
            }
            parent!.removeChild(container);
        }
    }
}

function onDividerClickB(event: MouseEvent) {
    if (event.button !== 1) return;
    
    // This function can only ever be called when there is a center slot

    let rightEmpty = right_slot.children[0].classList.contains('emptiness');
    
    let centerEmpty = center_slot.children[0].classList.contains('emptiness');
    if (!rightEmpty && !centerEmpty) return;
    if (centerEmpty) {
        rightPercent += centerPercent;
        centerPercent = 0;
        return;
    }

    while (right_slot.firstChild) {
        right_slot.removeChild(right_slot.firstChild!);
    }
    while (center_slot.firstChild) {
        let child = center_slot.removeChild(center_slot.firstChild);
        right_slot!.appendChild(child);
    }

    rightPercent += centerPercent;
    centerPercent = 0;
}
</script>

<div class="row-container" {...$$restProps} bind:this={container}>
    <div class="pane-container"
        style="flex: 1 1 {leftPercent}%" bind:this={left_slot}>
        <slot name="left" >
            <Emptiness />
        </slot>
    </div>
    {#if dividers}
        <div class="pane-divider">
            <DragHandle onDrag={onDragA} getOffset={getOffsetA} >
                <div on:mousedown={onDividerClickA} class="pane-resize" />
            </DragHandle>
        </div>
    {/if}
    {#if centerPercent > 0}
        <div class="pane-container"
            style="flex: 1 1 {centerPercent}%" bind:this={center_slot}>
            <slot name="center">
                <Emptiness />
            </slot>
        </div>
        {#if dividers}
            <div class="pane-divider">
                <DragHandle onDrag={onDragB} getOffset={getOffsetB} >
                    <div on:mousedown={onDividerClickB} class="pane-resize" />
                </DragHandle>
            </div>
        {/if}
    {/if}
    <div class="pane-container"
        style="flex: 1 1 {rightPercent}%" bind:this={right_slot}>
        <slot name="right">
            <Emptiness />
        </slot>
    </div>
</div>

<style>
    .row-container {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        align-items: stretch;
        justify-content: flex-start;
    }

    .pane-container {
        position: relative;
        left: 0;
        top: 0;
        right: 0;
        bottom: 0;
        overflow: hidden;
    }

    .pane-divider {
        position: relative;
        flex: 0 0 1px;
        top: 1em;
        height: calc(100% - 2em);
        background-color: var(--pane-divider);
        overflow: visible;
        z-index: 1;
    }

    .pane-resize {
        position: absolute;
        height: 100%;
        left: calc(50% - 0.5em);
        width: 1em;
        border-radius: 40%;
        cursor: col-resize;
    }
</style>