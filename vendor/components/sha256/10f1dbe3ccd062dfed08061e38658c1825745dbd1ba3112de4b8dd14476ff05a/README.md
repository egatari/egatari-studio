---
name: m-code
display: コードの解説 / Code walkthrough
version: 2.0.0
series: academic
tier: specialized
set: data
summary: 短いコードを行ごとに説明し、最後に出力を見せる
steps: コード全体→説明を順に→出力（説明数＋1、出力ありは＋2）
purposes: process, model
props: dur, size, outputPos
---

`<m-code style="height:440px">` の子に JSON を置く。

- `code`：プログラム文字列。16 行まで、1 行 60 字以内が目安
- `lang`：言語の札。`steps[{lines,note}]`：1 始まりの行番号か両端を含む範囲、短い説明
- `output`：省略可の出力文字列（8 行まで）

台本はコードを読み上げない。その行が何をするかを言葉で言う（変数名や記号は 1 つずつなら書いてよい）。

<!-- llm: omit -->
```html
<m-code style="height:440px"><script type="application/json">{"lang":"python","code":"x = 2\nprint(x)","steps":[{"lines":[1],"note":"値を代入"},{"lines":[2],"note":"表示する"}],"output":"2"}</script></m-code>
```

コードは実行せず、受け取った出力をそのまま示す。最初にコード全体を表示し、説明ごとに該当行を emph の帯と行番号で強調する。前の説明は muted で残す。最後は帯を消して全説明を読みやすくし、出力があれば表示する。プレビューの先の内容はテーマの --preview-opacity。描画は k と t だけで決まり、任意の順に戻せる。

dur は段階の秒数（0.6）。size は文字 px（0：コード 24、説明 26、指定は 24 以上）。outputPos は auto・below・right。auto はコードが 8 行以下で全列が収まる幅なら右、それ以外は下。右指定は右の配置を保つ。不正属性は報告して既定値へ戻す。

Python・R・shell の #、JavaScript（js）の // は文字列の外だけ muted。言語名は大小文字を区別しない。タブは空白 4 字。コードは等幅で折り返さず、全角を 1em、半角を 0.6em と見積もる。説明は語か文字で折り返す。英語の字体の箱 1.43em に余白を加えた行間。説明が重なる場合は後の箱を下げ、接続線を延ばす。

注意：1184×440px が目安。16 行や 8 行の上限・幅・高さを超すテキストは layout を報告し、入る分を … で切る。説明が入らなければ layout を報告してその箱を描かない。最小の文字サイズでも箱が小さいと size を報告する。範囲が逆・0 以下・コードの行数外なら range を報告し、帯と接続線を省く。説明自体と段階数は保つ。

ctx.lang の日英表示。role="figure"、説明を順に含む最終状態の aria-label（作者の指定を保持）、aria-hidden の SVG。全コードと出力を、図の中の見えない pre に置く（フォーカスはしない）。見本の売上データは架空。
<!-- llm: end -->
