
import torch
from torch.nn.functional import conv2d
from math import tau

from lib.util import load_image_tensor, save, msave
from diffusers import AutoencoderKL

t_fp = torch.double

def persistent():
    pass
    #vae = AutoencoderKL.from_pretrained(
    #    "/ssd/0/ml_models/ql/hf-diff/stable-diffusion-xl-base-0.9", subfolder="vae"
    #)
    #vae.to("cuda")
    #vae.to(torch.float)

def decode(l, vae):
    l = l.to(vae.dtype)
    with torch.no_grad():
        ims = vae.decode(l).sample
    return ims

def encode(im, vae):
    im = im.to(vae.dtype)
    with torch.no_grad():
        l = vae.encode(im)
    return l

def init():
    torch.set_default_device("cuda")
    torch.set_default_dtype(t_fp)

    im = load_image_tensor("in/sunset.jpg").to(t_fp).to("cuda")
    #im = encode(im.unsqueeze(0), vae)[0].mean[0].to(t_fp)

    #im = im.transpose(1,2)

    threshold = 0.4

    min_strip_size = 2
    max_strip_size = 400000

    # 1 = vertical, 2 = horizontal
    sort_dim = 1

    ranges = [(0.15, 0.33), (0.44, 0.9)]
    def in_ranges(x):
        for r in ranges:
            if x > r[0] and x < r[1]:
                return True
        return False

    column_selection = lambda w: [x for x in range(w) if in_ranges(x/w)]


    schedule(run, None)

def convolve(field, kernel):
    return conv2d(field.unsqueeze(0), kernel, bias=None, padding=[1, 0], stride=[1])[0]

kernel3 = torch.tensor([
    [[[0], [-1], [1]], [[0], [0], [0]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[0], [-1], [1]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[0], [0], [0]], [[0], [-1], [1]]],
], dtype=t_fp, device="cuda")

kernel4 = torch.tensor([
    [[[0], [-1], [1]], [[0], [0], [0]], [[0], [0], [0]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[0], [-1], [1]], [[0], [0], [0]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[0], [0], [0]], [[0], [-1], [1]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[0], [0], [0]], [[0], [0], [0]], [[0], [-1], [1]]],
], dtype=t_fp, device="cuda")


def run():
    (_, h, w) = im.shape

    out = im.clone() #torch.zeros_like(im)
    group_masks = torch.zeros([h,w], dtype=torch.long)

    edges = convolve(im, kernel3)
    edges = (edges.norm(p=2, dim=0) > threshold)

    scanner_encounters = torch.zeros([w], dtype=torch.long)

    n_edges = edges.sum(dim=0)
    print(n_edges)

    for row_index in range(h):
        scanner_encounters += edges[row_index]

        group_masks[row_index] = scanner_encounters

    n_groups = group_masks.max() + 1

    for group_index in range(n_groups):
        group_mask = group_masks == group_index

        for column in column_selection(w):
            inds = torch.where(group_mask[:, column])[0]
            if inds.shape[0] < min_strip_size or inds.shape[0] > max_strip_size:
                continue
            i_min, i_max = inds.min(), inds.max()
            strip = im[:, i_min:i_max, column]
            strip_vals = strip.norm(p=2, dim=0)
            s_vals, s_inds = torch.sort(strip_vals)
            out[:, i_min:i_max, column] = strip[:, s_inds]

    #out = 0.8 * out + 0.2 * im
    #out = out.transpose(1,2)
    #out = decode(out.unsqueeze(0), vae)[0]
    save(out, f"{run_dir}/out")
    #save(out, f"{run_dir}/out")


