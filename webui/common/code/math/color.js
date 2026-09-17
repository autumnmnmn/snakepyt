
const { Math: { sqrt, atan2, cos, sin, cbrt } } = globalThis;

import { Vec3 } from "/code/math/vector.js";

// OkLab Magic Numbers from:
// Ottosson, Björn "A perceptual color space for image processing"
// https://bottosson.github.io/posts/oklab/
// https://web.archive.org/web/20260211105104/https://bottosson.github.io/posts/oklab/
// http://archive.today/2026.01.05-021858/https://bottosson.github.io/posts/oklab/

// From IEC 61966-2-1 5.2 Eqns (5) and (6)
function _linearize(value) {
    if (value <= 0.04045) {
        return value / 12.92;
    } else {
        let offset_scaled = (value + 0.055) / 1.055;
        return offset_scaled ** 2.4;
    }
}

// IEC 61966-2-1 5.3 Eqns (9) and (10)
function _nonlinearize(value) {
    if (value <= 0.0031308) {
        return value * 12.92;
    } else {
        let transformed = value ** (1.0 / 2.4);
        if (isNaN(transformed)) {
            transformed = 0;
        }
        return (1.055 * transformed) - 0.055;
    }
}

export class NonlinearSRGB {
    constructor({ red, green, blue }) {
        this.red = red;
        this.green = green;
        this.blue = blue;
    }

    static params = ["red", "green", "blue"];

    get r() { return this.red; }
    get g() { return this.green; }
    get b() { return this.blue; }

    get vector() { return Vec3.of(this.red, this.green, this.blue); }

    set vector(v) {
        this.red = v.x;
        this.green = v.y;
        this.blue = v.z;
    }

    static fromVector(v) {
        return new this({ red: v.x, green: v.y, blue: v.z });
    }

    get hex() {
        const byte = v => Math.round(Math.min(Math.max(v, 0), 1) * 255);
        const hex2 = v => byte(v).toString(16).padStart(2, "0");
        return `#${hex2(this.red)}${hex2(this.green)}${hex2(this.blue)}`;
    }

    set hex(value) {
        const ch = t => parseInt(t, 16) / 255;

        this.red   = ch(value.slice(1, 3));
        this.green = ch(value.slice(3, 5));
        this.blue  = ch(value.slice(5, 7));
    }

    static fromHex(value) {
        const ch = t => parseInt(t, 16) / 255;
        return new this({
            red: ch(value.slice(1, 3)),
            green: ch(value.slice(3, 5)),
            blue: ch(value.slice(5, 7))
        });
    }

    to_linear_srgb() {
        return new LinearSRGB({
            red: _linearize(this.red),
            green: _linearize(this.green),
            blue: _linearize(this.blue)
        });
    }

    to_css_color() {
        return new CssColor({
            cssString: this.hex,
            element: null
        });
    }
}

export const DebugPurple = new NonlinearSRGB({ red: 1, green: 0, blue: 1 });

export class LinearSRGB {
    constructor({ red, green, blue }) {
        this.red = red;
        this.green = green;
        this.blue = blue;
    }

    static params = ["red", "green", "blue"];

    get r() { return this.red; }
    get g() { return this.green; }
    get b() { return this.blue; }

    get vector() { return Vec3.of(this.red, this.green, this.blue); }

    set vector(v) {
        this.red   = v.x;
        this.green = v.y;
        this.blue  = v.z;
    }

    static fromVector(v) {
        return new this({ red: v.x, green: v.y, blue: v.z });
    }

    to_nonlinear_srgb() {
        return new NonlinearSRGB({
            red: _nonlinearize(this.red),
            green: _nonlinearize(this.green),
            blue: _nonlinearize(this.blue)
        });
    }

    to_oklab() {
        // long/medium/short cone cell responsivity types
        let long   = 0.4122214708*this.red + 0.5363325363*this.green + 0.0514459929*this.blue;
        let medium = 0.2119034982*this.red + 0.6806995451*this.green + 0.1073969566*this.blue;
        let short  = 0.0883024619*this.red + 0.2817188376*this.green + 0.6299787005*this.blue;

        long = cbrt(long);
        medium = cbrt(medium);
        short = cbrt(short);

        return new OkLab({
            lightness:   0.2104542553*long + 0.7936177850*medium - 0.0040720468*short,
            green_red:   1.9779984951*long - 2.4285922050*medium + 0.4505937099*short,
            blue_yellow: 0.0259040371*long + 0.7827717662*medium - 0.8086757660*short
        });
    }

