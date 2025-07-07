
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    .column {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
    }

    .column > .splitter {
        height: 1px;
        background-color: var(--main-faded);
        cursor: row-resize;
        user-select: none;
        -webkit-user-drag: none;
        overflow: visible;
    }

    .column > .splitter::before {
        content: '';
        position: relative;
        display: inline-block;
        top: -8px;
        left: 0;
        width: 100%;
        height: 17px;
        /*background-color: rgba(255, 0, 0, 0.1);*/
    }

    .column > :first-child {
        margin-bottom: 1rem;
        height: calc(var(--current-portion) - 0.5px - 1rem);
    }

    .column > :not(.splitter):not(:first-child):not(:last-child) {
        margin-top: 1rem;
        margin-bottom: 1rem;
        height: calc(var(--current-portion) - 1px - 2rem);
    }

    .column > :last-child {
        margin-top: 1rem;
        height: calc(var(--current-portion) - 0.5px - 1rem);
    }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

export async function main(target, n = 2) {
    n = parseInt(n, 10);
    if (!Number.isInteger(n) || n < 2) {
        n = 2;
    }

    const container = document.createElement('div');
    container.className = "column";

    const targets = [];
    const splitters = [];

    const minPercent = 3;

    function createDragHandler(splitter, i) {
        splitter.onmousedown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();

            function resizeCallback(e) {
                const containerRect = container.getBoundingClientRect();
                const relativeY = e.clientY - containerRect.top - 1; // TODO: figure out *why* this "- 1" is required for perfect pointer alignment
                const percent = (relativeY / containerRect.height) * 100;

                // Get current heights of the two adjacent panes
                const topHeight = parseFloat(targets[i].style.getPropertyValue('--current-portion')) || (100/n);
                const bottomHeight = parseFloat(targets[i + 1].style.getPropertyValue('--current-portion')) || (100/n);
                const totalAdjacent = topHeight + bottomHeight;

                // Calculate how much of the adjacent space we're at
                let adjacentStart = 0;
                for (let j = 0; j < i; j++) {
                    adjacentStart += parseFloat(targets[j].style.getPropertyValue('--current-portion')) || (100/n);
                }

                const adjacentPercent = Math.max(0, Math.min(100, percent - adjacentStart));
                const topRatio = Math.max(minPercent, Math.min(totalAdjacent - minPercent, adjacentPercent));
                const bottomRatio = totalAdjacent - topRatio;

                targets[i].style.setProperty('--current-portion', topRatio + '%');
                targets[i + 1].style.setProperty('--current-portion', bottomRatio + '%');
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
        splitter.className = 'splitter';
        splitters.push(splitter);
        container.appendChild(splitter);

        createDragHandler(splitter, i);
    }

    target.appendChild(container);

    return {
        replace: true,
        targets: targets
    };
}

