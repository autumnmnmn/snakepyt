
import math

tau = math.pi * 2

mod = 12

valid_states = set()
collapsed_states = set()
collapse_map = {}

def contains(L,R,P):
    l_positions = range(mod-L, mod + 1)
    r_positions = range(1, R+1)
    valid_P = set(l_positions) | set(r_positions)
    return P in valid_P

# Step 0: build valid states
for L in range(0, mod):
    for R in range(0, mod):
        if L + R < mod - 1:
            l_positions = range(mod-L, mod + 1)
            r_positions = range(1, R+1)
            valid_P = set(l_positions) | set(r_positions)

            collapsed_states.add((L, R, L + R + 1))
            for P in valid_P:
                valid_states.add((L, R, P))
                collapse_map[(L, R, P)] = (L, R, L + R + 1)
        elif L + R == mod - 1:
            for P in range(1, mod):
                valid_states.add(("done", P))

print("Number of valid states:", len(valid_states))

#print(valid_states)

# Step 1: build directed edges
edges = {}  # key: state, value: list of next states
collapsed_edges = {}

for state in valid_states:
    if state[0] == "done":
        edges[state] = (state, [])  # terminal
        continue

    L, R, P = state
    out = []

    # clockwise move
    P1 = (P - 2) % mod + 1

    L1 = L if contains(L,R,P1) else L+1

    if L1 + R < mod - 1:
        if (L1, R, P1) in valid_states:
            out.append((L1, R, P1))
        else:
            print("AAAAAAAA", (L1, R, P1), (L, R, P))
    else:
            out.append(("done", P1))

    # counterclockwise move
    P2 = (P % mod) + 1

    R1 = R if contains(L,R,P2) else R+1
    if L + R1 < mod - 1:
        if (L, R1, P2) in valid_states:
            out.append((L, R1, P2))
        else:
            print("BBBBBBBB", (L, R1, P2), (L, R, P))
    else:
        out.append(("done", P2))

    edges[state] = (state, out)

# Sanity check
outdegrees = [len(v) for (u,v) in edges.values()]
terminal_count = sum(1 for (u,v) in edges.values() if len(v) == 0)
print("Max outdegree:", max(outdegrees))  # should be 2
print("Min outdegree (non-terminal):",
      min([d for s,d in zip(edges.keys(), outdegrees) if s[0] != "done"]))  # should be 2
print("Number of terminal states:", terminal_count)  # 12




for state in valid_states:
    outs = edges[state]
    if len(outs[1]) < 2:
        collapsed_edges[state] = outs
        continue
    outs_of_outs = [edges[out] for out in outs[1]]
    dests_of_ooo = [dests for src, dests in outs_of_outs]
    is_isomorph = [state in dests for dests in dests_of_ooo]
    srcs_of_ooo = [src for src, dests in outs_of_outs]
    if is_isomorph == [True, True]:
        pass
    elif state in collapse_map:
        collapsed = collapse_map[state]
        for dest, is_iso in zip([o for o in outs[1]], is_isomorph):
            if not is_iso:
                if dest in collapse_map:
                    if collapsed in collapsed_edges:
                        collapsed_edges[collapsed][1].append(collapse_map[dest])
                    else:
                        collapsed_edges[collapsed] = (collapsed, [collapse_map[dest]])
                else:
                    if collapsed in collapsed_edges:
                        collapsed_edges[collapsed][1].append(dest)
                    else:
                        collapsed_edges[collapsed] = (collapsed, [dest])
    else:
        print(state, outs, "b")

#print(collapsed_states)
#print(collapsed_edges)



import networkx as nx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

G = nx.DiGraph()

# Add nodes and edges

collapse = False

drawn_edges = collapsed_edges if collapse else edges


def collapsed_rep(state):
    if state[0] == "done":
        return state
    return collapse_map.get(state, state)

for src, outs in drawn_edges.items():
    G.add_node(src)
    for dst in outs[1]:
        #print(src, dst)
        G.add_edge(src, dst)

import matplotlib.cm as cm
import matplotlib.colors as mcolors

reps = [collapsed_rep(s) for s in G.nodes]
unique_reps = list(dict.fromkeys(reps))   # stable order

cmap = cm.get_cmap("tab20", len(unique_reps))
rep_to_color = {
    r: mcolors.to_hex(cmap(i))
    for i, r in enumerate(unique_reps)
}

# Build layout
pos = {}

