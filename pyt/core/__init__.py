
"""
    Snakepyt Core: Dependency-free hot-reloading sketch runner.

    Supports persistent state between reloads (for e.g. ML models, large datasets)

    Provides scheduling utility for performing multidimensional parameter sweeps without
    manually nesting loops and try-catch blocks.
"""

from .core import AttrDict, Errs, errs, lsnap

from .logger import Logger

from .sketch import try_dump_locals

from .commands import builtin_commands, command_registrar

from .session import PytSession

