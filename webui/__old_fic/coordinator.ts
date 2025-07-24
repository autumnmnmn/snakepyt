let transmitters: { [id: string]: Transmitter } = {};

let receivers: { [id: string]: Receiver } = {};

let workspaces: { [id: string]: Workspace } = {};

function registerWorkspace(element: Element, renderWires: Function | null = null) {
    if (workspaces[element.id] === undefined) {
        workspaces[element.id] = {
            id: element.id,
            element,
            transmitters: {},
            receivers: {},
            renderWires
        };
    } else {
        if (renderWires !== null) {
            workspaces[element.id].renderWires = renderWires;
        }
    }
}

export interface Workspace {
    id: string;
    element: Element;
    transmitters: { [id: string]: Transmitter; };
    receivers: { [id: string]: Receiver; };
    renderWires: Function | null;
}

export interface Transmitter {
    id: string;
    element: Element;
    rerender: Function;
    schemas: string[];
    connections: Receiver[];
    workspace: Workspace | null;
    dirty: boolean;
}

export interface Receiver {
    id: string;
    element: Element;
    schemas: string[];
    onSignal: Function;
    connections: Transmitter[];
    workspace: Workspace | null;
    dirty: boolean;
}

function registerTransmitter(id: string, element: HTMLElement, rerender: Function, schemas: string[], connections: Receiver[]): void {
    let transmitter: Transmitter = { id, element, rerender, schemas, connections, workspace: null, dirty: true };

    transmitters[id] = transmitter;

    let workspaceElement = seekParent(element, prefixes.workspace);
    if (workspaceElement === null) {
        return;
    }

    if (workspaces[workspaceElement.id] === undefined) {
        registerWorkspace(workspaceElement);
    }

    workspaces[workspaceElement.id].transmitters[id] = transmitter;
    transmitter.workspace = workspaces[workspaceElement.id];
}

function registerReceiver(id: string, element: HTMLElement, schemas: string[], onSignal: Function, connections: Transmitter[]) {
    let receiver: Receiver = { id, element, schemas, onSignal, connections, workspace: null, dirty: true };

    receivers[id] = receiver;

    let workspace = seekParent(element, prefixes.workspace);
    if (workspace === null) {
        return;
    }

    if (workspaces[workspace.id] === undefined) {
        registerWorkspace(workspace);
    }

    workspaces[workspace.id].receivers[id] = receiver;
    receiver.workspace = workspaces[workspace.id];
}

function removeWorkspace(id: string) {
    let workspace = workspaces[id];
    for (const transmitterId in workspace.transmitters) {
        removeTransmitter(transmitterId, true);
    }
    for (const receiverId in workspace.receivers) {
        removeReceiver(receiverId, true);
    }
    delete workspaces[id];
}

function removeTransmitter(id: string, skipWorkspace: boolean = false) {
    let transmitter = transmitters[id];

    if (transmitter === undefined) {
        // This happens sometimes because onDestroy gets called before onMount for some transmitters and receivers when the app starts up.
        return;
    }

    for (const receiver of transmitter.connections) {
        let index = receiver.connections.indexOf(transmitter);
        receiver.connections.splice(index, 1);
        receiver.dirty = true;
    }

    if (!skipWorkspace && transmitter.workspace !== null) {
        delete transmitter.workspace.transmitters[id];
    }

    delete transmitters[id];
}

function removeReceiver(id: string, skipWorkspace: boolean = false) {
    let receiver = receivers[id];

    if (receiver === undefined) {
        // This happens sometimes because onDestroy gets called before onMount for some transmitters and receivers when the app starts up.
        return;
    }

    for (const transmitter of receiver.connections) {
        let index = transmitter.connections.indexOf(receiver);
        transmitter.connections.splice(index, 1);
        transmitter.dirty = true;
    }

    if (!skipWorkspace && receiver.workspace !== null) {
        delete receiver.workspace.receivers[id];
    }

    delete receivers[id];
}

function seekParent(element: Element, idPrefix: string): Element | null {
    if (element === undefined) { return null; }
    let currentElement = element.parentElement;

    while (currentElement) {
        if (currentElement.id.startsWith(idPrefix)) {
            return currentElement;
        }

        currentElement = currentElement.parentElement;
    }

    return null;
}

function connect(transmitterId: string, receiverId: string) {
    let transmitter = transmitters[transmitterId];
    let receiver = receivers[receiverId];

    transmitter.connections.push(receiver);
    receiver.connections.push(transmitter);

    transmitter.dirty = true;
    receiver.dirty = true;

    if (transmitter.workspace?.renderWires !== null) {
        transmitter.workspace?.renderWires();
    }

    if (receiver.workspace?.renderWires !== null) {
        if (receiver.workspace !== transmitter.workspace) {
            receiver.workspace?.renderWires();
        }
    }

}

function childTransceivers(element: Element) {
    let receivers: string[] = [];
    let transmitters: string[] = [];

    if (element === undefined) return { receivers, transmitters };

    Array.from(element.children).forEach(child => {
        if (child.id.startsWith(prefixes.receiver)) {
            receivers.push(child.id);
        }
        if (child.id.startsWith(prefixes.transmitter)) {
            transmitters.push(child.id);
        }
        let recurseResult = childTransceivers(child);
        receivers.push(...recurseResult.receivers);
        transmitters.push(...recurseResult.transmitters);
    });

    return { receivers, transmitters };
}

function idAtLocation(x: number, y: number, idPrefix: string): string | null {
    var stack = [];
    var el;
    var result = null;
    do {
        el = document.elementFromPoint(x, y);
        if (el === null) {
            break;
        }
        if (el.id.startsWith(idPrefix)) {
            result = el.id;
            break;
        }
        stack.push(el);
        el.classList.add('pointerEventsNone');
    }while(el && el.tagName !== 'HTML');

    // clean up
    for(var i  = 0; i < stack.length; i += 1)
        stack[i].classList.remove('pointerEventsNone');

    return result;
}

let prefixes = {
    workspace: "WORKSPACE",
    transmitter: "TRANSMITTER",
    receiver: "RECEIVER"
}

export default {
    receivers,
    transmitters,
    workspaces,
    prefixes,
    connect,
    registerWorkspace,
    registerTransmitter,
    registerReceiver,
    removeWorkspace,
    removeTransmitter,
    removeReceiver,
    seekParent,
    childTransceivers,
    idAtLocation
}
