"""Fictional schedule for slide 16 (m-timeline): introducing a new system.

All months are fictional. Periods are bands (end is exclusive: "2028-01" = through Dec 2027).
Writes ../data/timeline.json (the m-timeline child JSON).
"""
import json
from pathlib import Path

periods = [
    # (label, lane, start, end_exclusive, tone)
    ("要件の整理", "システム", "2027-04", "2027-06", "term"),
    ("開発", "システム", "2027-06", "2027-10", "term"),
    ("試験運用", "システム", "2027-09", "2027-12", "accent2"),
    ("職員の研修", "職員", "2027-10", "2028-01", "accent2"),
]
milestone = ("本番開始", "2028-01")

nodes = [
    {"id": f"p{i}", "label": label, "lane": lane, "when": start, "end": end, "tone": tone}
    for i, (label, lane, start, end, tone) in enumerate(periods, 1)
]
nodes.append({"id": "go", "label": milestone[0], "when": milestone[1], "tone": "emph"})

# sanity: periods start before they end, milestone after the last band
for n in nodes[:-1]:
    assert n["when"] < n["end"], n
assert all(n["end"] <= milestone[1] for n in nodes[:-1])

out = Path(__file__).resolve().parent.parent / "data" / "timeline.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps({"nodes": nodes}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(out)
