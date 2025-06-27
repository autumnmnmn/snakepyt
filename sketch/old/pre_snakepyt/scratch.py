from util import *
import torch
import torchvision

@timed
def a(z, n):
    for i in range(n):
        #msave_gpu(z, "test/f")
        #torchvision.utils.save_image(z, f"out/test/new_{i}.png", "png")
        msave(z, f"test/old_{i}")
        #mpilify(z)

@timed
def b(z, n):
    for i in range(n):
        #torch.save(z.type(torch.uint8), f"out/test/new_{i}.pt")
        msave_alt(z, f"test/new_{i}")
        #mpilify_gpu(z)

@ifmain(__name__)
def _main():
    s = 2048
    h,w = s, s

    z = torch.randn((h, w), device="cuda", dtype=torch.double);

    z.mul_(3.14159)

    n = 20

    a(z, n)

    b(z, n)

    a(z, n)

    b(z, n)
