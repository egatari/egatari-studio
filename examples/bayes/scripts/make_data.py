"""Numbers for the Bayes sample (fictional mail counts). Run: python3 scripts/make_data.py
Writes data/bayes.json. Every number on the slides comes from here."""
import json
from fractions import Fraction as F
from pathlib import Path

N = 1000
P_SPAM = F(1, 5)                      # 200 of 1,000 mails are spam (fictional)
WORDS = [                             # P(word | spam), P(word | not spam), fictional
    {"word": "free",   "spam": F(2, 5),  "ham": F(1, 10)},
    {"word": "winner", "spam": F(1, 5),  "ham": F(1, 100)},
]
spam = N * P_SPAM; ham = N - spam
w0 = WORDS[0]
free_spam = spam * w0["spam"]; free_ham = ham * w0["ham"]
p_free = w0["spam"] * P_SPAM + w0["ham"] * (1 - P_SPAM)
post_free = w0["spam"] * P_SPAM / p_free
assert post_free == free_spam / (free_spam + free_ham)
# word by word (words assumed independent within each class: the naive Bayes assumption)
p, chain = P_SPAM, [{"after": None, "pSpam": float(P_SPAM)}]
for w in WORDS:
    p = w["spam"] * p / (w["spam"] * p + w["ham"] * (1 - p))
    chain.append({"after": w["word"], "pSpam": float(p), "likelihoodRatio": float(w["spam"] / w["ham"])})
assert (spam, ham, free_spam, free_ham) == (200, 800, 80, 80)
assert post_free == F(1, 2) and p_free == F(4, 25)
pct = [round(c["pSpam"] * 100) for c in chain]
assert pct == [20, 50, 95], pct
out = {"note": "fictional numbers", "mails": N, "spam": int(spam), "notSpam": int(ham),
       "free": {"spam": int(free_spam), "notSpam": int(free_ham), "pFreeGivenSpam": float(w0["spam"]),
                "pFreeGivenNotSpam": float(w0["ham"]), "pFree": float(p_free), "pSpamGivenFree": float(post_free)},
       "chain": chain, "chainPercent": pct}
(Path(__file__).resolve().parent.parent / "data/bayes.json").write_text(json.dumps(out, indent=1) + "\n")
print(json.dumps(out))
