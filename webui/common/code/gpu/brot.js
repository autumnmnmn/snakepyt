
$css(`
    .proj-shift-container {
        display: flex;
        flex-direction: row;
    }

    .overlay {
        user-select: none;
        position: absolute;
        z-index: 1;
        top: 0;
        left: 0;
        pointer-events: none;
    }
`);

import { greek } from "/code/math/math.js";

import "/code/math/constants.js";
import "/code/math/vector.js";

import { translatedProjectiveShift } from "/code/math/proj_shift.js";

export async function main(target) {
    let showTrajectory = false;

    const c = $complex.cartesian;
    const v2 = $vector.v2;

    function computeTrajectory(cParam, maxIters, escapeThreshold) {
        let z = c.of(0,0);
        const trajectory = [c.copy(z)];

        for (let i = 0; i < maxIters; i++) {
            if (c.magSq(z) > escapeThreshold * escapeThreshold) {
                break;
            }
            z = c.add(c.mul(z,z), cParam);
            trajectory.push(c.copy(z));
        }

        return trajectory;
    }

    const renderStack = $div("full");
    renderStack.dataset.name = "renderer";
    renderStack.style.position = "relative";

    const gpuModule = await $mod("gpu/webgpu", renderStack);

    const canvas = gpuModule.canvas;
    const context = gpuModule.context;

    canvas.setAttribute("aria-label",
        "Interactive visualization of the mandelbrot set.");
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-keyshortcuts", "f");

    const compShader = await $gpu.loadShader("brot", {
        "pixel_mapping" : "pixel_to_complex"
    });
    const blitShader = await $gpu.loadShader("blit");

    if (!compShader || !blitShader) return;

    const uniforms = compShader.bufferDefinitions["0,0"];

    uniforms.vars.zoom.value = 1.0;
    uniforms.vars.center_x.value = -0.75;
    uniforms.vars.center_y.value = 0.0;

    const controls = await $prepMod("control/panel",
        ["Parameters", uniforms.getControlSettings(render)]
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
            const split = await $mod("layout/split",
                renderStack.parentNode,
                [{
                    content: [controls, renderStack],
                    percents: [20, 80]
                }]
            );
            topmost = split.topmost;
        }];
    }

    function toggleTrajectory() {
        if (showTrajectory) return ["hide trajectory", () => {showTrajectory = false}];
        return ["show trajectory", () => {showTrajectory = true}];
    }

    function exitRenderer() {
        // relying on showControls' topmost check to have occurred before this can be called,
        // which is true bc that happens while the context menu is built.
        // this may not remain true if a hotkey is added for exiting w/o opening the menu
        const target = topmost.parentNode;
        target.replaceChildren();
        $mod("layout/nothing", target);
    }

    function saveFrame() {
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = $element("a");
            a.href = url;
            a.download = `ps_web_${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    function saveTrajectory() {
        if (!showTrajectory) return;

        return ["save trajectory", () => {
            const svgString = new XMLSerializer().serializeToString(overlay);
            const blob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = $element("a");
            a.href = url;
            a.download = `ps_traj_${Date.now()}.svg`;
            a.click();
            URL.revokeObjectURL(url);
        }];
    }

    renderStack.$preventCollapse = true;

    renderStack.addEventListener("keydown", (e) => {
        if (e.key === "f") {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
            else {
                renderStack.requestFullscreen();
            }
        }
    });

    const split = await $mod("layout/split",
        target,
        [{
            content: [controls, renderStack],
            percents: [20, 80]
        }]
    );
    let topmost = split.topmost;

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;

    let outputTexture = $gpu.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    const sampler = $gpu.device.createSampler({ magFilter: "nearest", minfilter: "nearest" });

    let computeBindGroup = $gpu.device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniforms.gpuBuffer } },
            { binding: 1, resource: outputTexture.createView() }
        ]
    });

    let renderBindGroup = $gpu.device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: outputTexture.createView() }
        ]
    });

    let canRender = true;

    async function offscreenRender(scalingFactor) {
        const dims = v2.of(width * scalingFactor, height * scalingFactor);

        const texture = $gpu.device.createTexture({
            size: [dims.x, dims.y],
            format: "rgba8unorm",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        const orig_height = uniforms.vars.height.value;
        const orig_width = uniforms.vars.width.value;

        uniforms.vars.height.value *= scalingFactor;
        uniforms.vars.width.value *= scalingFactor;

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
                { binding: 0, resource: sampler },
                { binding: 1, resource: texture.createView() }
            ]
        });

        const offscreen = $gpu.getOffscreenContext(dims);

        render(offscreen.context, dims);

        uniforms.vars.height.value = orig_height;
        uniforms.vars.width.value = orig_width;

        const blob = await offscreen.canvas.convertToBlob({ type: "image/png" });

        const url = URL.createObjectURL(blob);
        const a = $element("a");
        a.href = url;
        a.download = `ps_web_${Date.now()}.png`;
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
                { binding: 0, resource: sampler },
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

        uniforms.vars.width.value = width;
        uniforms.vars.height.value = height;

        if (width * height <= 0) {
            canRender = false;
            return;
        }

        canRender = true;

        outputTexture.destroy();

        outputTexture = $gpu.device.createTexture({
            size: [width, height],
            format: "rgba8unorm",
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
                { binding: 0, resource: sampler },
                { binding: 1, resource: outputTexture.createView() }
            ]
        });

        render();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    function render(targetContext = context, dims = null) {

        if (!canRender) {
            console.warn("Cannot render; aborting render.");
            return;
        }

        dims = dims || v2.of(width, height);

        const uniforms = compShader.bufferDefinitions["0,0"];
        uniforms.updateBuffers();

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
        renderPass.draw(6); // 1 quad, 2 tris
        renderPass.end();

        $gpu.device.queue.submit([commandEncoder.finish()]);
    }

    let isDragging = false;
    let lastMouse = v2.of(0,0);

    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        lastMouse = v2.fromMouse(e, canvas);
        canvas.style.cursor = "all-scroll";
    });

    canvas.addEventListener("pointermove", (e) => {
        const pMouse = v2.fromMouse(e, canvas);

        const dims = v2.of(width, height);
        const center = c.of(uniforms.vars.center_x.value, uniforms.vars.center_y.value);
        const scale = 1.0 / uniforms.vars.zoom.value;

        const cMouse = c.fromPixel(pMouse, dims, center, scale);

        const trajectory = computeTrajectory(
            cMouse,
            Math.min(uniforms.vars.iterations.value, 500),
            uniforms.vars.escape_distance.value
        );

        // Clear existing trajectory
        const existingPath = overlay.querySelector(".trajectory-path");
        if (existingPath) {
            existingPath.remove();
        }

        if (showTrajectory && trajectory.length > 1) {
            const path = $svgElement("path");
            path.setAttribute("class", "trajectory-path");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "lime");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("opacity", "1.0");

            let pathData = "";
            for (let i = 0; i < trajectory.length; i++) {
                const pixel = c.toPixel(trajectory[i], dims, center, scale);

                // Skip points outside visible area
                if (pixel.x < -10 || pixel.x > width + 10 ||
                    pixel.y < -10 || pixel.y > height + 10) {
                    //continue;
                }

                if (pathData === "") {
                    pathData = `M ${pixel.x} ${pixel.y}`;
                } else {
                    pathData += ` L ${pixel.x} ${pixel.y}`;
                }
            }

            if (pathData !== "") {
                path.setAttribute("d", pathData);
                overlay.appendChild(path);
            }
        }


        if (!isDragging) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const delta = v2.sub(pMouse, lastMouse);

        // Convert pixel delta to complex plane delta
        const cDelta = v2.scale(delta, -scale / height);

        uniforms.vars.center_x.value += cDelta.x;
        uniforms.vars.center_y.value += cDelta.y;

        lastMouse = pMouse;

        render();
    });

    renderStack.$contextMenu = {
        items: [
            showControls,
            saveTrajectory,
            ["save frame", saveFrame],
            ["save 4x", () => offscreenRender(2)],
            ["save 9x", () => offscreenRender(3)],
            ["save 16x", () => offscreenRender(4)],
            toggleTrajectory,
            ["exit", exitRenderer]
        ]
    };


    canvas.addEventListener("pointerup", () => {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = "crosshair";
    });

    canvas.addEventListener("pointerleave", () => {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = "crosshair";
    });

    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();

        const pMouse = v2.fromMouse(e, canvas);

        const dims = v2.of(width, height);
        const center = c.of(uniforms.vars.center_x.value, uniforms.vars.center_y.value);
        const scale = 1.0 / uniforms.vars.zoom.value;
        const cMouse = c.fromPixel(pMouse, dims, center, scale);

        const isTrackpad = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
        const zoomFactorDiff = isTrackpad ? 0.01 : 0.1;

        // negative deltaY means zoom in
        const zoomFactor = e.deltaY > 0 ? 1.0 - zoomFactorDiff : 1.0 + zoomFactorDiff;

        uniforms.vars.zoom.value *= zoomFactor;

        // Adjust center to keep mouse position fixed in complex plane
        const newScale = 1.0 / uniforms.vars.zoom.value;
        const newCenterX = cMouse.re - (pMouse.x - width * 0.5) * newScale / height;
        const newCenterY = cMouse.im - (pMouse.y - height * 0.5) * newScale / height;

        uniforms.vars.center_x.value = newCenterX;
        uniforms.vars.center_y.value = newCenterY;

        render();
    });

    canvas.style.cursor = "crosshair";

    render();


    return { replace: true };
}


