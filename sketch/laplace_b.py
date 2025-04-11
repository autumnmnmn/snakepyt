
from random import randint
from math import cos, sin, tau

import torch
from torch.nn.functional import conv2d, softmax

from lib.spaces import xrange_yrange, grid
from lib.util import msave, save

def init():
    device = "cuda"
    torch.set_default_device(device)

    t_real = torch.double
    torch.set_default_dtype(t_real)


    scale = 2**10
    h = scale
    w = scale

    charge_size = 50

    iterations = 100001
    selection_range = 0.05
    growth_limit = 100

    seed_pts = 10
    eta = 5

    span = (10, 10)
    region = xrange_yrange((0,0), span)

    neighbor_kernel = torch.ones([1,1,3,3],dtype=t_real)
    neighbor_kernel[0,0,1,1] = 0
    def neighbors(positions):
        conv = conv2d(positions.unsqueeze(0).unsqueeze(0), neighbor_kernel, bias=None, padding="same", stride=[1])[0,0]
        return ((conv > 0) & (positions == 0))


    schedule(growth, None)

def point_charge(position, positions, potentials, single_charge, no_seed=False, inverse=False, strength=1):
    if not no_seed:
        positions[position[0],position[1]] += 1
    if inverse:
        potentials.add_(torch.roll((1-single_charge)*strength, shifts=position, dims=(0,1)))
    else:
        potentials.add_(torch.roll(single_charge*strength, shifts=position, dims=(0,1)))


def growth():
    potentials = torch.zeros([h,w], dtype=t_real)
    positions = grid((region, (h,w)))
    #positions[:,:,0] -= (2*span[0]) / ((2 * h))
    #positions[:,:,1] -= (2*span[1]) / ((2 * w))
    single_charge_potential = 1 - (charge_size / (positions[:,:,0]**2 + positions[:,:,1]**2)**0.5)
    #msave(single_charge_potential / single_charge_potential.max(), f"{run_dir}/scp")
    single_charge_potential = torch.roll(single_charge_potential, shifts=(h//2, w//2), dims=(0,1))


    positions = torch.zeros([h,w], dtype=t_real)

    #r = torch.rand([seed_pts,2]) * (h) #+ ((h//2))
    #r = r.long()
    #for i in range(seed_pts):
    #    point_charge((r[i,0].item(), r[i,1].item()), positions, potentials, single_charge_potential)

    pts = [
        #(h//2 + 1, w//2),
        #(h//2 - 1, w//2)
        #(h//2,w//2)
        (0,w//2)
    ]

    for p in pts:
        point_charge((p[0], p[1]), positions, potentials, single_charge_potential)

    schedule(loop, None)


def loop():
    canvas = torch.zeros([3,h,w], dtype=t_real)

    #U = 80
    #for u in range(U//2):
        #rad = u*h//U
        #n_pts = int(tau*rad)
        #for p in range(n_pts):
        #    x = int(cos(tau*p/n_pts) * (rad) + (h//2))
        #    y = int(sin(tau*p/n_pts) * (rad) + (h//2))
        #    point_charge((x,y), positions, potentials, single_charge_potential, True, False, 5)

        #rad = int((u+0.5)*(h//U)*10)
        #n_pts = int(tau*rad)
        #for p in range(n_pts):
        #    x = int(cos(tau*p/n_pts) * (rad) + (h//4))
        #    y = int(sin(tau*p/n_pts) * (rad) + (h//4))
        #    point_charge((x,y), positions, potentials, single_charge_potential, True, True, 1)


    for p in range(h):
        point_charge((h-1, p), positions, potentials, single_charge_potential, True, False, 2)
    #for p in range(h):
    #    point_charge((p, 4 * h//10 - 1), positions, potentials, single_charge_potential, True, False, 8)
    #    point_charge((p, 6 * h//10 + 1), positions, potentials, single_charge_potential, True, False, 8)

    rad = h//10
    n_pts = int(tau*rad)
    for p in range(n_pts):
        x = int(cos(tau*p/n_pts) * rad + h//2 - h//5)
        x2 = int(cos(tau*p/n_pts) * rad + h//2)
        x3 = int(cos(tau*p/n_pts) * rad + h//2 + h//5)
        y = int(sin(tau*p/n_pts) * rad + h//2)
        point_charge((x,y), positions, potentials, single_charge_potential, True, True, 2)
        point_charge((x2,y), positions, potentials, single_charge_potential, True, True, 2)
        point_charge((x3,y), positions, potentials, single_charge_potential, True, True, 2)


    for iteration in range(iterations):

        candidates = neighbors(positions)

        cand_values = (potentials * candidates)
        cand_values[cand_values==0] = torch.inf

        cand_values -= cand_values.min() # infs necessary to keep min from being zero
        cand_values = torch.nan_to_num(cand_values, 0, 0, 0) # remove infs
        #msave(cand_values, f"{run_dir}/candv_{iteration}")
        cand_values /= cand_values.max()

        #msave(cand_values, f"{run_dir}/cand_{iteration:06d}")
        #cand_values *= torch.rand_like(cand_values)
        #cand_probs = softmax(cand_values)
        cand_probs = cand_values
        cand_probs.pow_(eta)
        #cand_probs.mul_(0.9 + 0.1 * torch.rand_like(cand_probs))

        #selected = torch.multinomial(cand_probs, 3, replacement=False)

        selected = torch.argwhere((cand_probs > ((1 - selection_range) * cand_probs.max())) & (cand_probs > 0))


        print(selected.shape[0])
        if selected.shape[0] > 0:
            r = randint(0,selected.shape[0] - 1)
            selected = torch.roll(selected, shifts=r, dims=0)

        #print(selected.shape)

        #ys = (selected // w)
        #xs = (selected % h)
        #point_charge((x,y), positions, potentials, single_charge_potential)

        if iteration % 100 == 0:
            canvas[2] = potentials
            canvas[2] -= canvas[2].min()
            canvas[2] /= canvas[2].max()
            canvas[2] = 1 - canvas[2]
            #canvas[0] = canvas[0] ** 5
            #/ potentials.max())**10
            #canvas[1] = cand_values
            #canvas[2] = single_charge_potential
            #canvas[0] = positions
            #msave(single_charge_potential, f"{run_dir}/scp_{iteration:06d}")
            #msave(candidates, f"{run_dir}/cand_{iteration}")
            #msave(potentials / potentials.max(), f"{run_dir}/pot_{iteration}")
            #msave(potentials / potentials.max(), f"{run_dir}/{iteration:06d}")
            save(canvas, f"{run_dir}/{iteration:06d}")

        ys = selected[:,0]
        xs = selected[:,1]

        n = selected.shape[0]
        if n > growth_limit: n = growth_limit

        for index in range(n):
            inds = ys[index].item(), xs[index].item()
            point_charge(inds, positions, potentials, single_charge_potential)

