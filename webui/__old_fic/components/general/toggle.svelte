<script lang="ts">

    export let state = false;

    function onClick(event: MouseEvent) {
        if (event.button !== 0) return;
        
        state = !state;
    }

</script>

<div on:mousedown={onClick}>
    {#if state}
        <slot name="on" />
    {:else}
        <slot name="off" />
    {/if}
</div>