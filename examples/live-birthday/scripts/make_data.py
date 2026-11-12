"""Numbers for the birthday-problem lesson. Run: python3 scripts/make_data.py

Assumes 365 equally likely birthdays (no 29 Feb). Writes data/birthday.json:
the probability that some two people share a birthday for n = 1..60, the
number of pairs, and a fictional class poll (marked 架空 on the slide).
"""
import json
from fractions import Fraction
from pathlib import Path

def p_shared(n):
    q = Fraction(1)
    for k in range(n):
        q *= Fraction(365 - k, 365)
    return 1 - q

curve = [[n, round(float(p_shared(n)) * 100, 1)] for n in range(1, 61)]
pick = {n: round(float(p_shared(n)) * 100, 1) for n in (2, 10, 23, 30, 40)}
pairs = {n: n * (n - 1) // 2 for n in (10, 23, 40)}
all_diff_40 = 1 - p_shared(40)
assert pick[23] > 50 > round(float(p_shared(22)) * 100, 1)
assert pairs[40] == 780
out = {
    "curve": curve, "pick": pick, "pairs": pairs,
    "all_diff_40": round(float(all_diff_40), 3),
    "poll_fictional": {"choices": ["約 1 割", "約 3 割", "約 5 割", "約 9 割"], "counts": [9, 14, 10, 7], "answer": 3},
}
Path(__file__).resolve().parent.parent.joinpath("data", "birthday.json").write_text(
    json.dumps(out, ensure_ascii=False) + "\n", encoding="utf-8")
print(pick, pairs, out["all_diff_40"])
