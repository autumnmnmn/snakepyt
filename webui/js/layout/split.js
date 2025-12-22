
$css(`
    .split {
        display: flex;
        flex-direction: row;
        height: 100%;
        width: 100%;
        overflow: visible;
        padding: 0rem;
    }

    [theme-changed] > .split {
        padding: 0.5rem;
    }

    .split[orientation=row] {
        flex-direction: row;
    }

    .split[orientation=col] {
        flex-direction: column;
    }

    .split > .splitter {
        background-color: var(--main-faded);
        user-select: none;
        -webkit-user-select: none;
        overflow: visible;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
        -webkit-touch-callout: none;
        -webkit-user-drag: none;
    }

    .split[orientation=row] > .splitter {
        width: 1px;
        cursor: col-resize;
    }

    .split[orientation=col] > .splitter {
        height: 1px;
        cursor: row-resize;
    }

    .split > .splitter::before {
        content: "";
        position: relative;
        display: inline-block;
        pointer-events: auto;
    }

    .split[orientation=row] > .splitter::before {
        top: 0;
        left: calc(0px - var(--panel-margin));
        width: calc(var(--panel-margin) * 2);
        height: 100%;
    }

    .split[orientation=col] > .splitter::before {
        left: 0;
        top: calc(0px - var(--panel-margin));
        height: calc(var(--panel-margin) * 2);
        width: 100%;
    }

    .split[orientation=row] > :first-child {
        margin-right: var(--panel-margin);
        width: calc(var(--current-portion) - 0.5px - var(--panel-margin));
    }

    .split[orientation=col] > :first-child {
        margin-bottom: var(--panel-margin);
        height: calc(var(--current-portion) - 0.5px - var(--panel-margin));
    }

    .split[orientation=row] > :not(.splitter):not(:first-child):not(:last-child) {
        margin-left: var(--panel-margin);
        margin-right: var(--panel-margin);
        width: calc(var(--current-portion) - 1px - 2 * var(--panel-margin));
    }

    .split[orientation=col] > :not(.splitter):not(:first-child):not(:last-child) {
        margin-top: var(--panel-margin);
        margin-bottom: var(--panel-margin);
        height: calc(var(--current-portion) - 1px - 2 * var(--panel-margin));
    }

    .split[orientation=row] > :last-child {
        margin-left: var(--panel-margin);
        width: calc(var(--current-portion) - 0.5px - var(--panel-margin));
    }

    .split[orientation=col] > :last-child {
        margin-top: var(--panel-margin);
        height: calc(var(--current-portion) - 0.5px - var(--panel-margin));
    }

    .split > .portion {
        overflow: visible;
        position: relative;
    }

    .split > .portion > .target {
        content: "";
        position: absolute;
        top: 0rem;
        left: 0rem;
        width: 100%;
        height: 100%;
        background-color: var(--main-background);
        border-radius: 3px;
        overflow: hidden;
    }

`);

function focusableDescendent(element, reverse = false) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT,
        (node) => {
            if (node.$ && node.$.focusable) {
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
        });
    if (reverse) {
        let lastNode = null;
        while (walker.nextNode()) {
            lastNode = walker.currentNode;
        }
        return lastNode;
    }
    return walker.nextNode();
}

const defaults = {
    content: [$prepMod("layout/nothing"), $prepMod("layout/nothing")],
    percents: "equal",
    orientation: "row"
};

