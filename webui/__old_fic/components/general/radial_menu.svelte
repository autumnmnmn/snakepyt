<script lang="ts">
    import { onDestroy } from "svelte";

    export let xPosition: number;
    export let yPosition: number;

    export let center: { (): void } = () => {};
    export let left: { (): void } = () => {};
    export let right: { (): void } = () => {};
    export let top: { (): void } = () => {};
    export let bottom: { (): void } = () => {};

    export let color: string = "white";
    export let background: string = "rgba(255, 255, 255, 0.2)";
    export let background_hover: string = "rgba(255, 255, 255, 0.4)";

    let button_style = `color: ${color};`;

    onDestroy(() => {
        console.log("foo");
    });
</script>

<div class=menu-container
    style="left: {xPosition - 100}px; top: {yPosition - 100}px; --background: {background}; --background-hover: {background_hover};">
    {#if center}
        <button on:click={center} class="menu-button center" style={button_style}>
            <div class="icon center">
                <slot name="center" />
            </div>
        </button>
    {:else}
        <div class="menu-button center" />
    {/if}
    {#if right}
        <button on:click={right} class="menu-button right" style={button_style}>
            <div class="icon right">
                <slot name="right" />
            </div>
        </button>
    {/if}
    {#if left}
        <button on:click={left} class="menu-button left" style={button_style}>
            <div class="icon left">
                <slot name="left" />
            </div>
        </button>
    {/if}
    {#if top}
        <button on:click={top} class="menu-button top" style={button_style}>
            <div class="icon top">
                <slot name="top" />
            </div>
        </button>
    {/if}
    {#if bottom}
        <button on:click={bottom} class="menu-button bottom" style={button_style}>
            <div class="icon bottom">
                <slot name="bottom" />
            </div>
        </button>
    {/if}
</div>

<style>
    .menu-container {
        position: absolute;
        width: 200px;
        height: 200px;
        border-radius: 50%;
        z-index: 20;
        overflow: hidden;
    }

    .menu-button {
        position: absolute;
        width: 100px;
        height: 100px;
        margin: 0;
        border: 0;
        padding: 0;
        background-color: transparent;
        font: 5em monospace;
        z-index: 21;
    }

    .menu-button.center {
        top: 50%;
        left: 50%;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        background-color: var(--background);
        z-index: 23;
    }

    .menu-button.right {
        top: 0%;
        left: 50%;
        transform-origin: bottom left;
        transform: rotate(45deg) skewY(0deg);
        overflow: hidden;
        display: block;
    }

    .menu-button.right::before {
        content: "";
        position: absolute;
        bottom: -50%;
        left: -50%;
        width: 103%;
        height: 103%;
        border-radius: 100%;
        box-shadow: 0px 0px 0px 1000px var(--background);
        z-index: -1;
    }

    .menu-button.right:hover::before {
        box-shadow: 0px 0px 0px 1000px var(--background-hover);
    }

    .icon {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    }

    .menu-button.left {
        top: 0%;
        left: 50%;
        transform-origin: bottom left;
        transform: rotate(225deg);
        overflow: hidden;
        display: block;
    }

    .menu-button.left::before {
        content: "";
        position: absolute;
        bottom: -50%;
        left: -50%;
        width: 103%;
        height: 103%;
        border-radius: 100%;
        box-shadow: 0px 0px 0px 1000px var(--background);
        z-index: -1;
    }

    .menu-button.left:hover::before {
        box-shadow: 0px 0px 0px 1000px var(--background-hover);
    }

    .menu-button.center:hover {
        background-color: var(--background-hover);
        border: 0;
    }

    .menu-button.top {
        top: 0%;
        left: 50%;
        transform-origin: bottom left;
        transform: rotate(-45deg) skewY(0deg);
        overflow: hidden;
        display: block;
    }

    .menu-button.top::before {
        content: "";
        position: absolute;
        bottom: -50%;
        left: -50%;
        width: 103%;
        height: 103%;
        border-radius: 100%;
        box-shadow: 0px 0px 0px 1000px var(--background);
        z-index: -1;
    }

    .menu-button.top:hover::before {
        box-shadow: 0px 0px 0px 1000px var(--background-hover);
    }

    .menu-button.bottom {
        top: 0%;
        left: 50%;
        transform-origin: bottom left;
        transform: rotate(135deg);
        overflow: hidden;
        display: block;
    }

    .menu-button.bottom::before {
        content: "";
        position: absolute;
        bottom: -50%;
        left: -50%;
        width: 103%;
        height: 103%;
        border-radius: 100%;
        box-shadow: 0px 0px 0px 1000px var(--background);
        z-index: -1;
    }

    .menu-button.bottom:hover::before {
        box-shadow: 0px 0px 0px 1000px var(--background-hover);
    }

    .menu-button.center:hover {
        background-color: var(--background-hover);
        border: 0;
    }
</style>
