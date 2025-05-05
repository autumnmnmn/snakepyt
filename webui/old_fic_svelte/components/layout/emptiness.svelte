<script lang="ts">
    import Workspace from "./workspace.svelte";
    import PaneRow from "./pane_row.svelte";
    import PaneColumn from "./pane_column.svelte";
    import feather from "feather-icons";
    import { onMount } from "svelte";
    import { tick } from "svelte";
    import RadialMenu from "../general/radial_menu.svelte";
    import FicsuitSession from "../ficsuit_session.svelte";
    import SimpleMenu from "../general/simple_menu.svelte";

    export let fillable = true;

    function onMenuOpen(event: MouseEvent) {
        if (event.button !== 2) return;
        if (!fillable) return;

        showLayoutMenu = false;
        showCreateMenu = false;

        if (event.ctrlKey) {
            showLayoutMenu = true;
        }
        else {
            showCreateMenu = true;
        }
        menuX = event.offsetX;
        menuY = event.offsetY;
        event.stopPropagation();
        event.preventDefault();
    }

    function addWorkspace() {
        let workspace = new Workspace({
            target: emptiness.parentElement!,
            props: {
            }
        });

        emptiness.parentNode?.removeChild(emptiness);
        showLayoutMenu = false;
    }

    function addSession() {
        let session = new FicsuitSession({
            target: emptiness.parentElement!,
            props: {

            }
        });

        emptiness.parentNode?.removeChild(emptiness);
        showCreateMenu = false;
    }

    function addRow2() {
        let row = new PaneRow({
            target: emptiness.parentElement!,
            props: {
                leftPercent: 50,
                rightPercent: 50
            }
        });

        emptiness.parentNode?.removeChild(emptiness);
        showLayoutMenu = false;
    }

    function addRow3() {
        let row = new PaneRow({
            target: emptiness.parentElement!,
            props: {
                leftPercent: 33.3,
                centerPercent: 33.2,
                rightPercent: 33.3
            }
        });

        emptiness.parentNode?.removeChild(emptiness);
        showLayoutMenu = false;
    }

    function addColumn2() {
        let row = new PaneColumn({
            target: emptiness.parentElement!,
            props: {
                topPercent: 50,
                bottomPercent: 50
            }
        });

        emptiness.parentNode?.removeChild(emptiness);
        showLayoutMenu = false;
    }

    function addColumn3() {
        let row = new PaneColumn({
            target: emptiness.parentElement!,
            props: {
                topPercent: 33.3,
                middlePercent: 33.2,
                bottomPercent: 33.3
            }
        });

        emptiness.parentNode?.removeChild(emptiness);
        showLayoutMenu = false;
    }

    let createMenuOptions = [
        {label: "FictionSuit Session", action: addSession},
        {label: "Workspace", action: addWorkspace}
    ]

    let emptiness: HTMLDivElement;

    let showLayoutMenu = false;
    let showCreateMenu = false;

    let menuX = 0, menuY = 0;

    $: {
        if (showLayoutMenu) {
            tick().then(() => {
                feather.replace();
            });
        }
    }
</script>

<div class=emptiness
    bind:this={emptiness}>
    <div class=backdrop
        on:contextmenu={onMenuOpen}
        on:mousedown={() => {showLayoutMenu = false; showCreateMenu = false;}} />
    <div class=nothing>
        nothing
    </div>
    {#if showLayoutMenu}
        <RadialMenu xPosition={menuX} yPosition={menuY}
            center={addWorkspace}
            right={addRow2}
            left={addRow3}
            top={addColumn2}
            bottom={addColumn3}>
            <div data-feather=maximize class="icon center" slot=center />
            <div data-feather=columns class="icon right" slot=right />
            <svelte:fragment slot=left>
                <div data-feather=sidebar class="icon left" />
                <div data-feather=sidebar class="icon left-b" />
            </svelte:fragment>
            <div data-feather=columns class="icon top" slot=top />
            <svelte:fragment slot=bottom>
                <div data-feather=sidebar class="icon bottom" />
                <div data-feather=sidebar class="icon bottom-b" />
            </svelte:fragment>
        </RadialMenu>
    {/if}
    {#if showCreateMenu}
        <SimpleMenu x={menuX} y={menuY}
            title="New"
            options={createMenuOptions} />
    {/if}
</div>

<style>
    .emptiness {
        position: relative;
        width: 100%;
        height: 100%;
        z-index: 0;
    }

    .backdrop {
        position: absolute;
        width: 100%;
        height: 100%;
        z-index: 0;
        user-select: none;
        /* background: radial-gradient(var(--pane-background), var(--pane-background) 30%, #FF00FF00 100%); */
    }

    .nothing {
        position: absolute;
        top: calc(50% - 0.35em);
        left: 50%;
        transform: translate(-50%, -50%);
        white-space: pre;

        user-select: none;
        pointer-events: none;

        color: #446666;
        font-size: 1em;
    }

    .icon {
        position: absolute;
        top: 50%;
        left: 50%;
        --center: translate(-50%, -50%);
    }

    .icon.center {
        transform: var(--center) scale(200%);
    }

    .icon.left {
        transform: var(--center) rotate(-45deg) translate(15%, 0%);
    }

    .icon.left-b {
        transform: var(--center) rotate(135deg) translate(-15%, 0%); 
    }

    .icon.right {
        transform: var(--center) rotate(-45deg) translate(15%, 0%);
    }

    .icon.bottom {
        transform: var(--center) rotate(-45deg) translate(15%, 0%);
    }

    .icon.bottom-b {
        transform: var(--center) rotate(135deg) translate(-15%, 0%); 
    }

    .icon.top {
        transform: var(--center) rotate(-45deg) translate(15%, 0%);
    }
</style>
