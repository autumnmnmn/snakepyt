# pytorch adaptation of the methods described here:
# https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/GDC03.pdf (overall design)
# https://www.karlsims.com/fluid-flow.html (divergence clearing step)

# only dependencies are pillow and pytorch

import math
import time
from pathlib import Path
from PIL import Image

import torch
from torch.nn.functional import conv2d

# settings

result_directory = "out"
Path(result_directory).mkdir(parents=True, exist_ok=True)
Path(result_directory + "/velocities").mkdir(parents=True, exist_ok=True)
Path(result_directory + "/densities").mkdir(parents=True, exist_ok=True)

scale = 10
w = 2**scale
h = 2**scale

max_iterations = 100000
save_every = 1

velocity_diffusion_rate = 20
density_diffusion_rate = None
density_timescale = 0.005
timescale = 0.01

torch.set_default_device("cuda")

diffusion_solver_steps = 10
divergence_clearing_steps = 20


# save images

def monochrome_save(tensor, filename):
    """save a 2d tensor of shape (h,w) as a monochrome image"""
    scaled = torch.clone(tensor).clamp_(0,1).mul_(255).round().type(torch.uint8)
    # copy to make 3 color channels
    rearranged = scaled.unsqueeze(2).expand(-1, -1, 3).cpu().numpy()
    Image.fromarray(rearranged).save(f"{result_directory}/{filename}.png")

def save(tensor, filename):
    """save a 3d tensor with shape (3,h,w) as an rgb image"""
    scaled = torch.clone(tensor).clamp_(0, 1).mul_(255).round().type(torch.uint8)
    rearranged = scaled.permute(1, 2, 0).cpu().numpy()
    Image.fromarray(rearranged).save(f"{result_directory}/{filename}.png")





# convolution

# the backbone of this simulation is a handful of discrete convolutions
# detailed definition here: https://en.wikipedia.org/wiki/Convolution#Discrete_convolution

# roughly: we have a discrete field and a "kernel".
# we look at a small window of values in the field, multiply each value there by a number,
# and sum the results. the kernel describes what number to multiply each value in the window by.
# we do this for every possible window, centered on every point we can fit the window around,
# skipping points where the window would hang off the edge of the field. thus, we end up with
# a result that's slightly smaller than the field

def convolve(field, kernel):
    # conv2d works in batches & we only ever need to do a 1-element batch
    # "unsqueeze" is pytorch's absolutely bizarre term for wrapping a tensor with another dimension. like going from [1,2] to [[1,2]]
    return conv2d(field.unsqueeze(0), kernel, bias=None, padding=[0], stride=[1])[0]

# convolution kernels:

# total of values of immediate neighbors in all 4 cardinal directions
diffusion_kernel = torch.tensor([[[
    [0, 1, 0],
    [1, 0, 1],
    [0, 1, 0]
]]], dtype=torch.float)

# gradient of divergence in the x direction
x_div_kernel = torch.tensor([[[
    [ 1, 2, 1],
    [-2,-4,-2],
    [ 1, 2, 1]
]]], dtype=torch.float)

div_opp_kernel = torch.tensor([[[
    [ 1, 0,-1],
    [ 0, 0, 0],
    [-1, 0, 1]
]]], dtype=torch.float)

# gradient of divergence in the y direction
y_div_kernel = torch.tensor([[[
    [ 1,-2, 1],
    [ 2,-4, 2],
    [ 1,-2, 1]
]]], dtype=torch.float)

# various boundary conditions

def continuous_boundary(field):
    """set the border values of the provided discretized 2d scalar field (that is, a 2d array of numbers) to be equal to their inner neighbors (& average the corner points)"""
    field[0] = field[1]
    field[-1] = field[-2]
    field[:,0] = field[:,1]
    field[:,-1] = field[:,-2]
    # this is doing four indexing operations at once, getting all four corners in one go
    field[(0,0,-1,-1),(0,-1,0,-1)] = 0.5 * (field[(0,0,-2,-2),(1,-2,0,-1)] + field[(1,1,-1,-1),(0,-1,1,-2)])

