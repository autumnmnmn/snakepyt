
import ast
import inspect

from pyt.core.core import Errs, errs

class ReturnLocalsWalker(ast.NodeTransformer):
    def __init__(self, logger):
        super().__init__()
        self.log = logger

    def visit_Return(self, node):
        if node.value:
            original_value = node.value
        else:
            original_value = ast.Constant(value=None)

        new_return_val = ast.Tuple(
            elts=[
                original_value,
                ast.Call(
                    func=ast.Name(id="locals", ctx=ast.Load()),
                    args=[],
                    keywords=[]
                )
            ],
            ctx=ast.Load()
        )

        return ast.copy_location(ast.Return(value=new_return_val), node)

    def visit_FunctionDef(self, node):
        if hasattr(self, "_root_seen"):
            return node

        self._root_seen = True

        self.generic_visit(node)

        if not node.body or not isinstance(node.body[-1], ast.Return):
            explicit_return = ast.Return(
                value=ast.Tuple(
                    elts=[
                        ast.Constant(value=None),
                        ast.Call(
                            func=ast.Name(id="locals", ctx=ast.Load()),
                            args=[],
                            keywords=[]
                        )
                    ],
                    ctx=ast.Load()
                )
            )
            node.body.append(explicit_return)

        return node

    def visit_Yield(self, node):
        self.log("Encountered a yield in a scheduled function. This will probably break things.", mode="warning")
        return node


class _Errs(metaclass=Errs):
    IN_DEFINITION = "error in fn definition"
    IN_EXECUTION = "error in fn execution"
    NON_DICT_RETURN = "fn dumped a non-dict"

def modify_to_dump_locals(func, source, deftime_globals, log):
    tree = ast.parse(source)

    rewriter = ReturnLocalsWalker(log)
    tree = rewriter.visit(tree)
    ast.fix_missing_locations(tree)

    try:
        code_obj = compile(tree, filename=inspect.getfile(func), mode="exec")

        sandbox = {}
        exec(code_obj, deftime_globals, sandbox)

        new_func = sandbox[tree.body[0].name]
        new_func.__code__ = new_func.__code__.replace(co_firstlineno = func.__code__.co_firstlineno)
    except (KeyboardInterrupt, SystemExit):
        raise
    except:
        log.trace()
        return (False, _Errs.IN_DEFINITION)

    return (True, new_func)

@errs(_Errs)
def try_dump_locals(fn, fn_source, args, kwargs, deftime_globals, log):
    (success, fn_or_err) = modify_to_dump_locals(fn, fn_source, deftime_globals, log)
    if not success:
        return (False, fn_or_err)
    try:
        scheduled_function = fn_or_err
        res = scheduled_function(*args, **kwargs)
    except (KeyboardInterrupt, SystemExit):
        raise
    except:
        log.indented().trace()
        return (False, _Errs.IN_EXECUTION)
    if not isinstance(res[1], dict):
        return (False, _Errs.NON_DICT_RETURN)
    return (True, res[1])

