
$css(`
.number {

}

.number label {
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--main-solid);
    min-height: 1.2rem;
    line-height: 1.2rem;
}

.number input[type=number] {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--main-faded);
    border-radius: 3px;
    background: var(--main-background);
    color: var(--main-solid);
    font-family: var(--main-font);
    font-size: 0.9rem;
    width: 90px;
    outline: none;
    transition: border-color 0.2s ease;
}

.number input[type=number]::-webkit-outer-spin-button,
.number input[type=number]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    opacity: 1;
    position: relative;
    width: 20px;
    height: 50%;
    background: var(--main-background);
    border-left: 1px solid var(--main-faded);
    cursor: pointer;
    display: block;
}

.number input[type=number]::-webkit-inner-spin-button {
    background-image:
        linear-gradient(45deg, transparent 40%, var(--main-solid) 40%, var(--main-solid) 60%, transparent 60%),
        linear-gradient(-45deg, transparent 40%, var(--main-solid) 40%, var(--main-solid) 60%, transparent 60%);
    background-size: 6px 6px;
    background-position: 7px 6px, 7px 6px;
    background-repeat: no-repeat;
}

.number input[type=number]::-webkit-outer-spin-button {
    background-image:
        linear-gradient(135deg, transparent 40%, var(--main-solid) 40%, var(--main-solid) 60%, transparent 60%),
        linear-gradient(-135deg, transparent 40%, var(--main-solid) 40%, var(--main-solid) 60%, transparent 60%);
    background-size: 6px 6px;
    background-position: 7px 6px, 7px 6px;
    background-repeat: no-repeat;
}

.number input[type=number]::-webkit-outer-spin-button:hover,
.number input[type=number]::-webkit-inner-spin-button:hover {
    background-color: var(--main-faded);
}

.number input[type=number] {
    -moz-appearance: spinner-textfield;
}

.number input[type=number]:focus {
    border-color: var(--main-transparent);
}

.number input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: var(--main-faded);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    overflow: visible;
}

.number input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--main-solid);
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.number input[type=range]::-webkit-slider-thumb:hover {
    background: var(--main-transparent);
}

.number input[type=range]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--main-solid);
    cursor: pointer;
    border: none;
    transition: background-color 0.2s ease;
}

.number input[type=range]::-moz-range-thumb:hover {
    background: var(--main-transparent);
}

.number .input-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.number input[type=range] {
    flex: 1;
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

    const label = document.createElement("label");
    label.textContent = spec.label;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = spec.min;
    slider.max = spec.max;
    slider.step = spec.step;
    slider.value = spec.value;

    const field = document.createElement("input");
    field.type = "number";
    if (spec.limitField) {
        field.min = spec.min;
        field.max = spec.max;
    }
    field.step = spec.step;
    field.value = spec.value;

    const set = (value) => {
        slider.value = value;
        field.value = value;
    }

    slider.addEventListener('input', () => {
        field.value = slider.value;
        spec.onUpdate?.(slider.value, set);
    });

    field.addEventListener('input', () => {
        slider.value = field.value;
        spec.onUpdate?.(field.value, set);
    });

    control.appendChild(label);
    control.appendChild(slider);
    control.appendChild(field);
    target.appendChild(control);
}

