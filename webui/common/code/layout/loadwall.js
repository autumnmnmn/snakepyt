
$css(`
    .loadwall .box {
        padding-top: 1rem;
        padding-left: 2rem;
        padding-right: 2rem;
        border: 1px solid var(--main-solid);
        background-color: var(--main-faded);
    }

    .loadwall * {
        display: block;
        margin: auto;
        width: fit-content;
        margin-bottom: 0.5rem;
    }

    .loadwall .status {
    }
`);

export async function main(argumentString) {
    const backdrop = $div("loadwall");

    const status = $div("status");
    status.textContent = "";
    status.display = "none";

    const box = $div("box");

    const label = $element("label");

    const button = $element("button");
    button.textContent = "load";
    button.classList = "inverted";

    // TODO unique id generation helper in core.js
    // then associate the label here w/ the button

    const args = argumentString.split("|").map(arg => arg.trim());

    const text = args[0];
    const module = args[1];
    const containerClass = args[2];

    const container = $div(containerClass);


    label.textContent = text;

    let moduleResult = null;
    let loadRequested = false;

    function emplace() {
        const startHeight = backdrop.getBoundingClientRect().height;

        container.append(...moduleResult.dom);
        backdrop.replaceWith(container);

        const endHeight = container.getBoundingClientRect().height;

        const animation = container.animate(
            [ { height: `${startHeight}px` }, { height: `${endHeight}px` }],
            {
                duration: 250,
                easing: "ease-out"
            }
        );

        animation.finished.then(() => {
            container.style.height = "";
        });
    }

    async function load() {
        moduleResult = await $mod(module);

        if (loadRequested) {
            emplace();
        }
    }

    load();

    button.addEventListener("click", () => {
        loadRequested = true;

        if (moduleResult !== null) {
            emplace();
            return;
        }

        // TODO failed status

        button.style.display = "none";
        status.style.display = "block";
        status.textContent = "loading...";
    });

    return {
        dom: [backdrop.$with(box.$with(label, button, status))],
        replace: true
    };
}


