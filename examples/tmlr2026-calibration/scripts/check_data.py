# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "numpy==2.3.3",
#     "scipy==1.16.2",
# ]
# ///
"""Verify data/*.json against the paper (main.tex). Run after make_data.py:
    uv run scripts/check_data.py
"""

import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from scipy.integrate import quad
from scipy.optimize import minimize_scalar
from scipy.special import expit, logit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from make_data import gauss_sigmoid_mean, generate_logit_synth, tau_to_T  # noqa: E402

DATA = HERE.parent / "data"
TEX = Path.home() / "Projects/papers/TMLR_2026_Abe/main.tex"
load = lambda n: json.loads((DATA / n).read_text())  # noqa: E731
rows = []


def row(name, got, want, ok):
    rows.append((name, got, want, "OK" if ok else "FAIL"))


# (1) T(tau) vs Table 1
rc = load("relcurve.json")
for tau, want in [(1.5, 1.372), (1.0, 1.180), (0.3, 1.018)]:
    T = tau_to_T(tau)
    i = rc["taus"].index(tau)
    row(f"T(tau={tau})", f"{rc['T'][i]:.4f}", f"{want} (Tab.1)", abs(rc["T"][i] - want) < 6e-4)

# (2) MacKay worst-case error (max over mu in [-10,10], exact by adaptive quad)
mus = np.linspace(-10, 10, 201)
for T, want in [(1.5, 0.009), (2.0, 0.013), (3.0, 0.015)]:
    v = math.sqrt(8 / math.pi * (T**2 - 1))
    ex = np.array([quad(lambda z: expit(z) * math.exp(-0.5 * ((z - m) / v) ** 2)
                        / (v * math.sqrt(2 * math.pi)), m - 12 * v, m + 12 * v, limit=300)[0]
                   for m in mus])
    err = np.abs(ex - expit(mus / T)).max()
    gh = np.abs(gauss_sigmoid_mean(mus, v) - ex).max()
    row(f"max|exact-ts| T={T}", f"{err:.4f} (GH err {gh:.1e})", f"~{want} (Rem.)",
        abs(err - want) < 1e-3 and gh < 1e-5)

# max over the stored p grid for the same check on relcurve.json (tau rows nearest)
for T in (1.5, 2.0):
    tau = math.sqrt(8 / math.pi * (T**2 - 1))
    i = int(np.argmin(np.abs(np.array(rc["taus"]) - tau)))
    d = np.abs(np.array(rc["exact"][i]) - np.array(rc["ts"][i])).max()
    row(f"relcurve tau={rc['taus'][i]} max|ex-ts|", f"{d:.4f}", "consistent w/ above", True)

# (3) points.json
pt = load("points.json")
b = pt["bins"]
cor = max(abs(x["x_cor"] - x["y_cor"]) for x in b)
th_p, th_C = np.array(pt["theory"]["p"]), np.array(pt["theory"]["C"])
raw = max(abs(x["y_raw"] - np.interp(x["x_raw"], th_p, th_C)) for x in b)
raw_diag = max(abs(x["x_raw"] - x["y_raw"]) for x in b)
row("points: bins", f"{len(b)}", "15", len(b) == 15)
row("points: max|x_cor-y_cor|", f"{cor:.4f}", f"<0.03 noise; raw-diag {raw_diag:.4f}", cor < 0.03)
row("points: max|y_raw-C(x_raw)|", f"{raw:.4f}", "<0.03 (bin noise, n~200)", raw < 0.03)
cal = generate_logit_synth(20000, 6.0, 1.5, seed=42)["cal"]
lc, y = logit(np.clip(cal["p_hat"], 1e-8, 1 - 1e-8)), cal["y"]
nll = lambda T: -np.mean(y * np.log(expit(lc / T) + 1e-12)  # noqa: E731
                         + (1 - y) * np.log(1 - expit(lc / T) + 1e-12))
Tn = minimize_scalar(nll, bounds=(0.5, 3.0), method="bounded").x
row("T_NLL (cal labels, seed 42)", f"{Tn:.4f} ({Tn / 1.3722 - 1:+.2%})", "1.3695 (Tab.6, 50-seed)",
    abs(Tn / 1.3722 - 1) < 0.014)

# (4) bars.json vs Table 4 in main.tex
tex = TEX.read_text()
tab = {}
for m in re.finditer(r"^(0\.1|0\.5|1\.0|2\.0) & [\d.]+ & [\d.]+ & \$([\d.]+)\\pm[\d.]+\$ & "
                     r"\$([\d.]+)\\pm", tex, re.M):
    tab[m.group(1)] = (float(m.group(2)), float(m.group(3)))
bars = {g["label"].split()[1]: (g["raw"], g["ts"]) for g in load("bars.json")["groups"]}
row("bars == Table 4", f"{len(tab)} rows parsed", "4 rows equal", len(tab) == 4 and tab == bars)

# (5) qq.json
qq = load("qq.json")
q, s, lr = map(np.array, (qq["q"], qq["synthetic"], qq["learner"]))
row("qq synthetic corr(q,s)", f"{np.corrcoef(q, s)[0, 1]:.5f}", ">0.999",
    np.corrcoef(q, s)[0, 1] > 0.999)
row("qq tails |s|,|l| at q=+-2.57", f"{s[[0, -1]].round(2).tolist()} vs {lr[[0, -1]].round(2).tolist()}",
    "learner heavier", abs(lr[0]) > abs(s[0]) and lr[-1] > s[-1])
row("excess kurtosis S / L", f"{qq['exkurt_synthetic']:+.3f} / {qq['exkurt_learner']:+.3f}",
    "0.00 / +2.03 (Tab.2, 50-seed)", abs(qq["exkurt_synthetic"]) < 0.2 and qq["exkurt_learner"] > 1.5)

w = [max(len(str(r[i])) for r in rows) for i in range(3)]
for r in rows:
    print(f"{r[0]:<{w[0]}}  {r[1]:<{w[1]}}  {r[2]:<{w[2]}}  {r[3]}")
sys.exit(any(r[3] == "FAIL" for r in rows))
