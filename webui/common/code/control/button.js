
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

export async function main(spec, panelState) {
    spec = { ...defaults, ...spec };

    const control = document.createElement("div");
    control.className = "control button";

    const button = document.createElement("button");
    button.innerText = spec.label;
    button.setAttribute("aria-label", spec.label);
    button.addEventListener("click", () => {
        spec.action(panelState);
    });

    return { dom: [control.$with(button)] };
}

