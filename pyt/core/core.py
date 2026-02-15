
class AttrDict(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            raise AttributeError(key)

    def __setattr__(self, key, value):
        self[key] = value

    def __delattr__(self, key):
        del self[key]

class Errs(type):
    def __iter__(_class):
        return iter((k,v) for (k,v) in vars(_class).items() if not k.startswith("_"))

    def __repr__(_class):
        return str(list(k for (k,v) in _class))

def errs(errs):
    def _errs(fn):
        fn.errs = errs
        return fn
    return _errs

def lsnap(s: str, delimiter=' '):
    parts = s.lstrip().split(delimiter, 1)
    return (parts[0].rstrip(), parts[1].lstrip() if len(parts) > 1 else "")

