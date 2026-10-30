<!-- generated; do not edit by hand -->
# english parts

Instruction version: ecca7b6f

| component | what it shows | steps | data shape |
|---|---|---|---|
| `<m-syntax>` | 英文の構造：S V O C M の記号、句と節の括弧、修飾の矢印、品詞、それから和訳 | 出てくる要素（S V O C M）を 1 つずつ＋括弧・矢印・和訳（あるものだけ）。build="whole" で 1 | text inside the element (not JSON) |

### `<m-syntax>`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `36` | 英文の字の大きさ（px） |
| `pos` | string | `"off"` | on で品詞（語[名]）を語の下に |
| `build` | string | `"steps"` | whole で全部を 1 ステップに |
| `yaku` | bool | `true` | 和訳（= の行）を最後に出す |

1 行 1 文。`=` の行は直前の文の和訳。

```
[S The girl {形^ [S who] [V lives]}] [V is] [C my friend].
= 隣に住む女の子は私の友達だ。
```

- `[S …]` 要素（S V O C M、O1 O2）。`{ }` の中は小文字で出る
- `{形 …}` `{副 …}` `{名 …}` 句・節の括弧（ < > [ ]）。中に V があれば節（`形句` `形節` で固定）
- `^` 修飾の矢印：`{形^ …}` は前の語へ、`tall^` は次の語へ、`{副^plays …}` はその語へ
- `boy[名]` 品詞（`pos="on"`）
