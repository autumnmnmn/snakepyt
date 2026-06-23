
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

import { identity } from '/code/math/core.js';

export const svg_space = (project=identity, scale=identity) => {

    const path_operations = (absolute) => {
        const _cmd = absolute ? (x => x) : (x => x.toLowerCase());
        return {
            move: (p) => {
                const pr = project(p);
                return `${_cmd("M")} ${pr.x} ${pr.y}`;
            },
            line: (p) => {
                const pr = project(p);
                return `${_cmd("L")} ${pr.x} ${pr.y}`;
            },
            close: () => _cmd("Z"),
            cubic: (p1, p2, p) => {
                const pr1 = project(p1);
                const pr2 = project(p2);
                const pr = project(p);
                return `${_cmd("C")} ${pr1.x} ${pr1.y} ${pr2.x} ${pr2.y} ${pr.x} ${pr.y}`;
            },
            continue_cubic: (p2, p) => {
                const pr2 = project(p2);
                const pr = project(p);
                return `${_cmd("S")} ${pr2.x} ${pr2.y} ${pr.x} ${pr.y}`;
            },
            quadratic: (p1, p) => {
                const pr1 = project(p1);
                const pr = project(p);
                return `${_cmd("Q")} ${pr1.x} ${pr1.y} ${pr.x} ${pr.y}`;
            },
            continue_quadratic: (p) => {
                const pr = project(p);
                return `${_cmd("T")} ${pr.x} ${pr.y}`;
            },
            arc: (rx, ry, xAxisRotation, largeArcFlag, sweepFlag, p) => {
                const pr = project(p);
                return `${_cmd("A")} ${rx} ${ry} ${xAxisRotation} ${largeArcFlag} ${sweepFlag} ${pr.x} ${pr.y}`;
            }
        }
    };

    const absolute_path_commands = path_operations(true);
    const relative_path_commands = path_operations(false);

    return {
        line: (point1, point2, _class=null) => {
            const proj1 = project(point1);
            const proj2 = project(point2);

            const element = $svgElement("line");
            element.setAttribute("x1", proj1.x);
            element.setAttribute("y1", proj1.y);
            element.setAttribute("x2", proj2.x);
            element.setAttribute("y2", proj2.y);
            if (_class) element.setAttribute("class", _class);

            return element;
        },

        circle: (center, radius, _class=null) => {
            const proj = project(center);

            const element = $svgElement("circle");
            element.setAttribute("cx", proj.x);
            element.setAttribute("cy", proj.y);
            element.setAttribute("r", radius);
            if (_class) element.setAttribute("class", _class);

            return element;
        },

        polygon: (points, _class=null) => {
            const element = $svgElement("polygon");

            const pointsString = points.map(p => {
                const proj = project(p);
                return `${proj.x},${proj.y}`;
            }).join(" ");

            element.setAttribute("points", pointsString);
            if (_class) element.setAttribute("class", _class);

            return element;
        },

        path: (makeCommands, _class=null) => {
            const element = $svgElement("path");

            const commands = makeCommands(absolute_path_commands, relative_path_commands);

            element.setAttribute("d", commands.join(" "));

            if (_class) element.setAttribute("class", _class);

            return element;
        },

        text: (point, content, _class=null) => {
            const proj = project(point);

            const element = $svgElement("text");
            element.setAttribute("x", proj.x);
            element.setAttribute("y", proj.y);
            if (_class) element.setAttribute("class", _class);
            element.textContent = content;

            return element;
        },

        math: (point, mathContent, _class=null) => {
            const proj = project(point);

            const element = $svgElement("foreignObject");
            element.setAttribute("x", proj.x);
            element.setAttribute("y", proj.y);

            // according to gemini:
            // foreignObject strictly *requires* width and height attributes in most browsers
            // to avoid having to calculate it we just set width/height to 1 and let it overflow
            element.setAttribute("width", "1");
            element.setAttribute("height", "1");
            element.setAttribute("overflow", "visible");

            if (_class) element.setAttribute("class", _class);

            if (typeof mathContent === "string") {
                const wrapper = $htmlElement("div");
                wrapper.textContent = mathContent;
                element.appendChild(wrapper);
            } else {
                element.appendChild(mathContent);
            }

            return element;
        }
    };
};

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

