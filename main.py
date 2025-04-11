
import inspect
import dis
import traceback
import hashlib
import sys
import os
import time
import shutil
from pathlib import Path
from argparse import ArgumentParser as ArgParser
from importlib import import_module, reload
from time import perf_counter

from lib import util
from lib.log import Logger, inner_log
from lib.internal.parse import lsnap

parser = ArgParser("snakepyt")
#parser.add_argument("sketch", help="the sketch to run", type=str)
args = parser.parse_args()

snakepyt_version = (0, 0)

def establish_scheduler():
    schedule = []
    def _schedule(fn, args):
        schedule.append((fn, args))
    return (schedule, _schedule)

def modify_to_dump_locals(fn, deftime_globals, log, sources):
    instructions = dis.get_instructions(fn)
    for instruction in instructions:
        if instruction.opcode == dis.opmap["RETURN_VALUE"]:
            return (False, "encountered return instruction")
    fn_source = sources[fn.__name__]
    fn_source_modified = f"{fn_source}\n    return locals()"
    sandbox = {}
    try:
        exec(fn_source_modified, globals=deftime_globals, locals=sandbox)
    except KeyboardInterrupt:
        raise
    except:
        log.indented().trace(source=fn)
        return (False, "error in definition")
    return (True, sandbox[fn.__name__])


def run(fn, arg, partial_id, outer_scope, log, sources, finalizer=None):
    scope = dict(outer_scope)
    schedule, schedule_fn = establish_scheduler()
    scope["schedule"] = schedule_fn
    scope["print"] = inner_log(source=fn, indent=4)
    fn_name = fn.__name__
    run_id = partial_id + (arg,)
    instructions = dis.get_instructions(fn)
    for instruction in instructions:
        if instruction.opcode == dis.opmap["RETURN_VALUE"]:
            log(f"{fn_name} cannot be scheduled because it has a return instruction", mode="error")
            return False
    fn_source = sources[fn.__name__]
    fn_source_modified = f"{fn_source}\n    return locals()"
    sandbox = {}
    try:
        exec(fn_source_modified, globals=scope, locals=sandbox)
        fn_modified = sandbox[fn_name]
        if arg is not None:
            fn_locals = fn_modified(arg)
        else:
            fn_locals = fn_modified()
        scope.update(fn_locals)
    except KeyboardInterrupt:
        raise
    except:
        log.indented().trace(source=fn)
        return False
    for (fn, args) in schedule:
        if args is not None:
            for arg in args:
                run(fn, arg, run_id, scope, log.indented(), sources)
        else:
            t0 = perf_counter()
            log(f"begin {fn.__name__} {run_id}")
            success = run(fn, None, run_id, scope, log.indented(), sources)
            log(f"done in {perf_counter() - t0:.3f}s", mode="success" if success else "error")
            log.blank()
    if finalizer is not None:
        try:
            exec(finalizer, globals=scope)
        except KeyboardInterrupt:
            raise
        except:
            log.indented().trace(source=fn)
            return False
    return True

persistent_state = {}
persistent_hashes = {}
def handle_persistent(persistent_fn, module_globals, log, sources):
    bytecode_hash = hashlib.sha256(persistent_fn.__code__.co_code).hexdigest()
    if sketch_name in persistent_hashes:
        if bytecode_hash == persistent_hashes[sketch_name]:
            return True
    (success, fn_or_err) = modify_to_dump_locals(persistent_fn, module_globals, log, sources)
    if success:
        try:
            fn_locals = fn_or_err()
        except KeyboardInterrupt:
            raise
        except:
            log.indented().trace(source=persistent_fn)
            return False
        persistent_hashes[sketch_name] = bytecode_hash
        persistent_state.update(fn_locals)
    else:
        log(f"failed to run persistent function: {fn_or_err}", mode="error")
    return success


try:
    username = os.getlogin()
except:
    username = None

pyt_print = Logger().mode("success").tag("snakepyt")
pyt_print(f"hello {username}! <3" if username else "hello! <3")
pyt_print.blank()

repl_continue = True
while repl_continue:
    try:
        message = pyt_print.input(username)
    except (KeyboardInterrupt, EOFError):
        pyt_print.blank().log("goodbye <3").blank()
        repl_continue = False
        continue

    if "prefix" in persistent_state:
        message = " ".join([persistent_state["prefix"], message])

    (command, remainder) = lsnap(message)

    if command == "state":
        pyt_print(persistent_state)
    if command == "flush":
        persistent_state = {}
        persistent_hashes = {}
        pyt_print("state flushed")
    if command in ["exit", "quit", ":q", ",q"]:
        pyt_print.blank().log("goodbye <3").blank()
        repl_continue = False
        continue
    if command == "crash":
        raise Exception("crashing on purpose :3")
    if command == "run":
        sketch_name, remainder = lsnap(remainder)

        try:
            pyt_print(f"loading sketch \"{sketch_name}\"", mode="info")
            module_name = f"sketch.{sketch_name}"
            if module_name in sys.modules:
                del sys.modules[module_name]
            sketch = import_module(module_name)
        except ModuleNotFoundError:
            pyt_print.indented().trace()
            pyt_print("no such sketch", mode="error", indent=4).blank()
            continue
        except KeyboardInterrupt:
            pyt_print("aborted", mode="info").blank()
            continue
        except:
            pyt_print.indented().trace()
            continue

        sources = { name : inspect.getsource(member)
                    for name, member in inspect.getmembers(sketch)
                    if inspect.isfunction(member) and member.__module__ == module_name
                   }

        log = pyt_print.tag(sketch_name).mode("info")

        t0 = perf_counter()
        if hasattr(sketch, "persistent"):
            if not handle_persistent(sketch.persistent, sketch.__dict__, log, sources):
                log.blank()
                continue

        sketch.__dict__.update(persistent_state)

        run_dir = time.strftime(f"%d.%m.%Y/{sketch_name}_t%H.%M.%S")
        sketch.__dict__["run_dir"] = run_dir
        Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)

        shutil.copy(sketch.__file__, f"out/{run_dir}/{sketch_name}.py")

        with open(f"out/{run_dir}/.snakepyt", "w") as metadata:
            metadata.write(f"snakepyt version {snakepyt_version[0]}.{snakepyt_version[1]}\n")

        if hasattr(sketch, "init"):
            if hasattr(sketch, "final"):
                finalizer = sketch.final.__code__
            else:
                finalizer = None
            try:
                run(sketch.init, None, (), sketch.__dict__, log, sources, finalizer)
            except KeyboardInterrupt:
                pyt_print.blank().log("aborted", mode="info").blank()
                continue
        else:
            log("sketch has no init function", mode="error", indent=4)
            #run(None, settings_functions, (), sketch.__dict__)

        log(f"finished all runs in {perf_counter() - t0:.3f}s")

