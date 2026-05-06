
export function splitDouble(x) {
    const hi = Math.fround(x);
    const lo = x - hi;
    return [hi, lo];
}

