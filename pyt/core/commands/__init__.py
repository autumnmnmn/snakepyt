
from .commands import registrar_attr, register_builtins as core_builtins

from .sketch import register_builtins as sketch_builtins

from ._test import register_builtins as _test_builtins

def register_builtins(group):
    core_builtins(group)
    sketch_builtins(group)
    _test_builtins(group)