    to_cie_xyz() {
        return new CIEXYZ({
            x: 0.4124*this.red + 0.3576*this.green + 0.1805*this.blue,
            y: 0.2126*this.red + 0.7152*this.green + 0.0722*this.blue,
            z: 0.0193*this.red + 0.1192*this.green + 0.9505*this.blue
        });
    }
}

export class OkLab {
    constructor({ lightness, green_red, blue_yellow }) {
        this.lightness = lightness;
        this.green_red = green_red; // negative=green, positive=red
        this.blue_yellow = blue_yellow; // negative=blue, positive=yellow
    }

    static params = ["lightness", "green_red", "blue_yellow"];

    get L() { return this.lightness; }
    get a() { return this.green_red; }
    get b() { return this.blue_yellow; }

    get vector() { return Vec3.of(this.lightness, this.green_red, this.blue_yellow); }

    set vector(v) {
        this.lightness   = v.x;
        this.green_red   = v.y;
        this.blue_yellow = v.z;
    }

    static fromVector(v) {
        return new this({ lightness: v.x, green_red: v.y, blue_yellow: v.z });
    }

    to_linear_srgb() {
        let long   = this.lightness + 0.3963377774*this.green_red + 0.2158037573*this.blue_yellow;
        let medium = this.lightness - 0.1055613458*this.green_red - 0.0638541728*this.blue_yellow;
        let short  = this.lightness - 0.0894841775*this.green_red - 1.2914855480*this.blue_yellow;

        long = long ** 3;
        medium = medium ** 3;
        short = short ** 3;

        return new LinearSRGB({
            red:    4.0767416621*long - 3.3077115913*medium + 0.2309699292*short,
            green: -1.2684380046*long + 2.6097574011*medium - 0.3413193965*short,
            blue:  -0.0041960863*long - 0.7034186147*medium + 1.7076147010*short
        });
    }

    to_oklch() {
        let chroma = sqrt(this.green_red**2 + this.blue_yellow**2);
        return new OkLch({
            lightness: this.lightness,
            chroma: isNaN(chroma) ? 0 : chroma,
            hue: atan2(this.blue_yellow, this.green_red)
        });
    }
}

export class OkLch {
    constructor({ lightness, chroma, hue }) {
        this.lightness = lightness;
        this.chroma = chroma;
        this.hue = hue;
    }

    static params = ["lightness", "chroma", "hue"];

    get L() { return this.lightness; }
    get c() { return this.chroma; }
    get h() { return this.hue; }

    get vector() { return Vec3.of(this.lightness, this.chroma, this.hue); }

    set vector(v) {
        this.lightness = v.x;
        this.chroma    = v.y;
        this.hue       = v.z;
    }

    static fromVector(v) {
        return new this({ lightness: v.x, chroma: v.y, hue: v.z });
    }

    to_oklab() {
        return new OkLab({
            lightness: this.lightness,
            green_red: this.chroma * cos(this.hue),
            blue_yellow: this.chroma * sin(this.hue)
        });
    }
}

export class CIEXYZ { // CIE 1931 XYZ
    constructor({ x, y, z }) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    static params = ["x", "y", "z"];

    get vector() { return Vec3.of(this.x, this.y, this.z); }

    set vector(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
    }

    static fromVector(v) {
        return new this({ x: v.x, y: v.y, z: v.z });
    }

    to_linear_srgb() {
        return new LinearSRGB({
            red:    3.2406*this.x - 1.5372*this.y - 0.4986*this.z,
            green: -0.9689*this.x + 1.8758*this.y + 0.0415*this.z,
            blue:   0.0557*this.x - 0.2040*this.y + 1.0570*this.z
        });
    }
}

export class CssColor {
    #cssString;
    #reader;

