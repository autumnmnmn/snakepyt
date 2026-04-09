
const tick_range = (min, max, step) =>
    Array.from(
        {length: Math.round((max - min) / step) + 1},
        (_, i) => min + i * step)
    .filter(v => Math.abs(v) > 1e-9);

const linspace = (start, end, n) =>
    Array.from({ length: n }, (_, i) => start + (end - start) * i / (n - 1))


import { greek } from "/code/math/math.js";

export async function main(svg) {

    let r = 2.4;
    let alpha = 0.9;

    const x_min = -0.1;
    const x_max = 1.1;
    const y_min = -0.1;
    const y_max = 1.1;

    const x_ticks = tick_range(x_min, x_max, 0.1);
    const y_ticks = tick_range(y_min, y_max, 0.1);

    const get_layout = () => {
        const width = svg.clientWidth;
        const height = svg.clientHeight;

        const plot_left = 0.1 * width;
        const plot_right = 0.9 * width;
        const plot_bottom = 0.9 * height;
        const plot_top = 0.1 * height;

        const x = (x_val) => {
            const t = (x_val - x_min) / (x_max - x_min);
            return plot_left + t * (plot_right - plot_left);
        };

        const y = (y_val) => {
            const t = (y_val - y_min) / (y_max - y_min);
            return plot_bottom + t * (plot_top - plot_bottom);
        };

        const overhang_x = 0.033 * width;
        const overhang_y = -0.033 * height;

        const inset_x = 0.017 * width;
        const inset_y = -0.017 * height;

        return { x, y, width, height, overhang_x, overhang_y, inset_x, inset_y };
    };

    const grid_group = $svgElement("g");

    const draw_grid = (layout) => {
        const { x, y, overhang_x, overhang_y, inset_x, inset_y } = layout;

        const x_axis = $svgElement("line");
        x_axis.setAttribute("x1", x(x_min) - overhang_x);
        x_axis.setAttribute("x2", x(x_max) + overhang_x);
        x_axis.setAttribute("y1", y(0));
        x_axis.setAttribute("y2", y(0));
        x_axis.setAttribute("class", "axis");

        const y_axis = $svgElement("line");
        y_axis.setAttribute("x1", x(0));
        y_axis.setAttribute("x2", x(0));
        y_axis.setAttribute("y1", y(y_min) - overhang_y);
        y_axis.setAttribute("y2", y(y_max) + overhang_y);
        y_axis.setAttribute("class", "axis");

        const x_guides = x_ticks.map(x_val => {
            const tick = $svgElement("line");
            tick.setAttribute("x1", x(x_val));
            tick.setAttribute("x2", x(x_val));
            tick.setAttribute("y1", y(y_min) - inset_y);
            tick.setAttribute("y2", y(y_max) + inset_y);
            tick.setAttribute("class", "guide");
            return tick;
        });

        const y_guides = y_ticks.map(y_val => {
            const tick = $svgElement("line");
            tick.setAttribute("x1", x(x_min) - inset_x);
            tick.setAttribute("x2", x(x_max) + inset_x);
            tick.setAttribute("y1", y(y_val));
            tick.setAttribute("y2", y(y_val));
            tick.setAttribute("class", "guide");
            return tick;
        });

        grid_group.replaceChildren(x_axis, y_axis, ...x_guides, ...y_guides);
    };

    const data_group = $svgElement("g");

    const draw_paths = () => {
        const { x, y } = layout;

        const x_data_left = linspace(x_min, 0.5, 150);
        const y_data_left = x_data_left.map(x_val => {
            if (x_val > 0.5) {
                return r * x_val * (1 - x_val)
            }
            else {
                return r * x_val * (1 - x_val) + 0.25 * (alpha - 1) * (r - 2)
            }

        });
        const path_left = $svgElement("path");
        const d_left = x_data_left
            .map((x_val, i) => `${i === 0 ? "M" : "L"}${x(x_val)},${y(y_data_left[i])}`)
            .join(" ");
        path_left.setAttribute("d", d_left);
        path_left.setAttribute("fill", "none");
        path_left.setAttribute("class", "data");


        const x_data_right = linspace(0.5001, x_max, 150);
        const y_data_right = x_data_right.map(x_val => {
            if (x_val > 0.5) {
                return r * x_val * (1 - x_val)
            }
            else {
                return r * x_val * (1 - x_val) + 0.25 * (alpha - 1) * (r - 2)
            }

        });
        const path_right = $svgElement("path");
        const d_right = x_data_right
            .map((x_val, i) => `${i === 0 ? "M" : "L"}${x(x_val)},${y(y_data_right[i])}`)
            .join(" ");
        path_right.setAttribute("d", d_right);
        path_right.setAttribute("fill", "none");
        path_right.setAttribute("class", "data");

        data_group.replaceChildren(path_left, path_right);
    };

    let layout = get_layout();
    draw_grid(layout);
    draw_paths(layout);

    svg.$with(
        grid_group,
        data_group
    );

    const controls = [
        {
            type: "number",
            label: "r",
            value: r,
            min: 0,
            max: 4,
            step: 0.01,
            onUpdate: (value) => { r = value; draw_paths(layout); }
        },
        {
            type: "number",
            label: greek["alpha"],
            value: alpha,
            min: 0.8,
            max: 1.0,
            step: 0.01,
            onUpdate: (value) => { alpha = value; draw_paths(layout); }
        }
    ];

    new ResizeObserver(() => {
        layout = get_layout();
        draw_grid(layout);
        draw_paths(layout);
    })
    .observe(svg);

    return { controls };
}

