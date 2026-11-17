---
summary: Network layers and the forward pass; neurons whole or split into Σ | f
steps: input + 1 per whole, 2 per split layer
props:
  dur: s per step
  digits: decimals
  edges: plain | weight
  size: text px
example: {"layers": [{"n": 2, "label": "Input"}, {"n": 1, "label": "Output", "act": "step", "form": "split"}], "weights": [[[1, 1]]], "biases": [[-1.5]], "values": {"x": [1, 1], "z": [[0.5]], "a": [[1]]}}
---

Values from a script; checked: z = W·a + b, a = f(z). Curves: m-curves. 480px+.
<!-- llm: omit -->
- layer: `n`, `label`, `names` (left of inputs, right of outputs), `act` (identity, step, relu, sigmoid, tanh, softmax), `form` (combined | split). `weights[l]`: rows = next layer, columns = previous; `biases[l]`; `values.x`, `values.z[l]`, `values.a[l]`.
- steps (default: input, then a per layer; split layers z then a): `{"show": "x"}`, `{"layer": l, "phase": "z" | "a"}`, `{"open": l}`, `{"focus": [l, i]}` (incoming weights and the z = w·x + b line), `note`. `"delta"`/`"grad"` are reserved (backpropagation; reported, not drawn).
- Checks (data): shapes, z = W·a_prev + b, a = f(z) (softmax per layer), within the precision written. `edges="weight"`: width |w|, positive `--term` solid, negative `--emph` dashed. Up to 8 neurons per layer (fewer if the height is short), else head, "⋮", tail. No answer preview.
<!-- llm: end -->
<!-- llm: omit -->
Notes: keep values to about 2 decimals; draw activation curves beside it with m-curves.
<!-- llm: end -->
