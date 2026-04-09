
$css(`
    .orb-container {
        color: var(--main-solid);
        line-height: 1.5rem;
        height: 100%;
    }
`);

function printNodes(nodes, source, depth = 0) {
  const indent = '  '.repeat(depth)
  for (const node of nodes) {
    const sym = node.tag.symbol
    const s = node.content?.start
    const e = node.content?.end
    const text = (s != null && e != null) ? JSON.stringify(source.slice(s, e+1)) : null
    console.log(`${indent}[${sym}] content(${s}..${e})${text ? ': ' + text : ''}`)
    if (node.args?.start != null)
      console.log(`${indent}  args: ${JSON.stringify(source.slice(node.args.start, node.args.end + 1))}`)
    if (node.content?.nodes?.length)
      printNodes(node.content.nodes, source, depth + 1)
  }
}

export async function main(target, orb) {
    const container = document.createElement("div");
    container.classList = "orb-container";

    const parserModule = await import(`/code/code/orb/parse.js`);
    const buildModule = await import(`/code/code/orb/build.js`);

    const parsed = await parserModule.parse(orb);

    //printNodes(parsed.nodes, parsed.source);

    await buildModule.build(container, parsed.nodes, parsed.source);

    target.appendChild(container);

    return { replace: true };
}

