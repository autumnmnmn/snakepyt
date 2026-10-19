
import * as parserModule from "/code/code/orb/parse.js";
import { build, initialState } from "/code/code/orb/build.js";

import { asciiModernRomanNumeral as roman } from "/code/math/roman.js";


export async function header(node, state, args) {
    return;
    let content = state.content(node);

    content = content.split("$description");

    const descriptionSource = (content.length > 1) ? content.pop().trim() : null;
    const noted = content.join("$note");

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
}

export async function contents(node, state) {
    //let content = state.content(node);
    const header = $element("h2", "contents header");
    header.textContent = "Contents";

    const entries = $element("ol", "contents list");

    const nav = $element("nav", "contents").$with(header, entries);
    nav.id = "contents";

    /*
    const groupNumeral = roman(state.upper.noteGroup + 1).toLowerCase();
    state.upper.noteGroup += 1;

    const notes = state.pendingDescriptions;
    state.upper.pendingDescriptions = [];
    state.upper.noteIndex = 0;

    for (const [index, notePromise] of notes.entries()) {
        const noteNumeral = roman(index + 1).toLowerCase();

        const note = $element("aside", "footnote");
        note.id = `footnote_${groupNumeral}_${noteNumeral}`;

        const backlink = $element("a", "footnote backlink");
        backlink.href = `#footnote_backref_${groupNumeral}_${noteNumeral}`;
        backlink.textContent = noteNumeral;

        (async () => {
            note.append(...(await notePromise).domNodes);
        })();

        section.appendChild(note.$with(
            $element("sup").$with(backlink),
            document.createTextNode(" ")
        ));
    }
    */

    state.domNodes.push(nav);
}



