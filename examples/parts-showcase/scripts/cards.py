"""Four promises of new-hire training (m-cards, slide 12). No numbers; content only."""
import json
from pathlib import Path

out = {"cards": [
    {"icon": "clock", "title": "5 分前に集まる", "text": "始まる前に席に着く"},
    {"icon": "notebook", "title": "その場でメモ", "text": "聞いたことは書いて残す"},
    {"icon": "message", "title": "迷ったら聞く", "text": "15 分悩んだら先輩に"},
    {"icon": "checklist", "title": "1 日をふり返る", "text": "日報に学びを 3 行"},
]}
Path(__file__).resolve().parent.parent.joinpath("data", "cards.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out)
