
$css(`
    .context-backdrop {
        position: absolute;
        margin: 0;
        padding: 0;
        top: 0;
        left: 0;
        border: none;
        width: 100%;
        height: 100%;
        display: none;
        pointer-events: none;
    }

    .context-menu {
        position: fixed;
        background-color: var(--main-background);
        border: 1px solid var(--main-faded);
        border-radius: 2px;
        min-width: 8rem;
        font-size: 0.875rem;
        user-select: none;
        z-index: 10;
        pointer-events: auto;
    }

    .context-menu[data-centered] {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
    }

    .context-menu-item {
        padding: 0.2rem 0.5rem;
        cursor: pointer;
        white-space: nowrap;
        color: var(--main-solid);
        background-color: var(--main-background);
        display: block;
        width: 100%;
        border-radius: 0;
        text-align: left;
        height: auto;
    }

    .context-menu-item:focus {
        outline: none;
        background-color: var(--main-faded);
    }

    .context-menu-item:hover {
        background-color: var(--main-faded);
    }

    .context-menu-item.disabled {
        opacity: 0.5;
        cursor: default;
    }

    .context-menu-item.disabled:hover {
        background-color: transparent;
    }

    .context-menu-separator {
        height: 1px;
        background-color: var(--main-faded);
        margin: 0.25rem 0;
    }
`);

function collectItems(element) {
    const items = [];

    for (let node = element; node; node = node.parentNode) {
        if (node.$contextMenu !== null && node.$contextMenu !== undefined) {
            const nodeItems = $actualize(node.$contextMenu.items);
            for (const item of nodeItems.map($actualize)) {
                if (Array.isArray(item) && item[0] && Array.isArray(item[0])) {
                    items.push(...item);
                }
                else {
                    items.push(item);
                }
            }

            if (node.$contextMenu.override) {
                break;
            }
        }
    }

    return items;
}

var menuTarget = document.body;

const backdrop = document.createElement("div");
backdrop.className = "context-backdrop";

const menu = document.createElement("div");
menu.$ = {};
menu.className = "context-menu";
menu.setAttribute("role", "menu");
menu.setAttribute("aria-orientation", "vertical");

menu.addEventListener("focusout", (e) => {
    if (menu.contains(e.relatedTarget)) return;

    backdrop.style.display = "none";
    menu.$.previousFocus?.focus();
});

menu.addEventListener("keydown", (e) => {
    if (!["ArrowDown", "ArrowUp", "j", "k", "Escape"].includes(e.key)) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
        backdrop.style.display = "none";
        menu.$.previousFocus?.focus();
        return;
    }

    const currentItem = document.activeElement;
    if (!menu.contains(currentItem)) {
        menu.firstElementChild?.focus();
        return;
    }

    let nextItem;
    if (e.key === "ArrowDown" || e.key === "j") {
        nextItem = currentItem.nextElementSibling || menu.firstElementChild;
    } else {
        nextItem = currentItem.previousElementSibling || menu.lastElementChild;
    }

    nextItem.focus();
});

backdrop.appendChild(menu);

const showMenu = (target, position = null) => {
    const body = document.fullscreenElement || document.body;
    body.appendChild(backdrop);
    backdrop.style.display = "block";

    menu.$.previousFocus = document.activeElement;
    menu.firstChild?.focus();

    const bounds = target.getBoundingClientRect();

    if (!position) {
        menu.dataset.centered = "";
        menu.style.left = "";
        menu.style.top = "";
        return;
    }

    const {x,y} = position;

    delete menu.dataset.centered;
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    const rect = menu.getBoundingClientRect();

    if (rect.right > bounds.right) {
        menu.style.left = (x - rect.width) + "px";
    }
    if (rect.left < bounds.left) {
        menu.style.left = bounds.left + "px";
    }
    if (rect.bottom > bounds.bottom) {
        menu.style.top = (y - rect.height) + "px";
    }
    if (rect.top < bounds.top) {
        menu.style.top = bounds.top + "px";
    }
};

document.addEventListener("contextmenu", (e) => {
    menu.replaceChildren();

    const items = collectItems(e.target);

    if (items.length === 0) return;

    items.forEach(item => {
        if (!item) return;
        if (item === "separator") { // TODO improve this
            const separator = document.createElement("div");
            separator.className = "context-menu-separator";
            menu.appendChild(separator);
            return;
        }

        const menuItem = document.createElement("button");
        menuItem.className = "context-menu-item";
        menu.setAttribute("role", "menuItem");
        menu.setAttribute("tabIndex", "-1");

        menuItem.textContent = item[0];

        const select = async () => {
            backdrop.style.display = "none";
            menu.$.previousFocus?.focus();

            await item[1]();
        };

        menuItem.onclick = select;
        menuItem.addEventListener("keydown", (e) => {
            if (e.key === "o" || e.key === "Enter") {
                select();
                e.stopPropagation();
            }
        });

        menu.appendChild(menuItem);
    });

    e.preventDefault();

    showMenu(e.target, {x: e.clientX, y: e.clientY});
});

document.$showMenu = (target) => {
    menu.replaceChildren();

    const items = collectItems(target);

    if (items.length === 0) return;

    items.forEach(item => {
        if (!item) return;
        if (item === "separator") { // TODO improve this
            const separator = document.createElement("div");
            separator.className = "context-menu-separator";
            menu.appendChild(separator);
            return;
        }

        const menuItem = document.createElement("button");
        menuItem.className = "context-menu-item";
        menu.setAttribute("role", "menuItem");
        menu.setAttribute("tabIndex", "-1");

        menuItem.textContent = item[0];

        const select = async () => {
            backdrop.style.display = "none";
            menu.$.previousFocus?.focus();

            await item[1]();
        };

        menuItem.onclick = select;
        menuItem.addEventListener("keydown", (e) => {
            if (e.key === "o" || e.key === "Enter") {
                select();
                e.stopPropagation();
            }
        });

        menu.appendChild(menuItem);
    });

    showMenu(target);
};