export async function main(target, settings) {
    settings = { ... defaults, ... settings };

    const content = settings.content;

    var n = content.length;

    const container = $div("split");
    container.setAttribute("orientation", settings.orientation);
    var row = settings.orientation === "row";

    const orientationToggle = [row ? "row->col" : "col->row", () => {
        row = !row;
        settings.orientation = row ? "row" : "col";
        container.setAttribute("orientation", settings.orientation);
        orientationToggle[0] = row ? "row->col" : "col->row";
    }];


    container.addEventListener("keydown", (e) => {
        if (e.target.matches("input, textarea, [contenteditable=\"true\"]")) return;

        if (e.key === (row ? "h" : "k")) {
            const currentIndex = targets.findIndex(t => t.contains(document.activeElement));
            if (currentIndex === 0) {
                return;
            }
            const prevIndex = currentIndex - 1;
            const prev = focusableDescendent(targets[prevIndex], true);
            if (prev) prev.focus();
            e.stopPropagation();
        }
        else if (e.key === (row ? "l" : "j")) {
            const currentIndex = targets.findIndex(t => t.contains(document.activeElement));
            if (currentIndex === targets.length - 1) {
                return;
            }
            const nextIndex = currentIndex + 1;
            const next = focusableDescendent(targets[nextIndex]);
            if (next) next.focus();

            e.stopPropagation();
        }

    });

    const portions = [];
    const splitters = [];

    const minPercent = 2;

    async function createDragHandler(splitter, i) {
        function startDrag(e) {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (e.target !== splitter) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            function resizeCallback(e) {
                const containerRect = container.getBoundingClientRect();

                let least = row ? containerRect.left : containerRect.top;
                let extent = row ? containerRect.width : containerRect.height;

                const relativePos = (row ? e.clientX : e.clientY) - least;
                const percent = (relativePos / extent) * 100;

                const priorExtent = parseFloat(portions[i].style.getPropertyValue("--current-portion"));
                const posteriorExtent = parseFloat(portions[i + 1].style.getPropertyValue("--current-portion"));
                const totalAdjacent = priorExtent + posteriorExtent;

                let adjacentStart = 0;
                for (let j = 0; j < i; j++) {
                    adjacentStart += parseFloat(portions[j].style.getPropertyValue("--current-portion"));
                }

                const adjacentPercent = Math.max(0, Math.min(100, percent - adjacentStart));
                const priorRatio = Math.max(minPercent, Math.min(totalAdjacent - minPercent, adjacentPercent));
                const posteriorRatio = totalAdjacent - priorRatio;

                portions[i].style.setProperty("--current-portion", priorRatio + "%");
                portions[i + 1].style.setProperty("--current-portion", posteriorRatio + "%");
            }

            function cleanup() {
                document.removeEventListener("pointermove", resizeCallback);
                document.removeEventListener("pointerup", cleanup);
                document.removeEventListener("pointerleave", cleanup);
            }

            document.addEventListener("pointermove", resizeCallback, { passive: false });
            document.addEventListener("pointerup", cleanup, { passive: false });
            document.addEventListener("pointerleave", cleanup, { passive: false });
        }

        splitter.addEventListener("pointerdown", startDrag, { passive: false, capture: true });
    }

    const targets = [];

    function collapse(removedIndex, keptIndex) {
        n = n - 1;

        if (n === 1) {
            container.parentNode.replaceChildren(...targets[keptIndex].childNodes);
            return;
        }

        portions[removedIndex].remove();
        const removedExtent = parseFloat(portions[removedIndex].style.getPropertyValue("--current-portion"));
        const keptExtent = parseFloat(portions[keptIndex].style.getPropertyValue("--current-portion"));
        portions[keptIndex].style.setProperty("--current-portion", `${removedExtent + keptExtent}%`);

        for (let i = removedIndex + 1; i < n; i++) {
            container.insertBefore(portions[i], splitters[i-1]);
        }

        portions.splice(removedIndex, 1);
        targets.splice(removedIndex, 1);
        splitters[n - 1].remove();
        splitters.splice(n - 1, 1);
    }

    function tryCollapse(separatorIndex) {
        const prior = targets[separatorIndex];
        const posterior = targets[separatorIndex + 1];

        const priorCollapse = ![...prior.childNodes].some(child => $actualize(child.$preventCollapse));
        const posteriorCollapse = ![...posterior.childNodes].some(child => $actualize(child.$preventCollapse));

        if (!(priorCollapse || posteriorCollapse)) return;

        collapse(priorCollapse ? separatorIndex : separatorIndex + 1, priorCollapse ? separatorIndex + 1 : separatorIndex);
    }

    function collapseOptions(separatorIndex) {
        return () => {
            const prior = targets[separatorIndex];
            const posterior = targets[separatorIndex + 1];

            const priorCollapse = ![...prior.childNodes].some(child => $actualize(child.$preventCollapse));
            const posteriorCollapse = ![...posterior.childNodes].some(child => $actualize(child.$preventCollapse));

            if (!(priorCollapse || posteriorCollapse)) return;

            if (priorCollapse && posteriorCollapse) {
                return [
                    [`collapse ${row ? "left" : "top"}`, () => collapse(separatorIndex, separatorIndex + 1)],
                    [`collapse ${row ? "right" : "bottom"}`, () => collapse(separatorIndex + 1, separatorIndex)]
                ];
            }

            return ["collapse", () => collapse(priorCollapse ? separatorIndex : separatorIndex + 1, priorCollapse ? separatorIndex + 1 : separatorIndex)];
        }
    }

    for (let i = 0; i < n; i++) {
        const portion = $div("portion");
        if (settings.percents === "equal") {
            portion.style.setProperty("--current-portion", `${100/n}%`);
        } else {
            portion.style.setProperty("--current-portion", `${settings.percents[i]}%`);
        }

        const target = $div("target");

        targets.push(target);
        portions.push(portion);

        container.$with(portion.$with(target));

        if (i === n - 1) continue;

        const splitter = document.createElement("div");
        splitter.className = "splitter";

        splitter.$contextMenu = {
            items: [orientationToggle, collapseOptions(i)]
        };

        splitter.addEventListener("pointerdown", (e) => {
            if (e.button !== 1) return;

            tryCollapse(i);
        });

        splitters.push(splitter);
        container.appendChild(splitter);

        createDragHandler(splitter, i);
    }

    target.appendChild(container);

    for (let i = 0; i < n; i++) {
        if (content[i].$isInitializer) {
            await content[i](targets[i]);
        }
        else {
            targets[i].appendChild(content[i]);
        }
    }

    container.$preventCollapse = () => {
        return targets.some(target => [...target.childNodes].some(child => $actualize(child.$preventCollapse)));
    };

    return {
        replace: true
    };
}