    constructor({ cssString, element }) {
        this.#cssString = cssString;

        // null = intentionally absent, meaning this is a "derived" css value
        // we only really *need* the element context for more "exotic" css
        if (element === null) {
            this.#reader = null;
            return;
        }

        if (element.$cssColorReader) {
            this.#reader = element.$cssColorReader;
        } else {
            this.#reader = $div("css-color-reader");
            element.$cssColorReader = this.#reader;

            this.#reader.style.width = "0";
            this.#reader.style.height = "0";
            this.#reader.style.position = "absolute";
            this.#reader.style.display = "block";

            this.#reader.setAttribute("aria-hidden", "true");

            element.appendChild(this.#reader);
        }

        // finally set the reader element's background color to `cssString`
        this.#reader.style.backgroundColor = cssString;
    }

    static params = ["cssString", "element"];

    // setter for `cssString` that updates the reader's css
    set cssString(value) {
        this.#cssString = value;
        this.#reader.style.backgroundColor = value;
    }

    get cssString() {
        return this.#cssString;
    }

    to_nonlinear_srgb() {
        if (this.#reader === null) {
            const h = this.#cssString.slice(1);

            return new NonlinearSRGB({
                red:   parseInt(h.slice(0, 2), 16) / 255,
                green: parseInt(h.slice(2, 4), 16) / 255,
                blue:  parseInt(h.slice(4, 6), 16) / 255
            });
        }

        const computed = getComputedStyle(this.#reader).backgroundColor;

        if (!computed) return DebugPurple;

        const nums = computed.match(/[\d.]+/g);

        return new NonlinearSRGB({
            red:   parseFloat(nums[0]) / 255,
            green: parseFloat(nums[1]) / 255,
            blue:  parseFloat(nums[2]) / 255
        });
    }
}

function oklch_helix_map(
    lightness = [0.2, 0.9],
    chroma = 0.1,
    hue_start = 0.0,
    rotations = 1.0
) {
    /** returns a function [0,1] -> OkLch tracing a helix through oklch space.
        lightness ramps linearly, chroma interpolates, hue sweeps rotations*tau. */
    const [lightness_start, lightness_end] = Array.isArray(lightness) ? lightness : [lightness, lightness];
    const [chroma_start, chroma_end]       = Array.isArray(chroma)    ? chroma    : [chroma, chroma];

    function sample(t) {
        return new OkLch({
            lightness: lightness_start + t * (lightness_end - lightness_start),
            chroma:    chroma_start    + t * (chroma_end    - chroma_start),
            hue:       hue_start       + t * rotations * $tau,
        });
    }
    return sample;
}

const _CONVERSION_EDGES = new Map([
    [NonlinearSRGB, [
        [LinearSRGB, x => x.to_linear_srgb()],
        [CssColor, x => x.to_css_color()]
    ]],
    [LinearSRGB, [
        [NonlinearSRGB, x => x.to_nonlinear_srgb()],
        [OkLab,         x => x.to_oklab()],
        [CIEXYZ,        x => x.to_cie_xyz()]
    ]],
    [OkLab, [
        [LinearSRGB, x => x.to_linear_srgb()],
        [OkLch,      x => x.to_oklch()]
    ]],
    [OkLch, [
        [OkLab, x => x.to_oklab()]
    ]],
    [CIEXYZ, [
        [LinearSRGB, x => x.to_linear_srgb()]
    ]],
    [CssColor, [
        [NonlinearSRGB, x => x.to_nonlinear_srgb()]
    ]]
]);

// map of maps of "maps" :^)
// Source -> (Target -> conversion function)
const _color_map_cache = new Map();

function color_map(source, target) {
    if (source === target) {
        return x => x;
    }

    let sourceCache = _color_map_cache.get(source);
    if (sourceCache) {
        let cached = sourceCache.get(target);
        if (cached) return cached;
    }

    let queue = [[source, []]];
    let visited = new Set([source]);

    while (queue.length > 0) {
        let [node, path] = queue.shift();
        let edges = _CONVERSION_EDGES.get(node) || [];

        for (let [neighbor, convert] of edges) {
            let new_path = [...path, convert];
            if (neighbor === target) {
                function chain_fn(x, p=new_path) {
                    for (let f of p) {
                        x = f(x);
                    }
                    return x;
                }
                if (!sourceCache) {
                    sourceCache = new Map();
                    _color_map_cache.set(source, sourceCache);
                }
                sourceCache.set(target, chain_fn);
                return chain_fn;
            }
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([neighbor, new_path]);
            }
        }
    }

    throw new Error(`no conversion path: ${source.name} -> ${target.name}`);
}

// General-purpose convertible color
// Access requires specifying desired color space
export class Color {
    #source = null;

    #nonlinear_srgb = null;
    #linear_srgb = null;
    #oklab = null;
    #oklch = null;
    #cie_xyz = null;
    #css_color = null;

    // TODO (eventually) (maybe)
    // relative transformations with provenance-chain tracking;

    constructor(value) {
        this.#source = value.constructor;
        this.#setSlot(this.#source, value);
    }

    #getSlot(type) {
        switch (type) {
            case NonlinearSRGB: return this.#nonlinear_srgb;
            case LinearSRGB:    return this.#linear_srgb;
            case OkLab:         return this.#oklab;
            case OkLch:         return this.#oklch;
            case CIEXYZ:        return this.#cie_xyz;
            case CssColor:      return this.#css_color;
            default:            return undefined;
        }
    }

