"""ASR pass over the synthesized narration of 羅生門: are the words that are easy to misread heard as intended?

First make the audio with Egatari Studio's local TTS (Irodori), in a copy of this folder:
    uv run --project tts python tts/synth.py <copy of books/rashomon>
then, on Apple silicon:
    uv run --no-project --with mlx-whisper --with pykakasi python scripts/asr_check.py <copy> <out.json>
and, to add the second check (teacher forcing, below), with the ja-tts-bench folder that holds scorer.py:
    uv run --no-project --with mlx-whisper --with pykakasi --with torch --with transformers --with soundfile \
        --with scipy python scripts/asr_check.py <copy> <out.json> --scorer <ja-tts-bench folder>

A step is checked when its narration has one of TERMS (with a {term|reading} or written plain, as 下人 is)
or the pause 仕方がなく、した.

Check 1, free transcription. Whisper large-v3 (mlx, local) transcribes the step's wav twice:
  A. plain (Whisper writes kanji),
  B. with a hiragana-only initial prompt, which pushes Whisper to write what it hears in kana.
A term passes when no misreading form appears in A or B, and the expected kana appears in B (converted to hiragana)
or the term itself appears in A. 仕方がなく、した passes when neither pass hears 仕方を.
Limit: free transcription writes what fits the context, so a misread such as しもじん or げじん for 下人 can come
back written as 下人 and pass. Check 2 is there for that.

Check 2, teacher forcing (--scorer). For each term, the spoken step is written in kana several times, differing only
in the term (expected kana, or one of its kana misreadings), and Whisper scores each kana sentence against the
audio (sum of token log-likelihoods, scale="sum"). The term passes when the expected kana scores above every
misreading; "margin" is that lead. It does not tell げにん from げみん, so げみん is not a candidate.

Irodori is deterministic: the same text and voice give byte-identical audio, so a step is one sample.
"""
import json
import re
import sys
from pathlib import Path

import mlx_whisper
import pykakasi

args = sys.argv[1:]
SCORER = None
if "--scorer" in args:
    i = args.index("--scorer")
    sys.path.insert(0, str(Path(args[i + 1]).expanduser()))
    from scorer import Scorer
    SCORER = Scorer()
    del args[i:i + 2]
LESSON, OUT = Path(args[0]), Path(args[1])
MODEL = "mlx-community/whisper-large-v3-mlx"
TERMS = {  # term: (expected kana, misreadings as Whisper may write them, kana misreadings for check 2)
    "二重傍線": ("にじゅうぼうせん", ["そばせん", "そば線", "側線"], ["にじゅうそばせん"]),
    "傍線": ("ぼうせん", ["そばせん", "そば線", "側線"], ["そばせん"]),
    "下人": ("げにん", ["したひと", "下の人", "しもびと", "したびと", "しもじん", "げじん"],
             ["したひと", "しもびと", "しもじん", "げじん"]),
    "盗人": ("ぬすびと", ["ぬすっと", "盗っ人", "ぬすと"], ["ぬすっと", "ぬすと"]),
    "六分": ("ろくぶ", ["ろくふん", "ろっぷん", "6分", "六分間"], ["ろくふん", "ろっぷん"]),
    "四分": ("しぶ", ["よんふん", "よんぷん", "4分", "四分間"], ["よんふん", "よんぷん"]),
    "己": ("おれ", ["おのれ"], ["おのれ"]),
    "引剥": ("ひはぎ", ["ひきはぎ", "ひきはがし"], ["ひきはぎ", "ひきはがし"]),
}
KANA_PROMPT = "これは、ひらがなだけでかいたぶんしょうです。げにんは、ろうばのはなしをきいていました。"
kks = pykakasi.kakasi()
hira = lambda s: "".join(x["hira"] for x in kks.convert(s))


def steps():
    md = (LESSON / "narration.md").read_text(encoding="utf-8")
    sid = None
    for line in md.split("\n"):
        m = re.match(r"## .*\{#([^}]+)\}", line)
        if m:
            sid = m.group(1)
            continue
        m = re.match(r"\[(\w+)\]\s*(.*)", line)
        if m and sid:
            yield f"{sid}:{m.group(1)}", m.group(2)


def occurrences(text):
    """term -> how many times it is spoken (marked or plain); 傍線 inside 二重傍線 is not counted twice."""
    marked = [t for t, _ in re.findall(r"\{([^|{}]+)\|([^{}]*)\}", text)]
    plain = re.sub(r"\{[^{}]*\}", "", text).replace("二重傍線", "")
    n = {t: marked.count(t) + (plain.count(t) if t != "二重傍線" else 0) for t in TERMS}
    return {t: k for t, k in n.items() if k}


def kana_variants(text, term):
    """The spoken step in kana, once per candidate reading of term."""
    want, _, bad = TERMS[term]
    s = re.sub(r"\{" + re.escape(term) + r"\|[^{}]*\}", "@", text)
    s = re.sub(r"\{([^|{}:]+)\|([^{}]*)\}", r"\2", s)
    s = re.sub(r"\{[^{}]*\}", "", s)
    if term == "傍線":
        s = s.replace("二重傍線", "にじゅうぼうせん")
    base = hira(s.replace(term, "@"))
    return {c: base.replace("@", c) for c in [want] + bad}


man = json.loads((LESSON / "audio" / "manifest.json").read_text(encoding="utf-8"))
results = []
for key, text in steps():
    terms = occurrences(text)
    pause = "仕方がなく、した" in text
    if not terms and not pause:
        continue
    seg = man.get("segments", man).get(key) if isinstance(man.get("segments", man), dict) else None
    if seg is None:
        seg = next((s for s in man.get("segments", []) if s.get("key") == key), None)
    wav = LESSON / "audio" / (seg.get("file") or seg.get("wav"))
    a = mlx_whisper.transcribe(str(wav), path_or_hf_repo=MODEL, language="ja")["text"].strip()
    b = mlx_whisper.transcribe(str(wav), path_or_hf_repo=MODEL, language="ja", initial_prompt=KANA_PROMPT)["text"].strip()
    hb = hira(b)
    checks = []
    for t, n in terms.items():
        want, bad, _ = TERMS[t]
        badhit = [x for x in bad if x in a or x in b or x in hb]
        heard = want in hb or (t in a and t not in ("六分", "四分"))
        if t in ("六分", "四分"):   # Whisper writes 六分 for both readings; only kana can tell
            heard = want in hb
        c = {"term": t, "want": want, "times": n, "ok": heard and not badhit, "misread": badhit}
        if SCORER:
            sc = SCORER.score(wav, kana_variants(text, t), scale="sum")
            margin = sc[want] - max(v for k, v in sc.items() if k != want)
            c["scores"] = {k: round(v, 1) for k, v in sc.items()}
            c["margin"] = round(margin, 1)
            c["ok"] = c["ok"] and margin > 0
        checks.append(c)
    if pause:
        bad = [x for x in ("仕方を", "しかたを") if x in a or x in b or x in hb]
        checks.append({"term": "仕方がなく、した", "want": "しかたがなく", "ok": not bad and ("しかたがなく" in hb or "仕方がなく" in a), "misread": bad})
    results.append({"key": key, "plain": a, "kana": b, "checks": checks})
    print(key, "OK" if all(c["ok"] for c in checks) else "CHECK",
          [(c["term"], c["ok"], c["misread"], c.get("margin")) for c in checks], file=sys.stderr)
OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
