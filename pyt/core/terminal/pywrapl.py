
import sys

_VERSION = [
    (3,14,2)
]

class VersionMismatch(RuntimeError):
    pass

class _ReplExitSentinel:
    pass

def _wrapped_repl(local, log, on_version_mismatch="error"):
    """
    Wraps a `_pyrepl` console to (attempt to) ensure it doesn't make a mess of any global state.

    Most important is putting the original `builtins.input` back in place, as pyrepl neglects
    to do.
    """

    import builtins
    import signal
    import threading
    import linecache
    from _pyrepl import console, simple_interact, readline, trace, historical_reader

    version = sys.version_info
    if not ((version.major, version.minor, version.micro) in _VERSION):
        if on_version_mismatch == "error":
            raise VersionMismatch("wrapper for unsupported _pyrepl module was designed around a different version")
        elif on_version_mismatch == "warning":
            log("wrapper for unsupported _pyrepl module was designed around a different version", mode="warning")
        elif on_version_mismatch != "ignore":
            log("on_version_mismatch should be one of [\"error\", \"warning\", \"ignore\"]", mode="warning")

    local["exit"] = _ReplExitSentinel()
    local["quit"] = _ReplExitSentinel()

    def save_attr(module, name):
        if hasattr(module, name):
            return (True, getattr(module, name))
        return (False, None)

    original_state = {
        # changed by readline._setup
        "builtins.input": builtins.input,

        "sys.ps1": save_attr(sys, "ps1"),
        "sys.ps2": save_attr(sys, "ps2"),

        # signal handlers (only on platforms where they exist)
        "signal.SIGCONT": (hasattr(signal, "SIGCONT") and save_attr(signal, "SIGCONT")[1]) or None,
        "signal.SIGWINCH": (hasattr(signal, "SIGWINCH") and save_attr(signal, "SIGWINCH")[1]) or None,

        "threading.excepthook": save_attr(threading, "excepthook"),

        "historical_reader.should_auto_add_history": historical_reader.should_auto_add_history,

        "trace.trace_file": trace.trace_file, # may be None or a file object
    }

    readline_wrapper = getattr(readline, "_wrapper", None)
    original_readline = {
        "wrapper": readline_wrapper,
        "history": (readline_wrapper.get_reader().history[:]
                    if readline_wrapper and readline_wrapper.reader else []),
        "module_completer": (readline_wrapper.config.module_completer
                             if readline_wrapper else None),
    }

    try:
        repl = console.InteractiveColoredConsole(locals=local, local_exit=True)
        simple_interact.run_multiline_interactive_console(repl)
    except SystemExit:
        pass
    finally:
        builtins.input = original_state["builtins.input"]

        for name in ("ps1", "ps2"):
            existed, value = original_state[f"sys.{name}"]
            if existed:
                sys.__dict__[name] = value
            else:
                sys.__dict__.pop(name, None)

        for sig_name, orig_handler in [("SIGCONT", original_state["signal.SIGCONT"]),
                                       ("SIGWINCH", original_state["signal.SIGWINCH"])]:
            if hasattr(signal, sig_name):
                sig = getattr(signal, sig_name)
                current = signal.getsignal(sig)
                if current != orig_handler:
                    try:
                        signal.signal(sig, orig_handler)
                    except TypeError:
                        # not a problem. happens when orig_handler is None
                        pass
                    except ValueError:
                        # TODO: when does this happen? are other errors possible?
                        pass

        existed, value = original_state["threading.excepthook"]
        if existed:
            threading.excepthook = value
        else:
            if hasattr(threading, "excepthook"):
                delattr(threading, "excepthook")

        historical_reader.should_auto_add_history = original_state["historical_reader.should_auto_add_history"]

        # close trace file if _pyrepl opened a new one
        orig_trace_file = original_state["trace.trace_file"]
        current_trace_file = trace.trace_file
        if current_trace_file is not None and current_trace_file is not orig_trace_file:
            try:
                current_trace_file.close()
            except Exception:
                log("failed to close trace file opened by _pyrepl. might be fine", mode="warning")
        trace.trace_file = orig_trace_file # may be None

        prefixes = ('<python-input', '<stdin>', '<input>', '<console>')
        try:
            for filename in list(linecache.cache.keys()):
                if filename.startswith(prefixes):
                    del linecache.cache[filename]
        except Exception:
            log.trace()
            log("ran into an issue cleaning up _pyrepl's linecache changes. might be fine", mode="warning")

        try:
            readline.clear_history()
            for line in original_readline["history"]:
                readline.add_history(line)
            if readline_wrapper and original_readline["module_completer"] is not None:
                readline_wrapper.config.module_completer = original_readline["module_completer"]
        except Exception:
            log.trace()
            log("ran into an issue cleaning up _pyrepl's history/completer changes. might be fine", mode="warning")

        if readline_wrapper and hasattr(readline_wrapper, 'reader') and readline_wrapper.reader:
            try:
                reader = readline_wrapper.reader

                reader.buffer = []
                reader.pos = 0
                reader.historyi = len(reader.history) # point to "new" entry
                reader.transient_history = {}
                reader.dirty = True # force refresh if reused

                reader.restore()
            except Exception:
                log.trace()
                log("ran into an issue resetting the readline_wrapper reader. might be fine", mode="warning")



def repl(local, log, on_version_mismatch="error"):
    """
    Wrapped _pyrepl with a fallback to code.interact
    """

    exit_repl = _ReplExitSentinel()
    local["exit"] = exit_repl
    local["quit"] = exit_repl

    old_hook = sys.displayhook

    def _wrapped_hook(value):
        if isinstance(value, _ReplExitSentinel):
            raise SystemExit
        else:
            return old_hook(value)

    try:
        sys.displayhook = _wrapped_hook

        _wrapped_repl(local, log, on_version_mismatch)

    except:
        # Catch everything bc there's no long-term guarantees about how _pyrepl works
        log.trace()
        log("failed to launch fancy colorful python repl :( here's a boring one:", mode="warning")
        import code
        code.interact(local=local, banner="", exitmsg="", local_exit=True)
    finally:
        sys.displayhook = old_hook

