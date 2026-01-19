
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

import { greek } from "/math/math.js";

export async function main(target) {
    //const container = document.createElement("div");
    //container.classList = "full proj-shift-container";

    let phi = 0.0;
    let psi = 1.0;
    let c = 0.85;
    let d = 0.0;
    let iterations = 100;
    let escape_distance = 2;
    let centerX = -0.5;
    let centerY = 0.0;
    let zoom = 4.0;
    let twist = 0.0;
    let squoosh_x = 1.0;
    let squoosh_y = 1.0;

    let showTrajectory = false;

    function complexMag(z) {
        return Math.sqrt(z.x * z.x + z.y * z.y);
    }

    function complexAngle(z) {
        return Math.atan2(z.y, z.x);
    }

    function projectiveShift(x, phi, psi) {
        const xMag = complexMag(x);
        const xAngle = complexAngle(x);
        const angleDiff = xAngle - phi;
        const newMag = xMag + Math.cos(angleDiff);
        return {
            x: newMag * Math.cos(xAngle * psi),
            y: newMag * Math.sin(xAngle * psi)
        };
    }

    function iteratePolar(x, phi, psi, c, d) {
        const shifted = projectiveShift(x, phi, psi);
        return { x: shifted.x - c, y: shifted.y - d };
    }

    function computeTrajectory(startZ, maxIters, escapeThreshold) {
        const trajectory = [startZ];
        let z = { x: startZ.x, y: startZ.y };

        for (let i = 0; i < maxIters; i++) {
            const magSq = z.x * z.x + z.y * z.y;
            if (magSq > escapeThreshold * escapeThreshold) {
                break;
            }
            z = iteratePolar(z, phi, psi, c, d);
            trajectory.push({ x: z.x, y: z.y });
        }

        return trajectory;
    }

    function complexToPixel(z) {
        const aspect = width / height;
        const scale = 4.0 / zoom;
        const px = (z.x - centerX) * width / (scale * aspect) + width * 0.5;
        const py = (z.y - centerY) * height / scale + height * 0.5;
        return { x: px, y: py };
    }



    // z_{n+1} = (r + cos(θ-φ))e^(iθψ) - c
    const controls = await $prepMod("control/panel", ["Parameters", [
        {
            type: "number",
            label: "c",
            value: c,
            min: 0,
            max: 1,
            step: 0.001,
            onUpdate: (value, set) => {
                c = value;
                render();
            }
        },
        {
            type: "number",
            label: "d",
            value: d,
            min: 0,
            max: 1,
            step: 0.001,
            onUpdate: (value, set) => {
                d = value;
                render();
            }
        },
        {
            type: "number",
            label: greek["psi"],
            value: psi,
            min: 0,
            max: 12,
            step: 0.001,
            onUpdate: (value, set) => {
                psi = value;
                render();
            }
        },
        {
            type: "number",
            label: "twist",
            value: twist,
            min: -$tau/2,
            max: $tau/2,
            step: 0.001,
            onUpdate: (value, set) => {
                twist = value;
                render();
            }
        },
        {
            type: "number",
            label: "squoosh x",
            value: squoosh_x,
            min: 0,
            max: 10,
            step: 0.001,
            onUpdate: (value, set) => {
                squoosh_x = value;
                render();
            }
        },
        {
            type: "number",
            label: "squoosh y",
            value: squoosh_y,
            min: 0,
            max: 10,
            step: 0.001,
            onUpdate: (value, set) => {
                squoosh_y = value;
                render();
            }
        },
        {
            type: "number",
            label: greek["phi"],
            value: phi,
            min: 0,
            max: $tau,
            step: 0.001,
            onUpdate: (value, set) => {
                phi = value;
                render();
            }
        },
        {
            type: "number",
            label: "iterations",
            min: 0,
            max: 500,
            step: 1,
            value: iterations,
            onUpdate: (value, set) => {
                iterations = value;
                if (iterations < 0) {
                    iterations = 0;
                    set(0);
                }
                render();
            }
        },
        {
            type: "number",
            label: "escape distance",
            value: escape_distance,
            min: 0,
            max: 10,
            step: 0.1,
            onUpdate: (value, set) => {
                escape_distance = value;
                render();
            }
        },
    ]]);

    const renderStack = $div("full");
    renderStack.dataset.name = "renderer";
    renderStack.style.position = "relative";

    const gpuModule = await $mod("gpu/webgpu", renderStack);

    const canvas = gpuModule.canvas;
    const context = gpuModule.context;

    canvas.setAttribute("aria-label", "Interactive visualization of the iterated projective shift map.");
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-keyshortcuts", "f");

    const compShader = await $gpu.loadShader("proj_shift", { "pixel_mapping" : "pixel_to_complex" });
    const blitShader = await $gpu.loadShader("blit");

    if (!compShader || !blitShader) return;

    const computePipeline = $gpu.device.createComputePipeline({
        layout: "auto",
        compute: {
            module: compShader,
            entryPoint: "main"
        }
    });

    const renderPipeline = $gpu.device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: blitShader,
            entryPoint: "vert"
        },
        fragment: {
            module: blitShader,
            entryPoint: "frag",
            targets: [ { format: $gpu.canvasFormat } ]
        },
        primitive: {
            topology: "triangle-list"
        }
    });

    const overlay = $svgElement("svg");
    overlay.classList = "full overlay";

    overlay.setAttribute("aria-label", "Overlay visualizing the trajectory starting from the point under the cursor.")

    renderStack.appendChild(overlay);

    function showControls() {
        if (!topmost.isConnected) {
            topmost = renderStack;
        }
        else if (topmost.querySelector(".control-panel")) return;

        return ["show controls", async () => {
            const split = await $mod("layout/split", renderStack.parentNode, [{content: [controls, renderStack], percents: [20, 80]}]);
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
        // this may not remain true if a hotkey is added for exiting w/o opening the context menu
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
    renderStack.$contextMenu = {
        items: [
            showControls,
            saveTrajectory,
            ["save frame", saveFrame],
            toggleTrajectory,
            ["exit", exitRenderer]
        ]
    };

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

    const split = await $mod("layout/split", target, [{ content: [controls, renderStack], percents: [20, 80]}]);
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

    const uniformBuffer = $gpu.device.createBuffer({
        size: 14 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sampler = $gpu.device.createSampler({ magFilter: "nearest", minfilter: "nearest" });

    let computeBindGroup = $gpu.device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
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

    function resize() {
        width = canvas.clientWidth;
        height = canvas.clientHeight;

        overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
        overlay.setAttribute("width", width);
        overlay.setAttribute("height", height);

        canvas.width = width;
        canvas.height = height;

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
                { binding: 0, resource: { buffer: uniformBuffer } },
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

    function updateUniforms() {
        // TODO: save the same buffer
        const uniformData = new ArrayBuffer(14 * 4);
        const view = new DataView(uniformData);

        /*
        center_x: f32,
        center_y: f32,
        zoom: f32,
        phi: f32,
        c: f32,
        width: u32,
        height: u32,
        max_iter: u32,
        escape_distance: f32,
        psi: f32,
        d: f32,
        twist: f32,
        */

        // TODO less brittle hard coded numbers jfc
        view.setFloat32(0, centerX, true);
        view.setFloat32(4, centerY, true);
        view.setFloat32(8, zoom, true);
        view.setFloat32(12, phi, true);
        view.setFloat32(16, c, true);
        view.setUint32(20, width, true);
        view.setUint32(24, height, true);
        view.setUint32(28, iterations, true);
        view.setFloat32(32, escape_distance, true);
        view.setFloat32(36, psi, true);
        view.setFloat32(40, d, true);
        view.setFloat32(44, twist, true);
        view.setFloat32(48, squoosh_x, true);
        view.setFloat32(52, squoosh_y, true);

        $gpu.device.queue.writeBuffer(uniformBuffer, 0, uniformData);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    function render() {
        if (!canRender) {
            console.warn("Cannot render; aborting render.");
            return;
        }

        updateUniforms();

        const commandEncoder = $gpu.device.createCommandEncoder();

        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(
            Math.ceil(width / 16),
            Math.ceil(height / 16),
            1
        );
        computePass.end();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
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

    // Lots of unreviewed code from claude here:

    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        lastMouseX = e.clientX - rect.left;
        lastMouseY = e.clientY - rect.top;
        canvas.style.cursor = "all-scroll";
    });

    canvas.addEventListener("pointermove", (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const scale = 4.0 / zoom;
        const aspect = width / height;


// Compute and display trajectory
    const complexX = (mouseX - width * 0.5) * scale * aspect / width + centerX;
    const complexY = (mouseY - height * 0.5) * scale / height + centerY;

    const startZ = { x: complexX, y: complexY };
    const trajectory = computeTrajectory(startZ, Math.min(iterations, 500), escape_distance);

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
            const pixel = complexToPixel(trajectory[i]);

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

        const deltaX = mouseX - lastMouseX;
        const deltaY = mouseY - lastMouseY;

        // Convert pixel delta to complex plane delta
        const complexDeltaX = -deltaX * scale * aspect / width;
        const complexDeltaY = -deltaY * scale / height;

        centerX += complexDeltaX;
        centerY += complexDeltaY;

        lastMouseX = mouseX;
        lastMouseY = mouseY;

        render();
    });

    // Mouse up - stop dragging
    canvas.addEventListener("pointerup", () => {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = "crosshair";
    });

    // Mouse leave - stop dragging if mouse leaves canvas
    canvas.addEventListener("pointerleave", () => {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = "crosshair";
    });

    // Wheel - zoom in/out
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert mouse position to complex coordinates before zoom
        const scale = 4.0 / zoom;
        const aspect = width / height;
        const complexX = (mouseX - width * 0.5) * scale * aspect / width + centerX;
        const complexY = (mouseY - height * 0.5) * scale / height + centerY;

        // Zoom factor - negative deltaY means zoom in
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        zoom *= zoomFactor;

        // Adjust center to keep mouse position fixed in complex plane
        const newScale = 4.0 / zoom;
        const newCenterX = complexX - (mouseX - width * 0.5) * newScale * aspect / width;
        const newCenterY = complexY - (mouseY - height * 0.5) * newScale / height;

        centerX = newCenterX;
        centerY = newCenterY;

        render();
    });

    canvas.style.cursor = "crosshair";

    render();


    return { replace: true };
}

