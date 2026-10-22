// スライドの足す・複製・削除・並べ替え（編集アプリのスライド一覧 app/slides-panel.js。backlog #79）。Node にもブラウザにも依存しない（純粋な ESM）
// 原稿（deck.html）・口述原稿（narration.md）・音声の記録（audio/manifest.json）の文字列を受け取り、新しい文字列を返す。読み書きはしない
//
//   slideChunks(src)                         → {slides: [{index, id, key, heading, start, end, cStart, cEnd}], problem}
//       cStart〜cEnd：動かすときの塊（<section> の行の頭から行末の改行まで。直前の注釈 <!-- … --> も含む）。
//       塊と塊の間の文字（空行・閉じタグなど）は動かさない。スライドが入れ子になっている・塊が重なるなら problem
//   insertSlide(src, after, html)            → 文字列     after 番目（0 から）のスライドの後ろに html の <section> を入れる（-1 なら先頭）
//   duplicateSlide(src, index, newId)        → {out, html}  その <section> を写して直後に入れる。写しの id は newId（data-key は外す）
//   deleteSlide(src, index)                  → 文字列
//   moveSlide(src, from, to)                 → 文字列     from 番目を to 番目へ（ほかのスライドの順はそのまま）
//   slideTemplate(kind, {lang, id})          → {html, heading, steps}   新しいスライドの雛形（TEMPLATES の名前）。steps：口述原稿の段階
//   narration：sectionsOf(text)・insertSection(text, order, key, lines)・copySections(text, fromKey, slide)・removeSections(text, key)・reorderSections(text, order)
//   manifest：removeAudio(text, slideKey) → {out, removed: {鍵: 記録}, files: [もう使われない audio/ の下のファイル]}
//   newIdFor(src, rand?)                     → 文書のどの id・スライドの鍵とも重ならない s-xxxxxx
import { parse } from 'parse5';
import { analyzeSlideIds } from './build-core.mjs';
import { newSlideId, headingLine, parseHeading, splitKey } from './narration-core.mjs';

export const TEMPLATES = ['title-body', 'two-cols', 'figure', 'section', 'quote'];

function walk(node, fn) {
  fn(node);
  for (const c of node.childNodes || []) walk(c, fn);
  if (node.content) walk(node.content, fn);
}
const attrOf = (n, a) => (n.attrs || []).find((x) => x.name === a);
const isSlide = (n) => n.tagName === 'section' && (attrOf(n, 'class')?.value || '').split(/\s+/).includes('slide');

// ---------------------------------------------------------------- 原稿の中のスライドの場所
export function slideChunks(src) {
  const a = analyzeSlideIds(src);
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const nodes = [];
  walk(doc, (n) => { if (n.tagName && isSlide(n)) nodes.push(n); });
  let problem = a.problems.length ? a.problems.map((p) => p.msg).join(' / ') : null;
  const slides = nodes.map((n, i) => {
    const L = n.sourceCodeLocation;
    const s = a.slides[i];
    if (!L || !L.endTag) problem = problem || `slide ${i + 1} has no end tag (</section>)`;
    const start = L ? L.startOffset : 0, end = L ? L.endOffset : 0;
    // 塊の頭：行の頭まで（その間が空白だけなら）。直前の注釈（空白だけを挟んで、空行なしで続くもの）も含める
    let cStart = lineHead(src, start);
    const sibs = n.parentNode ? n.parentNode.childNodes : [];
    for (let j = sibs.indexOf(n) - 1; j >= 0; j--) {
      const p = sibs[j];
      if (p.nodeName === '#text' && /^[ \t]*\r?\n?[ \t]*$/.test(p.value)) continue;
      if (p.nodeName === '#comment' && p.sourceCodeLocation) {
        const h = lineHead(src, p.sourceCodeLocation.startOffset);
        if (h === p.sourceCodeLocation.startOffset || /^[ \t]*$/.test(src.slice(h, p.sourceCodeLocation.startOffset))) {
          if (/\n[ \t]*\r?\n/.test(src.slice(p.sourceCodeLocation.endOffset, cStart + 1))) break;   // 空行で離れている
          cStart = h; continue;
        }
      }
      break;
    }
    // 塊の終わり：</section> の後ろの空白と、行末の改行まで
    let cEnd = end;
    const m = /^[ \t]*\r?\n/.exec(src.slice(end));
    if (m) cEnd = end + m[0].length;
    return { index: i, id: s ? s.id : null, key: s ? s.key : `s${i + 1}`, heading: s ? s.heading : '', start, end, cStart, cEnd };
  });
  for (let i = 1; i < slides.length; i++) if (slides[i].cStart < slides[i - 1].cEnd) problem = problem || `slides ${i} and ${i + 1} overlap (a slide inside a slide?)`;
  return { slides, problem };
}
function lineHead(src, off) {
  let h = off;
  while (h > 0 && (src[h - 1] === ' ' || src[h - 1] === '\t')) h--;
  return h > 0 && src[h - 1] !== '\n' ? off : h;
}
function need(src) {
  const c = slideChunks(src);
  if (c.problem) throw Object.assign(new Error(c.problem), { code: 'deck-problem' });
  if (!c.slides.length) throw Object.assign(new Error('the deck has no slides'), { code: 'no-slides' });
  return c.slides;
}
// 原稿を [間0, 塊0, 間1, 塊1, …, 塊n-1, 残り] に分ける
function pieces(src, slides) {
  const gaps = [], chunks = [];
  let at = 0;
  for (const s of slides) { gaps.push(src.slice(at, s.cStart)); chunks.push(src.slice(s.cStart, s.cEnd)); at = s.cEnd; }
  return { gaps, chunks, tail: src.slice(at) };
}
const assemble = (gaps, chunks, tail) => chunks.map((c, i) => gaps[i] + c).join('') + tail;
const blankish = (t) => /^\s*$/.test(t);
const eolOf = (t) => (t.includes('\r\n') ? '\r\n' : '\n');

