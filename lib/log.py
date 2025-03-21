
import sys
import inspect
import traceback

reset_color = "\033[0m"

def _log(tag, content, mode, indent):
    final_color = reset_color
    if mode == "error":
        tag_color = "\033[31m"
        final_color = "\033[33m"
    elif mode == "success":
        tag_color = "\033[92m"
    else:
        tag_color = "\033[96m"
    print(f"{tag_color}{' '*indent}[{tag}]{reset_color} {content}{final_color}")

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

def log(content, mode="standard", indent=0):
    callsite = inspect.stack()[1]
    filename = callsite[1].split("/")[-1]
    _log(f"{filename} {callsite[2]}", content, mode, indent)

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

def blank():
    print()

