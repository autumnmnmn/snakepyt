import torch
from torch.nn.functional import conv2d
from math import tau

from diffusers import AutoencoderKL

from lib.util import load_image_tensor, save, msave

t_fp = torch.double

def persistent():
    vae = AutoencoderKL.from_pretrained(
        "/ssd/0/ml_models/ql/hf-diff/stable-diffusion-xl-base-0.9", subfolder="vae"
    )
    vae.to("cuda")
    vae.to(torch.float)

def decode(l, vae):
    l_dtype = l.dtype
    l = l.unsqueeze(0).to(vae.dtype)
    with torch.no_grad():
        ims = vae.decode(l).sample
    return ims.to(l_dtype)[0]

def encode(im, vae):
    im_dtype = im.dtype
    im = im.unsqueeze(0).to(vae.dtype)
    with torch.no_grad():
        l = vae.encode(im)
    return l[0].mean[0].to(im_dtype)


def init():
    torch.set_default_device("cuda")
    torch.set_default_dtype(t_fp)
    do_vae = False
    shrink = False
    do_horiz = True
    remove = 1000

    im = load_image_tensor("in/seam_code_b.png").to(t_fp).to("cuda")
    if do_vae:
        im = encode(im, vae)
    if do_horiz:
        im = im.transpose(1,2)
    schedule(run, None)

def convolve(field, kernel, padding):
    return conv2d(field.unsqueeze(0), kernel, bias=None, padding=padding, stride=[1])[0]

kernel3 = torch.tensor([
    [[[-1], [0], [1]], [[0], [0], [0]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[-1], [0], [1]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[0], [0], [0]], [[-1], [0], [1]]],
], dtype=t_fp, device="cuda")

kernel4 = torch.tensor([
    [[[-1], [0], [1]], [[0], [0], [0]], [[0], [0], [0]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[-1], [0], [1]], [[0], [0], [0]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[0], [0], [0]], [[-1], [0], [1]], [[0], [0], [0]]],
    [[[0], [0], [0]], [[0], [0], [0]], [[0], [0], [0]], [[-1], [0], [1]]],
], dtype=t_fp, device="cuda")

def run():
    prev_im = im
    _shrink = shrink
    try:
        for iteration in range(remove):
            prev_shrink = _shrink
            _shrink = (iteration % 4) > 0

            prev_im = prev_im.transpose(1,2) if prev_shrink != _shrink else prev_im
            (c, h, w) = prev_im.shape

            if _shrink:
                out = torch.zeros([c, h, w-1])
            else:
                out = torch.zeros([c, h, w+1])



            kernel = kernel3 if c == 3 else kernel4
            edges = convolve(prev_im, kernel, [1,0])
            edges += convolve(prev_im, kernel.transpose(2,3), [0,1])
            energy = edges.norm(p=2, dim=0)

            paths = energy.clone()
            if not _shrink:
                paths += torch.rand_like(energy) * (11 if not do_vae else 100)
            paths_l = torch.roll(paths, 1, dims=1)
            paths_r = torch.roll(paths, -1, dims=1)
            paths_l[0] = torch.inf
            paths_r[-1] = torch.inf
            paths_stack = torch.stack((paths_l, paths, paths_r))
            path_mins = torch.min(paths_stack, dim=0)

            for row_index in range(1,h):
                prev_vals = paths_stack[:, row_index - 1]
                mins, inds = torch.min(prev_vals, dim=0)
                paths_stack[:, row_index] += mins.expand((3,w))

            paths = paths_stack[1]

            vals, ind = torch.min(paths[-1], dim=0)
            min_path = [ind.item()]
            for row_index in range(h-1)[::-1]:
                prev_ind = min_path[-1]
                l_ind = ((prev_ind - 1) + w) % w
                r_ind = (prev_ind + 2) % (w+1)
                if prev_ind == 0 or prev_ind == (w - 1):
                    v, ind = torch.min(paths[row_index,(l_ind,prev_ind,r_ind-1)], dim=0)
                else:
                    v, ind = torch.min(paths[row_index,l_ind:r_ind], dim=0)
                min_path.append((prev_ind + ind.item() - 1 + w) % w)

            for row_index in range(h):
                split_at = min_path[-row_index]
                if _shrink:
                    out[:,row_index,:split_at] = prev_im[:,row_index,:split_at]
                    out[:,row_index,split_at:] = prev_im[:,row_index,(split_at+1):]
                else: # grow
                    out[:,row_index,:split_at] = prev_im[:,row_index,:split_at]
                    out[:,row_index,split_at] = prev_im[:,row_index,split_at]
                    out[:,row_index,(split_at+1):] = prev_im[:,row_index,split_at:]

            prev_im = out
            _do_horiz = not prev_shrink

            if iteration % 1 == 0:
                to_save = decode(out, vae) if do_vae else out
                to_save = to_save.transpose(1,2) if _do_horiz else to_save
                save(to_save, f"{run_dir}/{iteration:06d}")
                #save(out.transpose(1,2), f"{run_dir}/{iteration:06d}")
    except:
        to_save = decode(prev_im, vae) if do_vae else out
        to_save = to_save.transpose(1,2) if do_horiz else to_save
        save(to_save, f"{run_dir}/{iteration:06d}")
        #save(prev_im.transpose(1,2), f"{run_dir}/{iteration:06d}")
        raise

    #out = out.transpose(1,2)
    to_save = decode(out, vae) if do_vae else out
    to_save = to_save.transpose(1,2) if do_horiz else to_save
    save(to_save, f"{run_dir}/out")


