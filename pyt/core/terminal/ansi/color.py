
from pyt.core.color import OkLab

# TODO:
# everything gets mapped to oklab, oklab maps to each color support tier

def Color256_from_rgb(o: ColorRGB):
    # Values from BT.709-6 3.2 "Derivation of luminance signal"
    # consider attempting to dynamically choose hardware-appropriate luminance calculation
    y = 0.2126*o.r + 0.7152*o.g + 0.0722*o.b

    # Values from BT.709-6 3.3 "Derivation of colour-difference signal"
    cb = (o.b - y) / 1.8556
    cr = (o.r - y) / 1.5748
    colorfulness = math.sqrt(cb**2 + cr**2)

    # arbitrary value. TODO: test and tune this
    if colorfulness < (255 / 15):
        return Gray24.from_y(y)

    return Color216.from_rgb(o)

@dataclass(frozen=True)
class ColorRGB:
    r: int; g: int; b: int # 0-255 each

@dataclass(frozen=True)
class Color216:
    r: int; g: int; b: int  # 0-5 each

    @staticmethod
    def from_rgb(o: ColorRGB) -> Color216:
        return Color216(round(o.r/51), round(o.g/51), round(o.b/51))

@dataclass(frozen=True)
class Gray24:
    level: int  # 0-23, maps to xterm indices 232-255

    @staticmethod
    def from_y(y) -> Gray24:
        return Gray24(round((y * 23) / 255))

@dataclass(frozen=True)
class Color8Bright:
    index: int  # 0-7

    @staticmethod
    def from_216(o: Color216) -> Color8Bright:
        # assume xterm palette
        pass

    @staticmethod
    def from_24(o: Gray24) -> Color8Bright:
        # assume xterm palette
        pass

@dataclass(frozen=True)
class Color8:
    index: int  # 0-7

    @staticmethod
    def from_8bright(o: Color8Bright) -> Color8:
        # maybe get fancier about this, prevent gray -> black for example
        return Color8(o.index)

    @staticmethod
    def from_216(o: Color216) -> Color8:
        # assume xterm palette, find nearest
        pass

    @staticmethod
    def from_24(o: Gray24) -> Color8:
        # assume xterm palette
        pass

Color16 = Color8Bright | Color8
Color256 = Color216 | Gray24 | Color16

