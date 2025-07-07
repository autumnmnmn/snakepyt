
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    .row {
        display: flex;
        flex-direction: row;
        height: 100%;
        width: 100%;
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
        margin-right: 1rem;
        width: calc(var(--current-portion) - 0.5px - 1rem);
    }

    .row > :not(.splitter):not(:first-child):not(:last-child) {
        margin-left: 1rem;
        margin-right: 1rem;
        width: calc(var(--current-portion) - 1px - 2rem);
    }

    .row > :last-child {
        margin-left: 1rem;
        width: calc(var(--current-portion) - 0.5px - 1rem);
    }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

export async function main(target, n = 2) {
    n = parseInt(n, 10);
    if (!Number.isInteger(n) || n < 2) {
        n = 2;
    }

    const container = document.createElement('div');
    container.className = "row";

    const targets = [];
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
                const leftWidth = parseFloat(targets[i].style.getPropertyValue('--current-portion')) || (100/n);
                const rightWidth = parseFloat(targets[i + 1].style.getPropertyValue('--current-portion')) || (100/n);
                const totalAdjacent = leftWidth + rightWidth;

                // Calculate how much of the adjacent space we're at
                let adjacentStart = 0;
                for (let j = 0; j < i; j++) {
                    adjacentStart += parseFloat(targets[j].style.getPropertyValue('--current-portion')) || (100/n);
                }

                const adjacentPercent = Math.max(0, Math.min(100, percent - adjacentStart));
                const leftRatio = Math.max(minPercent, Math.min(totalAdjacent - minPercent, adjacentPercent));
                const rightRatio = totalAdjacent - leftRatio;

                targets[i].style.setProperty('--current-portion', leftRatio + '%');
                targets[i + 1].style.setProperty('--current-portion', rightRatio + '%');
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

    for (let i = 0; i < n; i++) {
        const target = document.createElement('div');
        target.style.setProperty('--current-portion', `${100/n}%`);

        await $mod("nothing", target);

        targets.push(target);
        container.appendChild(target);

        if (i === n - 1) continue;

        const splitter = document.createElement('div');
        splitter.className = "splitter";
        splitters.push(splitter);
        container.appendChild(splitter);

        createDragHandler(splitter, i);
    }

    target.appendChild(container);

    return {
        replace: true
    };
}

