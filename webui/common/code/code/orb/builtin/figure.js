
import * as parserModule from "/code/code/orb/parse.js";
import { build, initialState } from "/code/code/orb/build.js";

export async function figure(node, state, args) {
    if (state.upper.figureCount === undefined) {
        state.upper.figureCount = 0;
    }

    state.upper.figureCount += 1;

    const figureSet = args[0];
    const figureName = args[1];

    const figure = $element("figure");
    const figCaption = $element("figcaption");

    const image = $element("img");
    image.src = `/media/${figureSet}/full/${figureName}.webp`;
    image.loading = "lazy";

    const linkAligner = $div("linkAligner");

    const fullSize = $element("a");
    fullSize.href = `/media/${figureSet}/full/${figureName}.webp`;
    fullSize.target = "_blank";
    fullSize.title = "Open full-size in new tab";
    fullSize.textContent = "↗";

    const captionContent = await build({
        ...state,
        nodes: node.content.nodes,
        domNodes: [],
        segment: null,
        upper: state.upper,
        wrapperType: null
    });
    figCaption.append(
        document.createTextNode(`Figure ${state.upper.figureCount}: `),
        ...captionContent.domNodes
    );

    state.domNodes.push(
        figure.$with(
            linkAligner.$with(
                image,
                fullSize
            ),
            figCaption
        )
    )
}

export async function multifigure(node, state, args) {
    console.log(node);
    console.log(state);
    console.log(args);

    for (const entry of node.content.nodes) {
        const args = state.args(entry).split("|").map(_ => _.trim());
        const content = state.content(entry);

        if (args.length !== 2) {
            console.warn("bad figure definition");
            console.log(node);
            console.log(args);
            continue;
        }

        const figureSet = args[0];
        const figureName = args[1];

        const captionContent = await build({
            ...state,
            nodes: entry.content.nodes,
            domNodes: [],
            segment: null,
            upper: state.upper,
            wrapperType: null
        });

        console.log(args);
        console.log(content);
    }
}

