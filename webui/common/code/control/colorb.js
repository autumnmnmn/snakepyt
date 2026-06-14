// color.js
"use strict";

$css(`
.color {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-bottom: 0.5rem;
}

.color .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--main-solid);
}

.color select {
    background: var(--main-background);
    color: var(--main-solid);
    font-family: var(--main-font);
    border: 1px solid var(--main-faded);
    border-radius: 2px;
    padding: 0.1rem 0.2rem;
    outline: none;
    cursor: pointer;
}

.color select:focus {
    border-color: var(--main-solid);
}

.color .preview {
    align-items: center;
    gap: 1rem;
}

.color .swatch {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: 1px solid var(--main-solid);
    background-color: transparent; /* Updated dynamically */
    transition: background 0.05s linear;
    display: inline-block;
}

.color .output {
    display: inline;
    font-family: monospace;
    color: var(--main-solid);
    font-size: 0.9em;
}

.color .axis-controls {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
}

.color .axis-controls label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--main-solid);
    font-size: 0.85rem;
    flex: 1;
}

.color .axis-controls select {
    flex: 1;
}

.color .area-container {
    position: relative;
    width: 100%;
    height: 180px;
    cursor: crosshair;
    touch-action: none;
    overflow: hidden;
}

.color .area-container canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.color .cursor {
    position: absolute;
    width: 14px;
    height: 14px;
    border: 2px solid white;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: width 0.1s, height 0.1s;
}

.color .area-container:active .cursor {
    width: 18px;
    height: 18px;
}

.color .sliders {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.color .slider-group label {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--main-solid);
    margin-bottom: 0.25rem;
}

.color .slider-group .val {
    font-family: monospace;
}

.color input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 2px;
    outline: none;
    background: transparent;
    cursor: pointer;
    border: none;
    overflow: visible;
}

.color input[type=range]::-webkit-slider-runnable-track {
    background: transparent;
    height: 0.5rem;
}

.color input[type=range]::-moz-range-track {
    background: transparent;
    height: 0.5rem;
}

.color input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 0.5rem;
    height: 1rem;
    border-radius: 2px;
    background-color: var(--main-solid);
    border: none;
}

.color input[type=range]::-moz-range-thumb {
    width: 0.5rem;
    height: 1rem;
    border-radius: 2px;
    background-color: var(--main-solid);
    box-sizing: border-box;
    border: none;
}

`);

const displayValue = (value) => Math.round(value * 100) / 100;

// TODO decouple *css* from *display string*

const SPACES = {
    oklch: {
        name: "OKLCH",
        channels: [
            { name: "Lightness", min: 0, max: 1, step: 0.01, format: v => `${Math.round(v * 100)}%` },
            { name: "Chroma", min: 0, max: 0.4, step: 0.001, format: v => v.toFixed(3) },
            { name: "Hue", min: 0, max: 360, step: 1, format: v => Math.round(v) }
        ],
        defaultVals: [0.7, 0.2, 180],
        toCss: v => `oklch(${displayValue(v[0])} ${displayValue(v[1])} ${displayValue(v[2])})`
    },
    hsl: {
        name: "HSL",
        channels: [
            { name: "Hue", min: 0, max: 360, step: 1, format: v => Math.round(v) },
            { name: "Saturation", min: 0, max: 100, step: 1, format: v => `${Math.round(v)}%` },
            { name: "Lightness", min: 0, max: 100, step: 1, format: v => `${Math.round(v)}%` }
        ],
        defaultVals: [180, 80, 60],
        toCss: v => `hsl(${displayValue(v[0])} ${displayValue(v[1])}% ${displayValue(v[2])}%)`
    },
    rgb: {
        name: "sRGB",
        channels: [
            { name: "Red", min: 0, max: 255, step: 1, format: v => Math.round(v) },
            { name: "Green", min: 0, max: 255, step: 1, format: v => Math.round(v) },
            { name: "Blue", min: 0, max: 255, step: 1, format: v => Math.round(v) }
        ],
        defaultVals: [100, 150, 200],
        toCss: v => `rgb(${displayValue(v[0])} ${displayValue(v[1])} ${displayValue(v[2])})`
    }
};

const defaults = {
    label: "color",
    value: { space: "oklch", vals: [0.7, 0.2, 180] },
    onUpdate: null
};

