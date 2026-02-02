
import torch

type fp_range = tuple[float, float]
type fp_region2 = tuple[fp_range, fp_range]
type fp_coords2 = tuple[float, float]
type hw = tuple[int, int]
type region_mapping = tuple[fp_region2, hw]

def draw_points_2d(coords, colors, canvas, mapping):
    (region, hw) = mapping
    (xrange, yrange) = region
    (h,w) = hw
    (x_min, x_max) = xrange
    (y_min, y_max) = yrange

    mask = torch.ones([coords.shape[1]])
    mask *= (coords[1] >= x_min) * (coords[1] <= x_max)
    mask *= (coords[0] >= y_min) * (coords[0] <= y_max)

    in_range = mask.nonzero().squeeze()

    # TODO: combine coord & value tensors so there's only one index_select necessary
    coords_filtered = coords[:, in_range] #torch.index_select(coords, 1, in_range)
    if len(colors.shape) > 1:
        colors_filtered = colors[:, in_range] #torch.index_select(colors, 0, in_range)
    else:
        colors_filtered = colors.unsqueeze(1).expand(colors.shape[0],in_range.shape[0])

    coords_filtered[1] -= x_min
    coords_filtered[1] *= (w-1) / (x_max - x_min)
    coords_filtered[0] -= y_min
    coords_filtered[0] *= (h-1) / (y_max - y_min)
    indices = coords_filtered.long()

    #canvas[:,indices[0],indices[1]] = colors_filtered

    #canvas.index_put_((indices[0],indices[1]), colors_filtered, accumulate=True)


    C, H, W = canvas.shape
    N = indices.shape[1]

    # expand indices for channel dimension
    channel_idx = torch.arange(C, device=canvas.device).unsqueeze(1).expand(-1, N)
    row_idx     = indices[0].unsqueeze(0).expand(C, N)
    col_idx     = indices[1].unsqueeze(0).expand(C, N)

    # now index_put_ with accumulate
    canvas.index_put_((channel_idx, row_idx, col_idx), colors_filtered, accumulate=True)


def dotted_lines_2d(coord_pairs, colors, n_dots, canvas, mapping):
    ((x_min,x_max), (y_min,y_max)), (h,w) = mapping

    for dot in range(n_dots):
        t = dot / (n_dots - 1)

        coords = coord_pairs[0] * t + coord_pairs[1] * (1 - t)
        draw_points_2d(coords, colors, canvas, mapping)

def insert_at_coords(coords, values, target, mapping: region_mapping):
    """deprecated, use draw_points_2d"""
    (region, hw) = mapping
    (xrange, yrange) = region
    (h,w) = hw
    (x_min, x_max) = xrange
    (y_min, y_max) = yrange

    mask = torch.ones([coords.shape[1]])
    mask *= (coords[1] >= x_min) * (coords[1] <= x_max)
    mask *= (coords[0] >= y_min) * (coords[0] <= y_max)
    in_range = mask.nonzero().squeeze()

    # TODO: combine coord & value tensors so there's only one index_select necessary
    coords_filtered = torch.index_select(coords.permute(1,0), 0, in_range)
    values_filtered = torch.index_select(values, 0, in_range)

    coords_filtered[:,1] -= x_min
    coords_filtered[:,1] *= (w-1) / (x_max - x_min)
    coords_filtered[:,0] -= y_min
    coords_filtered[:,0] *= (h-1) / (y_max - y_min)
    indices = coords_filtered.long()

    target.index_put_((indices[:,0],indices[:,1]), values_filtered, accumulate=True)

def center_span(xrange, yrange):
    span = (xrange[1] - xrange[0]), (yrange[1] - yrange[0])
    center = (xrange[0] + span[0] / 2), (yrange[0] + span[1] / 2)
    return center, span

def apply_zooms(origin, span, zooms):
    x_min = origin[0] - (span[0] / 2)
    y_min = origin[1] - (span[1] / 2)

    for ((xa, xb), (ya, yb)) in zooms:
        x_min += span[0] * xa
        y_min += span[1] * ya
        span = span[0] * (xb - xa), span[1] * (yb - ya)

    x_max = x_min + span[0]
    y_max = y_min + span[1]

    return ((x_min, x_max), (y_min, y_max))

def xrange_yrange(center, span):
    xrange = center[0] - span[0], center[0] + span[0]
    yrange = center[1] - span[1], center[1] + span[1]
    return xrange, yrange

# maps a 2d region of space to a canvas
def map_space(origin, span, zooms, target_aspect, scale) -> region_mapping:
    ((x_min, x_max), (y_min, y_max)) = apply_zooms(origin, span, zooms)

    aspect = span[0] / span[1]

    if aspect < 1:
        h = scale
        w = int(scale * aspect)
    else:
        w = scale
        h = int(scale / aspect)

    x_range = (x_min, x_max)
    y_range = (y_min, y_max)
    region = (x_range, y_range)
    return (region, (h,w))

# grid of complex numbers
def cgrid(mapping, ctype=torch.cdouble, dtype=torch.double):
    region, (h, w) = mapping
    (xmin, xmax), (ymin, ymax) = region

    grid = torch.zeros([h, w], dtype=ctype)

    yspace = torch.linspace(ymin, ymax, h, dtype=dtype)
    xspace = torch.linspace(xmin, xmax, w, dtype=dtype)

    for _x in range(h):
        grid[_x] += xspace
    for _y in range(w):
        grid[:, _y] += yspace * 1j

    return grid

def grid(mapping, dtype=torch.double):
    region, (h,w) = mapping
    (xmin, xmax), (ymin, ymax) = region

    grid = torch.zeros([h,w,2], dtype=dtype)

    yspace = torch.linspace(ymin, ymax, h, dtype=dtype)
    xspace = torch.linspace(xmin, xmax, w, dtype=dtype)

    grid[:,:,1] = xspace.expand([h,w])
    grid[:,:,0] = yspace.expand([w,h]).transpose(1,0)

    return grid


