
export async function main(target) {
    const container = document.createElement('div');

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '...';

    async function handleLoad() {
        const inputValue = input.value.trim();
        const inputSplit = inputValue.split(/\s+/);
        const moduleName = inputSplit[0];
        const args = inputSplit.slice(1);

        const result = await $mod(moduleName, target, args);
        if (result?.replace) {
            container.remove();
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

    return {
        replace: true
    };
}