export function insertSlide(src, after, html) {
  const slides = need(src);
  const { gaps, chunks, tail } = pieces(src, slides);
  const eol = eolOf(src);
  const at = Math.max(0, Math.min(slides.length, after + 1));
  const text = String(html).replace(/\r?\n/g, eol).replace(/\s*$/, '') + eol;
  // 新しい塊の前の間：後ろのスライドの前の間が空白だけならそれを写す（空行の数を揃える）。なければ空行 1 つ
  const gap = at < slides.length && blankish(gaps[at]) && at > 0 ? gaps[at] : eol;
  if (at === slides.length) {
    // 最後のスライドの後ろ：塊の後ろに足し、残りはそのまま
    chunks.push(text); gaps.push(gap);
  } else if (at === 0) {
    // 先頭：最初のスライドの前の間（<div id="stage"> など）は新しい塊の前に残す
    chunks.unshift(text); gaps.splice(1, 0, eol);
  } else { chunks.splice(at, 0, text); gaps.splice(at, 0, gap); }
  return assemble(gaps, chunks, tail);
}

export function duplicateSlide(src, index, newId) {
  const slides = need(src);
  const s = slides[index];
  if (!s) throw Object.assign(new Error(`no slide ${index + 1}`), { code: 'no-slide' });
  const doc = parse(src, { sourceCodeLocationInfo: true });
  let node = null, n = 0;
  walk(doc, (x) => { if (x.tagName && isSlide(x)) { if (n === index) node = x; n++; } });
  const L = node.sourceCodeLocation, tag = L.startTag;
  let head = src.slice(tag.startOffset, tag.endOffset);
  const edits = [];
  const idA = L.startTag.attrs && L.startTag.attrs.id, dk = L.startTag.attrs && L.startTag.attrs['data-key'];
  if (idA) edits.push([idA.startOffset, idA.endOffset, `id="${newId}"`]);
  if (dk) {
    // data-key の属性を、前の空白ごと外す
    let b = dk.startOffset; while (b > tag.startOffset && /\s/.test(src[b - 1])) b--;
    edits.push([b, dk.endOffset, '']);
  }
  if (!idA) {
    let at = tag.endOffset - 1; if (src[at - 1] === '/') at--;
    while (at > tag.startOffset && /\s/.test(src[at - 1])) at--;
    edits.push([at, at, ` id="${newId}"`]);
  }
  edits.sort((x, y) => y[0] - x[0]);
  for (const [a, b, t] of edits) head = head.slice(0, a - tag.startOffset) + t + head.slice(b - tag.startOffset);
  const html = head + src.slice(tag.endOffset, s.end);
  return { out: insertSlide(src, index, html), html };
}

