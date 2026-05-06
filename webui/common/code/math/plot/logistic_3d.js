
const tick_range = (min, max, step) =>
    Array.from(
        {length: Math.round((max - min) / step) + 1},
        (_, i) => min + i * step)
    .filter(v => Math.abs(v) > 1e-9);

const linspace = (start, end, n) =>
    Array.from({ length: n }, (_, i) => start + (end - start) * i / (n - 1))

const line = (p1, p2, _class) => {
    const element = $svgElement("line");
    element.setAttribute("x1", p1.x);
    element.setAttribute("x2", p2.x);
    element.setAttribute("y1", p1.y);
    element.setAttribute("y2", p2.y);
    element.setAttribute("class", _class);
    return element;
};

import { v2, v3, m33 as mat } from '/code/math/vector.js';
import '/code/math/constants.js';

function partition_region(width, height) {
    const scale_wide = Math.min(width / 3, height / 2);
    const scale_tall = Math.min(width / 2, height / 3);
    const use_wide = scale_wide >= scale_tall;
    const scale = use_wide ? scale_wide : scale_tall;

    const rect_width = use_wide ? 3 * scale : 2 * scale;
    const rect_height = use_wide ? 2 * scale : 3 * scale;
    const origin_x = 0;//(width - rect_width) / 2;
    const origin_y = 0;//(height - rect_height) / 2;

    const box = (x, y, w, h) => ({ min: { x, y }, max: { x: x + w, y: y + h } });

    if (use_wide) {
        const small_a = box(origin_x,           origin_y,         scale,     scale);
        const small_b = box(origin_x,           origin_y + scale, scale,     scale);
        const big     = box(origin_x + scale,   origin_y,         2 * scale, 2 * scale);
        return { small_a, small_b, big };
    } else {
        const small_a = box(origin_x,           origin_y,         scale,     scale);
        const small_b = box(origin_x + scale,   origin_y,         scale,     scale);
        const big     = box(origin_x,           origin_y + scale, 2 * scale, 2 * scale);
        return { small_a, small_b, big };
    }
}

const smoothstep = t => t * t * (3 - 2 * t);

