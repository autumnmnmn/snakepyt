
$css(`
    .orb-container {
        color: var(--main-solid);
        line-height: 1.5rem;
        height: 100%;
        overflow-y: scroll;
    }
`);

export async function main(target, orb) {
    const container = document.createElement("div");
    container.classList = "orb-container";

    const parserModule = await import(`/code/orb/parse.js`);
    const buildModule = await import(`/code/orb/build.js`);

    const parsed = await parserModule.parse(orb);

    //await parserModule.debugParse("test.orb");

    await buildModule.build(container, parsed.nodes, parsed.source);

    target.appendChild(container);

    return { replace: true };
}

