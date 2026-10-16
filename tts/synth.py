#!/usr/bin/env python3
"""口述原稿（narration.md）→ 段階ごとの音声（audio/seg_<digest>.wav）と audio/manifest.json。

    uv run --project tts python tts/synth.py <deckdir> \
        [--voices expert=alice,novice=bob] [--ref-dir DIR] [--yomi FILE] [--only key,...] [--dry-run]

- 原稿の解析は node（tools/narration-json.mjs → kit/narration.mjs）に任せる。parser を二重に持たない
- 合成・無音除去・音量の正規化・結合は core.py、読み辞書は yomi.py。行間の無音は PAUSE_MS。
  段階の末尾の間（pad_after）はタイムライン（deck.js）が足すので、wav には付けない
- {cue} で区切られた部分は別々に合成し、各区切りの時刻（段階の音声の先頭からの秒）を cues に記録する
- キャッシュ：seg_<digest>.wav が既にあれば作らない。digest は segDigest(seg, voice) で、
  voice には声・モデル・正規化の目標・行間・読み辞書と適用規則の版が入る（どれかが変われば作り直し）
- --dry-run：TTS を呼ばず、推定の長さ（日本語 7.5 字/秒）の無音を作る。digest は別になる
- 声の設定：--voices > <deckdir>/voice.json > 既定（Expert = alice、Novice = bob）。
  名前は <参照音声のフォルダ>/<名前>.wav（--ref-dir > IRODORI_REF_DIR > tts/voices）、パスも書ける
- 読み辞書：--yomi > MOTION_YOMI > tts/yomi.yaml
- サーバー：IRODORI_URL（既定 http://localhost:8882）
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

TTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TTS_DIR))

import core as M  # noqa: E402  （synthesize_line, trim_silence, normalize_level, …）
import yomi as Y  # noqa: E402

REPO = TTS_DIR.parent
CHARS_PER_SEC = 7.5
MODEL = M.TTS_MODEL   # main() でエンジンに合わせて決める
SR = 44100
ROLE_LABEL = {"expert": "Expert", "novice": "Novice"}


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("deckdir")
    p.add_argument("--voices", default=None, help="expert=alice,novice=bob")
    p.add_argument("--ref-dir", default=None, help="参照音声（<名前>.wav）のフォルダ（既定 IRODORI_REF_DIR か tts/voices）")
    p.add_argument("--engine", default=None, choices=sorted(M.ENGINES), help="TTS のエンジン（既定：英語のデッキは voxcpm2、それ以外は irodori）")
    p.add_argument("--yomi", default=None, help="読み辞書（既定 MOTION_YOMI か tts/yomi.yaml）")
    p.add_argument("--only", default=None, help="この鍵（slideKey:stepKey）の段階だけ作る。カンマ区切り")
    p.add_argument("--dry-run", action="store_true", help="TTS を呼ばず、推定の長さの無音を作る")
    p.add_argument("--force", action="store_true", help="キャッシュを無視して作り直す")
    return p.parse_args()


DEFAULT_VOICES = {"expert": "alice", "novice": "bob"}


def resolve_voices(deckdir: Path, cli: str | None) -> tuple[dict[str, str], list[str], dict[str, str]]:
    """{role: 声の名前}, 既定を使った role, どこから来たか。"""
    src: dict[str, str] = {}
    voices: dict[str, str] = {}
    vj = deckdir / "voice.json"
    if vj.exists():
        for k, v in json.loads(vj.read_text(encoding="utf-8")).items():
            if k.lower() in ROLE_LABEL and v:
                voices[k.lower()] = v
                src[k.lower()] = "voice.json"
    if cli:
        for item in cli.split(","):
            if not item.strip():
                continue
            k, _, v = item.partition("=")
            k = k.strip().lower()
            if k not in ROLE_LABEL or not v.strip():
                sys.exit(f"--voices の書式が不正です: {item!r}（例: expert=alice,novice=bob）")
            if k in voices and voices[k] != v.strip():
                print(f"  --voices が voice.json を上書き: {k} {voices[k]} → {v.strip()}")
            voices[k] = v.strip()
            src[k] = "--voices"
    # 既定の声：1 人モードは alice、掛け合いは alice（Expert）× bob（Novice）。
    # 既定を使っても警告はしない（既定は決まった声で、尺が黙ってずれることはない）
    defaulted = []
    for role in ROLE_LABEL:
        if role not in voices:
            voices[role] = DEFAULT_VOICES[role]
            src[role] = "既定"
    return voices, defaulted, src


def voice_file(v: str) -> str:
    """digest と表示に使う参照音声のファイル名（名前なら <名前>.wav、パスならファイル名）。"""
    return Path(v).name if ("/" in v or v.endswith(".wav")) else v + ".wav"


def file_hash(*paths: Path) -> str:
    h = hashlib.sha1()
    for p in paths:
        h.update(p.read_bytes() if p.exists() else b"")
        h.update(b"\x1f")
    return h.hexdigest()[:12]


def narration_json(narr: Path, voice: dict) -> list[dict]:
    node = shutil.which("node")
    if not node:
        sys.exit("node が見つかりません（tools/narration-json.mjs を動かすのに要ります）")
    out = subprocess.run(
        [node, str(REPO / "tools/narration-json.mjs"), str(narr), "--voice", json.dumps(voice, ensure_ascii=False)],
        capture_output=True, text=True, encoding="utf-8")
    if out.returncode != 0:
        sys.exit(f"narration-json.mjs が失敗しました:\n{out.stderr}")
    data = json.loads(out.stdout)
    for w in data.get("warnings", []):
        print(f"  ⚠ {w}")
    return data["segments"]


def est_dur(text: str) -> float:
    if re.search(r"[A-Za-z]{3}", text) and not re.search(r"[\u3040-\u30ff\u4e00-\u9fff]", text):
        n = len(text.split())                       # 英語：1 秒 ≒ 2.5 語
        return round(n / 2.5, 3) if n else 0.0
    n = len(re.sub(r"\s", "", text))
    return round(n / CHARS_PER_SEC, 3) if n else 0.0


def write_silence(path: Path, dur: float):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"\x00\x00" * int(round(dur * SR)))


def plan(seg: dict, terms, watch_kanji, watch, stats) -> list[list[str]]:
    """段階の各ターン → 読み辞書を適用した部分（{cue} 区切り）のリスト。terms が None（日本語以外）なら辞書を掛けない。"""
    if terms is None:
        return [list(t["ttsParts"]) for t in seg["turns"]]
    turns = []
    for t in seg["turns"]:
        parts = []
        for p in t["ttsParts"]:
            txt, used, warns = Y.apply_yomi(p, terms, watch_kanji)
            for u in used:
                stats["replaced"][u] = stats["replaced"].get(u, 0) + 1
            stats["warns"].update(warns)
            stats["watched"].update(Y.check_watch(txt, watch))
            parts.append(txt)
        turns.append(parts)
    return turns


def synth_segment(seg: dict, turns: list[list[str]], out: Path, dry: bool, refs: dict[str, Path]) -> tuple[float, list[float]]:
    """1 段階分を合成して out に書く。(長さ, cues) を返す。"""
    pause_s = M.PAUSE_MS / 1000.0
    if dry:
        t, cues = 0.0, []
        for ti, parts in enumerate(turns):
            if ti > 0:
                t += pause_s
            for pi, p in enumerate(parts):
                if pi > 0:
                    cues.append(round(t, 3))
                t += est_dur(p)
        write_silence(out, t)
        return round(t, 3), cues

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        sil = tmp / "pause.wav"
        write_silence(sil, pause_s)
        pieces: list[Path] = []
        cues: list[float] = []
        t = 0.0
        for ti, parts in enumerate(turns):
            ref = refs.get(seg["turns"][ti]["role"])
            if ti > 0 and pause_s > 0:
                pieces.append(sil)
                t += pause_s
            for pi, p in enumerate(parts):
                if pi > 0:
                    cues.append(round(t, 3))
                if not p.strip():
                    continue
                f = tmp / f"t{ti:02d}_p{pi:02d}.wav"
                M.synthesize_line(p, ref, f, model=MODEL)
                if M.TRIM_SILENCE:
                    M.trim_silence(f)
                M.normalize_level(f)
                pieces.append(f)
                t += M.media_duration(f)
        if not pieces:
            write_silence(out, 0.0)
            return 0.0, cues
        # 行間の無音は pieces に入れてあるので、ここでは間を足さない
        M.concat_audio_with_pauses(pieces, out, pause_ms=0)
    dur = M.media_duration(out)
    return round(dur, 3), cues


def main():
    args = parse_args()
    deckdir = Path(args.deckdir).resolve()
    deck_html = None
    if deckdir.is_file():                     # <deck>/foo.html を渡してもよい
        deck_html, deckdir = deckdir, deckdir.parent
    elif (deckdir / "deck.html").exists():
        deck_html = deckdir / "deck.html"
    else:
        cands = sorted(p for p in deckdir.glob("*.html"))
        deck_html = cands[0] if len(cands) == 1 else None
    narr = deckdir / "narration.md"
    if not narr.exists():
        sys.exit(f"narration.md がありません: {narr}")
    audio_dir = deckdir / "audio"
    audio_dir.mkdir(exist_ok=True)

    voices, _, src = resolve_voices(deckdir, args.voices)
    # 言語とエンジン：--engine > voice.json の "engine" > デッキの <html lang>（en なら voxcpm2）
    global MODEL
    vjson = json.loads((deckdir / "voice.json").read_text(encoding="utf-8")) if (deckdir / "voice.json").exists() else {}
    m_lang = re.search(r'<html[^>]*\blang="([^"]+)"', deck_html.read_text(encoding="utf-8")) if deck_html else None
    lang = (vjson.get("lang") or (m_lang.group(1) if m_lang else "ja")).lower()
    engine = args.engine or vjson.get("engine") or ("irodori" if lang.startswith("ja") else "voxcpm2")
    MODEL = M.ENGINES[engine]
    use_yomi = lang.startswith("ja")
    ref_dir = M.ref_dir(args.ref_dir)
    yomi_src = args.yomi or os.environ.get("MOTION_YOMI")
    yomi_path = Path(yomi_src).expanduser().resolve() if yomi_src else TTS_DIR / "yomi.yaml"
    if yomi_src and not yomi_path.exists():
        sys.exit(f"読み辞書がありません: {yomi_path}")
    voice = {
        "engine": "dry-run" if args.dry_run else engine,
        "model": MODEL,
        "expert": voice_file(voices["expert"]),
        "novice": voice_file(voices["novice"]),
        "norm": f"{M.TARGET_LUFS}/{M.TARGET_TP_DB}/{M.TARGET_LRA}",
        "pause_ms": M.PAUSE_MS,
        "trim": f"{M.TRIM_SILENCE}/{M.TRIM_THRESHOLD}/{M.TRIM_KEEP_S}",
        # 実際に使う読み辞書と適用規則（yomi.py）が変われば作り直す
        "yomi": file_hash(yomi_path, TTS_DIR / "yomi.py") if use_yomi else None,
    }
    segs = narration_json(narr, voice)
    used_roles = sorted({t["role"] for s in segs for t in s["turns"]})
    print(f"口述原稿: {len(segs)} 段階 / {sum(len(s['turns']) for s in segs)} ターン"
          f"（{'dry-run' if args.dry_run else engine}・言語 {lang}）")
    for r in used_roles:
        print(f"  {ROLE_LABEL[r]} → {voice_file(voices[r])}（{src[r]}）")
    print(f"  読み辞書の場所: {yomi_path}" if use_yomi else "  読み辞書：使わない（日本語以外）")

    refs: dict[str, Path] = {}
    if not args.dry_run:
        try:
            M.ping()
        except Exception as e:
            sys.exit(f"⚠ TTS のサーバーに接続できません: {M.IRODORI_URL} ({e})\n"
                     "  サーバーを起動するか IRODORI_URL を確かめてください（オフラインで流れを試すなら --dry-run）")
        for r in used_roles:
            try:
                refs[r] = M.resolve_voice(voices[r], ref_dir, deckdir)   # 参照音声が無ければここで止める
            except FileNotFoundError as e:
                sys.exit(f"⚠ {e}")

    only = set(k.strip() for k in args.only.split(",")) if args.only else None
    if only:
        unknown = only - {s["key"] for s in segs}
        if unknown:
            print(f"  ⚠ --only の鍵が原稿にありません: {', '.join(sorted(unknown))}")

    terms, watch = Y.load_yomi(yomi_path) if use_yomi else (None, [])
    watch_kanji = Y.load_watch_kanji(yomi_path) if use_yomi else None
    stats = {"replaced": {}, "warns": set(), "watched": set()}

    man_path = audio_dir / "manifest.json"
    manifest = {"segments": {}}
    if man_path.exists():
        try:
            manifest = json.loads(man_path.read_text(encoding="utf-8"))
            manifest.setdefault("segments", {})
        except json.JSONDecodeError:
            pass
    # 原稿から消えた段階は manifest からも消す（音声ファイルは残す：戻したときに再利用できる）
    keys = {s["key"] for s in segs}
    for k in list(manifest["segments"]):
        if k not in keys:
            del manifest["segments"][k]

    made = cached = 0
    failed: list[tuple[str, str]] = []
    for n, seg in enumerate(segs):
        key = seg["key"]
        if only and key not in only:
            continue
        turns = plan(seg, terms, watch_kanji, watch, stats)
        fname = f"seg_{seg['digest']}.wav"
        out = audio_dir / fname
        meta = audio_dir / f"seg_{seg['digest']}.json"   # 長さと cues の控え（キャッシュ時に測り直さない）
        if out.exists() and meta.exists() and not args.force:
            info = json.loads(meta.read_text(encoding="utf-8"))
            cached += 1
            print(f"  [{n+1}/{len(segs)}] {key}: キャッシュ使用 ({fname}, {info['dur']:.2f}s)")
        else:
            print(f"  [{n+1}/{len(segs)}] {key}: {len(turns)} ターン合成中…", end="")
            tmp_out = out.with_suffix(".tmp.wav")
            try:
                dur, cues = synth_segment(seg, turns, tmp_out, args.dry_run, refs)
            except Exception as e:
                tmp_out.unlink(missing_ok=True)
                print(f"\n    ✗ 合成に失敗: {e}")
                failed.append((key, str(e)))
                # 前の版の音声（違う原稿・声のもの）を使い続けないよう、manifest から外す
                manifest["segments"].pop(key, None)
                continue
            tmp_out.replace(out)
            info = {"dur": dur, "cues": cues, "voice": voice, "tts": turns}
            meta.write_text(json.dumps(info, ensure_ascii=False, indent=1), encoding="utf-8")
            made += 1
            print(f" {dur:.2f}s" + (f", cues {cues}" if cues else ""))
        manifest["segments"][key] = {"file": fname, "dur": info["dur"], "cues": info["cues"], "digest": seg["digest"],
                                     "engine": info.get("voice", {}).get("engine", voice["engine"])}

    # 原稿の順に並べ直して書く
    order = {s["key"]: i for i, s in enumerate(segs)}
    manifest["segments"] = dict(sorted(manifest["segments"].items(), key=lambda kv: order.get(kv[0], 1e9)))
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    dry = [k for k, v in manifest["segments"].items() if v.get("engine") == "dry-run"]
    if dry and not args.dry_run:
        print(f"  ⚠ manifest に dry-run（無音）の段階が {len(dry)} 個残っています: {', '.join(dry[:5])}{' …' if len(dry) > 5 else ''}")
    if terms:
        print(f"  読み辞書: {sum(stats['replaced'].values())} 箇所を置換"
              + "".join(f"\n     {k} ×{c}" for k, c in sorted(stats["replaced"].items(), key=lambda kv: -kv[1])))
    for w in sorted(stats["warns"]):
        print(f"  ⚠ {w}")
    for w in sorted(stats["watched"]):
        print(f"  ? 文脈依存の語: {w} — 読みが正しいか確認してください")
    if failed:
        print(f"✗ 失敗 {len(failed)} 段階（新規 {made} / キャッシュ {cached}）→ {man_path}", file=sys.stderr)
        for k, e in failed:
            print(f"    {k}: {e}", file=sys.stderr)
        print("  失敗した段階は manifest から外した（音声なしになる）。サーバーを確かめて、"
              f"--only {','.join(k for k, _ in failed)} でやり直すこと", file=sys.stderr)
        sys.exit(1)
    print(f"完了: 新規 {made} / キャッシュ {cached} → {man_path}")
    print("  音声を反映するには build をやり直す（node kit/build.mjs <deck.html>）")


if __name__ == "__main__":
    # Windows の端末やパイプでも日本語の表示で落ちないように
    for _s in (sys.stdout, sys.stderr):
        if hasattr(_s, "reconfigure"):
            _s.reconfigure(encoding="utf-8", errors="replace")
    main()