    #setSlot(type, value) {
        switch (type) {
            case NonlinearSRGB: this.#nonlinear_srgb = value; break;
            case LinearSRGB:    this.#linear_srgb = value;    break;
            case OkLab:         this.#oklab = value;          break;
            case OkLch:         this.#oklch = value;          break;
            case CIEXYZ:        this.#cie_xyz = value;        break;
            case CssColor:      this.#css_color = value;      break;
        }
    }

    get(type) {
        let val = this.#getSlot(type);
        if (val !== null) return val;

        const sourceValue = this.#getSlot(this.#source);
        const conversion = color_map(this.#source, type);
        const result = conversion(sourceValue);

        this.#setSlot(type, result);
        return result;
    }

    get NonlinearSRGB() { return this.get(NonlinearSRGB); }
    get LinearSRGB()    { return this.get(LinearSRGB); }
    get OkLab()         { return this.get(OkLab); }
    get OkLch()         { return this.get(OkLch); }
    get CIEXYZ()        { return this.get(CIEXYZ); }
    get CssColor()      { return this.get(CssColor); }

    static NonlinearSRGB(components)     { return new this(new NonlinearSRGB(components)); }
    static LinearSRGB(components)        { return new this(new LinearSRGB(components)); }
    static OkLab(components)             { return new this(new OkLab(components)); }
    static OkLch(components)             { return new this(new OkLch(components)); }
    static CIEXYZ(components)            { return new this(new CIEXYZ(components)); }
    static CssColor(cssString, element)  { return new this(new CssColor(cssString, element)); }

    set(value) {
        this.#nonlinear_srgb = null;
        this.#linear_srgb = null;
        this.#oklab = null;
        this.#oklch = null;
        this.#cie_xyz = null;
        this.#css_color = null;

        this.#source = value.constructor;
        this.#setSlot(this.#source, value);
    }

    get type() {
        return this.#source;
    }
}

const interpolators = new Map([
    ["linear", Vec3.lerp],

    ["smoothstep", Vec3.smoothstep],

    // for oklch
    ["hue-shortest", (a, b, t) => {
        let dh = b.z - a.z;
        dh -= $tau * Math.round(dh / $tau);
        return Vec3.of(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + dh * t
        );
    }]
]);

export class Gradient {
    #points;
    #space;
    #interpolate;

    constructor({ points, space = OkLab, method = "linear" }) {
        if (points.length < 2) {
            throw new Error("gradient needs at least 2 points");
        }

        this.#points = points
            .map(point => ({
                position: Math.min(Math.max(point.position, 0), 1),
                color: point.color
            }))
            .sort((p, q) => p.position - q.position);

        this.#space = space;

        this.#interpolate = typeof method === "function"
            ? method
            : interpolators.get(method);
        if (!this.#interpolate) {
            throw new Error(`unknown interpolation method: ${method}`);
        }
    }

    static of(...positionedColors) {
        return new this({
            points: positionedColors.map(([position, color]) => ({ position, color }))
        });
    }

    #segment(t) {
        const points = this.#points;
        const last = points.length - 1;

        if (t <= points[0].position)    return { a: points[0],    b: points[0],    local_t: 0 };
        if (t >= points[last].position) return { a: points[last], b: points[last], local_t: 0 };

        let i = 0;
        while (points[i + 1].position <= t) i++;

        const a = points[i], b = points[i + 1];
        const span = b.position - a.position;
        return { a, b, local_t: span > 0 ? (t - a.position) / span : 0 };
    }

    set space(spaceClass) {
        this.#space = spaceClass;
    }

    at(t) {
        if (t < 0) t = 0;
        if (t > 1) t = 1;

        const { a, b, local_t } = this.#segment(t);

        const va = a.color.get(this.#space).vector;
        const vb = b.color.get(this.#space).vector;

        return new Color(this.#space.fromVector(this.#interpolate(va, vb, local_t)));
    }

    precompute(array_length) {
        const points = this.#points;
        const last = points.length - 1;
        const space = this.#space;
        const interp = this.#interpolate;

        const vectors = points.map(p => p.color.get(space).vector);

        const out = new Array(array_length);
        let current_segment = 0;

        for (const [i, t] of linspace(0, 1, array_length).entries()) {
            if (t <= points[0].position) {
                out[i] = new Color(space.fromVector(vectors[0]));
                continue;
            }
            if (t >= points[last].position) {
                out[i] = new Color(space.fromVector(vectors[last]));
                continue;
            }

            while (current_segment < last - 1 && points[current_segment + 1].position <= t) current_segment++;

            const a = points[current_segment], b = points[current_segment + 1];
            const span = b.position - a.position;
            const local_t = span > 0 ? (t - a.position) / span : 0;

            out[i] = new Color(space.fromVector(
                interp(vectors[current_segment], vectors[current_segment + 1], local_t)
            ));
        }

        return out;
    }
}

