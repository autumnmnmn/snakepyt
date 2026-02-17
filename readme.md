
# 🐍 🐍 🐍

## Snakepyt v0.2

> **snakepit** <sub>/ˈsnāk ˌpit/</sub>
> <sub>*noun* </sub>
>
> a pit full of snakes

A repl and custom runner environment for python scripts, mainly for making various visualizations and simulations using pytorch.

- Can persist portions of state between runs of hot-reloaded sketches (e.g. ML models, large datasets)
- Builtin scheduling utility for performing multidimensional parameter sweeps without manually nesting loops and try-catch blocks
- Drop into a full-featured python repl with access to persisted state
- Core system pulls in zero transitive dependencies

Check out [this sketch template](pyt/core/templates/verbose.py) for a detailed explanation of the sketch format.

Some actual sketches and samples of their outputs can be found in my [sketches repo](https://tangled.org/ponder.ooo/sketches).

This project grew out of my feeling that notebook-based environments were doing much more than I really needed them to, and constraining my workflow into a different shape than felt natural to me. Once the core logic of snakepyt was in place, I felt able to iterate more quickly and freely. Since then, I've been gradually expanding the functionality and sanding off the rough edges. However, there is much left to do in that regard.

There's a WIP static web ui framework here, with a webgpu rendering system. Currently, the web ui doesn't actually interact with the python environment in any way :)