def collapsed_pos(state):
    if state[0] == "done":
        _, P = state
        x = (mod+1) * (mod) * mod
        y = (mod+1) * mod * (P + mod // 2) + mod // 2
    else:
        (L, R, P) = state
        x = (mod+1) * (mod) * P
        y = (mod+1) * mod * ((P)/2) + (mod+1) * (mod * (mod - L) - mod//2)
    return (x,y)

if collapse:
    for state in G.nodes:
        px, py = collapsed_pos(state)
        pos[state] = py, px
else:
    for state in G.nodes:
        #if state[0] == "done":
        #    _, P = state
        #    x = (mod+1) * (P + (mod//2)) % mod
        #    y = (mod - 1) * (mod + 1)
        #else:
        #    L, R, P = state
        #    x = (mod+1) * (P + (mod//2)) % mod
        #    y = (mod+1) * (L + R) + R
        if state[0] == "done":
            px, py = collapsed_pos(state)
            pos[state] = py, px
        elif state in collapse_map:
            px, py = collapsed_pos(collapse_map[state])
            p = state[2]
            start = mod - state[0]
            end = state[1]
            p_rel = p - start if p >= start else p + state[0]
            portion = 0.5
            if state[0] + end > 0:
                portion = (p_rel) / (state[0] + end)
            pos[state] = (
                #py + (mod // 2 * math.cos(portion * tau / 2)) * (mod - 2),
                py + (portion - 0.5) * mod * (mod - 2),
                px + (mod * 0.4) * mod * math.sin(portion * tau / 2)
            )
            print(px, py, state[0])
        else:
            print(state, "aaa")
            pos[state] = (0, 0)

#pos[(0,0,mod)] = ((mod+1) * (mod + (mod // 2)) % mod, (mod - 1) * (mod + 1))

# Labels
labels = {}
collapsed_labels = {}
for state in G.nodes:
    if state[0] == "done":
        labels[state] = f"end at {state[1]}"
        collapsed_labels[state] = f"end at {state[1]}"
    else:
        L, R, P = state
        if state in collapsed_states:
            nL = 12 - L
            nR = R if R != 0 else 12
            collapsed_labels[state] = f"{nL} to {nR}"
        else:
            collapsed_labels[state] = f"({L}, {R}, {P})"
        labels[state] = f"{P}" #f"({L}, {R}, {P}"

spring = False

done_states = [("done",n) for n in range(1,mod)]

init_state = (0, 0, 1) if collapse else (0,0,mod)

fixed_states = done_states + [init_state]

if spring:
    pos = nx.spring_layout(
        G,
        pos=pos,      # your existing layout
        fixed=fixed_states,   # or list of nodes to keep fixed
        #center=(6 * 13, 11 * 13 / 2),
        k=1,
        iterations=10000
    )
else:
    #pos = nx.kamada_kawai_layout(G)
    #pos = nx.bfs_layout(G, init_state)
    #pos = nx.planar_layout(G)
    pass

node_colors = "lightblue"

if not collapse:
    node_colors = [rep_to_color[collapsed_rep(s)] for s in G.nodes]
else:
    node_colors = [rep_to_color[s] for s in G.nodes]

frame_count = 512

probs = {}

for state in valid_states:
    probs[state] = 0

probs[(0,0,mod)] = 1


for frame_index in range(frame_count):
    # Draw
    sizes = []
    if collapse:
        for s in G.nodes:
            size = 0
            for key in collapse_map:
                if s == collapse_map[key]:
                    size += probs[key]
                #print(s, key, collapse_map[key])
            if s in done_states:
                size += probs[s]
            sizes.append(30 + size * 50000)
    else:
        sizes = [30 + probs[s] * 50000 for s in G.nodes]

    plt.figure(figsize=(14, 10))
    nx.draw(
        G,
        pos,
        node_size=sizes,
        node_color=node_colors,
        edge_color="gray",
        arrowsize=10 if collapse else 5,
        with_labels=False
    )

    used_labels = collapsed_labels if collapse else labels

    for state in done_states:
        p = probs[state] * 100
        used_labels[state] = f"{state[1]}: {p:.2f}%"

    nx.draw_networkx_labels(G, pos, used_labels, font_size=6)


    plt.tight_layout()

    plt.savefig(f"{frame_index:06d}.png", dpi=100, bbox_inches="tight")
    plt.close()

    probs_next = {}
    for state in valid_states:
        if not state in done_states:
            probs_next[state] = 0
    for state in done_states:
        probs_next[state] = probs[state]
    for state in valid_states:
        if state in done_states:
            continue
        else:
            for dst in edges[state][1]:
                probs_next[dst] += probs[state] / 2

    probs = probs_next


#plt.tight_layout()
#plt.show()
