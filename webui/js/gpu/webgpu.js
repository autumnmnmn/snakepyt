
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


window.$gpu = {
    device,
    canvasFormat,
    loadShader
};

export async function main(target) {
    if (!webgpu_working) {
        console.error("WebGPU not working; aborting module load.");
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.className = "webgpu";

    canvas.tabIndex = 0;

    canvas.addEventListener("keydown", (e) => {
        if (e.key === "f") {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
            else {
                canvas.requestFullscreen();
            }
        }
    });


    const context = canvas.getContext('webgpu');

    context.configure({ device, format: canvasFormat });

    target.appendChild(canvas);

    return {
        replace: true,
        canvas,
        context
    };
}

