# Thomas' cyclically symmetric attractor / "Labyrinth Chaos"
# see "Deterministic chaos seen in terms of feedback circuits: Analysis, synthesis, 'labyrinth chaos'" by René Thomas

import time
import math
from pathlib import Path

import torch

from lib.spaces import insert_at_coords, map_space
from lib.ode import rk4_step
from lib.util import *

def init():
    schedule(run, None)

name = "labyrinth"
device = "cuda"
torch.set_default_device(device)
t_fp = torch.double
torch.set_default_dtype(t_fp)

dissipation = 0.04 # "b" parameter in the literature

tau = 3.14159265358979323 * 2

particle_count = 50000
iterations = 1000
save_if = lambda i: i > 150 and i % 5 == 0
rotation_rate = tau / 2000

# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale_power = 10

scale = 2560#2 ** scale_power
origin = 0, 0
s = 2
span = 16 * s, 9 * s
zooms = [
        ]
stretch = 1, 1

mapping = map_space(origin, span, zooms, stretch, scale)
(_, (h,w)) = mapping

dt = 0.01


def derivative(p):
    return torch.sin(p[[1,2,0]]) - p * dissipation

step = lambda p, dp, h: p + dp * h * dt
rk4_curried = lambda p: rk4_step(derivative, step, p)

p_positions = (torch.rand([3, particle_count], device=device, dtype=t_fp) - 0.5) * 20

p_colors = torch.rand([particle_count,3], device=device, dtype=t_fp)

color_rotation = torch.linspace(0, tau / 4, particle_count)

p_colors[:,0] = (p_positions[0,:] / 20) + 0.5
p_colors[:,1] = (p_positions[1,:] / 20) + 0.5
p_colors[:,2] = (p_positions[2,:] / 20) + 0.5

def project(p, colors, i):
    c = math.cos(i * rotation_rate)
    s = math.sin(i * rotation_rate)
    rotation = torch.tensor([
        [1, 0, 0],
        [0, c,-s],
        [0, s, c]])
    #rotation = torch.tensor([
    #    [ c, 0, s],
    #    [ 0, 1, 0],
    #    [-s, 0, c]])
    #rotation = torch.tensor([
    #    [c, -s, 0],
    #    [s,  c, 0],
    #    [0,  0, 1]])
    alt_colors = colors.clone()
    res = (rotation @ p)
    color_filter = res[2].abs() < 0.7
    alt_colors[:,0] *= color_filter
    alt_colors[:,1] *= color_filter
    alt_colors[:,2] *= color_filter
    return (res[0:2], alt_colors)

frame_index = [0]

def run():
    run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
    Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)

    scratch = torch.zeros([h, w, 3], device=device, dtype=t_fp)

    for iteration in range(iterations):
        if save_if(iteration) or iteration == iterations - 1:
            (p_projected, alt_colors) = project(p_positions, p_colors, iteration)
            frame_index[0] += 1
            scratch *= 0
            insert_at_coords(p_projected, alt_colors, scratch, mapping)
            #save(scratch.permute(2,0,1), f"{run_dir}/{frame_index[0]:06d}")

        p_positions.copy_(rk4_curried(p_positions))


