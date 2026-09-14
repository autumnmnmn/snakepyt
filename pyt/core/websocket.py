
import asyncio
import itertools
import json
import queue
import re
import threading

class WebsocketServer:
    ERROR_NO_WEBSOCKETS = object()
    ERROR_PORT_UNAVAILABLE = object()

    _CLIENT_ADDRESS = re.compile(r"^client (\d+)$")

    def __init__(self, log, host="0.0.0.0", port=1314):
        self.log = log
        self._send = queue.Queue()
        self._received = queue.Queue()
        self.clients = {}
        self._client_numbers = itertools.count(0)
        self.connected = False
        self.host = host
        self.port = port

        try:
            import websockets
            self._websockets = websockets
        except ImportError:
            self.log("websockets package not available; webui server disabled", mode="info")
            self._received.put({
                "from": "server",
                "to": "daemon",
                "content": WebsocketServer.ERROR_NO_WEBSOCKETS
            })
            return

        threading.Thread(target=self._run, daemon=True, name="pyt-server").start()

    def send(self, item):
        self._send.put(item)

    def receive(self, block=True, timeout=None):
        return self._received.get(block, timeout)

    def _run(self):
        try:
            asyncio.run(self._serve())
        except OSError:
            self._received.put({
                "from": "server",
                "to": "daemon",
                "content": WebsocketServer.ERROR_PORT_UNAVAILABLE
            })
        except Exception:
            self.log.trace()

    async def _handler(self, websocket):
        n = next(self._client_numbers)
        self.clients[n] = websocket
        self.log(f"client {n} connected")
        try:
            async for message in websocket:
                self._handle_client_message(n, message)
        finally:
            self.clients.pop(n, None)
            self.log(f"client {n} disconnected")

    def _handle_client_message(self, n, message):
        try:
            data = json.loads(message)
        except (ValueError, TypeError):
            self.log(f"client {n}: message is not valid json; discarded", mode="info")
            return
        if not isinstance(data, dict) or "to" not in data or "content" not in data:
            self.log(f"client {n}: message must be a dict with 'to' and 'content'; discarded", mode="info")
            return
        data["from"] = f"client {n}"
        self._received.put(data)

    async def _pump(self):
        while True:
            item = await asyncio.to_thread(self._send.get)
            item = self._coerce_outgoing(item)
            if item is None:
                continue

            to = item["to"]

            if to == "server":
                command = item.get("content")
                if command == "exit":
                    self.log("webui server exiting")
                    await self._close_clients()
                    return
                self.log(f"unrecognized command: {command}")
                continue

            n = self._client_number(to)
            if n is None:
                self.log(f"invalid recipient {to!r}; discarded", mode="info")
                continue

            websocket = self.clients.get(n)
            if websocket is None:
                self._bounce(item)
                continue
            try:
                await websocket.send(json.dumps(item, default=str))
            except Exception:
                self._bounce(item)

    def _coerce_outgoing(self, item):
        if isinstance(item, (str, bytes, bytearray)):
            try:
                item = json.loads(item)
            except (ValueError, TypeError):
                self.log(f"outgoing message is not valid json; discarded: {item!r}", mode="info")
                return None
        if not isinstance(item, dict) or "to" not in item or "content" not in item:
            self.log(f"outgoing message must be a dict with 'to' and 'content'; discarded: {item!r}", mode="info")
            return None
        return item

    @classmethod
    def _client_number(cls, to):
        if not isinstance(to, str):
            return None
        match = cls._CLIENT_ADDRESS.match(to)
        return int(match.group(1)) if match is not None else None

    def _bounce(self, item):
        self._received.put({
            "from": "server",
            "to": item.get("from"),
            "content": item.get("content"),
        })

    async def _close_clients(self):
        if self.clients:
            await asyncio.gather(
                *(websocket.close(code=1001) for websocket in list(self.clients.values())),
                return_exceptions=True)

    async def _serve(self):
        async with self._websockets.serve(self._handler, self.host, self.port):
            self.connected = True
            self.log(f"socket server @ {self.host}:{self.port}")
            await self._pump()
        self.connected = False

