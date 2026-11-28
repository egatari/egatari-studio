"""作成者の端末で使う CLI の TTS 設定。作業フォルダには置かない。"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path


def outside_deck(path: Path, deckdir: Path, label: str) -> Path:
    try:
        path = path.expanduser().resolve()
    except (OSError, RuntimeError, ValueError):
        raise SystemExit(f"{label} の場所を確認できません") from None
    if path.is_relative_to(deckdir):
        raise SystemExit(f"{label} は作業フォルダの外に置いてください")
    return path


def engine_definitions(deckdir: Path) -> tuple[Path, dict]:
    override = os.environ.get("EGATARI_TTS_CONFIG")
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    path = outside_deck(Path(override) if override else base / "egatari" / "tts.json", deckdir, "tts.json")
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        if not override:
            return path, {}
        raise SystemExit("EGATARI_TTS_CONFIG のファイルがありません") from None
    except (OSError, ValueError):
        raise SystemExit("tts.json を JSON として読めません") from None
    engines = data.get("engines") if isinstance(data, dict) else None
    if not isinstance(engines, dict) or any(not name.strip() or not isinstance(cfg, dict) for name, cfg in engines.items()):
        raise SystemExit("tts.json の engines に名前と設定を書いてください")
    return path, engines


def dotenv_value(text: str, name: str | None) -> str:
    """変数の展開はせず、指定した代入か、1 行だけの鍵を読む。"""
    lines = [line.strip() for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if name:
        assignment = re.compile(rf"(?:export\s+)?{re.escape(name)}\s*=\s*(.*)")
        for line in reversed(lines):
            match = assignment.fullmatch(line)
            if not match:
                continue
            value = match[1]
            if value.startswith(("'", '"')):
                quoted = re.fullmatch(r"""(['"])(.*?)\1\s*(?:#.*)?""", value)
                return quoted[2] if quoted else ""
            return "" if value.startswith("#") else re.split(r"\s+#", value, maxsplit=1)[0].rstrip()
    if len(lines) == 1:
        bare = re.split(r"\s+#", lines[0], maxsplit=1)[0].rstrip()
        if name and re.match(r"[A-Za-z_]\w*=", bare):
            return ""
        if re.fullmatch(r"[^=\s]+={0,2}", bare):
            return bare
    return ""


def api_key(cfg: dict, config_path: Path, deckdir: Path, *, dry_run: bool) -> str:
    name, file = cfg.get("apiKeyEnv"), cfg.get("apiKeyFile")
    path = None
    if file:
        path = outside_deck(config_path.parent / file, deckdir, "apiKeyFile")
    if dry_run:
        return ""
    key = ""
    if path is not None:
        try:
            key = dotenv_value(path.read_text(encoding="utf-8-sig"), name)
        except (OSError, ValueError):
            raise SystemExit("apiKeyFile を読めません") from None
    elif name:
        key = os.environ.get(name, "").strip()
    if (file or name) and not re.fullmatch(r"[!-~][ -~]*", key):
        raise SystemExit("tts.json で指定した API キーを読み取れません")
    return key


def read_voice_config(deckdir: Path) -> dict:
    path = deckdir / "voice.json"
    try:
        if not path.resolve().is_relative_to(deckdir):
            raise SystemExit("voice.json は作業フォルダの中に置いてください")
        cfg = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        return {}
    except (OSError, RuntimeError, ValueError):
        raise SystemExit("voice.json を JSON として読めません") from None
    if not isinstance(cfg, dict):
        raise SystemExit("voice.json に声の設定を書いてください")
    pending = [cfg]
    while pending:
        item = pending.pop()
        if isinstance(item, dict):
            if any(k.lower() in {"apikey", "key", "token", "authorization"} for k in item):
                raise SystemExit("voice.json の API キーの設定は作業フォルダの外の tts.json に移してください")
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)
    return cfg
