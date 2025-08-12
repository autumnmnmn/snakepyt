import time
from pathlib import Path

import torch

from util import *

@settings
def _s():
    name = "lorenz"
    device = "cuda"
    t_fp = torch.double

    sigma = 10
    rho = 28
    beta = 8/3

    tau = 3.14159265358979323 * 2

    particle_count = 5000
    iterations = 1000

    # 2 ** 9 = 512; 10 => 1024; 11 => 2048
    scale_power = 10
    scale = 2 ** scale_power

    origin = 0, 0
    span = 60, 40

    zooms = [
            ]

    dt = 0.005


def rk4_step(get_derivative, take_step, position_0):
    direction_0 = get_derivative(position_0)
    position_1 = take_step(position_0, direction_0, 0.5)
    direction_1 = get_derivative(position_1)
    position_2 = take_step(position_0, direction_1, 0.5)
    direction_2 = get_derivative(position_2)
    position_3 = take_step(position_0, direction_2, 1)
    direction_3 = get_derivative(position_3)
    final_direction = (direction_0 + 2 * (direction_1 + direction_2) + direction_3) / 6
    return take_step(position_0, final_direction, 1)

def euler_step(get_derivative, take_step, position_0):
    return take_step(position_0, get_derivative(position_0), 1)


def idxput(tensor, indices, values):
    tensor.index_put_((indices[:,0],indices[:,1]), values, accumulate=False)

@ifmain(__name__, _s)
@timed
def _main(settings):
    globals().update(settings.get())
    run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
    Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)

    global span

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


    dx = lambda x,y,z: sigma * (y - x)
    dy = lambda x,y,z: x * (rho - z) - y
    dz = lambda x,y,z: x * y - beta * z

    p_positions = (torch.rand([3, particle_count], device=device, dtype=t_fp) - 0.5) * 40
    p_positions[0] = torch.linspace(-0.1, 0.1, particle_count)
    p_positions[1] = torch.linspace(-0.1, 0.1, particle_count)
    p_positions[2] = torch.linspace(-0.1, 0.1, particle_count)


    p_colors = torch.rand([particle_count,3], device=device, dtype=t_fp)

    color_rotation = torch.linspace(0, tau / 4, particle_count)

    p_colors[:,0] = torch.cos(color_rotation)
    p_colors[:,1] *= 0
    p_colors[:,2] = torch.sin(color_rotation)

    canvas = torch.zeros([3, h, w], device=device, dtype=t_fp)
    scratch = torch.zeros([h, w, 3], device=device, dtype=t_fp)

    step = lambda p, dp, h: p + dp * h * dt

    def derivative(p):
        dp = torch.zeros_like(p)
        dp[0] = dx(*p)
        dp[1] = dy(*p)
        dp[2] = dz(*p)
        return dp

    rk4_curried = lambda p: rk4_step(derivative, step, p)

    def project(p):
        return p[0:2]

    for iteration in range(iterations):
        p_projected = project(p_positions).clone()

        if iteration % 500 == 0:
            p_mask = torch.ones([particle_count], device=device)
            p_mask *= (p_projected[1] >= x_min) * (p_projected[1] <= x_max)
            p_mask *= (p_projected[0] >= y_min) * (p_projected[0] <= y_max)

            in_range = p_mask.nonzero().squeeze()

            p_projected_filtered = torch.index_select(p_projected.permute(1,0), 0, in_range)
            p_indices = p_projected_filtered
            p_colors_filtered = torch.index_select(p_colors, 0, in_range)

            p_indices[:,1] -= x_min
            p_indices[:,1] *= (w-1) / (x_max - x_min)
            p_indices[:,0] -= y_min
            p_indices[:,0] *= (h-1) / (y_max - y_min)

            p_indices = p_indices.long()

            scratch *= 0
            idxput(scratch, p_indices, p_colors_filtered)
            #canvas += scratch.permute(2,0,1)


            #temp = canvas.clone()
            #temp[0] -= temp[0].mean()
            #temp[1] -= temp[1].mean()
            #temp[2] -= temp[2].mean()

            #temp[0] /= 8 * temp[0].std()
            #temp[1] /= 8 * temp[1].std()
            #temp[2] /= 8 * temp[2].std()

            #temp += 0.5
            #save(temp, f"{run_dir}/{iteration}")
            save(scratch.permute(2,0,1), f"{run_dir}/{iteration}_b")

        p_positions = rk4_curried(p_positions)

    #canvas[0] -= canvas[0].mean()
    #canvas[1] -= canvas[1].mean()
    #canvas[2] -= canvas[2].mean()

    #canvas[0] /= 8 * canvas[0].std()
    #canvas[1] /= 8 * canvas[1].std()
    #canvas[2] /= 8 * canvas[2].std()

    #canvas += 0.5

    #save(canvas, f"{run_dir}/final")

    with open(f"out/{run_dir}/settings.py", "w") as f:
        f.write(settings.src)
    torch.set_default_device(device)

