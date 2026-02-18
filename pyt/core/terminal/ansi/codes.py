
from pathlib import Path

def ansi(*sequence, end="m"):
    return f"\033[{';'.join(sequence)}{end}"

_basic_colors = [
    "black", "red", "green", "yellow",
    "blue", "magenta", "cyan", "white",
    "default"
]

_color_digits = {
    k: i for (i,k) in enumerate(_basic_colors)
}

_hex_color = lambda i,j,k: f"#{i:02x}{j:02x}{k:02x}"

# 256-color palette
fg256 = lambda n: f"38;5;{n}"
bg256 = lambda n: f"48;5;{n}"

# bright colors (90-97 fg, 100-107 bg)
bright_fg = lambda color: f"9{_color_digits[color]}"
bright_bg = lambda color: f"10{_color_digits[color]}"
# or as constants:
bright_black = ansi("90")
bright_red = ansi("91")
bright_green = ansi("92")
bright_yellow = ansi("93")
bright_blue = ansi("94")
bright_magenta = ansi("95")
bright_cyan = ansi("96")
bright_white = ansi("97")

# 6x6x6 rgb cube
cube216 = lambda r, g, b: 16 + 36*r + 6*g + b

# level ∈ [0,23]
gray24 = lambda level: 232 + level


# color:
# fg = 3
# bg = 4
# fg bright = 9
# bg bright = 10

def fg(color):
    if isinstance(color, str):
        if color.startswith("#"):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            return f"38;2;{r};{g};{b}"
        return f"3{_color_digits[color]}"
    return f"3{color}"

def bg(color):
    if isinstance(color, str):
        if color.startswith("#"):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            return f"48;2;{r};{g};{b}"
        return f"4{_color_digits[color]}"
    return f"4{color}"







_modes = [
    "reset", "bold", "dim", "italic",
    "underline", "_unsupported_blink", "_unsupported_blink_rapid", "reverse", "_unsupported_conceal",
    "strike"
]

_mode_digits = {
    k: str(i) for (i,k) in enumerate(_modes)
}

def mode(mode):
    return _mode_digits[mode]


# cursor shapes (DECSCUSR)
cursor_block_blink = ansi("1", end=" q")
cursor_block = ansi("2", end=" q")
cursor_underline_blink = ansi("3", end=" q")
cursor_underline = ansi("4", end=" q")
cursor_beam_blink = ansi("5", end=" q")
cursor_beam = ansi("6", end=" q")

insert_lines = lambda n=1: ansi(str(n), end="L")
delete_lines = lambda n=1: ansi(str(n), end="M")

reset_bold_dim = ansi("22")
reset_italic = ansi("23")
reset_underline = ansi("24")
reset_reverse = ansi("27")
reset_strike = ansi("29")

enable_app_keypad = ansi(end="=")
disable_app_keypad = ansi(end=">")





# hyperlinks
link = lambda url, text: f"\033]8;;{url}\033\\{text}\033]8;;\033\\"

def file_link(path, full=False, line=None, text=None):
    if isinstance(path, str):
        path = Path(path)
    text = text if text else (path if full else path.name)
    if line:
        return link(f"file://{path}#{line}", f"{text} {line}")
    return link(f"file://{path}", text)

# bracketed paste
enable_bracketed_paste = ansi("?2004", end="h")
disable_bracketed_paste = ansi("?2004", end="l")

# cursor position query
query_cursor_position = ansi("6", end="n")
# response format: \033[{row};{col}R

# set_scroll_region = lambda top, bottom: ansi(str(top), str(bottom), end="r")
# reset_scroll_region = ansi(end="r")

# line wrap
enable_line_wrap = ansi("?7", end="h")
disable_line_wrap = ansi("?7", end="l")

# focus events
enable_focus_events = ansi("?1004", end="h")
disable_focus_events = ansi("?1004", end="l")






