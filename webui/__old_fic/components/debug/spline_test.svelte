<script lang="ts">
    import DragHandle from "../general/drag_handle.svelte";

    let x1: number = 50;
    let y1: number = 70;
    let x2: number = 100;
    let y2: number = 140;

    let svgElement: SVGSVGElement;

    function onDrag1(x: string | number | null, y: string | number | null) {
        if (x === null) return;
        if (y === null) return;
        if (typeof x === "string") x = parseInt(x);
        if (typeof y === "string") y = parseInt(y);

        x1 = x;
        y1 = y;

        controlOffset = 0.5 * Math.abs(x2 - x1);
        if (controlOffset < 50) controlOffset = 50;
    }

    function onDrag2(x: string | number | null, y: string | number | null) {
        if (x === null) return;
        if (y === null) return;
        if (typeof x === "string") x = parseInt(x);
        if (typeof y === "string") y = parseInt(y);

        x2 = x;
        y2 = y;

        controlOffset = 0.5 * Math.abs(x2 - x1);
        if (controlOffset < 50) controlOffset = 50;
    }

    function getOffset1() {
        return { x: x1, y: y1 };
    }

    function getOffset2() {
        return { x: x2, y: y2 };
    }

    let controlOffset = 0.5 * Math.abs(x2 - x1);
    if (controlOffset < 50) controlOffset = 50;
</script>

<div class=svg-backdrop>
    <svg bind:this={svgElement} xmlns="http://www.w3.org/2000/svg" >
        <path d="M {x1} {y1} C {x1 + controlOffset} {y1}, {x2 - controlOffset} {y2}, {x2} {y2}" stroke="red" stroke-width="4" fill="none"/>
    </svg>
    <div style="width: auto; height: auto; position: absolute; top: {y1 - 5}px; left: {x1 - 5}px;">
        <DragHandle onDrag={onDrag1} getOffset={getOffset1}>
            <div style="width: 10px; height: 10px; user-select: none; background-color: green; border-radius: 50%;" />
        </DragHandle>
    </div>
    <div style="width: auto; height: auto; position: absolute; top: {y2 - 5}px; left: {x2 - 5}px;">
        <DragHandle onDrag={onDrag2} getOffset={getOffset2}>
            <div style="width: 10px; height: 10px; user-select: none; background-color: blue; border-radius: 50%;" />
        </DragHandle>
    </div>
</div>

<style>
    .svg-backdrop {
        --a: var(--workspace-background);
        --b: var(--workspace-grid);
        background-color: var(--a);
        background-image: repeating-linear-gradient(45deg, var(--b) 25%, transparent 25%, transparent 75%, var(--b) 75%, var(--b)), repeating-linear-gradient(45deg, var(--b) 25%, var(--a) 25%, var(--a) 75%, var(--b) 75%, var(--b));
        background-position: 0 0, 10px 10px;
        background-size: 20px 20px;
        width: 100%;
        height: 100%;
    }

    svg {
        width: 100%;
        height: 100%;
    }
</style>