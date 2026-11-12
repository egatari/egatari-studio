---
name: m-predict
version: 2.1.0
series: common
tier: standard
summary: 予想してから答えを開く。選択肢ごとの人数を棒で見せ、答えのステップで正解に枠
steps: 0 問いと選択肢、1 人数の棒、answer-step（既定 2）で答え
purposes: predict
variants: fade, draw
props: answer-step, unit, poll, ticks
---

「A だと思う人〜」と手を挙げてもらい、先生が −1・＋1 で数える（数を打ち込んでもよい）。一人で自習する学習者は、選択肢を押すと自分の予想になる。

子の JSON：`{"question", "choices": [{"label", "tone"?}], "answer": 正解の番号（0 から）, "counts"?: [選択肢ごとの例の人数], "note"?: 答えと出す一言, "labels"?: {"correct"?: 正解の印の文字}}`

- 選択肢は 2〜6。動画・印刷・最初の表示は `counts`（無ければ 0）。同じスライドにいるあいだは数が残る（答えのステップでも、戻っても）
- 台本は `counts` の数で書き、数える所は `{note:ここで手を挙げてもらう}` と書く（丸かっこは読み上げられる）
- `poll="p1"`：live の投票の集計を出す
- `labels.correct`（省略可）：正解の印の文字を変える（既定「✓ 正解」）

<!-- llm: omit -->
作る人向けの注（dev と確かめること）

- ステップ：0 は問い・選択肢・目盛り（地図のステップ 0 の地と同じく、文脈は初めから見せる。共通の決まり）。1 で人数の棒と操作、`answer-step` で正解の枠・「✓ 正解」・`note`、ほかの選択肢は棒を薄く、字は `--muted`（4.5:1 以上）。`answer-step="1"` なら棒の後に続けて開く
- 先のステップを薄く見せる表示（`ctx.preview`）の例外：先のステップを何も見せない（棒も**答え（枠・✓ 正解・note）**も。予想のパーツなので）。index.js の `static preview = "none"` で、manifest.json に `preview: "none"` と載る（docs/conventions.md §1.2）
- 学習者の状態（仕様 §8.4、egatari-spec 241770f）：数と自分の予想は、同じスライドにいるあいだはステップを進めても戻っても残る（答えのステップで、数えた数と予想の当たり外れが出る）。作者の値に戻すのは、ほかのスライドから入ったときと飛んだときの描画（`ctx.entered`）だけ。k が変わっただけでは戻さない。`ctx.reset`（触ったパーツがステップに入るとき）では欄やボタンのフォーカスだけを外し、数と予想は消さない（仕様 §8.4：`ctx.reset` は学習者の入力を消してはならない）
- 2.0.0 から、戻すのは `ctx.entered` だけ（1.x の `deck:pos` を聞く代わりはやめた。2.0 の実行系はいつも `ctx.entered` を渡す）
- 印刷：`beforeprint` から `afterprint` まで作者の値で描き（予想の印・当たり外れも出さない）、印刷の後は画面の数に戻す（消さない）
- 要素のメソッド（Studio が呼ぶ）：`input(choice, count)`（choice は 0 から数える選択肢の番号、count は新しい数で 0〜9999 の整数。それ以外は console.warn して無視。動画では何もしない。返り値なし）。`counts()`：今の数の新しい配列（変えていなければ作者の値）。発表者の画面の `deck-cmd` `{type: "input", …}` から `input()` へ渡すのは Studio の中のこと
- 数が変わったとき（ボタン・欄・キー・`input()`）と、数を変えた後に戻したとき（`ctx.entered`・ほかのスライドから入ったとき）：要素に `CustomEvent("egatari-input", {bubbles: true, detail: {counts}})`。ふつうの描画では出さない
- live：`ctx.live?.poll(poll の値)` → `number[] | null`。配列のときだけ棒に出し（「投票の結果」、操作は隠す）、動画・印刷では出さない。見せてよいか（見せると決めた後、3 人以上）は実行系が決める。集計が変わったら実行系が render を呼び直す（仕様 §8.4）。発表者が入れた数はパーツが自分で描き直す
- index.js の `static interactive = true`（操作できるパーツ）と `static viewerInput = true`（入力を受け付ける）：manifest.json の `interactive`・`viewerInput` になる。README には書かない（AI への指示に入るので）
- キー：数の欄と ±1 のボタンで `+` `-` `↑` `↓`（ボタンでは `←` `→` も）。数字のキーは割り当てない（欄の中で打つときだけ）。欄の中のキーはスライドに渡さない（Studio #69 の前でも）。Esc・Enter で欄を出る
- 動画では操作も予想の印も作らない。印刷では `@media print` で隠す
- 表示文（「✓ 正解」「予想：」「の数」「1 減らす」「1 増やす」「投票の結果」など）は ctx.lang の日英に従う（index.js の TEXT）。`labels.correct` があればそれで「✓ 正解」を上書きし、okW（幅の見積もり）もそれに合わせる
<!-- llm: end -->
