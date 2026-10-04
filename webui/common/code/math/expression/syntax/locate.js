/* locate — source locations for error messages.

every error in the library names the source index of the node that
caused it ("at index N"); the index alone is a poor thing to hand a
user, so the pipeline boundaries (tokenize, buildProgram, fill,
fillProgram — everything that holds the source text) upgrade the
errors that pass through them: locateError rewrites a trailing "at
index N" into the line and column and appends the offending source
line with a caret under the position:

    'sin' cannot be applied to (bool) at line 2, column 9 (index 20):
    2 |     y + sin(flag)
      |         ^

an upgraded error is flagged (sourceLocated), so the nested pipeline
calls (fill re-filling under a splice, buildTree over buildProgram)
never rewrite one twice. passes that never see the source
(differentiate, the rewrite passes, codegen) keep their plain "at
index N" messages; a caller holding the source can upgrade them with
locateError itself. */

export function lineColOf(source, index) {
    let line = 1;
    let column = 1;

    for (let i = 0; i < index && i < source.length; i++) {
        if (source[i] === "\n") {
            line++;
            column = 1;
        } else {
            column++;
        }
    }

    return { line, column };
}

/* "at line L, column C (index N)" followed by the source line and a
caret under column C. an index past the end of the source (a node a
pass built with a stale span) gets the bare coordinates, no excerpt. */

export function showLocation(source, index) {
    const { line, column } = lineColOf(source, index);
    const header = `at line ${line}, column ${column} (index ${index})`;

    if (index > source.length) {
        return header;
    }

    const start = source.lastIndexOf("\n", index - 1) + 1;
    const newline = source.indexOf("\n", index);
    const text = source.slice(start, newline === -1 ? source.length : newline);

    return (
        `${header}:\n` +
        `${line} | ${text}\n` +
        `${" ".repeat(String(line).length)} | ${" ".repeat(column - 1)}^`
    );
}

const indexPattern = / at index (\d+)\.?$/;

export function locateError(error, source) {
    if (source === undefined || error.sourceLocated) {
        return error;
    }

    error.sourceLocated = true;

    const match = error.message.match(indexPattern);

    if (match) {
        error.message =
            error.message.slice(0, match.index) +
            " " +
            showLocation(source, Number(match[1]));
    }

    return error;
}
