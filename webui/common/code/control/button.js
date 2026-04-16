
$css(`

.button {
    display: block;
    line-height: 1.5rem;
    border-left: 1px solid var(--main-faded);
    padding-left: 0.5rem;
}

.button label {
    color: var(--main-solid);
    line-height: 1em;
    min-height: 1em;
}

.button button {
    background: var(--main-background);
    color: var(--main-solid);
    font-family: var(--main-font);
    border: 1px solid var(--main-faded);
    border-radius: 2px;
    padding: 0.1rem 0.5rem;
    min-height: 1rem;
    line-height: 1rem;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
}

.button button:hover {
    border-color: var(--main-solid);
}

.button button:focus {
    outline: none;
    border-color: var(--main-solid);
}

.button button:active {
    background: var(--main-faded);
}

`);

const defaults = {
    label: "button",
    action: () => {}
};

export async function main(target, spec, panelState) {
    spec = { ...defaults, ...spec };

    const control = document.createElement("div");
    control.className = "control button";

    const label = document.createElement("label");
    label.innerText = spec.label;

    const button = document.createElement("button");
    button.innerText = spec.label;
    button.setAttribute("aria-label", spec.label);
    button.addEventListener("click", () => {
        spec.action(panelState);
    });

    target.$with(
        control.$with(button)
    );
}

