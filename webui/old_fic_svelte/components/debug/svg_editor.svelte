<script lang="ts">
    import PaneColumn from "../layout/pane_column.svelte";

    let content: string = "<path d=\"M 50 70 C 100 70, 50 140, 100 140\" stroke=\"red\" stroke-width=\"4\" fill=\"none\"/>";

    let svgElement: SVGSVGElement;

    $: {
        if (svgElement !== undefined) {
            content = content;
            svgElement.innerHTML = content;
        }
    }
</script>

<PaneColumn>
    <textarea slot=top bind:value={content} />
    <div slot=bottom class=svg-backdrop>
        <svg bind:this={svgElement} xmlns="http://www.w3.org/2000/svg" >
        </svg>
    </div>
</PaneColumn>

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

    textarea {
        width: 100%;
        height: 100%;
        resize: none;
        border: 0;
    }

    svg {
        width: 100%;
        height: 100%;
    }
</style>