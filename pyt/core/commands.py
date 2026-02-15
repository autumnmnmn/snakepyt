
import shlex

from argparse import ArgumentParser, ArgumentError

from pyt.core import lsnap
from pyt.lib.ansi import codes as ac

builtin_commands = []

def command_registrar(command_group):
    def register_command(*aliases, arg_parser=None):
        alias_set = set(aliases)
        def _register_command(behavior):
            _behavior = behavior
            if isinstance(arg_parser, ArgumentParser):
                arg_parser.exit_on_error = False
                def _behavior(session, args):
                    try:
                        _args = arg_parser.parse_args(shlex.split(args))
                    except ArgumentError:
                        session.log(arg_parser.format_usage(), mode="info", indent=4)
                        raise
                    return behavior(session, _args)
            command_group.append((alias_set, _behavior))
            return behavior
        return _register_command
    return register_command

_builtin = command_registrar(builtin_commands)

test_parser = ArgumentParser("test")
test_parser.add_argument("--foo", dest="bar", type=str, default="baz")

@_builtin("test", arg_parser=test_parser)
def cmd_test(session, args):
    print(args.bar)

new_parser = ArgumentParser("new")
new_parser.add_argument("name", type=str, help="Name of the new sketch")
new_parser.add_argument("--template", "-t", type=str, default=None,
                        help="Template to use (verbose, basic, or path to file)")

@_builtin("new", arg_parser=new_parser)
def cmd_new(session, args):
    import shutil
    from pathlib import Path

    log = session.log

    template = args.template or session.env.get("TEMPLATE") or "verbose"

    if template in ["verbose", "basic"]:
        from importlib import import_module
        template_module = import_module(f"pyt.core.templates.{template}")
        template = Path(template_module.__file__)
    elif isinstance(template, Path):
        if not template.exists():
            log(f"template file not found: {template}", mode="error")
            return
    elif isinstance(template, str):
        try:
            template = Path(template)
        except:
            log("template could not be interpreted as a path", mode="error")
            return
        if not template.exists():
            log(f"template file not found: {template}", mode="error")
            return
    else:
        log("template could not be interpreted as a path", mode="error")
        return

    sketch_dir = session.env.SKETCH
    new_sketch = sketch_dir / f"{args.name}.py"

    if new_sketch.exists():
        log(f"sketch {args.name} already exists", mode="error")
        return

    shutil.copy(template, new_sketch)
    sketch_link = ac.link(f"file://{new_sketch}", new_sketch.name)
    template_link = ac.link(f"file://{template}", template.name)

    log(f"created {sketch_link} from template {template_link}", mode="success")

@_builtin("flush")
def cmd_flush(session, args):
    import gc
    import sys
    session.persistent_state = {}
    session.persistent_hashes = {}
    gc.collect()
    if "torch" in sys.modules:
        torch = sys.modules["torch"]
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    session.log("state flushed")

@_builtin("exit", "quit", ":q", ",q")
def cmd_exit(session, args):
    session.log.blank().log("goodbye <3").blank()
    session.repl_continue = False

@_builtin("hello", "hi")
def cmd_hi(session, args):
    session.log("hiii :3")

@_builtin("reload", "refresh", "rr")
def cmd_reload(session, args):
    import sys
    from importlib import reload

    log = session.log

    session_reload = False

    # TODO find a robust way to track which files have
    # actually changed
    for name, module in list(sys.modules.items()):
        if name.startswith("pyt"):
            try:
                reload(module)
                log(f"reloaded {name}")
                if name == "pyt.core.session":
                    session_reload = True
            except (KeyboardInterrupt, SystemExit):
                raise
            except:
                log.indented().trace()
                log(f"failed to reload {name}", mode="error")

    if session_reload:
        new_session_module = sys.modules["pyt.core.session"]
        session.update_class(new_session_module.PytSession)


@_builtin("rrun")
def cmd_reload_run(session, args):
    if session.try_handle_command("reload", ""):
        session.handle_message(f"run {args}")

@_builtin("crash")
def cmd_crash(session, args):
    raise Exception("crashing on purpose >:3")

