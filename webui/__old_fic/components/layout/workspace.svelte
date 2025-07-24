<!-- A big empty canvas, with a dotted grid background. -->

<script lang="ts">
    import { onMount } from "svelte";
    import feather from "feather-icons";
    import FloatingPane from "./floating_pane.svelte";
    import PaneRow from "./pane_row.svelte";
    import RadialMenu from "../general/radial_menu.svelte";
    import { tick } from "svelte";
    import PaneColumn from "./pane_column.svelte";
    import Emptiness from "./emptiness.svelte";
    import FicsuitSession from "../ficsuit_session.svelte";
    import SimpleMenu from "../general/simple_menu.svelte";
    import Workspace from "./workspace.svelte";
    import Display from "../nodes/display.svelte";
    import coordinator, { type Transmitter, type Receiver } from "../../coordinator";
    import Execute from "../nodes/execute.svelte";
    import Feed from "../nodes/feed.svelte";
    import Debug from "../debug/debug.svelte";
    import ScriptInput from "../nodes/inputs/script_input.svelte";
    import ImageDisplay from "../displays/basic/image_display.svelte";

    let hiddenElement: HTMLElement;

    function onMenuOpen(event: MouseEvent) {
        if (event.button !== 2) return;

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

    function addPane() {
        let pane = new FloatingPane({
            target: workspace,
            props: {
                title: "",
                x: `${menuX}px`,
                y: `${menuY}px`
            }
        });

        showLayoutMenu = false;
        showCreateMenu = false;
    }

    function pane<T>(t: new (args: any) => T, title: string) {
        let thing = new t({
            target: hiddenElement,
            props: {

            }
        });

        let pane = new FloatingPane({
            target: workspace,
            props: {
                title,
                x: `${menuX}px`,
                y: `${menuY}px`,
                content: hiddenElement.children[0] as HTMLElement
            }
        });

        showCreateMenu = false;
    }

    function add<T>(t: new (args: any) => T, title: string) {
        let thing = new t({
            target: workspace,
            props: {
                x: `${menuX}px`,
                y: `${menuY}px`
            }
        });

        showCreateMenu = false;
    }

    function addRight() {
        let parent = workspace.parentElement!;
        parent.removeChild(workspace);
        let row = new PaneRow({
            target: parent,
            props: {
                leftPercent: 50,
                rightPercent: 50,
                leftInit: workspace
            }
        });

        showLayoutMenu = false;
    }

    function addLeft() {
        let parent = workspace.parentElement!;
        parent.removeChild(workspace);
        let row = new PaneRow({
            target: parent,
            props: {
                leftPercent: 50,
                rightPercent: 50,
                rightInit: workspace
            }
        });

        showLayoutMenu = false;
    }

    function addTop() {
        let parent = workspace.parentElement!;
        parent.removeChild(workspace);
        let row = new PaneColumn({
            target: parent,
            props: {
                topPercent: 50,
                bottomPercent: 50,
                bottomInit: workspace
            }
        });

        showLayoutMenu = false;
    }

    function addBottom() {
        let parent = workspace.parentElement!;
        parent.removeChild(workspace);
        let row = new PaneColumn({
            target: parent,
            props: {
                topPercent: 50,
                bottomPercent: 50,
                topInit: workspace
            }
        });

        showLayoutMenu = false;
    }

    function remove() {
        let parent = workspace.parentElement!;
        parent.removeChild(workspace);
        let emptiness = new Emptiness({
            target: parent,
            props: {
            }
        });
    }

    function paneOption(label: string, title: string, t: new (args: any) => any) {
        return {
            label,
            action: () => pane(t, title)
        }
    }

    let createMenuOptions = [
        paneOption("FictionSuit Session", "FictionSuit Session", FicsuitSession),
        paneOption("Workspace", "Workspace", Workspace),
        paneOption("Empty Pane", "Pane", Emptiness),
        paneOption("Display", "Display", Display),
        paneOption("Feed", "Feed", Feed),
        paneOption("Debug", "Debug", Debug),
        paneOption("Input", "Input", ScriptInput),
        paneOption("Image", "Image", ImageDisplay),
        { label: "Node: Execute", action: () => add(Execute, "Execute") },
    ]

    let workspace: HTMLDivElement;

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

    let id: string = coordinator.prefixes.workspace + "-" + crypto.randomUUID();

    interface DisplayDatum {
        transmitter: Transmitter,
        receiver: Receiver,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        offset: number,
        transmitterStyle: string,
        receiverStyle: string,
    }

    let connectionDisplayData: DisplayDatum[] = []

    function removeConnection(transmitter: Transmitter, receiver: Receiver) {
        // TODO: handle re-render of other workspace if this is a cross-workspace connection

        {
            let connections = transmitter.connections;
            let index = connections.findIndex((connection) => connection.id === receiver.id);
            if (index === -1) {
                // Impossible -- unless something has gone horribly wrong
                return;
            }
            connections[index].dirty = true;
            connections.splice(index, 1);
            transmitter.connections = connections;
        }

        let connections = receiver.connections;
        let index = connections.findIndex((connection) => connection.id === transmitter.id);
        if (index === -1) {
            // Impossible -- unless something has gone horribly wrong
            return;
        }
        connections[index].dirty = true;
        connections.splice(index, 1);
        receiver.connections = connections

        renderWires();
    }

    function renderWires() {
        let self = coordinator.workspaces[id];

        let dirtyTransmitters: { [id: string]: Transmitter } = {};
        let dirtyReceivers: { [id: string]: Receiver } = {};

        for (let transmitter in self.transmitters) {
            if (coordinator.transmitters[transmitter].dirty) {
                dirtyTransmitters[transmitter] = coordinator.transmitters[transmitter];
            }
        }

        for (let receiver in self.receivers) {
            if (coordinator.receivers[receiver].dirty) {
                dirtyReceivers[receiver] = coordinator.receivers[receiver];
            }
        }

        let displayData: DisplayDatum[] = connectionDisplayData.filter((datum) => {
            return dirtyReceivers[datum.receiver.id] === undefined && dirtyTransmitters[datum.transmitter.id] === undefined;
        });

        let newConnections = new Set<{t: string, r: string}>();

        for (let transmitter in dirtyTransmitters) {
            let t = dirtyTransmitters[transmitter];
            for (let receiver of t.connections) {
                newConnections.add({t: t.id, r: receiver.id});
            }
        }

        for (let receiver in dirtyReceivers) {
            let r = dirtyReceivers[receiver];
            for (let transmitter of r.connections) {
                newConnections.add({t: transmitter.id, r: r.id});
            }
        }

        let fontsize = parseFloat(getComputedStyle(workspace).fontSize);

        let workspaceRect = workspace.getBoundingClientRect();

        newConnections.forEach((x: {t: string, r: string}) => {
            let transmitter = coordinator.transmitters[x.t];
            let receiver = coordinator.receivers[x.r];
            let rect1 = transmitter.element.getBoundingClientRect();
            let rect2 = receiver.element.getBoundingClientRect();
            let x1 = rect1.left - workspaceRect.left + 0.5 * fontsize;
            let y1 = rect1.top - workspaceRect.top + 0.5 * fontsize;
            let x2 = rect2.left - workspaceRect.left + 0.5 * fontsize;
            let y2 = rect2.top - workspaceRect.top + 0.5 * fontsize;

            let offset = 0.5 * Math.abs(x2 - x1);
            if (offset < 120) offset = 120;

            displayData.push({
                transmitter: transmitter,
                receiver: receiver,
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2,
                transmitterStyle: transmitter.schemas.join(' '),
                receiverStyle: receiver.schemas.join(' '),
                offset: offset
            });
        });

        connectionDisplayData = displayData;
    }

    onMount(() => {
        coordinator.registerWorkspace(workspace, renderWires);
    });
</script>

<div class=workspace {id}
    bind:this={workspace}>
    <div class=backdrop
        on:contextmenu={onMenuOpen}
        on:mousedown={() => {showLayoutMenu = false; showCreateMenu = false;}}
        />
    <input class=workspace-name type="text" />
    <slot></slot>
    {#if showLayoutMenu}
        <RadialMenu xPosition={menuX} yPosition={menuY}
            color=white
            background="#1b575760"
            background_hover="#1b5757A0"
            center={addPane}
            right={addRight}
            left={addLeft}
            top={addTop}
            bottom={addBottom}>
            <div slot="center" data-feather="credit-card" class="icon center" />
            <div slot="right" data-feather="plus" class="icon split-pane" />
            <div slot="left" data-feather="plus" class="icon split-pane" />
            <div slot="top" data-feather="plus" class="icon split-pane" />
            <div slot="bottom" data-feather="plus" class="icon split-pane" />
        </RadialMenu>
        <button class=delete on:click={remove}
            style="left: {menuX + 100}px; top: {menuY - 100}px;">
            <div data-feather="trash" class="trash-icon" />
        </button>
    {/if}
    {#if showCreateMenu}
        <SimpleMenu x={menuX} y={menuY}
            title="New"
            options={createMenuOptions} />
    {/if}

    {#each connectionDisplayData as con}
        <div class="node {con.transmitterStyle}" style="left: {con.x1}px; top: {con.y1}px;" />
        <div class="node {con.receiverStyle}" style="left: {con.x2}px; top: {con.y2}px;" />
        <svg xmlns="http://www.w3.org/2000/svg" style="overflow: visible; position: absolute; width: 100%; height: 100%; z-index: 0; pointer-events: none;">
            <path d="M {con.x1} {con.y1} C {con.x1 + con.offset} {con.y1}, {con.x2 - con.offset} {con.y2}, {con.x2} {con.y2}" class="connection {con.transmitterStyle}" stroke-width="4" fill="none" />
            <path d="M {con.x1} {con.y1} C {con.x1 + con.offset} {con.y1}, {con.x2 - con.offset} {con.y2}, {con.x2} {con.y2}" class="connection-selector" stroke-width="10" fill="none" on:mousedown={(event) => {if (event.button===1) {removeConnection(con.transmitter, con.receiver)}}} />
        </svg>
    {/each}

    <div class=hidden bind:this={hiddenElement} />
</div>

<style>
    .workspace {
        margin: 0;
        padding: 0;

        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    }

    .workspace-name {
        position: absolute;
        top: 1em;
        left: 0.5em;
        background-color: transparent;
        border: none;
        border-bottom: 2px solid var(--pane-divider);
        color: var(--plaintext);
        font-size: 1em;
    }

    .workspace-name:focus {
        outline: none;
        background-color: var(--workspace-grid);
    }

    .hidden {
        display: none;
    }

    .icon {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .icon.center {
        transform: translate(-50%, -50%) scale(2);
    }

    .icon.split-pane {
        transform: translate(-50%, -50%) rotate(45deg) translate(0, -15%) scale(1.3);
    }

    .backdrop {
        position: absolute;
        width: 100%;
        height: 100%;

        background-size: 40px 40px;
        background-color: var(--workspace-background);
        background-image: radial-gradient(circle, var(--workspace-grid) 2px, rgba(0, 0, 0, 0) 1px);

        user-select: none;

        z-index: 0;
    }

    .delete {
        position: absolute;
        border: 0;
        padding: 0;
        margin: 0;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        z-index: 20;
        background-color: #FF000060;
        transform: translate(-50%, -50%);
    }

    .delete > .trash-icon {
        color: white;
    }

    .delete:hover {
        background-color: #FF0000EE;
    }

    .connection {
        stroke: red;
    }

    .connection.any {
        stroke: var(--wire-any);
    }

    .connection.command {
        stroke: var(--wire-command);
    }

    .connection-selector {
        stroke: transparent;
        pointer-events: auto;
    }

    .connection-selector:hover {
        stroke: #FFF5;
    }

    .node {
        position: absolute;
        z-index: 251;
        width: 1em;
        height: 1em;
        border-radius: 50%;
        background-color: red;
        pointer-events: none;

        /* disgusting hack */
        margin-left: -0.5em;
        margin-top: -0.5em;
    }

    .node.any {
        background-color: var(--wire-any);
    }

    .node.command {
        background-color: var(--wire-command);
    }


</style>
