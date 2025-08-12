<!-- This wraps any element (or a group of elements), turning it into a handle for drag-and-drop operations. See floating_pane.svelte for usage examples. -->

<script lang="ts">

    export let onDrag: { (x: number | string | null, y: number | string | null): void };

    export let getOffset: { (): { x: number, y: number } };

    export let onDragStart: { (): void } = () => { };
    export let onDragEnd: { (): void } = () => { };

    export let xEnabled = true;
    export let yEnabled = true;

    let drag_offset_x = 0;
    let drag_offset_y = 0;

    function dragHandleMouseDown(event: MouseEvent) {
        if (event.button !== 0) return; // Only left-clicks
        event.preventDefault()

        let offset = getOffset();
        drag_offset_x = event.clientX - offset.x;
        drag_offset_y = event.clientY - offset.y;

        document.addEventListener("mousemove", dragHandleMove);
        document.addEventListener("mouseup", dragHandleMouseUp);

        onDragStart();
    }

    function dragHandleMove(event: MouseEvent) {
        let x = event.clientX - drag_offset_x;
        let y = event.clientY - drag_offset_y;
        onDrag(xEnabled ? x : null, yEnabled ? y : null);
    }

    function dragHandleMouseUp(event: MouseEvent) {
        document.removeEventListener("mouseup", dragHandleMouseUp);
        document.removeEventListener("mousemove", dragHandleMove);
        
        onDragEnd();
    }

</script>

<div on:mousedown={dragHandleMouseDown} {...$$restProps}>
    <slot/>
</div>
