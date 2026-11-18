---
name: m-nnet
display: ニューラルネット / Neural network
version: 2.1.0
series: info
tier: specialized
set: ml
summary: ニューラルネットの層を並べ、前向きの計算を層ごとに見せる。ニューロンはまとめた丸か、Σ（重み付きの和）と f（活性化関数）に分けた形
steps: 入力 1 ＋ まとめた層 1・分けた層 2（steps を書けばその数）
purposes: model, process
props: dur, digits, edges, size
---

値（重み・バイアス・z・a）は計算を走らせたスクリプトの出力を書く。パーツは z = W·a + b と a = f(z) を確かめる。活性化関数の曲線は m-curves で描く。高さ 480px 以上。

<!-- llm: omit -->
パーセプトロン、多層のネットワーク（MLP）の前向きの計算、重み付きの和と活性化関数の 2 つの操作を見せるときに使う。

子の JSON：`{"layers": [...], "weights": [...], "biases": [...], "values": {"x", "z", "a"}, "steps": [...]}`。

- layer：`n`（ニューロンの数）、`label`（入力層など。列の下）、`names`（入力の左・出力の右に書く名前。`*x*_1`）、`act`（`identity`・`step`・`relu`・`sigmoid`・`tanh`・`softmax`）、`form`（`combined`：まとめた丸、`split`：Σ と f に分けた形）
- `weights[l]`：層 l から l+1 への行列（行は次の層のニューロン、列は前の層）。`biases[l]`：次の層の数。`values.x`：入力、`values.z[l]`・`values.a[l]`：入力の後の層ごと
- steps（書かなければ、入力 → 層ごとに a、分けた層は z → a）：`{"show": "x"}`、`{"layer": l, "phase": "z" | "a"}`、`{"open": l}`（まとめた丸を Σ と f に開く）、`{"focus": [l, i]}`（層 l のニューロン i に入る辺と重み、下に z = w·x + b の式）、`note`（下の行の説明）
- `"phase": "delta"`・`"grad"`（誤差逆伝播）は予約。今は data で知らせて描かない
- 確かめること（data）：重み・バイアス・値の形、z = W·a_前 + b、a = f(z)（softmax は層全体）。値を丸めて書いたときは、その桁の分だけ違ってよい
- 色：`edges="weight"` で辺の太さが |w|、正は `--term` の実線、負は `--emph` の点線（色だけに頼らない）。今計算している層に入る辺を濃くする。値の出たニューロンは `--accent2` の縁。分けた形の層は列の上に「Σ → ReLU」
- 1 層に見せるニューロンは 8 まで（高さに入らなければ減る）。多ければ先頭と末尾を見せ、間を「⋮」。隠れた値は読み上げの要約にある
- 先のステップは薄く見せない（答えになるので）
<!-- llm: end -->

サンプルは `demo.html`（AND のパーセプトロン、3–4–4–2 のネットワーク、隠れ層を Σ と ReLU に分けて見る）。重みは架空、値は `tools/nnet-demo.py`（numpy）の出力。

<!-- llm: omit -->
注意

- 値は小数 2 桁くらいにする（桁が多いと丸が大きくなり、1 列に入るニューロンが減る）
- 活性化関数の形を見せたいときは、隣に m-curves で曲線を描く（このパーツは名前だけ出す）
<!-- llm: end -->
