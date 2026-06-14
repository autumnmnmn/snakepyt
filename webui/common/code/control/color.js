$css(`

.color-picker {
    display: block;
}

.color-picker .cp-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.25rem;
}

.color-picker .cp-label {
    color: var(--main-solid);
    line-height: 1em;
    min-height: 1em;
}

.color-picker select {
    background: var(--main-background);
    color: var(--main-solid);
    font-family: var(--main-font);
    border: none;
    border-bottom: 1px solid var(--main-faded);
    outline: none;
    cursor: pointer;
    font-size: 0.8em;
}

.color-picker select:focus {
    border-bottom-color: var(--main-solid);
}

.color-picker .cp-preview {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
}

.color-picker .cp-swatch {
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid var(--main-faded);
    flex-shrink: 0;
}

.color-picker .cp-output {
    font-family: var(--main-font);
    font-size: 0.75em;
    color: var(--main-faded);
    word-break: break-all;
}

.color-picker .cp-axes {
    display: flex;
    gap: 1rem;
    font-size: 0.8em;
    color: var(--main-faded);
    margin-bottom: 0.5rem;
}

.color-picker .cp-axes label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.color-picker .cp-area {
    position: relative;
    width: 100%;
    height: 160px;
    cursor: crosshair;
    touch-action: none;
    border: 1px solid var(--main-faded);
    overflow: hidden;
    margin-bottom: 0.75rem;
}

.color-picker .cp-area canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.color-picker .cp-cursor {
    position: absolute;
    width: 10px;
    height: 10px;
    border: 1.5px solid white;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 0 1px black;
    pointer-events: none;
}

.color-picker .cp-sliders {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.color-picker .cp-slider-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8em;
    color: var(--main-faded);
    margin-bottom: 0.15rem;
}

.color-picker .cp-slider-row .val {
    color: var(--main-solid);
    font-family: var(--main-font);
}

.color-picker input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    outline: none;
    cursor: pointer;
    overflow: visible;
    margin: 0.2rem 0;
    border: none;
    border-radius: 2px;
    height: 2px;
}

.color-picker input[type=range]::-webkit-slider-runnable-track {
    height: 2px;
}

.color-picker input[type=range]::-moz-range-track {
    height: 2px;
}

.color-picker input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 0.5rem;
    height: 1rem;
    border-radius: 2px;
    background: var(--main-solid);
    border: none;
    margin-top: calc(1px - 0.5rem);
}

.color-picker input[type=range]::-moz-range-thumb {
    width: 0.5rem;
    height: 1rem;
    border-radius: 2px;
    background: var(--main-solid);
    border: none;
}

`);

export const SPACES = {
    oklch: {
        name: "OKLCH",
        channels: [
            { name: "L", min: 0, max: 1,   step: 0.001, format: v => `${Math.round(v * 100)}%` },
            { name: "C", min: 0, max: 0.4,  step: 0.001, format: v => v.toFixed(3) },
            { name: "H", min: 0, max: 360,  step: 1,     format: v => Math.round(v) }
        ],
        defaultVals: [0.7, 0.2, 180],
        defaultAxisX: 2, // Hue
        defaultAxisY: 1, // Chroma
        toCss: v => `oklch(${v[0]} ${v[1]} ${v[2]})`
    },
    hsl: {
        name: "HSL",
        channels: [
            { name: "H", min: 0,   max: 360, step: 1, format: v => Math.round(v) },
            { name: "S", min: 0,   max: 100, step: 1, format: v => `${Math.round(v)}%` },
            { name: "L", min: 0,   max: 100, step: 1, format: v => `${Math.round(v)}%` }
        ],
        defaultVals: [180, 80, 60],
        defaultAxisX: 0, // Hue
        defaultAxisY: 1, // Saturation
        toCss: v => `hsl(${v[0]} ${v[1]}% ${v[2]}%)`
    },
    rgb: {
        name: "sRGB",
        channels: [
            { name: "R", min: 0, max: 255, step: 1, format: v => Math.round(v) },
            { name: "G", min: 0, max: 255, step: 1, format: v => Math.round(v) },
            { name: "B", min: 0, max: 255, step: 1, format: v => Math.round(v) }
        ],
        defaultVals: [100, 150, 200],
        defaultAxisX: 0, // Red
        defaultAxisY: 2, // Blue
        toCss: v => `rgb(${v[0]} ${v[1]} ${v[2]})`
    }
};

const defaults = {
    label: "color",
    space: "oklch",
    spaces: null,   // null = all; or an array of space ids to include
    value: null,    // null = use space defaultVals; or [ch0, ch1, ch2]
    onUpdate: null  // (cssStr, vals, spaceId, panelState) => void
};