@_builtin("bash", ";")
def cmd_bash(session, args):
    import os
    import subprocess

    log = session.log

    if args == "":
        log("switching to bash!", mode="info")
        subprocess.run(["bash"])
        log("wb bestie!")
        return

    args = session.favorite_dirs.get(args, args)

    path = os.path.expandvars(os.path.expanduser(args))

    if not os.path.isdir(path):
        log(f"{args} is not a directory but that's ok", mode="warning")
        log(f"switching to bash. home directory", mode="info")
        subprocess.run(["bash"])
        log("welcome back")
    else:
        log(f"switching to bash, working directory {path}", mode="info")
        subprocess.run(["bash"], cwd=path)
        log("back in the pyt :D")

@_builtin("py", "python", "'")
def cmd_python(session, args):
    import os
    import subprocess

    from pyt.lib.ansi import codes as ac

    log = session.log

    if args == "":
        log("switching to python!", mode="info")
        if session.env.PYTHON_PATH != None:
            try:
                subprocess.run([session.env.PYTHON_PATH, "-q"])
            except FileNotFoundError:
                link = ac.link(f"file://{session.env.PYTHON_PATH}", "preferred python")
                log(f"your {link} didn't load. trying system python :/", mode="warning")
                subprocess.run(["python", "-q"])
        else:
            subprocess.run(["python", "-q"])
        log("wb bestie!")
        return



@_builtin("run")
def cmd_run(session, args):
    import os
    import sys
    import inspect
    import time
    import shutil
    from pathlib import Path
    from time import perf_counter
    from importlib import import_module

    from pyt.core.run import run, handle_persistent

    sketch_name, remainder = lsnap(args)

    log = session.log

    try:
        log(f"loading sketch \"{sketch_name}\"", mode="info")
        module_name = f"{sketch_name}"
        if module_name in sys.modules:
            del sys.modules[module_name]
        sys.path.insert(0, str(session.env.SKETCH))
        sketch = import_module(module_name)
        sys.path.pop(0)
    except ModuleNotFoundError:
        log.indented().trace()
        log("no such sketch", mode="error", indent=4).blank()
        return
    except KeyboardInterrupt:
        log("aborted", mode="info").blank()
        return
    except SystemExit:
        raise
    except:
        log.indented().trace()
        return

    sources = { name : inspect.getsource(member)
                for name, member in inspect.getmembers(sketch)
                if inspect.isfunction(member) and member.__module__ == module_name
               }

    log = log.tag(sketch_name).mode("info")

    t0 = perf_counter()
    if hasattr(sketch, "persistent"):
        if not handle_persistent(session, sketch_name, sketch.persistent, sketch.__dict__, log, sources):
            log.blank()
            return

    sketch.__dict__.update(session.persistent_state)

    pyt_out = session.env.OUT

    if not pyt_out:
        session.log("no output directory has been specified.\nset via --out flag, or session.env.OUT in your ~/.config/pytrc.py, or by setting the PYT_OUT environment variable", mode="error")
        session.log("aborting.", mode="error")
        return

    daily = time.strftime("%d.%m.%Y")
    moment = time.strftime("t%H.%M.%S")

    run_dir = Path(os.path.join(pyt_out, sketch_name, daily, moment))
    sketch.__dict__["run_dir"] = run_dir
    run_dir.mkdir(parents=True, exist_ok=True)

    shutil.copy(sketch.__file__, run_dir / f"{sketch_name}.py")

    with open(run_dir / f".snakepyt", "w") as metadata:
        metadata.write(f"snakepyt version {session.snakepyt_version[0]}.{session.snakepyt_version[1]}\n")

    if hasattr(sketch, "main"):
        if hasattr(sketch, "final"):
            finalizer = sketch.final.__code__
        else:
            finalizer = None
        try:
            failures, runs = run(session, sketch.main, None, (), sketch.__dict__, log, sources, finalizer)
        except KeyboardInterrupt:
            log.blank().log("aborted", mode="info").blank()
            return
    else:
        log("sketch has no main function", mode="error", indent=4)

    if failures == 0:
        log(f"finished {runs} run(s) in {perf_counter() - t0:.3f}s", mode="success")
    elif failures < runs:
        log(f"finished {runs-failures} of {runs} run(s) in {perf_counter() - t0:.3f}s", mode="info")
        log(f"{failures} run(s) failed to finish", mode="error")
    else:
        log(f"all {failures} run(s) failed to finish", mode="error")

