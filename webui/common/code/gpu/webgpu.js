
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

let webgpu_working = true;

if (!navigator.gpu) {
    console.error("WebGPU not supported.");
    webgpu_working = false;
}

const adapter = await navigator.gpu.requestAdapter();

if (!adapter) {
    console.error("No WebGPU adapter.");
    webgpu_working = false;
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

const wgslSizes = {
    f32: 4, i32: 4, u32: 4,
    f16: 2, i16: 2, u16: 2
};

const wgslAligns = {
    vec2f: 8,
    vec2u: 8,
    f32: 4, i32: 4, u32: 4,
    f16: 2, i16: 2, u16: 2,
}

const wgslFloatTypes = new Set(["f32", "f16"]);

const wgslSetters = {
    f32: DataView.prototype.setFloat32,
    f16: DataView.prototype.setFloat16,
    i32: DataView.prototype.setInt32,
    i16: DataView.prototype.setInt16,
    u32: DataView.prototype.setUint32,
    u16: DataView.prototype.setUint16,
    i8: DataView.prototype.setInt8,
    u8: DataView.prototype.setUint8
};

const compositeTypes = {
    vec2f: [
        { type: "f32", name: "x" },
        { type: "f32", name: "y" }
    ],
    vec2u: [
        { type: "u32", name: "x" },
        { type: "u32", name: "y" }
    ],
};

const constants = {
    pi: $tau / 2,
    tau: $tau
}

import { greek } from "/code/math/math.js";

function getUiName(varName) {
    return greek[varName] || varName.replace(/_/g, ' ');
};

function processNumeric(value) {
    if (value === undefined) return value;
    if (value[0] === '-') {
        return -constants[value.substring(1)] || value;
    }
    return constants[value] || value;
}

// TODO: make this more debuggable lol
// var_name: type, // hard? min to hard? max = default
const VAR_RE =/^\s*(\w+)\s*:\s*(\w+),?\s*(?:\/\/\s*((?:(hard)\s+)?([\w.+-]+)\s+to\s+(?:(hard)\s+)?([\w.+-]+)(?:\s*=\s*([\w.+-,]+))?))?\s*$/;

async function loadShader(shaderName, substitutions = {}) {
    const response = await fetch(`/code/shaders/${shaderName}.wgsl`);
    const shaderSource = await response.text();


    // [full match, group, binding, content]
    const notatedBuffers = [
        ...shaderSource.matchAll(/\/\* buffer (\d+) (\d+) \*\/\s*\{([^}]*)\}/g)
    ];

    const bufferDefinitions = notatedBuffers.map(regexMatch => {
        const lines = regexMatch[3].split('\n');

        const vars = lines.filter(Boolean).flatMap(line => {
            const parsed = line.match(VAR_RE);
            const type = parsed[2];


            if (type in compositeTypes) {
                const vals = parsed[8] ? parsed[8].split(',') : undefined;
                return compositeTypes[type].map((member, index) => ({
                    varName: `${parsed[1]}_${member.name}`,
                    type: member.type,
                    uiName: `${getUiName(parsed[1])}.${member.name}`,
                    bytes: wgslSizes[member.type],
                    aligns: [wgslAligns[member.type]].concat(
                        index === 0 ? wgslAligns[type] : []
                    ),
                    showControl: parsed[3] !== undefined,
                    hardMin: parsed[4] !== undefined,
                    min: processNumeric(parsed[5]),
                    hardMax: parsed[6] !== undefined,
                    max: processNumeric(parsed[7]),
                    value: processNumeric(vals ? vals[index] : undefined)
                }));
            }

            return {
                varName: parsed[1],
                type,
                uiName: getUiName(parsed[1]),
                bytes: wgslSizes[type],
                aligns: [wgslAligns[type]],
                isIntegral: !wgslFloatTypes.has(type),
                dataViewSetter: wgslSetters[type],
                showControl: parsed[3] !== undefined,
                hardMin: parsed[4] !== undefined,
                min: processNumeric(parsed[5]),
                hardMax: parsed[6] !== undefined,
                max: processNumeric(parsed[7]),
                value: processNumeric(parsed[8])
            };
        });

        const buildControl = (v, afterChangeCallback) => ({
            type: "number",
            label: v.uiName,
            value: v.value,
            min: v.min,
            max: v.max,
            step: v.isIntegral ? 1 : 0.001,
            onUpdate: (value, set) => {
                v.value = value;
                if (v.hardMin && v.value < v.min) {
                    v.value = v.min;
                    set(v.value);
                }
                if (v.hardMax && v.value > v.max) {
                    v.value = v.max;
                    set(v.value);
                }
                afterChangeCallback();
            }
        });

        const getControlSettings = (afterChangeCallback) =>
            vars.filter(v => v.showControl).map(v => buildControl(v, afterChangeCallback));

        let bufferSize = 0;
        const bufferAlign = Math.max(...vars.flatMap(v => v.aligns));

        vars.forEach(v => {
            const align = Math.max(...v.aligns);
            if (bufferSize % align !== 0) {
                bufferSize = bufferSize + (align - bufferSize % align);
            }
            bufferSize += v.bytes;
        });

        if (bufferSize % bufferAlign !== 0) {
            bufferSize = bufferSize + (bufferAlign - bufferSize % bufferAlign);
        }

        const cpuBuffer = new ArrayBuffer(bufferSize);
        const gpuBuffer = device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const cpuView = new DataView(cpuBuffer);

        const updateBuffers = () => {
            var position = 0;
            vars.forEach(v => {
                const align = Math.max(...v.aligns);
                if (position % align !== 0) {
                    position = position + (align - position % align);
                }
                wgslSetters[v.type].call(cpuView, position, v.value, true);
                position += v.bytes;
            });

            device.queue.writeBuffer(gpuBuffer, 0, cpuBuffer);
        };

        const varMap = {};
        vars.forEach(v => {
            varMap[v.varName] = v;
        });

        return {
            group: regexMatch[1],
            binding: regexMatch[2],
            vars: varMap,
            getControlSettings,
            gpuBuffer,
            updateBuffers
        };
    });


    const bufferDefinitionsMap = {};

    bufferDefinitions.forEach(bd => {
        bufferDefinitionsMap[`${bd.group},${bd.binding}`] = bd;
    });

    var substitutionFailure = false;
    const adjustedSource = shaderSource.replace(/\${(\w+)}/g, (match, key) => {
        if (!(key in substitutions)) {
            substitutionFailure = true;
            return "";
        }
        else {
            return substitutions[key];
        }
    });

    const module = device.createShaderModule({ code: adjustedSource });
    const info = await module.getCompilationInfo();
    if (info.messages.some(m => m.type === "error") || substitutionFailure) {
        return null;
    }
    return {
        module,
        bufferDefinitions: bufferDefinitionsMap
    };
}

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
    device,
    canvasFormat,
    loadShader,
    getOffscreenContext
};

export async function main(target) {
    if (!webgpu_working) {
        console.error("WebGPU not working; aborting module load.");
        return;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "webgpu";

    canvas.tabIndex = 0;

    const context = canvas.getContext("webgpu");

    context.configure({ device, format: canvasFormat });

    target.appendChild(canvas);

    return {
        replace: true,
        canvas,
        context
    };
}

