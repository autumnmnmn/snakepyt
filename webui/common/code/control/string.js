
 $css(`

.control.string {
    display: block;
    line-height: 1.5rem;
}

.control.string label {
    color: var(--main-solid);
    line-height: 1em;
    min-height: 1em;
    cursor: text;
    padding-right: 0.5rem;
}

.control.string .copyable-value {
    width: 0;
    display: inline-block;
    vertical-align: bottom;
}

.control.string input[type=text] {
    color: var(--main-solid);
    font-family: var(--main-font);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--main-faded);
    transition: border-color 0.2s ease;
    min-height: 1rem;
    line-height: 1rem;
    width: 10rem;
}

.control.string input[type=text]:focus {
    outline: none;
    border-color: var(--main-transparent);
}

`);

const defaults = {
    label: "x",
    value: "",
    placeholder: "",
    onUpdate: null,
    register: null
};

export async function main(spec, panelState) {
    spec = { ...defaults, ...spec };

    const control = $div("control string");

    // TODO ensure uniqueness more rigorously
    const name = spec.label.toLowerCase().replace(/\s+/g, "-");

    const label = $element("label");
    label.innerText = spec.label + ":";
    label.id = `${name}-label`;

    const copyable_value = $element("span");
    copyable_value.innerText = `${spec.value};\n`;
    copyable_value.classList = "copyable-value";

    copyable_value.setAttribute("aria-hidden", true);

    const input = $element("input");
    input.type = "text";
    input.setAttribute("aria-labelledby", label.id);
    input.value = spec.value;
    input.placeholder = spec.placeholder;
    input.$contextMenu = { override: true };

    const set = (value) => {
        input.value = value;
    };

    input.addEventListener("input", () => {
        copyable_value.innerText = input.value;
        spec.onUpdate?.(input.value, set, panelState);
    });

    const hide = () => {
        control.setAttribute("hidden", "");
    };

    const show = () => {
        control.removeAttribute("hidden");
    };

    const dom = [control.$with(
        label, copyable_value, input
    )];

    const bundle = { dom, set, show, hide };

    spec.register?.(bundle);

    return bundle;
}

