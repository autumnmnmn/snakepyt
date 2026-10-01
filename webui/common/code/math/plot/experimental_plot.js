$css(`

.control.string .function-hint {
    color: var(--main-faded);
    font-size: 0.85em;
    line-height: 1.4em;
    padding-top: 0.35em;
}

.control.string .function-error {
    color: var(--main-solid);
    font-style: italic;
    font-size: 0.85em;
    line-height: 1.4em;
    padding-top: 0.35em;
    overflow-wrap: break-word;
}

`);

/* experimental plot

a variant of logistic_3d where the iterated map is not hardcoded:
the user types any expression in x (with parameters r, a, b, c), parsed
and evaluated by the expression library in /code/math/expression. the
panel shows the parsed function and its symbolic derivative (the
library's autodiff) rendered as math. since any map can send values
anywhere, the bounds of the cube fit themselves around the finite data
on every redraw, and non-finite values simply break the path. */

const tick_range = (min, max, step) => {
    const start = Math.ceil(min / step) * step;
    const count = Math.floor((max - start) / step) + 1;
    return Array.from({ length: Math.max(count, 0) }, (_, i) => start + i * step)
        .filter(v => Math.abs(v) > 1e-9);
};

import { Vec2 as v2, Vec3 as v3, Mat3x3 as mat } from "/code/math/vector.js";
import "/code/math/constants.js";
import { svg_space } from "/code/math/plot.js";
import { linspace } from "/code/math/core.js";
import {
    parse,
    collectVariables,
    differentiate,
    simplify,
    toMath,
} from "/code/math/expression/core.js";

function partition_region(width, height) {
    const scale_wide = Math.min(width / 3, height / 2);
    const scale_tall = Math.min(width / 2, height / 3);
    const use_wide = scale_wide >= scale_tall;
    const scale = use_wide ? scale_wide : scale_tall;

    const origin_x = 0;
    const origin_y = 0;

    const box = (x, y, w, h) => ({ min: v2.of( x, y ), max: v2.of( x + w, y + h ) });

    if (use_wide) {
        const small_a = box(origin_x,           origin_y,         scale,     scale);
        const small_b = box(origin_x,           origin_y + scale, scale,     scale);
        const big     = box(origin_x + scale,   origin_y,         2 * scale, 2 * scale);
        return { small_a, small_b, big };
    } else {
        const small_a = box(origin_x,           origin_y,         scale,     scale);
        const small_b = box(origin_x,           origin_y + scale, scale,     scale);
        const big     = box(origin_x,           origin_y + scale, 2 * scale, 2 * scale);
        return { small_a, small_b, big };
    }
}

const named_constants = [
    { name: "pi",  value: Math.PI,          kind: "named" },
    { name: "e",   value: Math.E,           kind: "named" },
    { name: "tau", value: 6.283185307179586, kind: "named" },
    { name: "phi", value: 1.618033988749894, kind: "named" },
];

const parameter_names = ["r", "a", "b", "c"];

const evaluate = (node, scope) => {
    switch (node.type) {
        case "number": return node.value;
        case "variable": return scope[node.name] ?? NaN;
        case "call":
            if (!node.callee.evaluate) return NaN;
            return node.callee.evaluate(
                ...node.arguments.map((argument) => evaluate(argument, scope))
            );
    }
    return NaN;
};

