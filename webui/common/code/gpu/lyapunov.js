
$css(`
    .overlay {
        user-select: none;
        position: absolute;
        z-index: 1;
        top: 0;
        left: 0;
        pointer-events: none;
    }

    .color-detector {
        display: none;
        background-color: var(--main-background);
    }
`);

import { greek } from "/code/math/math.js";

import "/code/math/constants.js";
import { v2 } from "/code/math/vector.js";
import { cartesian as c } from "/code/math/complex.js";
import { splitDouble } from "/code/math/precision.js";

export async function main() {

    const renderStack = $div("full");
    let topmost = renderStack;
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

    const controls = await $mod("control/panel",
        "Parameters", uniforms.getControlSettings(render).concat(blitUniforms.getControlSettings(render))
    );

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

    function showControls() {
        if (!topmost.isConnected) {
            topmost = renderStack;
        }
        else if (topmost.querySelector(".control-panel")) return;

        return ["show controls", async () => {
            const split = await $apply("layout/split",
                renderStack.parentNode,
                {
                    content: [controls.dom, renderStack],
                    percents: [20, 80]
                }
            );
            topmost = split.topmost;
        }];
    }

    const observers = {};

    function parseRgb(rgbString) {
        const m = rgbString.match(/rgba?\(([^)]+)\)/);
        if (!m) return { r: 0, g: 0, b: 0, a: 1 };
        const [r, g, b, a = 1] = m[1].split(',').map(v => parseFloat(v) / 255);
        return { r, g, b, a };
    }

    let style = getComputedStyle(colorDetector);
    let backgroundColor = parseRgb(style.backgroundColor);
    blitParams.nan_color_x = backgroundColor.r;
    blitParams.nan_color_y = backgroundColor.g;
    blitParams.nan_color_z = backgroundColor.b;

    observers.theme = new MutationObserver(() => {
        style = getComputedStyle(colorDetector);
        backgroundColor = parseRgb(style.backgroundColor);
        blitParams.nan_color_x = backgroundColor.r;
        blitParams.nan_color_y = backgroundColor.g;
        blitParams.nan_color_z = backgroundColor.b;

        render();
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
        // relying on showControls' topmost check to have occurred before this can be called,
        // which is true bc that happens while the context menu is built.
        // this may not remain true if a hotkey is added for exiting w/o opening the menu
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
                (topmost.isConnected ? topmost : renderStack).requestFullscreen();
            }
        }
    });

    const split = await $mod("layout/split",
        {
            content: [controls.dom, renderStack],
            percents: [20, 80]
        }
    );
    topmost = split.topmost;

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;

    style = getComputedStyle(colorDetector);
    backgroundColor = parseRgb(style.backgroundColor);
    blitParams.nan_color_x = backgroundColor.r;
    blitParams.nan_color_y = backgroundColor.g;
    blitParams.nan_color_z = backgroundColor.b;

    let outputTexture;
    let computeBindGroup;
    let renderBindGroup;

    const sampler = $gpu.device.createSampler({ magFilter: "nearest", minFilter: "nearest" });

    let canRender = false;

    async function offscreenRender(scalingFactor) {
        const dims = v2.of(width * scalingFactor, height * scalingFactor);

        const texture = $gpu.device.createTexture({
            size: [dims.x, dims.y],
            format: "r32float",
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



    function resize() {
        width = canvas.clientWidth;
        height = canvas.clientHeight;

        overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
        overlay.setAttribute("width", width);
        overlay.setAttribute("height", height);

        canvas.width = width;
        canvas.height = height;

        const uniforms = compShader.bufferDefinitions["0,0"];

        style = getComputedStyle(colorDetector);
        backgroundColor = parseRgb(style.backgroundColor);
        blitParams.nan_color_x = backgroundColor.r;
        blitParams.nan_color_y = backgroundColor.g;
        blitParams.nan_color_z = backgroundColor.b;

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
            format: "r32float",
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

    renderStack.$contextMenu = {
        items: [
            showControls,
            ["save frame", saveFrame],
            ["save 4x", () => offscreenRender(2)],
            ["save 9x", () => offscreenRender(3)],
            ["save 16x", () => offscreenRender(4)],
            ["exit", exitRenderer]
        ]
    };

    canvasModule.addNavigation("2d", params, render);

    return { dom: [topmost], replace: true };
}


