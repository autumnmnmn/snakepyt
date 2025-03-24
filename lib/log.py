
import sys
import inspect
import traceback

from dataclasses import dataclass
from typing import Optional

reset_color = "\033[0m"

def _log(tag, content, mode, indent):
    final_color = reset_color
    if mode == "error":
        tag_color = "\033[31m"
    elif mode == "success":
        tag_color = "\033[92m"
    else:
        tag_color = "\033[96m"
    print(f"{tag_color}{' '*indent}[{tag}]{reset_color} {content}{final_color}")

def _input(prompt, mode, indent):
    tag_color = "\033[35m"
    return input(f"{tag_color}{' '*indent}{prompt} {reset_color}")


@dataclass
class Logger:
    _mode: str = "standard"
    _indent: int = 0
    _tag: Optional[str] = None

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
            filename = callsite[1].split("/")[-1]
            tag = f"{filename} {callsite[2]}"
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
                line = lines[line_number-1].strip()
                line_number = first_line + line_number - 1
            file_end = file.split("/")[-1]
            _log(f"in {file_end} {line_number}", line, mode="error", indent=self._indent+4)
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
        filename = file.split("/")[-1]
        _log(f"{filename} {line_number}", content, mode, indent)
    return log


def trace(indent=0, source=None):
    exception_type, exception, trace = sys.exc_info()
    trace_frames = traceback.extract_tb(trace)
    _log("error", exception_type.__name__, mode="error", indent=indent)
    for frame in trace_frames[::-1]:
        file, line_number, function, line = frame
        if file == "<string>" and source is not None:
            file = inspect.getfile(source)
            lines, first_line = inspect.getsourcelines(source)
            line = lines[line_number-1].strip()
            line_number = first_line + line_number - 1
        file_end = file.split("/")[-1]
        _log(f"in {file_end} {line_number}", line, mode="error", indent=indent+4)

