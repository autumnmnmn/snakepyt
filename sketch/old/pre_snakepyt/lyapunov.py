import torch
import time
import itertools
from random import random

from PIL import Image
# monochrome, 0 to 1
def mpilify(z):
    z_3d = torch.stack([z, z, z])
    z_norm = z_3d.clamp(0, 1)
    z_np = z_norm.detach().cpu().permute(1, 2, 0).numpy()
    z_bytes = (z_np * 255).round().astype("uint8")
    return Image.fromarray(z_bytes)

def msave(x, f):
    mpilify(x).save(f"out/{f}.png")

# config


# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale = 2 ** 14

origin = 3.80576, 3.8096
span = 0.01309, 0.00892

zooms = [
        ]

dev = "cuda"
t_fp = torch.double
t_cfp = torch.cdouble

seq = "BBABABA"
c = 3.5
x_init = 0.499
alpha = 0.907

iterations = 4000

discontinuity = True

final_file = f"{seq}_sq_e14_dis_rngb"

# funcs

def logistic_map(r, x):
    x_inf_mask = torch.isinf(x)
    _x = r * x * (1 - x)
    return torch.nan_to_num(_x) * ~x_inf_mask - x * x_inf_mask

def lyapunov_term(r, x):
    x_inf_mask = torch.isinf(x)
    term = torch.log(torch.abs(r * (1 - 2 * x)))
    return torch.nan_to_num(term) * ~x_inf_mask - x * x_inf_mask

def repeat(seq):
    i = 0
    l = len(seq)
    while True:
        yield seq[i%l]
        i += 1

def c_avg(prev, val, n):
    """cumulative average
    prev: previous result (should be zero for n=1)
    val: next value
    n: how many values given so far, including this value"""
    prev_inf_mask = torch.isinf(prev)
    _next = prev + (val - prev) / n
    return torch.nan_to_num(_next) * ~prev_inf_mask + prev * prev_inf_mask

# init

x_min = origin[0]
y_min = origin[1]

for ((xa, xb), (ya, yb)) in zooms:
    x_min += span[0] * xa
    y_min += span[1] * ya
    span = span[0] * (xb - xa), span[1] * (yb - ya)

x_max = x_min + span[0]
y_max = y_min + span[1]

aspect = span[0] / span[1]

if aspect < 1:
    h = scale
    w = int(scale * aspect)
else:
    w = scale
    h = int(scale / aspect)


def main():
    x = torch.ones([h, w], device=dev, dtype=t_fp) * x_init
    ab = torch.zeros([h, w], device=dev, dtype=t_cfp)

    lyapunov_avg = torch.zeros([h, w], device=dev, dtype=t_fp)

    yspace = torch.linspace(y_min, y_max, h, dtype=t_fp, device=dev)
    xspace = torch.linspace(x_min, x_max, w, dtype=t_fp, device=dev)
    for _x in range(h):
        ab[_x] += xspace
    for _y in range(w):
        ab[:, _y] += yspace * 1j

    gen = itertools.islice(repeat(seq), iterations)

    flip = False
    for idx, seq_elem in enumerate(gen):
        if random() > 0.99:
            flip = not flip
        if seq_elem == "C":
            r = c
        else:
            if flip:
                if seq_elem == "A":
                    seq_elem = "B"
                else:
                    seq_elem = "A"
            r = ab.real if seq_elem == "A" else ab.imag

        if idx > 600:
            lyapunov_avg = c_avg(lyapunov_avg, lyapunov_term(r, x), idx)

        if idx < iterations - 1:
            if discontinuity:
                mask = x <= 0.5
            x = logistic_map(r, x)
            if discontinuity:
                x += mask * (alpha - 1) * (r - 2) / 4

        #msave(torch.tanh(lyapunov_avg / 4) / 2 + 0.5, f"avg_{idx}")

    result = torch.tanh(lyapunov_avg) / 2 + 0.5
    msave(result, final_file)
    #msave(1 - result**2, final_file + "sq")
    #msave(1 - torch.sqrt(result), final_file + "sqrt")
    #msave(result ** 2, final_file + "sq_p")
    #msave(torch.sqrt(result), final_file + "sqrt_p")


if __name__ == "__main__":
    t0 = time.perf_counter()
    main()
    print(f"done in {time.perf_counter() - t0}s")