export async function main(svg) {

    let source = "r * x * (1 - x)";
    let tree = parse(source, named_constants, []);
    let parse_error = null;

    const parameters = { r: 2.4, a: 1, b: 1, c: 1 };
    let view_angle = 0.125;
    const view_height = 0.06;
    let resolution = 200;
    let x_min = 0;
    let x_max = 1;

    let endpoints = true;

    let iteration = 0;

    const map = (x) => {
        try {
            return evaluate(tree, { x, ...parameters });
        } catch {
            return NaN;
        }
    };

    let init_x_data = linspace(x_min, x_max, resolution);
    let x_data = init_x_data;
    let y_data = x_data;
    let z_data = y_data.map(map);

    const recompute_data = () => {
        z_data = y_data.map(map);
    };

    let bounds_min = v3.of(-0.1, -0.1, -0.1);
    let bounds_max = v3.of(1.1, 1.1, 1.1);
    let overhang = v3.of(0.05, 0.05, 0.05);
    let ticks = [];

    const nice_step = (raw) => {
        const power = Math.pow(10, Math.floor(Math.log10(raw)));
        const scaled = raw / power;
        return (scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10) * power;
    };

    const update_frame = () => {
        let low = Infinity;
        let high = -Infinity;
        for (const data of [x_data, y_data, z_data]) {
            for (const value of data) {
                if (!Number.isFinite(value)) continue;
                if (value < low) low = value;
                if (value > high) high = value;
            }
        }

        /* the x interval is the declared region of interest: the frame
        follows the data, but at most three interval-widths past it, so
        values from a pole or a diverging orbit run off the edges of the
        view instead of squashing everything else out of it. */
        const anchor_low = Math.min(x_min, x_max);
        const anchor_high = Math.max(x_min, x_max);
        const width = (anchor_high - anchor_low) || 1;
        low = Number.isFinite(low) ? Math.max(low, anchor_low - 3 * width) : anchor_low;
        high = Number.isFinite(high) ? Math.min(high, anchor_high + 3 * width) : anchor_high;
        if (high - low < 1e-9) {
            const center = (low + high) / 2;
            low = center - 0.5;
            high = center + 0.5;
        }
        const pad = 0.1 * (high - low);
        bounds_min = v3.of(low - pad, low - pad, low - pad);
        bounds_max = v3.of(high + pad, high + pad, high + pad);
        const extent = (high + pad) - (low - pad);
        overhang = v3.of(0.05 * extent, 0.05 * extent, 0.05 * extent);
        ticks = tick_range(low - pad, high + pad, nice_step(extent / 8));
    };

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

    /* data paths are clipped to their view's partition: with arbitrary
    maps, values regularly land outside the frame, and an unclipped
    stroke would slash across the whole svg (including the other
    views) on its way there. */
    const clip_suffix = Math.random().toString(36).slice(2);
    const clip_defs = $svgElement("defs");
    const clips = {};
    for (const [name, group] of [
        ["xyz", data_group_3d],
        ["xy", data_group_xy],
        ["xz", data_group_xz],
    ]) {
        const id = `data-clip-${name}-${clip_suffix}`;
        const rect = $svgElement("rect");
        const clip = $svgElement("clipPath");
        clip.setAttribute("id", id);
        clip.$with(rect);
        clip_defs.$with(clip);
        group.setAttribute("clip-path", `url(#${id})`);
        clips[name] = rect;
    }

    const get_layouts = () => {
        const width = svg.clientWidth;
        const height = svg.clientHeight;

        const partitions = partition_region(width, height);

        for (const [name, partition] of [
            ["xyz", partitions.big],
            ["xy", partitions.small_a],
            ["xz", partitions.small_b],
        ]) {
            const rect = clips[name];
            rect.setAttribute("x", partition.min.x);
            rect.setAttribute("y", partition.min.y);
            rect.setAttribute("width", partition.max.x - partition.min.x);
            rect.setAttribute("height", partition.max.y - partition.min.y);
        }

        let rot_y = mat.rotY((0.25-view_angle) * $tau);
        let rot_x = mat.rotX(view_height * $tau);

        const transform_3d = rot_x.matmul(rot_y);
        const transform_xy = mat.ident;
        const transform_xz = mat.rotX(-$tau / 4);

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

        const corners_3d = corners.map(c => transform_3d.apply(c));
        const corners_xy = corners.map(c => transform_xy.apply(c));
        const corners_xz = corners.map(c => transform_xz.apply(c));

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

        const x = (x_val, partition, extrema) => {
            const t = (x_val - extrema.x_min) / (extrema.x_max - extrema.x_min);
            return partition.min.x + (t * 0.8 + 0.1) * (partition.max.x - partition.min.x);
        };

        const y = (y_val, partition, extrema) => {
            const t = (y_val - extrema.y_min) / (extrema.y_max - extrema.y_min);
            return partition.max.y + (t * 0.8 + 0.1) * (partition.min.y - partition.max.y);
        };

        const place_3d = (point) => {
            const transformed = transform_3d.apply(point);
            return v2.of(
                x(transformed.x, partitions.big, extrema.xyz),
                y(transformed.y, partitions.big, extrema.xyz)
            );
        };

        const place_xy = (point) => {
            const transformed = transform_xy.apply(point);
            return v2.of(
                x(transformed.x, partitions.small_a, extrema.xy),
                y(transformed.y, partitions.small_a, extrema.xy)
            );
        };

        const place_xz = (point) => {
            const transformed = transform_xz.apply(point);
            return v2.of(
                x(transformed.x, partitions.small_b, extrema.xz),
                y(transformed.y, partitions.small_b, extrema.xz)
            );
        };

        return {
            xyz: {
                space: svg_space(place_3d),
                grid_group: grid_group_3d,
                data_group: data_group_3d
            },
            xy: {
                space: svg_space(place_xy),
                grid_group: grid_group_xy,
                data_group: data_group_xy
            },
            xz: {
                space: svg_space(place_xz),
                grid_group: grid_group_xz,
                data_group: data_group_xz
            }
        };
    };

    const draw_grid = async (layout) => {
        const { space, grid_group } = layout;

        const x_axis = space.line(
            v3.of(bounds_min.x - overhang.x, 0, 0),
            v3.of(bounds_max.x + overhang.x, 0, 0),
            "axis"
        );
        const x_label = space.math(
            v3.of(bounds_max.x + overhang.x * 2.5, 0, 0),
            (await $mod("math/math", "inline auto x_0")).dom[0]
        );
        const y_axis = space.line(
            v3.of(0, bounds_min.y - overhang.y, 0),
            v3.of(0, bounds_max.y + overhang.y, 0),
            "axis"
        );
        const y_label = space.math(
            v3.of(0, bounds_max.y + overhang.y * 2.5, 0),
            (await $mod("math/math", `inline auto x_${iteration}`)).dom[0]
        );
        const z_axis = space.line(
            v3.of(0, 0, bounds_min.z - overhang.z),
            v3.of(0, 0, bounds_max.z + overhang.z),
            "axis 3d"
        );
        const z_label = space.math(
            v3.of(0, 0, bounds_max.z + overhang.z * 2.5),
            (await $mod("math/math", `inline auto x_${iteration + 1}`)).dom[0]
        );
        const x_guides_xy = ticks.map(x_val =>
            space.line(
                v3.of(x_val, bounds_min.y - overhang.y / 2, 0),
                v3.of(x_val, bounds_max.y + overhang.y / 2, 0),
                "guide"
            )
        );
        const y_guides_xy = ticks.map(y_val =>
            space.line(
                v3.of(bounds_min.x - overhang.x / 2, y_val, 0),
                v3.of(bounds_max.x + overhang.x / 2, y_val, 0),
                "guide"
            )
        );
        const x_guides_xz = ticks.map(x_val =>
            space.line(
                v3.of(x_val, 0, bounds_min.z - overhang.z / 2),
                v3.of(x_val, 0, bounds_max.z + overhang.z / 2),
                "guide 3d"
            )
        );
        const z_guides_xz = ticks.map(z_val =>
            space.line(
                v3.of(bounds_min.x - overhang.x / 2, 0, z_val),
                v3.of(bounds_max.x + overhang.x / 2, 0, z_val),
                "guide 3d"
            )
        );

        grid_group.replaceChildren(
            x_axis, x_label,
            y_axis, y_label,
            z_axis, z_label,
            ...x_guides_xy, ...y_guides_xy,
            ...x_guides_xz, ...z_guides_xz
        );
    };

    const draw_path = (layout, zero_y=false, zero_z=false) => {
        const { space, data_group } = layout;

        const sliced = endpoints ? init_x_data : init_x_data.slice(1, -1);
        const offset = endpoints ? 0 : 1;

        const points = sliced.map((x_val, i) => {
            const y_val = zero_y ? 0 : y_data[i + offset];
            const z_val = zero_z ? 0 : z_data[i + offset];
            const finite = Number.isFinite(y_val) && Number.isFinite(z_val);
            return { point: v3.of(x_val, finite ? y_val : 0, finite ? z_val : 0), finite };
        });

        const path = space.path(
            (abs, rel) => {
                const commands = [];
                let pen_down = false;
                for (const { point, finite } of points) {
                    if (!finite) {
                        pen_down = false;
                        continue;
                    }
                    commands.push(pen_down ? abs.line(point) : abs.move(point));
                    pen_down = true;
                }
                return commands;
            },
            (zero_y || zero_z) ? "data dashed" : "data"
        );

        path.setAttribute("fill", "none");

        if (zero_y || zero_z) {
            data_group.append(path);
        } else {
            data_group.replaceChildren(path);
        }
    };

    let status_div = null;
    let status_generation = 0;

    const update_status = async () => {
        if (!status_div) return;
        const generation = ++status_generation;

        if (parse_error) {
            const error_div = $div("function-error");
            error_div.textContent = parse_error;
            status_div.replaceChildren(error_div);
            return;
        }

        try {
            let content = `auto\nf{(x)} = ${toMath(tree, { header: "" })}`;
            try {
                const df = simplify(differentiate(tree, "x"));
                content += `\nf'{(x)} = ${toMath(df, { header: "" })}`;
            } catch {
                // no derivative defined for some builtin in the tree
            }
            const rendered = await $mod("math/math", content);
            if (generation !== status_generation) return;
            status_div.replaceChildren(...rendered.dom);
        } catch (error) {
            if (generation !== status_generation) return;
            const error_div = $div("function-error");
            error_div.textContent = error.message;
            status_div.replaceChildren(error_div);
        }
    };

    const apply_source = (value, set, panelState) => {
        let new_tree;
        try {
            new_tree = parse(value, named_constants, []);
        } catch (error) {
            parse_error = error.message;
            update_status();
            return;
        }

        const variables = collectVariables(new_tree);
        const unknown = variables.filter(
            (name) => name !== "x" && !parameter_names.includes(name)
        );
        if (unknown.length > 0) {
            parse_error = `'${unknown[0]}' is not an available variable (x, r, a, b, c)`;
            update_status();
            return;
        }

        source = value;
        tree = new_tree;
        parse_error = null;

        for (const name of parameter_names) {
            const state = panelState?.[name];
            if (!state) continue;
            if (variables.includes(name)) {
                state.show?.();
            } else {
                state.hide?.();
            }
        }

        recompute_data();
        update_status();
        redraw_all();
    };

    let layouts;

    const redraw_all = () => {
        update_frame();
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

    const reset_iteration = () => {
        x_data = init_x_data;
        y_data = x_data;
        iteration = 0;
        recompute_data();
    };

    redraw_all();

    svg.$with(
        clip_defs,
        grid_group_3d,
        data_group_3d,
        grid_group_xy,
        data_group_xy,
        grid_group_xz,
        data_group_xz
    );

    const parameter_control = (name, value, min, max, hidden) => ({
        type: "number",
        label: name,
        value,
        min,
        max,
        step: 0.01,
        hidden,
        onUpdate: (value) => {
            parameters[name] = value;
            recompute_data();
            redraw_all();
        }
    });

    const controls = [
        {
            type: "string",
            label: "f(x)",
            value: source,
            placeholder: "r * x * (1 - x)",
            onUpdate: apply_source,
            register: (bundle) => {
                const hint = $div("function-hint");
                hint.textContent =
                    "a map over x, with parameters r, a, b, c " +
                    "and constants pi, e, tau, phi";
                status_div = $div("function-status");
                bundle.dom[0].$with(hint, status_div);
                update_status();
            }
        },
        parameter_control("r", parameters.r, 0, 4, false),
        parameter_control("a", parameters.a, -4, 4, true),
        parameter_control("b", parameters.b, -4, 4, true),
        parameter_control("c", parameters.c, -4, 4, true),
        {
            type: "number",
            label: "view angle",
            value: view_angle,
            min: 0,
            max: 1,
            step: 0.001,
            onUpdate: (value) => { view_angle = value; redraw_3d(); }
        },
        {
            type: "button",
            label: "step",
            action: (state) => {
                x_data = y_data;
                y_data = z_data;
                iteration = iteration + 1;
                recompute_data();
                redraw_all();
            }
        },
        {
            type: "button",
            label: "reset",
            action: (state) => {
                reset_iteration();
                redraw_all();
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
                init_x_data = linspace(x_min, x_max, resolution);
                reset_iteration();
                redraw_all();
            }
        },
        {
            type: "number",
            label: "x min",
            value: x_min,
            min: -8,
            max: 8,
            step: 0.01,
            onUpdate: (value) => {
                if (!Number.isFinite(value)) return;
                x_min = value;
                init_x_data = linspace(x_min, x_max, resolution);
                reset_iteration();
                redraw_all();
            }
        },
        {
            type: "number",
            label: "x max",
            value: x_max,
            min: -8,
            max: 8,
            step: 0.01,
            onUpdate: (value) => {
                if (!Number.isFinite(value)) return;
                x_max = value;
                init_x_data = linspace(x_min, x_max, resolution);
                reset_iteration();
                redraw_all();
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
        }
    ];

    new ResizeObserver(redraw_all).observe(svg);

    return { controls };
}
