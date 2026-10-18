
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

    const captionContent = await build({ ...state,
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

