
export function chatEntry(role, content) {
    return { role, content };
}

function noCollect() {
    return {
        name: null,
        collect: (line) => {},
        finalize: () => {}
    };
}

function literalCollector(name) {
    const lines = [];

    const collect = (line) => {
        lines.push(line);
    };

    const finalize = () => {
        let result = "";
        let inBlankRun = false;

        for (const line of lines) {
            if (line === "") {
                inBlankRun = true;
            } else {
                if (result.length > 0) {
                    result += inBlankRun ? '\n\n' : ' ';
                }
                result += line;
                inBlankRun = false;
            }
        }

        return result;
    };

    return {
        name,
        collect,
        finalize
    };
}

function chatCollector(name) {
    let chat = [];
    let collector = noCollect();

    const collect = (line) => {
        if (['.user:', '.system:', '.assistant:'].includes(line)) {
            let role = line.slice(1, -1);
            if (collector.name !== null) {
                chat.push(chatEntry(collector.name, collector.finalize()));
            }
            collector = literalCollector(role);
        }
        else {
            collector.collect(line);
        }
    };

    const finalize = () => {
        if (collector.name !== null) {
            chat.push(chatEntry(collector.name, collector.finalize()));
        }
        return chat;
    };

    return {
        name,
        collect,
        finalize
    };
}



export function readChatlog(text) {
    const lines = text.split('\n');

    if (
        lines.length < 3 || lines[0] !== '' ||
        !lines[1].startsWith('chatlog ') || lines[2] !== ''
    ) {
        throw new Error('invalid chatlog header');
    }

    // ignore version number for now

    let chatlog = {};

    let collector = noCollect();

    for (let lineIndex = 3; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];

        if (line.startsWith(".chat ")) {
            let name = line.slice(6); // rest of the line
            if (collector.name !== null) {
                console.log(collector);
                chatlog[collector.name] = collector.finalize();
            }
            collector = chatCollector(name);
        }
        else if (line.startsWith(".literal ")) {
            let name = line.slice(9); // rest of the line
            if (collector.name !== null) {
                chatlog[collector.name] = collector.finalize();
            }
            collector = literalCollector(name);
        }
        else {
            collector.collect(line);
        }
    }

    if (collector.name !== null) {
        chatlog[collector.name] = collector.finalize();
    }

    return chatlog;
}

export async function loadChatlog(uri) {
    const response = await fetch(uri);

    if (!response.ok) {
        throw new Error(`could not load ${uri}`);
    }

    const source = await response.text();

    return readChatlog(source);
}

