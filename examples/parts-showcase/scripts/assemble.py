"""NOTE: deck.html has been edited after assembly (menu layout, preview map slide);
do not re-run the assembly without carrying those edits over.

Assemble deck.html and narration.md of パーツ図鑑 from fragments/ (run once, before ids).

Order and menu groups are fixed here. After this, run `npx egatari ids .`, then
`python3 scripts/assemble.py --links` to point the menu cards at the slide ids.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORDER = ["02","03","04","05","06","07","08","09","10",
         "11","12","13","14","15","16",
         "17","18","19","20","21","22",
         "23","24","25","26","34",
         "27","28",
         "29","35","36",
         "30","31","32","33",
         "37","38"]
GROUPS = [  # (first fragment, icon, title, sub)
    ("02","1","比べる・数字","比べる・変化・内訳・数字"),
    ("11","2","手順・予定","手順・年表・予定"),
    ("17","3","しくみ・つながり","原因・循環・階層・位置づけ・重なり"),
    ("23","4","データ","量の関係・ばらつき・パラメータ"),
    ("27","5","場所・地図","日本・世界"),
    ("29","6","参加と進行","予想・まとめる・時間を区切る"),
    ("30","7","文章の構造","漢文・古文・現代文・英文"),
    ("37","8","音楽","鍵盤・楽譜"),
]

HEAD = """<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>パーツ図鑑</title>
</head>
<body>
<div id="stage">

<section class="slide cover noconcl static">
  <div class="venue">Egatari のサンプル</div>
  <h1>パーツ図鑑</h1>
  <div class="au">38 のパーツが、それぞれの題材で動く<br><span class="muted">題材と数字は架空（出典のあるものを除く）</span></div>
</section>

<section class="slide noconcl">
  <h2>目次：伝えたいことから選ぶ</h2>
  <div class="body">
    <m-menu cols="4" size="30" aria-label="伝えたいことの目次" style="height:100%;align-content:center;--mm-h:150px">
{cards}
    </m-menu>
  </div>
</section>
"""
END = """
<section class="slide">
  <h2>もっと詳しく知るには</h2>
  <div class="body">
    <ul>
      <li>パーツごとの値と細かい使い方：<span class="term">studio.egatari.org/parts/</span>（Studio の「パーツの一覧」）</li>
      <li>パーツを使ったサンプル：<span class="term">egatari.org</span></li>
      <li>テーマを替えて見比べられる（7 つのテーマで同じ教材を組んである）</li>
    </ul>
  </div>
  <div class="concl"><span>伝えたいことに合うパーツを選ぶ</span></div>
</section>

</div>
</body>
</html>
"""
NARR_HEAD = """# 台本：パーツ図鑑

## パーツ図鑑
[0] パーツ図鑑です。Egatari の 38 のパーツが、それぞれの題材で動きます。

## 目次：伝えたいことから選ぶ
[0] 伝えたいことから、見たいパーツを選んでください。札を押すと、その節へ飛びます。
"""
NARR_END = """
## もっと詳しく知るには
[0] 最後に、詳しく知るための行き先です。
[1] パーツごとの値と細かい使い方は、Studio の「パーツの一覧」にあります。
[2] パーツを使ったサンプルは、{egatari|エガタリ}ドット{org|オーグ} で見られます。
[3] この教材は 7 つのテーマで組んであり、テーマを替えて見比べられます。
[concl] 伝えたいことに合うパーツを選んでください。
"""

def frag(n, ext):
    hits = sorted((ROOT / "fragments").glob(f"{n}-*.{ext}"))
    if len(hits) != 1:
        sys.exit(f"fragment {n}.{ext}: {len(hits)} files")
    return hits[0].read_text(encoding="utf-8").strip() + "\n"

def assemble():
    cards = "\n".join(f'      <a href="#FRAG-{g}" data-icon="{i}" data-sub="{s}">{t}</a>' for g, i, t, s in GROUPS)
    deck = HEAD.replace("{cards}", cards) + "\n" + "\n".join(frag(n, "html") for n in ORDER) + END
    narr = NARR_HEAD + "\n" + "\n".join(frag(n, "md") for n in ORDER) + NARR_END
    (ROOT / "deck.html").write_text(deck, encoding="utf-8")
    (ROOT / "narration.md").write_text(narr, encoding="utf-8")
    print("assembled", len(ORDER), "fragments")

def links():
    deck = (ROOT / "deck.html").read_text(encoding="utf-8")
    ids = re.findall(r'<section class="slide[^"]*" id="(s-[a-z0-9]+)"', deck)
    frag_ids = dict(zip(ORDER, ids[2:2 + len(ORDER)]))  # skip cover and menu
    for g, *_ in GROUPS:
        deck = deck.replace(f'href="#FRAG-{g}"', f'href="#{frag_ids[g]}"')
    (ROOT / "deck.html").write_text(deck, encoding="utf-8")
    print("linked", len(GROUPS), "menu cards")

if __name__ == "__main__":
    links() if "--links" in sys.argv else assemble()