def opposed_vertical_boundary(field):
    """set the border values of a discretized 2d field to be equal to their inner neighbors horizontally but opposite their neighbors vertically. average at corners"""
    field[0] = field[1]
    field[-1] = field[-2]
    field[:,0] = -field[:,1]
    field[:,-1] = -field[:,-2]
    field[(0,0,-1,-1),(0,-1,0,-1)] = 0.5 * (field[(0,0,-2,-2),(1,-2,0,-1)] + field[(1,1,-1,-1),(0,-1,1,-2)])

def opposed_horizontal_boundary(field):
    """set border values equal vertically, opposite horizontally, average at corners"""
    field[0] = -field[1]
    field[-1] = -field[-2]
    field[:,0] = field[:,1]
    field[:,-1] = field[:,-2]
    field[(0,0,-1,-1),(0,-1,0,-1)] = 0.5 * (field[(0,0,-2,-2),(1,-2,0,-1)] + field[(1,1,-1,-1),(0,-1,1,-2)])



def diffuse(field, rate, boundary_condition, timescale):
    """diffuse the scalar field. basically means repeatedly applying a blur to it"""
    a = timescale * rate
    result = torch.clone(field)
    for n in range(diffusion_solver_steps):
        # scaled sum of surrounding points
        convolution = a * convolve(result, diffusion_kernel)
        # convolution operation doesn't produce output for the border rows & columns, thus the "1:n-1" indexing
        result[1:h-1,1:w-1] = field[1:h-1,1:w-1] + convolution
        result /= 1 + 4 * a
        boundary_condition(field)
    return result

# generate indices outside the function for a tiny performance improvement
indices_x = torch.arange(1,w-1,dtype=torch.float).repeat(h-2,1)
indices_y = torch.arange(1,h-1,dtype=torch.float).repeat(w-2,1).t()
indices = torch.stack((indices_y, indices_x))

# defining these here to reuse the same gpu memory for each advect() call
# TODO do the same for the rest of the tensors
offsets = indices.clone()
inverse_offsets = indices.clone()
indices_int = indices.int()
next_indices = indices_int.clone()


# advection
# this is a point where i deviate from the original paper.
# i take the velocity at every point, and add a scaled version of that to the index at each point
# to find where that velocity will carry whatever is being advected along it in one timestep.
# that will be a point that i decompose into the integer component & fractional component. like (3.4, 1.2) -> (3,1) + (0.4, 0.2)
# the point itself will be somewhere between two indices on each axis. the integer component determines the first of these two
# indices, and the fractional component determines which of the points it's closer to

# the paper i based this on did this weird backward version of that, where they use the negative velocity at each point to
# select a point & interpolate the values of the field at the surrounding points

def advect(field, velocities, timescale):
    """given any field, and a velocity field of the same height & width, move the values in the field a small distance in the direction of the velocity field"""
    offsets[...] = indices
    offsets.add_(timescale * velocities[:,1:h-1,1:w-1])
    offsets[1].clamp_(1.5, w - 2.5)
    offsets[0].clamp_(1.5, h - 2.5)
    indices_int[...] = offsets.int()
    offsets.sub_(indices_int)
    inverse_offsets[...] = 1 - offsets
    next_indices[...] = indices_int + 1
    inds_x_all = torch.stack([indices_int[1], next_indices[1], indices_int[1], next_indices[1]])
    inds_y_all = torch.stack([indices_int[0], indices_int[0], next_indices[0], next_indices[0]])
    values = torch.stack([field[:,1:h-1,1:w-1] * inverse_offsets[1] * inverse_offsets[0],
                        field[:,1:h-1,1:w-1] * offsets[1] * inverse_offsets[0],
                        field[:,1:h-1,1:w-1] * inverse_offsets[1] * offsets[0],
                        field[:,1:h-1,1:w-1] * offsets[1] * offsets[0]])
    res = torch.zeros_like(field)
    res[0].index_put_((inds_y_all, inds_x_all), values[:,0,:,:], accumulate=True)
    if field.shape[0] == 1:
        continuous_boundary(res[0])
    else:
        res[1].index_put_((inds_y_all, inds_x_all), values[:,1,:,:], accumulate=True)
        opposed_horizontal_boundary(res[1])
        opposed_vertical_boundary(res[0])
    return res

