import math
import random

import torch

from util import *

@settings
def _settings():
    scale = 2 ** 10
    w = scale + 1
    h = scale + 1

    iterations = 500000
    debug_modulus = 10000

    out_file = "hng"

    device="cuda"
    ctype=torch.cdouble
    dtype=torch.double

@ifmain(__name__)
@timed
def _main():
    _ = _settings()
    torch.set_default_device(_.device)
    torch.set_default_dtype(_.dtype)
    dim = [_.h, _.w]

    grid = torch.zeros(dim, dtype=torch.int)

    #offsets = [torch.tensor(x) for x in [[0,1],[0,-1],[1,0],[-1,0]]]
    #offsets = [[1,1],[1,-1],[-1,1],[-1,-1],[0,2],[0,-2],[2,0],[-2,0]]
    #offsets = [[0,10],[10,0],[5,10],[10,5],[5,5],[-1,0],[0,-1]]
    #offsets = [[0,5],[5,0],[0,-5],[-5,0],[1,4],[4,1],[-1,4],[4,-1],[1,-4],[-4,1],[-4,-1],[-1,-4]]
    offsets = [[0,3],[3,0],[1,2],[2,1],[13,3],[3,13],[1,0],[0,1],[1,1],[0,0]]
    #offsets = [x for x in [
    #    [1,1],
    #    [0,1],
    #    [1,0],
    #    [0,-5],
    #    [-5,-5],
    #    [-5,0]
    #    ]]

    max_c = 100
    c_total = 0
    last_c_total = 100

    n = len(offsets)

    for iteration in range(_.iterations):
        #spots = torch.randn(dim) > 2.5
        #grid += spots
        #p = [_.h // 2, _.w // 2]
        p = [0,0]
        #p = [random.randint(0,_.h-1), random.randint(0,_.w-1)]
        last = torch.clone(grid)
        grid[p[0],p[1]] = n
        peaks = (grid >= n).int()
        #peaks = torch.nonzero(grid >= 4)
        c = 0
        while torch.count_nonzero(peaks):
        #while len(peaks) != 0:
            c += 1
            #p0 = peaks[0]
            #pts = [p0 + o for o in offsets]
            #pts = [p for p in pts if 0 < p[0] < _.h and 0 < p[1] < _.w]
            #for p in pts:
            #    grid[p[0],p[1]] += 1
            #grid[p0[0],p0[1]] -= 4
            shift = -(n * peaks)
            for offset in offsets:
                p_shift = torch.roll(peaks, offset, dims=[0,1])
                if offset[0] < 0:
                    p_shift[offset[0]:] = 0
                else:
                    p_shift[:offset[0]] = 0
                if offset[1] < 0:
                    p_shift[:,offset[1]:] = 0
                else:
                    p_shift[:,:offset[1]] = 0
                shift += p_shift
            grid += shift

            #pa = torch.roll(peaks, 1, dims=0)
            #pb = torch.roll(peaks, -1, dims=0)
            #pc = torch.roll(peaks, 1, dims=1)
            #pd = torch.roll(peaks, -1, dims=1)
            #pa[0] = 0
            #pb[-1] = 0
            #pc[:,0] = 0
            #pd[:,-1] = 0
            #shift = pa + pb + pc + pd - (4 * peaks)
            #grid += shift

            peaks = (grid >= n).int()
            #peaks = torch.nonzero(grid >= 4)
        c_total += c
        if c > 20:
            s = "*" if c >= max_c else ""
            print(f"{iteration}: {c}{s}")
            if c > (0.9 * max_c):
                msave(grid / (n-1), f"{_.out_file}_{iteration}_{c}")
                msave(last / (n-1), f"{_.out_file}_{iteration}_prev")
            if c > max_c:
                max_c = c
        if iteration % _.debug_modulus == 0:
            msave(grid / (n-1), f"{_.out_file}_{iteration}_")
        if c_total > (last_c_total * 2):
            msave(grid / (n-1), f"{_.out_file}_{iteration}_ct{c_total}")
            last_c_total = c_total

    msave(grid / (n-1), _.out_file)
