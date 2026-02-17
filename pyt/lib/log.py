
import time

class Timer(object):
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.t = time.perf_counter()

    def __exit__(self, *args):
        print(f"{self.name}: {time.perf_counter() - self.t}")

