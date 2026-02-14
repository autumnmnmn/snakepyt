
def first(l, p):
    return next((idx,value) for idx,value in enumerate(l) if p(value))

# just use itertools.pairwise
def pairs(l):
    return zip(l, l[1:])

def index_where(predicate, _list):
    return next(filter(lambda _tuple: predicate(_tuple[1]), enumerate(_list)))[0]

