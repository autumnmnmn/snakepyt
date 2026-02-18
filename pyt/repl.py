
import os

from argparse import ArgumentParser

from pyt.core import PytSession
from pyt.core.terminal import persona

parser = ArgumentParser("snakepyt")
PytSession.define_cli_args(parser)

cli_args = parser.parse_args()
session = PytSession(cli_args)

def main():
    try:
        username = os.getlogin()
    except:
        username = ""

    session.log(f"{persona.hello()} {username}! {persona.smile()}" if username else f"{persona.hello()}! {persona.smile()}")
    session.log.blank()

    while session.repl_continue:
        try:
            tag = f"{username}: {session.prefix}" if session.prefix else username + ':'
            message = session.log.input(tag)
        except (KeyboardInterrupt, EOFError, SystemExit):
            session.log.blank().log(f"goodbye {persona.smile()}").blank()
            session.repl_continue = False
            continue

        session.handle_message(message.lstrip())

if __name__ == "__main__":
    main()

