
// UNREVIEWED CLAUDESLOP

const sheet = new CSSStyleSheet();
sheet.replaceSync(`
    .pane-container {
        position: absolute;
        min-width: 8em;
        min-height: 5em;
        background: var(--main-bg, #fff);
        border: 1px solid var(--main-border, #ccc);
        border-radius: 0.75em;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 1em;
        overflow: hidden;
    }

    .pane-header {
        height: 1.7em;
        background: var(--pane-header, #f0f0f0);
        border-radius: 0.75em 0.75em 0 0;
        display: flex;
        align-items: center;
        padding: 0 1em;
        user-select: none;
        cursor: move;
        position: relative;
    }

    .pane-title {
        flex: 1;
        font-size: 0.9em;
        color: var(--pane-title, #333);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .pane-drag-handle {
        width: 1.2em;
        height: 1.2em;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        opacity: 0.6;
    }

    .pane-drag-bar {
        height: 2px;
        background: var(--drag-handle, #666);
        border-radius: 1px;
    }

    .pane-body {
        height: calc(100% - 1.7em);
        overflow: auto;
        position: relative;
    }

    .pane-resize-handle {
        position: absolute;
        background: transparent;
        z-index: 10;
    }

    .pane-resize-corner {
        width: 12px;
        height: 12px;
        right: -6px;
        bottom: -6px;
        cursor: nw-resize;
        border-radius: 50%;
    }

    .pane-resize-right {
        width: 8px;
        height: calc(100% - 20px);
        right: -4px;
        top: 10px;
        cursor: ew-resize;
    }

    .pane-resize-bottom {
        width: calc(100% - 20px);
        height: 8px;
        left: 10px;
        bottom: -4px;
        cursor: ns-resize;
    }

    .pane-resize-handle:hover {
        background: var(--accent, rgba(0,100,200,0.3));
    }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

// Global pane management
const panes = new Map();
let nextZIndex = 1000;

function bringToFront(pane) {
    pane.style.zIndex = ++nextZIndex;
}

function constrainPosition(container, x, y) {
    const rect = container.getBoundingClientRect();
    
    const maxX = rect.width;
    const maxY = rect.height;
    
    return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY))
    };
}

function makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = element.offsetLeft;
        startTop = element.offsetTop;
        
        bringToFront(element);
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        const newPos = constrainPosition(element, startLeft + deltaX, startTop + deltaY);
        element.style.left = newPos.x + 'px';
        element.style.top = newPos.y + 'px';
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

function makeResizable(element) {
    const handles = element.querySelectorAll('.pane-resize-handle');
    
    handles.forEach(handle => {
        let isResizing = false;
        let startX, startY, startWidth, startHeight, startLeft, startTop;
        
        handle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = element.offsetWidth;
            startHeight = element.offsetHeight;
            startLeft = element.offsetLeft;
            startTop = element.offsetTop;
            
            bringToFront(element);
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            if (handle.classList.contains('pane-resize-corner')) {
                const newWidth = Math.max(150, startWidth + deltaX);
                const newHeight = Math.max(100, startHeight + deltaY);
                element.style.width = newWidth + 'px';
                element.style.height = newHeight + 'px';
            } else if (handle.classList.contains('pane-resize-right')) {
                const newWidth = Math.max(150, startWidth + deltaX);
                element.style.width = newWidth + 'px';
            } else if (handle.classList.contains('pane-resize-bottom')) {
                const newHeight = Math.max(100, startHeight + deltaY);
                element.style.height = newHeight + 'px';
            }
        }

        function onMouseUp() {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    });
}

export function main(target, title = 'Untitled', width = 300, height = 200) {
    const container = document.createElement('div');
    container.className = 'pane-container';
    
    // Parse dimensions
    width = parseInt(width) || 300;
    height = parseInt(height) || 200;
    
    // Position in center with slight randomness
    const centerX = (target.offsetWidth - width) / 2 + (Math.random() - 0.5) * 100;
    const centerY = (target.offsetHeight - height) / 2 + (Math.random() - 0.5) * 100;
    
    const pos = constrainPosition(container, centerX, centerY);
    
    container.style.cssText = `
        width: ${width}px;
        height: ${height}px;
        left: ${pos.x}px;
        top: ${pos.y}px;
        z-index: ${++nextZIndex};
    `;

    // Create header
    const header = document.createElement('div');
    header.className = 'pane-header';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'pane-title';
    titleSpan.textContent = title;
    
    const dragHandle = document.createElement('div');
    dragHandle.className = 'pane-drag-handle';
    for (let i = 0; i < 3; i++) {
        const bar = document.createElement('div');
        bar.className = 'pane-drag-bar';
        dragHandle.appendChild(bar);
    }
    
    header.appendChild(titleSpan);
    header.appendChild(dragHandle);

    // Create body
    const body = document.createElement('div');
    body.className = 'pane-body';

    // Create resize handles
    const cornerHandle = document.createElement('div');
    cornerHandle.className = 'pane-resize-handle pane-resize-corner';
    
    const rightHandle = document.createElement('div');
    rightHandle.className = 'pane-resize-handle pane-resize-right';
    
    const bottomHandle = document.createElement('div');
    bottomHandle.className = 'pane-resize-handle pane-resize-bottom';

    // Assemble
    container.appendChild(header);
    container.appendChild(body);
    container.appendChild(cornerHandle);
    container.appendChild(rightHandle);
    container.appendChild(bottomHandle);

    // Middle-click to close
    header.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
            e.preventDefault();
            container.remove();
            panes.delete(container);
        }
    });

    // Click to bring to front
    container.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            bringToFront(container);
        }
    });

    // Make functional
    makeDraggable(container, header);
    makeResizable(container);

    // Add to DOM and tracking
    target.appendChild(container);
    panes.set(container, { title, body });

    return {
        replace: false,
        targets: [body],
        pane: container
    };
}

