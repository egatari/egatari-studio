"""Slide 13: long division 84 / 3 (756 / 3 needs 558 px, too tall for the slide), one quotient digit per step."""
import json, pathlib

dividend, divisor = 84, 3
q, r = divmod(dividend, divisor)
assert r == 0
rounds, cur = [], 0
for d in str(dividend):
    cur = cur * 10 + int(d)
    qd = cur // divisor
    rounds.append({"bring": cur, "q_digit": qd, "product": qd * divisor, "rest": cur - qd * divisor})
    cur -= qd * divisor
assert int("".join(str(x["q_digit"]) for x in rounds)) == q
data = {"expr": f"{dividend}÷{divisor}", "quotient": q, "remainder": r, "rounds": rounds}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "hissan.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(json.dumps(data, ensure_ascii=False))
