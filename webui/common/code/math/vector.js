
function vec2_of(x, y) {
    return { x, y };
}

function vec2_from_mouse(event, element) {
    const rect = element.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function vec2_sub(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y
    };
}

function vec2_scalar_mult(v, s) {
    return {
        x: v.x * s,
        y: v.y * s
    };
}

window.$vector = {
    v2: {
        of: vec2_of,
        fromMouse: vec2_from_mouse,
        sub: vec2_sub,
        scale: vec2_scalar_mult
    }
};

