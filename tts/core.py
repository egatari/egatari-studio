"""Irodori-TTS の呼び出しと音声の後処理（ffmpeg）。

marp2mp4（main_irodori.py）の関数を移したもの。ffmpeg のフィルタ・音量の目標・行間・無音除去の
設定は同じにしてある（同じ文字列と声なら同じ処理の音声になる）。

設定（環境変数）:
  IRODORI_URL       Irodori-TTS のサーバー（既定 http://localhost:8882）
  IRODORI_REF_DIR   参照音声（<名前>.wav）のフォルダ。サーバーから見えるパスで渡す（既定 tts/voices）
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

IRODORI_URL = os.environ.get("IRODORI_URL", "http://localhost:8882").rstrip("/")
TTS_MODEL = "mlx-community/Irodori-TTS-v4.1-Small-fp16"
# 使えるエンジン（同じ mlx-audio のサーバーで、モデル名だけが違う）。日本語は Irodori、英語などは VoxCPM2
ENGINES = {"irodori": TTS_MODEL, "voxcpm2": "mlx-community/VoxCPM2-8bit"}
DEFAULT_REF_DIR = Path(__file__).resolve().parent / "voices"

PAUSE_MS = 350          # 同じ段階の中の行間に挟む無音
TRIM_SILENCE = True     # TTS が各行の前後に付ける 0.5〜0.9 秒の無音を削るか
TRIM_THRESHOLD = "-45dB"
TRIM_KEEP_S = 0.05      # 削った後に残す無音

# 話者ごとの音量差をならす目標（EBU R128 の loudnorm を 2 パス）。参照音声の音量が揃って
# いないと合成結果もその差を引きずり、Irodori はピークを 0dB に正規化して返すので
# 単純なゲインでは揃わない
TARGET_LUFS = -20.0       # 各行のラウドネスの目標（I）
TARGET_TP_DB = -1.5       # トゥルーピークの上限
TARGET_LRA = 11.0         # ラウドネスレンジ


def ref_dir(cli: str | None = None) -> Path:
    """参照音声のフォルダ：--ref-dir > IRODORI_REF_DIR > tts/voices。"""
    d = cli or os.environ.get("IRODORI_REF_DIR")
    return Path(d).expanduser() if d else DEFAULT_REF_DIR


def server_is_local() -> bool:
    return urlparse(IRODORI_URL).hostname in ("localhost", "127.0.0.1", "::1")


def resolve_voice(voice: str, refs: Path, base: Path | None = None) -> Path:
    """声の指定 → 参照音声のパス。名前（alice）なら <refs>/<名前>.wav、
    パス（/ を含むか .wav で終わる）ならそのファイル（相対なら base から）。

    サーバーが別のマシンのときはパスはサーバー側のものなので、有無を確かめない。
    """
    if "/" in voice or voice.endswith(".wav"):
        p = Path(voice).expanduser()
        if not p.is_absolute() and base is not None:
            p = base / p
    else:
        p = refs / f"{voice}.wav"
    if server_is_local() and not p.exists():
        raise FileNotFoundError(f"参照音声が見つかりません: {p}"
                                "（IRODORI_REF_DIR か --ref-dir、または voice.json にパスで書く）")
    return p


def ping(timeout: float = 5):
    requests.get(f"{IRODORI_URL}/v1/models", timeout=timeout).raise_for_status()


def synthesize_line(text: str, ref: Path, out_path: Path, retries: int = 2, model: str = TTS_MODEL):
    """1 行を合成して WAV に保存する。

    response_format="wav" の明示は必須（省略すると mp3 が返り、拡張子と中身が食い違う）。
    """
    payload = {
        "model": model,
        "input": text,
        "ref_audio": str(ref),
        "response_format": "wav",
    }
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = requests.post(f"{IRODORI_URL}/v1/audio/speech", json=payload, timeout=600)
            resp.raise_for_status()
            out_path.write_bytes(resp.content)
            return
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"TTS合成に失敗しました: {last_err}")


def trim_silence(path: Path):
    """先頭・末尾の無音を削る（インプレース）。発話の途中の間は削らない。

    残すと「TTS 由来の無音 + 意図した無音」が二重に乗り、段階の切り替わりが間延びする。
    """
    trim = (f"silenceremove=start_periods=1:start_silence={TRIM_KEEP_S}:"
            f"start_threshold={TRIM_THRESHOLD}")
    af = f"{trim},areverse,{trim},areverse"

    tmp_out = path.with_suffix(".trim.wav")
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", str(path), "-af", af, str(tmp_out)],
        capture_output=True,
    )
    if result.returncode != 0:
        print(f"  ⚠ 無音除去に失敗（元の音声を使用）: {result.stderr.decode()[-500:]}")
        tmp_out.unlink(missing_ok=True)
        return
    tmp_out.replace(path)


def normalize_level(path: Path):
    """1 行の音声を TARGET_LUFS に揃える（インプレース）。

    1 パス目で測り、2 パス目は linear=true の一律のゲインで当てる（行の中の抑揚は保つ）。
    測定に失敗した行は元のまま（音が消えるよりはレベルが揃わないほうがよい）。
    """
    probe = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", str(path), "-af",
         f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP_DB}:LRA={TARGET_LRA}:print_format=json",
         "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    m = re.search(r"\{[^{}]*input_i[^{}]*\}", probe, re.DOTALL)
    if not m:
        return
    try:
        s = json.loads(m.group(0))
    except json.JSONDecodeError:
        return
    if s.get("input_i") in (None, "-inf", "inf"):
        return

    af = (f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TP_DB}:LRA={TARGET_LRA}"
          f":measured_I={s['input_i']}:measured_TP={s['input_tp']}"
          f":measured_LRA={s['input_lra']}:measured_thresh={s['input_thresh']}"
          f":offset={s['target_offset']}:linear=true:print_format=summary")
    tmp_out = path.with_suffix(".norm.wav")
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", str(path), "-af", af, "-ar", "44100", str(tmp_out)],
        capture_output=True)
    if result.returncode != 0:
        print(f"  ⚠ 音量調整に失敗（元の音声を使用）: {result.stderr.decode()[-300:]}")
        tmp_out.unlink(missing_ok=True)
        return
    tmp_out.replace(path)


def concat_audio_with_pauses(seg_paths: list[Path], out_path: Path, pause_ms: int = PAUSE_MS):
    """複数の WAV を、行間に無音を挟んで 1 本に結合する。

    サンプルレートが違っても繋がるよう、concat demuxer ではなく concat フィルタを使う。
    """
    n = len(seg_paths)
    pause_s = pause_ms / 1000.0
    insert_silence = pause_s > 0 and n > 1
    fmt = "aresample=44100,aformat=sample_fmts=s16:channel_layouts=mono"

    inputs = []
    for p in seg_paths:
        inputs += ["-i", str(p)]

    stages = [f"[{i}:a]{fmt}[a{i}];" for i in range(n)]

    if insert_silence:
        # 無音を 1 本用意して asplit で n-1 個に分け、[a0][s0][a1]… の順に繋ぐ
        inputs += ["-f", "lavfi", "-t", str(pause_s), "-i", "anullsrc=r=44100:cl=mono"]
        sil_labels = "".join(f"[s{i}]" for i in range(n - 1))
        split = f",asplit={n-1}" if n - 1 > 1 else ""
        stages.append(f"[{n}:a]{fmt}{split}{sil_labels};")

        order = ""
        for i in range(n):
            order += f"[a{i}]"
            if i < n - 1:
                order += f"[s{i}]"
        count = 2 * n - 1
    else:
        order = "".join(f"[a{i}]" for i in range(n))
        count = n

    filter_complex = "".join(stages) + order + f"concat=n={count}:v=0:a=1[outa]"

    cmd = ["ffmpeg", "-y"] + inputs + [
        "-filter_complex", filter_complex,
        "-map", "[outa]",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        print(f"  ⚠ 音声結合エラー:\n{result.stderr.decode()[-2000:]}")
        result.check_returncode()


def media_duration(path: Path) -> float:
    """メディアの長さ（秒）。"""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return float(result.stdout.strip())
