
$css(`
    .proj-shift-container {
        display: flex;
        flex-direction: row;
    }
`);

export async function main(target) {
    const container = document.createElement("div");
    container.classList = "full proj-shift-container";

    let phi = 0.0;
    let psi = 1.0;
    let c = 0.85;
    let iterations = 100;
    let escape_distance = 2;
    let centerX = -0.5;
    let centerY = 0.0;
    let zoom = 4.0;

    $mod("control/panel", container, [[
        {
            type: "number",
            label: "phi",
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
            label: "psi",
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

    const gpuModule = await $mod("gpu/webgpu", container);

    const canvas = gpuModule.canvas;
    const context = gpuModule.context;

    const compShader = await $gpu.loadShader("proj_shift");
    const blitShader = await $gpu.loadShader("blit");

    if (!compShader || !blitShader) return;

    const computePipeline = $gpu.device.createComputePipeline({
        layout: "auto",
        compute: {
            module: compShader,
            entryPoint: 'main'
        }
    });

    const renderPipeline = $gpu.device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: blitShader,
            entryPoint: 'vert'
        },
        fragment: {
            module: blitShader,
            entryPoint: 'frag',
            targets: [ { format: $gpu.canvasFormat } ]
        },
        primitive: {
            topology: 'triangle-list'
        }
    });


    target.appendChild(container);

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;

    let outputTexture = $gpu.device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    const uniformBuffer = $gpu.device.createBuffer({
        size: 10 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const sampler = $gpu.device.createSampler({ magFilter: 'nearest', minfilter: 'nearest' });

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

        canvas.width = width;
        canvas.height = height;

        if (width * height <= 0) {
            console.warn("WebGPU canvas has invalid size; aborting resize callback.");
            canRender = false;
            return;
        }

        canRender = true;

        outputTexture.destroy();

        outputTexture = $gpu.device.createTexture({
            size: [width, height],
            format: 'rgba8unorm',
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
        const uniformData = new ArrayBuffer(10 * 4);
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
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        });

        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, renderBindGroup);
        renderPass.draw(6); // 1 quad, 2 tris
        renderPass.end();

        $gpu.device.queue.submit([commandEncoder.finish()]);
    }

    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        // Convert pixel coordinates to complex plane coordinates
        const scale = 4.0 / zoom;
        const x = (px - width * 0.5) * scale / width + centerX;
        const y = (py - height * 0.5) * scale / height + centerY;

        centerX = x;
        centerY = y;
        zoom *= e.shiftKey ? 0.5 : 2.0; // Shift+click to zoom out

        render();
    });


    render();

    return { replace: true };
}


