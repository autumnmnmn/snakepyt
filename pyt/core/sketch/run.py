
def establish_scheduler():
    schedule = []
    def _schedule(fn, args):
        schedule.append((fn, args))
    return (schedule, _schedule)

def handle_persistent(session, sketch_name, persistent_fn, module_globals, log, sources):
    # TODO refactor to not parse the same shit more than once
    import ast
    import hashlib
    import inspect
    from pyt.core.sketch.sketch import try_dump_locals

    # strip semantically-irrelevant whitespace & comments
    canonicalized_source = ast.unparse(ast.parse(sources[persistent_fn.__name__]))
    bytecode_hash = hashlib.sha256(canonicalized_source.encode()).hexdigest()

    if sketch_name in session.persistent_hashes:
        if bytecode_hash == session.persistent_hashes[sketch_name]:
            return True

    (success, locals_or_err) = try_dump_locals(persistent_fn,
                                               sources[persistent_fn.__name__],
                                               [], {},
                                               module_globals, log)

    if success:
        session.persistent_hashes[sketch_name] = bytecode_hash
        # TODO: sketches should get their own persistent state dicts, w/ a non-default
        # option to persist items into the top-level persistent_state instead
        session.persistent_state.update(locals_or_err)
    else:
        log(f"failed to run persistent function: {locals_or_err}", mode="error")

    return success

# TODO fix up the failure / runs count lmao
def run(session, fn, arg, partial_id, outer_scope, log, sources, finalizer=None):
    from time import perf_counter

    from pyt.core.sketch.sketch import try_dump_locals

    scope = dict(outer_scope)
    schedule, schedule_fn = establish_scheduler()
    scope["schedule"] = schedule_fn
    scope["print"] = log.tag(None).indented()
    scope["_print"] = print
    scope["pyt_in"] = session.env.IN
    run_id = partial_id + (arg,)

    args = [] if arg is None else [arg]
    (success, locals_or_err) = try_dump_locals(fn, sources[fn.__name__], args, {}, scope, log)
    if success:
        scope.update(locals_or_err)
    else:
        err = locals_or_err
        errs = try_dump_locals.errs
        if err == errs.NON_DICT_RETURN:
            log.log("could not extract locals. check for an early return",
                               mode="warning")
        else:
            log.indented().log(locals_or_err, mode="error")
            return (1, 1)

    failures = 0
    runs = 1

    for (fn, args) in schedule:
        if args is not None:
            for arg in args:
                _fails, _runs = run(session, fn, arg, run_id, scope, log, sources)
                failures += _fails
                runs += _runs
        else:
            t0 = perf_counter()
            log(f"begin {fn.__name__} {run_id}")
            (_fails, _runs) = run(session, fn, None, run_id, scope, log, sources)
            success = _fails == 0
            log(f"done in {perf_counter() - t0:.3f}s", mode="ok" if success else "error")
            log.blank()
            if not success:
                failures += 1
            runs += 1
    if finalizer is not None:
        try:
            exec(finalizer, globals=scope)
        except KeyboardInterrupt:
            raise
        except:
            log.trace(source=fn)
            return (failures, runs)
    return (failures, runs)


