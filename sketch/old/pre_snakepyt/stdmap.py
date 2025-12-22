# "standard map" aka Chirikov-Taylor map

# p_next = p + K * sin(theta)
# theta_next = theta + p_next

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

def pilify(z):
    z_norm = z.clamp(0, 1)
    z_np = z_norm.detach().cpu().permute(1, 2, 0).numpy()
    z_bytes = (z_np * 255).round().astype("uint8")
    return Image.fromarray(z_bytes)


def msave(x, f):
    mpilify(x).save(f"out/{f}.png")

def save(x, f):
    pilify(x).save(f"out/{f}.png")

# config

tau = 3.14159265358979323 * 2

# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale_power = 12
scale = 2 ** scale_power

origin = tau / 2, tau / 2
span = tau, tau

zooms = [
            #((0.333, 0.667), (0.333, 0.667))
        ]

dev = "cuda"
t_fp = torch.double
t_cfp = torch.cdouble

k = 0.971635406

particle_count = 500000

iterations = 1000

randomness = 0

growth = 0.00001

final_file = f"k{k}_i{iterations}_p{particle_count}_s{scale_power}_r{randomness}_b"

# funcs

def offset_mod(x):
    return torch.remainder(x, tau)

def idxput(tensor, indices, values):
    tensor.index_put_((indices[:,0],indices[:,1]), values, accumulate=False)

# init

x_min = origin[0] - (span[0] / 2)
y_min = origin[1] - (span[1] / 2)

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

print(f"x {x_min} -> {x_max}")
print(f"y {y_min} -> {y_max}")

def main():
    world = torch.zeros([3, h, w], device=dev, dtype=t_fp)
    scratch = torch.zeros([h, w, 3], device=dev, dtype=t_fp)
    p_positions = torch.rand([particle_count,2], device=dev, dtype=t_fp) * tau

    p_positions[:,0] = torch.linspace(0, tau, particle_count)
    p_positions[:,1] = torch.linspace(0, tau, particle_count)

    p_colors = torch.rand([particle_count,3], device=dev, dtype=t_fp)

    color_rotation = torch.linspace(0, tau / 4, particle_count)

    p_colors[:,0] = torch.cos(color_rotation)
    p_colors[:,1] *= 0
    p_colors[:,2] = torch.sin(color_rotation)

    for iteration in range(iterations):
        k_r = k + (random() - 0.5) * randomness + growth * iteration
        p_positions[:,0] = p_positions[:,0] - k_r * torch.sin(p_positions[:,1])
        p_positions[:,1] += p_positions[:,0]
        p_positions[:,0] = offset_mod(p_positions[:,0])
        p_positions[:,1] = offset_mod(p_positions[:,1])

        if len(zooms) > 0:
            p_mask = torch.ones([particle_count], device=dev)
            p_mask *= (p_positions[:,0] >= x_min) * (p_positions[:,0] <= x_max)
            p_mask *= (p_positions[:,1] >= y_min) * (p_positions[:,1] <= y_max)

            in_range = p_mask.nonzero().squeeze()

            p_positions_filtered = torch.index_select(p_positions, 0, in_range)
            p_indices = p_positions_filtered
            p_colors_filtered = torch.index_select(p_colors, 0, in_range)
        else:
            p_positions_filtered = p_positions
            p_indices = p_positions.clone()
            p_colors_filtered = p_colors

        p_indices[:,0] -= x_min
        p_indices[:,0] *= (w-1) / (x_max - x_min)
        p_indices[:,1] -= y_min
        p_indices[:,1] *= (h-1) / (y_max - y_min)

        p_indices = p_indices.long()

        scratch *= 0
        idxput(scratch, p_indices, p_colors_filtered)
        world += scratch.permute(2,0,1)

        if iteration % 1000 == 0:
            print(f"iteration {iteration}")

    world[0] -= world[0].mean()
    world[1] -= world[1].mean()
    world[2] -= world[2].mean()

    world[0] /= 8 * world[0].std()
    world[1] /= 8 * world[1].std()
    world[2] /= 8 * world[2].std()

    world += 0.5

    save(world, final_file)

if __name__ == "__main__":
    t0 = time.perf_counter()
    main()
    print(f"done in {time.perf_counter() - t0}s")

