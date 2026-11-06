"""Read the Aozora Bunko text of 羅生門 and convert it to Egatari Text 1.

Source: https://www.aozora.gr.jp/cards/000879/card127.html
        (files/127_ruby_150.zip -> rashomon.txt, Shift_JIS; kept as source/rashomon.txt)

    uv run scripts/aozora.py            # print the four scenes as Egatari Text (body only)

Conversions (the only changes to the text):
  - ruby  ｜丹塗《にぬり》 / 下人《げにん》 (run of kanji)  ->  {ruby}`丹塗|にぬり`
  - gaiji ※［＃「てへん＋丑」、第4水準2-12-93］ -> 扭 (U+626D)
          ※［＃「目＋匡」、第3水準1-88-81］   -> 眶 (U+7736)
    (JIS X 0213 plane-row-cell decoded with Python's euc_jis_2004 codec)
  - layout note ［＃地から１字上げ］ is dropped (the date line stays as a paragraph)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "source" / "rashomon.txt"

GAIJI = {
    "※［＃「てへん＋丑」、第4水準2-12-93］": "扭",
    "※［＃「目＋匡」、第3水準1-88-81］": "眶",
}
LAYOUT_NOTE = re.compile(r"［＃[^］]*］")
# Aozora: ruby without ｜ covers the preceding run of kanji (incl. 々 〆 ヶ)
KANJI = r"[㐀-䶿一-鿿豈-﫿々〆ヵヶ〇]"
RUBY_BAR = re.compile(r"｜([^｜《》]+?)《([^《》]+?)》")
RUBY_RUN = re.compile(rf"({KANJI}+)《([^《》]+?)》")

# First words of the paragraph that opens each scene (plan: handoff/book-samples-2026-10-31.md §4)
SCENES = [
    ("一", "門の下", "ある日の暮方の事である。"),
    ("二", "楼の上へ", "それから、何分かの後である。"),
    ("三", "老婆の言い分", "そこで、下人は、両足に力を入れて"),
    ("四", "下人の行方", "下人は、太刀を鞘《さや》におさめて"),
]


def _check_gaiji_codes() -> None:
    assert bytes([0x8F, 0xA0 + 12, 0xA0 + 93]).decode("euc_jis_2004") == "扭"
    assert bytes([0xA0 + 88, 0xA0 + 81]).decode("euc_jis_2004") == "眶"


def source_paragraphs(path: Path = SOURCE) -> list[str]:
    """Body paragraphs in Aozora notation (gaiji already mapped, layout notes removed)."""
    _check_gaiji_codes()
    text = path.read_bytes().decode("cp932").replace("\r\n", "\n")
    head, sep, rest = text.partition("-------------------------------------------------------\n")
    _, sep2, rest = rest.partition("-------------------------------------------------------\n")
    assert sep and sep2, "header block not found"
    body, sep3, _ = rest.partition("\n底本：")
    assert sep3, "colophon not found"
    paras = []
    for line in body.split("\n"):
        line = line.rstrip()
        if not line:
            continue
        for k, v in GAIJI.items():
            line = line.replace(k, v)
        line = LAYOUT_NOTE.sub("", line)
        assert "※" not in line and "［＃" not in line, line
        paras.append(line)
    return paras


def plain(raw: str) -> str:
    """Aozora notation -> reading text (ruby removed)."""
    s = RUBY_BAR.sub(r"\1", raw)
    s = RUBY_RUN.sub(r"\1", s)
    assert "《" not in s and "｜" not in s, s
    return s


def rubies(raw: str) -> list[tuple[str, str]]:
    out = []
    pos = 0
    pat = re.compile(rf"｜([^｜《》]+?)《([^《》]+?)》|({KANJI}+)《([^《》]+?)》")
    for m in pat.finditer(raw, pos):
        out.append((m.group(1) or m.group(3), m.group(2) or m.group(4)))
    return out


def to_md(raw: str) -> str:
    def rep(m: re.Match) -> str:
        return "{ruby}`" + m.group(1) + "|" + m.group(2) + "`"
    s = RUBY_BAR.sub(rep, raw)
    s = RUBY_RUN.sub(rep, s)
    return s


def scenes(paras: list[str] | None = None) -> list[tuple[str, str, list[str]]]:
    paras = paras if paras is not None else source_paragraphs()
    starts = []
    for num, title, first in SCENES:
        idx = [i for i, p in enumerate(paras) if p.lstrip("　").startswith(first)]
        assert len(idx) == 1, (first, idx)
        starts.append(idx[0])
    assert starts == sorted(starts) and starts[0] == 0
    out = []
    for k, (num, title, _) in enumerate(SCENES):
        end = starts[k + 1] if k + 1 < len(starts) else len(paras)
        out.append((num, title, paras[starts[k]:end]))
    return out


if __name__ == "__main__":
    for num, title, ps in scenes():
        print(f"<!-- scene {num} {title}: {len(ps)} paragraphs, {sum(len(plain(p)) for p in ps)} characters -->")
        print("\n\n".join(to_md(p) for p in ps))
        print()
    sys.exit(0)
