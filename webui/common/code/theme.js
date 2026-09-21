
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
    //if (theme === "volcano") return "glacier";
    //if (theme === "glacier") return "blackboard";
    return theme;
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

$css(`

.theme-panel {
    position: absolute;
    top: 0.2rem;
    right: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    z-index: 1;
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

    const buttons = [];

    themes.forEach(theme => {
        const buttonWrapper = $div(`button-wrapper ${theme}`);

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


    return { dom: [panel.$with(...buttons)] };
}

