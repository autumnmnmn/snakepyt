
Last updated 06.09.2026 - Kimi K3

# Writing snakepyt sketches

Guidance for agents authoring *sketches* — the plain-`.py` scripts snakepyt's
repl runs with hot-reload, persistent state, and a scheduling utility. This
document is the authoritative reference for the sketch format as **actually
implemented** in `pyt/core/sketch/` and `pyt/core/commands/sketch.py`
(v0.2). Where the readme and this file disagree, trust this file.

(Working on the javascript webui instead? See `webui/AGENTS.md`.)

## What a sketch is

A sketch is a single python file in the sketches directory
(`session.env.SKETCH`; CLI `--sketches`, env var `PYT_SKETCH`, or cwd). It is
**not a module you run directly** — the snakepyt repl imports it, rewrites
its functions via AST, and drives them:

```
pyt> run mysketch extra args here
pyt> rrun mysketch            # reload snakepyt itself, then run
```

Every `run`:

1. Re-imports the sketch file from scratch (edits always take effect; no
   `reload` needed for sketch code).
2. Runs `persistent()` if its source changed since last run (see below).
3. Creates a fresh run directory: `OUT/<sketch>/<DD.MM.YYYY>/tHH.MM.SS/`,
   copies the sketch file into it, writes a `.snakepyt` version stamp.
4. Runs `main()`, then everything `main` scheduled, recursively.
5. Runs `final()` in `main`'s scope.

## The three functions

```python
def persistent():   # optional
def main():         # required
def final():        # optional
```

- `persistent()` — runs **once**, then only again when its function body
  changes (sha256 of the AST-canonicalized source) or after the `flush`
  command. Everything it defines as a local is merged into the session-wide
  `persistent_state` dict and injected as globals into `main` on every
  subsequent run. Use it for slow-to-load things: models, datasets, open
  files. Imports needed only here should happen *inside* the function so
  they land in persistent state too.
- `main()` — the entry point. Required; a sketch without it errors.
- `final()` — runs after `main` and all scheduled work, in `main`'s scope
  (it sees `main`'s final locals as globals). For summaries, aggregate
  stats, closing writers. Also runs if `main` itself crashed (but not if a
  *scheduled* function crashed).

Only functions **defined in the sketch file itself** participate;
`inspect.getsource` is keyed off the sketch module, so scheduling an
imported helper fails. Keep scheduled functions local to the sketch.

## `schedule(fn, iterable)` — parameter sweeps

Available inside `main` and any scheduled function. Queues `fn` to be
called once per item, **after the current function returns**:

```python
def render(res):
    # sees `seed` and `run_dir` without them being passed in
    img = torch.rand(res, res, 3) * seed
    pilify(img.clamp(0, 1)).save(run_dir / f"{seed}_{res}.png")

def main():
    import torch                      # imports in main are inherited too
    from pyt.lib.util import pilify
    seed = 42
    schedule(render, [256, 512, 1024])
```

Semantics, precisely:

- Each scheduled call runs with `fn(item)` — exactly one positional
  argument. Bundle parameters into tuples/dicts for multidimensional sweeps.
- `schedule(fn, None)` runs `fn()` once with no arguments (and logs timing).
- `schedule(fn, [])` silently runs nothing.
- Scheduled functions see the **scheduling function's locals as globals**
  (scope inheritance): in the example, `render` reads `seed`. This is a
  snapshot copy taken when the child runs — children cannot write back.
- Scheduled functions can themselves call `schedule` — nested sweeps
  without nested loops. Children run depth-first after their parent.
- Scheduled work only runs if the scheduling function **completes** — an
  exception discards that function's pending schedule queue (an early
  `return` is fine; a raise is not).
- Each call is wrapped in its own try/except: a failure prints a clickable
  traceback and the sweep **continues**; failures are counted and reported
  at the end.

## Injected names (globals of `main` and scheduled functions)

| name | what it is |
|---|---|
| `schedule` | the scheduler described above |
| `print` | **the snakepyt Logger, not builtin print** (see gotchas) |
| `_print` | the real builtin `print` |
| `run_dir` | `pathlib.Path` of this run's output directory (already created) |
| `args` | the raw string after the sketch name on the `run` command line |
| `pyt_in` | `session.env.IN`, the configured input-data path |
| `send` / `receive` | websocket broadcast / blocking receive to the webui |
| *plus* | every name from `persistent()`'s locals, as globals |

