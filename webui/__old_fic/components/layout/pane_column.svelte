<script lang="ts">
    import { onMount } from "svelte";
    import DragHandle from "../general/drag_handle.svelte";
    import Emptiness from "./emptiness.svelte";

    export let dividers = true;

    export let topPercent = 50;
    export let middlePercent = 0;
    export let bottomPercent = 50;

    export let topInit: HTMLElement | null = null;
    export let middleInit: HTMLElement | null = null;
    export let bottomInit: HTMLElement | null = null;

    let container: HTMLDivElement;
    let top_slot: HTMLDivElement;
    let middle_slot: HTMLDivElement;
    let bottom_slot: HTMLDivElement;

    onMount(() => {
        if ($$slots.middle && (topPercent === 50 && middlePercent === 0 && bottomPercent === 50)) {
            topPercent = 33.3;
            middlePercent = 33.2;
            bottomPercent = 33.3;
        }
        if (topInit !== null) {
            while (top_slot.firstChild) top_slot.removeChild(top_slot.firstChild);
            top_slot.appendChild(topInit);
            console.log(top_slot);
        }
        if (middleInit !== null) {
            while (middle_slot.firstChild) middle_slot.removeChild(middle_slot.firstChild);
            middle_slot.appendChild(middleInit);
            console.log(middle_slot);
        }
        if (bottomInit !== null) {
            while (bottom_slot.firstChild) bottom_slot.removeChild(bottom_slot.firstChild);
            bottom_slot.appendChild(bottomInit);
            console.log(bottom_slot);
        }
    });

    function onDragA(x: string | number | null, y: string | number | null) {
        if (y === null || typeof(y) !== "number") return;
        let height = container.clientHeight;
        if (middlePercent > 0) {
            topPercent = y / height * 100;
            if (topPercent > 97.9 - bottomPercent) {
                topPercent = 97.9 - bottomPercent;
            }
            if (topPercent < 0.1) {
                topPercent = 0.1;
            }
            middlePercent = 99.8 - topPercent - bottomPercent; // .2% for the 2 dividers
        } else { 
            topPercent = y / height * 100;
            bottomPercent = 99.9 - topPercent; // .1% for the divider
        }
    }

    function onDragB(x: string | number | null, y: string | number | null) {
        if (y === null || typeof(y) !== "number") return;
        let height = container.clientHeight;
        bottomPercent = (height - y) / height * 100;
        if (bottomPercent > 97.9 - topPercent) {
            bottomPercent = 97.9 - topPercent;
        }
        if (bottomPercent < 0.1) {
            bottomPercent = 0.1;
        }
        middlePercent = 99.8 - topPercent - bottomPercent; // .2% for the 2 dividers

    }

    function getOffsetA() {
        return {
            x: 0, // don't care
            y: container.offsetTop + container.clientHeight * topPercent / 100
        };
    }

    function getOffsetB() {
        return {
            x: 0, // don't care
            y: container.offsetTop + container.clientHeight * (topPercent + middlePercent + .2) / 100
        };
    }

    function onDividerClickA(event: MouseEvent) {
        if (event.button !== 1) return;
        
        let hasMiddle = middlePercent > 0;

        let topEmpty = top_slot.children[0].classList.contains('emptiness');
        
        if (hasMiddle) {
            let middleEmpty = middle_slot.children[0].classList.contains('emptiness');
            if (!topEmpty && !middleEmpty) return;
            if (middleEmpty) {
                topPercent += middlePercent;
                middlePercent = 0;
                return;
            }

            while (top_slot.firstChild) {
                top_slot.removeChild(top_slot.firstChild!);
            }
            while (middle_slot.firstChild) {
                let child = middle_slot.removeChild(middle_slot.firstChild);
                top_slot!.appendChild(child);
            }

            topPercent += middlePercent;
            middlePercent = 0;
        } else {
            let parent = container.parentElement;
            if (topEmpty) {
                while (bottom_slot.firstChild) {
                    let child = bottom_slot.removeChild(bottom_slot.firstChild);
                    parent!.appendChild(child);
                }
                parent!.removeChild(container);
            }
            else if (bottom_slot.children[0].classList.contains('emptiness')) {
                while (top_slot.firstChild) {
                    let child = top_slot.removeChild(top_slot.firstChild);
                    parent!.appendChild(child);
                }
                parent!.removeChild(container);
            }
        }
    }

    function onDividerClickB(event: MouseEvent) {
        if (event.button !== 1) return;
        
        // This function can only ever be called when there is a middle slot

        let bottomEmpty = bottom_slot.children[0].classList.contains('emptiness');
        
        let middleEmpty = middle_slot.children[0].classList.contains('emptiness');
        if (!bottomEmpty && !middleEmpty) return;
        if (middleEmpty) {
            bottomPercent += middlePercent;
            middlePercent = 0;
            return;
        }

        while (bottom_slot.firstChild) {
            bottom_slot.removeChild(bottom_slot.firstChild!);
        }
        while (middle_slot.firstChild) {
            let child = middle_slot.removeChild(middle_slot.firstChild);
            bottom_slot!.appendChild(child);
        }

        bottomPercent += middlePercent;
        middlePercent = 0;
    }
</script>

<div class="column-container" {...$$restProps} bind:this={container}>
    <div class="pane-container"
        style="flex: 1 1 {topPercent}%" bind:this={top_slot}>
        <slot name="top">
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
    {#if middlePercent > 0}
        <div class="pane-container"
            style="flex: 1 1 {middlePercent}%" bind:this={middle_slot}>
            <slot name="middle">
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
        style="flex: 1 1 {bottomPercent}%" bind:this={bottom_slot}>
        <slot name="bottom">
            <Emptiness />
        </slot>
    </div>
</div>

<style>
    .column-container {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
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
        left: 1em;
        width: calc(100% - 2em);
        background-color: var(--pane-divider);
        overflow: visible;
        z-index: 1;
    }

    .pane-resize {
        position: absolute;
        width: 100%;
        top: calc(50% - 0.5em);
        height: 1em;
        border-radius: 40%;
        cursor: row-resize;
    }
</style>