
import torch

if not torch.cuda.is_available():
    raise RuntimeError("cudacanvas requires torch with CUDA")

#import glfw

from . import cudacanvas_cpp as _cpp

_cpp.init()

class Window:
    def __init__(self):
        self._handle = _cpp.createWindow()
        self._done = False

    def close(self):
        if not self._done:
            _cpp.closeWindow(self._handle)
            self._done = True

    def __del__(self):
        self.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

