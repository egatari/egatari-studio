# m-nnet changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.11.0)

- New part: a neural network laid out in columns from the neuron counts (no coordinates). Neurons are combined circles or split into Σ (z) and f (a, with the activation's name). The forward pass goes layer by layer; `open` widens a combined layer into Σ | f; `focus` shows one neuron's incoming weights and its weighted sum. Edges can show |w| as width and the sign as solid or dashed. Wide layers show head, "⋮", tail. Checks the shapes, z = W·a + b and a = f(z) within the precision written. Backpropagation phases are reserved. Activation curves are left to m-curves.
