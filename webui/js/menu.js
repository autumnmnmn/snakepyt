const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    .context-menu {
        position: fixed;
        background-color: var(--main-background);
        border: 1px solid var(--main-faded);
        border-radius: 2px;
        padding: 0.25rem 0;
        min-width: 8rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        font-size: 0.875rem;
        user-select: none;
    }

    .context-menu-item {
        padding: 0.5rem 1rem;
        cursor: pointer;
        white-space: nowrap;
        color: var(--main-solid);
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
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

let activeMenu = null;

function closeMenu() {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}

function showMenu(x, y, items, containerElement = null) {
    closeMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    // Handle both old format and new string->action format
    const menuItems = Array.isArray(items) ? items : Object.entries(items);

    menuItems.forEach(item => {
        if (item === null || item === '-' || item[0] === '-') {
            const separator = document.createElement('div');
            separator.className = 'context-menu-separator';
            menu.appendChild(separator);
            return;
        }

        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';

        menuItem.textContent = item[0];
        menuItem.onclick = async () => {
            closeMenu();
            await item[1]();
        };
        menu.appendChild(menuItem);
    });

    // Position menu
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    document.body.appendChild(menu);
    activeMenu = menu;

    // Adjust position if menu goes off-screen
    const rect = menu.getBoundingClientRect();
    const bounds = containerElement ? containerElement.getBoundingClientRect() : {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight
    };

    if (rect.right > bounds.right) {
        menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.left < bounds.left) {
        menu.style.left = bounds.left + 'px';
    }
    if (rect.bottom > bounds.bottom) {
        menu.style.top = (y - rect.height) + 'px';
    }
    if (rect.top < bounds.top) {
        menu.style.top = bounds.top + 'px';
    }

    return menu;
}

// Close menu on outside click or escape
document.addEventListener('click', (e) => {
    if (activeMenu && !activeMenu.contains(e.target)) {
        closeMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMenu();
    }
});

export function main(target, ...args) {
    // Register context menu on target
    target.addEventListener('contextmenu', (e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();

        // Default menu items
        const defaultItems = {
            'Inspect': () => console.log('Inspect clicked'),
            '-': null,
            'Reload': () => location.reload()
        };

        // Use provided items or defaults
        let items = defaultItems;
        if (args.length > 0 && args[0]) {
            items = args[0];
        }

        showMenu(e.clientX, e.clientY, items, target);
    });

    return {
        replace: false,
        showMenu: (x, y, items) => showMenu(x, y, items, target),
        closeMenu
    };
}

