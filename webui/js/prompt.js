
export function main(target) {
    const container = document.createElement('div');

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '...';

    async function handleLoad() {
        const inputValue = input.value.trim();
        const inputSplit = inputValue.split(/\s+/);
        const moduleName = inputSplit[0];
        const args = inputSplit.slice(1);

        try {
            const module = await import(`/${moduleName}.js`);
            if ("main" in module) {
                const result = await module.main(target, ...args);
                if (result?.targets?.length) {
                    for (const targetElement of result.targets) {
                        main(targetElement);
                    }
                    container.remove();
                }
            }

        } catch (error) {
            console.error('Failed to load module:', error.message);
        }
    }

    input.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            handleLoad();
        }
    });

    container.appendChild(input);
    target.appendChild(container);
    input.focus();
}

