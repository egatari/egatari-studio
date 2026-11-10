# Narration

## Attention Is All You Need {#s-cover}
[0] Today we read the Transformer paper.

## Scaled dot-product attention {#s-attn}
[0] Attention compares each query with every key.
[1] The output is softmax(Q*K/d) * V = weights * values, a weighted sum.
[concl] {mark:nowhere}Think of attention as a soft lookup table.

## Multi-head attention {#s-heads}
[0] We run several heads in parallel.
[concl] Several heads give several views of the same sentence.

## Positional encoding {#s-pos}
[0] The model has no recurrence, so we add the order to the input {note:say this slowly.
[concl] The order comes from the encoding.

## Why self-attention {#s-cost}
[0] Every token can reach every other token in one step.
[concl] Short paths make long-range learning easier.

## Summary {#s-wrap}
[0] Attention replaces recurrence, and training becomes highly parallel.
[4] This line belongs to a step the slide does not have.
