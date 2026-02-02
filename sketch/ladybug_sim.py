
import math
import torch

from lib.spaces import draw_points_2d, map_space, cgrid
from lib.util import *

name = "ladybug"

device = "cuda"
torch.set_default_device(device)

t_real = torch.double
t_comp = torch.cdouble

t_clockpos = torch.int8
t_bool = torch.bool

bug_count = 2**24
max_timesteps = 2**10

exit_early = True
left_untouched = 0

mod = torch.tensor(12)

interp_frames = 6#12
freeze_frames = 0#6

bugs = torch.zeros([bug_count], dtype=t_clockpos)
untouched = torch.ones([bug_count, mod], dtype=t_bool)
indices = torch.arange(bug_count)

untouched[indices, (bugs).long()] = 0 # bugs[x] = y   ->   untouched[x,y] = 0

# a ladybug starts at position 12 on a clock (equiv. to 0)
# every timestep, the bug moves w/ equal probability one direction or the other
# goal is to be able to empirically answer questions about the probability of
# various events

scale = 2**10

origin = 0,0
span = 3,3
zooms = []
stretch = 1,1

mapping = map_space(origin, span, zooms, stretch, scale)


grid = cgrid(mapping)

tau = 3.14159265358979323 * 2
tick_angle = tau / mod

circle = (grid.abs() - 1).abs() / 0.007
circle = circle.to(t_real).clamp(0,1)

#bigger_circle = (grid.abs() - 1).abs() / 0.02
#bcircle = bigger_circle.to(t_real).clamp(0,1)

circles = torch.zeros_like(circle)
for n in range(1,mod):
    c = (grid.abs() - (0.2 + 0.8 * n / mod)).abs() / 0.007
    circles += 1 - (c.to(t_real)).clamp(0,1)

circles.clamp(0,1)

ticks_a = 1 - (torch.remainder(grid.angle() + tau / 4, tick_angle) / 0.005)
ticks_b = 1 + (tick_angle - torch.remainder(grid.angle() + tau / 4, tick_angle) / 0.005)
ticks = ticks_a.clamp(0,1) + ticks_b.clamp(0,1)
ticks *= grid.abs()
ticks = ticks.clamp(0,1)

clock = (1 - circle) + ticks
clock = clock.clamp(0,1)

offsets = torch.randn([bug_count], dtype=t_comp) * 0.3
offsets.real *= 0.075 * 1
offsets.imag *= tick_angle * 0.8 * 0.5

colors = torch.ones([3, bug_count], dtype=t_real) * 0.1
colors[1] = 0



def main():
    schedule(run, None)

def clocktest():
    #csave(grid, f"{run_dir}/foo")
    #msave(circle.to(t_real), f"{run_dir}/circ")
    #msave(bcircle.to(t_real), f"{run_dir}/bcirc")
    #msave(ticks.to(t_real), f"{run_dir}/foo")
    #msave(clock.to(t_real), f"{run_dir}/clock")
    global bugs
    bugs += 1

    bug_angles = bugs * tick_angle

    points = torch.zeros([2, bug_count], dtype=t_real) * 0.1
    points[0] = - torch.cos(bug_angles)
    points[1] = torch.sin(bug_angles)
    points[0] += offsets.real
    points[1] += offsets.imag

    canvas = torch.zeros([3, scale, scale], dtype=t_real)
    draw_points_2d(points, colors, canvas, mapping)
    save(1 - (canvas + clock * 0.5 + circles * 0.25), f"{run_dir}/canv")

def lerp(a, b, t):
    return a * (1 - t) + b * t

prog_scale = 2.6
base_scale = -1.4

def run():
    global bugs
    global untouched

    finished_all = False

    frame_index = 0

    long_finished_mask = untouched.sum(dim=1) == left_untouched

    for iteration in range(max_timesteps):
        pre_finished_mask = untouched.sum(dim=1) == left_untouched
        bug_angles = bugs * tick_angle

        progress = (mod - untouched.sum(dim=1)) / mod
        bug_mags = torch.ones_like(bug_angles) * base_scale
            + progress * prog_scale
            + long_finished_mask * 0.2

        # even odds of moving in either direction
        rng = torch.rand([bug_count], dtype=t_real)
        coinFlip = (rng < 0.5)
        movement = (coinFlip * 2) - 1 # 0 -> -1, 1 -> 1

        bugs_next = bugs.clone()

        if exit_early:
            bugs_next += movement * ~pre_finished_mask
        else:
            bugs_next += movement

        bug_next_angles = bugs_next * tick_angle
        bugs_next = torch.remainder(bugs_next, mod)

        untouched_next = untouched.clone()
        untouched_next[indices, (bugs_next).long()] = 0

        progress_next = (mod - untouched_next.sum(dim=1)) / mod

        finished_mask = untouched_next.sum(dim=1) == left_untouched
        bug_next_mags = torch.ones_like(bug_angles) * base_scale
            + progress_next * prog_scale
            + pre_finished_mask * 0.2



        for t_index in range(interp_frames + 2):
            t = t_index / (interp_frames + 1)

            interp_untouched = lerp(untouched.sum(dim=1), untouched_next.sum(dim=1), t)
            color_ang = (tau / 4) * (1 + interp_untouched) / mod
            color_ang = color_ang.to(t_real)
            colors[0] = torch.sin(color_ang) * 0.01
            colors[2] = torch.cos(color_ang) * 0.02

            colors[0,pre_finished_mask] = 0
            colors[1,pre_finished_mask] = 0.02
            colors[2,pre_finished_mask] = 0

            points = torch.zeros([2, bug_count], dtype=t_real) * 0.1

            mags = lerp(bug_mags, bug_next_mags, t) + offsets.real
            angs = lerp(bug_angles, bug_next_angles, t) + offsets.imag

            points[0] = - mags * torch.cos(angs)
            points[1] = mags * torch.sin(angs)
            #points[0] += offsets.real
            #points[1] += offsets.imag

            canvas = torch.zeros([3, scale, scale], dtype=t_real)
            draw_points_2d(points, colors, canvas, mapping)
            n = freeze_frames if t_index == interp_frames + 1 else 1
            for m in range(n):
                #save( (canvas + clock * 0.5 + circles * 0.25),
                #    f"{run_dir}/{frame_index:05d}")
                save( (canvas ), f"{run_dir}/{frame_index:05d}")
                frame_index += 1





        ongoing_count = bug_count - finished_mask.sum()
        #print(f"t={iteration}: {ongoing_count} bugs still going")
        if ongoing_count == 0:
            finished_all = True
            if exit_early:
                break
        long_finished_mask = long_finished_mask | pre_finished_mask
        untouched = untouched_next
        bugs = bugs_next

    if not finished_all:
        print("NOT ALL BUGS FINISHED IN THE ALOTTED TIME. FAILED EXPERIMENT.")

    #readable = [row.nonzero(as_tuple=True)[0].tolist() for row in untouched]
    #for row in readable:
    #    print(row)
    total  = untouched.sum(dim=0)
    proportions = totals / totals.sum()

    print(f"last clock position of {bug_count} ladybugs:")

    for index, proportion in enumerate(proportions.tolist()):
        if index == 0:
            continue
        percent = proportion * 100
        print(f"{index:>3}: {percent:>5.2f} %")
    print(f" 12:  0.00 % (starting position)")