export async function main(svg) {

    let r = 2.4;
    let alpha = 0.907;
    let view_angle = 0.125;
    let view_height = 0.06;
    let resolution = 200;

    let endpoints = true;

    const logistic_map = x => r * x * (1 - x);
    const discontinuous_map = x => {
        return x > 0.5 ?
        r * x * (1 - x) :
        r * x * (1 - x) + 0.25 * (alpha - 1) * (r - 2)
    };

    let map = logistic_map;


    let init_x_data = linspace(0, 1, resolution).map(smoothstep);
    let x_data = init_x_data;
    let y_data = x_data;//x_data.map(map);
    let z_data = y_data.map(map);

    const recompute_data = () => {
        //y_data = x_data;//.map(map);
        z_data = y_data.map(map);
    };

    const bounds_min = v3.of(-0.1, -0.1, -0.1);
    const bounds_max = v3.of(1.1, 1.1, 1.1);

    const overhang = v3.of(0.05, 0.05, 0.05);

    const x_ticks = tick_range(bounds_min.x, bounds_max.x, 0.1);
    const y_ticks = tick_range(bounds_min.y, bounds_max.y, 0.1);
    const z_ticks = tick_range(bounds_min.z, bounds_max.z, 0.1);

    const grid_group_3d = $svgElement("g");
    const data_group_3d = $svgElement("g");
    grid_group_3d.setAttribute("aria-label", "grid-group-3d");
    data_group_3d.setAttribute("aria-label", "data-group-3d");

    const grid_group_xy = $svgElement("g");
    const data_group_xy = $svgElement("g");
    grid_group_xy.setAttribute("aria-label", "grid-group-xy");
    data_group_xy.setAttribute("aria-label", "data-group-xy");

    const grid_group_xz = $svgElement("g");
    const data_group_xz = $svgElement("g");
    grid_group_xz.setAttribute("aria-label", "grid-group-xz");
    data_group_xz.setAttribute("aria-label", "data-group-xz");

    const get_layouts = () => {
        const width = svg.clientWidth;
        const height = svg.clientHeight;

        const partitions = partition_region(width, height);

        let rot_y = mat.rot_y((0.25-view_angle) * $tau);
        let rot_x = mat.rot_x(view_height * $tau);

        const transform_3d = mat.matmul(rot_x, rot_y);
        const transform_xy = mat.ident;
        const transform_xz = mat.rot_x(-$tau / 4);

        const corners = [
            v3.of(bounds_min.x, bounds_min.y, bounds_min.z),
            v3.of(bounds_max.x, bounds_min.y, bounds_min.z),
            v3.of(bounds_min.x, bounds_max.y, bounds_min.z),
            v3.of(bounds_max.x, bounds_max.y, bounds_min.z),
            v3.of(bounds_min.x, bounds_min.y, bounds_max.z),
            v3.of(bounds_max.x, bounds_min.y, bounds_max.z),
            v3.of(bounds_min.x, bounds_max.y, bounds_max.z),
            v3.of(bounds_max.x, bounds_max.y, bounds_max.z),
        ];

        const corners_3d = corners.map(c => v3.matmul(transform_3d, c));
        const corners_xy = corners.map(c => v3.matmul(transform_xy, c));
        const corners_xz = corners.map(c => v3.matmul(transform_xz, c));

        const extrema = (() => {
            const bounds = (corners) => ({
                x_min: Math.min(...corners.map(c => c.x)),
                x_max: Math.max(...corners.map(c => c.x)),
                y_min: Math.min(...corners.map(c => c.y)),
                y_max: Math.max(...corners.map(c => c.y)),
            });
            return {
                xyz: bounds(corners_3d),
                xy:  bounds(corners_xy),
                xz:  bounds(corners_xz),
            };
        })();

        const plot_left = 0.1 * width;
        const plot_right = 0.9 * width;
        const plot_bottom = 0.9 * height;
        const plot_top = 0.1 * height;

        const x = (x_val, partition, extrema) => {
            const t = (x_val - extrema.x_min) / (extrema.x_max - extrema.x_min);
            return partition.min.x + (t * 0.8 + 0.1) * (partition.max.x - partition.min.x);
        };

        const y = (y_val, partition, extrema) => {
            const t = (y_val - extrema.y_min) / (extrema.y_max - extrema.y_min);
            return partition.max.y + (t * 0.8 + 0.1) * (partition.min.y - partition.max.y);
        };

        const place_3d = (point) => {
            const transformed = v3.matmul(transform_3d, point);
            return {
                x: x(transformed.x, partitions.big, extrema.xyz),
                y: y(transformed.y, partitions.big, extrema.xyz)
            };
        };

        const place_xy = (point) => {
            const transformed = v3.matmul(transform_xy, point);
            return {
                x: x(transformed.x, partitions.small_a, extrema.xy),
                y: y(transformed.y, partitions.small_a, extrema.xy)
            };
        };

        const place_xz = (point) => {
            const transformed = v3.matmul(transform_xz, point);
            return {
                x: x(transformed.x, partitions.small_b, extrema.xz),
                y: y(transformed.y, partitions.small_b, extrema.xz)
            };
        };

        return {
            xyz: {
                place: place_3d,
                grid_group: grid_group_3d,
                data_group: data_group_3d
            },
            xy: {
                place: place_xy,
                grid_group: grid_group_xy,
                data_group: data_group_xy
            },
            xz: {
                place: place_xz,
                grid_group: grid_group_xz,
                data_group: data_group_xz
            }
        };
    };

    const draw_grid = (layout) => {
        const { place, grid_group } = layout;

        const x_axis = line(
            place({ x: bounds_min.x - overhang.x, y: 0, z: 0 }),
            place({ x: bounds_max.x + overhang.x, y: 0, z: 0 }),
            "axis"
        );

        const y_axis = line(
            place({ y: bounds_min.y - overhang.y, x: 0, z: 0 }),
            place({ y: bounds_max.y + overhang.y, x: 0, z: 0 }),
            "axis"
        );

        const z_axis = line(
            place({ z: bounds_min.z - overhang.z, x: 0, y: 0 }),
            place({ z: bounds_max.z + overhang.z, x: 0, y: 0 }),
            "axis 3d"
        );

        const x_guides_xy = x_ticks.map(x_val =>
            line(
                place({ x: x_val, y: bounds_min.y - overhang.y / 2, z: 0 }),
                place({ x: x_val, y: bounds_max.y + overhang.y / 2, z: 0 }),
                "guide"
            )
        );

        const y_guides_xy = y_ticks.map(y_val =>
            line(
                place({ y: y_val, x: bounds_min.x - overhang.x / 2, z: 0 }),
                place({ y: y_val, x: bounds_max.x + overhang.x / 2, z: 0 }),
                "guide"
            )
        );

        const x_guides_xz = x_ticks.map(x_val =>
            line(
                place({ x: x_val, y: 0, z: bounds_min.z - overhang.z / 2 }),
                place({ x: x_val, y: 0, z: bounds_max.z + overhang.z / 2 }),
                "guide 3d"
            )
        );
        const z_guides_xz = z_ticks.map(z_val =>
            line(
                place({ z: z_val, x: bounds_min.x - overhang.x / 2, y: 0 }),
                place({ z: z_val, x: bounds_max.x + overhang.x / 2, y: 0 }),
                "guide 3d"
            )
        );

        grid_group.replaceChildren(
            x_axis, y_axis, z_axis,
            ...x_guides_xy, ...y_guides_xy,
            ...x_guides_xz, ...z_guides_xz
        );
    };

    const clamp = (value, low=-100, high=100) => Math.max(low, Math.min(high, value));

    const draw_path = (layout, zero_y=false, zero_z=false) => {
        const { place, data_group } = layout;

        const path = $svgElement("path");
        const p = (x_val, i) => place({ x: x_val, y: zero_y ? 0 : clamp(y_data[i]), z: zero_z ? 0 : clamp(z_data[i]) });
        const sliced = endpoints ? init_x_data : init_x_data.slice(1, -1);
        const offset = endpoints ? 0 : 1;
        const d = sliced
            .map((x_val, i) => `${i === 0 ? "M" : "L"}${p(x_val, i + offset).x},${p(x_val, i + offset).y}`)
            .join(" ");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        const classes = (zero_y || zero_z) ? "data dashed" : "data";
        path.setAttribute("class", classes);
        if (zero_y || zero_z) {
            data_group.append(path);
        } else {
            data_group.replaceChildren(path);
        }
    };

    let layouts = get_layouts();
    draw_grid(layouts.xyz);
    draw_path(layouts.xyz);
    draw_path(layouts.xyz, true, false);
    draw_path(layouts.xyz, false, true);
    draw_grid(layouts.xy);
    draw_path(layouts.xy);
    draw_grid(layouts.xz);
    draw_path(layouts.xz);

    svg.$with(
        grid_group_3d,
        data_group_3d,
        grid_group_xy,
        data_group_xy,
        grid_group_xz,
        data_group_xz
    );

    const redraw_all = () => {
        layouts = get_layouts();
        draw_grid(layouts.xyz);
        draw_path(layouts.xyz);
        draw_path(layouts.xyz, true, false);
        draw_path(layouts.xyz, false, true);
        draw_grid(layouts.xy);
        draw_path(layouts.xy);
        draw_grid(layouts.xz);
        draw_path(layouts.xz);
    };

    const redraw_3d = () => {
        layouts = get_layouts();
        draw_grid(layouts.xyz);
        draw_path(layouts.xyz);
        draw_path(layouts.xyz, true, false);
        draw_path(layouts.xyz, false, true);
    };

    const redraw_paths = () => {
        draw_path(layouts.xyz);
        draw_path(layouts.xyz, true, false);
        draw_path(layouts.xyz, false, true);
        draw_path(layouts.xy);
        draw_path(layouts.xz);
    };

    const controls = [
        {
            type: "number",
            label: "r",
            value: r,
            min: 0,
            max: 4,
            step: 0.01,
            onUpdate: (value) => { r = value; recompute_data(); redraw_paths(); }
        },
        {
            type: "number",
            label: "view angle",
            value: view_angle,
            min: 0,
            max: 1,
            step: 0.001,
            onUpdate: (value) => { view_angle = value; redraw_3d(); }
        },/*
        {
            type: "number",
            label: "view height",
            value: view_height,
            min: -1/4,
            max: 1/4,
            step: 0.001,
            onUpdate: (value) => { view_height = value; redraw_3d(); }
        },*/
        {
            type: "button",
            label: "step",
            action: (state) => {
                x_data = y_data;
                y_data = z_data;
                recompute_data();
                redraw_paths();
            }
        },
        {
            type: "button",
            label: "reset",
            action: (state) => {
                x_data = init_x_data;
                y_data = x_data;
                recompute_data();
                redraw_paths();
            }
        },
        {
            type: "number",
            label: "resolution",
            value: resolution,
            min: 3,
            max: 2000,
            step: 1,
            onUpdate: (value) => {
                resolution = value;
                init_x_data = linspace(0, 1, resolution).map(smoothstep);
                x_data = init_x_data;
                y_data = x_data;
                recompute_data();
                redraw_paths();
            }
        },
        {
            type: "toggle",
            label: "include endpoints",
            value: endpoints,
            states: ["no", "yes"],
            onUpdate: (value) => {
                endpoints = value;
                redraw_paths();
            }
        },
        {
            type: "toggle",
            label: "discontinuity",
            value: map === discontinuous_map,
            states: ["no", "yes"],
            onUpdate: (value) => {
                map = value ? discontinuous_map : logistic_map;
                recompute_data();
                redraw_paths();
            }
        },
        {
            type: "number",
            label: "alpha",
            value: alpha,
            min: 0,
            max: 1,
            step: 0.01,
            onUpdate: (value) => { alpha = value; recompute_data(); redraw_paths(); }
        }
    ];

    new ResizeObserver(redraw_all).observe(svg);

    return { controls };
}

