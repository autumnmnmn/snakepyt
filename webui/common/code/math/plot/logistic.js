
const tick_range = (min, max, step) =>
    Array.from(
        {length: Math.round((max - min) / step) + 1},
        (_, i) => min + i * step)
    .filter(v => Math.abs(v) > 1e-9);

const linspace = (start, end, n) =>
    Array.from({ length: n }, (_, i) => start + (end - start) * i / (n - 1))



export async function main(svg) {

    let r = 2.4;

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

    const draw_path = () => {
        const { x, y } = layout;

        const x_data = linspace(x_min, x_max, 100);
        const y_data = x_data.map(x_val => r * x_val * (1 - x_val));
        const path = $svgElement("path");
        const d = x_data
            .map((x_val, i) => `${i === 0 ? "M" : "L"}${x(x_val)},${y(y_data[i])}`)
            .join(" ");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("class", "data");
        data_group.replaceChildren(path);
    };

    let layout = get_layout();
    draw_grid(layout);
    draw_path(layout);

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
            onUpdate: (value) => { r = value; draw_path(layout); }
        }
    ];

    new ResizeObserver(() => {
        layout = get_layout();
        draw_grid(layout);
        draw_path(layout);
    })
    .observe(svg);

    return { controls };
}
