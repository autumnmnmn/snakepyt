
from math import tau

import torch

from lib.spaces import map_space, draw_points_2d, dotted_lines_2d, center_span, grid
from lib.util import save

def init():
    t_real = torch.double
    torch.set_default_device("cuda")

    scale = 2 ** 12

    #r = 1

    #c,s = center_span((-r,r),(-r,r))
    c = (0, -0.5)
    s = (1,1)

    mapping = map_space(c, s, [], (1,1), scale)
    _, (h,w) = mapping

    canvas = torch.zeros([3,h,w], dtype=t_real)

    schedule(test0, None)


def test0():
    global canvas
    inner_scale = 50
    points = torch.rand([2, 2, inner_scale ** 2], dtype=t_real)
    colors = torch.ones([3], dtype=t_real)
    r = colors.clone()
    r[1] = 0
    r[2] = 0

    points[0] = grid(map_space(c, s, [], (1,1), inner_scale)).permute(2,0,1).view(2, inner_scale**2)
    points[1] = points[0]
    points[1,0] += s[1] / inner_scale

    #p = points[0].clone()

    #draw_points_2d(points[0], r, canvas, mapping)
    #save(canvas, f"{run_dir}/test")

    _points = points.clone()

    dotted_lines_2d(_points, colors, 100, canvas, mapping)
    #draw_points_2d(_points[0], r, canvas, mapping)
    save(canvas, f"{run_dir}/{0:06d}")

    for n in range(24 * 6):
        p = _points

        mult = 1 + (p[:,0]) / (p[:,0] * p[:,0] + p[:,1] * p[:,1])
        points[:,0] = p[:,0] * mult - 0.804
        points[:,1] = p[:,1] * mult
        #p = points[1]

        _points[0] = points[0]
        _points[1] = points[1]

        #_points[1] /= _points[1].norm(p=2,dim=0)
        #_points[1] /= inner_scale / s[0]
        #points[1] *= 10
        #_points[1] += _points[0]
        canvas *= 0
        dotted_lines_2d(_points, colors, 100, canvas, mapping)
        #draw_points_2d(_points[0], r, canvas, mapping)
        save(canvas, f"{run_dir}/{n+1:06d}")


    #dotted_lines_2d(points, colors, 30, canvas, mapping)
    #draw_points_2d(points[0], r, canvas, mapping)

    #save(canvas, f"{run_dir}/canvas")

