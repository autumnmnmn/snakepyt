
def ansi(*sequence, end="m"):
    return f"\033[{';'.join(sequence)}{end}"

basic_colors = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "default"]
color_digits = {
    k: i for (i,k) in enumerate(basic_colors)
}

locals().update(color_digits)

modes = ["reset", "bold", "dim", "italic", "underline", "_5", "_6", "_7", "_8", "strike"]
mode_digits = {
    k: str(i) for (i,k) in enumerate(modes)
}

locals().update(mode_digits)

def fg(color):
    if isinstance(color, str):
        if color.startswith("#"):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            return f"38;2;{r};{g};{b}"
        return f"3{color_digits[color]}"
    return f"3{color}"

def bg(color):
    if isinstance(color, str):
        if color.startswith("#"):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            return f"48;2;{r};{g};{b}"
        return f"4{color_digits[color]}"
    return f"4{color}"

reset = ansi(reset)
clear_end = ansi(end="K")

def main():
    for fgc in [fg(c) for c in basic_colors]:
        bgcs = [bg(c) for c in basic_colors]
        tests = [f"{ansi(fgc,bgc)}test{reset}" for bgc in bgcs]
        print(" ".join(tests))

    for mode in mode_digits:
        if mode == "reset" or mode.startswith("_"):
            continue
        print(mode)
        md = mode_digits[mode]
        for fgc in [fg(c) for c in basic_colors]:
            bgcs = [bg(c) for c in basic_colors]
            tests = [f"{ansi(fgc,bgc,md)}test{reset}" for bgc in bgcs]
            print(" ".join(tests))

    import random

    while False:
        gradient = []
        for i in range(256):
            rgb = f"#{i:02x}{j:02x}{255-i:02x}"
            gradient.append(f"{ansi(bg(rgb))}namo amitabha buddha {reset}")

        print("".join(gradient) + ansi(end="K"))

    prev_color = None
    target_color = None

    gradient = []
    while True:
        prev_color = target_color if target_color else [random.randint(0, 255) for _ in range(3)]
        target_color = [random.randint(0, 255) for _ in range(3)]

        for i in range(256):
            r = int(prev_color[0] + (target_color[0] - prev_color[0]) * i / 255)
            g = int(prev_color[1] + (target_color[1] - prev_color[1]) * i / 255)
            b = int(prev_color[2] + (target_color[2] - prev_color[2]) * i / 255)

            rgb = f"#{r:02x}{g:02x}{b:02x}"
            gradient.append(f"{ansi(bg(rgb))}namo amitabha buddha {reset}")

        if len(gradient) > 2**14:

            print("".join(gradient) + ansi(end="K"))
            gradient = []
