"""Check that the book and the slides keep the Aozora Bunko text exactly.

    uv run scripts/verify.py        # exit 1 on any mismatch

1. 本文: the four 本文 sections of article.md, with Egatari Text markup removed
   ({ruby}, footnote marks and definitions, section ids), equal the source
   paragraphs with Aozora markup removed (the leading full-width space of a
   paragraph is not written in article.md). The ruby pairs are equal, in order.
2. 引用: every 「…」 in the guides, deck.html and narration.md is a verbatim
   substring of the source text (a quote with …… is checked part by part, in
   order), unless it is listed in NOT_FROM_TEXT with the reason.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import aozora  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# Quotes that are not from the text of 羅生門, with where they come from
NOT_FROM_TEXT = {
    "羅生門": "title",
    "勇気": "a word of the text, used as a term",
    "羅城門登上層見死人盗人語": "今昔物語集 29-18 title (池上 2004, p. 90)",
    "大刀帯陣売魚嫗語": "今昔物語集 31-31 title (池上 2004, p. 90; 宮田 1984)",
    "下人は、既に、雨を冒して、京都の町へ強盗を働きに急ぎつゝあつた。": "初出の結び (池上 2004, p. 84)",
    "急いでゐた。": "阿蘭陀書房版の語尾 (池上 2004, p. 84)",
    "芥川龍之介全集1": "Aozora colophon",
    "筑摩全集類聚　芥川龍之介全集第一巻": "Aozora colophon",
    "帝国文学": "Aozora colophon",
    "底本の編者による脚注は省略しました。": "Aozora colophon",
    "扭": "gaiji note", "眶": "gaiji note",
    "（大正四年九月）": "date line of the text (in parentheses in the source)",
    "仕方がない": None,  # checked: in the text
}

RUBY_ROLE = re.compile(r"\{ruby\}`([^`|]+)\|([^`]+)`")
STEP_ROLE = re.compile(r"\{step\}`[^`]*`")


def strip_md(s: str) -> str:
    s = RUBY_ROLE.sub(r"\1", s)
    s = STEP_ROLE.sub("", s)
    s = re.sub(r"\[\^[^\]]+\]", "", s)
    return s


def article_sections(text: str) -> dict[str, str]:
    out, cur, buf = {}, None, []
    for line in text.split("\n"):
        if line.startswith("## "):
            if cur:
                out[cur] = "\n".join(buf)
            cur, buf = line[3:].strip(), []
        elif cur is not None:
            buf.append(line)
    if cur:
        out[cur] = "\n".join(buf)
    return out


def body_paragraphs(sec: str) -> tuple[list[str], list[tuple[str, str]]]:
    paras, rubies = [], []
    for block in sec.split("\n\n"):
        block = block.strip()
        if not block or block.startswith("(sec-") or block.startswith("[^"):
            continue
        rubies += RUBY_ROLE.findall(block)
        paras.append(strip_md(block))
    return paras, rubies


def quotes(s: str) -> list[str]:
    """Outermost 「…」 spans (nesting-aware)."""
    out, depth, start = [], 0, 0
    for i, ch in enumerate(s):
        if ch == "「":
            if depth == 0:
                start = i + 1
            depth += 1
        elif ch == "」" and depth:
            depth -= 1
            if depth == 0:
                out.append(s[start:i])
    return out


def in_text(q: str, text: str) -> bool:
    pos = 0
    for part in [p for p in q.split("……") if p]:
        i = text.find(part, pos)
        if i < 0:
            return False
        pos = i + len(part)
    return True


def main() -> int:
    errors = 0
    paras = aozora.source_paragraphs()
    src_plain = "".join(aozora.plain(p) for p in paras)
    secs = article_sections((ROOT / "article.md").read_text(encoding="utf-8"))

    # 1. 本文
    for (num, title, ps) in aozora.scenes(paras):
        head = f"{num}　{title}"
        got, got_ruby = body_paragraphs(secs[head])
        want = [aozora.plain(p).lstrip("　") for p in ps]
        want_ruby = [r for p in ps for r in aozora.rubies(p)]
        if got != want:
            errors += 1
            for k, (g, w) in enumerate(zip(got, want)):
                if g != w:
                    print(f"本文 {head} paragraph {k + 1} differs:\n  got  {g[:80]}\n  want {w[:80]}")
                    break
            if len(got) != len(want):
                print(f"本文 {head}: {len(got)} paragraphs, source has {len(want)}")
        if got_ruby != want_ruby:
            errors += 1
            print(f"本文 {head}: ruby differs ({len(got_ruby)} vs {len(want_ruby)})")
        print(f"本文 {head}: {len(got)} paragraphs, {sum(map(len, got))} characters, {len(got_ruby)} ruby — {'OK' if got == want and got_ruby == want_ruby else 'NG'}")

    # 2. 引用
    guide = "\n".join(v for k, v in secs.items() if not any(k == f"{n}　{t}" for n, t, _ in aozora.SCENES))
    deck = (ROOT / "deck.html").read_text(encoding="utf-8")
    deck_text = html.unescape(re.sub(r"<[^>]+>", "", deck.split('<div id="stage">', 1)[1]))
    deck_text = re.sub(r"\{([^|{}]+)\|[^{}]*\}", r"\1", deck_text).replace("==", "")
    narr = re.sub(r"\{([^|{}]+)\|[^{}]*\}", r"\1", (ROOT / "narration.md").read_text(encoding="utf-8"))
    head_text = (ROOT / "article.md").read_text(encoding="utf-8").split("\n## ", 1)[0]
    n = 0
    for where, s in [("article (guides)", strip_md(head_text + guide)), ("deck.html", deck_text), ("narration.md", narr)]:
        for q in quotes(s):
            q = re.sub(r"\n\s*", "", q)
            n += 1
            if in_text(q, src_plain):
                continue
            if NOT_FROM_TEXT.get(q):
                continue
            errors += 1
            print(f"引用 ({where}) not in the text: 「{q}」")
    # m-gendai passages on the slides: each paragraph, markup removed, is from the text
    for block in re.findall(r"<m-gendai[^>]*>(.*?)</m-gendai>", deck, re.S):
        for para in re.split(r"\n\s*\n", block.strip()):
            lines = [ln.strip() for ln in para.strip().split("\n") if ln.strip() and not ln.strip().startswith("@")]
            t = re.sub(r"\{([^|{}]+)\|[^{}]*\}", r"\1", "".join(lines)).replace("==", "").replace("__", "")
            n += 1
            if not in_text(t, src_plain):
                errors += 1
                print(f"m-gendai passage not in the text: {t[:60]}")
    print(f"引用: {n} checked")
    print("OK" if not errors else f"{errors} problem(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
