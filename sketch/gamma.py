
import math
import torch
from pathlib import Path

from lib.util import *
from lib.spaces import insert_at_coords, map_space, cgrid

name = "gamma"

device = "cuda"
torch.set_default_device(device)

t_real = torch.double
t_complex = torch.cdouble
tau = 2 * math.pi

# renderer config
scale_power = 12
scale = 2 ** scale_power
origin = -0.5, 0.5
span = 1, 1
stretch = 1, 1
zooms = [
        ((0.45, 0.55), (0.3,0.4)),
        ((0.25, 0.5), (0.25,0.5))
        ]

# particle distribution: sample domain points
particle_count = 20000000

#p_positions = (torch.rand([particle_count], dtype=t_complex) - (0.5 + 0.5j)) * 40

# initialize colors (updated every frame from Gamma)
#p_colors = torch.zeros([particle_count, 3], device=device, dtype=t_real)

mapping = map_space(origin, span, zooms, stretch, scale)

(_, (h,w)) = mapping
grid = cgrid(mapping)

scratch = torch.zeros([h, w, 3], device=device, dtype=t_real)
p_positions = torch.zeros([h*w,2], device=device, dtype=t_real)
p_positions[:,0] = grid.real.reshape((h*w))
p_positions[:,1] = grid.imag.reshape((h*w))



def gamma_approx(z):
    # avoid poles in a naive way
    poles = (z.real <= 0) & torch.isclose(z.real.round(), z.real)
    z = z.clone()
    z[poles] = complex("nan")

    # reflection for left half-plane
    reflect = z.real < 0.5
    zr = z[reflect]
    if zr.numel() > 0:
        g1mz = gamma_approx(1 - zr)
        z[reflect] = math.pi / (torch.sin(math.pi * zr) * g1mz)

    # Stirling-like formula on right half-plane
    zpos = z[~reflect]
    if zpos.numel() > 0:
        t = zpos - 0.5
        core = math.sqrt(2 * math.pi) * torch.exp(t * torch.log(zpos) - zpos)
        z[~reflect] = core
    return z


def gamma_to_rgb(gz):
    arg = torch.angle(gz)
    hue = (arg + math.pi) / (2 * math.pi)
    mag = torch.abs(gz)
    logmag = torch.log(mag + 1e-12)

    # normalize brightness heuristically
    val = (logmag + 5) / 10
    val = val.clamp(0.0, 1.0)

    # convert HSV to RGB (same logic as your framework)
    h6 = hue * 6
    i = torch.floor(h6).long() % 6
    f = h6 - torch.floor(h6)
    p = val * 0
    q = val * (1 - f)
    t = val * f

    r = torch.zeros_like(val)
    g = torch.zeros_like(val)
    b = torch.zeros_like(val)

    m = i == 0; r[m]=val[m]; g[m]=t[m]; b[m]=p[m]
    m = i == 1; r[m]=q[m]; g[m]=val[m]; b[m]=p[m]
    m = i == 2; r[m]=p[m]; g[m]=val[m]; b[m]=t[m]
    m = i == 3; r[m]=p[m]; g[m]=q[m]; b[m]=val[m]
    m = i == 4; r[m]=t[m]; g[m]=p[m]; b[m]=val[m]
    m = i == 5; r[m]=val[m]; g[m]=p[m]; b[m]=q[m]

    return torch.stack([r,g,b], dim=-1)

frame_index = [0]

def main():
    schedule(main_render, None)

def main_render():
    scratch = torch.zeros([h, w, 3], device=device, dtype=t_real)
    naniter = torch.zeros([h, w], device=device, dtype=t_real)

    # project function kept from original plume code
    def project(p):
        return torch.view_as_real(p).permute(1,0)

    # single-frame render (or loop for animations)
    frame_index[0] += 1

    # compute Gamma(p)
    gz = grid.clone()#gamma_approx(p_positions)

    for i in range(20):
        gz = gamma_approx(gz)

        naniter += gz.isnan() * 1.0

        # convert to RGB
        #rgb = gamma_to_rgb(gz)

        # project particle coords to pixel grid
        #coords = project(p_positions).clone()
        #insert_at_coords(coords, rgb, scratch, mapping)


        scratch[:,:,0] = gz.real
        scratch[:,:,2] = gz.imag
        scratch[:,:,1] = naniter / naniter.max()

        # normalization/centering like plume_c does
        #scratch[:,:,2] -= scratch[:,:,2].mean()
        #scratch[:,:,2] /= scratch[:,:,2].std() * 6
        #scratch[:,:,2] += 0.5

        save(scratch.permute(2,0,1).sqrt(), f"{run_dir}/{i:06d}")

