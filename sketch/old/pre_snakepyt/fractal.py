import time
import torch
from PIL import Image
from util import *

import math

# Settings

w = 2**13
h = w

#x_range = [-1.8, -1.7]
#y_range = [-0.095, 0.005]

#ship
x_start = -1.8
x_span = 0.1
y_start = -0.095
y_span = 0.1

#x_start = -math.e / 2
#x_span = 1.54
#y_start = -2
#y_span = 2

alpha = 2.5

x_range = [x_start, x_start + x_span]
y_range = [y_start, y_start + y_span]

final_file = "ship_big"

device = "cuda"
ctype = torch.cfloat
dtype = torch.float

# how many random samples in each point
sample_ct = 40
noise_scale = x_span / (2 * w)

do_jitter = False
jitter_scale = 2.5 / w
jitter_chunk_size = 128

# how many iterations of the z_(n+1) = f(z_n) recurrence
iterations = 120

# threshold for defining escape
limit = 2.0

if __name__ == "__main__":
    t0 = time.perf_counter()

    z_init = torch.zeros([h, w], dtype=ctype, device=device)
    c = torch.zeros([h, w], dtype=ctype, device=device)
    j = torch.zeros([h, w], dtype=ctype, device=device)
    j.imag = torch.ones([h, w], dtype=dtype, device=device)

    yspace = torch.linspace(y_range[0], y_range[1], h, dtype=dtype, device=device)
    xspace = torch.linspace(x_range[0], x_range[1], w, dtype=dtype, device=device)

    for x in range(h):
        c[x] += xspace

    for y in range(w):
        c[:, y] += yspace * 1j

    #save(c, "c")
    #save(z_init, "z0")

    #z = z_init

    totals = torch.zeros([h, w], dtype=torch.int, device=device)
    jitter = torch.randn([h // jitter_chunk_size, w // jitter_chunk_size], dtype=ctype, device=device) * jitter_scale
    if do_jitter:
        upsample = torch.nn.Upsample(size=[h, w], mode='nearest')
        jitter = torch.view_as_real(jitter).permute((2,0,1))[None, ...]
        jitter = torch.view_as_complex(upsample(jitter)[0].permute((1,2,0)).contiguous())

    #csave(jitter, "jitter")
    #exit()

    for sample_idx in range(sample_ct):
        noise = torch.randn([h, w], dtype=ctype, device=device)
        z = z_init# + noise * noise_scale
        c_n = c + noise * noise_scale
        mask = torch.abs(z) < limit
        iters = torch.zeros_like(mask, dtype=torch.uint8)
        for i in range(iterations):
            im = torch.abs(z.imag) * j
            z = (torch.abs(z.real) + im)**2 + c_n
            #z = torch.exp(-alpha * z) + c_n

            if do_jitter:
                z += jitter
            mask &= (torch.abs(z) < limit)
            iters += mask
        #for i in range(iterations):
        #    im = torch.abs(z.imag) * j
        #    z = (torch.abs(z.real) + im)**2 + c_n
        #    totals +=

        #totals += ~mask
        totals += iters
            #csave(mask, f"mask")

            #csave(z, f"z{i}")

        #msave(mask, f"mfinal_s{sample_idx}")
        #csave(z, f"zfinal_s{sample_idx}")

        #im = torch.log(iters)
    #im = iters
        #im = im / torch.max(im)

        #msave(im, f"ifinal_s{sample_idx}")
    #im = im * ~mask

    #totals = torch.log(1. - totals)
    #totals *= totals

    #m = totals == 0. #torch.max(totals)
    #totals = totals + torch.max(totals) * 0.5 * m

    totals = totals / sample_ct / iterations#torch.max(totals)
    msave(totals, final_file + "_")

    #msave(totals**2, final_file + "_sq")
    #msave(torch.sqrt(totals), final_file + "_rt")
    totals = 1. - totals
    #msave(totals, final_file + "_inv_")
    #msave(totals**2, final_file + "_inv_sq")
    msave(torch.sqrt(totals), final_file + "_inv_rt")


    #csave(torch.nan_to_num(z, 0) * (mask), "zmfinal")

    #zm_r = torch.nan_to_num(z.real, 0) * mask
    #zm_i = torch.nan_to_num(z.imag, 0) * mask

    #print(torch.max(torch.abs(torch.nan_to_num(z, 0) * mask)))

    #msave(im, "imfinal")

    #final = torch.stack([zm_r / 4 + 0.5, zm_i / 4 + 0.5, im])

    #save(final, "final")

    print(f"done in {time.perf_counter() - t0}s")






