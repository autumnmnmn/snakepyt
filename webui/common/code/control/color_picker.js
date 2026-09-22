
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

.control.color-picker .subcontrols
{
    display: none;
}

.control.color-picker[data-mode="raw"] .subcontrols.raw {
    display: block;
}

.control.color-picker[data-mode="theme"] .subcontrols.theme {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
}

.control.color-picker[data-mode="hsv"] .subcontrols.hsv {
    display: block;
}

.control.color-picker[data-mode="css"] .subcontrols.css {
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

// TODO every picker type needs to update all the others when its value is set

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

    nativePicker.addEventListener("change", e => {
        spec.value.set(Color.NonlinearSRGB.fromHex(e.target.value));
        apply();
    });

    control.$contextMenu = {
        items: [
            ["Copy hex", () => navigator.clipboard.writeText(spec.value.NonlinearSRGB.hex)],
            async () => {
                const clipboardContent = await navigator.clipboard.readText();
                if (!/^#[0-9a-fA-F]{6}$/.test(clipboardContent)) return;
                return ["Paste hex", () => {
                    spec.value.set(Color.NonlinearSRGB.fromHex(clipboardContent))
                    apply();
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
    ]
    .forEach(item => {
        const option = $element("option");
        option.value = item.value;
        option.textContent = item.label;
        pickerMode.appendChild(option);
    });

    // TODO from spec, + settable
    pickerMode.value = "hsv";
    control.dataset.mode = "hsv";

    pickerMode.addEventListener("change", e => {
        control.dataset.mode = e.target.value;
        if (e.target.value === "hsv") renderArea();
        if (e.target.value === "raw") createRawControls(colorSpace.value, spec.value);
    });

    const hsvControls = $div("subcontrols hsv");

    // === Raw ===

    const rawControls = $div("subcontrols raw");

    const colorSpace = $element("select");

    const colors = {
        NonlinearSRGB: { type: Color.NonlinearSRGB, label: "Nonlinear sRGB" },
        LinearSRGB: { type: Color.LinearSRGB, label: "Linear sRGB" },
        OkLab: { type: Color.OkLab, label: "OkLab" },
        OkLch: { type: Color.OkLch, label: "OkLch" },
        CIEXYZ: { type: Color.CIEXYZ, label: "CIE XYZ" },
        HSV: { type: Color.HSV, label: "HSV" },
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
                    syncUI();
                    spec.onUpdate?.(spec.value);
                }
            })).dom
        );

        const elements = (await Promise.all(modules)).flat();

        rawControls.replaceChildren(colorSpace, ...elements);
    };

    colorSpace.addEventListener("change", e => {
        const key = e.target.value;

        const color = colors[key];

        spec.value.set(spec.value[key]);

        syncUI();

        createRawControls(key, spec.value);
    });

    createRawControls(colorSpace.value, spec.value);

    // === Theme ===

    const themeControls = $div("subcontrols theme");

    const themePicker = $element("select");
    const themeColorPicker = $element("select");

    const themes = [
        { value: "", label: "Current" },
        { value: "blackboard", label: "Blackboard" },
        { value: "whiteboard", label: "Whiteboard" },
        { value: "volcano", label: "Volcano" },
        { value: "glacier", label: "Glacier" }
    ];

    const themeColors = [ // TODO add alpha to color library to make more theme colors relevant
        { value: "", label: "" },
        { value: "var(--main-solid)", label: "Main Solid" },
        { value: "var(--main-background)", label: "Main Background" },
    ];

    for (const entry of themes) {
        const option = $element("option");
        option.value = entry.value;
        option.textContent = entry.label;
        themePicker.appendChild(option);
    }

    themePicker.value = "";

    for (const entry of themeColors) {
        const option = $element("option");
        option.value = entry.value;
        option.textContent = entry.label;
        themeColorPicker.appendChild(option);
    }

    themeControls.$with(themePicker, themeColorPicker);

    themePicker.addEventListener("change", e => {
        themePicker.dataset.theme = e.target.value;
        if (themeColorPicker.value !== "") {
            spec.value.set(new Color.CssColor({ cssString: themeColorPicker.value, element: themePicker }));
            apply();
        } else {
            themePicker.removeAttribute("data-theme");
        }
    });

    themeColorPicker.addEventListener("change", e => {
        if (e.target.value !== "") {
            spec.value.set(new Color.CssColor({ cssString: e.target.value, element: themePicker }));
            apply();
        }
    });

    // TODO CssColors need to always be watching for theme changes... the theme picker module should run the observer and the CssColors should register themselves with it, if it exists. If they find their reference element is detached they should unregister ofc. hmmm no even then they could pile up... each one needs a "provenance id" and on registration they supercede each other

    // === HSV ===


    function renderArea() {

    }


    // === CSS ===

    const cssControls = $div("subcontrols css");

    const cssInput = $element("input");
    cssInput.type = "text";
    cssInput.value = spec.value.CssColor.cssString;


    cssControls.$with(cssInput);

    // TODO



    // TODO make the Color type properly handle mutability / invalidation

    function syncUI() {
        // TODO hsv

        nativePicker.value = spec.value.NonlinearSRGB.hex;

        cssInput.value = spec.value.CssColor.cssString;

        if (cssInput.value.startsWith("var(")) {
            themeColorPicker.value = cssInput.value;
        } else {
            themeColorPicker.value = "";
        }
    }

    function apply() {
        renderArea();
        syncUI();
        if (control.dataset.mode === "raw") createRawControls(colorSpace.value, spec.value);
        spec.onUpdate?.(spec.value);
    }


    spec.register?.({ set: value => {
        nativePicker.value = value.NonlinearSRGB.hex;
        spec.value = value;

        // TODO better logic here
        const space = spec.value.type.name === "CssColor" ? "NonlinearSRGB" : spec.value.type.name;
        colorSpace.value = space;

        apply();
    }});

    syncUI();

    return { dom: [
        control.$with(
            label, nativePicker,
            pickerMode,
            rawControls,
            themeControls,
            hsvControls,
            cssControls
        )
    ] };
}

