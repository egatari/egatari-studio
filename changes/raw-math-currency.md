### Fixed

- Quality check: English amounts of money such as `$200`, `$1.2M`, `$5–10`, `costs $3 and $4` or `US$30` are no longer reported as unrendered math (`rawMath`). A `$ … $` pair counts only when its content looks like math (a `\` command, `^`, `_`, `=`, a letter next to an operator, or a single variable); `\(` and `\[` are always reported (kit/core/raw-math.mjs)
