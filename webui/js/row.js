
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    .vsplitter {
        width: 1px;
        background-color: var(--main-faded);
        cursor: col-resize;
        user-select: none;
        -webkit-user-drag: none;
        overflow: visible;
    }

    .vsplitter::before {
        content: '';
        position: relative;
        display: inline-block;
        top: 0;
        left: -6px;
        width: 13px;
        height: 100%;
        /*background-color: rgba(255, 0, 0, 0.1);*/
    }

    .target.left {
        padding-right: 1rem;
    }

    .target.right {
        padding-left: 1rem;
    }

    .target.middle {
        padding-left: 1rem;
        padding-right: 1rem;
    }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

export function main(target, n = 2) {
    n = parseInt(n, 10);
    if (!Number.isInteger(n) || n < 2) {
        n = 2;
    }

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; height: 100%; width: 100%;';

    const targets = [];
    const splitters = [];

    function createDragHandler(splitter, i) {
        splitter.onmousedown = (e) => {
            e.preventDefault();

            function resizeCallback(e) {
                const containerRect = container.getBoundingClientRect();
                const relativeX = e.clientX - containerRect.left;
                const percent = (relativeX / containerRect.width) * 100;

                // Get current widths of the two adjacent panes
                const leftWidth = parseFloat(targets[i].style.width) || (100/n);
                const rightWidth = parseFloat(targets[i + 1].style.width) || (100/n);
                const totalAdjacent = leftWidth + rightWidth;

                // Calculate how much of the adjacent space we're at
                let adjacentStart = 0;
                for (let j = 0; j < i; j++) {
                    adjacentStart += parseFloat(targets[j].style.width) || (100/n);
                }

                const adjacentPercent = Math.max(0, Math.min(100, percent - adjacentStart));
                const leftRatio = Math.max(1, Math.min(totalAdjacent - 1, adjacentPercent));
                const rightRatio = totalAdjacent - leftRatio;

                targets[i].style.width = leftRatio + '%';
                targets[i + 1].style.width = rightRatio + '%';
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
        target.style.width = `${100/n}%`;

        if (i === 0) {
            target.className = "target left";
        } else if (i === n - 1) {
            target.className = "target right";
            target.style.flex = '1'; // Last one gets flex to handle rounding
            target.style.width = 'auto';
        } else {
            target.className = "target middle";
        }

        targets.push(target);
        container.appendChild(target);

        if (i === n - 1) continue;

        const splitter = document.createElement('div');
        splitter.className = 'vsplitter';
        splitters.push(splitter);
        container.appendChild(splitter);

        createDragHandler(splitter, i);
    }

    target.appendChild(container);

    return {
        targets: targets
    };
}

