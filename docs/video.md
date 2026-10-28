<!-- i18n: pair=video.ja.md sha256=e16a1356953a8ea1 -->
# Making a video (TTS → render)

English | [日本語](video.ja.md)

From slides and a script (`deck.html` + `narration.md`), this makes per-step videos and a full video. The rules are in [contract.md](contract.md) §4–5.
The list of TTS and render options and environment variables is in [reference.md](reference.md#tts).

## Requirements

- node (after `npm install`), ffmpeg / ffprobe, [uv](https://docs.astral.sh/uv/) (the Python environment for TTS, `tts/pyproject.toml`)
- An Irodori-TTS server (OpenAI-compatible HTTP API). Only these two endpoints are used
  - `GET  {IRODORI_URL}/v1/models`: checks that it is running
  - `POST {IRODORI_URL}/v1/audio/speech`: synthesizes one line at a time. The body is JSON
    `{"model": "mlx-community/Irodori-TTS-v4.1-Small-fp16", "input": "<sentence>", "ref_audio": "<path to the reference wav>", "response_format": "wav"}`.
    `ref_audio` is a path that the server reads (if the server is on another computer, a path on that computer)
- The default reference voices `bob` and `alice` (and `alice_en`, `bob_en`) are synthetic voices included in `tts/voices/` ([where they come from](../tts/voices/README.md)). For other voices, put a wav file at `<reference voice folder>/<name>.wav` and refer to it by name

| Environment variable | Meaning | Default |
|---|---|---|
| `IRODORI_URL` | the Irodori-TTS server | `http://localhost:8882` |
| `IRODORI_REF_DIR` | the reference voice folder (`--ref-dir` takes precedence) | `tts/voices/` |
| `MOTION_YOMI` | the reading dictionary (`--yomi` takes precedence) | `tts/yomi.yaml` |

## TTS server (Mac, Windows, Linux)

`tts/synth.py` works with any server that answers the two requests above. The one we test with is [mlx-audio](https://github.com/Blaizzy/mlx-audio), which runs only on a Mac with Apple silicon. Other ways:

- **Another OpenAI-compatible TTS server** (Windows, Linux, a GPU computer on your network): it must answer `GET /v1/models`, take the JSON body above at `POST /v1/audio/speech` and return WAV. Point `IRODORI_URL` at it; if it runs on another machine, `ref_audio` must be a path on that machine (`--ref-dir`). `model` is the Irodori-TTS or VoxCPM2 model name (`ENGINES` in `tts/core.py`); a server that knows the model under another name needs a small wrapper that maps the name. A server that clones the voice from `ref_audio` gives the intended voices; one that ignores it speaks in its own voice
- **No server**: in the editor app, the Audio panel's **Make AI voice on this computer** makes each step's audio in the browser (needs WebGPU) or records it from the microphone ([editor.md](editor.md#script-audio-audio-panel))
- **Google Colab**: a notebook for **Make AI voice in the cloud (Google Colab)**, and an editor import for what it returns, are coming. Until then, use one of the ways above

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

# 5. (optional) a single file with the audio, to hand out or to open again in the editor
node kit/build.mjs $D --portable      # or --play-only for a play-only copy for learners
```

## What each step produces

| Step | Output |
|---|---|
| tts/synth.py | `audio/seg_<digest>.wav`, `audio/seg_<digest>.json` (length, cues, the text passed to TTS), `audio/manifest.json` `{segments:{"key:step":{file,dur,cues,digest,engine}}}` |
| render.mjs | `clip_NNNN.mp4` (H.264 yuv420p, constant frame rate, faststart, AAC 44.1 kHz), `clip_NNNN.png` (final state), `timeline.out.json`. With `--full`, `full.mp4`; if there are two or more chapters (`sec` slides), `chapter_NN.mp4` |

- NNNN is the serial number in the timeline (starting at 0). 1 step = 1 clip
- `start_ms` / `end_ms` / `text` in `timeline.out.json` are times on the joined video (the cumulative lengths rounded to whole frames), usable for subtitles or chapter marks

## Voices

`--voices` > `<deck>/voice.json` (`{"expert": "bob", "novice": "alice"}`) > the defaults (bob for single-speaker mode; Expert = bob and Novice = alice for dialogue). In a lesson that is not Japanese, a name `X` uses `X_en.wav` (for `lang="en"`; `X_<lang>.wav` in general) when that file exists, and `X.wav` otherwise: a Japanese reference makes VoxCPM2 speak English with an accent, so keep an English reference for each voice. One way to make it: have the TTS read a fixed English text (for example the "Please call Stella" paragraph) with the Japanese reference, and keep the most fluent take. A name means `<reference voice folder>/<name>.wav` (`--ref-dir` > `IRODORI_REF_DIR` > `tts/voices/`). voice.json can also contain a path (`"voices/me.wav"`; relative paths are from the lesson folder). The default bob and alice are often not available locally, so specify your own reference voices in voice.json.

After each line is synthesized, the silence before and after is trimmed (-45 dB, keeping 0.05 s), the loudness is normalized with EBU R128 two-pass loudnorm to -20 LUFS / TP -1.5 dB / LRA 11, and the lines are joined with 350 ms of silence between them (`tts/core.py`).

## Reading dictionary

`tts/yomi.yaml` (can be replaced with another dictionary through `--yomi` or `MOTION_YOMI`) is applied with the rules in `tts/yomi.py`. `terms` are always replaced with kana (longest match; if the term is part of a longer kanji word or English word it is not replaced and a warning is given; not applied to utterances without Japanese), `watch` only reports words whose reading changes with context, and `watch_kanji` warns about unregistered words containing characters that have caused misreadings. Add only words "whose misreading you measured and confirmed is fixed by writing them in kana" (writing words that are already read correctly in kana degrades the prosody). Before the dictionary, the minus sign `−` (U+2212) is always replaced with マイナス, also in your own dictionary and in utterances without Japanese: the Irodori-TTS text normalisation removes it with the dashes, so `−1` would be read as 1 (the editor's **Make AI voice on this computer** uses the same rules, `kit/core/yomi.mjs`).

## HTML with audio

`node kit/build.mjs <deck>/deck.html --embed-audio` embeds the audio in the HTML. The WAV files are converted with ffmpeg to AAC (64 kbps, mono, `.m4a`) before embedding (the results are cached in a temporary folder). Without ffmpeg, the WAV files are embedded as they are and a warning is given. Without `--embed-audio`, the HTML refers to the WAV files in `audio/` by relative path.

## Engine and language

`--engine` > `"engine"` in `voice.json` > the lesson's `<html lang>` (`irodori` for `ja`, `voxcpm2` otherwise). Both run on the same mlx-audio server; only the model name differs (`ENGINES` in `tts/core.py`). The reading dictionary is not used for languages other than Japanese.

```json
{"lang": "en", "engine": "voxcpm2", "expert": "me"}
```

## Caching

- **Audio**: if `seg_<digest>.wav` exists, it is not synthesized again. The digest is `segDigest` (kit/narration.mjs), a hash of the speaker, the text for TTS, the voice, the model, the loudness target, the gap between lines, the silence-trimming settings, and the reading dictionary and its rules (the dictionary actually used and `tts/yomi.py`). If any of these changes, it is rebuilt (fixing the dictionary rebuilds every step). Dry-run uses a different digest, so it never mixes with real audio. `--force` rebuilds
- **Video**: for each step, a hash of "the pixels of the final state, the pixels of one frame in the middle of the motion, the contents of the audio file, dur, lead, anim, fps and scale" is recorded in `<out>/.render-cache.json`, and if it is the same the clip is not made again. Because it captures and compares the screen, the clip is correctly rebuilt even after you change CSS, parts or the theme (if more characters are used and the embedded font changes, a clip may be rebuilt even though it looks the same). `--force` rebuilds everything
- When the number of steps decreases, the leftover `clip_NNNN.*` files are deleted (so that the serial numbers do not shift)

## Adjusting lengths (timeline.json)

The length of each step is decided by `DECK.timeline()` (the same for autoplay and rendering): `dur = override.dur ?? max(anim, audio ? lead + audio + pad_after : hold)`. Defaults: lead 0.25 s, pad_after 0.6 s, hold 1.2 s. Write only the exceptions in `<deck>/timeline.json`, and **build again** before rendering.

```json
{"学習率と収束:concl": {"pad_after": 2.0}, "何を最小化するか:1": {"hold": 2.5}, "更新の式:0": {"dur": 6}}
```

- `pad_after` / `hold` / `lead` lengthen the step while keeping its relation to the audio. `dur` is fixed (if the audio exceeds lead + dur, the end is cut and render warns)
- Only the motion part (anim) is captured at fps; the rest stretches a single still of the final state. Changing the length does not increase the number of frames captured
- The audio is placed after lead seconds of silence and padded with silence up to dur. The clip length is dur rounded to 1/fps
