
def establish_scheduler():
    schedule = []
    def _schedule(fn, args):
        schedule.append((fn, args))
    return (schedule, _schedule)

def handle_persistent(_, sketch_name, persistent_fn, module_globals, log, sources):
    import hashlib
    from pyt.lib.internal.witchery import try_dump_locals

    bytecode_hash = hashlib.sha256(persistent_fn.__code__.co_code).hexdigest()
    if sketch_name in _.persistent_hashes:
        if bytecode_hash == _.persistent_hashes[sketch_name]:
            return True
    (success, locals_or_err) = try_dump_locals(persistent_fn,
                                               sources[persistent_fn.__name__],
                                               [], {},
                                               module_globals, log)
    if success:
        _.persistent_hashes[sketch_name] = bytecode_hash
        _.persistent_state.update(locals_or_err)
    else:
        log(f"failed to run persistent function: {locals_or_err}", mode="error")

    return success

def run(_, fn, arg, partial_id, outer_scope, log, sources, finalizer=None):
    from time import perf_counter

    from pyt.lib.log import inner_log
    from pyt.lib.internal.witchery import try_dump_locals

    scope = dict(outer_scope)
    schedule, schedule_fn = establish_scheduler()
    scope["schedule"] = schedule_fn
    scope["print"] = inner_log(source=fn, indent=4)
    scope["pyt_in"] = _.pyt_in
    run_id = partial_id + (arg,)

    args = [] if arg is None else [arg]
    (success, locals_or_err) = try_dump_locals(fn, sources[fn.__name__], args, {}, scope, log)
    if success:
        scope.update(locals_or_err)
    else:
        err = locals_or_err
        errs = try_dump_locals.errs
        if err == errs.NON_DICT_RETURN:
            log.indented().log("could not extract locals. check for an early return",
                               mode="warning")
        else:
            log.indented().log(locals_or_err, mode="error")
            return (1, 1)

    failures = 0
    runs = 1

    for (fn, args) in schedule:
        if args is not None:
            for arg in args:
                _fails, _runs = run(_, fn, arg, run_id, scope, log.indented(), sources)
                failures += _fails
                runs += _runs
        else:
            t0 = perf_counter()
            log(f"begin {fn.__name__} {run_id}")
            success = run(fn, None, run_id, scope, log.indented(), sources)
            log(f"done in {perf_counter() - t0:.3f}s", mode="success" if success else "error")
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
            log.indented().trace(source=fn)
            return (failures, runs)
    return (failures, runs)


