<!-- generated; do not edit by hand -->
# social parts

Instruction version: ecca7b6f

| component | what it shows | steps | data shape |
|---|---|---|---|
| `<m-map-japan>` | 日本の 47 都道府県の地図。地域の強調、統計の塗り分け、点、矢印、経度・緯度の重ね描きをステップごとに出す | 項目の step の最大（既定 1）。地図そのものはステップ 0 から出ている | `{regions?: [{id?, group?, label?, tone?, step?, at?} (id or group), …], values?, classes?, valuesStep?, points?: [{lon?, lat?, code?, label?, tone?, anchor?, step?, at?} (lon + lat or code), …], flows?: [{from, to, label?, tone?, value?, bend?, via?: [[any, …], …], labelAt?, step?, at?}, …], shapes?: [{polygon?: [[any, …], …], line?: [[any, …], …], label?, labelAt?, tone?, dash?, step?, at?} (polygon or line), …]}` — prefectures by JIS code "01"–"47" (or "JP-13", "東京都") in regions[].id; the 8 regions (hokkaido, tohoku, kanto, chubu, kinki, chugoku, shikoku, kyushu) in regions[].group; values is an object {code: number}; classes are the lower bounds of the classes (default 4, at most 5); points, shapes and flows[].via use lon/lat in degrees |
| `<m-map-world>` | 世界の国・地域の地図（太平洋が中央）。国や州の強調、区分と値の塗り分け、点、矢印をステップごとに出す | 項目の step の最大（既定 1）。地図そのものはステップ 0 から出ている | `{regions?: [{id?, group?, label?, tone?, step?, at?} (id or group), …], categories?: [{label, ids, tone?, step?, at?}, …], values?, classes?, valuesStep?, points?: [{lon?, lat?, code?, label?, tone?, anchor?, step?, at?} (lon + lat or code), …], flows?: [{from, to, label?, tone?, value?, bend?, via?: [[any, …], …], labelAt?, step?, at?}, …], shapes?: [{polygon?: [[any, …], …], line?: [[any, …], …], label?, labelAt?, tone?, dash?, step?, at?} (polygon or line), …]}` — countries by ISO alpha-3 or Natural Earth code ("JPN", "USA") or Japanese name; the six regions (asia, europe, africa, north-america, south-america, oceania) in regions[].group and categories[].ids; values is an object {code: number}; classes are the lower bounds (default 4, at most 5); points, shapes and [lon, lat] in flows use degrees |

### `<m-map-japan>`

Data example (child `<script type="application/json">`): `{"regions":[{"id":"13","tone":"emph","step":1},{"group":"kinki","tone":"series-2","step":2}],"points":[{"lon":135.5,"lat":34.69,"label":"大阪","step":3}],"flows":[{"from":"13","to":"27","step":4}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `layout` | string | `"inset"` | inset（南西諸島を枠に入れて描く）か true（本当の位置。日本が小さくなる） |
| `islands` | string | `"main"` | main か all（inset で小笠原諸島の枠も描く） |
| `labels` | string | `"focus"` | 地域の名前：focus（regions に書いた地域だけ）・all（名前が中に入る都道府県すべて）・none |
| `show` | string | `"none"` | 塗り分けた地域の上に値を書くか：none（書かない、既定）・value（中に入る地域だけ値を書く） |
| `unit` | string | `""` | 値の単位（凡例の見出しに書く） |
| `digits` | number | `0` | 値の小数桁 |
| `legend` | string | `""` | 凡例の見出し（例：人口）。unit があれば後ろに（単位）を足す |

地理・歴史の授業で場所を示すときに使う。子の JSON（どれも `step` `at` `tone` を持てる）：

- `regions`：`id`（`"01"`〜`"47"`）か `group`（`hokkaido` `tohoku` `kanto` `chubu` `kinki` `chugoku` `shikoku` `kyushu`）。`label`
- `values`：`{"13": 1406, …}` と `classes`（階級の下限、既定は 4 階級、5 つまで）で塗り分け。凡例に階級を書く
- `points`：`lon` `lat`（または `code` で県庁の位置）、`label`、`anchor`
- `flows`：`from` `to`（番号か `[経度, 緯度]`）の矢印。`via`（通る点 `[[経度, 緯度], …]`。海の道は沖に）、`label` `labelAt` `value`
- `shapes`：`polygon` か `line`（`[[経度, 緯度], …]`）。`label` `dash`

`labels`：`focus`（既定）・`all`・`none`。`show="value"` で入る地域に値を書く（既定は書かない）。

日本の範囲・東西南北の端・排他的経済水域を見せるときは layout="true"（小窓なし、本当の位置）

地図データ：Natural Earth（パブリックドメイン）を加工。

### `<m-map-world>`

Data example (child `<script type="application/json">`): `{"regions":[{"id":"JPN","tone":"emph","step":1},{"group":"africa","tone":"series-2","step":2}],"points":[{"lon":139.69,"lat":35.69,"label":"東京","step":3}],"flows":[{"from":[139.69,35.69],"to":"AUS","step":4}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `labels` | string | `"focus"` | 名前：focus（regions に書いた地域だけ）・all（名前が中に入る国すべて）・none |
| `grid` | string | `"none"` | none・equator（赤道）・graticule（30° ごとの経線・緯線と赤道） |
| `show` | string | `"none"` | 塗り分けた国の上に値を書くか：none（既定）・value（中に入る国だけ） |
| `unit` | string | `""` | 値の単位（凡例の見出しに書く） |
| `digits` | number | `0` | 値の小数桁 |
| `legend` | string | `""` | 凡例の見出し（例：人口）。unit があれば後ろに（単位）を足す |

世界地理・歴史の授業で国や都市の場所を示すときに使う。子の JSON（どれも `step` `at` `tone` を持てる）：

- `regions`：`id`（`"JPN"` など ISO の 3 文字か国名）か `group`（六州）。`label`
- `categories`：`label` と `ids`（国か州）。凡例に出す。4 区分まで
- `values`：`{"JPN": 72, …}` と `classes`（階級の下限）
- `points`：`lon` `lat`、`label`、`anchor`
- `flows`：`from` `to`（`[経度, 緯度]` か国）、`via` `label` `value` `bend`

継ぎ目は 30°W（大西洋を横切る矢印は描けない）。

地図データ：Natural Earth（パブリックドメイン）を加工。
