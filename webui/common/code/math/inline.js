
export const staticModule = true;

export async function main(expression) {
    return await $mod("math/math", expression, true);
}

