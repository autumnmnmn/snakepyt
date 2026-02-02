
function checkForParentTheme(element, theme) {
    let parent = element.parentElement;
    while (parent) {
        const parentTheme = parent.dataset.theme;

        if (parentTheme) return parentTheme !== theme;

        parent = parent.parentElement;
    }

    return false;
}

export function main(target, initialTheme = null) {
    const storedTheme = localStorage.getItem("theme");
    let theme = initialTheme || storedTheme || "blackboard";
    target.dataset.theme = theme;

    if (target === document.body) {
        localStorage.setItem("theme", theme);
    }

    if (checkForParentTheme(target, theme)) {
        target.dataset.themeChanged = "";
    } else {
        delete target.dataset.themeChanged;
    }

    return { replace: false };
}

