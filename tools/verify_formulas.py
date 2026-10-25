import json, math
M = json.load(open("audit/workbook_model.json"))

def eq(a,b,tol=1e-9):
    if isinstance(a,str) or isinstance(b,str): return a==b
    if a is None or b is None: return a is b
    return abs(float(a)-float(b)) <= tol

def door_rule(B):
    if B is None: return ("", None)
    if 10 <= B <= 50:  return (B-0.2, 1)
    if 50 < B <= 100:  return (B/2-0.2, 2)
    if 100 < B <= 150: return (B/3-0.2, 3)
    return ("", "")

def replay_ground(b):
    B = b["excel"]["B"]
    e = b["excel"]
    g = dict(e)
    g["baseL"]  = B
    g["shelfL"] = B-3.2
    g["railL"]  = B-3.2
    g["band3W"] = e["baseL"]-1.6
    g["band3L"] = e["bodyL"]+1.6-0.8
    dw, dc = door_rule(B)
    g["doorW"], g["doorCount"] = dw, dc
    return g

def replay_wall(b):
    B = b["excel"]["B"]; e = b["excel"]
    g = dict(e)
    g["baseL"]  = B-3.2
    g["topW"]   = e["bodyW"]-2
    g["topL"]   = B-3.2
    g["shelfW"] = e["baseW"]-3
    g["shelfL"] = B-3.2
    g["railL"]  = B-3.2
    g["band3W"] = (B-3.2)+1.6
    g["band3L"] = e["bodyL"]-0.8
    dw, dc = door_rule(B)
    g["doorW"], g["doorCount"] = dw, dc
    return g

def report(name, blocks, replay):
    print("="*90); print(name)
    bad = 0
    for b in blocks:
        got = replay(b); e = b["excel"]
        diffs = []
        for k in ["baseL","shelfL","railL","band3W","band3L","doorW"]:
            if k in e and not eq(got.get(k), e[k]): diffs.append((k, got.get(k), e[k]))
        if name.startswith("WALL"):
            for k in ["topW","topL","shelfW"]:
                if not eq(got.get(k), e[k]): diffs.append((k, got.get(k), e[k]))
        if diffs:
            bad += 1
            print(f"  block {b['index']} (hdr {b['headerRow']}) B={e['B']}: {diffs}")
    print(f"  -> {len(blocks)-bad}/{len(blocks)} blocks fully match; {bad} with diffs")

report("GROUND", M["ground"], replay_ground)
report("WALL",   M["wall"],   replay_wall)

d = M["drawer"]
print("="*90); print("DRAWER")
exp = {"bodyL": d["depth"]-5, "bodyW": d["height"]/3-4, "bodyCount": d["count"]*2,
       "frontL": d["width"]-9.1, "frontW": d["height"]/3-4, "frontCount": d["count"],
       "backL": d["width"]-9.1, "backW": d["height"]/3-4-2, "backCount": d["count"]}
for k,vv in exp.items():
    print(f"  {k}: replay={vv!r} excel={d['excel'][k]!r} {'OK' if eq(vv,d['excel'][k]) else 'MISMATCH'}")
