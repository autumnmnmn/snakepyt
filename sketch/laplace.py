# laplacian growth
# see "Fast Simulation of Laplacian Growth" by Theodore Kim, Jason Sewall, Avneesh Sud and Ming C. Lin

import itertools
from math import tau, log

import torch

from lib.util import load_image_tensor, save, msave



def init():
    torch.set_default_device("cuda")

    dims = 2
    #scale = 2 ** 10
    #h = scale
    #w = scale
    margin = 2**4

    physics_scale = 0.5
    eta = 10.7 # fractal dimension or something

    max_points = 2 ** 13

    t_real = torch.half

    point_positions = torch.zeros([max_points, dims], dtype=t_real)
    point_values = torch.zeros([max_points], dtype=t_real)
    is_charge = torch.zeros([max_points], dtype=torch.bool)
    do_neighbors = torch.zeros([max_points], dtype=torch.bool)
    is_candidate = torch.zeros_like(is_charge)
    is_free = torch.ones_like(is_charge)

    neighbors = torch.tensor([v for v in itertools.product([-1,0,1], repeat=dims) if any(v)], dtype=t_real)

    inner_radius = physics_scale / 2

    def insert_charge(position, value, was_candidate=True, no_neighbors=False):
        if was_candidate: # index could probably be provided by the caller for efficiency
            match_coords = point_positions == position.expand(point_positions.shape)
            match_pos = match_coords.prod(dim=1)
            index = torch.nonzero(is_candidate & match_pos)[0]
            is_candidate[index] = False
            is_charge[index] = True
            do_neighbors[index] = not no_neighbors
            point_values[index] = value
        else:
            # create the charge
            free_index = torch.nonzero(is_free)[0] # maybe not ideal
            is_charge[free_index] = True
            is_free[free_index] = False
            do_neighbors[free_index] = not no_neighbors
            point_positions[free_index] = position
            point_values[free_index] = value

        # update existing candidate potentials (eqn 11)
        candidate_pos = point_positions[is_candidate]
        dist = (candidate_pos - position.expand(candidate_pos.shape)).norm(p=2, dim=1)
        point_values[is_candidate] += 1 - inner_radius/dist

        if no_neighbors:
            return

        # add new candidates
        charge_pos = point_positions[is_charge & do_neighbors]
        for charge_index in range(charge_pos.shape[0]):
            neighborhood = neighbors + charge_pos[charge_index].expand(neighbors.shape)
            for neighbor_index in range(neighborhood.shape[0]):
                maybe_insert_candidate(neighborhood[neighbor_index])

    def maybe_insert_candidate(position):
        if torch.any((point_positions == position.expand(point_positions.shape)).prod(dim=1)):
            return

        free_index = torch.nonzero(is_free)[0] # maybe not ideal
        is_candidate[free_index] = True
        is_free[free_index] = False
        point_positions[free_index] = position
        charge_pos = point_positions[is_charge]
        charge_val = point_values[is_charge]
        dist = (charge_pos - position.expand(charge_pos.shape)).norm(p=2, dim=1)
        point_values[free_index] = (1 - inner_radius/dist).sum() # eqn 10

    def select_candidate(scale):
        try:
            candidate_val = point_values[is_candidate]
            candidate_pos = point_positions[is_candidate]
            max_val = candidate_val.max()
            min_val = candidate_val.min()
            normalized_val = (candidate_val - min_val) / (max_val - min_val) # eqn 13
            val_pow = normalized_val ** eta
            selection_prob = val_pow / val_pow.sum()

            prob_sum = selection_prob.cumsum(dim=0)

            choices = []
            for _ in range(scale):
                r = torch.rand(1, dtype=t_real)
                choice = torch.nonzero(prob_sum > r)[0]
                if choice not in choices:
                    insert_charge(candidate_pos[choice], 1)
                    choices.append(choice)
        except KeyboardInterrupt:
            raise
        except:
            print(f"selection failed")


    schedule(run, None)


def run():

    # set initial conditions
    insert_charge(torch.tensor([0]*dims, dtype=t_real), 1, was_candidate=False)
    for n in range(-40,40):
        insert_charge(torch.tensor([2, n], dtype=t_real), 1, was_candidate=False, no_neighbors=True)

    schedule(main_loop, None)

def main_loop():
    for iteration in range(10000):
        select_candidate(int(log(iteration * 100 + 10)))
        if iteration % 10 == 0:
            final_charges = point_positions[is_charge].clone()

            for d in range(dims):
                final_charges[:,d] -= final_charges[:,d].min()
                final_charges[:,d] += margin

            h = int(final_charges[:,0].max().item() + margin)
            w = int(final_charges[:,1].max().item() + margin)

            indices = final_charges.long()

            canvas = torch.ones([h,w], dtype=t_real)
            canvas[(indices[:,0], indices[:,1])] = 0

            msave(canvas, f"{run_dir}/{iteration:06d}")

