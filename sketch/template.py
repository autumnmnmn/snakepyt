
import torch

seeds = [1,2,0]

def settings_0():
    t = torch.ones(1)
    word = ["foo", "bar"][seed]
    seeds = "abc"

def settings_1():
    combo = f"{word} {seed}"
    seeds = [True, False]

def settings_2():
    pi = 3 if seed else 4

def run():
    if pi == 4: raise Exception("pi != 4")
    print(f"{combo}")

