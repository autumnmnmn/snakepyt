
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

    const colorType = $element("select");

    const subControls = $div();

    const colors = {
        NonlinearSRGB: { type: Color.NonlinearSRGB, label: "Nonlinear sRGB" },
        LinearSRGB: { type: Color.LinearSRGB, label: "Linear sRGB" },
        OkLab: { type: Color.OkLab, label: "OkLab" },
        OkLch: { type: Color.OkLch, label: "OkLch" },
        CIEXYZ: { type: Color.CIEXYZ, label: "CIE XYZ" },
        CssColor: { type: Color.CssColor, label: "CSS" },
    };

    for (const [key, { type, label }] of Object.entries(colors)) {
        const option = $element("option");
        option.value = key;
        option.textContent = label;
        colorType.appendChild(option);
    }

    colorType.value = spec.value.type.name;

    const createSubControls = async (type, value) => {
        let params = {};

        if (type === "CssColor") { return; /*TODO*/ }

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


        subControls.replaceChildren(...elements);
    };

    colorType.addEventListener("change", e => {
        const key = e.target.value;

        const color = colors[key];

        //console.log(spec.value);
        //console.log(spec.value[key]);

        spec.value.set(spec.value[key]);

        //console.log(spec.value);
        //console.log(color);

        createSubControls(key, spec.value);
    });

    nativePicker.addEventListener("change", e => {
        console.log(e.target.value);
        spec.value.set(Color.NonlinearSRGB.fromHex(e.target.value));
        console.log(spec.value);
        spec.onUpdate(spec.value);
    });


    createSubControls(colorType.value, spec.value);

    //let selectedType = colors[spec.value.type.name].;

/*
const defaults = {
    label: "x",
    min: -1.0,
    max: 1.0,
    limitField: false,
    step: 0.01,
    value: 0,
    onUpdate: null,
    register: null
}
*/


// TODO make the Color type properly handle invalidation :3


    spec.register?.({ set: value => {
        nativePicker.value = value.NonlinearSRGB.hex;
        spec.value = value;
        colorType.value = spec.value.type.name;
        createSubControls(colorType.value, spec.value);
    }});

    return { dom: [
        control.$with(
            label, nativePicker,
            colorType,
            subControls)
    ] };
}