reset = ansi(_mode_digits["reset"])
clear_line = ansi("0", end="K")
clear_line_left = ansi("1", end="K")
clear_line_full = ansi("2", end="K")
clear_screen = ansi("2", end="J")
clear_from_cursor = ansi("0", end="J")
clear_to_cursor = ansi("1", end="J")
clear_end = ansi(end="K")

save_cursor = ansi(end="s")
restore_cursor = ansi(end="u")
hide_cursor = ansi("?25", end="l")
show_cursor = ansi("?25", end="h")

enter_alt_screen = ansi("?1049", end="h")
exit_alt_screen = ansi("?1049", end="l")

enable_mouse = ansi("?1003", end="h") + ansi("?1006", end="h")
disable_mouse = ansi("?1003", end="l") + ansi("?1006", end="l")

def set_title(title):
    return ansi(0, title, end='\007')


def move_to(x, y):
    return ansi(y, x, end="H")

def move_up(n=1):
    return ansi(str(n), end="A")

def move_down(n=1):
    return ansi(str(n), end="B")

def move_right(n=1):
    return ansi(str(n), end="C")

def move_left(n=1):
    return ansi(str(n), end="D")

def move_to_column(x):
    return ansi(str(x), end="G")

# Mouse button constants
MOUSE_LEFT = 0
MOUSE_MIDDLE = 1
MOUSE_RIGHT = 2
MOUSE_MOVE = 35
MOUSE_SCROLL_UP = 64
MOUSE_SCROLL_DOWN = 65

# Modifier flags (can be combined)
MOD_SHIFT = 4
MOD_META = 8
MOD_CTRL = 16

ESCAPES = {
    '\033[A': 'up',
    '\033[B': 'down',
    '\033[C': 'right',
    '\033[D': 'left',
    '\033[H': 'home',
    '\033[F': 'end',
    '\033[5~': 'pgup',
    '\033[6~': 'pgdn',
    '\033[2~': 'insert',
    '\033[3~': 'delete',
    '\033OP': 'f1',
    '\033OQ': 'f2',
    '\033OR': 'f3',
    '\033OS': 'f4',
    '\033[15~': 'f5',
    '\033[17~': 'f6',
    '\033[18~': 'f7',
    '\033[19~': 'f8',
    '\033[20~': 'f9',
    '\033[21~': 'f10',
    '\033[23~': 'f11',
    '\033[24~': 'f12',
    '\033[200~': 'paste_start',
    '\033[201~': 'paste_end',
    '\033[I': 'focus_in',
    '\033[O': 'focus_out',
}

# mouse event in SGR mode: \033[<Btn;X;YM or m

# mouse press 35 = mouse move
# mouse press 0 = left
# mouse press 1 = middle
# mouse press 2 = right11
#if buf.startswith('\033[<') and (buf.endswith('M') or buf.endswith('m')):
    #parts = buf[3:-1].split(';')
    #btn, x, y = int(parts[0]), int(parts[1]), int(parts[2])
    #action = 'press' if buf[-1] == 'M' else 'release'

    #if btn >= 64:
    #    print(f"scroll: {'up' if btn == 64 else 'down'} at ({x},{y})")
    #else:
    #    print(f"mouse {action}: button {btn} at ({x},{y})")







def test():

    for fgc in [fg(c) for c in _basic_colors]:
        bgcs = [bg(c) for c in _basic_colors]
        tests = [f"{ansi(fgc,bgc)}test{reset}" for bgc in bgcs]
        print(" ".join(tests))

    for mode in _mode_digits:
        if mode == "reset" or mode.startswith("_"):
            continue
        print(mode)
        md = _mode_digits[mode]
        for fgc in [fg(c) for c in _basic_colors]:
            bgcs = [bg(c) for c in _basic_colors]
            tests = [f"{ansi(fgc,bgc,md)}test{reset}" for bgc in bgcs]
            print(" ".join(tests))




