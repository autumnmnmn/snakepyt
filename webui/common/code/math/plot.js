
$css(`

svg.plot {
    background-color: var(--main-background);
    width: 50%;
    height: 100%;
}

svg.plot .guide {
    stroke: var(--main-faded);
    stroke-width: 1;
}

svg.plot .axis {
    stroke: var(--main-solid);
    stroke-width: 1;
}

svg.plot .data {
    stroke: var(--main-solid);
    stroke-width: 2;
}

`);

export async function main(target, plot_id) {
    const plot = await import(`/code/math/plot/${plot_id.trim()}.js`);

    const plotContainer = $div("full");
    const svg = $svgElement("svg");

    svg.setAttribute("class", "plot");

    // attach immediately to get actual dimensions
    target.$with(plotContainer.$with(svg));

    const plotModule = await plot.main(svg);

    if (plotModule?.controls) {
        const controls = await $prepMod("control/panel",
            ["Parameters", plotModule.controls]
        );

        await $mod("layout/split",
            target,
            [{ content: [controls, plotContainer], percents: [20, 80] }]
        );
    } else {
        target.$with(plotContainer);
    }
}

