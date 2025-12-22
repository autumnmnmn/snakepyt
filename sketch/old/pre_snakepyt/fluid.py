import time
from pathlib import Path

import torch
from torch.nn.functional import conv2d as convolve

from util import *

@settings
def _s():
    scale = 2**11
    w = scale
    h = scale

    max_iterations = 100000
    save_every = 100

    v_diffusion_rate = 2000
    m_diffusion_rate = 0.5
    m_timescale = 0.01
    timescale = 0.001

    name = "fluid"

    device = "cuda"


diffuse_kernel = torch.tensor([[[[0,1,0],[1,0,1],[0,1,0]]]], dtype=torch.float, device="cuda")
project_kernel_x = torch.tensor([[[[0,0,0],[-1,0,1],[0,0,0]]]], dtype=torch.float, device="cuda")
project_kernel_y = torch.tensor([[[[0,-1,0],[0,0,0],[0,1,0]]]], dtype=torch.float, device="cuda")

def continuous_boundary(field):
    field[0] = field[1]
    field[-1] = field[-2]
    field[:,0] = field[:,1]
    field[:,-1] = field[:,-2]
    field[(0,0,-1,-1),(0,-1,0,-1)] = 0.5 * (field[(0,0,-2,-2),(1,-2,0,-1)] + field[(1,1,-1,-1),(0,-1,1,-2)])

def opposed_v_boundary(field):
    field[0] = field[1]
    field[-1] = field[-2]
    field[:,0] = -field[:,1]
    field[:,-1] = -field[:,-2]
    field[(0,0,-1,-1),(0,-1,0,-1)] = 0.5 * (field[(0,0,-2,-2),(1,-2,0,-1)] + field[(1,1,-1,-1),(0,-1,1,-2)])

def opposed_h_boundary(field):
    field[0] = -field[1]
    field[-1] = -field[-2]
    field[:,0] = field[:,1]
    field[:,-1] = field[:,-2]
    field[(0,0,-1,-1),(0,-1,0,-1)] = 0.5 * (field[(0,0,-2,-2),(1,-2,0,-1)] + field[(1,1,-1,-1),(0,-1,1,-2)])


def diffuse(field, rate, set_boundary, dt, h, w):
    a = dt * rate
    result = torch.clone(field)
    if field.shape != (h, w):
        print("bad field shape in diffuse")
    for n in range(20):
        convolution = a * convolve(result.unsqueeze(0), diffuse_kernel, bias=None, padding=[0], stride=[1])[0]
        result[1:h-1,1:w-1] = field[1:h-1,1:w-1] + convolution
        result /= 1 + 4 * a
        set_boundary(result)
        #result = result * ~border_mask[0] + field * border_mask[0]
    return result

def advect(field, velocities, dt, h, w):
    dth, dtw = dt, dt
    inds_x = torch.arange(1,w-1).repeat(h-2,1).float()
    inds_y = torch.arange(1,h-1).repeat(w-2,1).t().float()
    inds_x += dtw * velocities[1,1:h-1,1:w-1]
    inds_y += dth * velocities[0,1:h-1,1:w-1]
    inds_x = inds_x.clamp(1.5, w - 2.5)
    inds_y = inds_y.clamp(1.5, h - 2.5)
    inds_x_i = inds_x.int()
    inds_y_i = inds_y.int()
    inds_x -= inds_x_i
    inds_y -= inds_y_i
    inds_x_inv = 1 - inds_x
    inds_y_inv = 1 - inds_y
    inds_x_i_next = inds_x_i + 1
    inds_y_i_next = inds_y_i + 1
    inds_x_all = torch.stack([inds_x_i, inds_x_i_next, inds_x_i, inds_x_i_next])
    inds_y_all = torch.stack([inds_y_i, inds_y_i, inds_y_i_next, inds_y_i_next])
    if field.shape[0] == 1:
        values = torch.cat([field[:,1:h-1,1:w-1] * inds_x_inv * inds_y_inv,
                            field[:,1:h-1,1:w-1] * inds_x * inds_y_inv,
                            field[:,1:h-1,1:w-1] * inds_x_inv * inds_y,
                            field[:,1:h-1,1:w-1] * inds_x * inds_y])
        res = torch.zeros_like(field[0])
        res.index_put_((inds_y_all, inds_x_all), values, accumulate=True)
        continuous_boundary(res)
        return res.unsqueeze(0)
    else:
        values = torch.stack([field[:,1:h-1,1:w-1] * inds_x_inv * inds_y_inv,
                              field[:,1:h-1,1:w-1] * inds_x * inds_y_inv,
                              field[:,1:h-1,1:w-1] * inds_x_inv * inds_y,
                              field[:,1:h-1,1:w-1] * inds_x * inds_y])
        res = torch.zeros_like(field)
        res[0].index_put_((inds_y_all, inds_x_all), values[:,0,:,:], accumulate=True)
        res[1].index_put_((inds_y_all, inds_x_all), values[:,1,:,:], accumulate=True)
        opposed_h_boundary(res[1])
        opposed_v_boundary(res[0])
        return res

