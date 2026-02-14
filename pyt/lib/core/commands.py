
from pyt.lib.internal.parse import lsnap

commands = []

def register_command(*aliases):
    alias_set = set(aliases)
    def _register_command(behavior):
        commands.append((alias_set, behavior))
        return behavior
    return _register_command

def try_handle_command(_, command, remainder):
    for alias_set, behavior in commands:
        if command in alias_set:
            behavior(_, remainder)
            return True
    return False

def handle_message(_, message):
    try:
        if message.startswith("."):
            if message.rstrip() == ".":
                _.log(_.persistent_state)
            else:
                segments = [segment.strip() for segment in message.split(".")][1:]
                selection = ("base scope", _.persistent_state)
                for segment in segments:
                    if segment == "":
                        _.log("repeated dots (..) are redundant", mode="warning")
                        return
                    try:
                        selection = (segment, selection[1][segment])
                        _.log(f"{selection[0]}: {selection[1]}")
                    except KeyError:
                        _.log(f"no \"{segment}\" in {selection[0]}", mode="error")
                        return
                    except TypeError:
                        _.log(f"{selection[0]} is not a scope", mode="error")
                        _.log.indented()(f"{selection[0]}: {selection[1]}", mode="info")

            return

        (command, remainder) = lsnap(message)

        if not _.try_handle_command(command, remainder):
            _.log(f"unknown command: {command}", mode="info")
    except:
        _.log.indented().trace()


@register_command("flush")
def cmd_flush(_, args):
    import gc
    import sys
    _.persistent_state = {}
    _.persistent_hashes = {}
    gc.collect()
    if "torch" in sys.modules:
        torch = sys.modules["torch"]
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    _.log("state flushed")

@register_command("exit", "quit", ":q", ",q")
def cmd_exit(_, args):
    _.log.blank().log("goodbye <3").blank()
    _.repl_continue = False

@register_command("hello", "hi")
def cmd_hi(_, args):
    _.log("hiii :3")

@register_command("reload", "refresh", "rr")
def cmd_reload(_, args):
    import sys
    from importlib import reload

    for name, module in list(sys.modules.items()):
        if name.startswith("pyt.lib"):
            try:
                reload(module)
                _.log(f"reloaded {name}")
            except:
                _.log.indented().trace()
                _.log(f"failed to reload {name}", mode="error")

@register_command("rrun")
def cmd_reload_run(_, args):
    if _.try_handle_command("reload", ""):
        _.handle_message(f"run {args}")

@register_command("crash")
def cmd_crash(_, args):
    raise Exception("crashing on purpose >:3")

_favorite_dirs = {
    "data0": "/data/0",
    "data1": "/data/1",
    "data2": "/data/2",
    "ssd0": "/ssd/0",
    "pyt": "/data/0/code/python/snakepyt",
    "out": "/data/0/pyt/out",
    "in": "/data/0/pyt/in",
    "code": "/data/0/code",
    "media": "/data/0/media",
    "crone": "/data/0/code/c/crone",
}

@register_command("bash")
def cmd_bash(_, args):
    import os
    import subprocess


    if args == "":
        _.log("switching to bash!", mode="info")
        subprocess.run(["bash"])
        _.log("wb bestie!")
        return

    args = _favorite_dirs.get(args, args)

    path = os.path.expandvars(os.path.expanduser(args))

    if not os.path.isdir(path):
        _.log(f"{args} is not a directory but that's ok", mode="warning")
        _.log("switching to bash..", mode="info")
        subprocess.run(["bash"])
        _.log("welcome back.")
    else:
        _.log(f"switching to bash, working directory {path}", mode="info")
        subprocess.run(["bash"], cwd=path)
        _.log("back in the pyt :D")

@register_command("run")
def cmd_run(_, args):
    import os
    import sys
    import inspect
    import time
    import shutil
    from pathlib import Path
    from time import perf_counter
    from importlib import import_module


    from pyt.lib.core.run import run, handle_persistent

    sketch_name, remainder = lsnap(args)

    try:
        _.log(f"loading sketch \"{sketch_name}\"", mode="info")
        module_name = f"{sketch_name}"
        if module_name in sys.modules:
            del sys.modules[module_name]
        sys.path.insert(0, _.pyt_sketch)
        sketch = import_module(module_name)
        sys.path.pop(0)
    except ModuleNotFoundError:
        _.log.indented().trace()
        _.log("no such sketch", mode="error", indent=4).blank()
        return
    except KeyboardInterrupt:
        _.log("aborted", mode="info").blank()
        return
    except:
        _.log.indented().trace()
        return

    sources = { name : inspect.getsource(member)
                for name, member in inspect.getmembers(sketch)
                if inspect.isfunction(member) and member.__module__ == module_name
               }

    log = _.log.tag(sketch_name).mode("info")

    t0 = perf_counter()
    if hasattr(sketch, "persistent"):
        if not handle_persistent(_, sketch_name, sketch.persistent, sketch.__dict__, log, sources):
            log.blank()
            return

    sketch.__dict__.update(_.persistent_state)

    pyt_out = _.pyt_out

    run_dir = time.strftime(f"{sketch_name}/%d.%m.%Y/t%H.%M.%S")
    sketch.__dict__["run_dir"] = run_dir
    Path(f"{pyt_out}/" + run_dir).mkdir(parents=True, exist_ok=True)

    shutil.copy(sketch.__file__, f"{pyt_out}/{run_dir}/{sketch_name}.py")

    with open(f"{pyt_out}/{run_dir}/.snakepyt", "w") as metadata:
        metadata.write(f"snakepyt version {_.snakepyt_version[0]}.{_.snakepyt_version[1]}\n")

    if hasattr(sketch, "main"):
        if hasattr(sketch, "final"):
            finalizer = sketch.final.__code__
        else:
            finalizer = None
        try:
            failures, runs = run(_, sketch.main, None, (), sketch.__dict__, log, sources, finalizer)
        except KeyboardInterrupt:
            _.log.blank().log("aborted", mode="info").blank()
            return
    else:
        _.log("sketch has no main function", mode="error", indent=4)

    if failures == 0:
        _.log(f"finished {runs} run(s) in {perf_counter() - t0:.3f}s", mode="success")
    elif failures < runs:
        _.log(f"finished {runs-failures} of {runs} run(s) in {perf_counter() - t0:.3f}s", mode="info")
        _.log(f"{failures} run(s) failed to finish", mode="error")
    else:
        _.log(f"all {failures} run(s) failed to finish", mode="error")

