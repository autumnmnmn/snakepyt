
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    .nothing {
        background-color: var(--main-background);
        width: 100%;
        height: 100%;
        border-radius: 0.5em;
    }

    .nothing:focus {
        outline: 2px solid var(--main-faded);
        outline-offset: -2px;
    }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

export async function main(target) {
    const backdrop = document.createElement("div");

    backdrop.className = "nothing";
    backdrop.tabIndex = 0;

    const load = (modName, args=[]) => {
        return async () => {
            const result = await $mod(modName, target, args);
            if (result?.replace) {
                backdrop.remove();
            }
        }
    };

    const menuItems = {
        prompt: load("prompt"),
        row2: load("row"),
        row3: load("row", [3]),
        col2: load("col"),
        col3: load("col", [3]),
        blackboard: load("theme", ["blackboard"]),
        whiteboard: load("theme", ["whiteboard"]),
        spinner: load("spinner"),
        highlight: load("highlight")
    }

    const menu = await $mod("menu", backdrop, [menuItems]);

    backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === "o") {
            e.preventDefault();
            e.stopPropagation();
            const rect = backdrop.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            menu.showMenu();
        }
    });

    target.appendChild(backdrop);

    backdrop.focus();

    return {
        replace: true
    };
}

