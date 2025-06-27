import math
import random
import time
from pathlib import Path

import torch

from util import *

@settings
def _s():
    scale = 2 ** 10
    w = scale + 1
    h = scale + 1

    iterations = 500000
    debug_modulus = 10000

    offsets = [[-n,0] for n in range(17)] + [[n,0] for n in range(17)] + [[0,17]]
    drop_points = [[h//2,w//2+n] for n in range(17)]

    wrap_vertical = False
    wrap_horizontal = True

    name = "sand"
    out_file = ""

    device="cuda"
    ctype=torch.cdouble
    dtype=torch.double

@ifmain(__name__, _s)
@timed
def _main(settings):
    globals().update(settings.get())
    run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
    Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)
    with open(f"out/{run_dir}/settings.py", "w") as f:
        f.write(settings.src)
    torch.set_default_device(device)
    torch.set_default_dtype(dtype)
    dim = [h, w]

    grid = torch.zeros(dim, dtype=torch.int)

    max_c = 500
    c_total = 0
    last_c_total = 500

    n = len(offsets)

    for iteration in range(iterations):
        last = torch.clone(grid)
        for p in drop_points:
            #grid[p[0],p[1]] += 1
            grid[p[0],p[1]] = n
            # todo: make this index_put_
        peaks = (grid >= n).int()
        c = 0
        while torch.count_nonzero(peaks):
            c += 1

            shift = -(n * peaks)
            for offset in offsets:
                p_shift = torch.roll(peaks, offset, dims=[0,1])
                if offset[0] < 0 and not wrap_vertical:
                    p_shift[offset[0]:] = 0
                elif not wrap_vertical:
                    p_shift[:offset[0]] = 0
                if offset[1] < 0 and not wrap_horizontal:
                    p_shift[:,offset[1]:] = 0
                elif not wrap_horizontal:
                    p_shift[:,:offset[1]] = 0
                shift += p_shift
            grid += shift


            peaks = (grid >= n).int()
        c_total += c
        if c > 20:
            s = "*" if c >= max_c else ""
            print(f"{iteration}: {c}{s}")
            if c > (0.98 * max_c):
                msave(grid / (n-1), f"{run_dir}/{out_file}_{iteration}_{c}")
                msave(last / (n-1), f"{run_dir}/{out_file}_{iteration}_prev")
            if c > max_c:
                max_c = c
        if iteration % debug_modulus == 0:
            msave(grid / (n-1), f"{run_dir}/{out_file}_{iteration}_")
        if c_total > (last_c_total * 2):
            msave(grid / (n-1), f"{run_dir}/{out_file}_{iteration}_ct{c_total}")
            last_c_total = c_total

    msave(grid / (n-1), out_file)

