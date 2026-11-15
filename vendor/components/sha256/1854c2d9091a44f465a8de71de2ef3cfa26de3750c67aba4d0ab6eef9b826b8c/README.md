---
name: m-checklist
display: 確かめる一覧 / Checklist
version: 2.0.0
series: common
tier: specialized
set: tools
summary: 確かめる項目を並べ、ステップごとに 1 つずつ印（✓・×）を描く。印はスライドの中身で、見ている人の操作を保存しない
steps: 項目の step の最大（既定は項目 1 つ = 1 ステップ。per-step で n 個ずつ）
purposes: process
props: reveal, per-step, dur, stagger, size
---

研修の手順の確かめ、作業の前の点検、窓口の持ち物、手術や処置の前の確認など、項目を 1 つずつ確かめていくときに使う。

子の JSON：`{"items": [...]}`。

- item：`label`（`\n` で 2 行）、`note`（項目の下に小さく書くメモ）、`mark`（`check`（既定）・`cross`・`none`）、`step`、`at`
- `reveal="false"`（既定）：項目はステップ 0 から全部見え、ステップごとに次の項目の箱に印を描く。`reveal="true"`：項目もそのステップで現れ、続けて印を描く
- 印はスライドの中身（作者が決めた ✓ と ×）。見ている人が押しても変わらず、何も保存しない（学習者のデータを持たない）
<!-- llm: omit -->
- ✓ は `--term`、× は `--emph` で、描く長さで出す。`mark: "none"` は箱だけ（まだ済んでいない項目）
- 字は `size`（既定 32 px）、メモはその 0.8 倍（24 px 以上）。項目が枠に入らなければ品質チェックが size で知らせる
- 先のステップを薄く見せる表示（`ctx.preview`）：先の項目と印を `--preview-opacity` の濃さに
<!-- llm: end -->

サンプルは `demo.html`（実習の前の手洗い、窓口の持ち物（× を含む）、項目も 1 つずつ出す）。

注意

- 1 枚に 8 項目くらいまで。それより多ければスライドを分ける
- 押して印を付ける「できたかな」の一覧ではない（学習者の操作を残すと個人のデータになる）
