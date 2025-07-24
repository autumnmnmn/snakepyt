
$css(`
    .row {
        display: flex;
        flex-direction: row;
        height: 100%;
        width: 100%;
        overflow: visible;
        padding: 0rem;
    }

    .row > .splitter {
        width: 1px;
        background-color: var(--main-faded);
        cursor: col-resize;
        user-select: none;
        -webkit-user-drag: none;
        overflow: visible;
    }

    .row > .splitter::before {
        content: '';
        position: relative;
        display: inline-block;
        top: 0;
        left: -8px;
        width: 17px;
        height: 100%;
        /*background-color: rgba(255, 0, 0, 0.1);*/
    }

    .row > :first-child {
        margin-right: var(--panel-margin);
        width: calc(var(--current-portion) - 0.5px - var(--panel-margin));
    }

    .row > :not(.splitter):not(:first-child):not(:last-child) {
        margin-left: var(--panel-margin);
        margin-right: var(--panel-margin);
        width: calc(var(--current-portion) - 1px - 2 * var(--panel-margin));
    }

    .row > :last-child {
        margin-left: var(--panel-margin);
        width: calc(var(--current-portion) - 0.5px - var(--panel-margin));
    }

    .row > .portion {
        overflow: visible;
        position: relative;
    }

    .row > .portion > .target {
        content: '';
        position: absolute;
        top: 0rem;
        left: 0rem;
        width: 100%;
        height: 100%;
        background-color: var(--main-background);
        border-radius: 0.5rem;
        overflow: hidden;
    }

    .row > .portion > .target[theme-changed] {
        top: 0.5rem;
        height: calc(100% - 1rem);
    }

    .row > :first-child > .target[theme-changed] {
        left: 0.5rem;
        width: calc(100% - 0.5rem);
    }

    .row > :last-child > .target[theme-changed] {
        width: calc(100% - 0.5rem);
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
        while (walker.nextNode()) { }
        walker.previousNode();
    }
    return walker.nextNode();
}

export async function main(target, n = 2) {
    n = parseInt(n, 10);
    if (!Number.isInteger(n) || n < 2) {
        n = 2;
    }

    const container = document.createElement('div');
    container.className = "row";

    container.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea, [contenteditable="true"]')) return;

        if (e.key === "h") {
            const currentIndex = targets.findIndex(t => t.contains(document.activeElement));
            if (currentIndex === 0) {
                return;
            }
            const prevIndex = currentIndex - 1;
            const prev = focusableDescendent(targets[prevIndex], true);
            if (prev) prev.focus();
        }
        else if (e.key === "l") {
            const currentIndex = targets.findIndex(t => t.contains(document.activeElement));
            if (currentIndex === targets.length - 1) {
                return;
            }
            const nextIndex = currentIndex + 1;
            const next = focusableDescendent(targets[nextIndex]);
            if (next) next.focus();
        }

        e.stopPropagation();
    });

    const portions = [];
    const splitters = [];

    const minPercent = 2;

    function createDragHandler(splitter, i) {
        splitter.onmousedown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();

            function resizeCallback(e) {
                const containerRect = container.getBoundingClientRect();

                let leftmost = containerRect.left;
                let width = containerRect.width;

                const relativeX = e.clientX - leftmost;
                const percent = (relativeX / width) * 100;

                // Get current widths of the two adjacent panes
                const leftWidth = parseFloat(portions[i].style.getPropertyValue('--current-portion')) || (100/n);
                const rightWidth = parseFloat(portions[i + 1].style.getPropertyValue('--current-portion')) || (100/n);
                const totalAdjacent = leftWidth + rightWidth;

                // Calculate how much of the adjacent space we're at
                let adjacentStart = 0;
                for (let j = 0; j < i; j++) {
                    adjacentStart += parseFloat(portions[j].style.getPropertyValue('--current-portion')) || (100/n);
                }

                const adjacentPercent = Math.max(0, Math.min(100, percent - adjacentStart));
                const leftRatio = Math.max(minPercent, Math.min(totalAdjacent - minPercent, adjacentPercent));
                const rightRatio = totalAdjacent - leftRatio;

                portions[i].style.setProperty('--current-portion', leftRatio + '%');
                portions[i + 1].style.setProperty('--current-portion', rightRatio + '%');
            }

            function cleanup() {
                document.removeEventListener('mousemove', resizeCallback);
                document.removeEventListener('mouseup', cleanup);
                document.removeEventListener('mouseleave', cleanup);
            }

            document.addEventListener('mousemove', resizeCallback);
            document.addEventListener('mouseup', cleanup);
            document.addEventListener('mouseleave', cleanup);
        };
    }

    const targets = [];

    for (let i = 0; i < n; i++) {
        const portion = document.createElement('div');
        portion.className = "portion";
        portion.style.setProperty('--current-portion', `${100/n}%`);

        const target = document.createElement('div');
        target.className = "target";

        targets.push(target);
        portions.push(portion);
        portion.appendChild(target);
        container.appendChild(portion);

        if (i === n - 1) continue;

        const splitter = document.createElement('div');
        splitter.className = "splitter";
        splitters.push(splitter);
        container.appendChild(splitter);

        createDragHandler(splitter, i);
    }

    target.appendChild(container);

    for (const target of targets.toReversed()) {
        await $mod("layout/nothing", target);
    }

    return {
        replace: true
    };
}

