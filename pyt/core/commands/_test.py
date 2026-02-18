
from argparse import ArgumentParser

from pyt.core.commands.commands import registrar_attr

_builtins = []
_builtin = registrar_attr(_builtins)

def register_builtins(group):
    group += _builtins

@_builtin("kitty")
def cmd_kitty(session, args):
    import sys, os, termios, tty, select

    timeout = 0.1

    if not sys.stdin.isatty():
        return False

    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        os.write(sys.stdout.fileno(), b"\x1b[?u") # ask for kitty flags

        if not select.select([fd], [], [], timeout)[0]:
            return False

        resp = os.read(fd, 16)
        print(resp.startswith(b"\x1b[?") and resp.endswith(b"u"))
        return
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
    print(False)

test_parser = ArgumentParser("test")
test_parser.add_argument("--foo", dest="bar", type=str, default="baz")

@_builtin("test", arg_parser=test_parser)
def cmd_test(session, args):
    session.log(args.bar)

@_builtin("crash")
def cmd_crash(session, args):
    raise Exception("crashing on purpose >:3")

