
class AttrDict(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            raise AttributeError(key)

    def __setattr__(self, key, value):
        self[key] = value

    def __getattribute__(self, key):
        """shadowing dict attributes :D"""
        try:
            return self[key]
        except KeyError:
            return super().__getattribute__(key)

    def __delattr__(self, key):
        del self[key]

def proxy(get):
    class Proxy:
        def __getattribute__(self, key):
            return getattr(get(), key)
        def __setattr__(self, key, value):
            setattr(get(), key, value)
        def __delattr__(self, key):
            delattr(get(), key)
        def __getitem__(self, key):
            return get()[key]
        def __setitem__(self, key, value):
            get()[key] = value
        def __delitem__(self, key):
            del get()[key]
        def __contains__(self, key):
            return key in get()
        def __iter__(self):
            return iter(get())
        def __len__(self):
            return len(get())
        def __repr__(self):
            return repr(get())
    return Proxy()

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

_base_exception_attrs = set(dir(BaseException))

def extra_exception_data(e):
    return {
        key: getattr(e, key, None) for key in dir(e)

        if key not in _base_exception_attrs

        and not key.startswith('_')

        and getattr(e, key, None) is not None

        and not callable(getattr(e, key, None))
    }



