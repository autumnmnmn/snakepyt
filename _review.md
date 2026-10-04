
Generated 06.09.2026 by Kimi K3

# Snakepyt review — findings & low-hanging fruit

Reviewed against v0.2 (working tree). Grouped by urgency; each item cites
where it lives. Aligned with the roadmap in `_design`: group A is roughly
the 0.3 milestone ("no clear correctness issues in core"), and several
items are already acknowledged there or in code TODOs.

## A. Broken today

1. **`pyt/core/color.py` — SyntaxError, module unimportable.**
   `to_cie_xyz` kwargs are missing commas (lines ~88-90). Even after fixing,
   `color_map` uses `deque` (l.215) and `_CONVERSION_EDGES` annotates with
   `Callable` (l.188), neither imported. (`color_torch.py` has both imports —
   copy from there.)
2. **`pyt/core/terminal/ansi/color.py` — unimportable.** No `dataclass` or
   `math` import (both used at module level), and it imports from the broken
   `pyt.core.color`. Dead on arrival.
3. **`ansi/codes.py::set_title`** — `ansi(0, title, end='\007')` raises
   `TypeError` (int in `';'.join`), and the shape is wrong anyway: OSC title
   is `\033]0;{title}\007`, not `\033[...`. Also `fg("default")`/`bg`/
   `bright_fg` emit `38`/`48`/`98` instead of `39`/`49` (or an error) because
   `_color_digits` maps `"default" -> 8`.
4. **`commands/llm.py` debug agent never matches its tools.** The `@tool`
   schemas are named `complete_answer`, `need_file`, `take_notes`, `give_up`
   (from class `__name__`), but the dispatch is `match func: case
   "complete answer"` etc. — spaces, not underscores. Every model response
   falls through to "bad tool call". The `debug`/`why`/`wtf` command is
   non-functional until the case labels use the underscored names.
5. **`llm/agent.py` references `refine_log`** (l.47), which is defined
   nowhere — `NameError` the first time `DefaultMode.get_tools` runs with
   >20 messages. (The whole AgentMode scaffold is dormant; still, the
   referenced name should exist or the line go.)
6. **`session.py` — `PYT_IN`/`pytrc env.IN` are dead.** argparse sets
   `--in` default `"."`, and `Path(".")` is truthy, so the cli default
   always wins the `cli > pytrc > env` chain. `OUT`/`SKETCH` default to
   `None` and work correctly; `--in` should too.
7. **`pyproject.toml` packages = ["pyt", "pyt.lib"]** — and `pyt/` has no
   `__init__.py` at all (it works as a namespace package from the source
   tree only). `pyt.core` and its
   subpackages (including `templates`, used via `importlib.resources` for
   pytrc generation) are not installed, so `pip install .` produces a
   `pyt` script that can't start. Also no `python_requires` despite 3.12+
   syntax (`type` statements in `lib/spaces.py`) and `pywrapl` pinning
   exactly (3,14,2); no optional-deps declared (`requests`, `websockets`).
8. **Zero-dependency core claim is broken by `requests`.**
   `commands/__init__` eagerly imports `commands.llm` → `llm.tools` →
   `import requests` at module top. Starting the repl without `requests`
   installed fails. (`websockets` shows the intended pattern — import-gated
   in `websocket.py` with graceful degradation. `_design` 0.8-0.9 already
   plans gating non-core modules; `requests` just needs the same treatment
   now.)
9. **`pyt/core/save.py` — dead module with hard deps.** Top-level
   `torch`/`safetensors` imports, nothing imports the module, and it
   duplicates `websocket.py`'s server on a different port. Delete or gate.
10. **`ansi/tui.py` runs a TUI at import time** — module-level
    `begin_tui()`/`parse_input()` calls at the bottom seize the terminal on
    `import`. Wrap in `if __name__ == "__main__":` or delete the demo.

## B. Latent bugs (break when the code path is exercised)

11. **`logger.py` / `persona.py` use `Callable` without importing it.**
    Harmless on 3.14 (lazy annotations) but a `NameError` on ≤3.13 — matters
    once `python_requires` exists.
12. **`sketch/run.py` mis-counts nested `schedule(fn, None)` runs.** The
    `args is None` branch does `failures += 1; runs += 1` and discards the
    child's `_fails/_runs` — a whole failing subtree counts as one failure
    and none of its runs. (The `# TODO fix up the failure / runs count lmao`
    is right there.) Also, an exception in `final()` isn't counted as a
    failure.
13. **`commands/sketch.py::_run` error paths.** `sys.path.pop(0)` is skipped
    if `import_module` raises (path entry leaks); a `ModuleNotFoundError`
    raised *inside* the sketch is reported as "no such sketch" after its
    traceback; the no-OUT error message points at `~/.config/pytrc.py`
    (actual: `~/.config/snakepyt/pytrc.py`); the `else: failures, runs = 0,0`
    branch is dead (immediately overwritten).
