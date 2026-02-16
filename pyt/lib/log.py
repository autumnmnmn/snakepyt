
import sys
import inspect
import traceback
import time
import readline

from dataclasses import dataclass
from typing import Optional

from pyt.lib.ansi import codes as ac

_tag_colors = {
    "error": ac.ansi(ac.fg("red")),
    "success": ac.ansi(ac.bright_fg("green")),
    "warning": ac.ansi(ac.fg("yellow")),
    "standard": ac.ansi(ac.fg("cyan")),
}

def _log(tag, content, mode, indent):
    tag_color = _tag_colors.get(mode, _tag_colors["standard"])
    print(f"{tag_color}{' '*indent}[{tag}]{ac.reset} {content}{ac.reset}")

def _input(prompt, mode, indent):
    tag_color = ac.ansi(ac.fg("magenta"))
    return input(f"{tag_color}{' '*indent}{prompt} {ac.reset}")


@dataclass
class Logger:
    _mode: str = "standard"
    _indent: int = 0
    _tag: Optional[str] = None
    # TODO logger denotes mode only by color; it should optionally include non-color-based
    # markers within the tags. this toggle should be presented to a user the first time they
    # run snakepyt
    _a11y_tags: bool = False

    def indented(self, n=4):
        return Logger(_indent=self._indent + n, _tag=self._tag, _mode=self._mode)

    def tag(self, tag: Optional[str]):
        return Logger(_indent=self._indent, _tag=tag, _mode=self._mode)

    def mode(self, mode: str):
        return Logger(_indent=self._indent, _tag=self._tag, _mode=mode)

    def __call__(self, content, mode=None, indent=None, tag=None):
        if mode is None:
            mode = self._mode
        if indent is None:
            indent = self._indent
        if tag is None:
            tag = self._tag
        if tag is None:
            callsite = inspect.stack()[1]
            filepath = callsite[1]
            line_number = callsite[2]
            filename = filepath.split("/")[-1] # TODO this assumes unix paths! make it os-agnostic
            tag = ac.file_link(filepath, line=line_number, full=True)
        _log(tag, content, mode, indent)
        return self

    def trace(self, source=None):
        exception_type, exception, trace = sys.exc_info()
        trace_frames = traceback.extract_tb(trace)
        tag = "error" if self._tag is None else self._tag
        exception_content = f"{exception_type.__name__}: {exception}"
        _log(tag, exception_content, mode="error", indent=self._indent)
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
                    _log(f"SNAKEPYT", "TRACING ERROR", mode="error", indent=self._indent+8)
            file_end = file.split("/")[-1] # TODO make os-agnostic
            frame_tag = ac.file_link(file, line=line_number)
            _log(f"in {frame_tag}", line, mode="error", indent=self._indent+4)
        return self

    def log(self, content, mode=None, indent=None, tag=None):
        return self(content, mode, indent, tag)

    def blank(self):
        print()
        return self

    def input(self, username=None):
        if username is None:
            username = ":"
        return _input(f"{username}:", mode="user", indent=self._indent)


def inner_log(source, indent):
    def log(content, mode="standard"):
        callsite = inspect.stack()[1]
        file = callsite[1]
        line_number = callsite[2]
        if file == "<string>" and source is not None:
            file = inspect.getfile(source)
            lines, first_line = inspect.getsourcelines(source)
            line_number += first_line - 1
        filename = file.split("/")[-1] # TODO make os-agnostic
        tag = ac.file_link(file, line=line_number)
        _log(tag, content, mode, indent)
    return log


def trace(indent=0, source=None):
    from pathlib import Path
    exception_type, exception, trace = sys.exc_info()
    trace_frames = traceback.extract_tb(trace)
    _log("error", exception_type.__name__, mode="error", indent=indent)
    for frame in trace_frames[::-1]:
        file, line_number, function, line = frame
        if file == "<string>" and source is not None:
            if isinstance(source, Path):
                file = str(source.absolute())
                line = source.read_text()
            file = inspect.getfile(source)
            lines, first_line = inspect.getsourcelines(source)
            line = lines[line_number-1].strip()
            line_number = first_line + line_number - 1
        file_end = file.split("/")[-1] # TODO make os-agnostic
        frame_tag = ac.file_link(file, line=line_number)
        _log(f"in {frame_tag}", line, mode="error", indent=indent+4)

class Timer(object):
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.t = time.perf_counter()

    def __exit__(self, *args):
        print(f"{self.name}: {time.perf_counter() - self.t}")

