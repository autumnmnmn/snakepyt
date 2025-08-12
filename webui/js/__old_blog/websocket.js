export function connect(name, uri = 'localhost:8765', onMessage = (e) => { }) {
    statusUpdate(name, 'closed');
    if (name in m.websocket.sockets) {
        m.websocket.sockets[name].close();
    }
    var ws = new WebSocket('ws://localhost:8765');
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('message', onMessage);
    ws.addEventListener('open', () => { statusUpdate(name, 'open'); });
    ws.addEventListener('close', () => { statusUpdate(name, 'closed'); });
    m.websocket.sockets[name] = ws;
}
export function onStatusUpdate(name, handler) {
    m.websocket.statusHandlers[name] = handler;
}
function statusUpdate(name, status) {
    if (name in m.websocket.statusHandlers) {
        m.websocket.statusHandlers[name](status);
    }
}
export var sockets = {};
export var statusHandlers = {};
export function send(name, data) {
    if (m.websocket.sockets[name].readyState === WebSocket.OPEN) {
        m.websocket.sockets[name].send(JSON.stringify(data));
        return;
    }
    m.websocket.sockets[name].addEventListener('open', () => {
        m.websocket.sockets[name].send(JSON.stringify(data));
    }, { once: true });
}
export function sender(name) { return (data) => send(name, data); }
