
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    .hsplitter {
        height: 1px;
        background-color: var(--main-faded);
        cursor: row-resize;
        user-select: none;
        -webkit-user-drag: none;
        overflow: visible;
    }

    .hsplitter::before {
        content: '';
        position: relative;
        display: inline-block;
        top: -6px;
        left: 0;
        width: 100%;
        height: 13px;
        /*background-color: rgba(255, 0, 0, 0.1);*/
    }

    .target.top {
        padding-bottom: 1rem;
    }

    .target.bottom {
        padding-top: 1rem;
    }

    .target.middle {
        padding-top: 1rem;
        padding-bottom: 1rem;
    }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

export function main(target, n = 2) {
    n = parseInt(n, 10);
    if (!Number.isInteger(n) || n < 2) {
        n = 2;
    }

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; height: 100%; width: 100%;';

    const targets = [];
    const splitters = [];

    function createDragHandler(splitter, i) {
        splitter.onmousedown = (e) => {
            e.preventDefault();

            function resizeCallback(e) {
                const containerRect = container.getBoundingClientRect();
                const relativeY = e.clientY - containerRect.top;
                const percent = (relativeY / containerRect.height) * 100;

                // Calculate total height of targets above this splitter
                let topTotal = 0;
                for (let j = 0; j <= i; j++) {
                    if (j === i) {
                        const newHeight = Math.max(1, Math.min(99, percent - topTotal));
                        targets[j].style.height = newHeight + '%';
                    } else {
                        topTotal += parseFloat(targets[j].style.height);
                    }
                }
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
        target.style.height = `${100/n}%`;

        if (i === 0) {
            target.className = "target top";
        } else if (i === n - 1) {
            target.className = "target bottom";
            target.style.flex = '1'; // Last one gets flex to handle rounding
            target.style.height = 'auto';
        } else {
            target.className = "target middle";
        }

        targets.push(target);
        container.appendChild(target);

        if (i === n - 1) continue;

        const splitter = document.createElement('div');
        splitter.className = 'hsplitter';
        splitters.push(splitter);
        container.appendChild(splitter);

        createDragHandler(splitter, i);
    }

    target.appendChild(container);

    return {
        targets: targets
    };
}

