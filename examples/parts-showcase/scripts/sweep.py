"""Slide 34: y = a x^2 for several a; y at x = 2 for each a."""
import json, pathlib
values = [0.25, 0.5, 1, 2, 4]
at2 = {str(a): a * 2 ** 2 for a in values}
# x where y reaches 4 (the 'width' at height 4): x = sqrt(4/a)
w4 = {str(a): round((4 / a) ** 0.5, 3) for a in values}
data = {"f": "c*u**2", "values": values, "_check": {"y_at_x2": at2, "x_at_y4": w4}}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "sweep.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(json.dumps(data["_check"]))
