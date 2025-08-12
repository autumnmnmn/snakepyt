import torch
import time
import math
import itertools
import sys
import subprocess
from random import random

from PIL import Image

from lib.util import *
from lib.spaces import map_space, cgrid, center_span, apply_zooms
from lib.io import VideoWriter

zoom_plan = [
    ((0.6, 1.0), (0.6, 1.0)),
    ((0.7, 0.8), (0.6, 0.7)),
    ((0.7, 0.8), (0.8, 0.9)),
    ((0.7, 0.8), (0.2, 0.3)),
    ((0.5, 0.6), (0.4, 0.5)),
    ((0.3, 0.4), (0.6, 0.7)),
    ((0.0, 0.1), (0.0, 0.1)),
    ((0.4, 0.5), (0.6, 0.7)),
    ((0.2, 0.3), (0.7, 0.8)),
    ((0.8, 0.9), (0.7, 0.8)),
    ((0.1, 0.2), (0.4, 0.5)),
    ((0.6, 0.7), (0.7, 0.8)),
    ((0.0, 0.1), (0.3, 0.4)),
    #((0.7, 0.8), (0.4, 0.5)),
    #((0.0, 0.1), (0.6, 0.7)),
    #((0.6, 0.7), (0.3, 0.4)),
    #((0.4, 0.5), (0.7, 0.8)),
    #((0.6, 0.7), (0.3, 0.4)),
    #((0.2, 0.3), (0.1, 0.2)),
    #((0.7, 0.8), (0.1, 0.2)),
    #((0.1, 0.2), (0.6, 0.7)),
    #((0.7, 0.8), (0.3, 0.4)),
    #((0.9, 1.0), (0.8, 0.9)),
]

planning_mode = False
smoothed_path = True

def init():
    frame_index = [0]

    _origin = 0, 0
    _span = 9, 9
    mapping = map_space(_origin, _span, [], (), scale)
    (_, dims) = mapping


    #video = VideoWriter(dims, 24,
    #        f"out/{run_dir}/vid.mp4",
    #        f"out/{run_dir}/ffmpeg_log")

    if planning_mode:
        zooms = zoom_plan
        schedule(run, None)
    else:
        if smoothed_path:
            frames = 120#720
            schedule(smooth_zoom_interp, range(frames))
        else:
            schedule(zoom_level, range(len(zoom_plan)-1))

def final():
    pass
    #video.close()

def zoom_level():
    zoom_plan_partial = zoom_plan[:index+2]

    frames = 10

    schedule(zoom_interp, range(frames))



def zoom_interp(index):
    ((xl, xr), (yl, yr)) = zoom_plan_partial[-1]
    #t = index / frames
    t = math.log(index + 1, frames+1)

    zooms = list(zoom_plan_partial)
    zooms[-1] = ((lerp(0, xl, t), lerp(1, xr, t)), (lerp(0, yl, t), lerp(1, yr, t)))


    schedule(run, None)

def eerp(a,b,t):
    return math.pow(b/a, t)*a

def lerp(a,b,t):
    return (1-t) * a + t * b

def smooth_zoom_interp(index):
    final_center, final_span = center_span(*apply_zooms(_origin, _span, zoom_plan))
    zooms = []

    t = (index / frames)#math.log(index + 1, frames+1)

    span = (eerp(_span[0], final_span[0], t), eerp(_span[1], final_span[1], t))

    t = (span[0] - _span[0]) / (final_span[0] - _span[0])

    origin = (lerp(_origin[0], final_center[0], t), lerp(_origin[1], final_center[1], t))

    schedule(run, None)

# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale = 2 ** 11

#origin = 3.80576, 3.8096
#span = 0.01309, 0.00892

#origin, span = center_span((3.795, 3.824), (3.80287, 3.82417))
#origin, span = center_span((3.8097, 3.8175), (3.8138, 3.8181))


stretch = 1, 1


dev = "cuda"
t_fp = torch.double
t_cfp = torch.cdouble

torch.set_default_device(dev)
torch.set_default_dtype(t_fp)

seq = "BBABABA"
c = 3.5
x_init = 0.499
alpha = 0.907

iterations = 1000

discontinuity = True

flip_mode = "individual"
flip_chance = 0.00#1

# funcs

def logistic_map(r, x):
    x_inf_mask = torch.isinf(x)
    _x = r * x * (1 - x)
    return torch.nan_to_num(_x) * ~x_inf_mask - x * x_inf_mask

def lyapunov_term(r, x):
    x_inf_mask = torch.isinf(x)
    term = torch.log(torch.abs(r * (1 - 2 * x)))
    return torch.nan_to_num(term) * ~x_inf_mask - x * x_inf_mask

def opposite(element):
    if element == "A":
        return "B"
    else:
        return "A"

def repeat(seq, flip_chance, flip_mode):
    i = 0
    l = len(seq)
    flipped = False
    while True:
        yield seq[i%l] if not flipped else opposite(seq[i%l])
        i += 1
        if i % l == 0 or flip_mode == "individual":
            flipped = random() < flip_chance

def c_avg(prev, val, n):
    """cumulative average
    prev: previous result (should be zero for n=1)
    val: next value
    n: how many values given so far, including this value"""
    prev_inf_mask = torch.isinf(prev)
    _next = prev + (val - prev) / n
    return torch.nan_to_num(_next) * ~prev_inf_mask + prev * prev_inf_mask



def run():
    mapping = map_space(origin, span, zooms, stretch, scale)
    (_, (h,w)) = mapping

    x = torch.ones([h, w]) * x_init

    ab = cgrid(mapping)

    tenths = torch.zeros([h, w])
    for i in range(10):
        frac = i / 10
        tenths[math.floor(frac*h), :] = 1
        tenths[:, math.floor(frac*w)] = 1

    lyapunov_avg = torch.zeros([h, w])

    gen = itertools.islice(repeat(seq, 0, flip_mode), iterations)

    flip = False
    for idx, seq_elem in enumerate(gen):
        if seq_elem == "C":
            r = c
        else:
            r_normal = ab.real if seq_elem == "A" else ab.imag
            if flip_chance > 0:
                r_flipped = ab.imag if seq_elem == "A" else ab.real
                flip_mask = torch.rand([h,w]) < flip_chance
                r = r_normal * ~flip_mask + r_flipped * flip_mask
            else:
                r = r_normal

        if idx > 600:
            lyapunov_avg = c_avg(lyapunov_avg, lyapunov_term(r, x), idx)

        if idx < iterations - 1:
            if discontinuity:
                mask = x <= 0.5
            x = logistic_map(r, x)
            if discontinuity:
                x += mask * (alpha - 1) * (r - 2) / 4

        #msave(torch.tanh(lyapunov_avg / 4) / 2 + 0.5, f"avg_{idx}")

    result = torch.tanh(lyapunov_avg)
    result -= result.mean()
    result /= 5 * result.std()
    result += 0.5

    if planning_mode:
        result = torch.stack([result + tenths, result, result])
        save(result, f"{run_dir}/{frame_index[0]:06d}")
    else:
        msave(result, f"{run_dir}/{frame_index[0]:06d}")
        #video.mframe(result)
    frame_index[0] += 1
    #msave(1 - result**2, final_file + "sq")
    #msave(1 - torch.sqrt(result), final_file + "sqrt")
    #msave(result ** 2, final_file + "sq_p")
    #msave(torch.sqrt(result), final_file + "sqrt_p")


