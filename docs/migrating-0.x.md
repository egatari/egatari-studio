<!-- i18n: pair=migrating-0.x.ja.md sha256=6b36e8693953600a -->
# Moving a lesson from an earlier version to Egatari 1.0

English | [日本語](migrating-0.x.ja.md)

This page is written so that a person, or an AI coding agent such as Claude Code or Codex, can follow it step by step. You can point the agent at this page and say: "convert `<file>` to Egatari 1.0 by following this page".

## Do you need this?

You don't need it to **play** an old lesson: every Egatari file carries its own player, so a lesson made with an earlier version keeps playing as it is. You also don't need it to **edit** an old lesson: the earlier editor stays available at its versioned address, for example `https://studio.egatari.org/v0.4.8/` (versioned addresses exist from v0.4.1 on; `https://studio.egatari.org/versions.json` lists them). When you open such a file, the current editor says so, plays it, and offers **Open in the earlier Studio** and **Open the migration guide** (this page).

You need it only if you want to edit an old lesson **in the current editor**.

A file is from an earlier version when its index (the `egatari-index` block) or its `deck-meta` block has no `player` member.

## What changed (format spec, "The 1.0 file shape")

| Before 1.0 | In 1.0 |
|---|---|
| A slide could be keyed by its heading text, a hand-written `data-key` or its position | Every slide has an `id`; narration headings carry `{#id}` |
| `generator` named the software that wrote the file and also the player inside it | `player` names the bundled player; `generator` names the producer only |
| No network policy in the file | A fixed Content-Security-Policy `<meta>` at the top of every file |
| `{zoom:…}` in narration (camera, draft) | Removed; zooming is a part's effect |
| `?mode=lecture` | Removed; use `talk` with the "show later steps faintly" option |
| `:name:` in the article | `:label:` only |

The lesson's identity (`docId`), its text, its audio and its rights information do not change.

## Steps

You need a copy of the current Egatari Studio repository (`npm ci --ignore-scripts` done) and, for step 1, the earlier editor.

1. **Unpack the old file with the earlier version.** Either open it in the earlier editor (`https://studio.egatari.org/v0.4.8/`, or the version that made it if `versions.json` lists it) and use **Export ▾ → Export working folder…**, or check out that version's tag of Egatari Studio and run:

   ```bash
   npm run portable -- unpack old.ega.html lesson/
   ```

   The folder gets `deck.html`, `narration.md`, the audio, `audio/manifest.json` and `egatari.json` (which holds the `docId`).

2. **Give every slide an id.** In the current Studio checkout:

   ```bash
   npm run ids -- lesson/
   ```

   This adds `id="s-xxxxxx"` to every slide without one, rewrites each narration heading to `## <heading> {#id}`, and moves the keys in `audio/manifest.json`, `timeline.json` and `comments.json` to the new ids, so the audio stays attached. It also updates `data-morph` references, and keeps a backup of every file it rewrites in `lesson/.cache/edits/` (which `pack` leaves out). It does not re-synthesize audio. Run it again: the second run must change nothing.

3. **Remove what 1.0 no longer has.** In `deck.html`, `narration.md` and `article.md` (if present):
   - delete hand-written `data-key="…"` attributes on slides (the ids replace them);
   - delete `{zoom:…}` marks from the narration. If a zoom carried meaning, tell the author; a lens part can do it later;
   - change links that contain `?mode=lecture` to `?mode=talk`;
   - in `article.md`, change `:name:` to `:label:`;
   - you can delete `data-egatari-seed`; it has no effect.

   Change nothing else. Do not reword the narration, rename slides or touch the audio.

4. **Check and rebuild with the current Studio.**

   ```bash
   npm run check -- lesson/deck.html
   npm run portable -- pack lesson/ -o lesson.ega.html
   ```

   Fix only errors that the steps above caused. Warnings about wording or layout are the author's choice and are not part of the move. `pack` may also say that a theme is pinned to the version the lesson recorded (for example `theme pinned: default 1.1.0 …`): that is expected, because the move keeps the lesson's look. Do not update themes or parts as part of the move.

5. **Confirm.** The new file's index has `player`, and `docId` equals the old file's. Open it in the current editor, step through every slide, and compare the final step of each slide with the old file. Tell the author which slides, if any, look different.

## When to stop and ask

Stop and ask the author, rather than guess, when two slides would get the same key, when `npm run ids` refuses the folder, when a slide only made sense with a zoom, or when the check reports something the steps above did not cause.
