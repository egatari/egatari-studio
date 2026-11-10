<!-- generated; do not edit by hand -->
# data parts

Instruction version: fae851f3

| component | what it shows | steps | data shape |
|---|---|---|---|
| `<m-balance>` | Balance at expectation | Weights → pivot → sum (3) | `{values:num[],probs:num[],name?:str}` |
| `<m-ci>` | Repeated z intervals | Axis → intervals → coverage (3) | `{mu:num,sigma:num,n:num,reps?:num,level?:num,seed?:num}` |
| `<m-code>` | Code notes | Code → notes → output (n+1/+2) | `{code:str,lang?:str,output?:str,steps:{lines:int[],note}[]}` |
| `<m-folds>` | Rotate validation folds | Rows → mean (k+1) | `{k:num,errors?:num[],labels?:str[]}` |
| `<m-mapping>` | Outcomes → values → distribution | Outcomes → arrows → groups → bars (4) | `{outcomes:{label,x:num,p?:num,balls?:str[]}[],name?:str,unit?:str,fractions?:bool,picture?:"dots"\|"dice"\|"coins"\|"grapes"\|"balls"}` |
| `<m-sampling>` | Sample; stack statistics | Population → sample → dot → repeat (4) | `{balls?:object,values?:num[],of?:str,n:num,replace?:bool,repeat?:num,seed?:num,stat?:"mean"\|"proportion",digits?:num} (balls or values)` |

### `<m-balance>`

Data example (child `<script type="application/json">`): `{"values":[0,1,2,3],"probs":[0.1,0.3,0.4,0.2],"name":"X"}`

| prop | type | default | meaning |
|---|---|---|---|
| `digits` | number | `2` | Decimal places |
| `size` | number | `0` | Text px |

JSON:
- `values`: 2–12 distinct numbers.
- `probs`: sum to 1 (else reported).
- `name`: X.

### `<m-ci>`

Data example (child `<script type="application/json">`): `{"mu":50,"sigma":10,"n":25,"reps":40,"level":0.95,"seed":2}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `0` | Text px |

JSON:
- `mu`, `sigma`, `n`: mean, SD, size.
- `reps` (40), `level` (.95), `seed`.

### `<m-code>`

Data example (child `<script type="application/json">`): `{"lang":"python","code":"import pandas as pd\ndf = pd.read_csv(\"sales.csv\")\ndf.groupby(\"store\")[\"sales\"].mean()","steps":[{"lines":[1],"note":"Load pandas"},{"lines":[2],"note":"Read CSV"},{"lines":[3],"note":"Mean"}],"output":"store\nA    120.5\nB     98.0"}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `0` | Text px |
| `outputPos` | enum | `"auto"` | Output |

`<m-code>` child JSON.

- `code`: 1184px/24px: ~76 chars/line; 440px: 9 lines, one note row, right/no output; ≤16 lines (~680px).
- `lang`: tag; `steps[{lines,note}]`: 1-based range, note.
- `output`: ≤8 lines.

Narration: explain each line; never read code aloud.

### `<m-folds>`

Data example (child `<script type="application/json">`): `{"k":5,"errors":[0.21,0.18,0.25,0.19,0.22],"labels":["1","2","3","4","5"]}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `0` | Text px |

JSON:
- `k`: 2–10; k=5: ≥316px tall (264 without errors)
- `errors`: k errors (optional).
- `labels`: k names (optional).

### `<m-mapping>`

Data example (child `<script type="application/json">`): `{"outcomes":[{"label":"HH","x":2},{"label":"HT","x":1},{"label":"TH","x":1},{"label":"TT","x":0}],"name":"X","unit":"","fractions":true}`

| prop | type | default | meaning |
|---|---|---|---|
| `stagger` | number | `0.15` | Arrow delay s |
| `digits` | number | `2` | Decimals |
| `size` | number | `0` | Text px |

- `outcomes`: 2–12; `label`, `x`, `p` (default equal; sum ≠ 1 reported)
- `name` (X), `fractions`
- `picture`: `dots`, `grapes`, `dice`, `coins`, `balls` (colour names; 11 basic)

### `<m-sampling>`

Data example (child `<script type="application/json">`): `{"values":[1,2,3,4,5,6],"n":2,"replace":true,"repeat":40,"seed":3}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `0` | Text px |

Child JSON:
- `balls`: colour counts, total 2–30; proportion of `of`.
- `values`: 2–30 numbers; mean. One form.
- `n`: 1–population size; 1–30 with replacement. Clamp/report.
- `replace`: false; `repeat`: 1–200 (40); `seed`: integer (1).
- `stat`: proportion/mean; `digits`: 0–10 (2).
