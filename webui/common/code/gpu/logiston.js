$css(`
    .logiston-webgpu.topmost {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        flex-direction: row;
        background: var(--main-background);
        color: var(--main-solid);
        font-size: var(--font-base);
    }

    .logiston-webgpu .render-stack {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
    }

    .logiston-webgpu .control-container {
        position: relative;
        width: fit-content;
        max-width: 24em;
        height: 100%;
        background: var(--main-background);
        flex-shrink: 0;
    }

    .logiston-webgpu .overlay {
        user-select: none;
        pointer-events: none;
        position: absolute;
        z-index: 1;
        inset: 0;
        color: white;
        mix-blend-mode: difference;
        line-height: 1.4em;
    }

    .logiston-webgpu .readout {
        position: absolute;
        top: 0.35em;
        left: 3.2em;
        right: 0.5em;
        overflow: visible;
    }

    .logiston-webgpu .readout > span {
        display: block;
        width: fit-content;
        max-width: 100%;
        overflow-wrap: anywhere;
    }

    .logiston-webgpu .readout .details {
        font-size: 0.8em;
    }

    .logiston-webgpu .toggle-overlay {
        position: absolute;
        z-index: 2;
        top: 0.1em;
        left: 0.1em;
        width: 2em;
        border: none;
        padding: 0.1em;
        background: transparent;
        color: white;
        mix-blend-mode: difference;
        font-size: 1.5em;
        line-height: 1em;
        cursor: pointer;
    }

    @media (max-width: 768px) {
        .logiston-webgpu.topmost {
            flex-direction: column-reverse;
        }

        .logiston-webgpu .control-container {
            width: 100%;
            max-width: none;
            height: fit-content;
            max-height: 45%;
            flex-shrink: 0;
        }
    }
`);

import "/code/gpu/webgpu.js";
import { splitDouble } from "/code/math/precision.js";
import { Color, NonlinearSRGB } from "/code/math/color.js";

const PRODUCTS = [
    "Q-row-in",
    "D-swap",
    "complex/logistic tangent",
    "post-L S-split",
    "D-swap vector heat",
    "B(D) dot heat",
    "S-cplx reducer-in",
    "C(D,X) mixed wiring",
    "E-L-cross",
];

const PROTOCOLS = [
    {
        name: "unforced squaring",
        recurrence: "z0=(x,y); z[n+1]=F(z[n],z[n])",
    },
    {
        name: "additive parameter plane",
        recurrence: "c=(x,y); z0=0; z[n+1]=F(z[n],z[n])+c",
    },
    {
        name: "left operator",
        recurrence: "p=(x,y); z0=(initial_x,initial_y); z[n+1]=F(p,z[n])",
    },
    {
        name: "right operator",
        recurrence: "p=(x,y); z0=(initial_x,initial_y); z[n+1]=F(z[n],p)",
    },
];

const DEFAULT_DYNAMICS = {
    product: 0,
    protocol: 0,
    heat: 4,
    row_balance: 1,
    argument_scale: 1,
    argument_shift: 0,
    tangent_t: 0.055,
    vector_gain_x: 2.5,
    vector_gain_y: 2.5,
    dot_gain: 2,
    escape_radius: 10000,
    tail_fraction: 0.5,
    iterations: 320,
    initial_x: 0.17,
    initial_y: 0.23,
};

const PRESETS = {
    spindle: {
        label: "Pierced spindle",
        product: 0,
        protocol: 0,
        center: [0, 0],
        halfWindow: 2.8,
        params: { heat: 4 },
        spec: "(ell(a*(c+d)),ell(b*(c+d)))",
    },
    courts: {
        label: "Dendritic courts",
        product: 1,
        protocol: 0,
        center: [0, 0],
        halfWindow: 2.8,
        params: { heat: 4, argument_shift: -0.5 },
        spec: "D-swap[1,-0.5]",
    },
    astrolabe: {
        label: "Tangent astrolabe",
        product: 2,
        protocol: 0,
        center: [0, 0],
        halfWindow: 2.8,
        params: { tangent_t: 0.055 },
        spec: "complex/logistic tangent, t=0.055",
    },
    relic: {
        label: "Folded relic",
        product: 3,
        protocol: 0,
        center: [0, 0],
        halfWindow: 1.5,
        params: { heat: 3 },
        spec: "(ell(ell(a*c)+ell(b*d)),ell(ell(a*d)+ell(b*c)))",
    },
    lace: {
        label: "Vector lace",
        product: 4,
        protocol: 1,
        center: [0, 0],
        halfWindow: 2.8,
        params: { vector_gain_x: 2.5, vector_gain_y: 2.5 },
        spec: "C(D,D){rho=(2.5*(a+c),2.5*(b+d))}",
    },
    current: {
        label: "Multiplication current",
        product: 5,
        protocol: 2,
        center: [1.75, 1.75],
        halfWindow: 1.15,
        params: { dot_gain: 2 },
        spec: "B(D){rho=2*(a*c+b*d)}",
    },
    lake: {
        label: "Endogenous lake",
        product: 8,
        protocol: 1,
        center: [0, 0],
        halfWindow: 2.8,
        params: {},
        spec: "E-L-cross",
    },
};

