import torch
import numpy as np
from PIL import Image
from safetensors.torch import save_file as sft_save
import io

def badfunc():
    return 1 / 0

def lerp(a, b, t):
    return (1-t)*a + t*b

def timed(f):
    import time
    def _f(*args, **kwargs):
        t0 = time.perf_counter()
        f(*args, **kwargs)
        print(f"{f.__name__}: {time.perf_counter() - t0}s")
    return _f

def ifmain(name, provide_arg=None):
    if name == "__main__":
        if provide_arg is None:
            return lambda f: f()
        return lambda f: f(provide_arg)
    return lambda f: f

def cpilify(z):
    z_3d = torch.stack([z.real, z.imag, torch.zeros_like(z.real)])
    z_norm = (z_3d / 2 + 0.5).clamp(0, 1)
    z_np = z_norm.detach().cpu().permute(1, 2, 0).numpy()
    z_bytes = (z_np * 255).round().astype("uint8")
    return Image.fromarray(z_bytes)

# complex, from -1 to 1 & -i to i
def csave(x, f):
    cpilify(x).save(f"out/{f}.png")

# monochrome, 0 to 1
def mpilify_cpu(z):
    _z = z.cpu().clamp_(0,1).mul_(255).round()
    z_np = _z.unsqueeze(2).expand(-1,-1,3).type(torch.uint8).numpy()
    return Image.fromarray(z_np)

def mpilify(z):
    _z = torch.clone(z).clamp_(0,1).mul_(255).round()
    z_np = _z.unsqueeze(2).expand(-1, -1, 3).type(torch.uint8).cpu().numpy()
    return Image.fromarray(z_np)

def mstreamify(z):
    return torch.clone(z).clamp_(0,1).mul_(255).round().unsqueeze(2).expand(-1,-1,3).type(torch.uint8).cpu().numpy().tobytes()

def msave_cpu(x, f):
    mpilify_cpu(x).save(f"out/{f}.png")

def msave(x, f):
    mpilify(x).save(f"out/{f}.png")

def msave_alt(x, f):
    with io.BytesIO() as buffer:
        mpilify(x).save(buffer, format="png")
        buffer.getvalue()
    #_z = torch.clone(x).clamp_(0,1).mul_(255).round()
    #z_np = _z.unsqueeze(2).expand(-1, -1, 3).type(torch.uint8)
    #sft_save({"":_z.type(torch.uint8)}, f"out/{f}.mono.sft")
    #torch.save(z_np, "out/{f}.pt")

# 3 channels
def pilify(z):
    z_norm = z.clamp(0, 1)
    z_np = z_norm.detach().cpu().permute(1, 2, 0).numpy()
    z_bytes = (z_np * 255).round().astype("uint8")
    return Image.fromarray(z_bytes)

def load_image_tensor(path):
    with Image.open(path) as pil_image:
        np_image = np.array(pil_image).astype(np.float32) / 255.0
    return torch.from_numpy(np_image).permute(2,0,1)

def save(x, f):
    pilify(x).save(f"out/{f}.png")

def streamify(z):
    z_norm = z.clamp(0, 1)
    z_np = z_norm.detach().cpu().permute(1, 2, 0).numpy()
    return (z_np * 255).round().astype("uint8").tobytes()

# grid of complex numbers
def cgrid_legacy(h,w,center,span,ctype=torch.cdouble,dtype=torch.double,**_):
    g = torch.zeros([h, w], dtype=ctype)

    low = center - span / 2
    hi = center + span / 2

    yspace = torch.linspace(low.imag, hi.imag, h, dtype=dtype)
    xspace = torch.linspace(low.real, hi.real, w, dtype=dtype)

    for _x in range(h):
        g[_x] += xspace
    for _y in range(w):
        g[:, _y] += yspace * 1j

    return g


# result, iterations; iterations == -1 if no convergence before limit
def gauss_seidel(a, b):
    x = torch.zeros_like(b)
    itlim = 1000
    for it in range(1, itlim):
        xn = torch.zeros_like(x)
        for i in range(a.shape[0]):
            s1 = a[i, :i].dot(xn[:i])
            s2 = a[i, i+1:].dot(x[i+1:])
            xn[i] = (b[i] - s1 - s2) / a[i, i]
        if torch.allclose(x, xn, rtol=1e-8):
            return xn, it
        x = xn
    return x, -1


