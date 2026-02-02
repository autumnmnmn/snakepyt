import time
from pathlib import Path
from random import random

import torch

from lib.util import *

type fp_range = tuple[float, float]
type fp_region2 = tuple[fp_range, fp_range]
type fp_coords2 = tuple[float, float]
type hw = tuple[int, int]
type region_mapping = tuple[fp_region2, hw]

def main():
    import math
    name = "ps_particle"
    device = "cuda"
    t_real = torch.double
    t_complex = torch.cdouble

    tau = 3.14159265358979323 * 2

    flow = 8
    ebb = 1 - (1 / 5) + 0.0001
    phi = 0
    randomize = False
    random_range = tau #/ 50
    rescaling = False
    show_gridlines = True

    particle_count = 10**6

    iterations = 200#0001

    # 2 ** 9 = 512; 10 => 1024; 11 => 2048
    scale_power = 12
    scale = 2 ** scale_power

    origin = 0, -(flow*ebb)/2
    span = 10, 10

    stretch = 1, 1

    zooms = [
            #((0.5,0.8),(0.1,0.5))
            ]

    save_every = 5000
    agg_every = 1#000
    yell_every = 1000
    grid_on_agg = False#True

    quantile_range = torch.tensor([0.05, 0.95], dtype=t_real, device=device)

    schedule(run, None)

def blus(a, b, phi):
    theta_a = a.angle()
    return torch.polar(a.abs() + b.abs() * torch.cos(b.angle() - theta_a - phi), theta_a)

def run():
    run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
    Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)
    Path("out/" + run_dir + "/aggregate").mkdir(parents=True, exist_ok=True)
    Path("out/" + run_dir + "/frame").mkdir(parents=True, exist_ok=True)

    global span

    x_min = origin[0] - (span[0] / 2)
    y_min = origin[1] - (span[1] / 2)

    for ((xa, xb), (ya, yb)) in zooms:
        x_min += span[0] * xa
        y_min += span[1] * ya
        span = span[0] * (xb - xa), span[1] * (yb - ya)

    x_max = x_min + span[0]
    y_max = y_min + span[1]

    aspect = span[0] * stretch[0] / (span[1] * stretch[1])

    if aspect < 1:
        h = scale
        w = int(scale * aspect)
    else:
        w = scale
        h = int(scale / aspect)

    x_range = (x_min, x_max)
    y_range = (y_min, y_max)
    region = (x_range, y_range)
    mapping = (region, (h,w))

    p_positions = (torch.rand([particle_count], device=device, dtype=t_complex))
    #p_positions.imag = torch.linspace(0, tau, particle_count)
    #p_positions.real = torch.linspace(0, 1, particle_count)
    #p_positions = torch.polar(p_positions.real, p_positions.imag)

    p_colors = torch.ones([particle_count,3], device=device, dtype=t_real)
    color_rotation = torch.linspace(0, tau / 4, particle_count)

    p_colors[:,0] = torch.frac((p_positions.real) * 1 / (span[0]))
    p_colors[:,2] = torch.frac((p_positions.imag) * 1 / (span[1]))

    p_positions.real *= 0.025 * (y_max - y_min)
    p_positions.real += y_min + (0.4875) * (y_max - y_min)
    p_positions.imag *= 0.025 * (x_max - x_min) * 4
    p_positions.imag += x_min + 0.501 * (x_max - x_min)

    #p_colors[:,0] = torch.cos(color_rotation)
    p_colors[:,1] = 1.0 - (p_colors[:,0] + p_colors[:,2])#0.1
    #p_colors[:,2] *= 0
    #p_colors[:,2] = torch.sin(color_rotation)

    canvas = torch.zeros([3, h, w], device=device, dtype=t_real)
    scratch = torch.zeros([h, w, 3], device=device, dtype=t_real)
    gridlines = torch.zeros([h,w], device=device)

    def project(p):
        return torch.view_as_real(p).permute(1,0)

    ones = torch.ones_like(p_positions)
    global direction
    direction = flow * torch.polar(ones.real, 1 * tau * ones.real)
    def next_positions(p, i):
        global direction
        #return blus(p, ones) - ones
        if randomize:
            direction = flow * torch.polar(
                ones.real,
                (random() * random_range - random_range / 2) * ones.real
            )
        result = blus(p, direction, phi) - direction * ebb
        res_abs = result.abs()
        if rescaling:
            result = torch.polar(res_abs / res_abs.max(), result.angle())
        return result

    for i in range(10):
        frac = i / 10
        gridlines[math.floor(frac*h), :] = 1
        gridlines[:, math.floor(frac*w)] = 1

    def insert_at_coords(coords, values, target, mapping: region_mapping):
        (region, hw) = mapping
        (xrange, yrange) = region
        (h,w) = hw
        (x_min, x_max) = xrange
        (y_min, y_max) = yrange

        mask = torch.ones([particle_count], device=device)
        mask *= (coords[1] >= x_min) * (coords[1] <= x_max)
        mask *= (coords[0] >= y_min) * (coords[0] <= y_max)
        in_range = mask.nonzero().squeeze()

        # TODO: combine coord & value tensors so there's only one index_select necessary
        coords_filtered = torch.index_select(coords.permute(1,0), 0, in_range)
        values_filtered = torch.index_select(values, 0, in_range)

        coords_filtered[:,1] -= x_min
        coords_filtered[:,1] *= (w-1) / (x_max - x_min)
        coords_filtered[:,0] -= y_min
        coords_filtered[:,0] *= (h-1) / (y_max - y_min)
        indices = coords_filtered.long()

        target.index_put_((indices[:,0],indices[:,1]), values_filtered, accumulate=True)


    for iteration in range(iterations):
        p_projected = project(p_positions).clone()

        if iteration % 1 == 0:

            scratch *= 0
            insert_at_coords(p_projected, p_colors, scratch, mapping)
            canvas += scratch.permute(2,0,1)


            temp = canvas.clone()
            #for d in range(3):
            #    temp[d] -= temp[d].mean()
            #    temp[d] /= 8 * temp[d].std()
            #    temp[d] -= temp[d].min()

            temp -= temp.min()
            temp = torch.log(temp)
            temp /= temp.max()

            if iteration % agg_every == 0:
                p_low, p_high = torch.quantile(temp[:,(2*h//5):(3*h//5),:], quantile_range)
                #    temp[0] += gridlines
                #    temp[1] += gridlines
                #    temp[2] += gridlines

                if grid_on_agg:
                    save(
                        (1 - temp).clamp_(0.0, 1.0) - gridlines,
                        f"{run_dir}/aggregate/_{iteration:06d}"
                    )
                else:
                    save((1 - temp).clamp_(0.0, 1.0), f"{run_dir}/aggregate/_{iteration:06d}")
                temp = (temp - p_low) / (1e-7 + p_high - p_low)
                #save(1 - temp, f"{run_dir}/aggregate/{iteration:06d}")
            #scratch /= scratch.max()
            #scratch = scratch.sqrt().sqrt()
            if show_gridlines:
                scratch[:,:,1] += gridlines
                scratch[:,:,2] += gridlines
            if iteration % save_every == 0:
                save(1 - scratch.permute(2,0,1), f"{run_dir}/frame/{iteration:06d}")
            if iteration % yell_every == 0:
                print(f"{iteration} iterations")

        p_positions = next_positions(p_positions, iteration)

    #for d in range(3):
    #    canvas[d] -= canvas[d].mean()
    #    canvas[d] /= 8 * canvas[d].std()
    #    canvas[d] -= canvas[d].min()


    torch.set_default_device(device)

