
function checkForParentTheme(element, theme) {
    let parent = element.parentElement;
    while (parent) {
        const parentTheme = parent.dataset.theme;

        if (parentTheme) return parentTheme !== theme;

        parent = parent.parentElement;
    }

    return false;
}

function getOppositeTheme(theme) {
    if (theme === "blackboard") return "whiteboard";
    if (theme === "whiteboard") return "blackboard";
    return theme;
}

export function main(target, initialTheme = null) {
    const storedTheme = localStorage.getItem("theme");

    let theme = storedTheme || "blackboard";

    if (initialTheme === "toggle") {
        theme = getOppositeTheme(theme);
    } else {
        theme = initialTheme || theme;
    }

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

