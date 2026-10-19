
$css(`

.control-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1em;
    padding: 0.5em;
    font-family: var(--main-font);
    color: var(--main-solid);
    overflow-y: scroll;
    height: 100%;
    width: fit-content;
    padding-right: 1em;
}

.control-panel > * {
    max-width: 300px;
}

.control-panel legend {
    line-height: 1em;
    margin: auto;
    border-bottom: 3px double var(--main-solid);
    padding-top: 0.5em;
    padding-bottom: 0.2em;
    padding-left: 0.5em;
    padding-right: 0.5em;
}

.control {
    display: block;
    flex-shrink: 0;
}

.control {
    border-left: 1px solid var(--main-faded);
    padding-left: 0.5em;
}

.control:has(:focus) {
    border-left: 3px solid var(--main-solid);
    padding-left: calc(0.5em - 2px);
}

.control .control, .control .control:has(:focus) {
    border-left: none;
    padding-left: 0;
    padding-top: 0.5em;
}

.control[hidden] {
    display: none;
}

@media (max-width: 768px) {
    .control-panel {
        width: 100%;
        padding-left: calc(0.5em + 10%);
    }

    .control {
        max-width: 60vw;
        width: 60vw;
        position: relative;
        overflow: visible;
        z-index: 1;
    }

    .control::before {
        position: absolute;
        content: "";
        left: -10vw;
        top: 0;
        width: 10vw;
        height: calc(100% + 1em);
    }

    .control::after {
        position: absolute;
        content: "";
        right: -20vw;
        top: 0;
        width: 20vw;
        height: calc(100% + 1em);
        z-index: 0;
    }

    .control-panel legend {
        position: relative;
        left: calc(-11.1% - 0.5em);

        width: calc(111.1% + 1.3em);
        max-width: 100vw;
        margin: 0;
        margin-bottom: 1em;
    }
}

`);

async function createControl(target, spec, state) {
    return await $apply(`control/${spec.type}`, target, spec, state);
}

export async function main(name, controls) {
    const id = name.toLowerCase().replace(/\s+/g, "-");

    const container = document.createElement("fieldset");
    container.className = "control-panel";
    container.setAttribute("aria-labelledby", id);

    const legend = document.createElement("legend");
    legend.id = id;
    legend.innerText = name;
    container.appendChild(legend);

    const controlState = {};

    for (const control of controls) {
        const name = control.name ?? control.label;
        controlState[name] = await createControl(container, control, controlState);
        if (control.hidden) {
            controlState[name].hide?.();
        }

        if (control.origin) {
            if (control.origin.panels === undefined) control.origin.panels = [];

            control.origin.panels.push(controlState);
        }
    }

    container.$contextMenu = { override: true };

    return {
        dom: [container],
        replace: true,
        controls: controlState
    };
}

