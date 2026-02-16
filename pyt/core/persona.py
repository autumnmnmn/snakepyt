
# TODO: weighted RNG; replace (list str) with (dict str->weight),
# precompute a single looping rng buffer w/ like, 101 entries of randoms in [0,1)
# normalize weights of each dict during startup
# iterator will take the next rng val, run thru the dict keys subtracting their value,
# stop when it hits / passes 0

_smiles = [":)", ":3", ":D", "c:", "^^", "^_^", "<3"]
_laughs = ["haha", "lol", "lmao", "hehe", "ha"]
_hellos = ["hello", "hi", "hiya", "hey", "hiii"]

def _iterate(items):
    i = 0
    n = len(items)
    while True:
        i = (i + 1) % n
        yield items[i]

smiles = _iterate(_smiles)
laughs = _iterate(_laughs)
hellos = _iterate(_hellos)

