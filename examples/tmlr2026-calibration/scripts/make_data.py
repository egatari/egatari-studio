# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "numpy==2.3.3",
#     "scipy==1.16.2",
# ]
# ///
"""Generate the figure data (data/*.json) for the TMLR 2026 calibration deck.

Paper: Abe & Kumoi, "A Theoretical Analysis of Bayes-Optimal Calibration under the
Logit-Noise Model", TMLR 2026 (papers/TMLR_2026_Abe/main.tex). Paper code:
github.com/TMLlaboratory/tmlr2026-logit-noise-calibration (private; MIT).

Provenance of every number
--------------------------
relcurve.json  Closed form / quadrature, no randomness.
               exact C(p) = E_{Z~N(logit p, tau^2)}[sigmoid(Z)] (flat-prior remark after
               Theorem 4), 96-node Gauss-Hermite; ts = sigmoid(logit p / T),
               T = sqrt(1 + pi tau^2 / 8) (Prop. temperature-scaling correspondence).
pipeline.json  Illustration only (not a paper result): numpy default_rng(42),
               theta* ~ U[-6,6] (60 draws), then eps ~ N(0, 1.5^2) (60 draws).
jensen.json    Closed form / quadrature: sigmoid on a 241-point grid, N(2, 1.5^2) pdf,
               sigmoid(2), and E[sigmoid(Z)] by Gauss-Hermite. Illustration of the
               Jensen gap (inverse-problem proposition).
points.json    Simulation identical to the paper's Condition S single run (Figs. 2-3):
               generate_logit_synth(N=20000, L=6, tau=1.5, seed=42), ported verbatim
               from exp_X_12_synth/generators.py; test split (10k). Correction is
               (a-true) TS with T_true = 1.3722 (Table 1). 15 equal-width bins with the
               same np.digitize rule as exp_X_12_synth/corrections.py.
qq.json        synthetic: exactly the paper's Figure 4 left panel draw
               (src/run_qq_comparison_figure_fixed.py: default_rng(42).normal(0, 0.4292, n),
               n = #learner residuals). learner: residual column (task 2v2) of
               exp_X_12_LR/outputs/residuals.csv produced by paper step 3
               (exp_X_12_LR/run.py, seed 20260418, Python 3.11.7 + pinned requirements).
               Both standardized by their own mean / sd (ddof=1); 199 sample quantiles at
               probabilities (i-0.5)/199 (np.quantile, linear). Pass the CSV with
               --residuals; without it the learner series of an existing qq.json is kept.
bars.json      Copied from paper Table 4 (var sweep, ECE raw and ECE (a-est)).

Run:  uv run scripts/make_data.py [--residuals PATH]   (from examples/tmlr2026-calibration/)
Then: uv run scripts/check_data.py
"""

import argparse
import csv
import json
import math
from pathlib import Path

import numpy as np
from scipy.special import expit, logit
from scipy.stats import norm

DATA = Path(__file__).resolve().parent.parent / "data"
GH_X, GH_W = np.polynomial.hermite.hermgauss(96)


def r5(x):
    """Round to 5 significant digits (recursively)."""
    if isinstance(x, (list, tuple, np.ndarray)):
        return [r5(v) for v in x]
    x = float(x)
    return 0.0 if x == 0 else float(f"{x:.5g}")


def gauss_sigmoid_mean(mu, v):
    """E[sigmoid(Z)], Z ~ N(mu, v^2), elementwise over mu (Gauss-Hermite)."""
    mu = np.asarray(mu, dtype=float)
    if v == 0:
        return expit(mu)
    z = mu[..., None] + math.sqrt(2.0) * v * GH_X
    return (expit(z) * GH_W).sum(-1) / math.sqrt(math.pi)


def tau_to_T(tau):
    return math.sqrt(1.0 + math.pi * tau**2 / 8.0)


# --- ported verbatim (logic) from exp_X_12_synth/generators.py ----------------------
def generate_logit_synth(N, L, tau_true, seed=42, cal_ratio=0.5):
    rng = np.random.default_rng(seed)
    theta_star = rng.uniform(-L, L, size=N)
    p_star = expit(theta_star)
    epsilon = rng.normal(0.0, tau_true, size=N)
    theta_hat = theta_star + epsilon
    p_hat = expit(theta_hat)
    y = rng.binomial(1, p_star).astype(float)
    N_cal = int(N * cal_ratio)
    idx = np.arange(N)
    rng.shuffle(idx)

    def subset(i):
        return dict(theta_star=theta_star[i], p_star=p_star[i], theta_hat=theta_hat[i],
                    p_hat=p_hat[i], y=y[i])

    return dict(cal=subset(idx[:N_cal]), test=subset(idx[N_cal:]))


# --- from exp_X_12_synth/corrections.py ---------------------------------------------
EPS = 1e-8


def correct_temperature(p_hat, T):
    return expit(logit(np.clip(p_hat, EPS, 1 - EPS)) / T)


