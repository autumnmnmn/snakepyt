
"""
    Snakepyt Core: Dependency-free hot-reloading sketch runner.

    Supports persistent state between reloads (for e.g. ML models, large datasets)

    Provides scheduling utility for performing multidimensional parameter sweeps without
    manually nesting loops and try-catch blocks.
"""

from .general import *

from .session import PytSession

