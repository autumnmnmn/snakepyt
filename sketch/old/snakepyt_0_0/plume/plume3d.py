
import math
import time
from pathlib import Path
from random import random

import torch

from lib.util import *
from lib.spaces import insert_at_coords, map_space

def init():
    schedule(_settings_0, range(10000))

name = "plume3"

device = "cuda"
torch.set_default_device(device)

t_real = torch.double
t_complex = torch.cdouble

tau = 3.14159265358979323 * 2

randomize = False
random_range = tau #/ 50

particle_count = 1000000


# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale_power = 10
scale = 2 ** scale_power

origin = 0, 0
span = 2, 2

stretch = 1, 1

zooms = [
        ]


p_positions = (torch.rand([particle_count,3], device=device, dtype=t_real) - (0.5))
#p_positions[:,0] -= 0.5
#p_positions[:,1] -= 0.5
#p_positions[:,2] = 0# -= 0.5
p_positions *= 1
p_colors = torch.ones([particle_count,3], device=device, dtype=t_real)
color_rotation = torch.linspace(0, tau / 4, particle_count)

p_colors[:,0] = torch.frac((p_positions[:,0] / 4 + 0.5) * 10)
#p_colors[:,1] = torch.frac((p_positions[:,1] / 2 + 0.5) * 10)
p_colors[:,2] = torch.frac((p_positions[:,1] / 4 + 0.5) * 10)
p_colors[:,1] = (1 - (p_colors[:,0] + p_colors[:,2])).clamp(0,1)

ones = torch.ones_like(p_positions)

def proj(u, v):
    dot = (u * v).sum(dim=1)
    scale = (dot / (v.norm(p=2, dim=1) ** 2))
    out = v.clone()
    # todo: find better way
    for dim in range(3):
        out[:,dim] *= scale
    return out

def proj_shift(a, b):
    return a + proj(b, a)

def get_transformation(direction, flow, ebb, rescaling):
    def transformation(p):
        #return blus(p, ones) - ones
        #if randomize:
        #    direction = flow * torch.polar(ones.real, (random() * random_range - random_range / 2) * ones.real)
        if flow == 0:
            result = p - direction * ebb
        else:
            result = proj_shift(p, direction * flow) - direction * ebb
        #res_abs = result.abs()
        if rescaling:
            result /= result.norm(p=2,dim=1).max()
            #result = torch.polar(2 * res_abs / res_abs.max(), result.angle())
        return result
    return transformation


def _settings_0(seed):
    direction = ones.clone()
    direction[:,1] = 0
    direction[:,2] = 0
    show_frame = True
    if seed % 3 == 0:
        ebb = 0
        iterations = 1
        flow = 1 / iterations
        rescaling = False
        show_frame = seed == 9999
    elif seed % 3 == 1:
        flow = 0
        iterations = 1
        ebb = 0.87 / iterations
        rescaling = False
        show_frame = False
    elif seed % 3 == 2:
        flow = 0
        ebb = 0
        iterations = 1
        rescaling = True
        show_frame = False
    next_positions = get_transformation(direction, flow, ebb, rescaling)
    schedule(run, None)


frame_index = [0]

mapping = map_space(origin, span, zooms, stretch, scale)
(_, (h,w)) = mapping

rotation_rate = 0#.02
rotation_rate_b = 0#.025

def project(p, c, transform):
    (offset, rotation) = transform
    _p = p - offset
    _p = _p / _p.norm(p=2,dim=1).max()
    _p = (rotation @ _p.transpose(1,0)).transpose(1,0)
    c_filter = _p[:,2] < 99990
    _c = c.clone()
    for d in range(3):
        _c[:,d] *= c_filter
    return (_p[:,0:2].permute(1,0), _c)

scratch = torch.zeros([h, w, 3], device=device, dtype=t_real)

def run():
    global scratch
    for iteration in range(iterations):
        if show_frame:
            c = math.cos(frame_index[0] * rotation_rate)
            s = math.sin(frame_index[0] * rotation_rate)
            rotation_a = torch.tensor([
                [1, 0, 0],
                [0, c,-s],
                [0, s, c]], dtype=torch.double)
            c = math.cos(frame_index[0] * rotation_rate_b)
            s = math.sin(frame_index[0] * rotation_rate_b)
            rotation_b = torch.tensor([
                [c,-s, 0],
                [s, c, 0],
                [0, 0, 1]], dtype=torch.double)
            dist = direction
            offset = flow * dist * (iteration)
            offset -= ebb * dist * iteration

            transform = (offset, rotation_a @ rotation_b)

            frame_index[0] += 1
            p_projected, c_filtered = project(p_positions, p_colors, transform)

            if iteration % 1 == 0:
                scratch *= 0
                insert_at_coords(p_projected, c_filtered, scratch, mapping)
                save(scratch.permute(2,0,1).sqrt(), f"{run_dir}/{frame_index[0]:06d}")

        p_positions.copy_(next_positions(p_positions))


