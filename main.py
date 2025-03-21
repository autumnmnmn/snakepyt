
import inspect
import dis
import traceback
import hashlib
import sys
from argparse import ArgumentParser as ArgParser
from importlib import import_module, reload
from time import perf_counter

from lib import util
from lib.log import log, inner_log, trace, blank

parser = ArgParser("snakepyt")
#parser.add_argument("sketch", help="the sketch to run", type=str)
args = parser.parse_args()


def establish_scheduler():
    schedule = []
    def _schedule(fn, args):
        schedule.append((fn, args))
    return (schedule, _schedule)

def modify_to_dump_locals(fn, deftime_globals):
    instructions = dis.get_instructions(fn)
    for instruction in instructions:
        if instruction.opcode == dis.opmap["RETURN_VALUE"]:
            return (False, "encountered return instruction")
    fn_source = inspect.getsource(fn)
    fn_source_modified = f"{fn_source}\n    return locals()"
    sandbox = {}
    try:
        exec(fn_source_modified, globals=deftime_globals, locals=sandbox)
    except:
        trace(source=fn, indent=4)
        return (False, "error in definition")
    return (True, sandbox[fn.__name__])


def run(fn, arg, partial_id, outer_scope):
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
    fn_source = inspect.getsource(fn)
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
    except:
        trace(source=fn, indent=4)
        return False
    for (fn, args) in schedule:
        if args is not None:
            for arg in args:
                run(fn, arg, run_id, scope)
        else:
            t0 = perf_counter()
            log(f"begin {fn.__name__} {run_id}")
            success = run(fn, None, run_id, scope)
            log(f"done in {perf_counter() - t0:.3f}s", mode="success" if success else "error")
            blank()
    return True

persistent_state = {}
persistent_hashes = {}
def handle_persistent(persistent_fn, module_globals):
    bytecode_hash = hashlib.sha256(persistent_fn.__code__.co_code).hexdigest()
    if sketch_name in persistent_hashes:
        if bytecode_hash == persistent_hashes[sketch_name]:
            return True
    persistent_hashes[sketch_name] = bytecode_hash
    (success, fn_or_err) = modify_to_dump_locals(persistent_fn, module_globals)
    if success:
        fn_locals = fn_or_err()
        persistent_state.update(fn_locals)
    else:
        log(f"failed to run persistent function: {fn_or_err}", mode="error")
    return success

repl_continue = True
while repl_continue:
    try:
        command = input("snakepyt: ")
    except (KeyboardInterrupt, EOFError):
        blank()
        log("goodbye <3")
        blank()
        repl_continue = False
        continue

    sketch_name = command.strip()

    try:
        module_name = f"sketch.{sketch_name}"
        if module_name in sys.modules:
            del sys.modules[module_name]
        sketch = import_module(module_name)
    except:
        trace(indent=4)
        continue

    t0 = perf_counter()
    if hasattr(sketch, "persistent"):
        if not handle_persistent(sketch.persistent, sketch.__dict__):
            blank()
            continue

    sketch.__dict__.update(persistent_state)

    if hasattr(sketch, "init"):
        run(sketch.init, None, (), sketch.__dict__)
    else:
        log("sketch has no init function", mode="error")
        #run(None, settings_functions, (), sketch.__dict__)

    log(f"== Finished all runs in {perf_counter() - t0:.3f}s ==")

