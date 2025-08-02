
$css(`
    .nothing {
        background-color: var(--main-background);
        width: 100%;
        height: 100%;
        border-radius: 0;
    }

    .nothing:focus {
        outline: 2px solid var(--main-faded);
        outline-offset: -2px;
        outline-radius: 0;
    }
`);

export async function main(target) {
    const backdrop = document.createElement("div");

    backdrop.className = "nothing";
    backdrop.$ = {
        focusable: true
    };

    backdrop.tabIndex = 0;
    backdrop.setAttribute("role", "button");
    backdrop.setAttribute("aria-label", "Empty space. Press enter for a menu of modules to load.");

    const load = (modName, args=[]) => {
        return async () => {
            const result = await $mod(modName, target, args);
            if (result?.replace) {
                backdrop.remove();
            }
        }
    };

    const noth = await $prepMod("layout/nothing");
    const noth2 = {content: [noth, noth]};
    const noth3 = {content: [noth, noth, noth]};

    const menuItems = {
        fractal: load("gpu/proj_shift"),
        prompt: load("prompt"),
        row2: load("layout/split", [noth2]),
        row3: load("layout/split", [noth3]),
        col2: load("layout/split", [{...noth2, orientation: "col"}]),
        col3: load("layout/split", [{...noth3, orientation: "col"}]),
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

