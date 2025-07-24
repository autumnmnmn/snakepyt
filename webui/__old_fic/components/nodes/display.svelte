<script lang="ts">
    import Receiver from "../wiring/receiver.svelte";
    import Transmitter from "../wiring/transmitter.svelte";
    import MessageDisplay from "../displays/message_display.svelte";

    let message: Message = { schema: "nothing" };

    let transmitter: Transmitter;

    function onReceive(m: Message) {
        message = m;
        transmitter.send(m);
    }
</script>


<div class="outer-container">
    <Receiver {onReceive} style="left: -1.5em" />
    <div class="inner-container">
        <MessageDisplay {message} context="passthrough" height=100% />
    </div>
    <Transmitter bind:this={transmitter} style="right: -1.5em" />
</div>


<style>
    .outer-container {
        position: absolute;
        margin: 0;
        padding: 0;
        border: 0;
        width: 100%;
        height: 100%;
        /* background-color: var(--pane-backdrop); */
    }

    .inner-container {
        position: absolute;
        margin: 0;
        padding: 0;
        border: 0;
        /* top: 0.5em;
        left: 1em;
        width: calc(100% - 1em - 4px);
        height: calc(100% - 1em); */
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        /* background-color: var(--pane-backdrop); */
    }
</style>