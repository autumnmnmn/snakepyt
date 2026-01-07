
$css(`
.number {
    display: block;
    line-height: 1.5rem;
    border-left: 1px solid var(--main-faded);
    padding-left: 0.5rem;
}

.number:has(input:focus) {
    border-left: 3px solid var(--main-solid);
    padding-left: calc(0.5rem - 2px);
}

.number label {
    color: var(--main-solid);
    min-height: 1em;
    line-height: 1em;
    cursor: text;
}

.number .copyable-value {
    width: 0;
    display: inline-block;
}

.number input[type=number] {
    background: var(--main-background);
    color: var(--main-solid);
    font-family: var(--main-font);
    transition: border-color 0.2s ease;
    border-bottom: 1px solid var(--main-faded);
    min-height: 1rem;
    line-height: 1rem;
    width: 5rem;
}

.number input[type=number] {
    -webkit-appearance: textfield;
    -moz-appearance: textfield;
    appearance: textfield;
}

.number input[type=number]::-webkit-inner-spin-button,
.number input[type=number]::-webkit-outer-spin-button {
    -webkit-appearnce: none;
}

.number input[type=number]:focus {
    border-color: var(--main-transparent);
}

.number input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    outline: none;
    cursor: pointer;
    overflow: visible;
    margin-top: 0.25rem;
    border: none;
    border-radius: 2px;
}

.number input[type=range]:focus {
    background: none;
}

/* -webkit: Chromium, Safari, Opera */
.number input[type=range]::-webkit-slider-runnable-track {
    background: var(--main-faded);
    height: 2px;
}

.number input[type=range]:focus::-webkit-slider-runnable-track {
    background: var(--main-solid);
}

/* -moz: Firefox */
.number input[type=range]::-moz-range-track {
    background: var(--main-faded);
    height: 2px;
}

.number input[type=range]:focus::-moz-range-track {
    background: var(--main-solid);
}

.number input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 0.5rem;
    height: 1rem;
    border-radius: 2px;
    background: var(--main-solid);
    margin-top: calc(1px - 1rem); /* center the thumb on the track */

}

.number input[type=range]::-moz-range-thumb {
    width: 0.5rem;
    height: 1rem;
    border-radius: 2px;
    border: none; /* cancel default style */
    background: var(--main-solid);
}

`);

const defaults = {
    label: "x",
    min: -1.0,
    max: 1.0,
    limitField: false,
    step: 0.01,
    value: 0,
    onUpdate: null
};

export async function main(target, spec) {
    spec = { ...defaults, ...spec };

    const control = document.createElement("div");
    control.className = "control number";

    // TODO ensure uniqueness more rigorously
    const name = spec.label.toLowerCase().replace(/\s+/g, "-");

    const label = document.createElement("label");
    label.innerText = spec.label;
    label.id = `${name}-label`;

    const label_eq = document.createElement("span");
    label_eq.innerText = " = ";

    const copyable_value = document.createElement("span");
    copyable_value.innerText = `${spec.value};\n`;
    copyable_value.classList = "copyable-value";

    label_eq.setAttribute("aria-hidden", true);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.setAttribute("aria-labelledby", label.id);
    slider.min = spec.min;
    slider.max = spec.max;
    slider.step = spec.step;
    slider.value = spec.value;

    const field = document.createElement("input");
    field.type = "number";
    field.setAttribute("aria-labelledby", label.id);
    if (spec.limitField) {
        field.min = spec.min;
        field.max = spec.max;
    }
    field.step = spec.step;
    field.value = spec.value;

    const play_button = $element("button");
    play_button.innerText = "▶/⏸";
    // todo alt text


    const set = (value) => {
        slider.value = value;
        field.value = value;
    }

    const reset_button = $element("button");
    reset_button.innerText = "⟳";
    reset_button.label = "reset";
    reset_button.addEventListener("click", () => {
        set(spec.value);
        spec.onUpdate?.(spec.value, set);
    });


    slider.addEventListener("input", () => {
        field.value = slider.value;
        copyable_value.innerText = slider.value;
        spec.onUpdate?.(slider.value, set);
    });

    field.addEventListener("input", () => {
        slider.value = field.value;
        copyable_value.innerText = field.value;
        spec.onUpdate?.(field.value, set);
    });

    target.$with(
        control.$with(
            label, label_eq.$with(copyable_value), field,
            play_button, reset_button,
            slider
        )
    );
}

