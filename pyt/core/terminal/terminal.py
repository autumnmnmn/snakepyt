
from dataclasses import dataclass

class ColorRGB:
    pass

class Color256:
    pass

class Color216:
    pass

class ColorTerm:
    pass

# TODO: come up with strong type for color and modes, and anything else that gets added here,
# and once all that's done, we can make this a frozen dataclass
class Style:
    def __init__(self):
        self.color = None
        self.modes = [] # list of idk some kinda enum

class StyleChange:
    pass

def _write(stream, text, style):
    # convert style to ansi
    # or if u wanna get real fancy, convert all *style changes* to ansi
    pass

def _flush(stream):
    pass

class _MockOut:
    # TODO do-nothing methods for fake out stream
    pass

class _MockIn:
    # TODO do-nothing methods for fake in stream
    pass

class Terminal:
    """
    Abstract terminal
    """

    _in_stream = None
    _out_streams = None

    def __init__(self, in_stream, out_streams):
        self._in_stream = in_stream if in_stream else _MockIn()
        if not out_streams or len(out_streams) == 0:
            self._out_streams = { "default": _MockOut() }
        else:
            self._out_streams = out_streams
        if "default" not in self._out_streams:
            self._out_streams["default"] = next(iter(out_streams.values()))

        # TODO: figure out what kinds of styling each out stream actually supports
        # including fancy kitty extension stuff! speaking of which, also check if we can
        # get nice kitty-mode input events

        # construct style filters from this

    # TODO: function that turns (Style | None, Style | None) pair into StyleChange | None

    # TODO: function that turns an iterable of (text, Style | None) pairs
    # into an iterable of text | StyleChange

    def write(self, text, style=None, to="default"):
        target = self._out_streams.get(to, None)
        if target is None:
            raise RuntimeError("valid streams: [\"out\", \"err\"]")
        if isinstance(text, list):
            for entry in text:
                _write(target, entry[0], entry[1])
        else:
            _write(target, text, style)
        _flush(target)

    # TODO default link style
    def write_link(self, uri, text, style=None, to="default"):
        # need to handle the case where the link is made up of multiple styles ofc.
        # just means tacking on a wrapper around text and style and passing them thru to
        # write.
        # also need to ensure link capability of the stream tho
        pass

    def query(self, query, on_result, on_timeout=None):
        # wrap ansi queries so that user doesn't have to poll
        # maybe also expose a blocking version? idk
        pass

    def read(self):
        # just the text out of the input queue; kitty makes this easy but oldschool ansi
        # code untangling might be a pain
        pass

    def get_input_events(self, clear=True):
        # access the input event queue. by default, consume it
        # maybe add filtering for which kinds of events the caller cares about
        pass