export async function main(spec, panelState) {
    spec = { ...defaults, ...spec };

    const control = $div("control color");

    // -- State --
    let activeSpaceId = spec.value.space || "oklch";
    let vals = [...(spec.value.vals || SPACES[activeSpaceId].defaultVals)];
    let axisXIndex = 2; // e.g. Hue
    let axisYIndex = 1; // e.g. Chroma
    let cssWidth = 300;
    let cssHeight = 180;

    // -- DOM Elements --
    const header = $div("header");
    const titleLabel = $element("label");
    titleLabel.innerText = spec.label;
    const spaceSelect = $element("select");
    header.$with(titleLabel, spaceSelect);

    const swatch = $div("swatch");
    const output = $div("output");
    const preview = $div("preview").$with(swatch, output);

    const axisX = $element("select");
    const axisY = $element("select");
    const labelX = $element("label");
    const labelY = $element("label");
    labelX.append("X: ", axisX);
    labelY.append("Y: ", axisY);
    const axisControls = $div("axis-controls").$with(labelX, labelY);

    const canvas = $element("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    const cursor = $div("cursor");
    const areaContainer = $div("area-container").$with(canvas, cursor);

    const slidersContainer = $div("sliders");
    const sliderGroups = [0, 1, 2].map(i => {
        const group = $div("slider-group");
        const nameSpan = $element("span");
        const valSpan = $element("span");
        valSpan.className = "val";
        
        const label = $element("label").$with(nameSpan, valSpan);
        const input = $element("input");
        input.type = "range";
        
        group.$with(label, input);
        return { group, nameSpan, valSpan, input, index: i };
    });
    slidersContainer.$with(...sliderGroups.map(s => s.group));

    control.$with(header, preview, axisControls, areaContainer, slidersContainer);

    // -- Logic --
    for (const [id, config] of Object.entries(SPACES)) {
        const opt = $element("option");
        opt.value = id;
        opt.innerText = config.name;
        if (id === activeSpaceId) opt.selected = true;
        spaceSelect.appendChild(opt);
    }

    function initSpace() {
        const space = SPACES[activeSpaceId];
        
        axisX.innerHTML = "";
        axisY.innerHTML = "";
        space.channels.forEach((ch, i) => {
            const optX = $element("option");
            optX.value = i; optX.innerText = ch.name;
            if (i === axisXIndex) optX.selected = true;
            axisX.appendChild(optX);

            const optY = $element("option");
            optY.value = i; optY.innerText = ch.name;
            if (i === axisYIndex) optY.selected = true;
            axisY.appendChild(optY);
        });

        sliderGroups.forEach((sg, i) => {
            const ch = space.channels[i];
            sg.nameSpan.innerText = ch.name;
            sg.input.min = ch.min;
            sg.input.max = ch.max;
            sg.input.step = ch.step;
        });

        renderArea();
        updateUI();
    }

    function makeColor(overrideX, overrideY) {
        let temp = [...vals];
        if (overrideX !== undefined) temp[axisXIndex] = overrideX;
        if (overrideY !== undefined) temp[axisYIndex] = overrideY;
        return SPACES[activeSpaceId].toCss(temp);
    }

    function getSliderGradient(channelIndex) {
        const space = SPACES[activeSpaceId];
        const ch = space.channels[channelIndex];
        const numStops = ch.max > 100 ? 10 : 2; 
        
        let stops = [];
        for(let i=0; i<=numStops; i++) {
            let temp = [...vals];
            temp[channelIndex] = ch.min + (i/numStops) * (ch.max - ch.min);
            stops.push(space.toCss(temp));
        }
        return `linear-gradient(to right, ${stops.join(', ')})`;
    }

    function renderArea() {
        if (!cssWidth || !cssHeight) return;

        const space = SPACES[activeSpaceId];
        const chX = space.channels[axisXIndex];
        const chY = space.channels[axisYIndex];

        const rowHeight = 2; 
        const stops = 10;    

        ctx.clearRect(0, 0, cssWidth, cssHeight);

        for (let y = 0; y < cssHeight; y += rowHeight) {
            const normY = 1 - (y / (cssHeight - 1));
            const valY = chY.min + (normY * (chY.max - chY.min));
            
            const grad = ctx.createLinearGradient(0, 0, cssWidth, 0);
            for (let j = 0; j <= stops; j++) {
                const normX = j / stops;
                const valX = chX.min + (normX * (chX.max - chX.min));
                grad.addColorStop(normX, makeColor(valX, valY));
            }

            ctx.fillStyle = grad;
            ctx.fillRect(0, y, cssWidth, rowHeight + 0.5); 
        }
    }

    function updateUI(triggerCallback = true) {
        const space = SPACES[activeSpaceId];
        const cssStr = space.toCss(vals);
        
        swatch.style.backgroundColor = cssStr;
        output.innerText = cssStr;

        sliderGroups.forEach((sg, i) => {
            const ch = space.channels[i];
            sg.input.value = vals[i];
            sg.valSpan.innerText = ch.format(vals[i]);
            sg.input.style.background = getSliderGradient(i);
        });

        const chX = space.channels[axisXIndex];
        const chY = space.channels[axisYIndex];
        const normX = (vals[axisXIndex] - chX.min) / (chX.max - chX.min);
        const normY = (vals[axisYIndex] - chY.min) / (chY.max - chY.min);

        cursor.style.left = `${normX * 100}%`;
        cursor.style.top = `${(1 - normY) * 100}%`;

        if (triggerCallback) {
            const payload = { space: activeSpaceId, vals: [...vals], css: cssStr };
            spec.onUpdate?.(payload, set, panelState);
        }
    }

    function resizeCanvas() {
        const rect = areaContainer.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        cssWidth = rect.width;
        cssHeight = rect.height;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
        ctx.scale(dpr, dpr);

        renderArea();
    }

    // -- Event Listeners --

    spaceSelect.addEventListener("change", e => {
        activeSpaceId = e.target.value;
        vals = [...SPACES[activeSpaceId].defaultVals];
        axisXIndex = 2;
        axisYIndex = 1;
        initSpace();
    });

    function handleAxisChange(changedAxis, newValue) {
        newValue = parseInt(newValue);
        if (changedAxis === 'X') {
            if (newValue === axisYIndex) { axisYIndex = axisXIndex; axisY.value = axisYIndex; }
            axisXIndex = newValue;
        } else {
            if (newValue === axisXIndex) { axisXIndex = axisYIndex; axisX.value = axisXIndex; }
            axisYIndex = newValue;
        }
        renderArea(); updateUI();
    }

    axisX.addEventListener("change", e => handleAxisChange("X", e.target.value));
    axisY.addEventListener("change", e => handleAxisChange("Y", e.target.value));

    sliderGroups.forEach(sg => {
        sg.input.addEventListener("input", e => {
            vals[sg.index] = parseFloat(e.target.value);
            if (sg.index !== axisXIndex && sg.index !== axisYIndex) renderArea();
            updateUI();
        });
    });

    let isDragging = false;
    function handlePointer(e) {
        if (!isDragging) return;
        
        const rect = areaContainer.getBoundingClientRect();
        let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        let y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

        const normX = x / rect.width;
        const normY = 1 - (y / rect.height);
        
        const chX = SPACES[activeSpaceId].channels[axisXIndex];
        const chY = SPACES[activeSpaceId].channels[axisYIndex];

        vals[axisXIndex] = chX.min + (normX * (chX.max - chX.min));
        vals[axisYIndex] = chY.min + (normY * (chY.max - chY.min));
        
        updateUI();
    }

    areaContainer.addEventListener("pointerdown", e => {
        isDragging = true;
        areaContainer.setPointerCapture(e.pointerId);
        handlePointer(e);
    });
    areaContainer.addEventListener("pointermove", handlePointer);
    areaContainer.addEventListener("pointerup", () => isDragging = false);
    areaContainer.addEventListener("pointercancel", () => isDragging = false);

    const resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
    });
    resizeObserver.observe(areaContainer);

    // -- Boot Options --
    
    // Set allows external resets mapping via identical signature to the slider event
    const set = (payload) => {
        if (payload.space && SPACES[payload.space]) {
            activeSpaceId = payload.space;
            vals = [...payload.vals];
            spaceSelect.value = activeSpaceId;
            initSpace(); // Rebuilds DOM bindings then triggers UI
        }
    };

    const hide = () => control.setAttribute("hidden", "");
    const show = () => control.removeAttribute("hidden");

    initSpace();

    return { dom: [control], set, show, hide };
}