const PALETTE = {
    escape_0: "#080d14",
    escape_1: "#182c3c",
    escape_2: "#256567",
    escape_3: "#b87943",
    escape_4: "#f7e5c0",
    interior_0: "#070d12",
    interior_1: "#142d32",
    interior_2: "#4d6757",
    interior_3: "#d29d58",
};

function color(hex) {
    return new Color(NonlinearSRGB.fromHex(hex));
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = $element("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function main() {
    if (!$gpu.available) {
        const warning = $element("span");
        warning.textContent = "WebGPU is not available; the logiston explorer cannot start.";
        return { dom: [warning], replace: true };
    }

    const [compShader, blitShader] = await Promise.all([
        $gpu.loadShader("logiston", { pixel_mapping: "pixel_to_logiston" }),
        $gpu.loadShader("logiston_blit"),
    ]);

    if (!compShader || !blitShader) {
        const warning = $element("span");
        warning.textContent = "The logiston shaders could not be compiled.";
        return { dom: [warning], replace: true };
    }

    const uniforms = compShader.bufferDefinitions["0,0"];
    const params = uniforms.vars;
    const blitUniforms = blitShader.bufferDefinitions["0,0"];
    const blitParams = blitUniforms.vars;

    for (const [name, hex] of Object.entries(PALETTE)) {
        blitParams[name] = color(hex);
    }

    const topmost = $div("logiston-webgpu topmost");
    topmost.dataset.font = "mono";

    const renderStack = $div("render-stack");
    renderStack.dataset.name = "logiston renderer";
    renderStack.$preventCollapse = true;

    const canvasModule = await $apply("gpu/canvas", renderStack);
    const canvas = canvasModule.canvas;
    const context = canvasModule.context;
    canvas.setAttribute("aria-label", "Interactive WebGPU visualization of logiston dynamics. Drag to pan and use the wheel to zoom.");
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-keyshortcuts", "f r");

    const overlay = $div("overlay");
    const readout = $div("readout");
    const constructionReadout = $element("span");
    const detailReadout = $element("span");
    detailReadout.className = "details";
    const coords = $element("span");
    coords.className = "details";
    readout.$with(constructionReadout, detailReadout, coords);
    overlay.$with(readout);

    const toggleOverlay = $element("button");
    toggleOverlay.type = "button";
    toggleOverlay.className = "toggle-overlay";
    toggleOverlay.textContent = "▦";
    toggleOverlay.title = "Toggle portrait information";
    toggleOverlay.setAttribute("aria-label", "Toggle portrait information");
    toggleOverlay.setAttribute("aria-pressed", "true");
    toggleOverlay.addEventListener("click", () => {
        const show = overlay.style.display === "none";
        overlay.style.display = show ? "block" : "none";
        toggleOverlay.setAttribute("aria-pressed", String(show));
    });

    renderStack.$with(overlay, toggleOverlay);

    let width = 0;
    let height = 0;
    let outputTexture = null;
    let computeBindGroup = null;
    let renderBindGroup = null;
    let canRender = false;
    let destroyed = false;
    let exporting = false;
    let dirty = false;
    let pumpPromise = null;
    let lastPreset = "spindle";

    function setCenter(x, y) {
        const centerX = splitDouble(x);
        const centerY = splitDouble(y);
        params.center_high_x = centerX[0];
        params.center_low_x = centerX[1];
        params.center_high_y = centerY[0];
        params.center_low_y = centerY[1];
    }

    function center() {
        return [
            params.center_high_x + params.center_low_x,
            params.center_high_y + params.center_low_y,
        ];
    }

    function updateReadout() {
        const product = PRODUCTS[Number(params.product)] ?? "custom product";
        const protocol = PROTOCOLS[Number(params.protocol)]?.name ?? "custom protocol";
        constructionReadout.textContent = `${product} · ${protocol}`;
        detailReadout.textContent = `${params.iterations} iterations · |z| > ${params.escape_radius} · WebGPU f32`;
    }

    function applyPreset(key, shouldRender = true) {
        const preset = PRESETS[key];
        if (!preset) return;
        lastPreset = key;

        Object.assign(params, DEFAULT_DYNAMICS);
        Object.assign(params, preset.params);
        params.product = preset.product;
        params.protocol = preset.protocol;
        params.rotation = 0;
        params.zoom = 1 / (2 * preset.halfWindow);
        setCenter(...preset.center);

        updateReadout();
        if (shouldRender) requestRender();
    }

    function resetView() {
        const preset = PRESETS[lastPreset];
        params.zoom = 1 / (2 * preset.halfWindow);
        params.rotation = 0;
        setCenter(...preset.center);
        requestRender();
    }

    applyPreset("spindle", false);

    const computePipeline = $gpu.device.createComputePipeline({
        layout: "auto",
        compute: { module: compShader.module, entryPoint: "main" },
    });

    const renderPipeline = $gpu.device.createRenderPipeline({
        layout: "auto",
        vertex: { module: blitShader.module, entryPoint: "vert" },
        fragment: {
            module: blitShader.module,
            entryPoint: "frag",
            targets: [{ format: $gpu.canvasFormat }],
        },
        primitive: { topology: "triangle-list" },
    });

    const presetControl = {
        type: "select",
        label: "preset",
        name: "preset",
        value: "",
        options: [
            { label: "choose a portrait", value: "" },
            ...Object.entries(PRESETS).map(([value, preset]) => ({
                label: preset.label,
                value,
            })),
        ],
        onUpdate: value => applyPreset(value),
    };

    const controls = await $mod(
        "control/panel",
        "Logiston parameters",
        [
            presetControl,
            { type: "button", label: "reset view", action: resetView },
        ]
            .concat(uniforms.getControlSettings(requestRender))
            .concat(blitUniforms.getControlSettings(requestRender))
    );

    const controlContainer = $div("control-container").$with(...controls.dom);

    function setControlDisplayState(state) {
        if (controlContainer.style.display === state) return;
        const verb = state === "none" ? "hide" : "show";
        return [`${verb} controls`, () => {
            controlContainer.style.display = state;
        }];
    }

    function createBindGroups(texture) {
        const view = texture.createView();
        return {
            compute: $gpu.device.createBindGroup({
                layout: computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniforms.gpuBuffer } },
                    { binding: 1, resource: view },
                ],
            }),
            render: $gpu.device.createBindGroup({
                layout: renderPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: blitUniforms.gpuBuffer } },
                    { binding: 1, resource: view },
                ],
            }),
        };
    }

    async function renderFrame(targetContext, dims, compute, render) {
        blitParams.max_iterations = Number(params.iterations);
        uniforms.updateBuffers();
        blitUniforms.updateBuffers();

        const encoder = $gpu.device.createCommandEncoder();
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, compute);
        computePass.dispatchWorkgroups(
            Math.ceil(dims.x / 16),
            Math.ceil(dims.y / 16),
            1
        );
        computePass.end();

        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: targetContext.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            }],
        });
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, render);
        renderPass.draw(6);
        renderPass.end();

        $gpu.device.queue.submit([encoder.finish()]);
        await $gpu.device.queue.onSubmittedWorkDone();
    }

    function requestRender() {
        updateReadout();
        dirty = true;
        if (!canRender || exporting || destroyed) return Promise.resolve();
        if (!pumpPromise) {
            pumpPromise = (async () => {
                try {
                    while (dirty && canRender && !exporting && !destroyed) {
                        dirty = false;
                        await renderFrame(
                            context,
                            { x: width, y: height },
                            computeBindGroup,
                            renderBindGroup
                        );
                    }
                } catch (error) {
                    dirty = false;
                    console.error("Logiston render failed:", error);
                } finally {
                    pumpPromise = null;
                }
            })();
        }
        return pumpPromise;
    }

    function resize() {
        if (destroyed) return;
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = canvas.clientWidth;
        const cssHeight = canvas.clientHeight;
        if (cssWidth <= 0 || cssHeight <= 0) {
            canRender = false;
            return;
        }

        width = Math.max(1, Math.round(cssWidth * dpr));
        height = Math.max(1, Math.round(cssHeight * dpr));
        canvas.width = width;
        canvas.height = height;
        params.width = width;
        params.height = height;

        outputTexture?.destroy();
        outputTexture = $gpu.device.createTexture({
            size: [width, height],
            format: "rgba32float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        const groups = createBindGroups(outputTexture);
        computeBindGroup = groups.compute;
        renderBindGroup = groups.render;
        canRender = true;
        requestRender();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    async function saveFrame() {
        await requestRender();
        if (destroyed) return;
        canvas.toBlob(blob => {
            if (blob) downloadBlob(blob, `logiston_${Date.now()}.png`);
        }, "image/png");
    }

    async function offscreenRender(scalingFactor) {
        if (!canRender || exporting || destroyed) return;
        exporting = true;
        dirty = true;
        if (pumpPromise) await pumpPromise;

        const originalWidth = params.width;
        const originalHeight = params.height;
        let texture = null;
        try {
            const dims = {
                x: Math.round(width * scalingFactor),
                y: Math.round(height * scalingFactor),
            };
            const limit = $gpu.device.limits.maxTextureDimension2D;
            if (dims.x > limit || dims.y > limit) {
                throw new Error(`Export dimensions ${dims.x}×${dims.y} exceed the WebGPU limit ${limit}.`);
            }

            params.width = dims.x;
            params.height = dims.y;
            texture = $gpu.device.createTexture({
                size: [dims.x, dims.y],
                format: "rgba32float",
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
            });
            const groups = createBindGroups(texture);
            const offscreen = $gpu.getOffscreenContext(dims);
            await renderFrame(offscreen.context, dims, groups.compute, groups.render);
            const blob = await offscreen.canvas.convertToBlob({ type: "image/png" });
            if (!destroyed) {
                downloadBlob(blob, `logiston_${scalingFactor ** 2}x_${Date.now()}.png`);
            }
        } catch (error) {
            console.error("Logiston export failed:", error);
        } finally {
            params.width = originalWidth;
            params.height = originalHeight;
            texture?.destroy();
            exporting = false;
            requestRender();
        }
    }

    function saveRecipe() {
        const dynamicParameters = {};
        for (const name of Object.keys(DEFAULT_DYNAMICS)) {
            dynamicParameters[name] = Number(params[name]);
        }
        const [centerX, centerY] = center();
        const recipe = {
            type: "snakepyt/logiston-portrait",
            version: 1,
            created: new Date().toISOString(),
            construction: PRODUCTS[Number(params.product)],
            parameters: dynamicParameters,
            protocol: {
                name: PROTOCOLS[Number(params.protocol)].name,
                recurrence: PROTOCOLS[Number(params.protocol)].recurrence,
            },
            view: {
                center: [centerX, centerY],
                full_height: 1 / params.zoom,
                rotation_turns: params.rotation,
                canvas: [width, height],
            },
            display: {
                mode: Number(blitParams.mode),
                escape_span: blitParams.escape_span,
                activity_gain: blitParams.activity_gain,
                magnitude_weight: blitParams.magnitude_weight,
                seam_strength: blitParams.seam_strength,
            },
            source_preset: lastPreset,
            precision: "WebGPU f32",
            note: "Unescaped means not escaped by the iteration limit on this finite grid, not a proof of boundedness.",
        };
        const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" });
        downloadBlob(blob, `logiston_recipe_${Date.now()}.json`);
    }

    function toggleOverlayItem() {
        const hidden = overlay.style.display === "none";
        return [`${hidden ? "show" : "hide"} portrait information`, () => toggleOverlay.click()];
    }

    function exitRenderer() {
        destroyed = true;
        resizeObserver.disconnect();
        outputTexture?.destroy();
        uniforms.gpuBuffer.destroy();
        blitUniforms.gpuBuffer.destroy();
        if (document.fullscreenElement) document.exitFullscreen();
        const parent = topmost.parentNode;
        topmost.remove();
        if (parent && !parent.hasChildNodes()) $apply("layout/nothing", parent);
    }

    renderStack.addEventListener("keydown", event => {
        if (event.key === "f") {
            event.preventDefault();
            if (document.fullscreenElement) document.exitFullscreen();
            else topmost.requestFullscreen();
        } else if (event.key === "r") {
            event.preventDefault();
            resetView();
        }
    });

    canvasModule.addNavigation("2d", params, requestRender, event => {
        coords.textContent = `p = (${event.cMouse.re.toFixed(7)}, ${event.cMouse.im.toFixed(7)})`;
    });
    canvas.addEventListener("pointerleave", () => { coords.textContent = ""; });

    topmost.$contextMenu = {
        items: [
            () => setControlDisplayState("block"),
            ["save frame", saveFrame],
            ["save 4x", () => offscreenRender(2)],
            ["save 9x", () => offscreenRender(3)],
            ["save 16x", () => offscreenRender(4)],
            ["save portrait recipe", saveRecipe],
            ["reset view", resetView],
            ["reset portrait", () => applyPreset(lastPreset)],
            toggleOverlayItem,
            () => setControlDisplayState("none"),
            ["exit", exitRenderer],
        ],
    };

    topmost.$with(controlContainer, renderStack);
    return { dom: [topmost], replace: true };
}
