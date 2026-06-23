

export const linspace = (start, end, n) =>
    Array.from({ length: n }, (_, i) => start + (end - start) * i / (n - 1))

export const identity = (x => x);

