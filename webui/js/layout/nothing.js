
$css(`
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

export async function main(target) {
    const backdrop = document.createElement("div");

    backdrop.className = "nothing";
    backdrop.tabIndex = 0;
    backdrop.$ = {
        focusable: true
    };

    const load = (modName, args=[]) => {
        return async () => {
            const result = await $mod(modName, target, args);
            if (result?.replace) {
                backdrop.remove();
            }
        }
    };

    const menuItems = {
        fractal: load("gpu/proj_shift"),
        prompt: load("prompt"),
        row2: load("layout/row"),
        row3: load("layout/row", [3]),
        col2: load("layout/col"),
        col3: load("layout/col", [3]),
        blackboard: load("theme", ["blackboard"]),
        whiteboard: load("theme", ["whiteboard"]),
        spinner: load("spinner"),
        highlight: load("code/highlight")
    }

    const menu = await $mod("control/menu", backdrop, [menuItems]);

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

