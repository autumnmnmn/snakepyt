
import math
import time
from pathlib import Path
from random import random

import torch

from lib.util import *
from lib.spaces import insert_at_coords, map_space

seeds = range(50)
name = "blus"

device = "cuda"
torch.set_default_device(device)

t_real = torch.double
t_complex = torch.cdouble

tau = 3.14159265358979323 * 2

randomize = False
random_range = tau #/ 50
show_gridlines = False

particle_count = 300000


# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale_power = 11
scale = 2 ** scale_power

origin = 0, 0
span = 5, 5

stretch = 1, 1

zooms = [
        ]


p_positions = (torch.rand([particle_count], device=device, dtype=t_complex) - (0.5 + 0.5j)) * 4
p_colors = torch.ones([particle_count,3], device=device, dtype=t_real)
color_rotation = torch.linspace(0, tau / 4, particle_count)

p_colors[:,0] = p_positions.real / 4 + 0.5
p_colors[:,2] = p_positions.imag / 4 + 0.5
p_colors[:,1] *= 0

ones = torch.ones_like(p_positions)

def blus(a, b):
    theta_a = a.angle()
    return torch.polar(a.abs() + b.abs() * torch.cos(b.angle() - theta_a), theta_a)

def get_transformation(direction, flow, ebb, rescaling):
    def transformation(p):
        #return blus(p, ones) - ones
        #if randomize:
        #    direction = flow * torch.polar(ones.real, (random() * random_range - random_range / 2) * ones.real)
        result = blus(p, direction * flow) - direction * ebb
        res_abs = result.abs()
        if rescaling:
            result = torch.polar(2 * res_abs / res_abs.max(), result.angle())
        return result
    return transformation


def settings_0():
    if seed % 3 == 0:
        ebb = 0
        iterations = 90
        flow = 2 / iterations
        rescaling = False
    elif seed % 3 == 1:
        flow = 0
        iterations = 30
        ebb = 1.8 / iterations
        rescaling = False
    elif seed % 3 == 2:
        flow = 0
        ebb = 0
        iterations = 10
        rescaling = True
    angle = 0 #if seed < 2 else tau / 4
    direction = torch.polar(ones.real, 1 * tau * ones.real)
    next_positions = get_transformation(direction, flow, ebb, rescaling)



frame_index = [0]

run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
mapping = map_space(origin, span, zooms, stretch, scale)
(_, (h,w)) = mapping
Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)
Path("out/" + run_dir + "/aggregate").mkdir(parents=True, exist_ok=True)
Path("out/" + run_dir + "/frame").mkdir(parents=True, exist_ok=True)

def run():
    scratch = torch.zeros([h, w, 3], device=device, dtype=t_real)

    def project(p):
        return torch.view_as_real(p).permute(1,0)

    for iteration in range(iterations):
        frame_index[0] += 1
        p_projected = project(p_positions).clone()

        if iteration % 1 == 0:
            scratch *= 0
            insert_at_coords(p_projected, p_colors, scratch, mapping)
            if show_gridlines:
                scratch[:,:,1] += gridlines
                scratch[:,:,2] += gridlines
            save(scratch.permute(2,0,1).sqrt(), f"{run_dir}/frame/{frame_index[0]:06d}")

        p_positions.copy_(next_positions(p_positions))

