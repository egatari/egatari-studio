# Egatari conformance fixtures

| Directory | Content | Status |
|---|---|---|
| `index/valid/`, `index/invalid/` | index JSON documents; every `invalid/` file must be rejected by the schemas | present |
| `input-hash/` | `narration.md` and `expected.json` with the canonical string and `inputHash` per step (§5.4) | present |
| `documents/` | 30 complete `.ega.html` files, each with `<name>.expect.json` describing what a conforming reader must do | **1.0 shape**: written by Egatari Studio v0.6.0-rc.1 (commit f112bb4, player `egatari-player` 1.0.0; `documents/SOURCE.json`), from the release candidate, before v0.6.0. Two exceptions: `legacy-heading-keys` is kept from Studio v0.3.1 on purpose (no `player`, heading-text keys: the pre-1.0 draft case, which the current writer no longer produces), and `idless-source` is its 1.0 counterpart (a source written without slide ids; ids are assigned at export and the keys are slide ids) |

## 1.0-shape document fixtures (`documents-1.0/`)

`minimal.ega.html` is examples/minimal written by Egatari Studio's 1.0-shape build (player `egatari-player`, file policy §4.2). The others are derived from it by `node tools/derive-1.0-fixtures.mjs`, each a single documented edit; edits to the index recompute its `data-sha256`.

| Name | Edit | Expected |
|---|---|---|
| `minimal` | — | reads, conforms, plays |
| `missing-player` | `player` removed from the index and `deck-meta` | read as a pre-1.0 draft (`preDraft`); plays; a 1.0 editor MAY refuse to edit |
| `no-policy` | the policy `<meta>` removed | reads and plays; not conforming (`no-policy`) |
| `policy-loosened` | `connect-src https://example.org` with no extension declaring it | reads and plays; not conforming (`policy-extra-source`) |
| `policy-reordered` | the same directives in reverse order | conforming (parsed comparison) |
| `foreign-player` | `player` is `example-player 2.3.4` | reads and plays; a tier A edit keeps `player` and `generator`; a rebuild warns that the player changes |

Still to come (needs a producer that writes them): `book-only` (an article without slides). The pre-1.0 draft case is `documents/legacy-heading-keys` (a Studio v0.3.1 file).

## Planned document fixtures

Each fixture is a small `.ega.html` file and a `expect.json` describing what a conforming reader must do.

| Name | Purpose | Expected reader behavior |
|---|---|---|
| `minimal-play-only` | runtime layer only | plays; editor reports "no source" and offers nothing to edit |
| `minimal-portable-core` | 2 slides, 1 narrated step with MP3, Core profile | plays offline from `file://`; editor opens it, tier A edit re-exports with untouched bytes identical |
| `portable-extended` | one embedded component | editor warns before opening, runs the component only in the sandbox |
| `legacy-heading-keys` | no slide ids | keys by heading text; migration assigns ids |
| `aac-legacy-audio` | AAC audio record | plays; re-export keeps the AAC bytes |
| `stale-audio` | narration changed after synthesis | editor marks the step stale, keeps the audio |
| `recorded-unsynced` | `kind:"recorded"`, `sync:"none"` | player uses unsynchronized timing; CLI does not overwrite |
| `script-breakout` | source containing `</script>` and `<!--` | round-trips byte-identically |
| `bad-index-hash` | `data-sha256` mismatch | editor refuses; player still plays |
| `bad-blob-hash` | one blob corrupted | editor refuses |
| `missing-chunk` | chunk listed but absent | editor refuses |
| `path-traversal` | `files` key `../x`, `CON.txt`, case collision | editor refuses before building any workspace |
| `future-major` | `version.major = 2` | editor refuses with an upgrade message; player plays; source extraction offered |
| `unknown-required-feature` | `requires: ["something-v9"]` | editor refuses; player plays |
| `unknown-optional-member` | extra member in index | editor preserves it through a tier A edit |
| `canary-script` | runtime layer sets a global when executed | importing into the editor never sets it |
| `missing-player` | no `player` in index and `deck-meta` | treated as a pre-1.0 draft (below) |
| `no-policy` | no file policy (§4.2) | not conforming; validator reports it; player still plays |
| `policy-loosened` | an extra `connect-src` host that no declared extension allows | not conforming; validator reports the extra source |
| `policy-reordered` | the baseline policy with directives in another order | conforming (parsed comparison) |
| `pre-1.0-draft` | a file from an earlier Working Draft | plays with its bundled player; a 1.0 editor MAY refuse, saying it is an earlier draft and pointing to an earlier editor or migration instructions |
| `book-only` | an article and no slides | plays the read face; no steps, narration or audio; editor edits the article |
| `tier-a-keeps-player` | a file whose `player` is not the editor's | a narration edit keeps the bundled player, `player` and `generator` byte for byte |
| `source-mismatch` | `deck-meta.sourceSha256` ≠ index | editor warns and disallows tier A |
| `oversize` | index > 4 MiB | editor refuses before allocation |
| `mislabelled-core-script` | `profile: core` but an archived file has `<script>` | editor treats as Extended (asks before running code) or rejects |
| `event-handler-only` | code only in an `onerror` attribute | detected as code |
| `mislabelled-core-onerror` | `profile: core` with an `onerror` handler | as `mislabelled-core-script` |
| `logical-size` | 3000 paths sharing one 32 MiB blob | editor refuses before per-path allocation |
| `scorm12-package` | the SCORM 1.2 ZIP of `minimal-portable-core` | `index.html` is byte-identical to the source file; manifest validates |
