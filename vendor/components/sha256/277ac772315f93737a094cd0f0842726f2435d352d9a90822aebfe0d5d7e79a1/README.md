---
name: m-contrast
display: 対比の図 / Contrast figure
version: 2.0.0
series: academic
tier: specialized
set: univ
summary: 研究の位置づけの図。問いごとに従来の答え（不明は破線）と本研究の答えを並べるか、近い研究の仮定の札と本研究の札（外した・加えた）を並べ、ステップで出す
steps: answers は 問い → 従来の答え → 矢印と本研究の答え（order="row" で行ごと）。assumptions は 近い研究 → 本研究の行（残した・外した）→ 加えた → 得られること。order="whole" で 1
purposes: compare, position
audiences: university, working-adult
props: order, dur, size
---

新しさが答えの値や見方にあるとき（m-matrix の表にならないとき）の図。`kind` を子の JSON に書く。

- `answers`（既定、問いと答え）：`rows` は 1〜3 個の `{"q": "問い", "before": {"text": "従来の答え", "by": "[1]"}, "after": "本研究の答え", "basis": "根拠"}`。従来の答えがないときは `"before": {"unknown": true, "near": "近い条件で分かっていること [2]"}`（破線の箱に「不明」）
- `assumptions`（仮定の差分）：`studies` は 1〜3 個の `{"label": "[2]", "chips": ["仮定", …], "result": "得られること"}`、`self` は `{"kept": [...], "dropped": [...], "added": [...], "result": "新しく得たこと"}`。外した札は「外した」と書いて取り消し線、加えた札は「加えた」と書いて `--emph`
- 本研究は字で書いて `--emph` の枠で囲む。`selfLabel` で名前を替え（既定「本研究」）、`heads` で 3 つの列の見出しを替える（answers は 問い・従来・本研究、assumptions は 研究・仮定・得られること）
- 最も近い従来研究を `by` か `label` で名指しする。前提ごとの対比は m-tree（`dash: true`）

<!-- llm: omit -->
注意

- 字は 28 px から 24 px まで縮めて入れる。24 px で入らなければ字は小さくせず、要る大きさを知らせる（行を減らす・字を短くする・要素を大きくする）
- 字は列の幅で折る（助詞や 、 の後ろで、行の長さをそろえる）。行の高さは要素の高さまで広がる（2 倍まで）
- 読み上げ用の表（data-readable）は最後の状態：見出し、行ごとに 問い・従来（不明なら「不明（近い条件）」）・本研究（根拠）、または 研究・仮定（「外した：」「加えた：」付き）・得られること
<!-- llm: end -->
