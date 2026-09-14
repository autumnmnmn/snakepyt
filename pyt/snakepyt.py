
import itertools
import multiprocessing
import os
import queue
import re
import readline
import sys
import threading

from argparse import ArgumentParser

from pyt.core import PytSession
from pyt.core.terminal import TerminalLogger, Logger, persona
from pyt.core.websocket import WebsocketServer

_SESSION_ADDRESS = re.compile(r"^session (\d+)$")


def _session_number(address):
    if not isinstance(address, str):
        return None
    match = _SESSION_ADDRESS.match(address)
    return int(match.group(1)) if match is not None else None


def _session_process(number, inbox, outbox, cli_args):
    def put(foo):
        outbox.put({
            "to": "client 0",
            "from": f"session {number}",
            "content": foo,
        })
    log = Logger(put).mode("ok").tag(f"session {number}")
    session = PytSession(cli_args, log)
    log(f"ready")
    try:
        while True:
            item = inbox.get()
            if item is None:
                break
            try:
                session.handle_message(item.get("content"), log)
            except Exception:
                log.trace()
    except (KeyboardInterrupt, SystemExit):
        pass
    log(f"session {number} stopped")
    outbox.put(None)


def run_daemon(cli_args):
    log = TerminalLogger().mode("ok").tag("daemon")
    server = WebsocketServer(log)

    ctx = multiprocessing.get_context("spawn")

    sessions = {}
    outboxes = {}
    processes = {}
    routers = {}
    session_numbers = itertools.count(0)

    def outbox_reader(number, outbox, process):
        while True:
            try:
                item = outbox.get(timeout=0.5)
            except queue.Empty:
                if not process.is_alive():
                    sessions.pop(number, None)
                    outboxes.pop(number, None)
                    processes.pop(number, None)
                    routers.pop(number, None)
                    log(f"session {number}: process gone; router detached", mode="info")
                    return
                continue
            if item is None:
                return
            server.send(item)

    def new_session():
        number = next(session_numbers)
        inbox = ctx.Queue()
        outbox = ctx.Queue()
        process = ctx.Process(
            target=_session_process,
            args=(number, inbox, outbox, cli_args),
            name=f"pyt-session-{number}",
            daemon=True,
        )
        process.start()
        router = threading.Thread(
            target=outbox_reader,
            args=(number, outbox, process),
            name=f"pyt-router-{number}",
            daemon=True,
        )
        router.start()
        sessions[number] = inbox
        outboxes[number] = outbox
        processes[number] = process
        routers[number] = router
        log(f"session {number} created")
        return number

    def stop_sessions():
        for inbox in list(sessions.values()):
            inbox.put(None)
        for process in list(processes.values()):
            process.join(timeout=1)
        for router in list(routers.values()):
            router.join(timeout=1)

    def bounce(item):
        server.send({
            "from": "daemon",
            "to": item.get("from"),
            "content": item.get("content"),
        })

    def handle_server_message(item):
        content = item.get("content")
        if content is WebsocketServer.ERROR_NO_WEBSOCKETS:
            log("webui server unavailable; daemon exiting", mode="info")
            return 1
        if content is WebsocketServer.ERROR_PORT_UNAVAILABLE:
            log(f"port {server.port} unavailable; daemon exiting", mode="info")
            return 1
        log(f"undeliverable message discarded: {content!r}", mode="info")

    def handle_daemon_message(item):
        sender = item.get("from")
        content = item.get("content")
        if content == "sessions":
            server.send({
                "from": "daemon",
                "to": sender,
                "content": {"sessions": list(sessions)},
            })
        elif content == "new session":
            server.send({
                "from": "daemon",
                "to": sender,
                "content": {"session": new_session()},
            })
        else:
            log(f"unrecognized command: {content!r}")

    def handle(item):
        if item.get("from") == "server":
            return handle_server_message(item)

        recipient = item.get("to")
        if recipient == "daemon":
            handle_daemon_message(item)
            return None

        number = _session_number(recipient)
        if number is None:
            log(f"invalid recipient {recipient!r}; discarded", mode="info")
            return None

        inbox = sessions.get(number)
        if inbox is None:
            bounce(item)
            return None

        content = item.get("content")
        if not isinstance(content, str):
            log(f"session {number}: content must be a string; discarded", mode="info")
            return None

        inbox.put(item)
        return None

    new_session()

    try:
        while True:
            item = server.receive()
            exit_code = handle(item)
            if exit_code is not None:
                stop_sessions()
                return exit_code
    except (KeyboardInterrupt, SystemExit):
        stop_sessions()
        server.send({"from": "daemon", "to": "server", "content": "exit"})
        log.blank().log(f"shutting down").blank()
        return 0


def main():
    parser = ArgumentParser("snakepyt")
    PytSession.define_cli_args(parser)

    parser.add_argument(
        "-d", "--daemon",
        dest="daemon",
        action="store_true",
        help="run as websocket daemon",
    )

    cli_args = parser.parse_args()

    if cli_args.daemon:
        return run_daemon(cli_args)

    session = PytSession(cli_args)

    try:
        username = os.getlogin()
    except:
        username = ""

    while session.repl_continue:
        try:
            tag = f"{username}: {session.prefix}" if session.prefix else username + ':'
            message = session.log.input(tag)
        except (KeyboardInterrupt, EOFError, SystemExit):
            session.log.blank().log(f"goodbye {session.persona.smile()}").blank()
            session.repl_continue = False
            continue

        session.handle_message(message.lstrip())

    return 0


if __name__ == "__main__":
    sys.exit(main())

