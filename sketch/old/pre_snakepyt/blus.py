import time
from pathlib import Path
from random import random

import torch

from util import *

type fp_range = tuple[float, float]
type fp_region2 = tuple[fp_range, fp_range]
type fp_coords2 = tuple[float, float]
type hw = tuple[int, int]
type region_mapping = tuple[fp_region2, hw]

@settings
def _s():
    import math
    name = "blus"
    device = "cuda"
    t_real = torch.double
    t_complex = torch.cdouble

    tau = 3.14159265358979323 * 2

    flow = 0.01
    ebb = 0 #1 - (1 / 1000)
    randomize = False
    random_range = tau #/ 50
    rescaling = False
    show_gridlines = False

    particle_count = 1000000

    iterations = 5000

    # 2 ** 9 = 512; 10 => 1024; 11 => 2048
    scale_power = 11
    scale = 2 ** scale_power

    origin = 0, 0
    span = 5, 5

    stretch = 1, 1

    zooms = [
            ]

def blus(a, b):
    theta_a = a.angle()
    return torch.polar(a.abs() + b.abs() * torch.cos(b.angle() - theta_a), theta_a)

@ifmain(__name__, _s)
@timed
def run(settings):
    globals().update(settings.get())
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

    p_positions = (torch.rand([particle_count], device=device, dtype=t_complex) - (0.5 + 0.5j)) * 4
    #p_positions.imag = torch.linspace(0, tau, particle_count)
    #p_positions.real = torch.linspace(0, 1, particle_count)
    #p_positions = torch.polar(p_positions.real, p_positions.imag)

    p_colors = torch.ones([particle_count,3], device=device, dtype=t_real)
    color_rotation = torch.linspace(0, tau / 4, particle_count)

    p_colors[:,0] = p_positions.real / 4 + 0.5
    p_colors[:,2] = p_positions.imag / 4 + 0.5

    #p_colors[:,0] = torch.cos(color_rotation)
    p_colors[:,1] *= 0
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
    def next_positions(p):
        global direction
        #return blus(p, ones) - ones
        if randomize:
            direction = flow * torch.polar(ones.real, (random() * random_range - random_range / 2) * ones.real)
        result = blus(p, direction) - direction * ebb
        res_abs = result.abs()
        if rescaling:
            result = torch.polar(res_abs / res_abs.max(), result.angle())
        return result

    gridlines[(h-1)//2,:] = 1
    gridlines[:,(w-1)//2] = 1

    for line in range(1,6):
        pos = line - y_min
        pos *= (h-1) / (y_max - y_min)
        try:
            gridlines[math.floor(pos), :] = 0.8
        except:
            pass
    for line in range(1,6):
        pos = -line - y_min
        pos *= (h-1) / (y_max - y_min)
        try:
            gridlines[math.floor(pos), :] = 0.8
        except:
            pass
    for line in range(1,6):
        pos = line - x_min
        pos *= (w-1) / (x_max - x_min)
        try:
            gridlines[:,math.floor(pos)] = 0.8
        except:
            pass
    for line in range(1,6):
        pos = -line - x_min
        pos *= (w-1) / (x_max - x_min)
        try:
            gridlines[:,math.floor(pos)] = 0.8
        except:
            pass
    for line in range(1,10):
        pos = -(line / 10) - y_min
        pos *= (h-1) / (y_max - y_min)
        try:
            gridlines[math.floor(pos), :] = 0.3
        except:
            pass
    for line in range(1,10):
        pos = (line / 10) - y_min
        pos *= (h-1) / (y_max - y_min)
        try:
            gridlines[math.floor(pos), :] = 0.3
        except:
            pass

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

            temp /= temp.max()

            save(1 - temp.sqrt().sqrt(), f"{run_dir}/aggregate/{iteration:06d}")
            #scratch /= scratch.max()
            #scratch = scratch.sqrt().sqrt()
            if show_gridlines:
                scratch[:,:,1] += gridlines
                scratch[:,:,2] += gridlines
            save(scratch.permute(2,0,1), f"{run_dir}/frame/{iteration:06d}")

        p_positions = next_positions(p_positions)

    #for d in range(3):
    #    canvas[d] -= canvas[d].mean()
    #    canvas[d] /= 8 * canvas[d].std()
    #    canvas[d] -= canvas[d].min()

    canvas /= canvas.max()
    save(1 - canvas, f"{run_dir}/final")

    with open(f"out/{run_dir}/settings.py", "w") as f:
        f.write(settings.src)
    torch.set_default_device(device)

