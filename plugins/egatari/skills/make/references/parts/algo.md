<!-- generated; do not edit by hand -->
# algo のパーツ

指示のバージョン：18a79335

| パーツ | 内容 | steps | データの形 |
|---|---|---|---|
| `<m-network>` | グラフの探索（幅優先・ダイクストラなど）や巡回路を 1 ステップずつ。今の頂点・候補・訪れた頂点、選んだ辺、合計 | steps の数 | `{directed?:bool,complete?:bool,stochastic?:bool,frontierKind?:"queue"\|"stack"\|"pq"\|"set",total?:{label?,unit?:str,digits?:int,check?:bool,of?:"path"\|"taken"},nodes?:{id:str,x:num,y:num,label?,shape?:"circle"\|"ellipse"\|"box",observed?:bool}[],edges?:{from:str,to:str,w?:num,bi?:bool}[],plates?:{nodes:str[],label?}[],layout?:"trellis",states?:str[],T?:int,transitions?:{from:str,to:str,w?:num}[],steps:{current?:str\|null,visited?:str[],frontier?:(str\|any[])[],parent?:object,take?:[str,str][],drop?:[str,str][],total?:num,note?}[]} (nodes or layout)` |

### `<m-network>`

データ（子の `<script type="application/json">`）の例: `{"nodes":[{"id":"A","x":0,"y":0},{"id":"B","x":4,"y":0}],"edges":[{"from":"A","to":"B","w":4}],"steps":[{"current":"A","frontier":["B"]},{"current":"B","take":[["A","B"]],"total":4}]}`

| 値 | 型 | 既定 | 意味 |
|---|---|---|---|
| `size` | number | `24` | 字の大きさ（px、24 以上） |
| `weights` | bool | `true` | 辺の重みを書く |

状態と合計は、探索を走らせたスクリプトの出力を書く。高さは本文がこの図だけなら 440px、上に文があれば 380px。書かない欄は前のステップのまま。優先度付きの `frontier` は `[["C", 3]]`、`take`・`drop` は選んだ辺を増減する。`total` は `parent` があれば `current` までの道のり、なければ選んだ辺の `w` の和（`w` は `total` と同じ桁で書く）。数など和でない `total` には `total.check: false`。グラフィカルモデル・パス図：`node` の `shape`（`ellipse`・`box`）と `observed`、辺の `bi`、`plates`。HMM の格子は `layout: "trellis"`。
