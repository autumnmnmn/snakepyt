
import random

_smiles = {
    ":)": 8.0, ":3": 5.0, ":D": 4.0,
    "c:": 0.3, "^^": 1.0, "^_^": 1.0,
    "<3": 3.0,
}

_laughs = {
    "haha": 1.0, "lol": 1.0, "lmao": 1.0,
    "hehe": 1.0, "ha": 1.0,
}

_hellos = {
    "hello": 1.0, "hi": 1.0, "hiya": 1.0,
    "hey": 1.0, "hiii": 1.0,
}

def _get_sampler(weighted_strs: dict[str, float]):
    keys = list(weighted_strs.keys())
    return lambda: random.choices(keys, weights=weighted_strs.values(), k=1)[0]

smile = _get_sampler(_smiles)
laugh = _get_sampler(_laughs)
hello = _get_sampler(_hellos)

maybe_emote = _get_sampler({"": 10.0, **_smiles, **_hellos, "lmao": 0.0})

