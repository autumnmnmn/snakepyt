import torch
from PIL import Image

class Settings(dict):
    __getattr__ = dict.__getitem__
    __setattr__ = dict.__setitem__
    __delattr__ = dict.__delitem__

    def __init__(self, _vars):
        for key in _vars:
            self[key] = _vars[key]

class _Settings():
    def __init__(self, _get, _src):
        self.get = _get
        self.src = _src

def settings(f):
    import inspect
    f_src = inspect.getsource(f)
    f_lines = f_src.split('\n')
    f_lines = [l for l in f_lines if f"@settings" not in l]
    f_lines.append("    return Settings(vars())")
    new_src = "\n".join(f_lines)
    exec(new_src)
    return _Settings(eval(f.__name__),new_src)

def first(l, p):
    return next((idx,value) for idx,value in enumerate(l) if p(value))

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
def mpilify(z):
    z_3d = torch.stack([z, z, z])
    z_norm = z_3d.clamp(0, 1)
    z_np = z_norm.detach().cpu().permute(1, 2, 0).numpy()
    z_bytes = (z_np * 255).round().astype("uint8")
    return Image.fromarray(z_bytes)

def msave(x, f):
    mpilify(x).save(f"out/{f}.png")

# 3 channels
def pilify(z):
    z_norm = z.clamp(0, 1)
    z_np = z_norm.detach().cpu().permute(1, 2, 0).numpy()
    z_bytes = (z_np * 255).round().astype("uint8")
    return Image.fromarray(z_bytes)

def save(x, f):
    pilify(x).save(f"out/{f}.png")

# grid of complex numbers
def cgrid(h,w,center,span,ctype=torch.cdouble,dtype=torch.double,**_):
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
