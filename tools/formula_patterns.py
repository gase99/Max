import openpyxl, re, collections
P = "reference/analiz pro.2.xlsx"
wb = openpyxl.load_workbook(P, data_only=False)

def norm(f):
    # make references relative to the cell, to find archetypes
    return f

for ws in wb.worksheets:
    print("\n" + "="*90)
    print("SHEET:", ws.title)
    print("="*90)
    pats = collections.defaultdict(list)
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("="):
                pats[c.value].append(c.coordinate)
    print(f"distinct formula strings: {len(pats)}  total formula cells: {sum(len(v) for v in pats.values())}")
    # group by "column + stripped digits"
    bycol = collections.defaultdict(list)
    for f, cells in pats.items():
        for cell in cells:
            col = re.match(r"([A-Z]+)", cell).group(1)
            bycol[col].append((cell, f))
    for col in sorted(bycol, key=lambda x: (len(x), x)):
        items = bycol[col]
        uniq = collections.Counter(f for _, f in items)
        print(f"\n--- col {col}: {len(items)} cells, {len(uniq)} distinct ---")
        for f, n in uniq.most_common():
            sample = [c for c, ff in items if ff == f][:4]
            print(f"  x{n}  {f}      @ {sample}")
