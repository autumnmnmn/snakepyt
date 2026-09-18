
$css(`

.select .copyable-value {
    width: 0;
    display: inline-block;
    vertical-align: bottom;
}

.select label {
    padding-right: 0.5rem;
}

`);

export function option(label, value) { return { label, value }; }

const defaults = {
    label: "x",
    options: [option("label", "value")],
    value: "value",
    onUpdate: null,
    register: null
};

export async function main(spec, panelState) {
    spec = { ...defaults, ...spec };

    const control = $div("control select");

    // TODO ensure uniqueness more rigorously
    const name = spec.label.toLowerCase().replace(/\s+/g, "-");

    const label = $element("label");
    label.innerText = spec.label + ":";
    label.id = `${name}-label`;

    const copyable_value = $element("span");
    copyable_value.innerText = `${spec.value};\n`;
    copyable_value.classList = "copyable-value";

    const select = $element("select")
    select.setAttribute("aria-labelledby", label.id);
    if (spec.limitselect) {
        select.min = spec.min;
        select.max = spec.max;
    }
    select.step = spec.step;
    select.value = spec.value;

    const optionElements = spec.options.map(option => {
        const element = $element("option");
        element.value = option.value;
        element.textContent = option.label;
        return element;
    });

    select.$with(...optionElements);

    // todo alt text


    const set = (value) => {
        select.value = value;
    }

    select.addEventListener("input", () => {
        copyable_value.innerText = select.value;
        spec.onUpdate?.(select.value, set, panelState);
    });

    const dom = [control.$with(
        label, copyable_value, select
    )];

    const hide = () => {
        control.setAttribute("hidden", "");
    }

    const show = () => {
        control.removeAttribute("hidden");
    }

    if (spec.subcontrols !== null) {
        for(const subcontrol of spec.subcontrols) {
            const name = subcontrol.name ?? subcontrol.label;
            panelState[name] = await $apply(`control/${subcontrol.type}`, control, subcontrol, panelState);
            if (subcontrol.hidden) {
                panelState[name].hide?.();
            }
        }
    }

    // set dependent states
    spec.onUpdate(spec.value, set, panelState, false);

    const bundle = { dom, set, show, hide };

    // TODO
    // without a deregistration method, this is a leak that fucks w/ the gc
    // specifically if some registrar ever has a ton of duplicate controls spun up & discarded
    // in practice this probably doesn't happen to a degree that matters
    spec.register?.(bundle);

    return bundle;
}

