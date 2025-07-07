
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    .nothing {
        background-color: var(--main-background);
        width: 100%;
        height: 100%;
    }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

export async function main(target) {
    const backdrop = document.createElement("div");

    backdrop.className = "nothing";

    const load = (modName, args=[]) => {
        return async () => {
            const result = await $mod(modName, target, args);
            if (result?.replace) {
                backdrop.remove();
            }
        }
    };

    await $mod("menu", backdrop, [{
        prompt: load("prompt"),
        row2: load("row"),
        row3: load("row", [3]),
        col2: load("col"),
        col3: load("col", [3]),
        void: load("theme", ["void"]),
        parchment: load("theme", ["parchment"]),
        spinner: load("spinner")
    }]);

    target.appendChild(backdrop);

    return {
        replace: true
    };
}

