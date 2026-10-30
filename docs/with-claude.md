<!-- i18n: pair=with-claude.ja.md sha256=41ac44e642b59530 -->
# Making Egatari lessons with Claude Code or Cowork

English | [日本語](with-claude.ja.md)

Ask Claude for a lesson in plain words. Claude writes the script (the script, `narration.md`) and the slides with their **steps** and **parts**, runs the quality checks, and gives you a folder you can open in Egatari Studio.

## What you get

Three skills in `skills/` do the work:

- `egatari:make` plans the lesson (it shows an outline first and writes only after you approve), then makes a working folder with `deck.html` (the slides) and `narration.md` (the script), and runs the quality checks. It can also make an Egatari file (editable).
- `egatari:video` exports a working folder or single file (.ega.html) with existing audio as video (CLI only).
- `egatari:parts` writes a new animated part when no existing one fits (CLI only).

## Install the skills

### Claude Code

First delete the old `~/.claude/skills/motion-*` entries, including any in a project's `.claude/skills/`. In Claude Code, run:

```text
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
```

This installs all three skills with kit, vendor and themes. The skill guides the first `npm ci`. Update with `/plugin update egatari@egatari`.

### Chat Claude and Cowork

Install only make as a skill (ZIP `skills/make/` together with its references and upload it). No commands are needed: paste the two output blocks into Studio. Parts and video are CLI only. If Studio's pack version differs from the skill's version, reinstall the newer make skill. Downloading a versioned skill ZIP from Studio is not implemented in this release.

## The first request to type

> Make animated HTML slides for a 15-minute lesson on …, for … students. One speaker.

Answer Claude's questions, approve the outline, and wait for the quality checks to finish.

## Open the result in Studio

1. Open <https://studio.egatari.org/> in Chrome or Edge.
2. **File ▾ → Work in a folder…** and choose the folder Claude made. Or **File ▾ → Open…** for an Egatari file (editable). An Egatari file (play-only) cannot be edited.
3. Keep Studio open while Claude changes the folder; the preview reloads by itself. See [the editor](editor.md).

## Problems

Report them in [GitHub issues](https://github.com/egatari/egatari-studio/issues). In Claude Code you can also say "send feedback"; the skill drafts the issue and sends it only after you confirm.
