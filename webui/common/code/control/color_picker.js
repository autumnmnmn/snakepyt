
$css(`

.control.color-picker {
    display: block;
}

.control.color-picker label {
    padding-right: 0.5rem;
}

.control.color-picker input[type="color"] {
    border: 1px solid var(--main-solid);
    vertical-align: bottom;
    height: 1.6rem;
    width: 2rem;
}

.control.color-picker input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 0;
}

.control.color-picker input[type="color"]::-webkit-color-swatch {
    border: none;
}

.control.color-picker input[type="color"]::-moz-color-swatch {
    border: none;
}

.control.color-picker select.mode {
    margin-left: 1em;
}

.control.color-picker .raw-controls {
    display: none;
}

.control.color-picker[data-mode="raw"] .raw-controls {
    display: block;
}

`);

import * as Color from "/code/math/color.js"

const defaults = {
    label: "color",
    value: Color.Color.NonlinearSRGB(Color.DebugPurple),
    onUpdate: null,
    register: null
};

// TODO labels

export async function main(spec, panelState) {
    spec = { ...defaults, ...spec };

    const control = $div("control color-picker");

    const name = spec.label.toLowerCase().replace(/\s+/g, "-");

    const label = document.createElement("label");
    label.innerText = spec.label + ":";
    label.id = `${name}-label`;

    const nativePicker = $element("input");
    nativePicker.type = "color";
    nativePicker.value = spec.value.CssColor.cssString;

    control.$contextMenu = {
        items: [
            ["Copy hex", () => navigator.clipboard.writeText(spec.value.NonlinearSRGB.hex)],
            async () => {
                const clipboardContent = await navigator.clipboard.readText();
                if (!/^#[0-9a-fA-F]{6}$/.test(clipboardContent)) return;
                return ["Paste hex", () => {
                    spec.value.set(Color.NonlinearSRGB.fromHex(clipboardContent))
                    spec.onUpdate(spec.value);
                    nativePicker.value = spec.value.CssColor.cssString;
                }]
            },
        ]
    };

    const pickerMode = $element("select");
    pickerMode.classList = "mode";

    [
        { value: "hsv", label: "HSV" },
        { value: "srgb", label: "sRGB" },
        { value: "theme", label: "Theme" },
        { value: "css", label: "CSS" },
        { value: "raw", label: "Raw" },
    ].forEach(item => {
        const option = $element("option");
        option.value = item.value;
        option.textContent = item.label;
        pickerMode.appendChild(option);
    });

    pickerMode.value = "hsv";
    control.dataset.mode = "hsv";

    pickerMode.addEventListener("change", e => {
        control.dataset.mode = e.target.value;
    });

    const colorSpace = $element("select");

    const rawControls = $div("raw-controls");

    const colors = {
        NonlinearSRGB: { type: Color.NonlinearSRGB, label: "Nonlinear sRGB" },
        LinearSRGB: { type: Color.LinearSRGB, label: "Linear sRGB" },
        OkLab: { type: Color.OkLab, label: "OkLab" },
        OkLch: { type: Color.OkLch, label: "OkLch" },
        CIEXYZ: { type: Color.CIEXYZ, label: "CIE XYZ" },
    };

    for (const [key, { type, label }] of Object.entries(colors)) {
        const option = $element("option");
        option.value = key;
        option.textContent = label;
        colorSpace.appendChild(option);
    }

    colorSpace.value = spec.value.type.name;

    const createRawControls = async (type, value) => {
        let params = {};

        if (type === "CssColor") { return; }


        Color[type].params.forEach(paramName => {
            params[paramName] = value[type][paramName];
        });


        const modules = Color[type].params.map(async paramName =>
            (await $mod("control/number", {
                label: paramName,
                value: params[paramName],
                onUpdate: (value) => {
                    params[paramName] = Number(value);

                    spec.value.set(new Color[type](params));
                    spec.onUpdate(spec.value);
                }
            })).dom
        );


        const elements = (await Promise.all(modules)).flat();


        rawControls.replaceChildren(...elements);
    };

    colorSpace.addEventListener("change", e => {
        const key = e.target.value;

        const color = colors[key];

        //console.log(spec.value);
        //console.log(spec.value[key]);

        spec.value.set(spec.value[key]);

        //console.log(spec.value);
        //console.log(color);

        createRawControls(key, spec.value);
    });

    nativePicker.addEventListener("change", e => {
        spec.value.set(Color.NonlinearSRGB.fromHex(e.target.value));
        spec.onUpdate(spec.value);
    });


    createRawControls(colorSpace.value, spec.value);

    //let selectedType = colors[spec.value.type.name].;




// TODO make the Color type properly handle invalidation :3


    spec.register?.({ set: value => {
        nativePicker.value = value.NonlinearSRGB.hex;
        spec.value = value;
        const space = spec.value.type.name === "CssColor" ? "NonlinearSRGB" : spec.value.type.name;
        colorSpace.value = space
        createRawControls(colorSpace.value, spec.value);
    }});

    return { dom: [
        control.$with(
            label, nativePicker,
            pickerMode,
            colorSpace,
            rawControls)
    ] };
}
