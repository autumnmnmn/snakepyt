
import { Vec2 } from "/code/math/vector.js";
import "/code/math/constants.js";

export class Complex {
    /**
     * @param {boolean} isCart - The "preferred" identity of the object
     * @param {boolean} cartValid - True if _re and _im are currently accurate
     * @param {boolean} polarValid - True if _r and _th are currently accurate
     * @param {number} re - Real part
     * @param {number} im - Imaginary part
     * @param {number} r - Radius
     * @param {number} th - Theta
     */
    constructor(isCart, cartValid, polarValid, re, im, r, th) {
        // Monomorphic Shape: 7 properties, strictly ordered, never added/deleted.
        this.isCart = isCart;
        this.cartValid = cartValid;
        this.polarValid = polarValid;
        this._re = re;
        this._im = im;
        this._r = r;
        this._th = th;
    }

    static cart(re, im) {
        return new Complex(true, true, false, re, im, 0, 0);
    }

    static polar(r, theta) {
        return new Complex(false, false, true, 0, 0, r, theta);
    }

    // ========= Cached Getters =========== //

    get re() {
        if (!this.cartValid) {
            this._re = this._r * Math.cos(this._th);
            this._im = this._r * Math.sin(this._th); // Cache counterpart for free
            this.cartValid = true;
        }
        return this._re;
    }

    get im() {
        if (!this.cartValid) {
            this._re = this._r * Math.cos(this._th);
            this._im = this._r * Math.sin(this._th);
            this.cartValid = true;
        }
        return this._im;
    }

    get x() { return this.re; }
    get y() { return this.im; }

    get r() {
        if (!this.polarValid) {
            this._r = Math.sqrt(this._re * this._re + this._im * this._im);
            this._th = Math.atan2(this._im, this._re);
            this.polarValid = true;
        }
        return this._r;
    }

    get theta() {
        if (!this.polarValid) {
            this._r = Math.sqrt(this._re * this._re + this._im * this._im);
            this._th = Math.atan2(this._im, this._re);
            this.polarValid = true;
        }
        return this._th;
    }

    get mag()   { return this.r; }
    get mod()   { return this.r; }
    get arg()   { return this.theta; }
    get angle() { return this.theta; }

    get magSq() {
        return this.polarValid ? this._r * this._r : this._re * this._re + this._im * this._im;
    }

    // ========= Setters (Cache Invalidating) =========== //

    set re(val) {
        if (!this.cartValid) {
            this._im = this._r * Math.sin(this._th); // Save missing counterpart before overwriting
        }
        this._re = val;
        this.cartValid = true;
        this.polarValid = false; // Invalidate polar cache
        this.isCart = true;      // Mutating cartesian implies cartesian preference
    }

    set im(val) {
        if (!this.cartValid) {
            this._re = this._r * Math.cos(this._th);
        }
        this._im = val;
        this.cartValid = true;
        this.polarValid = false;
        this.isCart = true;
    }

    set x(val) { this.re = val; }
    set y(val) { this.im = val; }

    set r(val) {
        if (!this.polarValid) {
            this._th = Math.atan2(this._im, this._re);
        }
        this._r = val;
        this.polarValid = true;
        this.cartValid = false;
        this.isCart = false; // Mutating polar implies polar preference
    }

    set theta(val) {
        if (!this.polarValid) {
            this._r = Math.sqrt(this._re * this._re + this._im * this._im);
        }
        this._th = val;
        this.polarValid = true;
        this.cartValid = false;
        this.isCart = false;
    }

    set mag(val)   { this.r = val; }
    set mod(val)   { this.r = val; }
    set arg(val)   { this.theta = val; }
    set angle(val) { this.theta = val; }

    // ========= Operations =========== //

    get copy() {
        return new Complex(this.isCart, this.cartValid, this.polarValid, this._re, this._im, this._r, this._th);
    }

    dot(other) {
        return this.re * other.re + this.im * other.im;
    }

    add(other) {
        const tr = this.re + other.re;
        const ti = this.im + other.im;
        // Lazily retains `this.isCart` preference without forcing eager polar calculation
        return new Complex(this.isCart, true, false, tr, ti, 0, 0);
    }

    sub(other) {
        const tr = this.re - other.re;
        const ti = this.im - other.im;
        return new Complex(this.isCart, true, false, tr, ti, 0, 0);
    }

    mul(other) {
        // Fast path: If both already have valid polar coords, entirely bypass trig & algebra
        if (this.polarValid && other.polarValid) {
            const nr = this._r * other._r;
            const nth = this._th + other._th;
            return new Complex(this.isCart, false, true, 0, 0, nr, nth);
        }

        const tr = this.re, ti = this.im;
        const or = other.re, oi = other.im;
        const nr = tr * or - ti * oi;
        const ni = tr * oi + ti * or;

        return new Complex(this.isCart, true, false, nr, ni, 0, 0);
    }

