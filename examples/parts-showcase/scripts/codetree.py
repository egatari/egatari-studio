"""Slide 15: decode a short bit string with the MH (modified Huffman) code of ITU-T T.4.
Table rows are the real T.4 terminating codes for runs 2-7 (a subset)."""
import json, pathlib

table = [
    {"run": 2, "white": "0111", "black": "11"},
    {"run": 3, "white": "1000", "black": "10"},
    {"run": 4, "white": "1011", "black": "011"},
    {"run": 5, "white": "1100", "black": "0011"},
    {"run": 6, "white": "1110", "black": "0010"},
    {"run": 7, "white": "1111", "black": "00011"},
]
# prefix-free check per colour
for col in ("white", "black"):
    codes = [r[col] for r in table]
    for x in codes:
        for y in codes:
            assert x == y or not y.startswith(x), (col, x, y)
runs = [("white", 5), ("black", 2), ("white", 3), ("black", 4)]   # fictional pixel row
code = {(c, r["run"]): r[c] for r in table for c in ("white", "black")}
bits = "".join(code[x] for x in runs)
# decode back (alternating colours, start white; all runs < 64 -> terminating codes)
dec, i, col = [], 0, "white"
inv = {c: {r[c]: r["run"] for r in table} for c in ("white", "black")}
while i < len(bits):
    for L in range(1, 14):
        w = bits[i:i + L]
        if w in inv[col]:
            dec.append((col, inv[col][w], w)); i += L; break
    else:
        raise ValueError("bad code")
    col = "black" if col == "white" else "white"
assert [(c, n) for c, n, _ in dec] == runs
pixels = "".join(("□" if c == "white" else "■") * n for c, n, _ in dec)
data = {"table": table, "bits": bits,
        "_check": {"codewords": [w for _, _, w in dec], "runs": runs, "pixels": pixels,
                   "n_bits": len(bits), "n_pixels": len(pixels)}}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "codetree.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(json.dumps(data["_check"], ensure_ascii=False))
