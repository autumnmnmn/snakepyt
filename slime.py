import time
import inspect
from random import randint
from pathlib import Path

import torch
from torchvision.transforms import GaussianBlur

from util import *

@settings
def _s():
    from math import tau

    name = "slime"

    scale = 2 ** 11
    w = scale
    h = scale

    max_iterations = 1000
    save_mod = 100
    also_save = [10, 50, 150]

    particle_count = 10000000 // 4
    decay_rate = 0.1

    view_angle = tau / 5
    view_distance = 1.414 * 140

    direction_count = 12
    turn_amount = tau / 6#direction_count
    move_distance = 1.414 * 2

    blur_size = 1
    blur_sigma = 1.5

    dtype = torch.double
    ctype = torch.cdouble
    device = "cuda"

def offset_coord(position, angle, distance):
    res = torch.clone(position)
    res[:,0] += (torch.sin(angle) * distance)
    res[:,1] += (torch.cos(angle) * distance)
    return res

def clamp_coords(t, h, w):
    t[:,0] = (t[:,0] + (h-1)) % (h-1)
    t[:,1] = (t[:,1] + (w-1)) % (w-1)

def idxput(tensor, indices, value):
    tensor.index_put_((indices[:,0],indices[:,1]), value)

@ifmain(__name__, _s)
@timed
def _main(settings):
    globals().update(settings.get())
    run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
    Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)
    with open(f"out/{run_dir}/settings.py", "w") as f:
        f.write(settings.src)
    torch.set_default_device(device)

    blur = GaussianBlur(blur_size, blur_sigma)

    # p_ denotes particle data
    p_positions = torch.rand([particle_count,2])
    p_positions[:,0] *= h
    p_positions[:,1] *= w

    p_directions = ((torch.rand(particle_count)*direction_count).floor() / direction_count) * 2 * tau

    world = torch.zeros([3,h,w], dtype=dtype)
    scratch = torch.zeros([3,h,w], dtype=dtype)
    t0 = torch.tensor([0], dtype=dtype)
    t1 = torch.tensor([1], dtype=dtype)

    for iteration in range(max_iterations):

        # sense
        angles = (-view_angle, 0, view_angle)
        angles = (p_directions + a for a in angles)
        sensor_coords = (offset_coord(p_positions, a, view_distance) for a in angles)
        sc = [sc for sc in sensor_coords]
        for c in sc:
            clamp_coords(c, h, w)

        sci = [c.long() for c in sc]

        senses = [world[0].take(c[:,0] * w + c[:,1]) for c in sci]
        sense_neg = senses[0] > senses[1]
        sense_pos = senses[2] > senses[1]
        #sense_mid = ~sense_neg * ~sense_pos # forward highest
        sense_out = sense_neg * sense_pos # forward lowest
        sense_neg = sense_neg * ~sense_out # negative lowest
        sense_pos = sense_pos * ~sense_out # negative highest

        # rotate
            #p_directions += torch.rand(particle_count) * sense_out * turn_amount
        mask = torch.rand(particle_count) > 0.5
        p_directions += mask * sense_out * turn_amount
        p_directions -= ~mask * sense_out * turn_amount
        p_directions += sense_pos * turn_amount
        p_directions -= sense_neg * turn_amount

        # move
        p_positions = offset_coord(p_positions, p_directions, move_distance)
        clamp_coords(p_positions, h, w)

        # deposit
        idxput(world[0], p_positions.long(), t1)

        # diffuse
        world = blur(world)

        # render
        if iteration % save_mod == 0 and iteration != 0:
            msave(world[0], f"{run_dir}/{iteration}")

        if iteration in also_save:
            msave(world[0], f"{run_dir}/{iteration}")

        # decay
        if iteration < max_iterations - 1:
            world *= decay_rate

    msave(world[0], f"{run_dir}/final")
