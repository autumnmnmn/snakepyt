import torch
import time

from pathlib import Path

from util import *

@settings
def _s():
    name = "qjulia_11_40"

    # 2**10 = 1024
    scale = 2 ** 8
    w = 2 * scale // 3
    h = scale

    max_steps = 500
    mandel_iters = 40#50
    max_samples = 4

    noise_scale = 1. / (2 * scale)

    zoom = 1
    #frame_center = -0.5, -0.5, 0
    frame_center = 0, 0, -1 * zoom
    step_dir = 0, 0, 1
    #frame_span = 1, 1
    frame_span = 2 * zoom, 3 * zoom
    max_depth = 2 * zoom

    dev = "cuda"
    t_cfp = torch.cfloat
    t_fp = torch.float

    pi = 3.14159265358979323
    a, b, c = pi / 3, pi + 0.2834298, pi / 4

    from math import sin, cos
    sina, sinb, sinc = sin(a), sin(b), sin(c)
    cosa, cosb, cosc = cos(a), cos(b), cos(c)

    rot_x = torch.tensor([
        [1,0,0],
        [0,cosc,-sinc],
        [0,sinc,cosc]], dtype=t_fp, device=dev)
    rot_y = torch.tensor([
        [cosb,0,sinb],
        [0,1,0],
        [-sinb,0,cosb]], dtype=t_fp, device=dev)
    rot_z = torch.tensor([
        [cosa,-sina,0],
        [sina,cosa,0],
        [0,0,1]], dtype=t_fp, device=dev)

    rot = rot_z @ rot_y @ rot_x

    quat_last = 0
    quat_c = [-1, 0.2, 0, 0]

def hit_mandel(pos):
    z = 0 #pos[2] * (0.2 * pos[2] + 0.5j)
    c = torch.view_as_complex(pos[0:2].permute(1,2,0).contiguous())
    for i in range(mandel_iters):
        z = z**2 + pos[2]*z + c
    return torch.abs(z) < 2

def hit_power9_bulb(pos):
    #v = rot @ pos #torch.clone(pos)
    v = (pos.permute(1,2,0) @ rot).permute(2,0,1)
    for i in range(mandel_iters):
        x = v[0]
        y = v[1]
        z = v[2]
        x_term = 1j * torch.sqrt(y**2 + z**2)
        y_term = 1j * torch.sqrt(x**2 + z**2)
        z_term = 1j * torch.sqrt(y**2 + x**2)
        v[0] = (x + x_term)**9 / 2 + (x - x_term)**9 / 2 + pos[0]
        v[1] = (y + y_term)**9 / 2 + (y - y_term)**9 / 2 + pos[1]
        v[2] = (z + z_term)**9 / 2 + (z - z_term)**9 / 2 + pos[2]
    n = torch.norm(v, dim=0)
    return ~(n < 2)

def hit_julia_q(pos):
    v = (pos.permute(1,2,0) @ rot).permute(2,0,1)
    v = torch.cat((v, torch.ones([1,h,w], dtype=t_fp, device=dev) * quat_last))
    for i in range(mandel_iters):
        r, a, b, c = v[0], v[1], v[2], v[3]
        _r = r*r - a*a - b*b - c*c
        _a = 2*r*a
        _b = 2*r*b
        _c = 2*r*c
        v[0] = _r + quat_c[0]
        v[1] = _a + quat_c[1]
        v[2] = _b + quat_c[2]
        v[3] = _c + quat_c[3]
    n = torch.norm(v, dim=0)
    return n < 4

def hit_ball(pos):
    return torch.norm(pos, dim=0) > 0.9

@timed
@ifmain(__name__, _s)
def _m(settings):
    globals().update(settings.get())
    run_dir = time.strftime(f"%d.%m.%Y/{name}_t%H.%M.%S")
    Path("out/" + run_dir).mkdir(parents=True, exist_ok=True)
    with open(f"out/{run_dir}/settings.py", "w") as f:
        f.write(settings.src)
    torch.set_default_device(dev)

    start = torch.zeros([h, w], dtype=t_cfp)
    #res = torch.zeros([h,w], device=dev, dtype=t_fp)
    res = torch.ones([h,w], dtype=t_fp)

    half_x = frame_span[0] / 2
    half_y = frame_span[1] / 2
    yspace = torch.linspace(-half_y, half_y, h, dtype=t_fp)
    xspace = torch.linspace(-half_x, half_x, w, dtype=t_fp)
    for _x in range(h):
        start[_x] += xspace
    for _y in range(w):
        start[:, _y] += yspace * 1j

    start = torch.stack((start.real - frame_center[0], start.imag - frame_center[1], torch.ones([h, w], dtype=t_fp) * frame_center[2]))

    step = torch.stack([torch.ones([h,w], dtype=t_fp)*x for x in step_dir]) * max_depth / max_steps

    s_res = []
    v_res = []
    for sample_idx in range(max_samples):
        pos = start + torch.randn([3,h,w], dtype=t_fp) * noise_scale
        s_res.append(torch.ones_like(res))
        v_res.append(torch.zeros_like(res))
        for step_idx in range(max_steps):
            pos += step
            hit = hit_3(pos) #* hit_2(pos)
            hit_adj = hit * (s_res[sample_idx] > (step_idx / max_steps))
            hit_val = hit_adj * (step_idx / max_steps)
            #hit_val = hit * (1 / max_steps)
            v_res[sample_idx] = v_res[sample_idx] + hit * (1. / max_steps)
            s_res[sample_idx] = (s_res[sample_idx] * ~hit_adj) + hit_val #hit / max_samples / max_steps
            if step_idx % 10 == 999:
                print(step_idx)
                print(hit.sum())
                print(hit_adj.sum())
                print(s_res[sample_idx].sum())

    s_res = torch.stack(s_res).mean(dim=0)
    v_res = torch.stack(v_res).mean(dim=0)

    #res = res % (1/5)
    #res = torch.sqrt(res)# * 5)
    msave(1-s_res, f"{run_dir}/res_s")
    msave(v_res, f"{run_dir}/res_v")
    #msave(1-res, out_file)
    #res_mv = torch.cat([res, torch.flip(res, dims=(0,))])
    #res_mh = torch.cat([res_mv, torch.flip(res_mv, dims=(1,))], dim=1)
    #msave(res_mh, out_file)

