
import "/code/gpu/webgpu.js";
import * as wgsl from "/code/gpu/lang/wgsl.js";
import { greek } from "/code/math/math.js";
import "/code/math/constants.js";

const constants = {
    pi: $tau / 2,
    tau: $tau
}

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
        set: (_, key, value) => { varMap[key].value = value; return true; }
    })
}

// TODO: make this more debuggable lol
// var_name: type, // hard? min to hard? max = default $various $optional $tags
// [0: full match, 1: varname, 2: type, 3: comment, 4: hardmin, 5: min, 6: hardmax, 7: max, 8: default value, 9: tags]
const VAR_RE = /^\s*(\w+)\s*:\s*(\w+),?\s*(?:(\/\/)\s*(?:(?:(hard)\s+)?([\w.+-]+)\s+to\s+(?:(hard)\s+)?([\w.+-]+)(?:\s*=\s*([\w.+-,]+))?)?)?\s*((?:\$(?:\w+)(?:\([^\)]*\))?\s*?)*)\s*$/;

const TAG_RE = /\$(\w+)(?:\(([^)]*)\))?/g;

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
                const composite_subvars = wgsl.compositeTypes[type].map((member, index) => ({
                    varName: `${parsed[1]}_${member.name}`,
                    type: member.type,
                    uiName: `${getUiName(parsed[1])}.${member.name}`,
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
                    tags: tags,
                    dependents: [],
                    isComposite: true,
                    parentName: parsed[1]
                }));
                composites[parsed[1]] = composite_subvars;
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
                tags: tags,
                dependents: [],
                isComposite: false
            };
        });

        const getTag = (v, tag) => v.tags.find(([name]) => name === tag);
        const getDependsOn = v => getTag(v, "depend")?.[1];

        const varMap = {};
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
            }
        });

        const buildColor = (composite, afterChangeCallback) => {
            // TODO unpack like [v_r, v_g, v_b] = composite;
            return {
                type: "color",
                // TODO
            };
        };

        const buildControl = (v, afterChangeCallback) => {
            v.hidden = v.dependsOn !== undefined && !varMap[v.dependsOn].value;

            if (getTag(v, "bool")) {
                return buildBool(v, afterChangeCallback);
            }

            if (getTag(v, "color")) {
                // TODO
                // build a color control for composites[v.parentName] but only if no such control has been
                // built yet
            }

            return buildNumber(v, afterChangeCallback);
        };

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
        const gpuBuffer = $gpu.device.createBuffer({
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

