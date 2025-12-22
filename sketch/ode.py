
import time
import math
from pathlib import Path

import torch

from lib.spaces import insert_at_coords, map_space
from lib.ode import rk4_step
from lib.util import *

def main():
    schedule(run, None)

device = "cuda"
torch.set_default_device(device)
t_fp = torch.double
torch.set_default_dtype(t_fp)

dissipation = 0.04 # "b" parameter in the literature

tau = 3.14159265358979323 * 2

particle_count = 10000000
iterations = 10000
save_if = lambda i: True #i > 150 and i % 5 == 0
rotation_rate = tau / 2000

# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale_power = 10

scale = 2 ** scale_power
origin = 0, 0
s = 40
span = s, s
zooms = [
        ]
stretch = 1, 1

mapping = map_space(origin, span, zooms, stretch, scale)
(_, (h,w)) = mapping

dt = 0.05

def proj(u, v):
    dot = (u * v).sum(dim=1)
    scale = (dot / (v.norm(p=2, dim=1) ** 2))
    out = v.clone()
    for dim in range(3):
        out[:,dim] *= scale
    return out

def proj_shift(a, b):
    return a + proj(b, a)

def get_transformation(direction, flow, ebb, rescaling):
    def transformation(p):
        #return blus(p, ones) - ones
        #if randomize:
        #    direction = flow * torch.polar(ones.real, (random() * random_range - random_range / 2) * ones.real)
        if flow == 0:
            result = p - direction * ebb
        else:
            result = proj_shift(p, direction * flow) - direction * ebb
        #res_abs = result.abs()
        if rescaling:
            result /= result.norm(p=2,dim=1).max()
            #result = torch.polar(2 * res_abs / res_abs.max(), result.angle())
        return result
    return transformation

def _deriv(b, c):
    def derivative(p):
        return p * ((b * p).sum(dim=0)) - c * b
    return derivative

def _sprott2014(a):
    def derivative(p):
        d = p.roll(shifts=-1, dims=0)
        d[0] += 2 * (p[0] * p[1]) + (p[0] * p[2]) # y + 2xy + xz
        d[1] = - (p[0] * p[0]) # -x^2
        d[2] += d[1] - (p[1] * p[1]) # x - x^2 - y^2
        d[1] *= 2 # - 2x^2
        d[1] += a + (p[1] * p[2]) # a - 2x^2 + yz
        return d
    return derivative

def _sprottET0():
    def derivative(p):
        d = p.clone()
        d[0] = p[1]
        d[1] = - p[0] + p[1] * p[2]
        d[2] = (p[0] * p[0]) - (4 * p[1] * p[1]) + 1
        return d
    return derivative

def _suspension(c):
    damping = 0.02
    r_eq = 1.0
    scale = 0.05
    def deriv(p):
        x, y, z = p[0], p[1], p[2]

        # Shift x to center the tori at Re = -c/2
        X = x + c/2
        Y = y

        # Polar coordinates
        r = torch.sqrt(X**2 + Y**2) + 1e-12
        theta = torch.atan2(Y, X)

        # Radial displacement
        dr = r + torch.cos(theta)

        # Velocity in 2D
        dx = scale * (dr * (X/r) - X)
        dy = scale * (dr * (Y/r) - Y)

        # Optional weak radial damping
        dx -= scale * damping * (r - r_eq) * (X/r)
        dy -= scale * damping * (r - r_eq) * (Y/r)

        # z-axis suspension (monotonic)
        dz = scale * torch.ones_like(x)

        return torch.stack([dx, dy, dz], dim=0)
    return deriv


def gpt_deriv(b, k=1.0, c=0.1, omega=0.5):
    """
    Returns a function deriv(points) -> [3,N] where points are 3D column vectors.
    b: tensor of shape [3] (will be normalized internally)
    k: scalar gain for tanh nonlinearity
    c: scalar drift magnitude along -b
    omega: scalar rotation strength around b
    """
    b = b / b.norm()  # normalize once

    def deriv(points):
        # <a, b> for each column
        #dots = torch.einsum('ij,i->j', points, b)  # shape [N]
        dots = (points * b[:]).sum(dim=0)  # shape [N]

        # radial scaling term
        radial = torch.tanh(k * dots).unsqueeze(0) * points  # [3,N]

        # drift along -b
        drift = -c * b[:].expand_as(points)  # [3,N]


        # rotation around b: b × a
        rotation = omega * torch.cross(b[:].expand_as(points), points, dim=0)

        return radial + drift + rotation

    return deriv

p_positions = (torch.rand([3, particle_count], device=device, dtype=t_fp) - 0.5) * 2
#p_positions[0] *= 0.05
#p_positions[0] += 0.7
#p_positions[2] = 0
direction = torch.zeros_like(p_positions) / math.sqrt(3)
direction[1] += 1

#derivative = _deriv(direction, 0.5)
#derivative = gpt_deriv(direction, 1.0, 0.1, 0.5)
#derivative = _sprott2014(0.7)
#derivative = _sprottET0()
derivative = _suspension(0.8)

step = lambda p, dp, h: p + dp * h * dt
rk4_curried = lambda p: rk4_step(derivative, step, p)


p_colors = torch.rand([particle_count,3], device=device, dtype=t_fp)

color_rotation = torch.linspace(0, tau / 4, particle_count)

p_colors[:,0] = (p_positions[0,:] / 2) + 0.5
p_colors[:,1] = (p_positions[1,:] / 2) + 0.5
p_colors[:,2] = (p_positions[2,:] / 2) + 0.5

def project(p, colors, i):
    c = math.cos(i * rotation_rate)
    s = math.sin(i * rotation_rate)
    rotation = torch.tensor([
        [1, 0, 0],
        [0, c,-s],
        [0, s, c]])
    rotation2 = torch.tensor([
        [ c, 0, s],
        [ 0, 1, 0],
        [-s, 0, c]])
    #rotation = torch.tensor([
    #    [c, -s, 0],
    #    [s,  c, 0],
    #    [0,  0, 1]])
    alt_colors = colors.clone()
    res = (rotation @ p)
    #color_filter = (p[0] - 0.7).abs() < 0.01
    #alt_colors[:,0] *= color_filter
    #alt_colors[:,1] *= color_filter
    #alt_colors[:,2] *= color_filter
    return (res[1:3], alt_colors)

frame_index = [0]

def run():
    scratch = torch.zeros([h, w, 3], device=device, dtype=t_fp)

    for iteration in range(iterations):
        if save_if(iteration) or iteration == iterations - 1:
            (p_projected, alt_colors) = project(p_positions, p_colors, iteration)
            frame_index[0] += 1
            scratch *= 0
            insert_at_coords(p_projected, alt_colors, scratch, mapping)
            save(scratch.permute(2,0,1), f"{run_dir}/{frame_index[0]:06d}")

        p_positions.copy_(rk4_curried(p_positions))


