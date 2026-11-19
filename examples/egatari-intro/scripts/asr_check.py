"""ASR pass over the synthesized narration of this lesson: are the words that are easy to misread heard as intended?

Make the audio with Egatari Studio's local TTS (Irodori) in a copy of this folder:
    uv run --project tts python tts/synth.py <copy of lessons/egatari-intro>
then, on Apple silicon, with the ja-tts-bench folder that holds scorer.py:
    uv run --no-project --with mlx-whisper --with pykakasi --with torch --with transformers --with soundfile \
        --with scipy python scripts/asr_check.py <copy> <out.json> <ja-tts-bench folder>

Same method as books/rashomon/scripts/asr_check.py, check 2 (teacher forcing): for each term in a step, the spoken
step (as synth.py sent it, readings applied; audio/seg_<digest>.json) is written in kana once per candidate reading,
differing only in the term, and Whisper large-v3 scores each kana sentence against the audio (sum of token
log-likelihoods). The term passes when the expected reading scores above every misreading; "margin" is that lead.
The free transcription in kana (Whisper with a hiragana prompt) is kept in the output for reading by eye.
Irodori is deterministic: the same text and voice give byte-identical audio, so a step is one sample.
"""
import json
import sys
from pathlib import Path

import mlx_whisper
import pykakasi

LESSON, OUT, BENCH = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]).expanduser()
sys.path.insert(0, str(BENCH))
from scorer import Scorer  # noqa: E402

MODEL = "mlx-community/whisper-large-v3-mlx"
KANA_PROMPT = "これは、ひらがなだけでかいたぶんしょうです。えーあいがすらいどをかきます。"
# term as synth.py speaks it: (expected kana, kana misreadings). Longer terms first.
# ALSO: other kana spellings of the expected reading (Whisper writes エーアイ as えいあい); the best of them is compared.
TERMS = {
    "チャットジーピーティー": ("ちゃっとじーぴーてぃー", ["ちゃっとじーぴーてー", "ちゃとじーぴーてぃー"]),
    "ジェミニ": ("じぇみに", ["げみに", "じぇみない", "じぇみにー"]),
    "クロード": ("くろーど", ["くらうど", "くろうで", "くらうで"]),
    "対話型": ("たいわがた", ["たいわけい", "たいわかた"]),
    "生成AI": ("せいせいえーあい", ["なませいえーあい", "せいなりえーあい", "せいせいあい"]),
    "依頼": ("いらい", ["えらい", "いれい"]),
    "作成": ("さくせい", ["さっせい", "さくなり", "さくぜい"]),
    "絵語りドットオーグ": ("えがたりどっとおーぐ", ["えがたりどっとおるぐ", "えがたりどっとおーじー"]),
    "絵語り": ("えがたり", ["えかたり", "えごがたり", "えがたる"]),
    "エイチティーエムエル": ("えいちてぃーえむえる", ["えっちてぃーえむえる", "えいちえむてぃーえる"]),
    "AI": ("えーあい", ["あい", "えい"]),
    "Studio": ("すたじお", ["すてゅーでぃお", "すたでぃお"]),
    "r のキー": ("あーるのきー", ["るのきー", "あるのきー"]),
    "四半期": ("しはんき", ["よんはんき", "しはんぎ"]),
    "品質": ("ひんしつ", ["ひんひつ", "ひんじつ"]),
    "開けます": ("ひらけます", ["あけます"]),
    "ひらけます": ("ひらけます", ["あけます"]),  # s-w5shrc:1 carries the reading {開け|ひらけ}
    "解約率": ("かいやくりつ", ["かいやくそつ"]),
    "2 枚目": ("にまいめ", ["ふたまいめ"]),
    "6 枚": ("ろくまい", ["むまい", "ろっまい"]),
    "1 行": ("いちぎょう", ["いっこう", "ひとぎょう"]),
    "1 つ": ("ひとつ", ["いっつ", "いちつ"]),
    "3 つ": ("みっつ", ["さんつ"]),
    "面": ("めん", ["おもて", "つら"]),
}
ALSO = {"AI": ["えいあい"], "生成AI": ["せいせいえいあい"]}
kks = pykakasi.kakasi()


def kana(s):
    """Kana of a spoken step; every term is replaced by its expected reading (pykakasi reads the rest)."""
    for t, (want, _) in TERMS.items():
        s = s.replace(t, "\0" + want + "\0")
    parts = s.split("\0")
    return "".join(p if i % 2 else "".join(x["hira"] for x in kks.convert(p)) for i, p in enumerate(parts)).replace(" ", "")


def variants(text, term):
    """The spoken step in kana once per candidate reading of term; longer terms that contain it keep their reading."""
    want, bad = TERMS[term]
    out = {}
    for c in [want] + ALSO.get(term, []) + bad:
        s = text
        for t in TERMS:
            if t != term and term in t:
                s = s.replace(t, "\0" + TERMS[t][0] + "\0")
        s = s.replace(term, "\0" + c + "\0")
        out[c] = "".join(p if i % 2 else kana(p) for i, p in enumerate(s.split("\0")))
    return out


man = json.loads((LESSON / "audio" / "manifest.json").read_text(encoding="utf-8"))["segments"]
scorer = Scorer()
results = []
for key, seg in man.items():
    wav = LESSON / "audio" / seg["file"]
    spoken = " ".join(p for turn in json.loads(wav.with_suffix(".json").read_text(encoding="utf-8"))["tts"] for p in turn)
    rest, terms = spoken, []
    for t in TERMS:
        if t in rest:
            terms.append(t)
            rest = rest.replace(t, "")
    heard = mlx_whisper.transcribe(str(wav), path_or_hf_repo=MODEL, language="ja", initial_prompt=KANA_PROMPT)["text"].strip()
    checks = []
    for t in terms:
        sc = scorer.score(wav, variants(spoken, t), scale="sum")
        wants = [TERMS[t][0]] + ALSO.get(t, [])
        want = max(wants, key=lambda k: sc[k])
        margin = sc[want] - max(v for k, v in sc.items() if k not in wants)
        checks.append({"term": t, "want": want, "ok": margin > 0, "margin": round(margin, 1),
                       "scores": {k: round(v, 1) for k, v in sc.items()}})
    results.append({"key": key, "spoken": spoken, "kana": heard, "checks": checks})
    print(key, "OK" if all(c["ok"] for c in checks) else "CHECK",
          [(c["term"], c["margin"]) for c in checks], "|", heard, file=sys.stderr)
OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