14. **Run directories have one-second resolution.**
    `OUT/<sketch>/<date>/tHH.MM.SS` — two runs of the same sketch within the
    same second share a directory and the copied sketch overwrites itself.
    `mkdir(exist_ok=True)` hides it. Add a suffix on collision.
15. **`session.update_class` kills the websocket server.** It constructs a
    fresh `PytSession` (which binds port 1314) while the old server thread
    still holds it → "port unavailable; webui server disabled" after any
    `reload` that touches `pyt.core.session`. The socket should survive
    session reconstruction like `persistent_state` does.
16. **`session.handle_message` bare `except:`** swallows
    `KeyboardInterrupt` raised inside a command and prints it as a trace.
17. **`commands/llm.py` debug loop has no step cap** — `while not done` can
    burn API tokens indefinitely if the model keeps calling `take_notes`;
    and the `need file` handler ends in a bare `raise` that kills the loop
    instead of feeding the failure back as notes.
18. **`lib/util.py`:** `mpilify_cpu` mutates the caller's tensor in place
    (`.cpu()` is a no-op returning self, then `clamp_`/`mul_`); `mpilify`
    clones first — pick one semantics. `timed` drops the wrapped function's
    return value. `msave_alt` computes a PNG buffer and discards it (the
    save is commented out) — dead code. The top-level `safetensors` import
    is only referenced from commented-out code.
19. **`lib/spaces.py`:** `map_space`'s `target_aspect is None or ()` is
    cryptic and the aspect derives from the *pre-zoom* span.
    `draw_points_2d` builds its mask on CPU regardless of `coords`' device,
    `mask.nonzero().squeeze()` collapses to a scalar when exactly one point
    is in range, and the 1-dim `colors` branch expands to a shape that can't
    match the channel-indexed `index_put_`.
20. **`lib/iter.py::first`** returns an `(index, value)` tuple despite the
    name; `pairs` duplicates `itertools.pairwise` (its own comment says so).

## C. Documentation / naming inconsistencies

21. **`templates/verbose.py` docstring** tells users to set
    `session.env.SKETCH_TEMPLATE` / `PYT_SKETCH_TEMPLATE`; the code reads
    `session.env.TEMPLATE` / `PYT_TEMPLATE` (session.py, commands/sketch.py).
22. **`commands/box.py`** docstring says it wraps the `in-box` CLI and shows
    `in-box dev ...` examples, but the registered command is `in-env`
    (aliases `inbox`, `ib`) — there is no `in-box` pyt command.
23. **`templates/pytrc.py` example** uses `add_argument("name", ...,
    default="world")` — a `default` on a positional without `nargs` is
    silently ignored, so `hello_world` with no args errors instead of
    greeting the world.
24. **`_design` todo "copy sketch file into HMS module run dir"** is already
    implemented (`shutil.copy` in `_run`) — cross it off.

## D. Hygiene

25. **Author-machine paths baked in:** `/home/ponder/ponder/openrouter`
    (llm/tools/tools.py key file), `HTTP-Referer: https://ponder.ooo`,
    `/usr/local/bin/in-env` (llm/tools/sandbox.py), `/run/media/ponder/...`
    model paths (`lib/_diff_nb`). Fine for a personal tool; will confuse
    anyone else. At minimum fall back gracefully (the key file does fall
    back to `OPENROUTER_API_KEY` — good).
26. **`websocket.py` binds `0.0.0.0`** — listens on all interfaces; sketches
    then hold whatever `receive()` picks up. Consider defaulting to
    localhost.
27. **`AttrDict` is defined twice** (`core/general.py`, `lib/util.py`) and
    the custom `__getattribute__` makes `__getattr__` dead code; it also
    means a stored key like `"keys"` shadows the dict method.
28. **Unused imports:** `repl.py` imports `persona`; `commands/commands.py`
    imports `sys`... small stuff, worth a sweep pass.

## What's solid (don't regress these)

- `terminal/monitor.py` — headless degradation, fifo lifecycle, the
  reaper, and the bidirectional reader's repaint logic are careful work.
- `llm/tools/mailbox.py` + `sandbox.py` — capability-request flow,
  transcript rendering, and the marker-based output capture are well
  thought out and honest about failure modes.
- `sketch/sketch.py` `ReturnLocalsWalker` — small, focused, does exactly
  what the format needs; nested-function handling is correct.
- `terminal/pywrapl.py` — the save/restore of everything `_pyrepl` touches
  (input hook, signal handlers, excepthook) is thorough.
- The `Logger` — frozen, chainable, dict-pretty-printing, tracebacks with
  clickable file links. The one gap (signature ≠ `print`) is already on the
  `_design` todo and is the #1 gotcha for sketch authors (see AGENTS.md).
