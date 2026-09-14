
export async function main() {
    const topmost = $div("pyt-debug");

    const output = $div("pyt-debug-output");
    const input = $element("input");
    input.type = "text";
    input.placeholder = "message";
    const sendButton = $element("button");
    sendButton.innerText = "send";

    const controls = $div("pyt-debug-controls").$with(input, sendButton);
    topmost.$with(output, controls);

    const ws = new WebSocket("ws://" + location.hostname + ":1314");
    ws.binaryType = "arraybuffer";

    const append = (text) => {
        const line = $element("pre");
        line.innerText = text;
        output.$with(line);
    };

    const renderPayload = (payload) => {
        const line = $div("pyt-debug-line");
        if (payload.stream) {
            line.classList.add(payload.stream);
        }
        line.style.whiteSpace = "pre-wrap";
        line.style.paddingLeft = (payload.indent || 0) + "ch";
        for (const span of payload.spans) {
            const el = $element("span");
            el.className = span.style || "";
            el.innerText = span.text;
            if (span.link) {
                el.title = span.link;
                el.addEventListener("click", () => {
                    navigator.clipboard?.writeText(span.link).catch(() => {});
                });
            }
            line.$with(el);
        }
        output.$with(line);
    };

    const handleMessage = (text) => {
        let msg;
        try {
            msg = JSON.parse(text);
        } catch {}
        if (msg && Array.isArray(msg.content?.spans)) {
            renderPayload(msg.content);
        } else {
            append(text);
        }
    };

    ws.onmessage = (event) => {
        if (typeof event.data === "string") {
            handleMessage(event.data);
        } else {
            append("[binary: " + event.data.byteLength + " bytes]");
        }
    };

    ws.onopen = () => append("[connected]");
    ws.onclose = () => append("[disconnected]");
    ws.onerror = (e) => console.log(e);

    const send = () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({"to": "session 0", "content": input.value}));
        input.value = "";
    };

    sendButton.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") send();
    });

    function exitTool() {
        ws.close();
        const parent = topmost.parentNode;
        topmost.remove();
        $apply("layout/nothing", parent);
    }

    topmost.$contextMenu = {
        items: [
            ["exit", exitTool]
        ]
    };

    input.focus();

    return {
        dom: [topmost],
        replace: true
    };
}

