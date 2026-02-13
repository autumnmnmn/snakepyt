
import re
import json

from dataclasses import dataclass
from typing import List, Dict

from lib.core import AttrDict

def chatEntry(role: str, content: str) -> AttrDict:
    return AttrDict({"role": role, "content": content})

class Collector:
    def __init__(self, name=None):
        self.name = name

    def collect(self, line):
        pass

    def finalize(self):
        pass

class LiteralCollector(Collector):
    def __init__(self, name):
        super().__init__(name)
        self.lines = []

    def collect(self, line):
        self.lines.append(line)

    def finalize(self):
        result = ""
        in_blank_run = False
        for line in self.lines:
            if line == "":
                in_blank_run = True
            else:
                if result:
                    result += '\n\n' if in_blank_run else ' '
                result += line
                in_blank_run = False
        return result

class ChatCollector(Collector):
    def __init__(self, name):
        super().__init__(name)
        self.chat = []
        self.current_collector = Collector()

    def collect(self, line):
        if line in ['.user:', '.system:', '.assistant:']:
            role = line[1:-1]
            if self.current_collector.name is not None:
                self.chat.append(chatEntry(
                    self.current_collector.name,
                    self.current_collector.finalize()
                ))
            self.current_collector = LiteralCollector(role)
        else:
            self.current_collector.collect(line)

    def finalize(self):
        if self.current_collector.name is not None:
            self.chat.append(chatEntry(
                self.current_collector.name,
                self.current_collector.finalize()
            ))
        return self.chat

def apply_substitutions(source, substitutions: Dict):
    if isinstance(source, str):
        def replacer(match):
            key = match.group(1)
            if key not in substitutions:
                print(f"Substitution error, missing {key}.")
                return ""
            return json.dumps(substitutions[key], indent=4)
        return re.sub(r'\$\{\s*([^}]+?)\s*\}', replacer, source)
    elif isinstance(source, list):
        return [
            chatEntry(entry.role, apply_substitutions(entry.content, substitutions))
            for entry in source
        ]
    else:
        raise TypeError(f"source must be str or list of chatEntry, got {type(source)}")

def read_chatlog(text: str) -> Dict:
    lines = text.split('\n')
    if (len(lines) < 3 or lines[0] != '' or
        not lines[1].startswith('chatlog ') or lines[2] != ''):
        raise ValueError('invalid chatlog header')

    chatlog = {}
    collector = Collector()

    for line in lines[3:]:
        if line.startswith(".chat "):
            name = line[6:]
            if collector.name is not None:
                chatlog[collector.name] = collector.finalize()
            collector = ChatCollector(name)
        elif line.startswith(".literal "):
            name = line[9:]
            if collector.name is not None:
                chatlog[collector.name] = collector.finalize()
            collector = LiteralCollector(name)
        else:
            collector.collect(line)

    if collector.name is not None:
        chatlog[collector.name] = collector.finalize()

    return chatlog

def load_chatlog(filepath: str) -> AttrDict:
    with open(filepath, 'r') as f:
        return AttrDict(read_chatlog(f.read()))

