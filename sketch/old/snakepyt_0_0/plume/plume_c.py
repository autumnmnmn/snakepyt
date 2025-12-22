
import math
import time
from pathlib import Path
from random import random

import torch

from lib.util import *
from lib.spaces import insert_at_coords, map_space, cgrid


device = "cuda"
torch.set_default_device(device)

t_real = torch.double
t_complex = torch.cdouble

tau = 3.14159265358979323 * 2

randomize = False
random_range = tau #/ 50

# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale_power = 13
scale = 2 ** scale_power


stretch = 1, 1

zooms = [
        ]

def proj(u, v):
    dot = (u * v).sum(dim=1)
    scale = (dot / (v.norm(p=2, dim=1) ** 2))
    out = v.clone()
    for dim in range(out.shape[1]):
        out[:,dim] *= scale
    return out

def bad_proj(u, v):
    dot = (u * v).sum(dim=1)
    scale = (dot / v.norm(p=2, dim=1))
    out = v.clone()
    for dim in range(out.shape[1]):
        out[:,dim] *= scale
    return out

def proj_shift(a, b):
    return a + proj(b, a)

def bad_proj_shift(a, b):
    return a + bad_proj(b, a)

def get_transformation(direction, flow, ebb, rescaling):
    def transformation(p):
        d = direction
        d[:,0] += torch.rand_like(direction[:,0]) * 0.0001
        if flow == 0:
            result = p - direction * ebb
        else:
            result = proj_shift(p, d * flow)
            result -= direction * ebb #proj_shift(result, direction * ebb)
        if rescaling:
            result /= result.norm(p=2,dim=1).max()
        return result
    return transformation

def init():
    steps = 1
    schedule(per_t, [i / steps for i in range(steps)])

def eerp(a,b,t):
    return math.pow(b/a, t)*a

def per_t(t):
    origin = 0.0625, -0.15

    #s = eerp(1000, 0.001, t)
    s = 0.25
    x_range = 0.5 * s
    y_range = 1 * s

    span = x_range, y_range
    mapping = map_space(origin, span, zooms, stretch, scale)
    (_, (h,w)) = mapping

    grid = cgrid(mapping)

    scratch = torch.zeros([h, w, 3], device=device, dtype=t_real)
    p_positions = torch.zeros([h*w,2], device=device, dtype=t_real)
    p_positions[:,0] = grid.real.reshape((h*w))
    p_positions[:,1] = grid.imag.reshape((h*w))

    direction = torch.ones_like(p_positions)
    direction[:,0] = 0

    iterations = 1301
    #show_frame = lambda i: i == iterations - 1
    show_frame = lambda i: i % 100 == 0#True
    #show_frame = lambda i: True

    #ebb = 0.804#0.9000469530469531 - 0.001 + 0.002 * t
    #ebb = 1 + 0.4 * t
    #ebb = 0.4
    ebb = 0.83314# + (0.001 * t)
    #ebb = (0.5 + 0.5 * t)#0.804#482 / 600
    #ebb = 0.0 + 0.01 * t #0.9000469530469531 #+ 0.00001 * t #0.9000595404595405
    flow = 1
    rescaling = False


    next_positions = get_transformation(direction, flow, ebb, rescaling)
    schedule(run, None)

frame_index = [0]

def c_avg(prev, val, n):
    """cumulative average
    prev: previous result (should be zero for n=1)
    val: next value
    n: how many values given so far, including this value"""
    prev_inf_mask = torch.isinf(prev)
    _next = prev + (val - prev) / n
    return torch.nan_to_num(_next) * ~prev_inf_mask + prev * prev_inf_mask


def run():
    global scratch

    diff_avg = torch.zeros([h*w], device=device, dtype=t_real)

    for iteration in range(iterations):
        _next = next_positions(p_positions)
        diff = (p_positions - 0).norm(p=2, dim=1)

        diff_avg = c_avg(diff_avg, diff, iteration + 1)
        #diff /= diff.max()

        if show_frame(iteration):
            #diff_avg = diff
            frame_index[0] += 1
            print(f"{frame_index[0]}: ebb={ebb}")

            #pos_reshape = p_positions.reshape((h,w,2))
            #scratch[:,:,0] = pos_reshape[:,:,0] + 0.5
            #scratch[:,:,1] = pos_reshape[:,:,1] + 0.5

            #scratch += 0.5
            #scratch *= 2
            scratch[:,:,2] = diff_avg.nan_to_num().reshape((h,w))
            #scratch[:,:,2] = diff_avg.nan_to_num().reshape((h,w))

            scratch[scratch < 0] = 0

            #scratch[:,:,0] = scratch[:,:,0].pow(2)
            #scratch[:,:,2] = scratch[:,:,2].pow(0.5)

            scratch[:,:,2] -= scratch[:,:,2].mean()
            scratch[:,:,2] /= scratch[:,:,2].std() * 6
            #scratch[:,:,2] /= scratch[:,:,2].max()

            scratch[:,:,2] += 0.5

            #scratch[:,:,1] = diff.reshape((h,w)) / diff.max()

            save(scratch.permute(2,0,1), f"{run_dir}/{frame_index[0]:06d}")

        p_positions.copy_(_next)


