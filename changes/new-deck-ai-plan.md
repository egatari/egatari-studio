### Added

- New…, step 2 asks **Is your chat AI a free or a paid plan?** (お使いのチャットの AI は無料版ですか、有料版ですか). **Free plan** (the default) copies today's light instructions: the common body plus the subjects you choose. **Paid plan** copies the parts of every subject and hides the subject choice. The choice is recorded as `plan` (`free` or `paid`) in `egatari.json` `studio.newDeck`; an earlier record without it reads as `free` (`AI_PLANS`, `planOf`, `seriesForChoice` in `kit/core/new-deck.mjs`).
- Size caps per plan for the generated instructions: `PACK_CAP_KB` in `kit/core/llm-pack-assemble.mjs` (free: 40 KB with one subject, 59 KB with any set; paid: `PAID_PACK_KB`, 120 KB, provisional). Tests check every subject set, and the sweep over purposes turned off now runs in both plans and checks each plan's cap.
- New…, Guides (手引き) gets three subcategories with their structure templates: Manual (マニュアル: goal → the steps, one at a time → common pitfalls), Rules and regulations (規程・法令の説明: what the rules are about → who they apply to and when → what you must do → the original text and its date) and Information and orientation (案内: the situation → a list to look up by item or situation → where to ask; for example waste sorting, using the library, evacuation routes, orientation for new students or staff, course registration).

### Changed

- New…: the 14 purpose tiles are in a fold, closed by default, **Choose representations the AI should not use (optional)** (AI に使わせない表し方を選ぶ（選ばなくてよい）), whose summary says how many are off. The tiles work as before (they only turn representations off) under both plans.

### Removed

- New…: the size and token estimate under Content (with its 32k-token warning) and the sizes next to each subject. The AI plan question replaces them.
