
$css(`

.control-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--main-background);
    border: 1px solid var(--main-faded);
    border-radius: 4px;
    font-family: var(--main-font);
    color: var(--main-solid);
    max-width: 300px;
}

.control {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

`);

async function createControl(target, spec) {
    await $mod(`control/${spec.type}`, target, [spec]);
}

export async function main(target, controls) {
    const container = document.createElement('div');
    container.className = 'control-panel';

    for (const control of controls) {
        await createControl(container, control);
    }

    target.appendChild(container);

    return { replace: true };
}