export function deleteSlide(src, index) {
  const slides = need(src);
  if (!slides[index]) throw Object.assign(new Error(`no slide ${index + 1}`), { code: 'no-slide' });
  const { gaps, chunks, tail } = pieces(src, slides);
  chunks.splice(index, 1);
  // 塊の前の間が空白だけなら一緒に消す（空行が重ならないように）。先頭のスライドなら、後ろの間が空白だけのときそれを消す
  if (index > 0 && blankish(gaps[index])) gaps.splice(index, 1);
  else if (index + 1 < gaps.length && blankish(gaps[index + 1])) gaps.splice(index + 1, 1);
  else { const g = gaps.splice(index, 1)[0]; if (index < gaps.length) gaps[index] = g + gaps[index]; else return assemble(gaps, chunks, g + tail); }
  return assemble(gaps, chunks, tail);
}

export function moveSlide(src, from, to) {
  const slides = need(src);
  if (!slides[from] || to < 0 || to >= slides.length) throw Object.assign(new Error(`cannot move slide ${from + 1} to ${to + 1}`), { code: 'no-slide' });
  if (from === to) return src;
  const { gaps, chunks, tail } = pieces(src, slides);
  const [c] = chunks.splice(from, 1);
  chunks.splice(to, 0, c);
  return assemble(gaps, chunks, tail);
}

export function newIdFor(src, rand) {
  const a = analyzeSlideIds(src);
  const taken = new Set([...a.docIds.keys(), ...a.slides.map((s) => s.key)]);
  return rand ? newSlideId(taken, rand) : newSlideId(taken);
}

// ---------------------------------------------------------------- 新しいスライドの雛形（kit/layouts.css にある体裁だけ）
const TPL = {
  ja: {
    'title-body': { h: '新しいスライド', li: ['1 つ目の項目', '2 つ目の項目'], concl: '⇒ このスライドの結論', n: '（ここにこのスライドで話すことを書きます）', ni: ['（1 つ目の項目で話すことを書きます）', '（2 つ目の項目で話すことを書きます）'], nc: '（結論の行で話すことを書きます）' },
    'two-cols': { h: '2 つを比べる', a: '左の列', b: '右の列', concl: '⇒ 比べて分かること', n: '（左と右を比べて話します）', nc: '（結論の行で話すことを書きます）' },
    figure: { h: '図の題', fig: '図をここに', cap: '図 1：図の説明', concl: '→ 図から読み取れること', n: '（図を指しながら話すことを書きます）', nc: '（結論の行で話すことを書きます）' },
    section: { h: '新しい章', lead: 'この章で話すこと', n: '（ここから新しい章です）' },
    quote: { h: '引用', q: '「引用する文をここに書きます」', cite: '— 出典', n: '（引用を読み上げ、何を言っているかを話します）' },
  },
  en: {
    'title-body': { h: 'New slide', li: ['First point', 'Second point'], concl: '⇒ The point of this slide', n: '(Write what you say on this slide here.)', ni: ['(Write what you say with the first point.)', '(Write what you say with the second point.)'], nc: '(Write what you say with the conclusion line.)' },
    'two-cols': { h: 'Compare two things', a: 'Left column', b: 'Right column', concl: '⇒ What the comparison shows', n: '(Compare the left and the right.)', nc: '(Write what you say with the conclusion line.)' },
    figure: { h: 'Figure title', fig: 'Figure goes here', cap: 'Figure 1: what it shows', concl: '→ What the figure shows', n: '(Point at the figure and explain it.)', nc: '(Write what you say with the conclusion line.)' },
    section: { h: 'New chapter', lead: 'What this chapter covers', n: '(A new chapter starts here.)' },
    quote: { h: 'Quote', q: '“Write the quoted text here.”', cite: '— Source', n: '(Read the quote and say what it means.)' },
  },
};
export function slideTemplate(kind, { lang = 'ja', id }) {
  const t = (lang === 'en' ? TPL.en : TPL.ja)[kind];
  if (!t) throw new Error('unknown slide template: ' + kind);
  const sid = ` id="${id}"`;
  let html, steps;
  if (kind === 'title-body') {
    html = `<section class="slide"${sid}>\n  <h2>${t.h}</h2>\n  <div class="body">\n    <ul>\n${t.li.map((x) => `      <li>${x}</li>`).join('\n')}\n    </ul>\n  </div>\n  <div class="concl"><span>${t.concl}</span></div>\n</section>`;
    // 本文の直下の箇条は 1 つずつステップになる（kit/deck.js の autoList）
    steps = [['0', t.n], ['1', t.ni[0]], ['2', t.ni[1]], ['concl', t.nc]];
  } else if (kind === 'two-cols') {
    html = `<section class="slide"${sid}>\n  <h2>${t.h}</h2>\n  <div class="body">\n    <div class="cols">\n      <div><p class="sub">${t.a}</p><ul><li>…</li></ul></div>\n      <div><p class="sub">${t.b}</p><ul><li>…</li></ul></div>\n    </div>\n  </div>\n  <div class="concl"><span>${t.concl}</span></div>\n</section>`;
    steps = [['0', t.n], ['concl', t.nc]];
  } else if (kind === 'figure') {
    html = `<section class="slide"${sid}>\n  <h2>${t.h}</h2>\n  <div class="body">\n    <div class="fig"><svg viewBox="0 0 1184 360" role="img" aria-label="${t.fig}"><rect x="2" y="2" width="1180" height="356" rx="12" style="fill:none;stroke:var(--line);stroke-width:3;stroke-dasharray:12 8"/><text x="592" y="190" text-anchor="middle" style="fill:var(--muted);font-size:32px">${t.fig}</text></svg></div>\n    <p class="figcap">${t.cap}</p>\n  </div>\n  <div class="concl"><span>${t.concl}</span></div>\n</section>`;
    steps = [['0', t.n], ['concl', t.nc]];
  } else if (kind === 'section') {
    html = `<section class="slide sec noconcl static"${sid}>\n  <h1>${t.h}</h1>\n  <div class="lead">${t.lead}</div>\n</section>`;
    steps = [['0', t.n]];
  } else {
    html = `<section class="slide noconcl"${sid}>\n  <h2>${t.h}</h2>\n  <div class="body">\n    <div class="box" style="font-size:36px;line-height:1.6;margin-top:48px;padding:28px 36px">${t.q}</div>\n    <p class="cite" style="text-align:right;font-size:24px">${t.cite}</p>\n  </div>\n</section>`;
    steps = [['0', t.n]];
  }
  return { html, heading: t.h, steps };
}

