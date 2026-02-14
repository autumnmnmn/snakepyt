
import os
from argparse import ArgumentParser as ArgParser

from pyt.lib.log import Logger
from pyt.lib.core import AttrDict, handle_message, try_handle_command

parser = ArgParser("snakepyt")
args = parser.parse_args()

_global = AttrDict()
_global.snakepyt_version = (0, 2)

_global.persistent_state = {}
_global.persistent_hashes = {}

try:
    username = os.getlogin()
except:
    username = None

_global.log = Logger().mode("success").tag("snakepyt")

_global.repl_continue = True

_global.pyt_out = os.getenv("PYT_OUT", "pyt/out")
_global.pyt_in = os.getenv("PYT_IN", "pyt/in")
_global.pyt_sketch = os.getenv("PYT_SKETCH", "pyt/sketch")

_global.try_handle_command = lambda command, remainder: try_handle_command(_global, command, remainder)
_global.handle_message = lambda message: handle_message(_global, message)

def main():
    _global.log(f"hello {username}! <3" if username else "hello! <3")
    _global.log.blank()

    while _global.repl_continue:
        try:
            message = _global.log.input(username)
        except (KeyboardInterrupt, EOFError):
            _global.log.blank().log("goodbye <3").blank()
            _global.repl_continue = False
            continue

        if "prefix" in _global.persistent_state:
            message = " ".join([_global.persistent_state["prefix"], message])

        _global.handle_message(message.lstrip())

if __name__ == "__main__":
    main()

