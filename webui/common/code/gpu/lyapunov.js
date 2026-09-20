
$css(`
    .lyapunov-webgpu.topmost {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        flex-direction: row;
    }

    .lyapunov-webgpu .overlay {
        user-select: none;
        position: absolute;
        z-index: 1;
        top: 0;
        left: 0;
        pointer-events: none;
    }

    .lyapunov-webgpu .color-detector {
        display: none;
        background-color: var(--main-background);
    }

    .lyapunov-webgpu .control-container {
        position: relative;
        width: fit-content;
        height: 100%;
        background-color: var(--main-background);
        flex-shrink: 0;
    }

    @media (max-width: 768px) {
        .lyapunov-webgpu.topmost {
            flex-direction: column-reverse;
        }

        .lyapunov-webgpu.topmost > * {
            flex: 1 1 0;
        }

        .lyapunov-webgpu .control-container {
            flex-shrink: revert;
            width: 100%;
            height: fit-content;
        }
    }
`);

import { greek } from "/code/math/math.js";

import "/code/math/constants.js";
import { Vec2 as v2 } from "/code/math/vector.js";
import { cartesian as c } from "/code/math/complex.js";
import { splitDouble } from "/code/math/precision.js";
import { Color } from "/code/math/color.js";

export async function main() {
    let canRender = false;

    const topmost = $div("lyapunov-webgpu topmost");

    const renderStack = $div("full");
    //let topmost = renderStack;
    renderStack.dataset.name = "renderer";
    renderStack.style.position = "relative";

    const canvasModule = await $apply("gpu/canvas", renderStack);

    const canvas = canvasModule.canvas;
    const context = canvasModule.context;

    canvas.setAttribute("aria-label",
        "Interactive visualization of a Lyapunov fractal.");
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-keyshortcuts", "f");

    const colorDetector = $div("color-detector");
    canvas.$with(colorDetector);

    const compShader = await $gpu.loadShader("lyapunov", {
        "pixel_mapping" : "pixel_to_complex"
    });
    const blitShader = await $gpu.loadShader("blit");

    if (!compShader || !blitShader) return;

    const uniforms = compShader.bufferDefinitions["0,0"];
    const params = uniforms.vars;

    const blitUniforms = blitShader.bufferDefinitions["0,0"];
    const blitParams = blitUniforms.vars;

    params.zoom = 0.25;


    var center_x = splitDouble(2.001);
    var center_y = splitDouble(-2.001);


    params.center_low_x = center_x[1];
    params.center_low_y = center_y[1];
    params.center_high_x = center_x[0];
    params.center_high_y = center_y[0];

    function setCenter(x, y) {
        var center_x = splitDouble(x);
        var center_y = splitDouble(-y);

        params.center_low_x = center_x[1];
        params.center_low_y = center_y[1];
        params.center_high_x = center_x[0];
        params.center_high_y = center_y[0];
    }

/*
255 81 6
255 213 0
neg scale -5.9
4000 skip 600
x_0 0.515
sequence BA

        */

    function updateSequence(value, set, panelState, shouldRender=true) {
        let display_value = value
            .toUpperCase()
            .replace(/[^AB^0-9]/g, "");

        // anywhere there's a ^ not followed by a number treat it as ^1. otherwise, treat X^n as "n copies of X". permit multi-digit numbers.
        // this should only affect the *logical* value.
        let logical_value = display_value
            .replace(/([AB])\^(\d*)/g, (_, ch, n) =>
                ch.repeat(n ? Math.min(+n, 32) : 1))
            .replace(/[\^0-9]/g, "");

        logical_value = logical_value.slice(0, 32);

        set(display_value);

        let seq_mask = 0;
        for (const c of logical_value) {
            seq_mask = seq_mask * 2 + (c === "B" ? 1 : 0);
        }

        const seq_len = Math.max(logical_value.length, 1);

        panelState["seq_len"].set(seq_len);
        panelState["seq_mask"].set(seq_mask);

        uniforms.vars.seq_len = seq_len;
        uniforms.vars.seq_mask = seq_mask;

        if (shouldRender) render();
    }

    const controls = await $mod("control/panel",
        "Parameters",
        [
            { type: "select",
                label: "preset",
                value: "",
                options: [
                    {label: "", value: ""},
                    {label: "Markus 1989 Fig. 1(a)", value: "1989_1_a"},
                    {label: "Markus 1989 Fig. 1(b)", value: "1989_1_b"},
                    {label: "Markus 1989 Fig. 2", value: "1989_2"},
                    {label: "Markus 1989 Fig. 3", value: "1989_3"},
                    {label: "Markus 1989 Fig. 4", value: "1989_4"},
                    {label: "Markus 1989 Fig. 5", value: "1989_5"},
                    {label: "Markus 1989 Fig. 6", value: "1989_6"},
                    {label: "Markus 1989 Fig. 7", value: "1989_7"},
                    {label: "Markus 1990 Fig. 1(a)", value: "1990_1_a"},
                    {label: "Markus 1990 Fig. 1(b)", value: "1990_1_b"},
                    {label: "Markus 1990 Fig. 2", value: "1990_2"},
                    {label: "Markus 1990 Fig. 3", value: "1990_3"},
                    {label: "Markus 1990 Fig. 4", value: "1990_4"},
                    {label: "Markus 1990 Fig. 5", value: "1990_5"},
                    {label: "Markus 1990 Fig. 6", value: "1990_6"},
                    {label: "Markus 1990 Fig. 7(a)", value: "1990_7_a"},
                    {label: "Markus 1990 Fig. 7(b)", value: "1990_7_b"},
                    {label: "Markus 1990 Fig. 10", value: "1990_10"},
                    {label: "Markus 1990 Fig. 11", value: "1990_11"},
                    {label: "Markus 1990 Fig. 12", value: "1990_12"},
                    {label: "Markus 1990 Fig. 13", value: "1990_13"},
                    {label: "Markus 1990 Fig. 14(a)", value: "1990_14_a"},
                    {label: "Markus 1990 Fig. 14(b)", value: "1990_14_b"},
                    {label: "Markus 1990 Fig. 17", value: "1990_17"},
                    {label: "Markus 1990 Fig. 18", value: "1990_18"},
                    {label: "Markus 1990 Fig. 19", value: "1990_19"},
                    {label: "Markus 1990 Fig. 20", value: "1990_20"},
                    {label: "Markus 1990 Fig. 21", value: "1990_21"},
                    {label: "Markus 1990 Fig. 22(a)", value: "1990_22_a"},
                    {label: "Markus 1990 Fig. 22(b)", value: "1990_22_b"},
                    {label: "Markus 1990 Fig. 23", value: "1990_23"},
                    {label: "Markus 1990 Fig. 24", value: "1990_24"},
                ],
                onUpdate: (value, set, panelState) => {
                    if (value === "") return;

                    params.iterations = 1000;
                    params.skip = 200;
                    params.seq_offset = 0;
                    params.offset_mode = 0;
                    params.rotation = 0;

                    if (value === "1989_1_a") {
                        setCenter(3.8425, 3.8425);
                        params.zoom = 18;
                        params.x_0 = 0.515;
                        updateSequence("BA", panelState.sequence.set, panelState, false);
                        blitParams.negative_scale = -6;
                    }
                    else if (value === "1989_1_b") {
                        setCenter(3.8425, 3.8425);
                        params.zoom = 40;
                        params.x_0 = 0.515;
                        updateSequence("BA", panelState.sequence.set, panelState, false);
                        blitParams.negative_scale = -6;
                    }
                    else if (value === "1989_2") {
                        setCenter(3.2515, 3.605);
                        params.zoom = 1.25;
                        updateSequence("AABABAB", panelState.sequence.set, panelState, false);
                        blitParams.negative_scale = -2.35;
                    }
                    else if (value === "1989_3") {
                        setCenter(3.53, 3.605);
                        params.zoom = 9;
                        updateSequence("AABAB", panelState.sequence.set, panelState, false);
                        params.seq_offset = 3;
                        blitParams.negative_scale = -20;
                        blitParams.positive_scale = 0;
                    }
                    else if (value === "1989_4") {
                        setCenter(3.085, 3.73);
                        params.zoom = 1.5;
                        updateSequence("B^6A^6", panelState.sequence.set, panelState, false);
                        //params.seq_offset = 3;
                        blitParams.negative_scale = -12;
                        blitParams.positive_scale = 0;
                    }
                    else if (value === "1989_5") {
                        setCenter(1.1687, 3.4483);
                        params.zoom = 3.9;
                        updateSequence("B^21A", panelState.sequence.set, panelState, false);
                        params.seq_offset = 1;
                        blitParams.negative_scale = -3;
                        blitParams.positive_scale = 0;
                    }
                    else if (value === "1989_6") {
                        setCenter(3.774, 3.423);
                        params.zoom = 2.7397;
                        updateSequence("B^12A", panelState.sequence.set, panelState, false);
                        params.seq_offset = 1;
                        blitParams.negative_scale = -3;
                        blitParams.positive_scale = 0;

                    }
                    else if (value === "1989_7") {
                        setCenter(3.625, 3.055);
                        params.zoom = 2.1;
                        params.rotation = 0.16944;
                        updateSequence("A^5B^5", panelState.sequence.set, panelState, false);
                        params.seq_offset = 1;
                        blitParams.negative_scale = -3;
                        blitParams.positive_scale = 0;

                    }
                    else if (value === "1990_1_a") {
                        params.x_0 = 0.364;
                        setCenter(3.625, 3.055);
                        params.zoom = 2.1;
                        params.rotation = 0.16944;
                        updateSequence("A^5B^5", panelState.sequence.set, panelState, false);
                        params.seq_offset = 1;
                        blitParams.negative_scale = -3;
                        blitParams.positive_scale = 0;

                    }
                    render();
                }
            },
            { type: "button", label: "params", action: () => {
                console.log(params, blitParams)
            } },
            { type: "string", label: "sequence", value: "AB", onUpdate: updateSequence }
        ]
        .concat(uniforms.getControlSettings(render))
        .concat(blitUniforms.getControlSettings(render))
    );

    controls.controls["seq_len"].hide();
    controls.controls["seq_mask"].hide();

    const computePipeline = $gpu.device.createComputePipeline({
        layout: "auto",
        compute: {
            module: compShader.module,
            entryPoint: "main"
        }
    });

    const renderPipeline = $gpu.device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: blitShader.module,
            entryPoint: "vert"
        },
        fragment: {
            module: blitShader.module,
            entryPoint: "frag",
            targets: [ { format: $gpu.canvasFormat } ]
        },
        primitive: {
            topology: "triangle-list"
        }
    });

    const overlay = $svgElement("svg");
    overlay.classList = "full overlay";

    overlay.setAttribute("aria-label",
        "Overlay visualizing the trajectory \
         starting from the point under the cursor.")

    renderStack.appendChild(overlay);

    const controlContainer = $div("control-container").$with(...controls.dom);
    controlContainer.style.display = "block";

    function setControlDisplayState(state) {
        const verb = state === "none" ? "hide" : "show";

        if (controlContainer.style.display === state) return;

        return [`${verb} controls`, async () => {
            controlContainer.style.display = state;
        }];
    }

    const observers = {};

    function parseRgb(rgbString) {
        const m = rgbString.match(/rgba?\(([^)]+)\)/);
        if (!m) return { r: 0, g: 0, b: 0, a: 1 };
        const [r, g, b, a = 1] = m[1].split(',').map(v => parseFloat(v) / 255);
        return { r, g, b, a };
    }

    let backgroundColor = { r: 0, g: 0, b: 0, a: 0 };

    const rgbaEq = (a, b) =>
        a.r === b.r &&
        a.g === b.g &&
        a.b === b.b &&
        a.a === b.a;

    const hue_neg = Math.floor(Math.random() * 360);
    const hue_pos = (hue_neg + 60) % 360;

    blitParams.neg_color = Color.OkLch({ lightness: 0.7, chroma: 0.2, hue: hue_neg });
    blitParams.pos_color = Color.OkLch({ lightness: 0.7, chroma: 0.2, hue: hue_pos });

    // TODO find a way to make colors themselves handle this
    observers.theme = new MutationObserver(() => {
        blitParams.nan_color = Color.CssColor({ cssString: "var(--main-background)", element: topmost })

        if (canRender) render();
    });
    observers.theme.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-theme"]
    });

    function exitRenderer() {
        observers.resize?.disconnect();
        observers.theme?.disconnect();
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
        const target = topmost.parentNode;
        target.replaceChildren();
        $apply("layout/nothing", target);
    }

    function saveFrame() {
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = $element("a");
            a.href = url;
            a.download = `lyap_${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    renderStack.$preventCollapse = true;

    renderStack.addEventListener("keydown", (e) => {
        if (e.key === "f") {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
            else {
                topmost.requestFullscreen();
            }
        }
    });


    const dpr = window.devicePixelRatio || 1;
    let width = canvas.clientWidth * dpr;
    let height = canvas.clientHeight * dpr;

    let outputTexture;
    let computeBindGroup;
    let renderBindGroup;

    const sampler = $gpu.device.createSampler({ magFilter: "nearest", minFilter: "nearest" });


    async function offscreenRender(scalingFactor) {
        const dims = v2.of(width * scalingFactor, height * scalingFactor);

        const texture = $gpu.device.createTexture({
            size: [dims.x, dims.y],
            format: "rg32float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        const orig_height = params.height;
        const orig_width = params.width;

        params.height *= scalingFactor;
        params.width *= scalingFactor;

        computeBindGroup = $gpu.device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniforms.gpuBuffer } },
                { binding: 1, resource: texture.createView() }
            ]
        });

        renderBindGroup = $gpu.device.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: blitUniforms.gpuBuffer } },
                //{ binding: 0, resource: sampler },
                { binding: 1, resource: texture.createView() }
            ]
        });

        const offscreen = $gpu.getOffscreenContext(dims);

        render(offscreen.context, dims);

        params.height = orig_height;
        params.width = orig_width;

        const blob = await offscreen.canvas.convertToBlob({ type: "image/png" });

        const url = URL.createObjectURL(blob);
        const a = $element("a");
        a.href = url;
        a.download = `lyapunov_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        texture.destroy();

        computeBindGroup = $gpu.device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniforms.gpuBuffer } },
                { binding: 1, resource: outputTexture.createView() }
            ]
        });

        renderBindGroup = $gpu.device.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: blitUniforms.gpuBuffer } },
                //{ binding: 0, resource: sampler },
                { binding: 1, resource: outputTexture.createView() }
            ]
        });

    }

    let nan_color_initialized = false;

    function resize() {
        width = canvas.clientWidth * dpr;
        height = canvas.clientHeight * dpr;

        if (width * height === 0) return;

        overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
        overlay.setAttribute("width", width);
        overlay.setAttribute("height", height);

        if (!nan_color_initialized) {
            blitParams.nan_color = Color.CssColor({ cssString: "var(--main-background)", element: topmost });
            nan_color_initialized = true;
        }

        canvas.width = width;
        canvas.height = height;

        const uniforms = compShader.bufferDefinitions["0,0"];

        params.width = width;
        params.height = height;

        if (width * height <= 0) {
            canRender = false;
            return;
        }

        canRender = true;

        outputTexture?.destroy();

        outputTexture = $gpu.device.createTexture({
            size: [width, height],
            format: "rg32float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        computeBindGroup = $gpu.device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniforms.gpuBuffer } },
                { binding: 1, resource: outputTexture.createView() }
            ]
        });

        renderBindGroup = $gpu.device.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: blitUniforms.gpuBuffer } },
                //{ binding: 0, resource: sampler },
                { binding: 1, resource: outputTexture.createView() }
            ]
        });

        render();
    }


    observers.resize = new ResizeObserver(resize);
    observers.resize.observe(canvas);


    function render(targetContext = context, dims = null) {

        if (!canRender) {
            console.warn("Cannot render; aborting render.");
            console.trace();
            return;
        }

        dims = dims || v2.of(width, height);

        const uniforms = compShader.bufferDefinitions["0,0"];
        uniforms.updateBuffers();
        const blitUniforms = blitShader.bufferDefinitions["0,0"];
        blitUniforms.updateBuffers();

        const commandEncoder = $gpu.device.createCommandEncoder();

        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(dims.x / 16),
            Math.ceil(dims.y / 16),
            1
        );
        computePass.end();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: targetContext.getCurrentTexture().createView(),
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, renderBindGroup);
        renderPass.draw(6); // 1 quad -> 2 tris
        renderPass.end();

        $gpu.device.queue.submit([commandEncoder.finish()]);
    }

    topmost.$contextMenu = {
        items: [
            () => setControlDisplayState("block"),
            ["save frame", saveFrame],
            ["save 4x", () => offscreenRender(2)],
            ["save 9x", () => offscreenRender(3)],
            ["save 16x", () => offscreenRender(4)],
            () => setControlDisplayState("none"),
            ["exit", exitRenderer]
        ]
    };

    canvasModule.addNavigation("2d", params, render);

    topmost.$with(controlContainer, renderStack);

    return { dom: [topmost], replace: true };
}


