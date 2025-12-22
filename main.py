
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

from lib.log import Logger, inner_log
from lib.internal.parse import lsnap
from lib.internal.witchery import try_dump_locals

parser = ArgParser("snakepyt")
#parser.add_argument("sketch", help="the sketch to run", type=str)
args = parser.parse_args()

snakepyt_version = (0, 1)

def establish_scheduler():
    schedule = []
    def _schedule(fn, args):
        schedule.append((fn, args))
    return (schedule, _schedule)

def run(fn, arg, partial_id, outer_scope, log, sources, finalizer=None):
    scope = dict(outer_scope)
    schedule, schedule_fn = establish_scheduler()
    scope["schedule"] = schedule_fn
    scope["print"] = inner_log(source=fn, indent=4)
    run_id = partial_id + (arg,)

    args = [] if arg is None else [arg]
    (success, locals_or_err) = try_dump_locals(fn, sources[fn.__name__], args, {}, scope, log)
    if success:
        scope.update(locals_or_err)
    else:
        err = locals_or_err
        errs = try_dump_locals.errs
        if err == errs.NON_DICT_RETURN:
            log.indented().log("could not extract locals. check for an early return", mode="warning")
        else:
            log.indented().log(locals_or_err, mode="error")
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
    (success, locals_or_err) = try_dump_locals(persistent_fn, sources[persistent_fn.__name__], [], {}, module_globals, log)
    if success:
        persistent_hashes[sketch_name] = bytecode_hash
        persistent_state.update(locals_or_err)
    else:
        log(f"failed to run persistent function: {locals_or_err}", mode="error")

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

    message = message.lstrip()

    if message.startswith("."):
        if message.rstrip() == ".":
            pyt_print(persistent_state)
        else:
            segments = [segment.strip() for segment in message.split(".")][1:]
            selection = ("base scope", persistent_state)
            for segment in segments:
                if segment == "":
                    pyt_print("repeated dots (..) are redundant", mode="warning")
                    continue
                try:
                    selection = (segment, selection[1][segment])
                    pyt_print(f"{selection[0]}: {selection[1]}")
                except KeyError:
                    pyt_print(f"no \"{segment}\" in {selection[0]}", mode="error")
                    continue
                except TypeError:
                    pyt_print(f"{selection[0]} is not a scope", mode="error")
                    pyt_print.indented()(f"{selection[0]}: {selection[1]}", mode="info")

        continue


    (command, remainder) = lsnap(message)

    if command == "flush":
        persistent_state = {}
        persistent_hashes = {}
        pyt_print("state flushed")
        continue
    if command in ["exit", "quit", ":q", ",q"]:
        pyt_print.blank().log("goodbye <3").blank()
        repl_continue = False
        continue
    if command in ["hello", "hi"]:
        pyt_print("hiii :3")
        continue
    if command == "crash":
        raise Exception("crashing on purpose :3")
        continue
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

        if hasattr(sketch, "main"):
            if hasattr(sketch, "final"):
                finalizer = sketch.final.__code__
            else:
                finalizer = None
            try:
                run(sketch.main, None, (), sketch.__dict__, log, sources, finalizer)
            except KeyboardInterrupt:
                pyt_print.blank().log("aborted", mode="info").blank()
                continue
        else:
            log("sketch has no main function", mode="error", indent=4)

        log(f"finished all runs in {perf_counter() - t0:.3f}s")
        continue

    pyt_print(f"command: {command}", mode="info")

