
import "/code/gpu/webgpu.js";
import * as wgsl from "/code/gpu/lang/wgsl.js";
import { greek } from "/code/math/math.js";
import { Color, NonlinearSRGB } from "/code/math/color.js"
import "/code/math/constants.js";

const constants = {
    pi: $tau / 2,
    tau: $tau
}

/// hack by gemini -- at the very least deserves its own file
const _colorCanvas = document.createElement("canvas");
_colorCanvas.width = 1; _colorCanvas.height = 1;
const _colorCtx = _colorCanvas.getContext("2d", { willReadFrequently: true });

function cssToNormalizedRgb(cssString) {
    _colorCtx.clearRect(0, 0, 1, 1);
    _colorCtx.fillStyle = cssString;
    _colorCtx.fillRect(0, 0, 1, 1);
    const data = _colorCtx.getImageData(0, 0, 1, 1).data;
    return [data[0] / 255, data[1] / 255, data[2] / 255];
}
/// end hack

function getUiName(varName) {
    return greek[varName] || varName.replace(/_/g, ' ');
};

function processNumeric(value) {
    if (value === undefined) return value;
    if (value[0] === '-') {
        return -constants[value.substring(1)] || Number(value);
    }
    return constants[value] || Number(value);
}

function valueProxy(varMap) {
    return new Proxy(varMap, {
        get: (_, key) => varMap[key]?.value,
        set: (_, key, value) => {
            const v = varMap[key];
            v.value = value;
            v.propagateChange?.();
            for (const registration of v.registrations.filter(r => r.set)) {
                registration.set(value);
                if (v.isCompositeSubvar) {
                    console.log(v);
                    console.log(value);
                }
            }
            return true;
        }
    })
}

// TODO: make this more debuggable lol
// var_name: type, // hard? min to hard? max = default $various $optional $tags
// [0: full match, 1: varname, 2: type, 3: comment, 4: hardmin, 5: min, 6: hardmax, 7: max, 8: default value, 9: tags]
const VAR_RE = /^\s*(\w+)\s*:\s*(\w+),?\s*(?:(\/\/)\s*(?:(?:(hard)\s+)?([\w.+-]+)\s+to\s+(?:(hard)\s+)?([\w.+-]+)(?:\s*=\s*([\w.+-,]+))?)?)?\s*((?:\$(?:\w+)(?:\((?:[^\)]|\(.*\))*\))?\s*?)*)\s*$/;

const TAG_RE = /\$(\w+)(?:\(((?:[^()]+|\([^()]*\))*)\))?/g;


