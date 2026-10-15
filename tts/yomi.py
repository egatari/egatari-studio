"""読み辞書（yomi.yaml）の適用。

marp2mp4（narration.py）の読み辞書の部分を移したもの。適用の規則は同じにしてある
（同じ辞書なら TTS に渡す文字列が同じになる）。このファイルを変えると音声の digest が
変わり、全段階が作り直しになる（synth.py が辞書とこのファイルのハッシュを digest に入れる）。

辞書の書式（yomi.yaml）:
  terms:        必ず仮名に置換する語（誤読を実測し、仮名化で直ることを確かめた語だけ）
  watch:        置換せず「文脈依存なので確認せよ」と報告する語（表：ひょう／おもて 等）
  watch_kanji:  誤読の原因になった字。未登録の漢字語がこれを含めば警告する
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

_KANJI = re.compile(r"[一-鿿]")
_JA_CHARS = re.compile(r"[ぁ-んァ-ヶ一-龥]")
_KANJI_RUN = re.compile(r"[一-龥]{2,}")  # 未登録語の切り出し（形態素解析なしの近似）


def _read(path: Path) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _normalize_watch(raw) -> list[dict]:
    """watch の 1 語を「意味クラスのリスト」にする。

    新しい書き方：[{意味: 量, 読み: [じゅうぶん]}, {意味: 時間, 読み: [じゅっぷん, じっぷん]}]
    古い書き方（語形の平たいリスト）も読める。1 語形 = 1 クラスとみなす。
    意味が変わる相違だけを報告するため、同じ意味の語形のゆれは同じクラスに入れる。
    """
    out = []
    for entry in raw:
        if isinstance(entry, str):          # 古い書き方
            out.append({"意味": entry, "読み": [entry]})
        else:
            yomi = list(entry["読み"])
            if not yomi:
                raise ValueError(f"読みが空のクラスがあります: {entry}")
            out.append({"意味": entry.get("意味") or yomi[0], "読み": yomi})
    return out


def load_yomi(path: Path) -> tuple[list[tuple[str, str]], dict[str, list[dict]]]:
    """(terms, watch)。terms は長い語から順（最長一致優先）。"""
    data = _read(path)
    terms = sorted((data.get("terms") or {}).items(), key=lambda kv: -len(kv[0]))
    watch = {k: _normalize_watch(v) for k, v in (data.get("watch") or {}).items()}
    return terms, watch


def load_watch_kanji(path: Path) -> dict[str, list[str]]:
    """誤読の原因になった字。{字: 根拠になった登録語}。"""
    data = _read(path)
    return {k: list(v or []) for k, v in (data.get("watch_kanji") or {}).items()}


def risky_unregistered(text: str, terms: list[tuple[str, str]],
                       watch_kanji: dict[str, list[str]]) -> list[tuple[str, str]]:
    """未登録の漢字語のうち、誤読の原因になった字を含むもの。

    辞書は語単位なので、登録語と字を共有する未登録語を取りこぼす（`尤度` は登録済みでも
    `最尤` は素通りする）。漢字の連続を語とみなす近似で拾い、警告だけする（置換しない）。
    """
    if not watch_kanji:
        return []
    registered = {w for w, _ in terms}
    out, seen = [], set()
    for m in _KANJI_RUN.finditer(text):
        word = m.group(0)
        if word in registered or word in seen:
            continue
        # 登録語そのものを含むなら「より長い語の一部」の警告が拾う
        if any(r in word for r in registered):
            continue
        for ch in word:
            if ch in watch_kanji:
                seen.add(word)
                src = "・".join(watch_kanji[ch]) or "実測"
                out.append((word, f"{ch}（{src} の誤読の原因）"))
                break
    return out


def _ascii_alnum(ch: str) -> bool:
    return bool(ch) and ch.isascii() and ch.isalnum()


def _in_longer_word(term: str, before: str, after: str) -> bool:
    """登録語が、より長い語の一部として現れているか。

    漢字の複合語（尤度 が 対数尤度比 の中）と英単語（Man が Management の中）の両方を見る。
    Python の \\b は日本語を単語文字として扱うので、正規表現の単語境界では判定できない。
    隣が漢字でも、登録語の側がその境界で漢字でなければ別の語（「AI応用」の AI は置換する）。
    """
    if _KANJI.match(term[:1]) and _KANJI.match(before or ""):
        return True
    if _KANJI.match(term[-1:]) and _KANJI.match(after or ""):
        return True
    if _ascii_alnum(term[:1]) and _ascii_alnum(before):
        return True
    if _ascii_alnum(term[-1:]) and _ascii_alnum(after):
        return True
    return False


def apply_yomi(text: str, terms: list[tuple[str, str]],
               watch_kanji: dict[str, list[str]] | None = None) -> tuple[str, list[str], list[str]]:
    """辞書を適用する。(置換後, 置換した語, 警告)。

    警告は 2 種類：登録語がより長い語の一部に現れた（置換しない）、
    未登録語が誤読の原因になった字を含む（watch_kanji を渡したとき）。
    """
    # 英語の発話には掛けない（Machine→マシン のように英文が壊れる）
    if not _JA_CHARS.search(text):
        return text, [], []

    used, warns = [], []
    for term, yomi in terms:
        if term not in text:
            continue
        out, i, skipped = [], 0, False
        while True:
            j = text.find(term, i)
            if j < 0:
                out.append(text[i:])
                break
            before = text[j - 1] if j > 0 else ""
            after = text[j + len(term):][:1]
            if _in_longer_word(term, before, after):
                out.append(text[i:j + len(term)])
                skipped = True
            else:
                out.append(text[i:j])
                out.append(yomi)
                used.append(f"{term}→{yomi}")
            i = j + len(term)
        text = "".join(out)
        if skipped:
            warns.append(f"{term} がより長い語の一部として出現（置換せず）")
    for word, why in risky_unregistered(text, terms, watch_kanji or {}):
        warns.append(f"{word} は未登録だが {why} を含む（読みを確認すること）")
    return text, used, warns


def check_watch(text: str, watch: dict[str, list[dict]]) -> list[str]:
    """文脈依存で読みが決まる語の出現を報告する（置換しない）。意味の違うクラスだけを並べる。"""
    return [f"{w}（{' / '.join(c['意味'] for c in cs)}）"
            for w, cs in watch.items() if w in text]
