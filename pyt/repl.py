
import os

from argparse import ArgumentParser as ArgParser

from pyt.lib.core import PytSession

parser = ArgParser("snakepyt")
PytSession.define_cli_args(parser)

cli_args = parser.parse_args()
session = PytSession(cli_args)

def main():
    try:
        username = os.getlogin()
    except:
        username = None
    session.log(f"hello {username}! <3" if username else "hello! <3")
    session.log.blank()

    while session.repl_continue:
        try:
            message = session.log.input(username)
        except (KeyboardInterrupt, EOFError):
            session.log.blank().log("goodbye <3").blank()
            session.repl_continue = False
            continue

        if "prefix" in session.persistent_state:
            message = " ".join([session.persistent_state["prefix"], message])

        session.handle_message(message.lstrip())

if __name__ == "__main__":
    main()

