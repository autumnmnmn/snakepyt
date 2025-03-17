
import inspect
from argparse import ArgumentParser as ArgParser
from importlib import import_module as load
from time import perf_counter

from lib import util

parser = ArgParser("main.py")
parser.add_argument("sketch", help="the sketch to run", type=str)
args = parser.parse_args()

sketch = load(f"sketch.{args.sketch}")

settings_functions = [name for name in sketch.__dict__ if name.startswith("settings")]
key_fn = lambda name: int(name[9:])
settings_functions = [(name, sketch.__dict__[name]) for name in sorted(settings_functions, key=key_fn)]

def run(seed, fns, partial_id, outer_settings):
    run_id = partial_id + (seed,)
    fn_source = inspect.getsource(fns[0][1])
    fn_source_modified = f"{fn_source}\n    return locals()"
    sandbox = {}
    settings = dict(outer_settings)
    settings["seed"] = seed
    settings.pop("seeds", None) # del but without erroring if it's already non-present
    exec(fn_source_modified, globals=settings, locals=sandbox) # define fn in sandbox, feeding it the outer settings context
    try:
        settings.update(sandbox[fns[0][0]]()) # run the fn, dump its locals into the inner settings context
    except Exception as e:
        print(f"[Error in {fns[0][0]}: {e}]\n")
        return
    if len(fns) == 1:
        print(f"[begin {run_id}]")
        t0 = perf_counter()
        try:
            exec(sketch.run.__code__, globals=settings)
        except Exception as e:
            print(f"Error: {e}")
        #print(f"[done in {perf_counter() - t0:.3f}s]\n")
        print()
    else:
        if "seeds" in settings:
            for seed in settings["seeds"]:
                run(seed, fns[1:], run_id, settings)
        else:
            run(seed, fns[1:], run_id, settings)

t0 = perf_counter()
for seed in sketch.seeds:
    run(seed, settings_functions, (), sketch.__dict__)
print(f"== Finished all runs in {perf_counter() - t0:.3f}s ==")

