
const tick_range = (min, max, step) =>
    Array.from(
        {length: Math.round((max - min) / step) + 1},
        (_, i) => min + i * step)
    .filter(v => Math.abs(v) > 1e-9);

import { Vec2 as v2, Vec3 as v3, Mat3x3 as mat } from "/code/math/vector.js";
import "/code/math/constants.js";
import { svg_space } from "/code/math/plot.js";
import { linspace, smoothstep } from "/code/math/core.js";

export async function main(svg) {
    let x_0 = 0.5;
    let r_a = 2.8;
    //let r_b = 2.8;
    let iterations = 19;
    let show_path = true;

    let data = [];
    let x_positions = []

    const logistic = (x, r) => r * x * (1 - x);

    const bounds_min = v2.of(0, 0);
    const bounds_max = v2.of(1.1, 1.0);

    const overhang = v2.of(0.05, 0.05);

    const x_buffer = 0.05;

    const y_ticks = tick_range(bounds_min.y, bounds_max.y, 0.1);

    const grid_group = $svgElement("g");
    const data_group = $svgElement("g");
    grid_group.setAttribute("aria-label", "grid-group");
    data_group.setAttribute("aria-label", "data-group");

    const get_layout = () => {
        const width = svg.clientWidth;
        const height = svg.clientHeight;

        const x = (x_val) => {
            const t = (x_val - bounds_min.x) / (bounds_max.x - bounds_min.x);
            return width * (t * 0.8 + 0.1);
        };

        const y = (y_val) => {
            const t = (y_val - bounds_min.y) / (bounds_max.y - bounds_min.y);
            return height * (1 - (t * 0.8 + 0.1));
        };

        const place = (point) => v2.of(x(point.x), y(point.y));

        return {
            space: svg_space(place),
            grid_group,
            data_group
        };
    };

    const draw_grid = async (layout) => {
        const { space, grid_group } = layout;

        const x_axis = space.line(
            v2.of(bounds_min.x - overhang.x, 0),
            v2.of(bounds_max.x + overhang.x, 0),
            "axis"
        );
        const y_axis = space.line(
            v2.of(0, bounds_min.y - overhang.y),
            v2.of(0, bounds_max.y + overhang.y),
            "axis"
        );

        const y_guides = y_ticks.map(y_val =>
            space.line(
                v2.of(bounds_min.x - overhang.x / 2, y_val),
                v2.of(bounds_max.x + overhang.x / 2, y_val),
                "guide"
            )
        );

        const y_labels = await y_ticks.$asyncMap(async y_val =>
            space.math(
                v2.of(-0.07, y_val),
                (await $mod("math/math", `inline auto ${y_val.toFixed(1)}`)).dom[0]
            )
        );

        const num_ticks = iterations + 1;
        const gap = (bounds_max.x - bounds_min.x - x_buffer) / (num_ticks + 1);

        x_positions = Array.from({ length: num_ticks }, (_, i) => bounds_min.x + x_buffer + gap * (i + 1));

        let modulus = 1;
        while (num_ticks / modulus > 10) modulus++;

        const x_ticks = x_positions.map((x,i) => ({ x, i })).filter(pair => pair.i % modulus === 0);

        const x_tick_marks = x_ticks.map(pair =>
            space.line(
                v2.of(pair.x, bounds_min.y),
                v2.of(pair.x, bounds_min.y - overhang.y / 2),
                "guide"
            )
        );

        const x_labels = await x_ticks.$asyncMap(async pair =>
            space.math(
                v2.of(pair.x, bounds_min.y - overhang.y - 0.01),
                (await $mod("math/math", `inline auto ${pair.i}`)).dom[0]
            )
        );

        grid_group.replaceChildren(x_axis, y_axis, ...y_guides, ...y_labels, ...x_tick_marks, ...x_labels);
    };

    const recompute_data = () => {
        data = [x_0];
        extend_data();
    };

    const extend_data = () => {
        if (!data || data.length === 0) {
            data = [x_0];
        }

        while (data.length <= iterations) {
            const x_n = data[data.length - 1];
            data.push(logistic(x_n, r_a));
        }
    };

    const redraw_data = () => {
        const { space } = layout;

        const elements = [];

        if (show_path) {
            const data_path = space.path((abs) => {
                const commands = [];
                for (let i = 0; i <= iterations; i++) {
                    if (i >= x_positions.length || i >= data.length) break;

                    const p = v2.of(x_positions[i], data[i]);

                    if (i === 0) {
                        commands.push(abs.move(p));
                    } else {
                        commands.push(abs.line(p));
                    }
                }
                return commands;
            }, "data");

            data_path.setAttribute("fill", "none");

            elements.push(data_path);
        }

        for (let i = 0; i <= iterations; i++) {
            if (i >= x_positions.length || i >= data.length) break;

            const p = v2.of(x_positions[i], data[i]);

            const circle = space.circle(p, 3, "data-point");
            circle.setAttribute("fill", "var(--main-solid)");
            elements.push(circle);
        }

        data_group.replaceChildren(...elements);
    };

    let layout = get_layout();
    await draw_grid(layout);

    svg.$with(grid_group, data_group);

    const redraw_all = async () => {
        layout = get_layout();
        await draw_grid(layout);
        redraw_data();
    };

    const controls = [
        {
            type: "number",
            label: "x_0",
            value: x_0,
            min: 0,
            max: 1,
            step: 0.01,
            onUpdate: async (value) => { x_0 = value; recompute_data(); await redraw_data(); }
        },
        {
            type: "number",
            label: "r",
            value: r_a,
            min: 0,
            max: 4,
            step: 0.01,
            onUpdate: async (value) => { r_a = value; recompute_data(); await redraw_data(); }
        },
        {
            type: "number",
            label: "iterations",
            value: iterations,
            min: 0,
            max: 200,
            step: 1,
            onUpdate: async (value, set, panelState) => {
                iterations = value;
                //if (iterations < 150) { panelState["show path"].show() }
                //else { panelState["show path"].hide() }
                extend_data();
                await redraw_all();
            }
        },
        {
            type: "toggle",
            label: "show path",
            value: show_path,
            onUpdate: async (value) => { show_path = value; await redraw_data(); }
        }
    ];

    extend_data();

    new ResizeObserver(redraw_all).observe(svg);

    return { controls };
}