def clear_divergence(field):
    opposed_horizontal_boundary(field[0])
    opposed_vertical_boundary(field[1])
    for i in range(divergence_clearing_steps):
        x_op = convolve(field[0], div_opp_kernel)
        y_op = convolve(field[1], div_opp_kernel)
        field[1,1:h-1,1:w-1] += (convolve(field[1], y_div_kernel) + x_op) / 8
        field[0,1:h-1,1:w-1] += (convolve(field[0], x_div_kernel) + y_op) / 8
        opposed_horizontal_boundary(field[0])
        opposed_vertical_boundary(field[1])




# initialize a small field of random velocities, then upscale it interpolating between those velocities,
# so that the variation in velocity is somewhat smooth instead of pure per-pixel noise,
# which would lead to a less interesting simulation
velocities = torch.randn([2, h//32, w//32]) * 120
upsample = torch.nn.Upsample(size=[h, w], mode='bilinear')
velocities = upsample(velocities.unsqueeze(0))[0]

# initialize "dye" densities to a uniform field
densities = torch.ones([1, h, w]) * 0.3
# add lines
#for x in range(20):
#    densities[0,:,x*w//20] += 0.8
#for y in range(20):
#    densities[0,y*h//20,:] += 0.8

frame_index = 0

last_frame = time.perf_counter()

limit = 1 / (timescale * 2 * math.sqrt(2))

# core loop of the simulation
for iteration in range(max_iterations):
    # add a tiny bit of "dye" to the fluid at all points
    densities.add_(0.003)
    #if iteration % (30 * save_every) == 0:
    #    for x in range(20):
    #        densities[0,:,x*w//20] += 0.3
    #    for y in range(20):
    #        densities[0,y*h//20,:] += 0.3


    #velocities[1,h//12+h//3:h//12+2*h//3,w//8] += 50 + 50 * math.sin(iteration * 0.005)
    #velocities[1,h//3-h//12:2*h//3-h//12,7*w//8] -= 20 + 70 * math.sin(iteration * 0.01)
    #velocities[0,7*h//8,4*w//6:5*w//6] -= 60 + 50 * math.sin(iteration * 0.03)

    # diffuse the velocities in both directions, enforcing a boundary
    # condition that maintains a constant inward velocity matching the outward velocity along the edges. that is, a wall
    velocities[0] = diffuse(velocities[0], velocity_diffusion_rate, opposed_horizontal_boundary, timescale)
    velocities[1] = diffuse(velocities[1], velocity_diffusion_rate, opposed_vertical_boundary, timescale)
    clear_divergence(velocities)
    velocities.clamp_(-limit, limit)

    # let the velocity field flow along itself
    velocities = advect(velocities, velocities, timescale)
    clear_divergence(velocities)

    # diffuse the densities & let them flow along the velocity field
    if density_diffusion_rate is not None:
        densities = diffuse(densities[0], density_diffusion_rate, continuous_boundary, density_timescale).unsqueeze(0)
    densities = advect(densities, velocities, density_timescale)

    # remove a little density
    densities.sub_(0.003)
    densities.clamp_(0,1)

    if iteration % save_every == 0:
        frame_index += 1
        frame_time = time.perf_counter() - last_frame
        image = torch.cat((0.5 + 0.5 * velocities / torch.sqrt(velocities[0]**2 + velocities[1]**2), torch.zeros((1,h,w))), dim=0)
        save(image, f"velocities/{frame_index:06d}")
        monochrome_save(densities[0], f"densities/{frame_index:06d}")

        print(f"frame {frame_index:06d}: {frame_time:06f}")
        print(f"[{frame_time/save_every:06f}/it for {save_every} iterations]")
        last_frame = time.perf_counter()