// ---------------------------------------------------------------- 口述原稿（narration.md）の節
// 節：「## 見出し」の行から次の「## 」の行の前まで（parseNarration と同じく、注釈 <!-- … --> の中の行は見出しにしない）。
// 最初の節の前（# 題・注釈など）は pre。節の末尾の空行は、組み直すときに 1 つに揃える
export function sectionsOf(text) {
  const eol = eolOf(String(text));
  const lines = String(text).split(/\r?\n/);
  const heads = [];
  let inComment = false;
  lines.forEach((ln, i) => {
    if (inComment) { if (ln.includes('-->')) inComment = false; return; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; return; }
    const h = ln.match(/^##\s+(.+?)\s*$/);
    if (h) heads.push({ i, key: parseHeading(h[1]).key });
  });
  const pre = lines.slice(0, heads.length ? heads[0].i : lines.length);
  const sections = heads.map((h, j) => ({ key: h.key, lines: lines.slice(h.i, j + 1 < heads.length ? heads[j + 1].i : lines.length) }));
  return { eol, pre, sections };
}
const trimEnd = (ls) => { const o = ls.slice(); while (o.length && !o[o.length - 1].trim()) o.pop(); return o; };
function joinSections({ eol, pre, sections }, tailBlank) {
  const out = [];
  const p = trimEnd(pre);
  if (p.length) out.push(...p, '');
  sections.forEach((s) => out.push(...trimEnd(s.lines), ''));
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join(eol) + (tailBlank ? eol : '');
}
const endsWithEol = (t) => /\r?\n$/.test(String(t));

// order：操作の後のスライドの鍵の順。lines：新しい節の行（見出しを含む）。前のスライドの節の後ろ、なければ後ろのスライドの節の前、なければ最後
export function insertSection(text, order, key, lines) {
  const S = sectionsOf(text ?? '');
  const j = order.indexOf(key);
  let at = S.sections.length;
  const lastOf = (k) => { let r = -1; S.sections.forEach((s, i) => { if (s.key === k) r = i; }); return r; };
  let found = false;
  for (let p = j - 1; p >= 0 && !found; p--) { const r = lastOf(order[p]); if (r >= 0) { at = r + 1; found = true; } }
  for (let p = j + 1; p < order.length && !found; p++) { const r = S.sections.findIndex((s) => s.key === order[p]); if (r >= 0) { at = r; found = true; } }
  S.sections.splice(at, 0, { key, lines });
  return joinSections(S, text == null || text === '' || endsWithEol(text));
}
// fromKey の節（同じ鍵の節が複数あればすべて）を写し、見出しを slide（{key, id, heading}）の行にして、元の節の直後に入れる
export function copySections(text, fromKey, slide) {
  const S = sectionsOf(text ?? '');
  const idx = S.sections.map((s, i) => (s.key === fromKey ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return { out: text, copied: false };
  const copies = idx.map((i) => ({ key: slide.key, lines: [headingLine(slide), ...S.sections[i].lines.slice(1)] }));
  S.sections.splice(idx[idx.length - 1] + 1, 0, ...copies);
  return { out: joinSections(S, endsWithEol(text)), copied: true };
}
export function removeSections(text, key) {
  if (text == null) return { out: text, removed: 0 };
  const S = sectionsOf(text);
  const n = S.sections.length;
  S.sections = S.sections.filter((s) => s.key !== key);
  if (S.sections.length === n) return { out: text, removed: 0 };
  return { out: joinSections(S, endsWithEol(text)), removed: n - S.sections.length };
}
// 節をスライドの順に並べ替える。どのスライドにも当たらない節は、元の場所（何番目の節か）に残す。同じ鍵の節は元の順のまま並ぶ
export function reorderSections(text, order) {
  if (text == null) return text;
  const S = sectionsOf(text);
  const rank = new Map(order.map((k, i) => [k, i]));
  const slots = [], known = [];
  S.sections.forEach((s, i) => { if (rank.has(s.key)) { slots.push(i); known.push({ s, i }); } });
  known.sort((a, b) => rank.get(a.s.key) - rank.get(b.s.key) || a.i - b.i);
  const next = S.sections.slice();
  slots.forEach((slot, j) => { next[slot] = known[j].s; });
  if (next.every((s, i) => s === S.sections[i])) return text;
  S.sections = next;
  return joinSections(S, endsWithEol(text));
}
// 節の段階（[k]）の数（消すときの知らせ）
export function stepsIn(text, key) {
  if (text == null) return 0;
  return sectionsOf(text).sections.filter((s) => s.key === key).reduce((n, s) => n + s.lines.filter((l) => /^\s*\[(\d+|concl)\]/.test(l)).length, 0);
}

// ---------------------------------------------------------------- 音声の記録（audio/manifest.json）
// {segments: {…}} の形と、古い平たい形（{鍵: 記録}）のどちらも。消した記録のファイルのうち、残る記録が指さないものを files に
export function audioEntries(text) {
  if (text == null || !String(text).trim()) return { man: null, seg: {} };
  const man = JSON.parse(text);
  if (!man || typeof man !== 'object' || Array.isArray(man)) throw Object.assign(new Error('audio/manifest.json is not an object'), { code: 'bad-manifest' });
  const seg = man.segments && typeof man.segments === 'object' && !Array.isArray(man.segments) ? man.segments : Object.prototype.hasOwnProperty.call(man, 'segments') ? null : man;
  if (!seg) throw Object.assign(new Error('audio/manifest.json: segments is not an object'), { code: 'bad-manifest' });
  return { man, seg };
}
export function audioKeysOf(text, slideKey) {
  const { seg } = audioEntries(text);
  return Object.keys(seg).filter((k) => splitKey(k)[0] === slideKey);
}
export function removeAudio(text, slideKey) {
  const { man, seg } = audioEntries(text);
  if (!man) return { out: text, removed: {}, files: [] };
  const removed = {}, keep = {};
  for (const [k, v] of Object.entries(seg)) (splitKey(k)[0] === slideKey ? removed : keep)[k] = v;
  if (!Object.keys(removed).length) return { out: text, removed, files: [] };
  const fileOf = (e) => (e && typeof e === 'object' && typeof e.file === 'string' ? e.file : null);
  const still = new Set(Object.values(keep).map(fileOf).filter(Boolean));
  const files = [...new Set(Object.values(removed).map(fileOf).filter((f) => f && !still.has(f)))];
  const next = seg === man ? keep : { ...man, segments: keep };
  return { out: JSON.stringify(next, null, 1) + '\n', removed, files };
}