def bin_index(p, B=15):
    edges = np.linspace(0.0, 1.0, B + 1)
    return np.digitize(np.clip(p, EPS, 1 - EPS), edges[1:-1], right=False)


def write(name, obj):
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / name).write_text(json.dumps(obj, separators=(",", ":")) + "\n")
    print(f"wrote data/{name}")


def make_relcurve():
    p = np.linspace(0.0025, 0.9975, 201)
    taus = [round(0.05 * i, 2) for i in range(61)]
    lp = logit(p)
    exact, ts, Ts = [], [], []
    for tau in taus:
        T = tau_to_T(tau)
        exact.append(r5(gauss_sigmoid_mean(lp, tau)))
        ts.append(r5(expit(lp / T)))
        Ts.append(r5(T))
    write("relcurve.json", dict(p=r5(p), taus=taus, exact=exact, ts=ts, T=Ts))


def make_pipeline():
    rng = np.random.default_rng(42)
    th = rng.uniform(-6, 6, 60)
    eps = rng.normal(0, 1.5, 60)
    write("pipeline.json", dict(tau=1.5, theta_star=r5(th), eps=r5(eps), range=[-6, 6]))


def make_jensen():
    th = np.linspace(-6, 6, 241)
    mu, sd = 2.0, 1.5
    write("jensen.json", dict(
        theta=r5(th), sigmoid=r5(expit(th)), mu=mu, sd=sd, pdf=r5(norm.pdf(th, mu, sd)),
        sig_of_mean=r5(expit(mu)), mean_of_sig=r5(gauss_sigmoid_mean(np.array(mu), sd))))


def make_points(B=15):
    tau = 1.5
    T = tau_to_T(tau)
    test = generate_logit_synth(N=20000, L=6.0, tau_true=tau, seed=42)["test"]
    p_hat, p_star = test["p_hat"], test["p_star"]
    p_til = correct_temperature(p_hat, T)
    bi_raw, bi_cor = bin_index(p_hat, B), bin_index(p_til, B)
    bins = []
    for b in range(B):
        mr, mc = bi_raw == b, bi_cor == b
        if mr.sum() == 0 or mc.sum() == 0:
            continue  # keep index pairing; never triggered for this draw
        bins.append(dict(x_raw=r5(p_hat[mr].mean()), y_raw=r5(p_star[mr].mean()),
                         x_cor=r5(p_til[mc].mean()), y_cor=r5(p_star[mc].mean()),
                         n=int(mr.sum()), n_cor=int(mc.sum())))
    pt = np.linspace(0.0025, 0.9975, 201)
    write("points.json", dict(tau=tau, T=r5(T), bins=bins,
                              theory=dict(p=r5(pt), C=r5(gauss_sigmoid_mean(logit(pt), tau)))))


def std_quantiles(r, probs):
    z = (r - r.mean()) / r.std(ddof=1)
    return np.quantile(z, probs)


def exkurt(r):
    """Excess kurtosis as in src/run_qq_comparison_figure_fixed.py."""
    return ((r - r.mean()) ** 4).mean() / r.std(ddof=1) ** 4 - 3.0


def make_qq(residuals_csv):
    probs = (np.arange(1, 200) - 0.5) / 199
    q = norm.ppf(probs)
    learner = None
    n = None
    if residuals_csv and Path(residuals_csv).exists():
        with open(residuals_csv, encoding="utf-8") as f:
            rl = np.array([float(row["residual"]) for row in csv.DictReader(f)
                           if row.get("task") == "2v2"])
        n = len(rl)
        learner = r5(std_quantiles(rl, probs))
        kl = r5(exkurt(rl))
    else:
        old = DATA / "qq.json"
        if not old.exists():
            raise SystemExit("residuals.csv not found and no existing data/qq.json: run "
                             "paper step 3 (exp_X_12_LR/run.py) and pass --residuals")
        prev = json.loads(old.read_text())
        learner, n, kl = prev["learner"], prev.get("n"), prev.get("exkurt_learner")
        print("  [qq] residuals.csv not given; keeping learner series from existing qq.json")
    rs = np.random.default_rng(42).normal(0.0, 0.4292, size=n or 3000)
    write("qq.json", dict(q=r5(q), synthetic=r5(std_quantiles(rs, probs)),
                          learner=learner, n=n, exkurt_synthetic=r5(exkurt(rs)),
                          exkurt_learner=kl))


def make_bars():
    write("bars.json", {"metric": "ECE", "groups": [
        {"label": "var 2.0", "raw": 0.0069, "ts": 0.0066},
        {"label": "var 1.0", "raw": 0.0078, "ts": 0.0063},
        {"label": "var 0.5", "raw": 0.0093, "ts": 0.0139},
        {"label": "var 0.1", "raw": 0.0148, "ts": 0.168},
    ]})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--residuals", help="exp_X_12_LR/outputs/residuals.csv from paper step 3")
    a = ap.parse_args()
    make_relcurve(); make_pipeline(); make_jensen(); make_points(); make_qq(a.residuals)
    make_bars()
