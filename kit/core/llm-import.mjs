// チャットの AI（claude.ai・Gemini・ChatGPT など）の返事から deck.html と narration.md を取り出す（docs/authoring-with-llms.md §1 の形）。
// Node にもブラウザにも依存しない（純粋な ESM）。編集アプリの「新規作成…」「修正…」などのチャットの AI のやり方（app/llm.js）と試験（tools/test-llm.mjs）が使う
//
//   extractBlocks(text) → {deck, narration, warnings: [], error: null | {code, message, line}}
//     コードの囲み（``` か ~~~、3 つ以上）を探す。囲みの名前（```deck.html・```html・```markdown・```html title="deck.html"・```html:deck.html）、
//     囲みの直前の行のファイル名（**deck.html**・deck.html:・### narration.md）、中身（<!DOCTYPE・<section class="slide" / ## 見出しと [0]）の
//     順で、どちらのファイルかを決める。CRLF・前後や間の説明の文章はかまわない。同じファイルの囲みが 2 つ以上なら最後のものを使う（知らせる）
//     閉じていない囲み → error 'unclosed'（返事が途中で切れた）。囲みがなくても、<!DOCTYPE html> … </html> と、その後ろの
//     「## 見出し」と [0] の行があれば取り出す（画面からそのまま写したとき。知らせる）
//   mergeSlides(deck, patch) → {deck, replaced: [id…], missing: [id…]}
//     patch（<section class="slide" id="…"> だけを並べたもの）の各スライドで、deck の同じ id のスライドを置き換える
//   mergeNarration(narration, patch) → {narration, replaced: [id…], added: [id…]}
//     patch の「## 見出し {#id}」の節で、narration の同じ id の節を置き換える（なければ後ろに足す）
//   sectionsOf(deck) → [{id, start, end}]（<section class="slide"> の元の位置）。narrSections(text) → {lines, out: [{id, start, end}]}（「## 」の節の行）
//   isPatch(deck) → <html> も <!DOCTYPE> もなく、<section class="slide" があるか（直したスライドだけの返事）
//   pastePart(text) → extractBlocks の結果に {part, fenced} を足したもの。囲みを 1 つずつ（チャットの囲みの右上のコピーで）写して貼ったときに、
//     届いたのがどちらかを決める。part：'both'（2 つとも）・'deck'・'narration'（片方だけ）・null（誤り。error を見る）。
//     囲みのない中身は、<section class="slide" の構造があれば deck.html、「## 見出し」と [0] などの行があれば narration.md（両方なら
//     error 'ambiguous'、どちらでもなければ今までどおり 'no-blocks'）。fenced：囲みの行があったか（なければ囲みの中身だけを写したもの）
import { parse } from 'parse5';
import { parseHeading } from './narration-core.mjs';

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const DECK_NAME = /(^|[\s"'`:=/\\[(])deck\.html?\b/i;
const NARR_NAME = /(^|[\s"'`:=/\\[(])narration\.md\b/i;

function kindOfLabel(info) {
  const s = String(info || '').trim();
  if (!s) return null;
  if (DECK_NAME.test(' ' + s)) return 'deck';
  if (NARR_NAME.test(' ' + s)) return 'narration';
  const lang = s.split(/[\s:{]/)[0].toLowerCase();
  if (/^(html|htm|xhtml|xml)$/.test(lang)) return 'deck';
  if (/^(markdown|md|mdx)$/.test(lang)) return 'narration';
  return null;
}
function kindOfContent(body) {
  if (/<!doctype\s+html|<html[\s>]|<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/i.test(body)) return 'deck';
  if (/^##\s+\S/m.test(body) && /^\s*\[(\d+|concl)\]/m.test(body)) return 'narration';
  return null;
}
// 囲みの直前の行（空行を除いて 1 行）にファイル名だけが書いてあるか（**deck.html**・`narration.md`:・### deck.html・deck.html：）
function kindOfPrev(lines, i) {
  for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
    const t = lines[j].trim();
    if (!t) continue;
    if (t.length > 80) return null;
    const bare = t.replace(/^[#>*\-\s]+/, '').replace(/[*_`"'「」『』:：]+/g, ' ').trim();
    if (/^(?:\S+\/)?deck\.html?(\s|$)/i.test(bare)) return 'deck';
    if (/^(?:\S+\/)?narration\.md(\s|$)/i.test(bare)) return 'narration';
    return null;
  }
  return null;
}

export function extractBlocks(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const blocks = [];
  const warnings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE);
    if (!m) continue;
    const ch = m[1][0], len = m[1].length, info = m[2];
    if (ch === '`' && info.includes('`')) continue;   // 行の中のコード（```a``` の形）は囲みではない
    let j = i + 1;
    const close = new RegExp(`^ {0,3}${ch === '`' ? '`' : '~'}{${len},}\\s*$`);
    // 閉じ忘れ：同じ長さ以上の、名前の付いた次の囲み（```narration.md・```markdown など）が始まったら、そこで閉じたものとみなす
    // （閉じる行には名前が付かないので、名前の付いた囲みの行は中身ではない。長い囲み（````）の中の短い ``` は中身のまま）
    let auto = false;
    while (j < lines.length && !close.test(lines[j])) {
      const n2 = lines[j].match(FENCE);
      if (n2 && n2[1][0] === ch && n2[1].length >= len && n2[2].trim() && !(ch === '`' && n2[2].includes('`'))) { auto = true; break; }
      j++;
    }
    const body = lines.slice(i + 1, j).join('\n');
    const label = kindOfLabel(info), prev = kindOfPrev(lines, i), content = kindOfContent(body);
    const kind = (info.match(DECK_NAME) || info.match(NARR_NAME)) ? label : prev || label || content;
    if (j >= lines.length) {
      blocks.push({ kind, body, line: i + 1, unclosed: true, info: info.trim() });
      break;
    }
    blocks.push({ kind, body, line: i + 1, info: info.trim() });
    if (auto) { warnings.push({ code: 'autoclosed', line: i + 1 }); i = j - 1; continue; }
    i = j;
  }
  const res = { deck: null, narration: null, warnings, error: null };
  const pick = (kind) => {
    const list = blocks.filter((b) => b.kind === kind && !b.unclosed);
    if (list.length > 1) warnings.push({ code: 'several', kind, n: list.length });
    return list.length ? list[list.length - 1] : null;
  };
  const open = blocks.find((b) => b.unclosed);
  if (blocks.length) {
    const d = pick('deck'), n = pick('narration');
    // 閉じていない囲み：中身があり、2 つのどちらかが欠けているか、その囲みがどちらかのファイルなら、返事が切れている
    // 最後の narration.md の囲みだけ閉じる行がないが、中身は終わっている（どのスライドにも節があり、最後の節の最後の行が
    // 文の終わり（。.!? など）で終わる）なら、閉じたものとして受け取る（知らせる）
    if (open && open.kind === 'narration' && d && !n && narrationComplete(d.body, open.body)) {
      warnings.push({ code: 'unclosedAccepted', kind: 'narration', line: open.line });
      open.unclosed = false;
      res.deck = d.body; res.narration = open.body;
    } else if (open && open.body.trim() && (!d || !n || open.kind)) {
      // 閉じている方は返す（切れたのが narration.md なら、送り直してもらった口述原稿と合わせられる。app/llm.js）
      res.deck = d ? d.body.replace(/\s+$/, '') + '\n' : null; res.narration = n ? n.body.replace(/\s+$/, '') + '\n' : null;
      res.error = { code: 'unclosed', kind: open.kind, line: open.line, message: `the code block that starts on line ${open.line}${open.kind ? ` (${open.kind === 'deck' ? 'deck.html' : 'narration.md'})` : ''} has no closing fence: the reply was probably cut off` };
      return res;
    }
    if (!res.deck) { res.deck = d ? d.body : null; res.narration = n ? n.body : null; }
    const unknown = blocks.filter((b) => !b.kind && !b.unclosed).length;
    if (unknown) warnings.push({ code: 'ignored', n: unknown });
  } else {
    // 囲みのない返事（チャットの画面から文字を選んで写したなど）
    const a = src.search(/<!doctype\s+html|<html[\s>]/i), b = src.search(/<\/html>/i);
    if (a >= 0 && b > a) {
      res.deck = src.slice(a, b + '</html>'.length);
      const rest = src.slice(b + '</html>'.length).split('\n');
      const h = rest.findIndex((ln) => /^#{1,2}\s+\S/.test(ln));
      if (h >= 0 && rest.slice(h).some((ln) => /^\s*\[(\d+|concl)\]/.test(ln))) res.narration = rest.slice(h).join('\n').trim();
      warnings.push({ code: 'unfenced' });
    }
  }
  if (res.deck === null) {
    res.error = blocks.length
      ? { code: 'no-deck', message: 'no deck.html block: the reply has code blocks, but none of them is the slide deck (```deck.html … ```)' }
      : { code: 'no-blocks', message: 'no code blocks found: paste the whole reply, including the ``` lines (use the chat’s copy button for the whole message)' };
    return res;
  }
  if (!/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/i.test(res.deck)) {
    res.error = { code: 'no-slides', message: 'the deck.html block has no <section class="slide">' };
    return res;
  }
  res.deck = res.deck.replace(/\s+$/, '') + '\n';
  if (res.narration !== null) res.narration = res.narration.replace(/\s+$/, '') + '\n';
  return res;
}

// 閉じていない narration.md の中身が終わっているか：deck.html のどのスライド（id か見出しの字）にも「## 」の節があり、最後の節の最後の行が
// 文の終わりの字（。．.!?！？ と閉じ括弧）で終わる（[concl] の行でも同じ）
function narrationComplete(deck, narr) {
  const lines = String(narr).replace(/\s+$/, '').split('\n');
  const N = narrSections(lines.join('\n'));
  if (!N.out.length) return false;
  const ids = new Set(N.out.map((x) => x.id).filter(Boolean));
  const heads = new Set(N.out.map((x) => parseHeading(lines[x.start].replace(/^##\s+/, '').trim()).heading.trim()));
  const slides = sectionsOf(deck);
  if (!slides.length) return false;
  for (const sl of slides) {
    const h = (deck.slice(sl.start, sl.end).match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i) || [])[1];
    const title = h ? h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
    if (!((sl.id && ids.has(sl.id)) || (title && heads.has(title)))) return false;
  }
  const last = N.out[N.out.length - 1];
  const body = lines.slice(last.start + 1, last.end).filter((ln) => ln.trim());
  if (!body.length) return false;
  const tail = body[body.length - 1].trim();
  // [concl] の行でも、文の終わりの字で終わっていなければ切れているとみなす（「[concl] 次は、伸びの」）
  return /[。．.!?！？][」』）)"”]*$/.test(tail);
}

export function pastePart(text) {
  const r = extractBlocks(text);
  const fenced = !r.warnings.some((w) => w.code === 'unfenced') && !(r.error && r.error.code === 'no-blocks');
  if (!r.error) return { ...r, part: r.narration !== null ? 'both' : 'deck', fenced };
  // 囲みはあるが deck.html がない：narration.md の囲みだけ
  if (r.error.code === 'no-deck' && r.narration !== null) return { ...r, narration: r.narration.replace(/\s+$/, '') + '\n', error: null, part: 'narration', fenced: true };
  if (r.error.code !== 'no-blocks') return { ...r, part: null, fenced };
  // 囲みのない中身（囲みの右上のコピーで写したもの）：中身の形で決める
  const src = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
  const deckLike = /<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/i.test(src);
  const narrLike = /^##\s+\S/m.test(src) && /^\s*\[(\d+|concl)\]/m.test(src);
  if (deckLike && narrLike) return { ...r, part: null, fenced: false, error: { code: 'ambiguous', message: 'the pasted text has both slide markup (<section class="slide">) and narration lines (## heading, [0]) but no code blocks: paste the whole reply, or one block at a time' } };
  // <!DOCTYPE html> はあるが </html> がない：写したものが途中で切れている
  if (deckLike && /<!doctype\s+html|<html[\s>]/i.test(src) && !/<\/html>/i.test(src)) return { ...r, part: null, fenced: false, error: { code: 'cut-deck', message: 'the pasted deck.html has <!DOCTYPE html> but no </html>: it was probably cut off' } };
  if (deckLike) return { deck: src + '\n', narration: null, warnings: [], error: null, part: 'deck', fenced: false };
  if (narrLike) return { deck: null, narration: src + '\n', warnings: [], error: null, part: 'narration', fenced: false };
  return { ...r, part: null, fenced: false };
}

export const isPatch = (deck) => !/<!doctype\s|<html[\s>]/i.test(deck) && /<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/i.test(deck);

export function sectionsOf(src) {
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const out = [];
  const walk = (n) => {
    if (n.tagName === 'section' && n.sourceCodeLocation && ((n.attrs || []).find((a) => a.name === 'class')?.value || '').split(/\s+/).includes('slide')) {
      const id = (n.attrs || []).find((a) => a.name === 'id')?.value || null;
      out.push({ id, start: n.sourceCodeLocation.startOffset, end: n.sourceCodeLocation.endOffset });
      return;
    }
    for (const c of n.childNodes || []) walk(c);
    if (n.content) walk(n.content);
  };
  walk(doc);
  return out;
}

export function mergeSlides(deck, patch) {
  const mine = sectionsOf(deck), theirs = sectionsOf(patch);
  const byId = new Map(theirs.filter((s) => s.id).map((s) => [s.id, patch.slice(s.start, s.end)]));
  const replaced = [], edits = [];
  for (const s of mine) if (s.id && byId.has(s.id)) { edits.push([s.start, s.end, byId.get(s.id)]); replaced.push(s.id); }
  let out = deck;
  for (const [a, b, t] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + t + out.slice(b);
  const missing = [...byId.keys()].filter((id) => !replaced.includes(id));
  return { deck: out, replaced, missing, unnamed: theirs.filter((s) => !s.id).length };
}

// 節：「## 見出し {#id}」の行から次の「## 」の行の手前まで（注釈の中は見ない）
export function narrSections(text) {
  const lines = text.split('\n');
  const out = [];
  let inComment = false;
  lines.forEach((ln, i) => {
    if (inComment) { if (ln.includes('-->')) inComment = false; return; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; return; }
    const h = ln.match(/^##\s+(.+?)\s*$/);
    if (h) { if (out.length) out[out.length - 1].end = i; out.push({ id: parseHeading(h[1]).id, start: i, end: lines.length }); }
  });
  return { lines, out };
}
export function mergeNarration(narration, patch) {
  const a = narrSections(String(narration).replace(/\r\n?/g, '\n')), b = narrSections(String(patch).replace(/\r\n?/g, '\n'));
  const theirs = new Map(b.out.filter((s) => s.id).map((s) => [s.id, b.lines.slice(s.start, s.end).join('\n').replace(/\s+$/, '')]));
  const replaced = [];
  let lines = a.lines.slice();
  for (const s of [...a.out].reverse()) {
    if (!s.id || !theirs.has(s.id)) continue;
    const keepBlank = s.end < lines.length ? [''] : [];
    lines.splice(s.start, s.end - s.start, ...theirs.get(s.id).split('\n'), ...keepBlank);
    replaced.push(s.id);
  }
  const added = [...theirs.keys()].filter((id) => !replaced.includes(id));
  let out = lines.join('\n').replace(/\s+$/, '') + '\n';
  for (const id of added) out += '\n' + theirs.get(id) + '\n';
  return { narration: out, replaced: replaced.reverse(), added };
}
