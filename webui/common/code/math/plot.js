
$css(`

svg.plot {
    background-color: var(--main-background);
    width: 100%;
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

svg.plot .axis .3d {
    stroke: var(--main-solid);
    stroke-width: 1;
}

svg.plot .data {
    stroke: var(--main-solid);
    stroke-width: 2;
}

svg.plot .data.dashed {
    stroke: var(--main-solid);
    stroke-dasharray: 2 2;
    stroke-width: 1;
}

`);

export async function main(plot_id) {
    const plot = await import(`/code/math/plot/${plot_id.trim()}.js`);

    const svg = $svgElement("svg");
    const plotContainer = $div("full").$with(svg);

    const dom = [];

    svg.setAttribute("class", "plot");

    // attach immediately to get actual dimensions
    //target.$with(plotContainer.$with(svg));

    const plotModule = await plot.main(svg);

    if (plotModule?.controls) {
        const controls = await $mod("control/panel",
            "Parameters", plotModule.controls
        );

        const split = await $mod("layout/split",
            { content: [controls.dom, plotContainer], percents: [20, 80] }
        );

        dom.push(...split.dom);
    } else {
        dom.push(plotContainer);
    }

    svg.$contextMenu = {
        items: [
            ["save svg", () => {
                const clone = svg.cloneNode(true);
                const computed = getComputedStyle(svg);

                const resolveVars = str => str.replace(
                    /var\((--[\w-]+)\)/g,
                    (_, name) => computed.getPropertyValue(name).trim()
                ).replace(/(width|height):.*%;/g, "");

                const styleEl = $svgElement("style");
                const relevantRules = Array.from(document.adoptedStyleSheets)
                    .flatMap(sheet => { try { return Array.from(sheet.cssRules) } catch { return [] } })
                    .filter(rule => { return rule.selectorText?.includes("plot") })
                    .map(rule => resolveVars(rule.cssText))
                    .join("\n");

                styleEl.textContent = relevantRules;
                clone.prepend(styleEl);

                clone.setAttribute("width", svg.clientWidth);
                clone.setAttribute("height", svg.clientHeight);

                const svgString = new XMLSerializer().serializeToString(clone);
                const blob = new Blob([svgString], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = $element("a");
                a.href = url;
                a.download = `${plot_id.trim()}_${Date.now()}.svg`;
                a.click();
                URL.revokeObjectURL(url);
            }]
        ]
    };

    return { dom };
}

