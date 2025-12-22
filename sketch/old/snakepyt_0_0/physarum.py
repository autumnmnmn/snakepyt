import time
from random import randint
from pathlib import Path
from math import tau
import math

import torch
from torchvision.transforms import GaussianBlur

from lib.util import *
from lib.io import VideoWriter

def init():
    scale = 2 ** 12
    w = scale
    h = scale

    max_iterations = 2000
    save_mod = 100
    also_save = []

    particle_count = int((w * h) * 3)
    decay_rate = 0.03

    view_angle = tau / 10
    view_distance = 1.414 * 10

    direction_count = 40000
    turn_amount = tau / 10#direction_count
    move_distance = 1.414 * 1

    blur_size = 3
    blur_sigma = 1.5

    r_strength = 0.8
    b_strength = 50
    g_strength = 0.03

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
    #tensor.index_put_((indices[:,0],indices[:,1]), value)
    tensor[:,indices[:,0],indices[:,1]] += value

def run():

    blur = GaussianBlur(blur_size, blur_sigma)

    # p_ denotes particle data
    p_positions = torch.rand([particle_count,2]) - 0.5
    p_positions[:,0] *= h / 10
    p_positions[:,1] *= w / 10
    p_positions[:,0] += h / 10
    p_positions[:,1] += w / 2

    #stimulus_positions_r = torch.tensor([
    #    [h//3,w//3],
    #], dtype=torch.long)

    stimulus_positions_r = torch.rand([1000,2]) - 0.5
    stimulus_positions_r[:,0] *= h #* 0.9
    stimulus_positions_r[:,1] *= w #* 0.55
    #stimulus_positions_r[0:100,1] *= 0.02
    #stimulus_positions_r[0:100,0] *= 1 / 0.9
    stimulus_positions_r[:,0] += h / 2
    stimulus_positions_r[:,1] += w / 2

    #stimulus_positions_b = torch.tensor([
    #    [h//3,2*w//3],
    #    [2*h//3,w//3],
    #], dtype=torch.long)

    stimulus_positions_b = torch.rand([100,2]) - 0.5
    stimulus_positions_b[:,0] *= h * 0.6
    stimulus_positions_b[:,1] *= w #* 0.5
    stimulus_positions_b[:,0] += h / 2
    stimulus_positions_b[:,1] += w / 2

    p_directions = ((torch.rand(particle_count)*direction_count).floor() / direction_count) * tau

    world = torch.zeros([3,h,w], dtype=dtype)
    scratch = torch.zeros([3,h,w], dtype=dtype)
    black = torch.tensor([0, 0, 0], dtype=dtype)[:,None]
    white = torch.tensor([1, 1, 1], dtype=dtype)[:,None]
    red = torch.tensor([1, 0, 0], dtype=dtype)[:, None]
    green = torch.tensor([0, 1, 0], dtype=dtype)[:, None]
    blue = torch.tensor([0, 0, 1], dtype=dtype)[:, None]

    for iteration in range(max_iterations):

        # sense
        angles = (-view_angle, 0, view_angle)
        angles = (p_directions + a for a in angles)
        sensor_coords = (offset_coord(p_positions, a, view_distance) for a in angles)
        sc = [sc for sc in sensor_coords]
        for c in sc:
            clamp_coords(c, h, w)

        sci = [c.long() for c in sc]

        #senses = [world[0].take(c[:,0] * w + c[:,1]) for c in sci]
        senses = [world[:,c[:,0], c[:,1]] for c in sci]

        senses = [30 * s[2] + s[1] - (500 * s[0]) for s in senses]

        sense_neg = senses[0] > senses[1]
        sense_pos = senses[2] > senses[1]
        #sense_mid = ~sense_neg * ~sense_pos # forward highest
        sense_out = sense_neg * sense_pos # forward lowest
        sense_neg = sense_neg * ~sense_out # negative lowest
        sense_pos = sense_pos * ~sense_out # negative highest

        #sense_out = sense_out[1] & ~sense_out[0]
        #sense_pos = sense_pos[1] & ~sense_neg[0]
        #sense_neg = sense_neg[1] & ~sense_pos[0]

        # rotate
            #p_directions += torch.rand(particle_count) * sense_out * turn_amount
        mask = torch.rand(particle_count) > 0.5
        p_directions += mask * sense_out * turn_amount
        p_directions -= ~mask * sense_out * turn_amount
        p_directions += sense_pos * turn_amount
        p_directions -= sense_neg * turn_amount

        p_directions = ((p_directions * (direction_count / tau)).floor() / direction_count) * tau

        # move
        p_positions = offset_coord(p_positions, p_directions, move_distance)
        clamp_coords(p_positions, h, w)

        # deposit
        idxput(world, p_positions.long(), green * g_strength)

        idxput(world, stimulus_positions_r.long(), red * r_strength)
        idxput(world, stimulus_positions_b.long(), blue * b_strength)

        # diffuse
        world = blur(world)
        world[2][None] = blur(world[2][None])

        crowding_mask = world[1] > 0.9
        world[0] += 0.1 * crowding_mask
        loneliness_mask = world[1] < 0.01
        world[0] += 0.005 * loneliness_mask

        world[2] *= (1 - world[1]).clamp(0,1) ** 0.4

        # render
        video.frame(world)

        if iteration % save_mod == 0 and iteration != 0:
            save(world, f"{run_dir}/{iteration:06d}")

        if iteration in also_save:
            save(world, f"{run_dir}/{iteration:06d}")

        # decay
        if iteration < max_iterations - 1:
            world *= (1-decay_rate)

    save(world, f"{run_dir}/final")
