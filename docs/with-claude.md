<!-- i18n: pair=with-claude.ja.md sha256=43a3550692b0ceed -->
# Making Egatari lessons with Claude Code or Cowork

English | [日本語](with-claude.ja.md)

Ask Claude for a lesson in plain words. Claude writes the script (the script, `narration.md`) and the slides with their **steps** and **parts**, runs the quality checks, and gives you a folder you can open in Egatari Studio.

## What you get

Three skills in `skills/` do the work:

- `motion-slides` plans the lesson (it shows an outline first and writes only after you approve), then makes a working folder with `deck.html` (the slides) and `narration.md` (the script), and runs the quality checks. It can also make an Egatari file (editable).
- `motion-slides-video` turns the folder into a narrated video and an Egatari file with sound.
- `motion-components` writes a new animated part when no existing one fits.

## Install the skills

### Claude Code

Clone this repository, then link the skills into `~/.claude/skills/` (or a project's `.claude/skills/`). The skills find the repository from their real path, so keep the clone where it is:

```bash
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/motion-slides"       ~/.claude/skills/
ln -s "$PWD/skills/motion-slides-video" ~/.claude/skills/
ln -s "$PWD/skills/motion-components"   ~/.claude/skills/
```

On Windows, use the directory junctions in the [README](../README.md#using-it-with-claude-code).

### Cowork (the Claude desktop app)

Cowork does not read `~/.claude/skills/` on disk. It uses the skills turned on in your Claude account (Customize ▸ Skills, then upload a zip of a skill folder).
<!-- verify -->
We have not tried this with these skills. They run the repository's Node commands from the clone, so a zip may not be enough; if the upload does not work, make the lesson with Claude Code, or with a chat AI ([authoring with a chat AI](authoring-with-llms.md)).
<!-- verify -->

## The first request to type

> Make animated HTML slides for a 15-minute lesson on …, for … students. One speaker.

Answer Claude's questions, approve the outline, and wait for the quality checks to finish.

## Open the result in Studio

1. Open <https://studio.egatari.org/> in Chrome or Edge.
2. **Open ▾ → Open working folder…** and choose the folder Claude made. Or **Open ▾ → Open single file…** for an Egatari file (editable). An Egatari file (play only) cannot be edited.
3. Keep Studio open while Claude changes the folder; the preview reloads by itself. See [the editor](editor.md).

## Problems

Report them in [GitHub issues](https://github.com/egatari/egatari-studio/issues). In Claude Code you can also say "send feedback"; the skill drafts the issue and sends it only after you confirm.
