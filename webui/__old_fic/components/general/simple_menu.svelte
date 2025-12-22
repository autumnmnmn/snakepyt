<script lang="ts">
    import { onMount } from "svelte";

    export let x: number = 0;
    export let y: number = 0;

    export let title="This Menu Has No Title";
    export let options: { label: string, action: () => void }[] = [];

    let menu: HTMLDivElement;

    let menuLeft: string = "0px";
    let menuTop: string = "0px";

    onMount(() => {
        menuLeft = `calc(min(${x}px, 100% - ${menu.clientWidth + 1}px))`;
        menuTop = `calc(min(${y}px, 100% - ${menu.clientHeight + 1}px))`;
    });
</script>

<div class=menu style="left: {menuLeft}; top: {menuTop};" bind:this={menu}>
    <div>{title}</div>
    {#each options as option}
        <button class="menu-item" on:click={option.action}>
            {option.label}
        </button>
    {/each}
</div>

<style>
    .menu {
        position: absolute;
        border: 0;
        padding: 0;
        margin: 0;
        padding-top: 0.2em;
        padding-bottom: 0.2em;
        display: flex;
        flex-direction: column;
        background-color: #1b575760;
        user-select: none;
    }

    .menu > button, .menu > div {
        border: 0;
        padding: 0;
        margin: 0;
        margin-top: 0.2em;
        padding-left: 0.3em;
        padding-right: 0.3em;
        min-height: 1.2em;
        font-size: 1em;
        font-family: var(--code-font);
        text-align: left;
        background-color: #00000000;
        color: white;
        word-wrap: break-word;
        word-break: break-word;
    }

    .menu > div {
        font-weight: bold;
        user-select: none;
    }

    .menu > button:hover {
        background-color: #1b5757A0;
    }
</style>