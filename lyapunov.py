import torch
import time
import itertools

from PIL import Image
# monochrome, 0 to 1
def mpilify(z):
    z_3d = torch.stack([z, z, z])
    z_norm = z_3d.clamp(0, 1)
    z_np = z_norm.detach().cpu().permute(1, 2, 0).numpy()
    z_bytes = (z_np * 255).round().astype("uint8")
    return Image.fromarray(z_bytes)

def msave(x, f):
    mpilify(x).save(f"out/{f}.png")

# config

final_file = "abaaa_squish_tall2"

# 2 ** 9 = 512; 10 => 1024; 11 => 2048
scale = 2 ** 9
h = scale * 2
w = scale

origin = 3 + (1 / 3), 2
span = 1 / 3, 2

zooms = []

dev = "cuda"
t_fp = torch.double
t_cfp = torch.cdouble

seq = "ABAAAAAAAA"
c = 3.5

iterations = 100


# funcs

def logistic_map(r, x):
    x_inf_mask = torch.isinf(x)
    _x = r * x * (1 - x)
    return torch.nan_to_num(_x) * ~x_inf_mask - x * x_inf_mask

def lyapunov_term(r, x):
    x_inf_mask = torch.isinf(x)
    term = torch.log(torch.abs(r * (1 - 2 * x)))
    return torch.nan_to_num(term) * ~x_inf_mask - x * x_inf_mask

def repeat(seq):
    i = 0
    l = len(seq)
    while True:
        yield seq[i%l]
        i += 1

def c_avg(prev, val, n):
    """cumulative average
    prev: previous result (should be zero for n=1)
    val: next value
    n: how many values given so far, including this value"""
    prev_inf_mask = torch.isinf(prev)
    _next = prev + (val - prev) / n
    return torch.nan_to_num(_next) * ~prev_inf_mask + prev * prev_inf_mask

# init

for z in zooms:
    # TODO shift & scale
    pass

x_min = origin[0]
y_min = origin[1]
x_max = origin[0] + span[0]
y_max = origin[1] + span[1]





def main():
    x = torch.ones([h, w], device=dev, dtype=t_fp) / 2
    ab = torch.zeros([h, w], device=dev, dtype=t_cfp)

    lyapunov_avg = torch.zeros([h, w], device=dev, dtype=t_fp)

    yspace = torch.linspace(y_min, y_max, h, dtype=t_fp, device=dev)
    xspace = torch.linspace(x_min, x_max, w, dtype=t_fp, device=dev)
    for _x in range(h):
        ab[_x] += xspace
    for _y in range(w):
        ab[:, _y] += yspace * 1j

    gen = itertools.islice(repeat(seq), iterations)

    for idx, seq_elem in enumerate(gen):
        if seq_elem == "C":
            r = c
        else:
            r = ab.real if seq_elem == "A" else ab.imag

        if idx > 0:
            lyapunov_avg = c_avg(lyapunov_avg, lyapunov_term(r, x), idx)

        if idx < iterations - 1:
            x = logistic_map(r, x)

        #msave(torch.tanh(lyapunov_avg / 4) / 2 + 0.5, f"avg_{idx}")

    result = torch.tanh(lyapunov_avg) / 2 + 0.5
    #msave(result, final_file)
    #msave(1 - result**2, final_file + "sq")
    #msave(1 - torch.sqrt(result), final_file + "sqrt")
    #msave(result ** 2, final_file + "sq_p")
    msave(torch.sqrt(result), final_file + "sqrt_p")


if __name__ == "__main__":
    t0 = time.perf_counter()
    main()
    print(f"done in {time.perf_counter() - t0}s")

