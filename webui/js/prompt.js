
export async function main(target) {
    const container = $div();

    const input = $element("input");
    input.type = "text";
    input.placeholder = "...";

    async function handleLoad() {
        const inputValue = input.value.trim();
        const inputSplit = inputValue.split(/\s+/);
        const moduleName = inputSplit[0];
        const args = inputSplit.slice(1);

        const result = await $mod(moduleName, container.parentNode, args);
        if (result?.replace) {
            container.remove();
        }
    }

    input.addEventListener("keypress", async (e) => {
        if (e.key === "Enter") {
            handleLoad();
        }
    });

    target.$with(container.$with(input));

    input.focus();

    return {
        replace: true
    };
}

