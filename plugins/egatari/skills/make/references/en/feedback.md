<!-- generated; do not edit by hand -->
# Report feedback when you finish

How to report a bug, something confusing, an idea, praise or an insight about Egatari as a public GitHub issue (egatari/egatari-studio). The make and studio skills use this same text.

## When

- When the user says “send feedback”, “report a bug” or “report this”.
- At the end of the work, when the quality check passed the first time or only after many fixes, you may ask once: “Shall I report what worked (and what did not) to Egatari?”. Go on only if the user says yes. Ask at most once per conversation, and do not ask again after a no.

**Do not gather material until the user agrees to send**: until the user says “send it” or “report it”, or answers yes to the question above, do not read the slides, the script, a diff or the quality check output for the report (reading them for the work itself is fine).

## Type

Choose one of the Type options of feedback.yml. Use the text as it is.

<!-- feedback-types -->
- `Bug / 不具合`: something does not work or breaks
- `Confusing / わかりにくい`: a step or a display is hard to follow
- `Idea / 提案`: a feature or a way of writing that would help
- `Praise / よかった点`: something that was good
- `Insight / うまくいったこと`: a way of writing or a part that worked while making something, and what did not
<!-- /feedback-types -->

## Steps

1. **Look for the same report first**: run `gh issue list -R egatari/egatari-studio --search "<words>" --state all` with words from the summary (a part name, words shown on the display). If a similar issue exists, suggest commenting there instead of opening a new one (`gh issue comment <number> -R egatari/egatari-studio --body-file <draft>`).
2. **No private content**: no slide text, script, paper content, audio, reference voice names, personal paths or addresses, or user names. Generalize if needed (“on a slide with many equations”).
3. **Include the versions** (so that the evaluation can recreate the situation):
   - Studio version: the output of `egatari --version`. When working in the Studio repository, the `version` in package.json and the short sha from `git rev-parse --short HEAD`. If there is only a file made in Studio, the `version` of `generator` in its deck-meta.
   - Instruction version: the value on the “Instruction version” line at the top of this skill. If the user used instructions copied in Studio, the “Instruction version” at the top of those instructions.
   - Parts library version: `default` in Studio's components2.lock.json. Leave it out if you cannot tell.
4. Write a draft with the fields of feedback.yml and **show the user the whole draft**:
   ```
   Title: [feedback] one-line summary
   ### Type
   Bug / 不具合            ← one of the types above
   ### What you did
   ### What happened (and what you expected)
   ### What you were making       ← these four only for Insight
   ### What worked
   ### What did not work
   ### Why you think so
   ### Version
   Studio 0.6.20 (1a2b3c4), instructions 027f5293, parts library 2.21.0
   ### Browser
   ### OS
   ### Context
   lang=en, via Claude Code (egatari:make)
   ```
   For Insight, write what was being made (generalized, like “15 minutes on statistics, slides with many equations”), the ways of writing or parts that worked, what did not, and why you think so; What you did and What happened may stay empty.
5. Before sending, say once: “The report becomes a public issue and is used to improve Egatari.” Send only when the user explicitly says to send it (if they ask for changes, change the draft and show it again). Pass the body as a file, not a long argument:
   ```bash
   gh issue create -R egatari/egatari-studio --title "[feedback] one-line summary" --label feedback --body-file <draft>
   ```
6. Tell the user the URL of the new issue.

## When gh is not available

When gh is missing, not logged in, or you cannot run commands (for example in an AI chatbot), build a URL with the fields filled in and give it to the user, who opens it and submits. Still say the line about the public issue before that.

```text
https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml&title=…&type=…&did=…&happened=…&version=…&os=…&context=…
```

- The parameter names are the field ids of feedback.yml (`type`, `did`, `happened`, `made`, `worked`, `didnt`, `why`, `version`, `browser`, `os`, `context`). Issue forms do not read `body`, so fill each field. Leave out empty fields.
- URL-encode each value (a space is `%20`, a line break `%0A`). `type` is the type text exactly as above.
- If the URL is longer than 6,000 characters, give the whole draft and the empty form URL <https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml> instead, and ask the user to paste the draft into the fields.
- Add that the same report can be searched for at <https://github.com/egatari/egatari-studio/issues?q=words>.
