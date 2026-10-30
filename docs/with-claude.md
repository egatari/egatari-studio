<!-- i18n: pair=with-claude.ja.md sha256=9741947b80d13227 -->
# Making Egatari lessons with Claude Code or Cowork

English | [日本語](with-claude.ja.md)

Ask Claude for a lesson in plain words. Claude writes the script (the script, `narration.md`) and the slides with their **steps** and **parts**, runs the quality checks, and gives you a folder you can open in Egatari Studio.

## What you get

Two plugins share one marketplace:

- The light `egatari` contains only `egatari:make` and needs no Node. It shows an outline, then writes `deck.html` (slides) and `narration.md` (script) after you approve.
- `egatari-studio` contains only `egatari-studio:studio`, with kit, vendor and themes. It handles local quality checks, builds, writing parts, and exporting video with existing audio.

## Install the skills

### Claude Code

First delete the old `~/.claude/skills/motion-*` entries, including any in a project's `.claude/skills/`. To use studio, add egatari too:

```text
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
/plugin install egatari-studio@egatari
```

The first two lines are enough for authoring alone. The studio skill guides the first `npm ci`. Update with `/plugin update egatari@egatari` and `/plugin update egatari-studio@egatari`.

### Chat Claude and Cowork

In Studio, choose **Download the AI skill** beside **Copy the instructions** in **New…**, or in **Help (?)**. Upload the downloaded `egatari-make-<version>-ja.zip` or `egatari-make-<version>-en.zip` to install only make. Studio offers the ZIP for its current UI language and running version, served from its own site. The single file offline editor carries both languages too. Developers can also create a ZIP with `node tools/make-llm-guide.mjs --zip out/release --lang ja` (or `--lang en`). Its `make/SKILL.md` and references come from the same generator as `plugins/egatari/skills/make/`.

No commands are needed: paste the two output blocks into Studio. If Studio's pack version differs from the skill's version, add it again with **Download the AI skill** in Studio.

When authoring is done, use the studio skill for checks and builds if egatari-studio is installed. Otherwise, open the working folder at <https://studio.egatari.org/> in Chrome or Edge. On Mac, Safari uses the single file (.ega.html) path.

## The first request to type

> Make animated HTML slides for a 15-minute lesson on …, for … students. One speaker.

Answer Claude's questions, approve the outline, and use studio for the quality checks.

## Open the result in Studio

1. Open <https://studio.egatari.org/> in Chrome or Edge.
2. **File ▾ → Work in a folder…** and choose the folder Claude made. Or **File ▾ → Open…** for an Egatari file (editable). An Egatari file (play-only) cannot be edited.
3. Keep Studio open while Claude changes the folder; the preview reloads by itself. See [the editor](editor.md).

## Problems

Report them in [GitHub issues](https://github.com/egatari/egatari-studio/issues). In Claude Code you can also say "send feedback"; the skill drafts the issue and sends it only after you confirm.
