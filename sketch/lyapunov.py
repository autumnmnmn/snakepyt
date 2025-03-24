import torch
import time
import itertools
from random import random

from PIL import Image

from lib.util import *
from lib.spaces import map_space, cgrid, center_span

def init():
    schedule(run, None)

# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale = 2 ** 14

#origin = 3.80576, 3.8096
#span = 0.01309, 0.00892

#origin, span = center_span((3.795, 3.824), (3.80287, 3.82417))
origin, span = center_span((3.8097, 3.8175), (3.8138, 3.8181))

zooms = [
        ]
stretch = 1, 1

mapping = map_space(origin, span, zooms, stretch, scale)
(_, (h,w)) = mapping

dev = "cuda"
t_fp = torch.double
t_cfp = torch.cdouble

torch.set_default_device(dev)
torch.set_default_dtype(t_fp)

seq = "BBABABA"
c = 3.5
x_init = 0.499
alpha = 0.907

iterations = 4000

discontinuity = True

flip_mode = "individual"
flip_chance = 0.01

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
    x = torch.ones([h, w]) * x_init

    ab = cgrid(mapping)

    lyapunov_avg = torch.zeros([h, w])

    gen = itertools.islice(repeat(seq, 0, flip_mode), iterations)

    flip = False
    for idx, seq_elem in enumerate(gen):
        if seq_elem == "C":
            r = c
        else:
            r_normal = ab.real if seq_elem == "A" else ab.imag
            r_flipped = ab.imag if seq_elem == "A" else ab.real
            flip_mask = torch.rand([h,w]) < flip_chance
            r = r_normal * ~flip_mask + r_flipped * flip_mask

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
    msave(result, f"{run_dir}/{seq}")
    #msave(1 - result**2, final_file + "sq")
    #msave(1 - torch.sqrt(result), final_file + "sqrt")
    #msave(result ** 2, final_file + "sq_p")
    #msave(torch.sqrt(result), final_file + "sqrt_p")


