### Migration

- If you followed the old README and symlinked `~/.claude/skills/motion-*` (motion-slides, motion-slides-video, motion-components) to a clone,
  those links are dead after pulling and the skills disappear. The skills moved into the plugin: delete `~/.claude/skills/motion-*`,
  then in Claude Code run `/plugin marketplace add egatari/egatari-studio`, `/plugin install egatari@egatari` and `/plugin install egatari-studio@egatari`.
  古い README どおり `~/.claude/skills/motion-*` を clone へシンボリックリンクしていた場合、pull するとリンクが切れてスキルが消えます。
  `~/.claude/skills/motion-*` を消し、上の 3 つのコマンドを Claude Code で実行してください

### Added

- `egatari doctor` reports `~/.claude/skills/motion-*` entries that are dead links or only a moved notice, with the same steps. It deletes nothing
- For this release, stub skills at the old paths `skills/motion-slides`, `skills/motion-slides-video` and `skills/motion-components` tell an agent
  that finds them where to install the plugin
