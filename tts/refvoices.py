"""既定の参照音声（bob・alice・bob_en・alice_en）の在りか。

npm の包みには wav を入れない（7.9 MB）。初めて使うときに、tts/voices.json の url（このリポジトリの
決まったタグのファイル）から取り寄せ、固定した sha256 と比べて、合ったものだけを利用者のキャッシュの
フォルダ（<OS のキャッシュ>/egatari/voices/<タグ>/。bin/egatari.mjs の cacheDir と同じ場所）に置く。
リポジトリの checkout では tts/voices/ のファイルをそのまま使う（取り寄せない）。

標準ライブラリだけを使う（試験は uv run --no-project で動かす。tools/test-tts-voices.mjs）。
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

TTS_DIR = Path(__file__).resolve().parent
LOCAL_DIR = TTS_DIR / "voices"
LOCK_FILE = TTS_DIR / "voices.json"
MAX_BYTES = 16 << 20   # 1 本の上限（今の声は 2.4 MB まで）


class VoiceFetchError(RuntimeError):
    """既定の声を取り寄せられない・中身が固定の sha256 と合わない。"""


def load_lock(path: Path = LOCK_FILE) -> dict:
    lock = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(lock.get("files"), dict) or not isinstance(lock.get("tag"), str) or not isinstance(lock.get("url"), str):
        raise ValueError(f"{path}: needs tag, url and files")
    return lock


def user_cache_dir() -> Path:
    """OS ごとのキャッシュの場所（bin/egatari.mjs の cacheDir と同じ）。"""
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Caches"
    return Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")


def cache_dir(lock: dict) -> Path:
    return user_cache_dir() / "egatari" / "voices" / lock["tag"]


def is_default(file: str, lock: dict | None = None) -> bool:
    """file（bob.wav など）が既定の声か。"""
    return file in (lock or load_lock())["files"]


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def default_voice(file: str, *, local_dir: Path = LOCAL_DIR, cache: Path | None = None,
                  lock: dict | None = None, timeout: float = 60) -> Path:
    """既定の声 file のパス：tts/voices/ にあればそれ（checkout）→ キャッシュ（sha256 が合うもの）→ 取り寄せる。

    取り寄せたものは sha256 が固定と合ったときだけキャッシュに置く。合わなければ VoiceFetchError で断る。
    """
    lock = lock or load_lock()
    want = lock["files"].get(file)
    if not want:
        raise KeyError(file)
    local = local_dir / file
    if local.is_file():
        return local
    cache = cache or cache_dir(lock)
    out = cache / file
    if out.is_symlink() or cache.is_symlink():
        raise VoiceFetchError(f"シンボリックリンクを通しては読み書きしない / refusing a symbolic link: {out}")
    if out.is_file():
        if _sha256(out.read_bytes()) == want:
            return out
        out.unlink()   # 壊れた・古いキャッシュ：取り寄せ直す
    url = lock["url"].format(tag=lock["tag"], file=file)
    if not url.startswith(("https://", "file:")):
        raise VoiceFetchError(f"https でない URL からは取り寄せない / not an https URL: {url}")
    print(f"  既定の声 {file} を取り寄せる / downloading the default voice {file}: {url}", file=sys.stderr)
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            data = r.read(MAX_BYTES + 1)
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise VoiceFetchError(
            f"既定の声 {file} を取り寄せられない（オフライン？）/ cannot download the default voice {file} (offline?): {e}\n"
            f"  手で落とすなら / to download it by hand: {url}\n"
            f"  を / to {out}\n"
            f"  に置く（sha256 {want}）。または自分の声を --ref-dir・IRODORI_REF_DIR・voice.json で指す\n"
            f"  or point --ref-dir, IRODORI_REF_DIR or voice.json at your own voice") from e
    if len(data) > MAX_BYTES:
        raise VoiceFetchError(f"既定の声 {file} が大きすぎる / the default voice {file} is too large (> {MAX_BYTES} bytes): {url}")
    got = _sha256(data)
    if got != want:
        raise VoiceFetchError(
            f"既定の声 {file} の sha256 が固定と合わないので使わない / refusing the default voice {file}: sha256 {got}, "
            f"expected {want} (tts/voices.json): {url}")
    cache.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=cache, prefix=f".{file}.", suffix=".part")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.chmod(tmp, 0o644)   # mkstemp は 0600（同じ PC の TTS のサーバーが別の利用者でも読めるように）
        os.replace(tmp, out)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return out
