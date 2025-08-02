
$css(`

.control-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem;
    background: var(--main-background);
    font-family: var(--main-font);
    color: var(--main-solid);
    max-width: 300px;
    overflow-y: scroll;
}

.control-panel legend {
    line-height: 1rem;
    margin: auto;
    border-bottom: 3px double var(--main-solid);
    padding-top: 0.5rem;
    padding-bottom: 0.2rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
}

.control {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
}

`);

async function createControl(target, spec) {
    await $mod(`control/${spec.type}`, target, [spec]);
}

export async function main(target, name, controls) {
    const id = name.toLowerCase().replace(/\s+/g, '-');

    const container = document.createElement("fieldset");
    container.className = "control-panel";
    container.setAttribute("aria-labelledby", id);

    const legend = document.createElement("legend");
    legend.id = id;
    legend.innerText = name;
    container.appendChild(legend);

    for (const control of controls) {
        await createControl(container, control);
    }

    target.appendChild(container);

    return { replace: true };
}

