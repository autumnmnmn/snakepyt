
import warnings

from dataclasses import dataclass
from math import tau
from collections import deque
from typing import Callable

# OkLab Magic Numbers from:
# Ottosson, Björn "A perceptual color space for image processing"
# https://bottosson.github.io/posts/oklab/
# https://web.archive.org/web/20260211105104/https://bottosson.github.io/posts/oklab/
# http://archive.today/2026.01.05-021858/https://bottosson.github.io/posts/oklab/

try:
    import torch
    from torch import Tensor
except ImportError:
    warnings.warn(
        "PyTorch is not installed; color_torch module definitions skipped.",
        ImportWarning,
        stacklevel=2
    )
else:

    def _cbrt(x: Tensor) -> Tensor:
        # torch.pow(x, 1/3) gives nan for negatives (relevant for out-of-gamut LMS)
        return torch.sign(x) * torch.abs(x).pow(1.0 / 3.0)

    # From IEC 61966-2-1 5.2 Eqns (5) and (6)
    def _linearize(value: Tensor) -> Tensor:
        # torch.where evaluates both branches eagerly; no nan risk here since
        # both branches are defined for all real inputs in normal gamut
        return torch.where(
            value <= 0.04045,
            value / 12.92,
            ((value + 0.055) / 1.055).pow(2.4)
        )

    # IEC 61966-2-1 5.3 Eqns (9) and (10)
    def _nonlinearize(value: Tensor) -> Tensor:
        return torch.where(
            value <= 0.0031308,
            value * 12.92,
            1.055 * value.pow(1.0 / 2.4) - 0.055
        )

    @dataclass
    class NonlinearSRGB:
        red: Tensor
        green: Tensor
        blue: Tensor

        @property
        def r(self): return self.red

        @property
        def g(self): return self.green

        @property
        def b(self): return self.blue

        def to_linear_srgb(self) -> LinearSRGB:
            return LinearSRGB(
                red   = _linearize(self.red),
                green = _linearize(self.green),
                blue  = _linearize(self.blue)
            )

        def stack(self):
            return torch.stack((self.red, self.green, self.blue))

    @dataclass
    class LinearSRGB:
        red: Tensor
        green: Tensor
        blue: Tensor

        @property
        def r(self): return self.red

        @property
        def g(self): return self.green

        @property
        def b(self): return self.blue

        def to_nonlinear_srgb(self) -> NonlinearSRGB:
            return NonlinearSRGB(
                red   = _nonlinearize(self.red),
                green = _nonlinearize(self.green),
                blue  = _nonlinearize(self.blue)
            )

        def to_oklab(self) -> OkLab:
            # long/medium/short cone cell responsivity types
            long   = 0.4122214708*self.red + 0.5363325363*self.green + 0.0514459929*self.blue
            medium = 0.2119034982*self.red + 0.6806995451*self.green + 0.1073969566*self.blue
            short  = 0.0883024619*self.red + 0.2817188376*self.green + 0.6299787005*self.blue

            long   = _cbrt(long)
            medium = _cbrt(medium)
            short  = _cbrt(short)

            return OkLab(
                lightness   = 0.2104542553*long + 0.7936177850*medium - 0.0040720468*short,
                green_red   = 1.9779984951*long - 2.4285922050*medium + 0.4505937099*short,
                blue_yellow = 0.0259040371*long + 0.7827717662*medium - 0.8086757660*short
            )

        def to_cie_xyz(self) -> CIEXYZ:
            return CIEXYZ(
                x = 0.4124*self.red + 0.3576*self.green + 0.1805*self.blue,
                y = 0.2126*self.red + 0.7152*self.green + 0.0722*self.blue,
                z = 0.0193*self.red + 0.1192*self.green + 0.9505*self.blue
            )

    @dataclass
    class OkLab:
        lightness: Tensor
        green_red: Tensor    # negative=green, positive=red
        blue_yellow: Tensor  # negative=blue, positive=yellow

        @property
        def L(self): return self.lightness

        @property
        def a(self): return self.green_red

        @property
        def b(self): return self.blue_yellow

        def to_linear_srgb(self) -> LinearSRGB:
            long   = self.lightness + 0.3963377774*self.green_red + 0.2158037573*self.blue_yellow
            medium = self.lightness - 0.1055613458*self.green_red - 0.0638541728*self.blue_yellow
            short  = self.lightness - 0.0894841775*self.green_red - 1.2914855480*self.blue_yellow

            long   = long   ** 3
            medium = medium ** 3
            short  = short  ** 3

            return LinearSRGB(
                red   =  4.0767416621*long - 3.3077115913*medium + 0.2309699292*short,
                green = -1.2684380046*long + 2.6097574011*medium - 0.3413193965*short,
                blue  = -0.0041960863*long - 0.7034186147*medium + 1.7076147010*short
            )

        def to_oklch(self) -> OkLch:
            return OkLch(
                lightness = self.lightness,
                chroma    = torch.sqrt(self.green_red**2 + self.blue_yellow**2),
                hue       = torch.atan2(self.blue_yellow, self.green_red)
            )

    @dataclass
    class OkLch:
        lightness: Tensor
        chroma: Tensor
        hue: Tensor

        @property
        def L(self): return self.lightness

        @property
        def c(self): return self.chroma

        @property
        def h(self): return self.hue

        def to_oklab(self) -> OkLab:
            return OkLab(
                lightness   = self.lightness,
                green_red   = self.chroma * torch.cos(self.hue),
                blue_yellow = self.chroma * torch.sin(self.hue)
            )

    @dataclass
    class CIEXYZ:  # CIE 1931 XYZ
        x: Tensor
        y: Tensor
        z: Tensor

        def to_linear_srgb(self) -> LinearSRGB:
            return LinearSRGB(
                red   =  3.2406*self.x - 1.5372*self.y - 0.4986*self.z,
                green = -0.9689*self.x + 1.8758*self.y + 0.0415*self.z,
                blue  =  0.0557*self.x - 0.2040*self.y + 1.0570*self.z
            )

    def oklch_helix_map(
        lightness: float | tuple[float, float] = (0.2, 0.9),
        chroma: float | tuple[float, float] = 0.1,
        hue_start: float = 0.0,
        rotations: float = 1.0
    ):
        """returns a function [0,1] -> OkLch tracing a helix through oklch space.
        lightness ramps linearly, chroma interpolates, hue sweeps rotations*2π."""
        lightness_start, lightness_end = lightness if isinstance(lightness, tuple) else (lightness, lightness)
        chroma_start, chroma_end       = chroma    if isinstance(chroma,    tuple) else (chroma,    chroma)

        def sample(t: Tensor) -> OkLch:
            return OkLch(
                lightness = lightness_start + t * (lightness_end - lightness_start),
                chroma    = chroma_start    + t * (chroma_end    - chroma_start),
                hue       = hue_start       + t * rotations * tau
            )
        return sample

    _CONVERSION_EDGES: dict[type, list[tuple[type, Callable]]] = {
        NonlinearSRGB: [
            (LinearSRGB, lambda x: x.to_linear_srgb()),
        ],
        LinearSRGB: [
            (NonlinearSRGB, lambda x: x.to_nonlinear_srgb()),
            (OkLab,         lambda x: x.to_oklab()),
            (CIEXYZ,        lambda x: x.to_cie_xyz()),
        ],
        OkLab: [
            (LinearSRGB, lambda x: x.to_linear_srgb()),
            (OkLch,      lambda x: x.to_oklch()),
        ],
        OkLch: [
            (OkLab, lambda x: x.to_oklab()),
        ],
        CIEXYZ: [
            (LinearSRGB, lambda x: x.to_linear_srgb()),
        ],
    }

    def color_map(source: type, target: type) -> Callable:
        """Returns a function converting instances of `source` to `target`
        by chaining the shortest path of conversion calls."""
        if source is target:
            return lambda x: x

        queue = deque([(source, [])])
        visited = {source}

        while queue:
            node, path = queue.popleft()
            for neighbor, convert in _CONVERSION_EDGES.get(node, []):
                new_path = path + [convert]
                if neighbor is target:
                    def chain_fn(x, p=new_path):
                        for f in p:
                            x = f(x)
                        return x
                    return chain_fn
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, new_path))

        raise ValueError(f"no conversion path: {source.__name__} -> {target.__name__}")

