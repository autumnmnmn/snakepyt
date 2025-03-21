
def persistent():
    persist = [0]

def init():
    outer = [0]
    schedule(per_idx, [1,0])

def per_idx(idx):
    inner = [0]
    schedule(run, None)

def run():
    persist[0] += 1
    outer[0] += 1
    inner[0] += 1
    print(f"{persist} {outer} {inner}")

