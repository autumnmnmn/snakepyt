
import { Color, LinearSRGB } from "/code/math/color.js"

const defaults = {
    label: "color",
    value: new Color(new LinearSRGB({ red: 1, green: 0, blue: 0 })),
    onUpdate: null,
    register: null
};

export async function main(spec, panelState) {
    console.log(spec);
    spec = { ...defaults, ...spec };

    const control = document.createElement("div");
    control.className = "control color-picker";

    const button = document.createElement("button");
    button.innerText = spec.label;
    button.setAttribute("aria-label", spec.label);
    button.addEventListener("click", () => {
        spec.onUpdate(new Color(new LinearSRGB({ red: 1, green: 0, blue: 0 })))
    });

    console.log(spec);

    return { dom: [control.$with(button)] };
}