export async function loadShader(shaderName, substitutions = {}) {
    const response = await fetch(`/code/shaders/${shaderName}.wgsl`);
    var shaderSource = await response.text();

    const pasteDirectives = [
        ...shaderSource.matchAll(/\$paste\(([^\)]*)\);/g)
    ];

    for (const directive of pasteDirectives) {
        const source = await fetch(`/code/shaders/shared/${directive[1]}`).then(r => r.text());
        shaderSource = shaderSource.replace(directive[0], source);
    }

    // [0: full match, 1: group, 2: binding, 3: content]
    const notatedBuffers = [
        ...shaderSource.matchAll(/\/\* buffer (\d+) (\d+) \*\/\s*\{([^}]*)\}/g)
    ];

    const bufferDefinitions = notatedBuffers.map(regexMatch => {
        const lines = regexMatch[3].split('\n');

        const composites = {};

        const vars = lines.filter(Boolean).flatMap(line => {
            const parsed = line.match(VAR_RE);

            const tags = [...parsed[9].matchAll(TAG_RE)]
                .map(([, name, arg = null]) => [name, arg]);

            const type = parsed[2];

            if (type in wgsl.compositeTypes) {
                const vals = parsed[8] ? parsed[8].split(',') : undefined;
                const uiName = getUiName(parsed[1]);
                const composite_subvars = wgsl.compositeTypes[type].map((member, index) => ({
                    varName: `${parsed[1]}_${member.name}`,
                    type: member.type,
                    uiName: `${uiName} ${member.name}`,
                    bytes: wgsl.sizes[member.type],
                    aligns: [wgsl.aligns[member.type]].concat(
                        index === 0 ? wgsl.aligns[type] : []
                    ),
                    showControl: parsed[3] !== undefined,
                    hardMin: parsed[4] !== undefined,
                    min: processNumeric(parsed[5]),
                    hardMax: parsed[6] !== undefined,
                    max: processNumeric(parsed[7]),
                    value: processNumeric(vals ? vals[index] : undefined),
                    registrations: [],
                    tags: tags,
                    dependents: [],
                    isCompositeSubvar: true,
                    parentName: parsed[1]
                }));
                composites[parsed[1]] = {
                    varName: parsed[1],
                    type: type,
                    uiName: uiName,
                    bytes: 0,
                    aligns: composite_subvars.flatMap(v => v.aligns),
                    showControl: parsed[3] !== undefined,
                    tags: tags,
                    subVars: composite_subvars,
                    registrations: [],
                    dependents: [],
                    isCompositeSubvar: false
                };
                return composite_subvars;
            }

            return {
                varName: parsed[1],
                type,
                uiName: getUiName(parsed[1]),
                bytes: wgsl.sizes[type],
                aligns: [wgsl.aligns[type]],
                isIntegral: !wgsl.floatTypes.has(type),
                dataViewSetter: wgsl.setters[type],
                showControl: parsed[3] !== undefined,
                hardMin: parsed[4] !== undefined,
                min: processNumeric(parsed[5]),
                hardMax: parsed[6] !== undefined,
                max: processNumeric(parsed[7]),
                value: processNumeric(parsed[8]),
                registrations: [],
                tags: tags,
                dependents: [],
                isCompositeSubvar: false
            };

        });

        for (const key in composites) {
            const composite = composites[key];
            vars.push(composite);

            if (composite.tags.some(tag => tag[0] === "color")) {
                composite.propagateChange = () => {
                    const srgb = composite.value.NonlinearSRGB;
                    const compVars = composite.subVars;

                    compVars[0].value = srgb.r;
                    compVars[1].value = srgb.g;
                    compVars[2].value = srgb.b;
                }
            }
        }

        const getTag = (v, tag) => v.tags.find(([name]) => name === tag);
        const getDependsOn = v => getTag(v, "depend")?.[1];

        const varMap = { };
        vars.forEach(v => {
            varMap[v.varName] = v;
        });
        vars.forEach(v => {
            const dependsOn = getDependsOn(v);
            v.dependsOn = dependsOn;
            if (dependsOn) {
                varMap[dependsOn].dependents.push(v.varName);
            }
        });

        const buildNumber = (v, afterChangeCallback) => ({
            type: "number",
            label: v.uiName,
            name: v.varName,
            value: v.value,
            min: v.min,
            max: v.max,
            step: v.isIntegral ? 1 : 0.001,
            onUpdate: (value, set, panel) => {
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
            },
            register: (registration) => v.registrations.push(registration),
            hidden: v.hidden
        });

        const buildBool = (v, afterChangeCallback) => ({
            type: "toggle",
            label: v.uiName,
            name: v.varName,
            value: !!v.value,
            hidden: v.hidden,
            onUpdate: (checked, panelState) => {
                v.value = checked ? 1 : 0;
                for (const depName of v.dependents) {
                    checked ? panelState[depName]?.show?.() : panelState[depName]?.hide?.();
                }
                afterChangeCallback();
            },
            register: (registration) => v.registrations.push(registration),
            subcontrols: v.dependents.length === 0 ? null : []
        });

        const buildSelect = (v, options, afterChangeCallback) => {
            // TODO more complex option mappings than just enum from 0 up
            return {
                type: "select",
                label: v.uiName,
                name: v.varName,
                options: options.map((label, value) => ({ label, value })),
                value: v.value,
                hidden: v.hidden,
                onUpdate: (value, set, panelState) => {
                    v.value = value;
                    // TODO dependents for selections
                    afterChangeCallback();
                },
                register: (registration) => v.registrations.push(registration)
            }
        };

        const processedComposites = new Set();

        const buildColor = (composite, afterChangeCallback) => {
            if (processedComposites.has(composite)) return null;
            processedComposites.add(composite);

            const compVars = composite.subVars;

            return {
                type: "color_picker",
                label: getUiName(composite.varName),
                name: composite.varName,
                hidden: composite.hidden,
                value: composite.value ?? new Color(new NonlinearSRGB({ red: 1, green: 0, blue: 1})),
                onUpdate: (color, set, panelState, doCallback = true) => {
                    const srgb = color.NonlinearSRGB;

                    compVars[0].value = srgb.r;
                    compVars[1].value = srgb.g;
                    compVars[2].value = srgb.b;

                    if (doCallback) afterChangeCallback();
                },
                register: (registration) => composite.registrations.push(registration),
            };
        };

        const buildControl = (v, afterChangeCallback) => {
            v.hidden = v.dependsOn !== undefined && !varMap[v.dependsOn].value;

            if (getTag(v, "bool")) {
                return buildBool(v, afterChangeCallback);
            }

            if (getTag(v, "color")) {
                if (v.isCompositeSubvar) return null;

                return buildColor(v, afterChangeCallback);
            }

            const selectTag = getTag(v, "select")

            if (selectTag) {
                return buildSelect(v, selectTag[1].split(',').map(s => s.trim()), afterChangeCallback);
            }

            if (v.subVars) return;

            return buildNumber(v, afterChangeCallback);
        };

        const getControlSettings = (afterChangeCallback) => {
            const controls = vars.filter(v => v.showControl)
                .map(v => buildControl(v, afterChangeCallback))
                .filter(v => v);

            const controlMap = {};
            for (const c of controls) {
                controlMap[c.name] = c;
            }

            const topLevelControls = [];

            for (const c of controls) {
                const info = varMap[c.name];
                if (info.dependsOn && controlMap[info.dependsOn]) {
                    const parent = controlMap[info.dependsOn];
                    parent.subcontrols.push(c);
                } else {
                    topLevelControls.push(c);
                }
            }

            return topLevelControls;
        };

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
        const gpuBuffer = $gpu.device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const cpuView = new DataView(cpuBuffer);

        const updateBuffers = () => {
            var position = 0;
            vars.forEach(v => {
                if (v.bytes === 0) return;

                const align = Math.max(...v.aligns);
                if (position % align !== 0) {
                    position = position + (align - position % align);
                }
                wgsl.setters[v.type].call(cpuView, position, v.value, true);
                position += v.bytes;
            });

            $gpu.device.queue.writeBuffer(gpuBuffer, 0, cpuBuffer);
        };

        return {
            group: regexMatch[1],
            binding: regexMatch[2],
            vars: valueProxy(varMap),
            varInfo: varMap,
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

    const module = $gpu.device.createShaderModule({ code: adjustedSource });
    const info = await module.getCompilationInfo();
    if (info.messages.some(m => m.type === "error") || substitutionFailure) {
        return null;
    }
    return {
        module,
        bufferDefinitions: bufferDefinitionsMap
    };
}

