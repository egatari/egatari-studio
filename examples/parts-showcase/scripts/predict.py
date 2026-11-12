"""Fictional class poll for slide 29 (m-predict): what to do first in an earthquake.

The answer follows 首相官邸「防災の手引き」地震発生時の行動
(https://www.kantei.go.jp/jp/headline/bousai/jishin.html):
「頭を保護しながら大きな家具から離れ、丈夫な机の下などに隠れる」「あわてて外に飛び出さない」
「火元から離れているときは無理に火を消しに行かない」.
The counts are a fictional poll of a class of 30.
Writes ../data/predict.json (the m-predict child JSON).
"""
import json
from pathlib import Path

choices = ["すぐに外へ飛び出す", "頭を守り、丈夫な机の下に隠れる", "離れた台所へ火を消しに行く"]
counts = [9, 15, 6]  # fictional class poll
CLASS_SIZE = 30
assert sum(counts) == CLASS_SIZE and len(counts) == len(choices)

data = {
    "question": "家で強い揺れを感じた。まず何をする？",
    "choices": [{"label": c} for c in choices],
    "answer": 1,
    "counts": counts,
    "note": "頭を守って身の安全を確保する。外に飛び出さない",
}
out = Path(__file__).resolve().parent.parent / "data" / "predict.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(out)
