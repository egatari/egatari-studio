# m-nnet changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.1.0 (components 2.15.0)

- Marks what it draws for Studio's geometry check (R-geometry): each neuron's body (`n<layer>-<index>`) as a box with its numbers and Σ / f as labels and its input or output name as a label outside it, each line between layers as an edge, and the weight labels of a focus as haloed labels of their edge. The drawing does not change.

## 2.0.1 (components 2.14.0)

- Requires base 1.3.0 (sub- and superscripts in `mtext` at 0.7 of the text, at least 17 px).

## 2.0.0 (components 2.11.0)

- New part: a neural network laid out in columns from the neuron counts (no coordinates). Neurons are combined circles or split into Σ (z) and f (a, with the activation's name). The forward pass goes layer by layer; `open` widens a combined layer into Σ | f; `focus` shows one neuron's incoming weights and its weighted sum. Edges can show |w| as width and the sign as solid or dashed. Wide layers show head, "⋮", tail. Checks the shapes, z = W·a + b and a = f(z) within the precision written. Backpropagation phases are reserved. Activation curves are left to m-curves.
