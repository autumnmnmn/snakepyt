
function checkForParentTheme(element, theme) {
    let parent = element.parentElement;
    while (parent) {
        const parentTheme = parent.dataset.theme;

        if (parentTheme) return parentTheme !== theme;

        parent = parent.parentElement;
    }

    return false;
}

function checkForParentFont(element, font) {
    let parent = element.parentElement;
    while (parent) {
        const parentFont = parent.dataset.font;

        if (parentFont) return parentFont !== font;

        parent = parent.parentElement;
    }

    return false;
}

function getOppositeTheme(theme) {
    if (theme === "blackboard") return "whiteboard";
    if (theme === "whiteboard") return "blackboard";
    //if (theme === "volcano") return "glacier";
    //if (theme === "glacier") return "blackboard";
    return theme;
}

function getOppositeFont(font) {
    if (font === "mono") return "serif";
    if (font === "serif") return "mono";
    return font;
}

export function applyTheme(target, initialTheme = null) {
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

export function applyFont(target, initialFont = null) {
    const storedFont = localStorage.getItem("font");

    let font = storedFont || "mono";

    if (initialFont === "toggle") {
        font = getOppositeFont(font);
    } else {
        font = initialFont || font;
    }

    target.dataset.font = font;

    if (target === document.body) {
        localStorage.setItem("font", font);
    }

    if (checkForParentFont(target, font)) {
        target.dataset.fontChanged = "";
    } else {
        delete target.dataset.fontChanged;
    }

    return { replace: false };
}

$css(`

.theme-panel {
    position: absolute;
    top: 0.2rem;
    right: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    z-index: 1;
    font-size: 1rem;
}

.theme-panel button {
    color: var(--main-solid);
    background-color: var(--main-background);
    border-radius: 0.2rem;
    width: 1.5rem;
    height: 1.5rem;
    line-height: 1.6rem;
    padding-left: 0;
    padding-right: 0;
    padding-top: 0;
    padding-bottom: 0;
    user-select: none;
}

[data-theme="whiteboard"] .theme-panel .button-wrapper.whiteboard {
}

[data-theme="blackboard"] .theme-panel button[data-theme="blackboard"],
[data-theme="whiteboard"] .theme-panel button[data-theme="whiteboard"],
[data-theme="volcano"] .theme-panel button[data-theme="volcano"],
[data-theme="glacier"] .theme-panel button[data-theme="glacier"]
{
    text-decoration: underline;
    border: 1px solid var(--main-faded);
    line-height: 1.5rem;
}

`, true)

const defaults = {
};

export async function main(spec, panelState) {
    spec = { ...defaults, ...spec };

    const panel = $div("theme-panel");

    const themes = [
        "whiteboard",
        "blackboard",
        //"volcano",
        //"glacier"
    ];

    const fonts = [
        "mono",
        "serif"
    ];

    const buttons = [];

    themes.forEach(theme => {
        const buttonWrapper = $div(`button-wrapper`);

        const button = document.createElement("button");
        button.innerText = theme[0].toUpperCase();
        button.setAttribute("aria-label", theme);
        button.title = `set theme: ${theme}`;
        button.addEventListener("click", () => {
            applyTheme(document.body, theme);
        });
        button.dataset.theme = theme;
        buttons.push(buttonWrapper.$with(button));
    });

    fonts.forEach(font => {
        const buttonWrapper = $div(`button-wrapper`);

        const button = document.createElement("button");
        button.innerText = font[0].toUpperCase();
        button.setAttribute("aria-label", font);
        button.title = `set font: ${font}`;
        button.addEventListener("click", () => {
            applyFont(document.body, font);
        });
        button.dataset.font = font;
        buttons.push(buttonWrapper.$with(button));
    });


    return { dom: [panel.$with(...buttons)] };
}

