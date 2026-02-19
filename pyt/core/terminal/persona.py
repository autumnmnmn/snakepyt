
import random

from dataclasses import dataclass, field

_none = lambda: field(default_factory=lambda: { "": 1.0 })

@dataclass(frozen=True)
class PersonaConfig:
    smiles: dict[str, float] = _none()
    laughs: dict[str, float] = _none()
    hellos: dict[str, float] = _none()

default = PersonaConfig(
    smiles = {
        ":)": 8.0, ":3": 5.0, ":D": 4.0,
        "c:": 0.3, "^^": 1.0, "^_^": 1.0,
        "<3": 3.0,
    },
    laughs = {
        "haha": 1.0, "lol": 1.0, "lmao": 1.0,
        "hehe": 1.0, "ha": 1.0,
    },
    hellos = {
        "hello": 1.0, "hi": 1.0, "hiya": 1.0,
        "hey": 1.0, "hiii": 1.0,
    }
)

professional = PersonaConfig(
    smiles = {
        "": 1.0
    },
    laughs = {
        "": 1.0
    },
    hellos = {
        "hello": 1.0
    }
)

def _get_sampler(weighted_strs: dict[str, float]) -> Callable[[], str]:
    keys = list(weighted_strs.keys())
    return lambda: random.choices(keys, weights=weighted_strs.values(), k=1)[0]

@dataclass(frozen=True)
class Persona:
    smile: Callable[[], str] = lambda: ""
    laugh: Callable[[], str] = lambda: ""
    hello: Callable[[], str] = lambda: ""

    def from_config(config):
        return Persona(
            smile = _get_sampler(config.smiles),
            laugh = _get_sampler(config.laughs),
            hello = _get_sampler(config.hellos)
        )

#maybe_emote = _get_sampler({"": 10.0, **_smiles, **_hellos, "lmao": 0.0})

