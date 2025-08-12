<script lang="ts">
    import Receiver from "../wiring/receiver.svelte";
    import MessageDisplay from "../displays/message_display.svelte";
    import { tick } from "svelte";

    export let messages: Message[] = [];

    let snapToBottom = true;

    let innerContainer: HTMLDivElement;
    let scrollZone: HTMLDivElement;

    export function onReceive(m: Message) {
        messages.push(m);
        messages = messages;
        console.log(m);
        tick().then(() => {
            if (snapToBottom) {
               scrollZone.scrollTop = innerContainer.clientHeight - scrollZone.clientHeight;
            }
        });
    }

    export function clear() {
        messages = [];
        messages = messages;
        console.log('shit')
    }
</script>


<div class="outer-container">
    <Receiver {onReceive} style="left: -1.5em" />
    <div class=inner-container>
        <div class=scroll-zone bind:this={scrollZone}>
            <div class=innest-container bind:this={innerContainer}>
                {#each messages as message}
                    <div class=message-wrapper >
                        <MessageDisplay {message} />
                    </div>
                {/each}
            </div>
        </div>
    </div>
    <!--<Transmitter bind:this={transmitter} />-->
</div>


<style>
    .outer-container {
        position: absolute;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        height: 100%;
        background-color: var(--pane-backdrop);
    }

    .inner-container {
        position: absolute;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        height: 100%;
        background-color: var(--pane-backdrop);
    }

    .scroll-zone {
        position: absolute;
        width: calc(100% - 1em);
        height: calc(100% - 1em);
        scroll-snap-type: y mandatory;
        scroll-snap-align: end;
        left: 0.5em;
        top: 0.5em;
        overflow-y: auto;
    }

    .innest-container {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        min-height: 100%;
    }

    .message-wrapper {
        margin-right: 0.5em;
        line-height: 0;
        border-bottom: 1px solid var(--pane-divider)
    }

    .message-wrapper:last-child {
        border-bottom: 0;
    }

    ::-webkit-scrollbar {
        width: 10px;
        position: absolute;
        right: 10px;
        margin-left: 0.5em;
    }

    ::-webkit-scrollbar-track {
        background: #344;
        cursor: pointer !important;
    }

    ::-webkit-scrollbar-thumb {
        background: #788;
        cursor: pointer !important;
    }

    ::-webkit-scrollbar-track:hover, ::-webkit-scrollbar-thumb:hover {
        cursor: pointer !important;
        user-select: none;
    }
</style>