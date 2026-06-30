
import "/code/gpu/webgpu.js";
import { Vec2 as v2 } from "/code/math/vector.js";
import { Complex, cartesian as cart } from "/code/math/complex.js";
import { splitDouble } from "/code/math/precision.js";

const defaults = { };

const dpr = window.devicePixelRatio || 1;

function add2dNavigationListeners(canvas, params, afterNavigate) {
    let isDragging = false;
    let lastMouse = v2.of(0,0);

    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        lastMouse = v2.fromMouse(e, canvas).scale(dpr);
        canvas.style.cursor = "all-scroll";
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!isDragging) return;

        const pMouse = v2.fromMouse(e, canvas).scale(dpr);

        const dims = v2.of(canvas.width, canvas.height);
        const center = cart(params.center_low_x + params.center_high_x, params.center_low_y + params.center_high_y);
        const scale = 1.0 / params.zoom;
        const angle = $tau * params.rotation;

        const cMouse = Complex.fromPixel(pMouse, dims, center, scale);

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const delta = pMouse.sub(lastMouse);

        const cos_a = Math.cos(angle);
        const sin_a = Math.sin(angle);

        const rotatedDelta = {
            x: cos_a * delta.x - sin_a * delta.y,
            y: sin_a * delta.x + cos_a * delta.y
        };


        var center_x = splitDouble(center.re - rotatedDelta.x * scale / canvas.height);
        var center_y = splitDouble(center.im - rotatedDelta.y * scale / canvas.height);

        params.center_low_x = center_x[1];
        params.center_low_y = center_y[1];
        params.center_high_x = center_x[0];
        params.center_high_y = center_y[0];

        lastMouse = pMouse;

        afterNavigate();
    });

    canvas.addEventListener("pointerup", () => {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = "crosshair";
    });

    canvas.addEventListener("pointerleave", () => {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = "crosshair";
    });

    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();

        const pMouse = v2.fromMouse(e, canvas).scale(dpr);

        const dims = v2.of(canvas.width, canvas.height);
        const center = cart(params.center_low_x + params.center_high_x, params.center_low_y + params.center_high_y);
        const scale = 1.0 / params.zoom;
        const rotation = params.rotation;
        const cMouse = Complex.fromPixel(pMouse, dims, center, rotation, scale);

        const isTrackpad = Math.abs(e.deltaY) < 50; // sloppy heuristic but whatever
        const zoomFactorDiff = isTrackpad ? 0.025 : 0.1;

        // negative deltaY means zoom in
        const zoomFactor = e.deltaY > 0 ? 1.0 - zoomFactorDiff : 1.0 + zoomFactorDiff;

        params.zoom *= zoomFactor;

        // Adjust center to keep mouse position fixed in complex plane
        const newScale = 1.0 / params.zoom;

        const px = pMouse.x - canvas.width * 0.5;
        const py = pMouse.y - canvas.height * 0.5;

        const angle = $tau * params.rotation;
        const cos_a = Math.cos(angle);
        const sin_a = Math.sin(angle);

        const rotatedPx = cos_a * px - sin_a * py;
        const rotatedPy = sin_a * px + cos_a * py;

        const scaleDiff = scale - newScale;

        var center_x = splitDouble(center.re + (rotatedPx * scaleDiff) / canvas.height);
        var center_y = splitDouble(center.im + (rotatedPy * scaleDiff) / canvas.height);

        params.center_low_x = center_x[1];
        params.center_low_y = center_y[1];
        params.center_high_x = center_x[0];
        params.center_high_y = center_y[0];

        afterNavigate();
    });
}



export async function main(spec) {
    if (!$gpu.available) {
        console.error("WebGPU not working; aborting module load.");
        const warning = $element("span");
        warning.innerText = "WebGPU not available.";
        target.$with(warning);
        return {
            dom: [warning]
        };
    }
    const settings = { ...defaults, ...spec };

    const canvas = document.createElement("canvas");
    canvas.className = "webgpu";

    canvas.tabIndex = 0;

    const context = canvas.getContext("webgpu");

    context.configure({ device: $gpu.device, format: $gpu.canvasFormat });

    function addNavigation(mode, params, afterNavigate) {
        if (mode === "2d") {
            canvas.style.cursor = "crosshair";
            add2dNavigationListeners(canvas, params, afterNavigate);
        }
    }

    return {
        dom: [canvas],
        replace: true,
        addNavigation,
        canvas,
        context
    };
}


