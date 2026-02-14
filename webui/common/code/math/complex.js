
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

function c_cart_to_pixel(z, dims, center, scale) {
    const aspect = dims.x / dims.y;
    const px = (z.re - center.re) * dims.x / (scale * aspect) + dims.x * 0.5;
    const py = (z.im - center.im) * dims.y / scale + dims.y * 0.5;
    return {
        x: px,
        y: py
    };
}

function c_cart_from_pixel(z, dims, center, scale) {
    const aspect = dims.x / dims.y;
    const cx = (z.x - dims.x * 0.5) * scale * aspect / dims.x + center.re;
    const cy = (z.y - dims.y * 0.5) * scale / dims.y + center.im;
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


window.$complex = {
    cartesian: {
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
    },

    polar: {
        of: c_polar_constructor,
        im: c_polar_im,
        y: c_polar_im,
        re: c_polar_re,
        x: c_polar_re
    }
};

