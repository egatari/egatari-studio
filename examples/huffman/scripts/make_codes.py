"""Numbers for the Huffman sample. Run: python3 scripts/make_codes.py [--libtiff path/to/t4.h]

1. Huffman code for 「すもももももももものうち」: counts, merge order, codes, total bits (fixed length vs Huffman).
2. MH (fax) code: decode the bit string on slide 7 with data/mh_table.json, and check the runs.
   --libtiff checks every code in data/mh_table.json against libtiff's t4.h (TIFFFaxWhiteCodes / TIFFFaxBlackCodes).
Writes data/huffman.json and data/mh.json.
"""
import heapq, json, math, re, sys
from collections import Counter
from itertools import count
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
TEXT = "すもももももももものうち"

# ---- 1. Huffman
freq = Counter(TEXT)
order = sorted(freq, key=lambda c: (-freq[c], TEXT.index(c)))
tie = count()
heap = [(freq[c], next(tie), c) for c in sorted(freq, key=TEXT.index)]
heapq.heapify(heap)
merges, kids = [], {}
while len(heap) > 1:
    a = heapq.heappop(heap); b = heapq.heappop(heap)
    node = f"n{len(merges) + 1}"
    kids[node] = (a[2], b[2])
    merges.append({"node": node, "parts": [a[2], b[2]], "counts": [a[0], b[0]], "sum": a[0] + b[0]})
    heapq.heappush(heap, (a[0] + b[0], next(tie), node))
root = heap[0][2]
codes = {}
def walk(n, code):
    if n in kids:
        # the heavier part on the 0 side, so the most frequent letter gets 0
        x, y = kids[n]
        w = lambda m: sum(freq[c] for c in leaves(m))
        if w(x) < w(y): x, y = y, x
        walk(x, code + "0"); walk(y, code + "1")
    else:
        codes[n] = code
def leaves(n):
    return [n] if n not in kids else leaves(kids[n][0]) + leaves(kids[n][1])
walk(root, "")
fixed_bits = math.ceil(math.log2(len(freq)))
fixed_total = fixed_bits * len(TEXT)
huff_total = sum(len(codes[c]) for c in TEXT)
# prefix-free check and round trip
assert all(not b.startswith(a) for a in codes.values() for b in codes.values() if a != b)
bits = "".join(codes[c] for c in TEXT)
inv, out, cur = {v: k for k, v in codes.items()}, [], ""
for b in bits:
    cur += b
    if cur in inv: out.append(inv[cur]); cur = ""
assert "".join(out) == TEXT and cur == ""
assert (len(TEXT), freq["も"], fixed_total, huff_total) == (12, 8, 36, 20)
huffman = {"text": TEXT, "counts": {c: freq[c] for c in order}, "merges": merges,
           "codes": {c: codes[c] for c in order}, "bits": bits,
           "fixedBitsPerLetter": fixed_bits, "fixedTotal": fixed_total, "huffmanTotal": huff_total}

# ---- 2. MH
table = json.loads((HERE / "data/mh_table.json").read_text())["table"]
code_of = {c: {} for c in ("white", "black")}
for r in table:
    for c in ("white", "black"):
        code_of[c][r["run"]] = r[c]
if "--libtiff" in sys.argv:
    src = Path(sys.argv[sys.argv.index("--libtiff") + 1]).read_text()
    for c, name in (("white", "TIFFFaxWhiteCodes"), ("black", "TIFFFaxBlackCodes")):
        body = src.split(f"{name}[] = {{", 1)[1].split("};", 1)[0]
        ref = {}
        for ln, val, run in re.findall(r"\{\s*(\d+),\s*0x([0-9A-Fa-f]+),\s*(-?\d+)\s*\}", body):
            ln, val, run = int(ln), int(val, 16), int(run)
            if run >= 0: ref[run] = format(val, f"0{ln}b")
        checked = 0
        for run, code in code_of[c].items():
            if run == "EOL": continue
            assert ref[run] == code, (c, run, code, ref.get(run))
            checked += 1
        print(f"libtiff {c}: {checked} codes match")
decoders = {c: {v: k for k, v in code_of[c].items()} for c in code_of}
BITS = "11011011111"
color, cur, words, runs, pending = "white", "", [], [], 0
for b in BITS:
    cur += b
    if cur in decoders[color]:
        run = decoders[color][cur]
        words.append({"bits": cur, "color": color, "run": run, "kind": "makeup" if run >= 64 else "term"})
        pending += run
        if run < 64:
            runs.append({"color": color, "run": pending}); pending = 0
            color = "black" if color == "white" else "white"
        cur = ""
assert cur == "" and pending == 0
assert runs == [{"color": "white", "run": 66}, {"color": "black", "run": 2}]
pixels = sum(r["run"] for r in runs)
mh = {"bits": BITS, "words": words, "runs": runs, "pixels": pixels, "bitCount": len(BITS),
      "lineWidthA4": 1728, "table": "data/mh_table.json"}

(HERE / "data/huffman.json").write_text(json.dumps(huffman, ensure_ascii=False, indent=1) + "\n")
(HERE / "data/mh.json").write_text(json.dumps(mh, ensure_ascii=False, indent=1) + "\n")
print(json.dumps(huffman["codes"], ensure_ascii=False), huffman["merges"], fixed_total, huff_total)
print(words, runs, pixels, "pixels in", len(BITS), "bits")
