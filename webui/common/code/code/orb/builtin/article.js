
import * as parserModule from "/code/code/orb/parse.js";
import { build, initialState } from "/code/code/orb/build.js";

import { asciiModernRomanNumeral as roman } from "/code/math/roman.js";


export async function header(node, state, args) {
    const contentsExist = !!state.upper.contents;

    const contentRaw = state.content(node);

    const contentParts = contentRaw.split("$description");

    if (contentParts.length > 2) {
        console.warn("Multiple $description subtags in one header. Wtf?");
        console.log(node);
    }

    const descriptionSource = contentParts.length > 1 ? contentParts[1].trim() : null;
    const contentSource = contentParts[0].trim();

    const parsedContent = parserModule.parseSource(contentSource);
    const content = await build({
        ...initialState(parsedContent),
        inline: true,
        upper: state.upper
    });

    console.log(content);

    const description = descriptionSource === null ? null : (
        await build({
            ...initialState(parserModule.parseSource(descriptionSource)),
            inline: true,
            upper: state.upper
        })
    );

    const entryId = args.length > 0 ? args[0] : null;
    const entryClass = args.length > 1 ? args[1] : null;

    const header = $element("h2");
    header.id = $id(entryId);

    if (contentsExist) {
        const numbered = !args.includes("numberless");

        if (numbered) {
            state.upper.contentsNumbered += 1;
        }
        const number = numbered ? state.upper.contentsNumbered : null;

        const numeral = numbered ? roman(number).toUpperCase() : null;

        const numeralText = numbered ?
            document.createTextNode(`§ ${numeral}. `) :
            document.createTextNode("❖ ");

        const numeralNodes = [numeralText];

        const li = $element("li", "contents entry");
        if (entryClass) li.classList = entryClass;

        const link = $element("a");
        if (entryId) link.href = `#${header.id}`;

        state.upper.contentsEntries.appendChild(
            li.$with(
                link.$with(...content.domNodes.map(n => n.cloneNode(true))),
                ...((description === null) ? [] :
                    [
                        $element("br"),
                        ...description.domNodes
                    ]
                )
            )
        );

        const backlink = $element("a");
        backlink.href = `#${state.upper.contents.id}`;
        backlink.textContent = "↩ contents";

        state.domNodes.push(
            $element("hgroup").$with(
                header.$with(
                    ...numeralNodes,
                    ...content.domNodes
                ),
                $element("p").$with(backlink)
            )
        );
    }
    else // !contentsExist
    {
        state.domNodes.push(
            header.$with(
                ...content.domNodes
            )
        );
    }


    /*

    const groupNumeral = roman(state.upper.noteGroup + 1).toLowerCase();

    const notedElement = $element("span", "footnote backlink target");
    notedElement.classList = "noted";

    const parsedContent = parserModule.parseSource(noted);
    await (async () => {
        const notedContent = await build({ ...initialState(parsedContent),
            inline: true,
            upper: state.upper
        });
        notedElement.append(...notedContent.domNodes);
    })();

    state.upper.noteIndex += 1;
    const noteNumeral = roman(state.upper.noteIndex).toLowerCase();
    notedElement.id = `footnote_backref_${groupNumeral}_${noteNumeral}`;

    const link = $element("a", "footnote link");
    link.href = `#footnote_${groupNumeral}_${noteNumeral}`
    link.textContent = `${noteNumeral}`;

    state.segment.append(notedElement, $element("sup", "footnote").$with(link));

    if (descriptionSource !== null) {
        const parsedNote = parserModule.parseSource(descriptionSource);
        const notePromise = build({ ...initialState(parsedNote),
            inline: true,
        });
        state.upper.pendingDescriptions.push(notePromise);
    }


    state.inlineEnded = true;
    state.pendingSpace = true;
    */
}

export async function contentsEntry(node, state, args) {
    if (!state.upper.contents) {
        console.warn("Tried to add contents entry to a page w/ no contents.");
        console.log(node);
        return;
    }

    const contentRaw = state.content(node);

    const contentParts = contentRaw.split("$description");

    if (contentParts.length > 2) {
        console.warn("Multiple $description subtags in one header. Wtf?");
        console.log(node);
    }

    const descriptionSource = contentParts.length > 1 ? contentParts[1].trim() : null;
    const contentSource = contentParts[0].trim();

    const parsedContent = parserModule.parseSource(contentSource);
    const content = await build({
        ...initialState(parsedContent),
        inline: true,
        upper: state.upper
    });

    console.log(content);

    const description = descriptionSource === null ? null : (
        await build({
            ...initialState(parserModule.parseSource(descriptionSource)),
            inline: true,
            upper: state.upper
        })
    );

    const entryId = args.length > 0 ? args[0] : null;
    const entryClass = args.length > 1 ? args[1] : null;

    if (entryId === null) {
        console.warn("Contents entry needs link");
        console.log(node);
    }

    const li = $element("li", "contents entry");
    if (entryClass) li.classList = entryClass;

    const link = $element("a");
    if (entryId) link.href = `#${entryId}`;

    state.upper.contentsEntries.appendChild(
        li.$with(
            link.$with(...content.domNodes),
            ...((description === null) ? [] :
                [
                    $element("br"),
                    ...description.domNodes
                ]
            )
        )
    );
}

export async function contents(node, state) {
    const header = $element("h2", "contents header");
    header.textContent = "Contents";

    const entries = $element("ol", "contents list");
    entries.type = "I";

    const nav = $element("nav", "contents");
    nav.classList = "contents";
    nav.id = $id("contents");

    state.upper.contents = nav;
    state.upper.contentsEntries = entries;
    state.upper.contentsNumbered = 0;

    state.domNodes.push(nav.$with(header, entries));
}



