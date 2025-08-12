import dis

class Errs(type):
    def __iter__(_class):
        return iter((k,v) for (k,v) in vars(_class).items() if not k.startswith("_"))

    def __repr__(_class):
        return str(list(k for (k,v) in _class))

def errs(errs):
    def _errs(fn):
        fn.errs = errs
        return fn
    return _errs

# stuff above this line i probs move to another file

class _Errs(metaclass=Errs):
    FOUND_RETURN = "encountered return instruction"
    IN_DEFINITION = "error in fn definition"
    IN_EXECUTION = "error in fn execution"
    NON_DICT_RETURN = "fn dumped a non-dict"

def _modify_to_dump_locals(fn, fn_source, deftime_globals, log):
    instructions = dis.get_instructions(fn)
    for instruction in instructions:
        if instruction.opcode == dis.opmap["RETURN_VALUE"]:
            return (False, _Errs.FOUND_RETURN)
    fn_source = fn_source
    fn_source_modified = f"{fn_source}\n    return locals()"
    sandbox = {}
    try:
        exec(fn_source_modified, globals=deftime_globals, locals=sandbox)
    except KeyboardInterrupt:
        raise
    except:
        log.indented().trace(source=fn)
        return (False, _Errs.IN_DEFINITION)
    return (True, sandbox[fn.__name__])

@errs(_Errs)
def try_dump_locals(fn, fn_source, args, kwargs, deftime_globals, log):
    (success, fn_or_err) = _modify_to_dump_locals(fn, fn_source, deftime_globals, log)
    if not success:
        return (False, fn_or_err)
    try:
        res = fn_or_err(*args, **kwargs)
    except KeyboardInterrupt:
        raise
    except:
        log.indented().trace(source=fn)
        return (False, _Errs.IN_EXECUTION)
    if not isinstance(res, dict):
        return (False, _Errs.NON_DICT_RETURN)
    return (True, res)
