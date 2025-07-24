
$css(`
    .column {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: visible;
        padding: 0rem;
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
        margin-bottom: var(--panel-margin);
        height: calc(var(--current-portion) - 0.5px - var(--panel-margin));
    }

    .column > :not(.splitter):not(:first-child):not(:last-child) {
        margin-top: var(--panel-margin);
        margin-bottom: var(--panel-margin);
        height: calc(var(--current-portion) - 1px - 2 * var(--panel-margin));
    }

    .column > :last-child {
        margin-top: var(--panel-margin);
        height: calc(var(--current-portion) - 0.5px - var(--panel-margin));
    }

    .column > .portion {
        overflow: visible;
        position: relative;
    }

    .column > .portion > .target {
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

    .column > .portion > .target[theme-changed] {
        left: 0.5rem;
        width: calc(100% - 1rem);
    }

    .column > :first-child > .target[theme-changed] {
        top: 0.5rem;
        height: calc(100% - 0.5rem);
    }

    .column > :last-child > .target[theme-changed] {
        height: calc(100% - 0.5rem);
    }

`);

export async function main(target, n = 2) {
    n = parseInt(n, 10);
    if (!Number.isInteger(n) || n < 2) {
        n = 2;
    }

    const container = document.createElement('div');
    container.className = "column";

    const portions = [];
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
                const topHeight = parseFloat(portions[i].style.getPropertyValue('--current-portion')) || (100/n);
                const bottomHeight = parseFloat(portions[i + 1].style.getPropertyValue('--current-portion')) || (100/n);
                const totalAdjacent = topHeight + bottomHeight;

                // Calculate how much of the adjacent space we're at
                let adjacentStart = 0;
                for (let j = 0; j < i; j++) {
                    adjacentStart += parseFloat(portions[j].style.getPropertyValue('--current-portion')) || (100/n);
                }

                const adjacentPercent = Math.max(0, Math.min(100, percent - adjacentStart));
                const topRatio = Math.max(minPercent, Math.min(totalAdjacent - minPercent, adjacentPercent));
                const bottomRatio = totalAdjacent - topRatio;

                portions[i].style.setProperty('--current-portion', topRatio + '%');
                portions[i + 1].style.setProperty('--current-portion', bottomRatio + '%');
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
        splitter.className = 'splitter';
        splitters.push(splitter);
        container.appendChild(splitter);

        createDragHandler(splitter, i);
    }

    target.appendChild(container);

    for (const target of targets.toReversed()) {
        await $mod("layout/nothing", target);
    }

    return {
        replace: true,
    };
}

