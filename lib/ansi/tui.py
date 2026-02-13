
import sys
import tty
import termios
import signal
import shutil

def on_winch(signum, frame):
    cols, rows = shutil.get_terminal_size()
    print(f"\nwindow resized: {cols}x{rows} (cols x rows)")

signal.signal(signal.SIGWINCH, on_winch)

def begin_tui():
    # save terminal state
    old_settings = termios.tcgetattr(sys.stdin)

    # enter raw mode
    tty.setraw(sys.stdin)

    # alternate screen buffer
    sys.stdout.write('\033[?1049h')

    # hide cursor
    sys.stdout.write('\033[?25l')

    # enable mouse (all events + scroll)
    sys.stdout.write('\033[?1003h')  # any motion
    sys.stdout.write('\033[?1006h')  # SGR extended coords

    sys.stdout.flush()

    return old_settings

# mouse press 35 = mouse move
# mouse press 0 = left
# mouse press 1 = middle
# mouse press 2 = right11

# \033[2J = clear screen


def end_tui(old_settings):
    # disable mouse
    sys.stdout.write('\033[?1003l')
    sys.stdout.write('\033[?1006l')

    # show cursor
    sys.stdout.write('\033[?25h')

    # exit alternate screen
    sys.stdout.write('\033[?1049l')

    sys.stdout.flush()

    # restore terminal settings
    termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)


def parse_input():
    """read and print input events until ctrl-c"""
    buf = ""

    while True:
        char = sys.stdin.read(1)
        buf += char

        # mouse event in SGR mode: \033[<Btn;X;YM or m
        if buf.startswith('\033[<') and (buf.endswith('M') or buf.endswith('m')):
            parts = buf[3:-1].split(';')
            btn, x, y = int(parts[0]), int(parts[1]), int(parts[2])
            action = 'press' if buf[-1] == 'M' else 'release'

            if btn >= 64:
                print(f"scroll: {'up' if btn == 64 else 'down'} at ({x},{y})")
            else:
                print(f"mouse {action}: button {btn} at ({x},{y})")
            buf = ""

        # regular key
        elif not buf.startswith('\033'):
            if ord(char) == 3:  # ctrl-c
                raise KeyboardInterrupt
            print(f"key: {repr(char)} (ord {ord(char)})")
            buf = ""

        # escape sequences—if it's getting long and not mouse, dump it
        elif len(buf) > 20:
            print(f"escape: {repr(buf)}")
            buf = ""

old = begin_tui()

try:
    parse_input()
except KeyboardInterrupt:
    pass
finally:
    end_tui(old)




