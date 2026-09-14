
import sys
import inspect
import traceback

from dataclasses import dataclass, replace
from typing import Any, Optional, Callable
from pathlib import Path
from pprint import pformat

from pyt.core.terminal.ansi import codes as ac

_tag_colors = {
    "error": "red",
    "ok": "green",
    "warning": "yellow",
    "info": "cyan",
    "unset": "cyan",
}

_stream_names = {
    "error": "error",
    "ok": "ok",
    "warning": "warning",
    "info": "info",
    "unset": "info",
}

def _log(send, tag, content, mode, indent):
    if isinstance(content, dict):
        content = "\n" + pformat(content)
    elif not isinstance(content, str):
        content = str(content)
    color = _tag_colors.get(mode, _tag_colors["unset"])
    if isinstance(tag, tuple):
        prefix, filepath, line_number = tag
        spans = [{"text": "[", "style": f"{color} tag"}]
        if prefix:
            spans.append({"text": prefix, "style": f"{color} tag"})
        spans.append({
            "text": f"{Path(filepath).name}:{line_number}",
            "style": f"{color} link",
            "link": f"{filepath}:{line_number}",
        })
        spans.append({"text": "]", "style": f"{color} tag"})
    else:
        spans = [{"text": f"[{tag}]", "style": f"{color} tag"}]
    spans += [{"text": " ", "style": ""}, {"text": content, "style": ""}]
    send({
        "stream": _stream_names.get(mode, mode),
        "indent": indent,
        "spans": spans,
    })

@dataclass(frozen=True)
class Logger:
    _send: Callable[[dict], Any]
    _receive: Optional[Callable[[dict], str]] = None
    _mode: str = "unset"
    _indent: int = 0
    _tag: Optional[str] = None
    _on_except: Callable[[Exception],None] | None = None

    def indented(self, n=4):
        return replace(self, _indent=self._indent + n)

    def tag(self, tag: Optional[str]):
        return replace(self, _tag=tag)

    def mode(self, mode: str):
        return replace(self, _mode=mode)

    def on_except(self, handler):
        return replace(self, _on_except=handler)

    def __call__(self, content, mode=None, indent=None, tag=None):
        if mode is None:
            mode = self._mode
        if indent is None:
            indent = self._indent
        if tag is None:
            tag = self._tag
        if tag is None:
            callsite = inspect.stack()[1]
            tag = ("", callsite[1], callsite[2])
        _log(self._send, tag, content, mode, indent)
        return self

    def print(self, *args, sep=" ", end="\n", file=None, flush=False, mode=None, indent=None, tag=None):
        """print-compatible interface, for injection into sketch scopes.

        Renders through the logger like __call__, but accepts the full builtin
        print signature. A single argument is passed through unchanged (so dicts
        are still pretty-printed); multiple arguments are joined with sep.
        end != "\\n" is appended literally, since the logger emits whole lines.
        If file is a real stream other than stdout/stderr, the call is passed
        through to builtin print unchanged (a real stream can't be rerouted
        over the transport). file=sys.stderr defaults mode to "error".
        flush is accepted for signature compatibility but is a no-op —
        flushing is the transport's job. mode/indent/tag are
        logger-specific extensions.
        """
        if file is not None and file is not sys.stdout and file is not sys.stderr:
            print(*args, sep=sep, end=end, file=file, flush=flush)
            return self
        if mode is None and file is sys.stderr:
            mode = "error"
        if len(args) == 1:
            content = args[0] if end == "\n" else str(args[0]) + end
        else:
            content = sep.join(str(arg) for arg in args)
            if end != "\n":
                content += end
        if mode is None:
            mode = self._mode
        if indent is None:
            indent = self._indent
        if tag is None:
            tag = self._tag
        if tag is None:
            # resolve the caller's tag here: resolving it any deeper in the
            # stack would land on a remote_logger.py frame and tag every
            # line as such
            callsite = inspect.stack()[1]
            tag = ("", callsite[1], callsite[2])
        _log(self._send, tag, content, mode, indent)
        return self

    def trace(self, source=None):
        exception_type, exception, trace = sys.exc_info()
        if self._on_except is not None:
            self._on_except(exception)

        if exception_type is None:
            raise RuntimeError("Logger.trace was called in a context without an exception to trace")
        trace_frames = traceback.extract_tb(trace)
        tag = "error" if self._tag is None else self._tag
        exception_content = f"{exception_type.__name__}: {exception}"
        _log(self._send, tag, exception_content, mode="error", indent=self._indent)
        for frame in trace_frames[::-1]:
            file, line_number, function, line = frame
            if file == "<string>" and source is not None:
                file = inspect.getfile(source)
                lines, first_line = inspect.getsourcelines(source)
                if line_number < len(lines):
                    line = lines[line_number-1].strip()
                    line_number = first_line + line_number - 1
                else:
                    # TODO try and set up some gnarly errors to see if i can get this path to happen
                    # i *think* the improvements to the sketch AST modification have obviated this
                    _log(self._send, "SNAKEPYT", "TRACING ERROR", mode="error", indent=self._indent+8)
            frame_tag = ("in ", file, line_number)
            _log(self._send, frame_tag, line, mode="error", indent=self._indent+4)
        return self

    def log(self, content, mode=None, indent=None, tag=None):
        return self(content, mode, indent, tag)

    def blank(self):
        self._send({"stream": "info", "indent": 0, "spans": [{"text": "", "style": ""}]})
        return self

    def input(self, fore):
        if fore is None:
            fore = ":"
        if self._receive is None:
            raise RuntimeError(
                "input() was called on a Logger constructed without a "
                "receive function — receive=None is a promise that input() "
                "would never be called, and the promise just got broken"
            )
        return self._receive({
            "stream": "input",
            "indent": self._indent,
            "spans": [{"text": f"{fore} ", "style": "magenta tag"}],
        })

_ansi_colors = {
    "red": ac.ansi(ac.fg("red")),
    "green": ac.ansi(ac.bright_fg("green")),
    "yellow": ac.ansi(ac.fg("yellow")),
    "cyan": ac.ansi(ac.fg("cyan")),
    "magenta": ac.ansi(ac.fg("magenta")),
}

def _parse_link(link):
    """split a "<filepath>:<line>" link target back into its parts"""
    path, sep, line = link.rpartition(":")
    if sep and line.isdigit():
        return path, int(line)
    return link, None

def _escape(code):
    """wrap an escape code in readline's ignore markers when readline is
    active, so prompt escapes don't count against the prompt width"""
    if "readline" in sys.modules and sys.stdin.isatty() and sys.stdout.isatty():
        return f"\001{code}\002"
    return code

def _render_spans(spans, escape=lambda code: code):
    out = []
    for span in spans:
        text = span["text"]
        link = span.get("link")
        if link is not None:
            path, line = _parse_link(link)
            text = ac.file_link(path, line=line) if line is not None else ac.file_link(path)
        classes = (span.get("style") or "").split()
        color = next((_ansi_colors[cls] for cls in classes if cls in _ansi_colors), None)
        if color is None:
            out.append(text)
        else:
            out.append(f"{escape(color)}{text}{escape(ac.reset)}")
    return "".join(out)

def send_to_terminal(payload):
    print(" " * payload.get("indent", 0) + _render_spans(payload["spans"]))

def receive_from_terminal(payload):
    prompt = " " * payload.get("indent", 0) + _render_spans(payload["spans"], _escape)
    return input(prompt)

def TerminalLogger():
    return Logger(send_to_terminal, receive_from_terminal)

