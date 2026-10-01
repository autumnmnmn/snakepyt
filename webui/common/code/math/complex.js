
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

    /* atan2 distinguishes -0 from +0, and atan2(-0, -1) is -pi — off
    the principal branch (-pi, pi]. the + 0 normalizes signed zero so
    the negative real axis reads +pi. */

    get r() {
        if (!this.polarValid) {
            this._r = Math.sqrt(this._re * this._re + this._im * this._im);
            this._th = Math.atan2(this._im + 0, this._re + 0);
            this.polarValid = true;
        }
        return this._r;
    }

    get theta() {
        if (!this.polarValid) {
            this._r = Math.sqrt(this._re * this._re + this._im * this._im);
            this._th = Math.atan2(this._im + 0, this._re + 0);
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
        return new Complex(this.isCart, true, false, tr, ti, 0, 0);
    }

    sub(other) {
        const tr = this.re - other.re;
        const ti = this.im - other.im;
        return new Complex(this.isCart, true, false, tr, ti, 0, 0);
    }

    mul(other) {
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

    scale(s) {
        return new Complex(this.isCart, true, false, s * this.re, s * this.im, 0, 0);
    }

    neg() {
        return Complex.cart(-this.re, -this.im);
    }

    conj() {
        return Complex.cart(this.re, -this.im);
    }

    inv() {
        const d = this.re * this.re + this.im * this.im;
        return Complex.cart(this.re / d, -this.im / d);
    }

    div(other) {
        const d = other.re * other.re + other.im * other.im;
        return Complex.cart(
            (this.re * other.re + this.im * other.im) / d,
            (this.im * other.re - this.re * other.im) / d
        );
    }

    exp() {
        return Complex.polar(Math.exp(this.re), this.im);
    }

    // principal branch: log(r) + i*theta, theta in (-pi, pi]
    log() {
        return Complex.cart(Math.log(this.r), this.theta);
    }

    pow(other) {
        const w = other instanceof Complex ? other : Complex.cart(other, 0);
        return this.log().mul(w).exp();
    }

    sqrt() {
        return Complex.polar(Math.sqrt(this.r), this.theta / 2);
    }

    sin() {
        return Complex.cart(
            Math.sin(this.re) * Math.cosh(this.im),
            Math.cos(this.re) * Math.sinh(this.im)
        );
    }

    cos() {
        return Complex.cart(
            Math.cos(this.re) * Math.cosh(this.im),
            -Math.sin(this.re) * Math.sinh(this.im)
        );
    }

    tan() {
        return this.sin().div(this.cos());
    }

    sinh() {
        return Complex.cart(
            Math.sinh(this.re) * Math.cos(this.im),
            Math.cosh(this.re) * Math.sin(this.im)
        );
    }

    cosh() {
        return Complex.cart(
            Math.cosh(this.re) * Math.cos(this.im),
            Math.sinh(this.re) * Math.sin(this.im)
        );
    }

    tanh() {
        return this.sinh().div(this.cosh());
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

        const inverseScale = scale / dims.y;

        const cx = (coords_x) * inverseScale + center.re;
        const cy = (coords_y) * inverseScale + center.im;

        return Complex.cart(cx, cy);
    }
}

export const cartesian = Complex.cart;
export const polar = Complex.polar;

