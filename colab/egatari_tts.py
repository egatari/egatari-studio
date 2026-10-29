"""Egatari Studio の Colab 往復 TTS：tts-job.json を読み、段階ごとに合成して、音声（WAV）と記録（records.json）の zip を返す。

ノートブック（colab/egatari-tts.ipynb）の核。合成エンジン（Irodori・Kokoro）は差し替えられる関数にしてあり、重いモデルなしで
dry-run（偽の合成）でも同じ道を通せる（`uv run --with numpy --with scipy python colab/egatari_tts.py job.json out.zip --dry-run`）。

決まり事（docs/editor.md「Make the audio in Colab」、kit/core/colab-core.mjs と対）：
- segments は読みを適用済みの文（エディタが辞書を適用する。ここでは辞書を当てない）。段階の中の {cue}/{mark} の区切りごとに合成する
- 1 つの区切りごとに後処理（モノラル・44.1 kHz・前後の無音を削る -45 dB・-20 LUFS で一律のゲイン。ピークは -1.5 dBTP で止める）を
  kit/core/audio-core.mjs と同じ数で行い、ターンの間に 0.35 秒の無音を入れて結ぶ。cue は 2 つ目からの区切りの始まり（秒）
- inputHash は job から記録へ素通し（照合はエディタが今の原稿からやり直す）
- 返す zip：audio/tts_<sha256 の先頭 16 字>.wav ＋ records.json（egatari: tts-records）
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import re
import sys
import time
import wave
import zipfile
from fractions import Fraction

import numpy as np

SR = 44100
PAUSE_S = 0.35
PROCESSING = "trim-45-loud-20-cap-v1"          # kit/core/audio-core.mjs の PROCESSING と同じ
NOTEBOOK_VERSION = 1
TEXT_NORMALIZE = "join-num-counter@1"          # kit/core/tts-normalize.mjs の TEXT_NORMALIZE と同じ
TRIM_DB, TRIM_KEEP_S, TRIM_WIN_S = -45.0, 0.05, 0.02
TARGET_LUFS, TARGET_TP_DB = -20.0, -1.5
MAX_SECONDS = 600
# Irodori の diffusion（rectified flow）の steps。GPU は pipeline の既定の 40。CPU（GPU がない・CPU に切り替えた）は少なくして速くする。
# CPU の値は 16（2026-10-25、持ち主が 16・24・40 を聞き比べ、16 と 24 に聞いてわかる差がなかった）。Mac の CPU（同じ onnxruntime-node の CPU の道、fp32、参照音声を使い回す）で
# 10 ステップ 209 字の台本の 1 ステップは 40 で 6.5 秒、24 で 4.3 秒、16 で 3.0 秒（decode などの固定の時間があるので steps に比例しない）
IRODORI_STEPS = 40
IRODORI_CPU_STEPS = 16
STEPS_MAX = 200                                 # recipe.diffusionSteps として書く値の上限（kit/core/colab-core.mjs の parseRecords と同じ）
HEX64 = re.compile(r"^[0-9a-f]{64}$")
KEY = re.compile(r"^[^\s:]{1,120}:[^\s:]{1,120}$")
VOICE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


# 算用数字（0-9・全角）の直後の空白（ASCII・全角）を、後ろが日本語の文字のときだけ取る（「1 歩」→「1歩」）。
# kit/core/tts-normalize.mjs と同じ規則（共有の例 tools/fixtures/tts-normalize.json で突き合わせる）。文字の範囲も同じ
_NUM_SPACE = re.compile("([0-9\uff10-\uff19])[ \u3000]+(?=[\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3005\u3006\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])")


def normalize_tts_text(text: str) -> str:
    return _NUM_SPACE.sub(r"\1", text)


class JobError(ValueError):
    pass


# ---------------------------------------------------------------- job の検証
def validate_job(job) -> dict:
    """tts-job.json を検証して返す（形が違えば JobError）。未知の項目は無視する。"""
    if not isinstance(job, dict) or job.get("egatari") != "tts-job" or job.get("v") != 1:
        raise JobError("tts-job.json ではありません（egatari: tts-job, v: 1 が要ります）")
    steps = job.get("steps")
    if not isinstance(steps, list) or not steps:
        raise JobError("steps が空です")
    if len(steps) > 400:
        raise JobError("段階が多すぎます（400 まで）")
    for s in steps:
        if not isinstance(s, dict) or not KEY.match(str(s.get("key", ""))):
            raise JobError(f"段階の key が正しくありません: {s.get('key') if isinstance(s, dict) else s!r}")
        if not HEX64.match(str(s.get("inputHash", ""))):
            raise JobError(f"{s['key']}: inputHash が正しくありません")
        turns = s.get("turns")
        if not isinstance(turns, list) or not turns:
            raise JobError(f"{s['key']}: turns が空です")
        for t in turns:
            if not isinstance(t, dict) or not isinstance(t.get("segments"), list) or not all(isinstance(x, str) for x in t["segments"]):
                raise JobError(f"{s['key']}: segments が文字列の並びではありません")
            if not VOICE.match(str(t.get("voice", ""))):
                raise JobError(f"{s['key']}: voice の名前が正しくありません")
    rc = job.get("recipe")
    if not isinstance(rc, dict) or rc.get("engine") not in ("irodori", "kokoro"):
        raise JobError("recipe.engine は irodori か kokoro です")
    return job


# ---------------------------------------------------------------- 後処理（kit/core/audio-core.mjs と同じ数）
def to_sr(x: np.ndarray, sr: int) -> np.ndarray:
    if sr == SR:
        return x.astype(np.float64)
    from scipy.signal import resample_poly
    f = Fraction(SR, sr).limit_denominator(1000)
    return resample_poly(x.astype(np.float64), f.numerator, f.denominator)


def _onset(x: np.ndarray, win: int, thr2: float) -> int:
    """音のある最初の標本の位置（なければ -1）。直前 win 標本の二乗和がしきい値を超えた所。"""
    cs = np.concatenate([[0.0], np.cumsum(x * x)])
    j = np.arange(len(x))
    s = cs[j + 1] - cs[np.maximum(0, j - win + 1)]
    hit = np.nonzero(s > thr2)[0]
    return int(hit[0]) if len(hit) else -1


def trim_silence(x: np.ndarray) -> np.ndarray:
    win = max(1, round(TRIM_WIN_S * SR))
    thr = 10 ** (TRIM_DB / 20)
    thr2 = thr * thr * win
    keep = round(TRIM_KEEP_S * SR)
    a = _onset(x, win, thr2)
    if a < 0:
        return x[:0]
    b = _onset(x[::-1], win, thr2)
    return x[max(0, a - keep): min(len(x), len(x) - b + keep)]


def _k_weight(sr: int):
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = math.tan(math.pi * f0 / sr)
    Vh = 10 ** (G / 20)
    Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    pre = ([(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0])
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = math.tan(math.pi * f0 / sr)
    a0 = 1 + K / Q + K * K
    rlb = ([1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0])
    return [pre, rlb]


def integrated_loudness(x: np.ndarray, sr: int = SR):
    """ITU-R BS.1770-4 の積分ラウドネス（LUFS）。測れなければ None。"""
    from scipy.signal import lfilter
    d = x.astype(np.float64)
    for b, a in _k_weight(sr):
        d = lfilter(b, a, d)
    block, hop = round(0.4 * sr), round(0.1 * sr)
    if len(d) < block:
        return None
    cs = np.concatenate([[0.0], np.cumsum(d * d)])
    starts = np.arange(0, len(d) - block + 1, hop)
    z = (cs[starts + block] - cs[starts]) / block
    L = lambda e: -0.691 + 10 * np.log10(e)  # noqa: E731
    z = z[z > 0]
    z = z[L(z) > -70] if len(z) else z
    if not len(z):
        return None
    rel = L(z.mean()) - 10
    keep = z[L(z) > rel]
    if not len(keep):
        return None
    return float(L(keep.mean()))


def true_peak_db(x: np.ndarray) -> float:
    from scipy.signal import resample_poly
    if not len(x):
        return -math.inf
    p = float(np.max(np.abs(resample_poly(x, 4, 1))))
    p = max(p, float(np.max(np.abs(x))))
    return 20 * math.log10(p) if p > 0 else -math.inf


def normalize_level(x: np.ndarray) -> np.ndarray:
    loud = integrated_loudness(x)
    if loud is None or not math.isfinite(loud):
        return x                                # 測れないもの（短すぎる・無音）はそのまま
    gain_db = TARGET_LUFS - loud
    tp = true_peak_db(x)
    if math.isfinite(tp) and tp + gain_db > TARGET_TP_DB:
        gain_db = TARGET_TP_DB - tp
    return x * (10 ** (gain_db / 20))


def process_line(x: np.ndarray, sr: int) -> np.ndarray:
    """1 つの区切りの音声を整える（モノラル・44.1 kHz・無音を削る・音量）。"""
    if x.ndim > 1:
        x = x.mean(axis=1)
    if len(x) > MAX_SECONDS * sr:
        raise JobError("1 つの区切りの音声が長すぎます")
    return normalize_level(trim_silence(to_sr(np.asarray(x, dtype=np.float64), sr)))


# ---------------------------------------------------------------- 自分の参照音声（Irodori。省略可）
REF_SR = 48000                                  # 参照音声は 48 kHz・モノラル（lab/tts-engine.mjs の SR、colab/irodori_node.mjs と同じ）
REF_MIN_S, REF_MAX_S = 3.0, 30.0
REF_MAX_BYTES = 100 * 1048576


class RefVoiceError(ValueError):
    pass


def _decode_ref(path: str, ffmpeg: str | None):
    """WAV は scipy で、それ以外（MP3 など）や WAV で読めないものは ffmpeg で、(samples, sr) に。"""
    import os
    import subprocess
    import tempfile
    from scipy.io import wavfile
    ext = os.path.splitext(path)[1].lower()
    if ext == ".wav":
        try:
            sr, d = wavfile.read(path)
            if d.dtype == np.uint8:
                d = (d.astype(np.float64) - 128) / 128
            elif d.dtype.kind == "i":
                d = d.astype(np.float64) / float(2 ** (8 * d.dtype.itemsize - 1))
            elif d.dtype.kind == "f":
                d = d.astype(np.float64)
            else:
                raise ValueError("unsupported sample type")
            return d, int(sr)
        except Exception:
            pass                                # 読めない WAV（ADPCM など）は ffmpeg に任せる
    if not ffmpeg:
        raise RefVoiceError(f"{os.path.basename(path)} を読めません。PCM の WAV にするか、ffmpeg のある環境で使ってください / cannot decode it without ffmpeg: use a PCM WAV file")
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "ref.wav")
        r = subprocess.run([ffmpeg, "-v", "error", "-nostdin", "-y", "-i", path, "-vn", "-ac", "1", "-ar", str(REF_SR), "-c:a", "pcm_s16le", out], capture_output=True, text=True)
        if r.returncode or not os.path.exists(out):
            raise RefVoiceError(f"{os.path.basename(path)} を音声として読めません（WAV か MP3 のファイルにしてください）/ not a readable audio file: {(r.stderr or '').strip()[-200:]}")
        sr, d = wavfile.read(out)
    return d.astype(np.float64) / 32768.0, int(sr)


def prepare_reference_voice(src: str, dst: str, ffmpeg: str | None = "ffmpeg") -> dict:
    """自分の参照音声（WAV / MP3）を確かめ、48 kHz・モノラル・16 bit の WAV にして dst に書く（Irodori の参照音声として使う）。
    長さは REF_MIN_S〜REF_MAX_S 秒、読めること、無音でないこと。だめなら RefVoiceError（何が悪いかを日本語と英語で）。戻り値：{seconds, src_sr, channels}。"""
    import os
    import shutil
    if not os.path.isfile(src):
        raise RefVoiceError(f"ファイルがありません: {src} / file not found")
    if os.path.getsize(src) > REF_MAX_BYTES:
        raise RefVoiceError("ファイルが大きすぎます（100 MiB まで。3〜30 秒の短い音声で足ります）/ file too large")
    exe = shutil.which(ffmpeg) if ffmpeg else None
    x, sr = _decode_ref(src, exe)
    ch = 1 if x.ndim == 1 else x.shape[1]
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr <= 0 or not len(x):
        raise RefVoiceError("音声が空です / the audio is empty")
    seconds = len(x) / sr
    if seconds < REF_MIN_S:
        raise RefVoiceError(f"短すぎます（{seconds:.1f} 秒。{REF_MIN_S:g}〜{REF_MAX_S:g} 秒にしてください）/ too short ({seconds:.1f} s; use {REF_MIN_S:g}-{REF_MAX_S:g} s)")
    if seconds > REF_MAX_S:
        raise RefVoiceError(f"長すぎます（{seconds:.1f} 秒。{REF_MIN_S:g}〜{REF_MAX_S:g} 秒の一部を切り出してください）/ too long ({seconds:.1f} s; cut it to {REF_MIN_S:g}-{REF_MAX_S:g} s)")
    if not np.all(np.isfinite(x)) or float(np.max(np.abs(x))) < 1e-4:
        raise RefVoiceError("ほぼ無音です / the audio is silent")
    if sr != REF_SR:
        from scipy.signal import resample_poly
        f = Fraction(REF_SR, sr).limit_denominator(1000)
        x = resample_poly(x, f.numerator, f.denominator)
    pcm16 = np.round(np.clip(x, -1, 1) * 32767).astype("<i2")
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    with wave.open(dst, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(REF_SR)
        w.writeframes(pcm16.tobytes())
    return {"seconds": round(seconds, 2), "src_sr": sr, "channels": ch}


# ---------------------------------------------------------------- 段階の合成
def synthesize_step(step: dict, synth, recipe: dict):
    """synth(text, voice, role, lang) → (samples, sr)。戻り値：(音声 float64 44.1 kHz, cues（秒）)。"""
    pause = round(PAUSE_S * SR)
    norm = recipe.get("textNormalize") == TEXT_NORMALIZE   # 知らない版の名前は適用しない（記録にも書かない）
    pieces: list[np.ndarray] = []
    cues: list[float] = []
    n = 0
    for ti, turn in enumerate(step["turns"]):
        if ti > 0 and pause:
            pieces.append(np.zeros(pause))
            n += pause
        for pi, text in enumerate(turn["segments"]):
            if pi > 0:
                cues.append(round(n / SR, 3))
            if not text.strip():
                continue
            if norm:
                text = normalize_tts_text(text)
            x, sr = synth(text, turn["voice"], turn.get("role", "expert"), step.get("lang", "ja"))
            tp = time.monotonic()
            line = process_line(np.asarray(x), int(sr))
            if getattr(synth, "profile", False):      # PROFILE：後処理（再標本化・無音を削る・音量）の時間も出す
                print(f"    post-processing {time.monotonic() - tp:.2f} s (resample, trim, loudness)", flush=True)
            pieces.append(line)
            n += len(line)
    pcm = np.concatenate(pieces) if pieces else np.zeros(0)
    return pcm, cues


def wav_bytes(pcm: np.ndarray) -> bytes:
    pcm16 = np.round(np.clip(pcm, -1, 1) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm16.tobytes())
    return buf.getvalue()


def run_job(job: dict, synth, engine_info: dict | None = None, progress=None, clock=time.monotonic) -> bytes:
    """job を合成して zip（audio/*.wav と records.json）のバイト列を返す。engine_info：{engine, model, seed, voice: {role: name}} を上書きする記録。
    engine_info に runtime（runtime_label。版の組と実際のプロバイダ）があれば、どの段階の recipe にも書く（inputHash には入らない）。
    diffusionSteps（Irodori の steps。整数）と precision（重みの精度 fp16・fp32）も同じく、どの段階の recipe にも書く（どう作ったかの記録だけで、inputHash には入らない）。
    progress(i, n, key, step_s, total_s)：段階ごとに呼ぶ。時間は clock（単調な時計）で、合成の呼び出し（Node のワーカーの返事を待つ間も含む）を測る。"""
    job = validate_job(job)
    t0 = clock()
    jr = job["recipe"]
    steps_rec: dict = {}
    members: list[tuple[str, bytes]] = []
    for i, step in enumerate(job["steps"]):
        t1 = clock()
        pcm, cues = synthesize_step(step, synth, jr)
        step_s = clock() - t1
        if not len(pcm):
            raise JobError(f"{step['key']}: 音が出ませんでした（読む文が空か、すべて無音です）")
        wav = wav_bytes(pcm)
        name = "audio/tts_" + hashlib.sha256(wav).hexdigest()[:16] + ".wav"
        if all(n != name for n, _ in members):
            members.append((name, wav))
        voice = {}
        for t in step["turns"]:
            voice.setdefault("novice" if t.get("role") == "novice" else "expert", t["voice"])
        info = engine_info or {}
        steps_rec[step["key"]] = {
            "file": name, "dur": round(len(pcm) / SR, 3), "cues": cues, "kind": "tts", "sync": "auto",
            "inputHash": step["inputHash"],
            "recipe": {"engine": info.get("engine", jr["engine"]), "model": info.get("model", jr.get("model", "")), "voice": voice,
                       "seed": info.get("seed", jr.get("seed", 0)), "dictionary": jr.get("dictionary"),
                       "processing": f"{PROCESSING}+colab{NOTEBOOK_VERSION}"},
        }
        if jr.get("textNormalize") == TEXT_NORMALIZE:
            steps_rec[step["key"]]["recipe"]["textNormalize"] = TEXT_NORMALIZE
        if info.get("runtime"):
            if not RUNTIME_RE.match(str(info["runtime"])):
                raise JobError(f"runtime は <版の組>/<プロバイダ> の形です: {info['runtime']!r}")
            steps_rec[step["key"]]["recipe"]["runtime"] = str(info["runtime"])
        if info.get("diffusionSteps") is not None:
            ds = info["diffusionSteps"]
            if not (isinstance(ds, int) and not isinstance(ds, bool) and 1 <= ds <= STEPS_MAX):
                raise JobError(f"diffusionSteps は 1〜{STEPS_MAX} の整数です: {ds!r}")
            steps_rec[step["key"]]["recipe"]["diffusionSteps"] = ds
        if info.get("precision") is not None:
            if info["precision"] not in ("fp16", "fp32"):
                raise JobError(f"precision は fp16 か fp32 です: {info['precision']!r}")
            steps_rec[step["key"]]["recipe"]["precision"] = info["precision"]
        if progress:
            progress(i + 1, len(job["steps"]), step["key"], step_s, clock() - t0)
    records = {"egatari": "tts-records", "v": 1, "docId": job.get("docId"),
               **({"title": job["title"]} if isinstance(job.get("title"), str) and job["title"].strip() else {}),
               "generator": {"name": "irodori-tts-colab", "version": str(NOTEBOOK_VERSION)}, "steps": steps_rec}
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        z.writestr("records.json", json.dumps(records, ensure_ascii=False, indent=1) + "\n")
        for n, b in members:
            z.writestr(n, b)
    return out.getvalue()


# ---------------------------------------------------------------- 時間の表示（ノートブックが自分の時計で出す。Colab のセルの時間表示には頼らない）
def clock_text(seconds: float) -> str:
    """経過時間を m:ss（1 時間を超えれば h:mm:ss）に。"""
    s = max(0, int(seconds))
    h, m, sec = s // 3600, s % 3600 // 60, s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def progress_line(i: int, n: int, key: str, step_s: float, total_s: float) -> str:
    """進み具合の 1 行：「3/10 s-intro:2  (+41.2 s, total 2:15)」。step_s はその段階の合成の時間、total_s は run_job の始めからの時間（どちらも単調な時計）。"""
    return f"{i}/{n} {key}  (+{step_s:.1f} s, total {clock_text(total_s)})"


def total_line(total_s: float, n: int) -> str:
    """終わりの 1 行（全体の時間と、1 段階あたりの時間）。"""
    per = total_s / n if n else 0.0
    return f"synthesis: {n} steps in {clock_text(total_s)} ({per:.1f} s per step) / 合成：{n} ステップを {clock_text(total_s)}（1 ステップ {per:.1f} 秒）"


# ---------------------------------------------------------------- Irodori の steps（GPU と CPU）
def pick_irodori_steps(gpu: bool) -> int:
    """GPU なら IRODORI_STEPS、GPU がない（CPU）なら IRODORI_CPU_STEPS。"""
    return IRODORI_STEPS if gpu else IRODORI_CPU_STEPS


def compute_label(gpu: bool, steps: int | None = None) -> str:
    """env の行の終わりに付ける、どこで動くかと Irodori の steps（例「CPU（Irodori の steps=16）」）。Kokoro には steps がない。"""
    return f"{'GPU' if gpu else 'CPU'}（Irodori の steps={pick_irodori_steps(gpu) if steps is None else steps}）"


def env_compute_line(gpu: bool, steps: int | None = None) -> str:
    """セル 1 の env の行：GPU を使うかと、Irodori の steps（CPU なら少ない steps を自動で選んだこと）。"""
    what = "GPU (CUDA)" if gpu else "no GPU, CPU profile: fewer Irodori diffusion steps (faster) / GPU なし。CPU 用に Irodori の steps を減らします"
    return f"env: {what} · {compute_label(gpu, steps)}"


# ---------------------------------------------------------------- 合成エンジン（synth 関数を返す）
def dry_run_synth(text: str, voice: str, role: str, lang: str):
    """モデルなしの偽の合成（文の長さに比例した長さの音）。往復と後処理の試験用。"""
    sr = 24000
    n = round((0.3 + 0.05 * len(text)) * sr)
    t = np.arange(n) / sr
    f = 260.0 if role == "novice" else 170.0
    body = 0.2 * np.sin(2 * np.pi * f * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t) ** 2)
    lead = np.zeros(round(0.2 * sr))
    return np.concatenate([lead, body, lead]), sr


CUDA_PROVIDER = "CUDAExecutionProvider"
RUNTIME_RE = re.compile(r"^[A-Za-z0-9._-]{1,32}/[A-Za-z0-9._?-]{1,32}$")


def provider_name(providers) -> str:
    """onnxruntime の Python のセッションが実際に使うプロバイダ（get_providers() の並び）から、記録に書く短い名前（cuda・tensorrt・cpu など）。"""
    for p in providers or []:
        if p != "CPUExecutionProvider":
            return p.replace("ExecutionProvider", "").lower() or "unknown"
    return "cpu"


def runtime_label(pin_set: str | None, provider: str | None) -> str:
    """recipe.runtime の値：<版の組>/<実際のプロバイダ>（例 cuda12/cuda、cuda13/cpu。版の組がわからなければ none）。"""
    label = f"{pin_set or 'none'}/{provider or 'unknown'}"
    if not RUNTIME_RE.match(label):
        raise ValueError(f"bad runtime label: {label!r}")
    return label


def first_line(e) -> str:
    """例外の文の最初の空でない行（長すぎれば切る）。colab/ort-fallback.mjs の firstLine と同じ。"""
    for line in str(e).splitlines():
        if line.strip():
            return line.strip()[:300]
    return "(no message)"


def cpu_notice(reason: str) -> str:
    """GPU を使えず CPU にしたときの 1 行（colab/ort-fallback.mjs の cpuNotice と同じ文）。"""
    return f"GPU（CUDA）を使えないため、CPU で合成します（遅くなります） / GPU (CUDA) could not be used, so the CPU is used and synthesis is slower. 理由 / reason: {reason}"


def kokoro_providers(available) -> list:
    """Kokoro の session に頼む実行プロバイダ：CUDA（使えるなら）と CPU だけ（TensorRT などは頼まない）。"""
    return ([CUDA_PROVIDER] if CUDA_PROVIDER in available else []) + ["CPUExecutionProvider"]


def load_kokoro(model_path: str, voices_path: str, make=None, cpu_session=None, available=None, log=print):
    """Kokoro を読み込む。GPU（CUDA）で作れなければ CPU で作り直す（ジョブを止めない）。戻り値は (Kokoro, お知らせ or None)。
    kokoro-onnx は onnxruntime-gpu があると使える実行プロバイダを全部渡す。onnxruntime の Python は CUDA のライブラリが読めないと
    多くの場合は警告だけ出して CPU で続ける（例外にならない）ので、実際のプロバイダも見て、CUDA があるはずなのに使えていなければ同じ 1 行を出す。
    make・cpu_session・available は試験用の差し替え口（既定は kokoro_onnx と onnxruntime）。"""
    if make is None or cpu_session is None or available is None:
        import onnxruntime as rt
        from kokoro_onnx import Kokoro
        # TensorRT は Colab になく、kokoro-onnx に任せると最初に TensorRT を頼んで長い EP Error が出る。CUDA と CPU だけを頼む
        make = make or (lambda: Kokoro.from_session(rt.InferenceSession(model_path, providers=kokoro_providers(rt.get_available_providers())), voices_path))
        cpu_session = cpu_session or (lambda: Kokoro.from_session(rt.InferenceSession(model_path, providers=["CPUExecutionProvider"]), voices_path))
        available = available if available is not None else rt.get_available_providers()
    try:
        k = make()
    except Exception as e:                      # GPU で作れない：CPU で作り直す（CPU でも駄目なら、その例外がそのまま上がる）
        if CUDA_PROVIDER not in available:
            raise
        notice = cpu_notice(first_line(e))
        log(notice)
        return cpu_session(), notice
    got = k.sess.get_providers() if hasattr(k, "sess") else []
    if CUDA_PROVIDER in available and CUDA_PROVIDER not in got:
        notice = cpu_notice(f"onnxruntime could not start {CUDA_PROVIDER} (see its warning above); providers in use: {got}")
        log(notice)
        return k, notice
    return k, None


def kokoro_synth(model_path: str, voices_path: str, aliases: dict | None = None):
    """Kokoro-82M v1.0（kokoro-onnx）。bob・alice は近い声（am_michael・af_heart）に読み替える（ブラウザ版と同じ）。
    GPU を使えなければ CPU で続ける（load_kokoro）。"""
    import logging
    logging.getLogger("phonemizer").setLevel(logging.ERROR)   # 「words count mismatch」の警告（無害）だけを止める。ほかの警告はそのまま
    k, notice = load_kokoro(model_path, voices_path)
    al = {"bob": "am_michael", "alice": "af_heart", **(aliases or {})}

    def synth(text, voice, role, lang):
        samples, sr = k.create(text, voice=al.get(voice, voice), speed=1.0, lang="en-us")
        return samples, sr
    synth.providers = k.sess.get_providers() if hasattr(k, "sess") else []   # 実際に使う実行プロバイダ（ノートブックが出す）
    synth.provider = provider_name(synth.providers) if hasattr(k, "sess") else "unknown"
    synth.notice = notice
    return synth


class WorkerError(RuntimeError):
    pass


STAGE_ORDER = ("text", "ref-encode", "speaker", "duration", "dit", "decode")


def stage_line(profile: dict, round_trip_s: float | None = None) -> str:
    """ワーカーの段の時間（colab/stage-profile.mjs）を 1 行に：「stages: text 0.01 s · dit 4.33 s ×40 · decode 0.86 s · node 5.20 s · round trip 5.31 s」。
    ref-encode が無いのは、参照音声の符号化を使い回したとき。"""
    st = profile.get("stages") or {}
    parts = []
    for k in list(STAGE_ORDER) + sorted(set(st) - set(STAGE_ORDER)):
        v = st.get(k)
        if isinstance(v, dict):
            n = v.get("n", 1)
            parts.append(f"{k} {float(v.get('s', 0)):.2f} s" + (f" ×{n}" if n != 1 else ""))
    if "ref-encode" not in st:
        parts.append("ref-encode cached")
    if isinstance(profile.get("totalS"), (int, float)):
        parts.append(f"node {profile['totalS']:.2f} s")
    if round_trip_s is not None:
        parts.append(f"round trip {round_trip_s:.2f} s")
    return "stages: " + " · ".join(parts)


def tail_text(path: str, n: int = 30) -> str:
    """ファイルの最後の n 行（なければ空）。Node の標準エラーを見せるため。"""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:]).rstrip()
    except OSError:
        return ""


class IrodoriWorker:
    """常駐の Node ワーカー（colab/irodori_node.mjs）。起動は 1 度で、モデルは 1 度だけ読み込む。依頼は JSON の行（colab/worker-protocol.mjs）。
    cmd はワーカーを起動するコマンド（試験では偽のワーカーを渡す）。呼ぶと synth(text, voice, role, lang) → (samples, sr)。close() か with で終わらせる。
    Node の標準エラーはファイルに受け、失敗したときは最後の 30 行を例外に入れる。"""

    def __init__(self, cmd: list[str], voices_dir: str, work_dir: str, steps: int | None = IRODORI_STEPS, seed: int = 0, env: dict | None = None, ready_timeout: float = 900.0, ref_voice: str | None = None, profile: bool = False):
        import os
        import subprocess
        import tempfile
        self.voices_dir, self.steps, self.seed = voices_dir, steps, seed
        self.ref_voice = ref_voice              # 自分の参照音声（prepare_reference_voice の出力）。あれば、どの声の名前でもこれを使う
        self.profile = profile                  # 区切りごとに段の時間を出す（ワーカーは EGATARI_PROFILE=1 で起動しておく）
        self.folder, self.load_s = None, None
        os.makedirs(work_dir, exist_ok=True)
        self._dir = tempfile.mkdtemp(dir=work_dir)
        self._errpath = os.path.join(self._dir, "node-stderr.log")
        self._err = open(self._errpath, "wb")
        self._next = 0
        self._closed = False
        self.providers, self.provider, self.notice = [], "unknown", None
        self._proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self._err, text=True, encoding="utf-8", env=env)
        try:
            msg = self._read(ready_timeout)
            if not msg.get("ready"):
                raise WorkerError(f"ワーカーの最初の返事が ready ではありません: {msg!r}")
            # 実際に使う実行プロバイダと、GPU を使えず CPU にしたときのお知らせ（エラーではない。ノートブックの出力にそのまま出す）
            self.providers = list(msg.get("providers") or [])
            self.provider = str(msg.get("provider") or "unknown")   # 実際に使っている実行プロバイダ（recipe.runtime に書く）
            self.notice = msg.get("notice") or None
            self.folder = msg.get("folder") or None   # 重みのフォルダ（onnx＝fp32・onnx_fp16）
            self.load_s = msg.get("loadS")
            if self.notice:
                print(self.notice, flush=True)
            if self.steps is None:              # 自動：実際に CPU で動くなら（GPU がない・CPU に切り替えた）CPU 用の少ない steps
                self.steps = pick_irodori_steps(self.provider != "cpu")
        except BaseException:
            self.close()
            raise

    def _fail(self, what: str) -> WorkerError:
        rc = self._proc.poll()
        return WorkerError(f"{what}（Node の終了コード: {rc}）\n--- Node の標準エラー（最後の 30 行）---\n{tail_text(self._errpath) or '(なし)'}")

    def _read(self, timeout: float | None = None) -> dict:
        import select
        while True:
            if timeout is not None and not select.select([self._proc.stdout], [], [], timeout)[0]:
                raise self._fail("ワーカーが時間内に答えませんでした")
            line = self._proc.stdout.readline()
            if not line:
                raise self._fail("Node のワーカーが終了しました")
            line = line.strip()
            if not line:
                continue
            try:
                return json.loads(line)
            except ValueError:
                continue                        # プロトコルの行でない出力は読み飛ばす

    def __call__(self, text, voice, role="expert", lang="ja"):
        import os
        from scipy.io import wavfile
        if self._closed:
            raise WorkerError("ワーカーはもう終了しています（セル 3 からやり直してください）")
        self._next += 1
        out = os.path.join(self._dir, f"out{self._next}.wav")
        req = {"id": self._next, "text": text, "voice": self.ref_voice or os.path.join(self.voices_dir, voice + ".wav"), "out": out, "steps": self.steps, "seed": self.seed}
        t_req = time.monotonic()
        try:
            self._proc.stdin.write(json.dumps(req, ensure_ascii=False) + "\n")
            self._proc.stdin.flush()
        except (BrokenPipeError, OSError):
            raise self._fail("Node のワーカーに送れません")
        r = self._read()
        if not r.get("ok"):
            raise WorkerError(f"合成に失敗しました（{text[:30]!r}）：{r.get('error')}\n--- Node の標準エラー（最後の 30 行）---\n{tail_text(self._errpath) or '(なし)'}")
        if self.profile and isinstance(r.get("profile"), dict):
            print("  " + stage_line(r["profile"], time.monotonic() - t_req), flush=True)
        sr, data = wavfile.read(out)
        os.remove(out)
        return data.astype(np.float64) / (32768.0 if data.dtype == np.int16 else 1.0), sr

    @property
    def precision(self) -> str | None:
        """記録に書く重みの精度（fp32・fp16。わからなければ None）。"""
        return {"onnx": "fp32", "onnx_fp16": "fp16"}.get(self.folder or "")

    def close(self) -> None:
        import shutil
        import subprocess
        p = self._proc
        self._closed = True
        try:
            if p.poll() is None:
                try:
                    p.stdin.write('{"cmd": "quit"}\n')
                    p.stdin.flush()
                    p.stdin.close()
                except (BrokenPipeError, OSError, ValueError):
                    pass
                try:
                    p.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    p.kill()
                    p.wait()
        finally:
            for f in (p.stdout, self._err):
                try:
                    f.close()
                except Exception:
                    pass
            shutil.rmtree(self._dir, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def irodori_synth(node_script: str, model_dir: str, voices_dir: str, work_dir: str, steps: int | None = None, seed: int = 0, node: str = "node", ref_voice: str | None = None, profile: bool = False):
    """Irodori-TTS 500M-v3（ONNX）。リポジトリの lab/vendor/irodori-tts-webgpu/pipeline.mjs（Node 用に注入できる設計）を
    colab/irodori_node.mjs 経由で onnxruntime-node（GPU があれば CUDA、なければ CPU）で動かす。ワーカーを 1 度だけ起動して使い回す
    （6 つの ONNX セッションとトークナイザは 1 度だけ読む）。戻り値は close() のある関数（run_job のあとに close() を呼ぶ）。
    ref_voice を渡すと、job の声の名前にかかわらずその WAV を参照音声にする（省略すれば tts/voices/<名前>.wav で、これまでと同じ）。
    steps を省くと、ワーカーが実際に使うプロバイダで決める（cpu なら IRODORI_CPU_STEPS、そのほかは IRODORI_STEPS。使った値は .steps）。"""
    import os
    env = dict(os.environ, EGATARI_PROFILE="1") if profile else None
    return IrodoriWorker([node, node_script, model_dir], voices_dir, work_dir, steps=steps, seed=seed, ref_voice=ref_voice, profile=profile, env=env)


# ---------------------------------------------------------------- コマンド（試験用。ノートブックはこれらの関数を直接呼ぶ）
def main(argv: list[str]) -> int:
    if len(argv) < 3 or "--dry-run" not in argv:
        print("usage: egatari_tts.py <tts-job.json> <out.zip> --dry-run   （本物の合成はノートブックから）", file=sys.stderr)
        return 2
    with open(argv[1], encoding="utf-8") as f:
        job = json.load(f)
    data = run_job(job, dry_run_synth, engine_info={"engine": "dry-run", "model": "dry-run", "seed": None})
    with open(argv[2], "wb") as f:
        f.write(data)
    print(f"wrote {argv[2]} ({len(data)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
