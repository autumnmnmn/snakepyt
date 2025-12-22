
import math

import torch

from lib.util import save

def legendre_p(l, x):
    P = (torch.ones_like(x), x)
    if l < 2:
        return P[l]
    for n in range(2, l+1):
        p1_term = (2*n - 1) * x * P[1]
        p0_term = (n - 1) * P[0]
        Pnext = (p1_term - p0_term) / n
        P = (P[1], Pnext)
    return P[1]

def associated_legendre(l, m, x):
    def derivative(f, degree, dx=1e-5):
        for iteration in range(degree):
            f = lambda x, f=f, dx=dx: (f(x+dx) - f(x-dx)) / (2 * dx)
        return f

    p = lambda x: legendre_p(l, x)
    dp = derivative(p, m)
    return (-1)**m * (1 - x**2)**(m / 2) * dp(x)

def spherical_harmonic(l, m, theta, phi):
    x = torch.cos(theta)
    p = associated_legendre(l, abs(m), x)
    if m == 0:
        return p * (1 + 0j)
    return p * torch.exp(1j * m * phi)

def generalized_laguerre(k, a, x):
    total = torch.zeros_like(x)
    for i in range(k + 1):
        numer = math.factorial(k + a)
        denom = math.factorial(k - i) * math.factorial(a + i) * math.factorial(i)
        total += ((-x)**i) * (numer / denom)
    return total

def radial_wavefunc(n, l, r):
    rho = 2 * r / n
    laguerre = generalized_laguerre(n - l - 1, 2 * l + 1, rho)
    return r**l * torch.exp(-rho / 2) * laguerre

def orbital_wavefunc(n, l, m, r, theta, phi):
    R = radial_wavefunc(n, l, r)
    Y = spherical_harmonic(l, m, theta, phi)
    return R * Y

def sphericalize(coords):
    r = coords.norm(p=2,dim=0)
    theta = torch.acos(coords[2]/r)#torch.clamp(coords[2] / r, -1.0, 0.0))
    phi = torch.atan2(coords[1], coords[0])
    return r, theta, phi


def init():
    torch.set_default_device("cuda")

    h = 2**9
    w = 2**9
    d = 2**9

    scale = 20#0

    rx = -scale, scale
    ry = -scale, scale
    rz = -scale, scale

    coords = torch.zeros([3, h, w, d])

    xspace = torch.linspace(rx[0], rx[1], w, dtype=torch.double)
    yspace = torch.linspace(ry[0], ry[1], h, dtype=torch.double)
    zspace = torch.linspace(rz[0], rz[1], d, dtype=torch.double)

    coords[0] = xspace.view([w,1,1]).expand([w,h,d]).permute(1,0,2)
    coords[1] = yspace.view([h,1,1]).expand([h,w,d])
    coords[2] = zspace.view([d,1,1]).expand([d,h,w]).permute(1,2,0)

    schedule(per_n, [9])
    #schedule(per_n, range(1,6))

def per_n(n):
    schedule(per_l, range(n))
    #schedule(per_l, [3])
    #schedule(per_l, range(-5,6))

def per_l(l):
    schedule(per_m, range(l+1))
    #schedule(per_m, range(-l,l+1))
    #schedule(per_m, [3,2])
    #schedule(per_m, range(-5,6))

def per_m(m):
    #schedule(per_frame, range(60*4))
    schedule(per_frame, [0])

def per_frame(frame_index):
    torch.cuda.empty_cache()

    rotation_rate = 1 * math.tau / 60
    rotation_rate_b = 1 * math.tau / 60
    rotation_rate_c = 1 * math.tau / 60

    rotation_rate   = 0 if frame_index > 60 and frame_index < 180 else rotation_rate
    rotation_rate_b = 0 if frame_index < 60 or frame_index > 120 else rotation_rate_b
    rotation_rate_c = 0 if frame_index < 120 else rotation_rate_c

    c = math.cos(frame_index * rotation_rate)
    s = math.sin(frame_index * rotation_rate)
    rotation = torch.tensor([
        [1, 0, 0],
        [0, c,-s],
        [0, s, c]])
    c = math.cos(frame_index * rotation_rate_b)
    s = math.sin(frame_index * rotation_rate_b)
    rotation_b = torch.tensor([
        [ c, 0, s],
        [ 0, 1, 0],
        [-s, 0, c]])
    c = math.cos(frame_index * rotation_rate_c)
    s = math.sin(frame_index * rotation_rate_c)
    rotation_c = torch.tensor([
        [c, -s, 0],
        [s,  c, 0],
        [0,  0, 1]])


    _coords = (coords.permute(1,2,3,0) @ (rotation_c @ rotation_b @ rotation).T).permute(3,0,1,2)

    _coords *= n

    r, theta, phi = sphericalize(_coords)
    res = orbital_wavefunc(n, l, m, r, theta, phi)
    for dim in [0]:

        if m > 0:
            res_c = res.real.abs() * res.imag
            res_pos = res_c.clamp(0,torch.inf).sum(dim=dim)
            res_pos /= res_pos.abs().max()
            res_neg = (-res_c).clamp(0,torch.inf).sum(dim=dim)
            res_neg /= res_neg.abs().max()

            res_r = res_pos#.pow(0.3)
            res_b = res_neg#.pow(0.3)

        else:
            res_r = res.real.clamp(0,torch.inf).sum(dim=dim)
            res_b = (-res.real).clamp(0,torch.inf).sum(dim=dim)

            res_r /= res_r.max()
            res_b /= res_b.max()

        res_g = torch.zeros_like(res_r)

        res_rgb = torch.stack((res_r, res_g, res_b))

        save(res_rgb, f"{run_dir}/{n}_{l}_{m}_view{dim}_{frame_index:06d}")
    del r, theta, phi, res, res_r, res_g, res_b

