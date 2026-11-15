---
summary: A checklist: items listed, one mark (✓ or ×) drawn per step. The marks are slide content; nothing a viewer does is stored
steps: max item step (default 1 item = 1 step)
props:
  reveal: items appear with their step
  per-step: items per step (0 = all)
  dur: mark-drawing seconds
  stagger: mark offset (s)
  size: label px (≥ 24)
example: {"items": [{"label": "Name badge on"}, {"label": "Hands washed", "note": "30 s"}]}
---

For checks done one at a time: training steps, checks before work, what to bring.

Child JSON: `{"items": [...]}`.

- item: `label` (`\n` = 2 lines), `note`, `mark` (`check`, `cross`, `none`), `step`, `at`
- The marks are the author's; a viewer cannot tick them and nothing is stored.
<!-- llm: omit -->
- ✓ is `--term`, × is `--emph`, drawn stroke by stroke. Items that do not fit are reported as size.
<!-- llm: end -->
