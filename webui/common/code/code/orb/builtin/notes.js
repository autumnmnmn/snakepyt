
import * as parserModule from "/code/code/orb/parse.js";
import { build, initialState } from "/code/code/orb/build.js";

import { asciiModernRomanNumeral as roman } from "/code/math/roman.js";


export async function noted(node, state) {
    let content = state.content(node);

    content = content.split("$note");

    const noteSource = content.pop().trim();
    const noted = content.join("$note"); // insane

    if (state.pendingSpace) {
        state.segment.appendChild(document.createTextNode(" "));
    }

    const groupNumeral = roman(state.upper.noteGroup + 1).toLowerCase();

    const notedElement = $element("span", "footnote backlink target");
    notedElement.classList = "noted";

    const parsedContent = parserModule.parseSource(noted);
    await (async () => {
        const notedContent = await build({ ...initialState(parsedContent),
            upper: state.upper,
            wrapperType: null
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

    const parsedNote = parserModule.parseSource(noteSource);
    const notePromise = build({ ...initialState(parsedNote),
        wrapperType: null
    });

    state.upper.pendingFootnotes.push(notePromise);

    state.inlineEnded = true;
    state.pendingSpace = true;
}

export async function footnotes(node, state) {
    let content = state.content(node);

    const header = $element("summary", "footnotes");
    header.textContent = content;

    const section = $element("details", "footnotes").$with(header);
    section.classList = "footnotes";

    const groupNumeral = roman(state.upper.noteGroup + 1).toLowerCase();
    state.upper.noteGroup += 1;

    const notes = state.pendingFootnotes;
    state.upper.pendingFootnotes = [];
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

    state.domNodes.push(section);
}