    // ========= Screen Projection =========== //

    toPixel(dims, center, rotation, scale) {
        const angle = -$tau * rotation;
        const c = Math.cos(angle);
        const s = Math.sin(angle);

        const cr = this.re - center.re;
        const ci = this.im - center.im;

        const coords_x = c * cr - s * ci;
        const coords_y = s * cr + c * ci;

        // Algebraic truth: The aspect ratio perfectly cancels out here
        const scaleFactor = dims.y / scale;

        const px = (coords_x) * scaleFactor + dims.x * 0.5;
        const py = (coords_y) * scaleFactor + dims.y * 0.5;

        return new Vec2(px, py);
    }

    static fromPixel(z, dims, center, rotation, scale) {
        const zx = z.x - dims.x * 0.5;
        const zy = z.y - dims.y * 0.5;

        const angle = $tau * rotation;
        const c = Math.cos(angle);
        const s = Math.sin(angle);

        const coords_x = c * zx - s * zy;
        const coords_y = s * zx + c * zy;

        // Reverse calculation of the identical mathematical truth
        const inverseScale = scale / dims.y;

        const cx = (coords_x) * inverseScale + center.re;
        const cy = (coords_y) * inverseScale + center.im;

        return Complex.cart(cx, cy);
    }
}

export const cartesian = Complex.cart;
export const polar = Complex.polar;

/*
// ========= Cartesian =========== //

function c_cart_constructor(re, im) {
    return { re, im };
}

function c_cart_copy(z) {
    return { re: z.re, im: z.im };
}

function c_cart_dot(a, b) {
    return Math.sqrt(a.re * b.re + a.im * b.im);
}

function c_cart_sub(a, b) {
    return {
        re: a.re - b.re,
        im: a.im - b.im
    };
}

function c_cart_mul(a, b) {
    return {
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re
    };
}

function c_cart_add(a, b) {
    return {
        re: a.re + b.re,
        im: a.im + b.im
    };
}

function c_cart_mag(z) {
    return c_cart_dot(z, z);
}

function c_cart_mag_squared(z) {
    return z.re * z.re + z.im * z.im;
}

function c_cart_angle(z) {
    return Math.atan2(z.im, z.re);
}

function c_cart_to_polar(z) {
    return {
        r: c_cart_mag(z),
        theta: c_cart_angle(z)
    };
}

function c_cart_to_pixel(z, dims, center, rotation, scale) {
    const aspect = dims.x / dims.y;
    const angle = -$tau * rotation;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const coords = c_cart_sub(z, center);
    const coords_x = c * coords.re - s * coords.im;
    const coords_y = s * coords.re + c * coords.im;

    const px = (coords_x) * dims.x / (scale * aspect) + dims.x * 0.5;
    const py = (coords_y) * dims.y / scale + dims.y * 0.5;
    return {
        x: px,
        y: py
    };
}


import { v2 } from "/code/math/vector.js";
import "/code/math/constants.js";

function c_cart_from_pixel(z, dims, center, rotation, scale) {
    const aspect = dims.x / dims.y;
    const coords = v2.sub(z, v2.scale(dims, 0.5));
    const angle = $tau * rotation;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const coords_x = c * coords.x - s * coords.y;
    const coords_y = s * coords.x + c * coords.y;
    const cx = (coords_x) * scale * aspect / dims.x + center.re;
    const cy = (coords_y) * scale / dims.y + center.im;
    return {
        re: cx,
        im: cy
    };
}

// ========= Polar =========== //

function c_polar_constructor(r, theta) {
    return { r, theta };
}

function c_polar_re(z) {
    return z.r * Math.cos(z.theta);
}

function c_polar_im(z) {
    return z.r * Math.sin(z.theta);
}

function c_polar_to_cart(z) {
    return {
        re: c_polar_re(z),
        im: c_polar_im(z)
    };
}


export const cartesian = {
    of: c_cart_constructor,
    dot: c_cart_dot,
    add: c_cart_add,
    sub: c_cart_sub,
    mul: c_cart_mul,
    mag: c_cart_mag,
    magSq: c_cart_mag_squared,
    mod: c_cart_mag,
    angle: c_cart_angle,
    arg: c_cart_angle,
    toPolar: c_cart_to_polar,
    toPixel: c_cart_to_pixel,
    fromPixel: c_cart_from_pixel,
    copy: c_cart_copy
};

export const polar = {
    of: c_polar_constructor,
    im: c_polar_im,
    y: c_polar_im,
    re: c_polar_re,
    x: c_polar_re
}
*/

