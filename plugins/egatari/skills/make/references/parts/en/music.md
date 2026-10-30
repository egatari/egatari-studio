<!-- generated; do not edit by hand -->
# music parts

Instruction version: ecca7b6f

| component | what it shows | steps | data shape |
|---|---|---|---|
| `<m-keyboard>` | ピアノの鍵盤。音階・和音・半音と全音を光らせる | steps の 1 つ = 1 ステップ（鍵盤は t でずらして順に光る） | `{range, names?, cumulative?, dur?, steps: [{keys, label?, t?, tone?, dur?}, …]}` — range "C4-C6" (include every key you use, at least one octave (e.g. C4-C5); white keys at both ends, up to 3 octaves); steps [{keys: ["C4", "E4"], label, t: [seconds per key], tone, dur}] |

### `<m-keyboard>`

Data example (child `<script type="application/json">`): `{"range":"C4-C6","names":"solfa","steps":[{"keys":["C4","E4","G4"],"label":"主和音（ドミソ）"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `（なし。子の JSON）` |  |  |  |

- `range`：使う鍵を全部含め、1 オクターブ以上（例 C4-C5）。両端は白鍵、3 オクターブまで（Include every key you use, at least one octave (e.g. C4-C5). Both ends on white keys, up to 3 octaves.）
- `names`：`solfa`（ドレミ）・`abc`・`iroha`（ハニホ、嬰ハ・変ニ）・`none`
- `t`：鍵盤ごとの秒。ずらすと音階、同じなら和音
- `cumulative: true`：前のステップの鍵盤も薄く残す
- `tone`：光の色。`dur`：音の秒（既定は次の音まで、最後は 0.8）
