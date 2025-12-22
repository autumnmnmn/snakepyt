
import math
import time
from pathlib import Path
from random import random
import gc

import torch

from lib.util import *
from lib.spaces import insert_at_coords, map_space, cgrid


name = "plume3"

device = "cuda"
torch.set_default_device(device)
gc.collect()
torch.cuda.empty_cache()

t_real = torch.double
t_complex = torch.cdouble

tau = 3.14159265358979323 * 2

randomize = False
random_range = tau #/ 50

particle_count = 100


# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale_power = 7
scale = 2 ** scale_power

origin = 0.75, 0.75
span = 0.5, 0.5

stretch = 1, 1

zooms = [
        ]

#p_positions = (torch.rand([particle_count,2], device=device, dtype=t_real) - (0.5))

#ones = torch.ones_like(p_positions)

def proj(u, v):
    dot = (u * v).sum(dim=2)
    norm_sq = v.norm(p=2, dim=2) ** 2
    zero_mask = norm_sq == 0
    norm_sq += zero_mask
    scale = (dot / norm_sq) * ~zero_mask
    out = v.clone()
    for dim in range(out.shape[2]):
        out[:,:,dim] *= scale
    return out

def proj_shift(a,b):
    return a + proj(b,a)

def proj_shift_(a, b):
    dot = (a * b).sum(dim=2)
    scale = (dot / (b.norm(p=2, dim=2) ** 2))
    for dim in range(a.shape[2]):
        a[:,:,dim] *= 1 + scale
    return a

def get_transformation(direction, flow, ebb, rescaling):
    def transformation(p):
        #if flow == 0:
        #    result = p - direction * ebb
        #else:
        _ebb = torch.outer(ebb, direction).unsqueeze(1).expand(-1, particle_count, -1)
        _flow = torch.outer(flow, direction).unsqueeze(1).expand(-1, particle_count, -1)
        result = proj_shift(p, _flow) - _ebb
        if rescaling:
            result /= result.norm(p=2,dim=1).max()
        return result
    return transformation

def init():
    mapping = map_space(origin, span, zooms, stretch, scale)
    (_, (h,w)) = mapping

    ab = cgrid(mapping)

    image = torch.zeros([h, w, 3], device="cpu", dtype=t_real)

    p_positions = torch.rand([w, particle_count, 2], device=device, dtype=t_real) - 0.5

    schedule(rows, range(h))

def rows(row_index):

    schedule(columns, None)#range(w))

    schedule(out, None)

def out():
    im = image.clone()
    for c in range(3):
        im[:,:,c] = im[:,:,c] > 0
        #im[:,:,c] /= im[:,:,c].max()
    save(image.permute(2,0,1), f"{run_dir}/{frame_index[0]}")
    frame_index[0] += 1

def columns():
    direction = torch.tensor([1,0], dtype=t_real)#ones_like(p_positions)#.clone()
    #direction[:,1] = 0

    iterations = 1000
    ebb = ab[row_index].real
    flow = ab[row_index].imag

    rescaling = True


    next_positions = get_transformation(direction, flow, ebb, rescaling)

    schedule(run, None)



def c_avg(prev, val, n):
    """cumulative average
    prev: previous result (should be zero for n=1)
    val: next value
    n: how many values given so far, including this value"""
    prev_inf_mask = torch.isinf(prev)
    _next = prev + (val - prev) / n
    return torch.nan_to_num(_next) * ~prev_inf_mask + prev * prev_inf_mask


frame_index = [0]

def run():
    global scratch

    lyapunov_avg = torch.zeros([w,particle_count], dtype=t_real)
    diverge_iter = torch.ones([w], dtype=t_real) * torch.inf

    var_avg = torch.zeros([w], dtype=t_real)
    converge_iter = torch.ones([w], dtype=t_real) * torch.inf

    skip = 500

    for iteration in range(iterations):
        _next = next_positions(p_positions)
        if (iteration > skip):
            var = _next.var(dim=(1,2))
            lyapunov_term = (_next - p_positions).norm(p=2,dim=2).log()
            lyapunov_avg = c_avg(lyapunov_avg, lyapunov_term, iteration - skip)
            converge = (var - var_avg) < -(10**5)
            var_avg = c_avg(var_avg, var, iteration - 5)
            if converge.any():
                div_now = converge * (iteration - skip) / (iterations - skip) + torch.nan_to_num(~converge * torch.inf, 0, torch.inf)
                converge_iter = torch.min(converge_iter, div_now)
        p_positions.copy_(_next)

    image[row_index, :, 0] = torch.nan_to_num(converge_iter, 0, 0, 0)
    means = lyapunov_avg.mean(dim=1)
    image[row_index, :, 2] = torch.nan_to_num(means, 0, 0, 0).abs()
    #image[row_index, :, 1] = torch.nan_to_num(means == 0, 0, 0, 0).abs()


    means = var_avg.abs()
    image[row_index, :, 1] = torch.nan_to_num(means, 0, 0, 0).abs()



