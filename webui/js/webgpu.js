
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    canvas.webgpu-main {
        width: 100%;
        height: 100%;
    }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

let webgpu_working = true;

if (!navigator.gpu) {
    console.error('WebGPU not supported.');
    webgpu_working = false;
}

const adapter = await navigator.gpu.requestAdapter();

if (!adapter) {
    console.error('No WebGPU adapter.');
    webgpu_working = false;
}

const device = await adapter.requestDevice();
// todo ensure device

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

// TODO make more robust
async function loadShader(shaderName) {
    const response = await fetch(`./${shaderName}.wgsl`);
    const shaderSource = await response.text();
    const module = device.createShaderModule({ code: shaderSource });
    const info = await module.getCompilationInfo();
    if (info.messages.some(m => m.type === 'error')) {
        return null;
    }
    return module;
}

export async function main(target) {
    if (!webgpu_working) {
        console.error("WebGPU not working; aborting module load.");
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.className = "webgpu-main";

    const context = canvas.getContext('webgpu');

    context.configure({ device, format: canvasFormat });

    const compShader = await loadShader("test");
    const blitShader = await loadShader("blit");

    if (!compShader || !blitShader) return;

    const computePipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
            module: compShader,
            entryPoint: 'comp'
        }
    });

    const renderPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: blitShader,
            entryPoint: 'vert'
        },
        fragment: {
            module: blitShader,
            entryPoint: 'frag',
            targets: [ { format: canvasFormat } ]
        },
        primitive: {
            topology: 'triangle-list'
        }
    });

    target.appendChild(canvas);
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;

    let outputTexture = device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    const uniformBuffer = { /* TODO */ };

    const sampler = device.createSampler({ magFilter: 'nearest', minfilter: 'nearest' });

    let computeBindGroup = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: outputTexture.createView() }
        ]
    });

    let renderBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: outputTexture.createView() }
        ]
    });

    function resize() {
        width = canvas.clientWidth;
        height = canvas.clientHeight;

        canvas.width = width;
        canvas.height = height;

        outputTexture.destroy();

        outputTexture = device.createTexture({
            size: [width, height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        computeBindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: outputTexture.createView() }
            ]
        });

        renderBindGroup = device.createBindGroup({
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

    function render() {
        const commandEncoder = device.createCommandEncoder();

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

        device.queue.submit([commandEncoder.finish()]);
    }

    render();

    canvas.addEventListener("click", render);

    return { replace: true };
}

