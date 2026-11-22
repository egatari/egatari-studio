<!-- generated; do not edit by hand -->
# algo parts

Instruction version: df0bd6e6

| part | what it shows | steps | data shape |
|---|---|---|---|
| `<m-network>` | Search, tours: current, frontier, visited, chosen edges, total | #steps | `{directed?:bool,complete?:bool,stochastic?:bool,frontierKind?:"queue"\|"stack"\|"pq"\|"set",total?:{label?,unit?:str,digits?:int,check?:bool,of?:"path"\|"taken"},nodes?:{id:str,x:num,y:num,label?,shape?:"circle"\|"ellipse"\|"box",observed?:bool}[],edges?:{from:str,to:str,w?:num,bi?:bool}[],plates?:{nodes:str[],label?}[],layout?:"trellis",states?:str[],T?:int,transitions?:{from:str,to:str,w?:num}[],steps:{current?:str\|null,visited?:str[],frontier?:(str\|any[])[],parent?:object,take?:[str,str][],drop?:[str,str][],total?:num,note?}[]} (nodes or layout)` |

### `<m-network>`

Data example (child `<script type="application/json">`): `{"nodes":[{"id":"A","x":0,"y":0},{"id":"B","x":4,"y":0}],"edges":[{"from":"A","to":"B","w":4}],"steps":[{"current":"A","frontier":["B"]},{"current":"B","take":[["A","B"]],"total":4}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `24` | text px |
| `weights` | bool | `true` | show w |

From a script; 440px alone, 380px under text. Unset fields persist; `[["C", 3]]` keyed; `take`/`drop` edit chosen edges. `total`: path to `current` if `parent`, else Σ taken `w` (`w` at its precision); counts: `total.check: false`. Graphical models: `node` `shape` (ellipse, box), `observed`; edge `bi`; `plates`. HMM: `layout: "trellis"`.
