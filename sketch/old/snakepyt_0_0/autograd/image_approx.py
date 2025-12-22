
import torch

from lib.util import load_image_tensor, save, msave
from lib.spaces import grid, xrange_yrange

def init():
    t_real = torch.double

    torch.set_default_device("cuda")
    torch.set_default_dtype(t_real)

    im = load_image_tensor("in/flower.jpg").to(t_real).to("cuda")

    (c, h, w) = im.shape


    n_a = 4

    a = torch.rand([n_a,c,h]) - 0.5 #* 0.1 - 0.05
    b = torch.rand([n_a,c,w]) - 0.5 #* 0.1 - 0.05
    a *= 0.01
    b *= 0.01
    shifts = torch.rand([12])
    coefs = torch.ones([12]) / 12

    a = gradify(a)
    b = gradify(b)
    coefs = gradify(coefs)
    shifts = gradify(shifts)

    train_iters = 100000
    def get_lr(i):
        if i < 10:
            return 1
        if i < 100:
            return 1
        if i < 1000:
            return 1e-1
        if i < 10000:
            return 1e-1
        return 1e-1

    save_on = lambda i: (i % 100 == 0) if i > 100 else (i % 10 == 0)

    schedule(train, None)

def gradify(t):
    return t.clone().detach().requires_grad_(True)

def train():
    global a, b, coefs, shifts

    im_bw = im.norm(p=2,dim=0)

    g = grid((xrange_yrange((0,0), (7,7)), (h,w))).permute(2,0,1)


    for n in range(train_iters):
        copies = a.view(n_a,c,h,1) * b.view(n_a,c,1,w)

        _g = g * 5
        _g[0] += shifts[0]
        _g[1] += shifts[1]
        s_0 = torch.sin(_g[0]) * copies[0] + torch.cos(_g[0]) * copies[1]
        s_1 = torch.sin(_g[1]) * copies[2] + torch.cos(_g[1]) * copies[3]
        _g = g * 11
        _g[0] += shifts[2]
        _g[1] += shifts[3]
        s_2 = torch.sin(_g[0]) * copies[0] + torch.cos(_g[0]) * copies[2]
        s_3 = torch.sin(_g[1]) * copies[1] + torch.cos(_g[1]) * copies[3]
        _g = g * 23
        _g[0] += shifts[4]
        _g[1] += shifts[5]
        s_4 = torch.sin(_g[0]) * copies[1] + torch.cos(_g[0]) * copies[0]
        s_5 = torch.sin(_g[1]) * copies[3] + torch.cos(_g[1]) * copies[2]
        _g = g * 57
        _g[0] += shifts[6]
        _g[1] += shifts[7]
        s_6 = torch.sin(_g[0]) * copies[0] + torch.cos(_g[0]) * copies[1]
        s_7 = torch.sin(_g[1]) * copies[2] + torch.cos(_g[1]) * copies[3]
        _g = g * 101
        _g[0] += shifts[8]
        _g[1] += shifts[9]
        s_8 = torch.sin(_g[0] + _g[1]) * copies[2] + torch.cos(_g[0] * _g[0] + _g[1] * _g[1]) * copies[3]
        s_9 = torch.sin(_g[1] - _g[0]) * copies[0] + torch.cos(_g[1] * _g[1] + _g[0] * _g[0]) * copies[1]

        s_10 = (g[0] + shifts[10]) * copies[2] - (g[0] + shifts[10]) * copies[3]
        s_11 = (g[1] + shifts[11]) * copies[0] - (g[1] + shifts[11]) * copies[1]

        srcs = torch.stack((s_0, s_1, s_2, s_3, s_4, s_5, s_6, s_7, s_8, s_9, s_10, s_11))

        coefs_ = coefs #+ torch.rand_like(coefs) * 0.1

        srcs_scaled = (srcs * coefs_.view(12, 1, 1, 1))
        copy = srcs_scaled.sum(dim=0)

        diff = copy - im
        mse = (diff ** 2).sum()

        mse.backward()

        torch.nn.utils.clip_grad_norm_([a,b,coefs], max_norm=1.0)
        with torch.no_grad():
            learn_rate = get_lr(n)
            a -= (a.grad) * learn_rate
            b -= (b.grad) * learn_rate
            coefs -= (coefs.grad) * learn_rate
            shifts -= (shifts.grad) * learn_rate * 0.01
            if save_on(n):
                print(a.grad.norm())
                print(b.grad.norm())
                print(coefs.grad.norm())
                print(shifts.grad.norm())

        a.grad.zero_()
        b.grad.zero_()
        coefs.grad.zero_()


        if save_on(n):
            print(f"mse {mse.item()}")
            with torch.no_grad():
                out = copy - copy.min()
                out /= out.max()
            #print(coefs)
            save(out, f"{run_dir}/{n:06d}")
            #with torch.no_grad():
            #    c0 = copies[0] - copies[0].min()
            #    c1 = copies[1] - copies[1].min()
            #    c2 = copies[2] - copies[2].min()
            #    c3 = copies[3] - copies[3].min()
            #    c0 /= c0.max()
            #    c1 /= c1.max()
            #    c2 /= c2.max()
            #    c3 /= c3.max()
            print(coefs)
            print(shifts)
            #save(c0, f"{run_dir}/c0_{n:06d}")
            #save(c1, f"{run_dir}/c1_{n:06d}")
            #save(c2, f"{run_dir}/c2_{n:06d}")
            #save(c3, f"{run_dir}/c3_{n:06d}")
            #for s in range(12):
            #    with torch.no_grad():
            #        src = srcs_scaled[s]
            #        src -= src.min()
            #        src /= src.max()
            #        save(src, f"{run_dir}/s{s}_{n:06d}")

