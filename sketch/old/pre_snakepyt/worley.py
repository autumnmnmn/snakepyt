import time
from pathlib import Path

import torch
import math

from util import *

@settings
def _s():
    name = "worley"
    keep_records = False

    subcell_size = (16, 16, 16)
    subcell_counts = (8, 8, 8)
    max_feature_points = 9
    feature_point_density = 4

    device = "cuda"
    dtype = torch.double

    assert len(subcell_size) == len(subcell_counts), "dimensional consistency"

def tuple_mul(a,b):
    return tuple(a*b for a,b in zip(a,b))

def factorial(tensor):
    return torch.exp(torch.lgamma(tensor + 1))

def prob_n_points(n, density):
    return 1 / (math.pow(density, -n) * math.exp(density) * math.factorial(n))


@ifmain(__name__, _s)
@timed
def _main(settings):
    globals().update(settings.get())
    run_dir = ""
    if keep_records:
        run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
        Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)
        with open(f"out/{run_dir}/settings.py", "w") as f:
            f.write(settings.src)
    torch.set_default_device(device)

    dim = len(subcell_size)

    seed_points_shape = subcell_counts + (max_feature_points, dim)

    seed_points = torch.rand(seed_points_shape, dtype=dtype).mul_(2).add_(-1)

    result_shape = tuple_mul(subcell_size, subcell_counts)

    result = torch.zeros(result_shape, dtype=dtype)

    rng = torch.rand(subcell_counts)
    mask = torch.zeros(subcell_counts + (max_feature_points,), dtype=torch.bool)
    prob = 0
    for n in range(max_feature_points):
        prob += prob_n_points(n, feature_point_density)
        mask[...,n] = rng > prob
    #infs = ~mask * torch.inf
    #for dim_index in range(dim):
    #    seed_points[...,dim_index].mul_(infs)

    linspaces = [torch.arange(0, subcell_counts[d], 1 / subcell_size[d]) for d in range(dim)]
    grid_coords = torch.meshgrid(linspaces, indexing="ij")

    grid_indices = grid_coords[0].long().clone()
    for d in range(dim-1):
        grid_indices.add_(grid_coords[d+1].long() * subcell_counts[d])

    for d in range(dim):
        print(torch.take(seed_points[...,d], grid_indices))

    #breakpoint()

    # MxNxO points
    # AxBxC subcells = M//subdiv N//subdiv O//subdiv
    # one point randomly placed in each cell
    # AxBxCx
    # every point is closest to a point in one of its neighbor cells
    # figure out distance to that point