`persistent()` itself gets **none** of these — it runs in the module's
plain globals. It can't call `schedule`, and `print` there is the builtin.

## Gotchas (these bite agents constantly)

1. **`print` is not `print`.** It's a `Logger.__call__` taking exactly one
   positional `content` argument. `print(a, b)`, `print()`, `print(x, end="")`
   all raise `TypeError`. Use f-strings: `print(f"loss: {loss}")`. Dicts are
   pretty-printed automatically. For real stdout, use `_print`.
2. **No `yield`** in persistent/main/final/scheduled functions — the AST
   rewrite warns and it will misbehave. Refactor generators into list
   builders.
3. **Early `return` is fine** — all returns are rewritten to also dump
   `locals()`, and anything already queued with `schedule` still runs.
4. **Nested function definitions are not rewritten** — only the top-level
   sketch functions dump their locals. A closure defined inside `main` and
   passed to `schedule` has no source in the runner's table and will fail.
   Define scheduled functions at module top level.
5. **One shared persistent namespace.** All sketches share
   `session.persistent_state`; two sketches whose `persistent()` both define
   `model` collide. Prefix names if you run several sketches in a session.
   Renaming a sketch orphans its cached state (cache is keyed by name).
6. **`args` is a string.** Parse it yourself (`shlex.split`, `json.loads`,
   `float(args)`, ...). Nothing validates it.
7. **`receive()` blocks forever** by default and the websocket server binds
   all interfaces. Prefer `receive(block=False)` inside try/except
   `queue.Empty`, or pass a timeout. If the `websockets` package isn't
   installed the server silently no-ops — `receive()` will just block.
8. **Save into `run_dir`.** It exists, is unique per run, and contains a
   copy of the sketch as-run. Absolute paths elsewhere defeat the record.
9. **Import errors inside a sketch are misreported.** If your sketch's
   top-level `import foo` fails with `ModuleNotFoundError`, the repl prints
   the real traceback and then a misleading "no such sketch" — read the
   trace, not the last line. (Known bug.)
10. **Exceptions don't kill the repl.** `main` failing still runs `final`.
    `KeyboardInterrupt` aborts the sweep cleanly.

## Style & philosophy

- Sketches should be **concise**; heavy lifting belongs in `pyt/lib` (or a
  helper imported by the sketch), iteration logic in the sketch. The design
  doc is explicit: "the library should be designed such that sketches can
  be as concise as possible."
- Prefer `schedule` over hand-written loops-with-try/except — that's the
  point of the system.
- Use `persistent()` aggressively for anything slow; it makes the
  edit-run-edit loop fast. Remember it re-runs automatically when you edit
  its body, so keep cheap sanity printing out of it.
- The codebase favors plain functions, dict-shaped state, and graceful
  degradation over frameworks and ceremony. Match that.

## Useful repl commands while iterating

- `run <sketch> [args]`, `rrun <sketch>` (reload + run)
- `flush` — clear persistent state (and the CUDA cache) so `persistent()`
  re-runs
- `reload` — hot-reload snakepyt's own modules
- `.` — list persistent state; `.name` — drill into a value
- `python` — drop into a real python repl with persistent state in scope
- `prefix <cmd>` / `un` — prefix every input line with a command
- `new <name>` — scaffold a sketch from the template
- `cmds` — list all commands; `exit`

## A complete example

```python
def persistent():
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    basis = torch.randn(3, 3, device=device)

def render(params):
    scale, seed = params
    torch.manual_seed(seed)
    img = (torch.rand(512, 512, 3, device=device) * scale * basis.sum()).clamp(0, 1)
    from pyt.lib.util import pilify
    pilify(img).save(run_dir / f"scale{scale}_seed{seed}.png")
    print(f"rendered scale={scale} seed={seed}")

def main():
    print(f"args were: {args!r}")
    combos = [(s, seed) for s in (0.5, 1.0, 2.0) for seed in range(3)]
    schedule(render, combos)

def final():
    print(f"outputs in {run_dir}")
```

Note how `render` reads `device` and `basis` (persistent state) and
`run_dir` (injected) as if they were globals — because they are.
