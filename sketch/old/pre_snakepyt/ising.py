import time
from pathlib import Path

import torch

from util import *

@settings
def _s():
    name = "template"
    device = "cuda"

    t_real = torch.double
    t_complex = torch.cdouble

    # 9 -> 512 | 10 -> 1024 | 11 -> 2048
    scale_power = 9
    scale = 2 ** scale_power

    w, h = scale, scale


@ifmain(__name__, _s)
@timed
def _main(settings):
    globals().update(settings.get())
    run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
    Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)

    lattice = torch.randn([h,w], dtype=t_complex, device=device).round(0, 1)

    with open(f"out/{run_dir}/settings.py", "w") as f:
        f.write(settings.src)
    torch.set_default_device(device)

