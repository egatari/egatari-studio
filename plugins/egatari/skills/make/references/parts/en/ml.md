<!-- generated; do not edit by hand -->
# ml parts

Instruction version: 049c5f95

| part | what it shows | steps | data shape |
|---|---|---|---|
| `<m-classify2d>` | sklearn classifiers in 2-D: regions, contours, SVs, Voronoi, tree splits, k-means | points → regions → contours → SVs | `{axes:{x:{label?,range:[num,num]},y:{label?,range:[num,num]}},classes?:{id:int,label?}[],points:(num\|null)[][],grid?:{nx:int,ny:int,labels?:str\|any[]},fields?:{name?:str,class?:int,values:any[],levels:num[],style?:("solid"\|"dash")[],labels?:bool}[],sv?:int[],voronoi?:{seeds:(num\|null)[][]},tree?:{nodes:{id:str,feature?:0\|1,threshold?:num,left?:str,right?:str,class?:int}[]},kmeans?:{iters:{centroids:[num,num][],assign:int[]}[]}}` |
| `<m-contour>` | Contours of f(x, y) by level, gradient arrows, a descent path by point | levels (all: 1) → gradient → path points | `{f?:str,label?,grid?:{nx:int,ny:int,values:any[]},range:{x:[num,num],y:[num,num]},axes?:{x?:str,y?:str},levels:num[],gradient?:{at:[num,num][],scale?:num,tangent?:bool},path?:[num,num][],monotone?:bool,equal?:bool} (f or grid)` |
| `<m-nnet>` | Network layers and the forward pass; neurons whole or split into Σ \| f | input + 1 per whole, 2 per split layer | `{layers:{n:int,label?,names?:str[],act?:"identity"\|"step"\|"relu"\|"sigmoid"\|"tanh"\|"softmax",form?:"combined"\|"split"}[],weights?:num[][][],biases?:num[][],values?:{x?:num[],z?:num[][],a?:num[][]},steps?:{show?:"x",layer?:int,phase?:"z"\|"a"\|"delta"\|"grad",open?:int,focus?:[int,int],note?}[]}` |

### `<m-classify2d>`

Data example (child `<script type="application/json">`): `{"axes":{"x":{"label":"x₁","range":[0,4]},"y":{"label":"x₂","range":[0,3]}},"classes":[{"id":0,"label":"A"},{"id":1,"label":"B"}],"points":[[1,1,0],[1.2,2,0],[2.8,1.1,1],[3.1,2.4,1]],"grid":{"nx":5,"ny":4,"labels":"0*2 1*3 0*2 1*3 0*2 1*3 0*3 1*2"}}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `24` | text px |
| `marker` | number | `8` | marker px |

### `<m-contour>`

Data example (child `<script type="application/json">`): `{"f":"x**2 + 3*y**2","range":{"x":[-3,3],"y":[-2,2]},"levels":[1,2,4,8],"gradient":{"at":[[1,1]]},"path":[[2.5,1.5],[1.5,0.3],[0.9,0.06]],"monotone":true}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `24` | text px |
| `by` | enum | `"level"` | level or all |

`f` (arithmetic in x, y) or a script's `grid`; `levels` (≤8), `gradient.at`, `path` from a script. Size: with `equal` and a square range, about 740 px wide for 440 px high (a panel on the right); to fill the width, widen x or set `equal: false`.

### `<m-nnet>`

Data example (child `<script type="application/json">`): `{"layers":[{"n":2,"label":"Input"},{"n":1,"label":"Output","act":"step","form":"split"}],"weights":[[[1,1]]],"biases":[[-1.5]],"values":{"x":[1,1],"z":[[0.5]],"a":[[1]]}}`

| prop | type | default | meaning |
|---|---|---|---|
| `digits` | number | `2` | decimals |
| `edges` | string | `"plain"` | plain \| weight |
| `size` | number | `24` | text px |

Values from a script; checked: z = W·a + b, a = f(z). Curves: m-curves. 480px+.
