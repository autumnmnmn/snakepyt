import time
from random import randint
from pathlib import Path
from math import tau

import torch
from torchvision.transforms import GaussianBlur

from lib.util import *
from lib.io import VideoWriter

def init():
    scale = 2 ** 11
    w = scale
    h = scale

    max_iterations = 1000
    save_mod = 100
    also_save = []

    particle_count = 10**7
    decay_rate = 0.95

    view_angle = tau / 8
    view_distance = 1.414 * 2

    direction_count = 3
    turn_amount = tau / 6#direction_count
    move_distance = 1.414 * 1

    blur_size = 3
    blur_sigma = 1.5

    dtype = torch.double
    ctype = torch.cdouble
    device = "cuda"
    torch.set_default_device(device)
    torch.set_default_dtype(dtype)

    video = VideoWriter((h,w), 60,
            f"out/{run_dir}/vid.mp4",
            f"out/{run_dir}/ffmpeg_log")

    schedule(run, None)

def final():
    video.close()

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

def run():

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
        video.mframe(world[0])

        if iteration % save_mod == 0 and iteration != 0:
            msave(world[0], f"{run_dir}/{iteration:06d}")

        if iteration in also_save:
            msave(world[0], f"{run_dir}/{iteration:06d}")

        # decay
        if iteration < max_iterations - 1:
            world *= decay_rate

    msave(world[0], f"{run_dir}/final")
