
$css(`
    canvas.webgpu {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        user-select: none;
    }
`);

import "/code/math/constants.js";

import { loadShader } from "/code/gpu/lang/shader.js";
export { loadShader };

async function gpuInit() {
    if (!navigator.gpu) {
        console.error("WebGPU not supported.");
        window.$gpu = { available: false };
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) {
        console.error("No WebGPU adapter.");
        window.$gpu = { available: false };
        return;
    }

    const device = await adapter.requestDevice({
        requiredLimits: {
            //maxTextureDimension2D: 32767,
            //maxBufferSize: 1073741824,
            //maxStorageBufferBindingSize: 1073741824,
        },
        requiredFeatures: [ /*'float32-filterable'*/ ], // TODO: fallback for when this doesnt work
    });
    // todo ensure device

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    function getOffscreenContext(dims) {
        const canvas = new OffscreenCanvas(dims.x, dims.y);
        const context = canvas.getContext("webgpu");

        context.configure({ device, format: canvasFormat });

        return {
            canvas,
            context
        };
    }

    window.$gpu = {
        available: true,
        device,
        canvasFormat,
        loadShader,
        getOffscreenContext
    };
}

await gpuInit();