def project(field, h, w):
    hx = -1# / w
    hy = -1# / h
    divergence = convolve(field[1].unsqueeze(0), project_kernel_x, bias=None, stride=[1], padding=[0])[0] * hx
    divergence += convolve(field[0].unsqueeze(0), project_kernel_y, bias=None, stride=[1], padding=[0])[0] * hy
    divergence *= 0.5
    continuous_boundary(divergence)
    p = torch.zeros_like(field[0])
    for i in range(40):
        p[1:h-1,1:w-1] = (divergence + convolve(p.unsqueeze(0), diffuse_kernel, bias=None, stride=[1], padding=[0])[0]) / 4
        continuous_boundary(p)
    field[1,1:h-1,1:w-1] += 0.5 * convolve(p.unsqueeze(0), project_kernel_x, bias=None, stride=[1], padding=[0])[0] / hx
    field[0,1:h-1,1:w-1] += 0.5 * convolve(p.unsqueeze(0), project_kernel_y, bias=None, stride=[1], padding=[0])[0] / hy
    opposed_h_boundary(field[1])
    opposed_v_boundary(field[0])

@ifmain(__name__, _s)
@timed
def _main(settings):
    globals().update(settings.get())
    run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
    Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)
    with open(f"out/{run_dir}/settings.py", "w") as f:
        f.write(settings.src)
    torch.set_default_device(device)


    #velocities = torch.zeros([2, h, w])
    upsample = torch.nn.Upsample(size=[h, w], mode='bilinear')
    velocities = torch.randn([2, h//32, w//32]) * 1 #* 100
    densities = torch.ones([1, h, w]) * 0.1

    cg = cgrid(h, w, 0 + 0j, 4 + 4j, dtype=torch.float, ctype=torch.cfloat)

    velocities = upsample(velocities.unsqueeze(0))[0]#cg.real - cg.imag * torch.sin(cg.real)
    #velocities[1] = 0#-cg.imag - cg.real * torch.cos(cg.imag)

    #for i in range(3):
    #    for j in range(3):
    #        w7 = w // 7
    #        h7 = h // 7
    #        densities[0][(2*j+1)*h7:(2*j+2)*h7][(2*i+1)*w7:(2*i+2)*w7] = 1
    #        print((2*j+1)*h7)
    #        print((2*j+2)*h7)


    #w7 = w//7
    #h7 = h//7
    #for i in range(w7):
    #    for j in range(h7):
    #        for a in range(3):
    #            for b in range(3):
    #                densities[0][j + h7 * (2 * a + 1)][w7 * (2 * b + 1) + i] = 1.0

    initial = torch.cat((velocities * 0.5 + 0.5, densities), dim=0)
    save(initial, f"{run_dir}/initial")
    del initial

    border_mask = torch.ones([2,h,w], dtype=torch.int)
    border_mask[:,1:h-1,1:w-1] = 0;

    for iteration in range(max_iterations):
        velocities[0,3 * h//4 - 10:(3*h//4),w//2-10:w//2+10] = -10 * 40
        velocities[1,3 * h//4:(3*h//4)+10,w//2-10:w//2+10] = -9 * 40
        velocities[0,h//4:(h//4)+10,w//2-3:w//2+3] = 10 * 40
        velocities[1,h//4:(h//4)+10,w//2-3:w//2+3] = 20 * 40
        velocities[0] += 0.01
        #densities[0,3*h//4-10:(3*h//4),w//2-9:w//2+9] += 0.1
        #densities[0,h//4:(h//4)+10,w//2+30:w//2+55] += 0.1
        densities += 0.001
        velocities[0] = diffuse(velocities[0], v_diffusion_rate, opposed_h_boundary, timescale, h, w)
        velocities[1] = diffuse(velocities[1], v_diffusion_rate, opposed_v_boundary, timescale, h, w)
        project(velocities, h, w)
        velocities = advect(velocities, velocities, timescale, h, w)
        project(velocities, h, w)
        densities = diffuse(densities[0], m_diffusion_rate, continuous_boundary, m_timescale, h, w).unsqueeze(0)
        densities = advect(densities, velocities, m_timescale, h, w)
        densities *= 0.99
        if iteration % save_every == 0:
            #res = torch.cat((velocities * 0.5 + 0.5, densities), dim=0)
            #save(res, f"{run_dir}/{iteration}")
            msave(densities[0], f"{run_dir}/_{iteration}")

    final = torch.cat((velocities * 0.5 + 0.5, densities), dim=0)
    save(final, f"{run_dir}/final")












