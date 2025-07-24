const decoder = new TextDecoder();
export const defaults = {};
const foo = 'acemnorsuvwxz';
const bar = 'bdfghijklpqt';
const baru = 'bdfhijklt';
const barl = 'gjpq';
export function instantiate(target, settings = defaults) {
    m.websocket.connect('diffusion', 'localhost:8765', (event) => {
        console.log("FOO");
        if (typeof event.data === 'string') {
            console.log(event.data);
            return;
        }
        if (event.data instanceof ArrayBuffer) {
            const view = new DataView(event.data);
            // first 4 bytes: N = length of json metadata
            const jsonLength = view.getUint32(0);
            // next N bytes: utf-8 json string
            const jsonBytes = new Uint8Array(event.data, 4, jsonLength);
            const metadata = JSON.parse(decoder.decode(jsonBytes));
            console.log(metadata);
            const blob = new Blob([new Uint8Array(event.data, 4 + jsonLength)], { type: 'image/png' });
            const img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            document.body.appendChild(img);
            return;
        }
    });
    const fragment = document.createDocumentFragment();
    const button = document.createElement('button');
    const statusDisplay = document.createElement('p');
    const input = document.createElement('input');
    fragment.appendChild(button);
    fragment.appendChild(statusDisplay);
    fragment.appendChild(input);
    button.innerText = 'Connect to SD API';
    button.addEventListener('click', () => m.websocket.connect('diffusion'));
    statusDisplay.innerText = 'no connection';
    m.websocket.onStatusUpdate('diffusion', (status) => {
        if (status === 'open') {
            statusDisplay.innerText = 'connected';
        }
        else {
            statusDisplay.innerText = 'no connection';
        }
    });
    m.diffusion.send = m.websocket.sender('diffusion');
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            m.diffusion.send({
                command: input.value
            });
            input.value = '';
        }
    });
    fragment.appendChild(document.createElement('br'));
    target.appendChild(fragment);
}