export async function main(spec, panelState) {
    spec = { ...defaults, ...spec };

    const availableSpaces = spec.spaces
        ? Object.fromEntries(spec.spaces.map(id => [id, SPACES[id]]))
        : SPACES;

    let activeSpaceId = spec.space in availableSpaces
        ? spec.space
        : Object.keys(availableSpaces)[0];

    let vals = [...(spec.value ?? availableSpaces[activeSpaceId].defaultVals)];
    let axisXIndex = availableSpaces[activeSpaceId].defaultAxisX ?? 2;
    let axisYIndex = availableSpaces[activeSpaceId].defaultAxisY ?? 1;
    let cssWidth = 0;
    let cssHeight = 0;
    let isDragging = false;

    // --- DOM ---

    const control = document.createElement("div");
    control.className = "control color-picker";

    const header = $element("div");
    header.className = "cp-header";

    const labelEl = $element("span");
    labelEl.className = "cp-label";
    labelEl.innerText = spec.label + ":";

    const spaceSelect = $element("select");
    spaceSelect.setAttribute("aria-label", `${spec.label} color space`);
    for (const [id, cfg] of Object.entries(availableSpaces)) {
        const opt = $element("option");
        opt.value = id;
        opt.innerText = cfg.name;
        spaceSelect.appendChild(opt);
    }
    spaceSelect.value = activeSpaceId;

    header.$with(labelEl, spaceSelect);

    const preview = $element("div");
    preview.className = "cp-preview";

    const swatch = $element("div");
    swatch.className = "cp-swatch";

    const outputEl = $element("span");
    outputEl.className = "cp-output";
    outputEl.setAttribute("aria-live", "polite");
    outputEl.setAttribute("aria-atomic", "true");

    preview.$with(swatch, outputEl);

    const axesDiv = $element("div");
    axesDiv.className = "cp-axes";

    const axisXLabel = $element("label");
    axisXLabel.innerText = "X:";
    const selX = $element("select");
    selX.setAttribute("aria-label", "2D area X axis");
    axisXLabel.appendChild(selX);

    const axisYLabel = $element("label");
    axisYLabel.innerText = "Y:";
    const selY = $element("select");
    selY.setAttribute("aria-label", "2D area Y axis");
    axisYLabel.appendChild(selY);

    axesDiv.$with(axisXLabel, axisYLabel);

    const areaDiv = $element("div");
    areaDiv.className = "cp-area";

    const canvas = $element("canvas");
    canvas.setAttribute("aria-hidden", "true");

    const cursorEl = $element("div");
    cursorEl.className = "cp-cursor";
    cursorEl.setAttribute("aria-hidden", "true");

    areaDiv.$with(canvas, cursorEl);

    const ctx = canvas.getContext("2d", { alpha: false });

    const slidersDiv = $element("div");
    slidersDiv.className = "cp-sliders";

    const sliderRows = Array.from({ length: 3 }, () => {
        const group = $element("div");

        const row = $element("div");
        row.className = "cp-slider-row";

        const nameEl = $element("span");
        const valEl = $element("span");
        valEl.className = "val";
        row.$with(nameEl, valEl);

        const rangeInput = $element("input");
        rangeInput.type = "range";

        group.$with(row, rangeInput);
        slidersDiv.appendChild(group);
        return { nameEl, valEl, rangeInput };
    });

    control.$with(header, preview, axesDiv, areaDiv, slidersDiv);

    // --- Rendering ---

    function makeColor(overrideX, overrideY) {
        const temp = [...vals];
        if (overrideX !== undefined) temp[axisXIndex] = overrideX;
        if (overrideY !== undefined) temp[axisYIndex] = overrideY;
        return availableSpaces[activeSpaceId].toCss(temp);
    }

    function getSliderGradient(channelIndex) {
        const space = availableSpaces[activeSpaceId];
        const ch = space.channels[channelIndex];
        const numStops = ch.max > 100 ? 10 : 2;
        const stops = [];
        for (let i = 0; i <= numStops; i++) {
            const temp = [...vals];
            temp[channelIndex] = ch.min + (i / numStops) * (ch.max - ch.min);
            stops.push(space.toCss(temp));
        }
        return `linear-gradient(to right, ${stops.join(", ")})`;
    }

    function renderArea() {
        const space = availableSpaces[activeSpaceId];
        const chX = space.channels[axisXIndex];
        const chY = space.channels[axisYIndex];
        const rowHeight = 2;
        const stops = 10;

        ctx.clearRect(0, 0, cssWidth, cssHeight);
        for (let y = 0; y < cssHeight; y += rowHeight) {
            const normY = 1 - y / (cssHeight - 1);
            const valY = chY.min + normY * (chY.max - chY.min);
            const grad = ctx.createLinearGradient(0, 0, cssWidth, 0);
            for (let j = 0; j <= stops; j++) {
                const normX = j / stops;
                const valX = chX.min + normX * (chX.max - chX.min);
                grad.addColorStop(normX, makeColor(valX, valY));
            }
            ctx.fillStyle = grad;
            ctx.fillRect(0, y, cssWidth, rowHeight + 0.5);
        }
    }

    // syncUI updates DOM from current state; does NOT fire onUpdate
    function syncUI() {
        const space = availableSpaces[activeSpaceId];
        const cssStr = space.toCss(vals);

        swatch.style.backgroundColor = cssStr;
        outputEl.textContent = cssStr;

        sliderRows.forEach(({ nameEl, valEl, rangeInput }, i) => {
            const ch = space.channels[i];
            nameEl.textContent = ch.name;
            rangeInput.setAttribute("aria-label", ch.name);
            rangeInput.min = ch.min;
            rangeInput.max = ch.max;
            rangeInput.step = ch.step;
            rangeInput.value = vals[i];
            valEl.textContent = ch.format(vals[i]);
            rangeInput.style.background = getSliderGradient(i);
        });

        const chX = space.channels[axisXIndex];
        const chY = space.channels[axisYIndex];
        const normX = (vals[axisXIndex] - chX.min) / (chX.max - chX.min);
        const normY = (vals[axisYIndex] - chY.min) / (chY.max - chY.min);
        cursorEl.style.left = `${normX * 100}%`;
        cursorEl.style.top = `${(1 - normY) * 100}%`;
    }

    function initSpace() {
        const space = availableSpaces[activeSpaceId];
        vals = [...(spec.value ?? space.defaultVals)];
        axisXIndex = space.defaultAxisX ?? 2;
        axisYIndex = space.defaultAxisY ?? 1;

        selX.innerHTML = "";
        selY.innerHTML = "";
        space.channels.forEach((ch, i) => {
            const ox = $element("option");
            ox.value = i;
            ox.innerText = ch.name;
            ox.selected = (i === axisXIndex);
            selX.appendChild(ox);

            const oy = $element("option");
            oy.value = i;
            oy.innerText = ch.name;
            oy.selected = (i === axisYIndex);
            selY.appendChild(oy);
        });

        syncUI();
        renderArea();
    }

    function resizeCanvas() {
        const rect = areaDiv.getBoundingClientRect();
        cssWidth = rect.width;
        cssHeight = rect.height;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
        ctx.scale(dpr, dpr);
        renderArea();
    }

    // --- Events ---

    spaceSelect.addEventListener("change", (e) => {
        activeSpaceId = e.target.value;
        initSpace();
        spec.onUpdate?.(availableSpaces[activeSpaceId].toCss(vals), vals, activeSpaceId, panelState);
    });

    function handleAxisChange(changedAxis, newValue) {
        newValue = parseInt(newValue);
        if (changedAxis === "X") {
            if (newValue === axisYIndex) { axisYIndex = axisXIndex; selY.value = axisYIndex; }
            axisXIndex = newValue;
        } else {
            if (newValue === axisXIndex) { axisXIndex = axisYIndex; selX.value = axisXIndex; }
            axisYIndex = newValue;
        }
        renderArea();
        syncUI();
    }

    selX.addEventListener("change", e => handleAxisChange("X", e.target.value));
    selY.addEventListener("change", e => handleAxisChange("Y", e.target.value));

    sliderRows.forEach(({ rangeInput }, i) => {
        rangeInput.addEventListener("input", (e) => {
            vals[i] = parseFloat(e.target.value);
            if (i !== axisXIndex && i !== axisYIndex) renderArea();
            syncUI();
            spec.onUpdate?.(availableSpaces[activeSpaceId].toCss(vals), vals, activeSpaceId, panelState);
        });
    });

    function handlePointer(e) {
        if (!isDragging) return;
        const rect = areaDiv.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        const normX = x / rect.width;
        const normY = 1 - y / rect.height;
        const chX = availableSpaces[activeSpaceId].channels[axisXIndex];
        const chY = availableSpaces[activeSpaceId].channels[axisYIndex];
        vals[axisXIndex] = chX.min + normX * (chX.max - chX.min);
        vals[axisYIndex] = chY.min + normY * (chY.max - chY.min);
        syncUI();
        spec.onUpdate?.(availableSpaces[activeSpaceId].toCss(vals), vals, activeSpaceId, panelState);
    }

    areaDiv.addEventListener("pointerdown", (e) => {
        isDragging = true;
        areaDiv.setPointerCapture(e.pointerId);
        handlePointer(e);
    });
    areaDiv.addEventListener("pointermove", handlePointer);
    areaDiv.addEventListener("pointerup", () => { isDragging = false; });
    areaDiv.addEventListener("pointercancel", () => { isDragging = false; });

    new ResizeObserver(resizeCanvas).observe(areaDiv);

    initSpace();

    const hide = () => { control.setAttribute("hidden", ""); };
    const show = () => { control.removeAttribute("hidden"); };

    // set(newVals, spaceId?) -- spaceId triggers a space switch if different
    const set = (newVals, spaceId) => {
        if (spaceId && spaceId !== activeSpaceId) {
            activeSpaceId = spaceId;
            spaceSelect.value = spaceId;
            initSpace();
        }
        vals = [...newVals];
        syncUI();
        renderArea();
    };

    return { dom: [control], show, hide, set };
}
