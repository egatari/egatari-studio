<!-- i18n: pair=video.ja.md sha256=299344cfd81970d1 -->
# Making a video (TTS → render → canon)

English | [日本語](video.ja.md)

From a deck (`deck.html` + `narration.md`), this makes per-step videos and a lesson bundle for canon. The rules are in [contract.md](contract.md) §4–6.
The list of TTS and render options and environment variables is in [reference.md](reference.md#tts).

canon is the TML lab's lecture delivery system. The output is a Marp-style md plus an mp4/png per frame (page), so other systems that accept the same format can use it too.

## Requirements

- node (after `npm install`), ffmpeg / ffprobe, [uv](https://docs.astral.sh/uv/) (the Python environment for TTS, `tts/pyproject.toml`)
- An Irodori-TTS server (OpenAI-compatible HTTP API). Only these two endpoints are used
  - `GET  {IRODORI_URL}/v1/models`: checks that it is running
  - `POST {IRODORI_URL}/v1/audio/speech`: synthesizes one line at a time. The body is JSON
    `{"model": "mlx-community/Irodori-TTS-v4.1-Small-fp16", "input": "<sentence>", "ref_audio": "<path to the reference wav>", "response_format": "wav"}`.
    `ref_audio` is a path that the server reads (if the server is on another machine, a path on that machine)
- The default reference voices `bob` and `alice` (and `alice_en`, `bob_en`) are synthetic voices included in `tts/voices/` ([where they come from](../tts/voices/README.md)). For other voices, put a wav file at `<reference voice folder>/<name>.wav` and refer to it by name
- To check the bundle with canon's parser, the canon repository and bun (without them, only that check is skipped)

| Environment variable | Meaning | Default |
|---|---|---|
| `IRODORI_URL` | the Irodori-TTS server | `http://localhost:8882` |
| `IRODORI_REF_DIR` | the reference voice folder (`--ref-dir` takes precedence) | `tts/voices/` |
| `MOTION_YOMI` | the reading dictionary (`--yomi` takes precedence) | `tts/yomi.yaml` |
| `CANON_DIR` | the canon repository (`--canon` takes precedence). Used for export-canon's parser check | none (the check is skipped) |

## Steps

```bash
D=examples/mydeck          # the folder with deck.html and narration.md

# 1. build (to check the timeline; there is no audio yet)
node kit/build.mjs $D/deck.html

# 2. TTS (Irodori-TTS)
uv run --project tts python tts/synth.py $D --voices expert=bob,novice=alice
#    To try the pipeline offline, --dry-run (silence, length estimated at 7.5 characters/s). For only some steps, --only "更新の式:2,更新の式:concl"

# 3. build again (reads audio/manifest.json and puts the audio lengths and cues into the timeline)
node kit/build.mjs $D/deck.html

# 4. render (1280x720 × scale; 1.5 gives 1920x1080)
node render/render.mjs $D/out/deck.html --out $D/video [--fps 30] [--scale 1.5] [--full]

# 5. canon bundle
CANON_DIR=<canon repository> node render/export-canon.mjs $D --render $D/video --out $D/bundle
#    → upload with the command it prints (check first with bun tools/upload-lesson.ts … --dry-run in the canon repository)
```

## What each step produces

| Step | Output |
|---|---|
| tts/synth.py | `audio/seg_<digest>.wav`, `audio/seg_<digest>.json` (length, cues, the text passed to TTS), `audio/manifest.json` `{segments:{"key:step":{file,dur,cues,digest,engine}}}` |
| render.mjs | `clip_NNNN.mp4` (H.264 yuv420p, constant frame rate, faststart, AAC 44.1 kHz), `clip_NNNN.png` (final state), `timeline.out.json`. With `--full`, `full.mp4`; if there are two or more chapters (`sec` slides), `chapter_NN.mp4` |
| export-canon.mjs | `<name>_with_narration.md`, `clips_per_page/clip_NNNN.mp4`, `stills/clip_NNNN.png`, `timeline.out.json` |

- NNNN is the serial number in the timeline (starting at 0) = the seq of the canon chapter. 1 step = 1 page = 1 chapter
- In the md, step 0 is a new slide and steps 1 and later are `<!-- _paginate: hold -->`. The narration is `Expert:` / `Novice:` lines inside `<!-- 口述原稿（コマN）：` (lines without a speaker are Expert), using the display text (`{cue}` removed, `{φ|ファイ}` as φ)
- export-canon checks the number of pages and the speaker lines with its own rules. If `CANON_DIR` (`--canon`) is set, it also runs canon's own parser (`src/server/marp.ts`) with bun and checks that the numbers of chapters, slides and frames, the titles and the number of narration lines match (without it, it says so in one line and skips the check). A video over 80 MB or a line without a speaker is an error. A page without narration, or leftover dry-run audio, is a warning
- `start_ms` / `end_ms` / `text` in `timeline.out.json` are times on the joined video (the cumulative lengths rounded to whole frames). They can be used as they are for `transcript_segment` in recording mode

## Voices

`--voices` > `<deck>/voice.json` (`{"expert": "bob", "novice": "alice"}`) > the defaults (bob for single-speaker mode; Expert = bob and Novice = alice for dialogue). In a deck that is not Japanese, a name `X` uses `X_en.wav` (for `lang="en"`; `X_<lang>.wav` in general) when that file exists, and `X.wav` otherwise: a Japanese reference makes VoxCPM2 speak English with an accent, so keep an English reference for each voice. One way to make it: have the TTS read a fixed English text (for example the "Please call Stella" paragraph) with the Japanese reference, and keep the most fluent take. A name means `<reference voice folder>/<name>.wav` (`--ref-dir` > `IRODORI_REF_DIR` > `tts/voices/`). voice.json can also contain a path (`"voices/me.wav"`; relative paths are from the deck). The default bob and alice are often not available locally, so specify your own reference voices in voice.json.

After each line is synthesized, the silence before and after is trimmed (-45 dB, keeping 0.05 s), the loudness is normalized with EBU R128 two-pass loudnorm to -20 LUFS / TP -1.5 dB / LRA 11, and the lines are joined with 350 ms of silence between them (`tts/core.py`).

## Reading dictionary

`tts/yomi.yaml` (can be replaced with another dictionary through `--yomi` or `MOTION_YOMI`) is applied with the rules in `tts/yomi.py`. `terms` are always replaced with kana (longest match; if the term is part of a longer kanji word or English word it is not replaced and a warning is given; not applied to utterances without Japanese), `watch` only reports words whose reading changes with context, and `watch_kanji` warns about unregistered words containing characters that have caused misreadings. Add only words "whose misreading you measured and confirmed is fixed by writing them in kana" (writing words that are already read correctly in kana degrades the prosody).

## HTML with audio

`node kit/build.mjs <deck>/deck.html --embed-audio` embeds the audio in the HTML. The WAV files are converted with ffmpeg to AAC (64 kbps, mono, `.m4a`) before embedding (the results are cached in a temporary folder). Without ffmpeg, the WAV files are embedded as they are and a warning is given. Without `--embed-audio`, the HTML refers to the WAV files in `audio/` by relative path.

## Engine and language

`--engine` > `"engine"` in `voice.json` > the deck's `<html lang>` (`irodori` for `ja`, `voxcpm2` otherwise). Both run on the same mlx-audio server; only the model name differs (`ENGINES` in `tts/core.py`). The reading dictionary is not used for languages other than Japanese.

```json
{"lang": "en", "engine": "voxcpm2", "expert": "gendo"}
```

## Caching

- **Audio**: if `seg_<digest>.wav` exists, it is not synthesized again. The digest is `segDigest` (kit/narration.mjs), a hash of the speaker, the text for TTS, the voice, the model, the loudness target, the gap between lines, the silence-trimming settings, and the reading dictionary and its rules (the dictionary actually used and `tts/yomi.py`). If any of these changes, it is rebuilt (fixing the dictionary rebuilds every step). Dry-run uses a different digest, so it never mixes with real audio. `--force` rebuilds
- **Video**: for each step, a hash of "the pixels of the final state, the pixels of one frame in the middle of the motion, the contents of the audio file, dur, lead, anim, fps and scale" is recorded in `<out>/.render-cache.json`, and if it is the same the clip is not made again. Because it captures and compares the screen, the clip is correctly rebuilt even after you change CSS, components or the theme (if more characters are used and the embedded font changes, a clip may be rebuilt even though it looks the same). `--force` rebuilds everything
- When the number of steps decreases, the leftover `clip_NNNN.*` files are deleted (so that canon's serial numbers do not shift)

## Adjusting lengths (timeline.json)

The length of each step is decided by `DECK.timeline()` (the same for autoplay and rendering): `dur = override.dur ?? max(anim, audio ? lead + audio + pad_after : hold)`. Defaults: lead 0.25 s, pad_after 0.6 s, hold 1.2 s. Write only the exceptions in `<deck>/timeline.json`, and **build again** before rendering.

```json
{"学習率と収束:concl": {"pad_after": 2.0}, "何を最小化するか:1": {"hold": 2.5}, "更新の式:0": {"dur": 6}}
```

- `pad_after` / `hold` / `lead` lengthen the step while keeping its relation to the audio. `dur` is fixed (if the audio exceeds lead + dur, the end is cut and render warns)
- Only the motion part (anim) is captured at fps; the rest stretches a single still of the final state. Changing the length does not increase the number of frames captured
- The audio is placed after lead seconds of silence and padded with silence up to dur. The clip length is dur rounded to 1/fps
