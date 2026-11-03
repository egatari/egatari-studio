---
name: motion-slides
description: "Moved notice only for setups that symlinked ~/.claude/skills/motion-* before the plugin existed (移行用の知らせだけ)。 Do NOT use this to make lessons: use egatari:make and egatari-studio:studio. 先にプラグインを入れた人は無視。 Read only if the user wanted HTML slides, motion-slides and this was found through ~/.claude/skills/motion-*; it says how to install the plugin."
---

Always reply in the language the user writes in.

**egatari-studio:motion-* としてこれを読んでいる（egatari-studio プラグインが入っている）なら、このスキルは無視して、egatari:make か egatari-studio:studio を使うこと。**

**If you are reading this as egatari-studio:motion-* (the egatari-studio plugin is installed), ignore this skill and use egatari:make or egatari-studio:studio.**

# 移動しました / Moved

このスキルは egatari プラグインに移りました。`~/.claude/skills/motion-*` を消して、次を実行してください。

This skill moved into the egatari plugin. Delete `~/.claude/skills/motion-*` and run:

```
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
/plugin install egatari-studio@egatari
```
