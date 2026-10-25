"""Generate golden fixtures from Excel's own cached computed values."""
import json
M = json.load(open("audit/workbook_model.json"))

def num(x):
    return None if isinstance(x, str) else x

ground = []
for b in M["ground"]:
    p = b["parts"]; e = b["excel"]
    ground.append({
        "slot": b["index"],
        "input": {
            "width": num(b["B_width"]),
            "baseWidth": num(p["base"]["w"]),
            "bodyWidth": num(p["body"]["w"]),
            "bodyLength": num(p["body"]["l"]),
            "shelfWidth": num(p["shelf"]["w"]),
            "railWidth": num(p["rail"]["w"]),
            "doorHeight": num(b["door"]["h_in"]),
            "counts": {k: num(p[k]["count"]) for k in ("base","body","shelf","rail")},
            "bandFlags": {k: [num(p[k]["flag_w"]), num(p[k]["flag_l"])] for k in ("base","body","shelf","rail")},
            "backCount": num(b["band3"]["count"]),
        },
        # Excel-computed expected outputs (cm)
        "expected": {
            "baseLength": e["baseL"], "shelfLength": e["shelfL"], "railLength": e["railL"],
            "backWidth": e["band3W"], "backLength": e["band3L"],
            "doorWidth": e["doorW"], "doorCount": e["doorCount"],
        },
    })

wall = []
for b in M["wall"]:
    p = b["parts"]; e = b["excel"]
    wall.append({
        "slot": b["index"],
        "input": {
            "width": num(b["B_width"]),
            "bodyWidth": num(p["body"]["w"]),
            "bodyLength": num(p["body"]["l"]),
            "baseWidth": num(p["base"]["w"]),
            "railWidth": num(p["rail"]["w"]),
            "doorHeight": num(b["door"]["h_in"]),
            "counts": {k: num(p[k]["count"]) for k in ("body","base","top","shelf","rail")},
            "bandFlags": {k: [num(p[k]["flag_w"]), num(p[k]["flag_l"])] for k in ("body","base","top","shelf","rail")},
            "backCount": num(b["band3"]["count_l"]),
        },
        "expected": {
            "baseLength": e["baseL"], "topWidth": e["topW"], "topLength": e["topL"],
            "shelfWidth": e["shelfW"], "shelfLength": e["shelfL"], "railLength": e["railL"],
            "backWidth": e["band3W"], "backLength": e["band3L"],
            "doorWidth": e["doorW"], "doorCount": e["doorCount"],
        },
    })

d = M["drawer"]
fixture = {
    "_meta": {
        "source": "reference/analiz pro.2.xlsx",
        "sheet_sha_md5": "see docs/audit; cached values produced by Excel (Excel Android 16.0300)",
        "unit": "centimetre (workbook-native)",
        "note": "expected values are Excel's own cached results, not hand-computed",
    },
    "ground": ground,
    "wall": wall,
    "drawer": {
        "input": {"count": d["count"], "depth": d["depth"], "width": d["width"], "height": d["height"]},
        "expected": d["excel"],
    },
}
json.dump(fixture, open("packages/engine/test/fixtures/legacy-golden.json","w"), ensure_ascii=False, indent=1)
print("ground", len(ground), "wall", len(wall), "drawer ok")
