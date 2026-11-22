// 検索と置換（handoff #86）：スライドの原稿（deck.html）と台本（narration.md）をまたいで、字を探して置き換える。Node にもブラウザにも依存しない
// （読み込むのは parse5・narration-parse・build-core だけ。編集アプリ app/find-panel.js と単体の試験 tools/test-find-replace.mjs が使う）
//
// 置き換えてもマークアップを壊さないように、探す場所を限る：
//   原稿：スライド（<section class="slide">）の中の字の部分だけ。タグ・属性・<script>・<style>・注釈の中は探さない。
//         文字参照（&amp; など）は字に戻して探し（「&」で &amp; が見つかる）、置換後の文字列は &・<・> を文字参照にして書く。
//         1 つの一致は 1 つの字の塊の中だけ（タグをまたがない）
//         id も data-key もないスライドの最初の見出し（スライドの鍵になり、台本の節を結ぶ）も探さない
//   台本：ステップ（[0]・[1]…・[concl]）の話す字だけ。見出し（## …）・題（# …）・ステップの印（[1]）・話者（Expert: など）・注釈・拡張の行（@x-…）・
//         区切りと指示（{cue}・{mark:…}・{note:…}）は探さない。読み（{語|よみ}）は語の側だけを探す。置換後の文字列の改行は外す
//
//   findMatches({deck, narr, query, matchCase?, scope?: 'all' | 'slides' | 'script'})
//     → {matches: [{file: 'deck' | 'narr', start, end, text, slide（スライドの番号。台本は節のスライド、なければ null）, slideKey?, stepKey?}], slides（一致のあるスライドの数）, script（台本の一致の数）}
//     一致は重ならない（左から）。並びはスライドの順（同じスライドは原稿、台本の順）
//   replaceMatches(text, matches, replacement, file) → 置き換えた文字列（matches はその text の上のもの。file が 'deck' なら文字参照にする）
import { parse } from 'parse5';
import { parseHeading, isStepKey, EXT_LINE } from './narration-parse.mjs';
import { analyzeSlideIds } from './build-core.mjs';

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const SKIP = new Set(['script', 'style', 'noscript']);
const ROLE = /^(Expert|Novice|E|N)\s*[:：]\s*/;

const attr = (n, name) => (n.attrs || []).find((a) => a.name === name);
const isSlide = (n) => n.tagName === 'section' && (attr(n, 'class')?.value || '').split(/\s+/).includes('slide');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 原稿の字の塊（raw：原稿のまま、base：その先頭の位置）を字に戻し、字の 1 単位ごとに原稿の範囲 [from[i], to[i]) を持つ
export function decodeRun(raw, base = 0) {
  let text = '';
  const from = [], to = [];
  for (let i = 0; i < raw.length;) {
    let m = null;
    if (raw[i] === '&') m = /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/.exec(raw.slice(i, i + 40));
    let ch = null;
    if (m) {
      const k = m[1];
      if (k[0] === '#') { const cp = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); if (cp > 0 && cp <= 0x10ffff) ch = String.fromCodePoint(cp); }
      else if (Object.prototype.hasOwnProperty.call(NAMED, k)) ch = NAMED[k];
    }
    if (ch !== null) {
      for (let j = 0; j < ch.length; j++) { from.push(base + i); to.push(base + i + m[0].length); }
      text += ch; i += m[0].length;
    } else { text += raw[i]; from.push(base + i); to.push(base + i + 1); i++; }
  }
  return { text, from, to };
}

function walk(node, fn) {
  if (fn(node) === false) return;
  for (const c of node.childNodes || []) walk(c, fn);
  if (node.content) walk(node.content, fn);
}
// 原稿のスライドの中の字の塊：[{slide, key, raw, base}]
export function deckRuns(deck) {
  const doc = parse(String(deck), { sourceCodeLocationInfo: true });
  const out = [];
  let n = 0;
  walk(doc, (s) => {
    if (!s.tagName || !isSlide(s)) return true;
    const slide = n++;
    // id も data-key もないスライドは、最初の見出しが鍵（台本の節が見出しで結ばれる。build-core の analyzeSlideIds）：置き換えると台本と離れるので探さない
    let keyHead = null;
    if (!attr(s, 'id') && !attr(s, 'data-key')) walk(s, (x) => { if (keyHead) return false; if (x.tagName === 'h2' || x.tagName === 'h1') { keyHead = x; return false; } return true; });
    walk(s, (x) => {
      if (x.tagName && SKIP.has(x.tagName)) return false;
      if (x === keyHead) return false;
      if (x.nodeName === '#text' && x.sourceCodeLocation) {
        const { startOffset: a, endOffset: b } = x.sourceCodeLocation;
        out.push({ slide, raw: deck.slice(a, b), base: a });
      }
      return true;
    });
    return false;   // 入れ子のスライドは数えない
  });
  return { runs: out, count: n };
}
// 台本の話す字の塊：[{slideKey, stepKey, raw, base}]（台本の字はそのまま。文字参照はない）
export function narrRuns(narr) {
  const text = String(narr ?? '');
  const out = [];
  let slideKey = null, step = null, inComment = false, pos = 0;
  const push = (s, base) => {
    // {…} の外の字と、読み {語|よみ} の語の側だけ
    let i = 0;
    while (i < s.length) {
      const o = s.indexOf('{', i);
      const end = o < 0 ? s.length : o;
      if (end > i) out.push({ slideKey, stepKey: step, raw: s.slice(i, end), base: base + i });
      if (o < 0) break;
      const c = s.indexOf('}', o + 1);
      if (c < 0) { out.push({ slideKey, stepKey: step, raw: s.slice(o), base: base + o }); break; }
      const inner = s.slice(o + 1, c);
      if (!/^(cue$|mark:|note:)/.test(inner)) {
        const bar = inner.indexOf('|');
        if (bar > 0) out.push({ slideKey, stepKey: step, raw: inner.slice(0, bar), base: base + o + 1 });
        else if (bar < 0 && inner) out.push({ slideKey, stepKey: step, raw: inner, base: base + o + 1 });
      }
      i = c + 1;
    }
  };
  const content = (ln, at, base) => {
    const rest = ln.slice(at), r = ROLE.exec(rest);
    const off = at + (r ? r[0].length : 0);
    if (off < ln.length) push(ln.slice(off), base + off);
  };
  for (const m of text.matchAll(/[^\r\n]*(\r\n|\r|\n|$)/g)) {
    if (!m[0]) break;
    const ln = m[0].replace(/(\r\n|\r|\n)$/, ''), base = pos;
    pos += m[0].length;
    if (inComment) { if (ln.includes('-->')) inComment = false; continue; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; continue; }
    if (/^\s*<!--.*-->\s*$/.test(ln)) continue;
    const h = /^##\s+(.+?)\s*$/.exec(ln);
    if (h) { slideKey = parseHeading(h[1]).key; step = null; continue; }
    if (/^#\s/.test(ln)) continue;
    const s = /^(\s*\[(\d+|concl)\]\s*)(.*)$/.exec(ln);
    if (s && slideKey !== null) {
      step = isStepKey(s[2]) ? s[2] : null;
      if (step !== null) content(ln, s[1].length, base);
      continue;
    }
    if (step === null || !ln.trim() || EXT_LINE.test(ln)) continue;
    content(ln, ln.length - ln.trimStart().length, base);
  }
  return out;
}

function search(runs, decoded, re, file) {
  const out = [];
  for (const r of runs) {
    const d = decoded ? decodeRun(r.raw, r.base) : null;
    const hay = d ? d.text : r.raw;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(hay))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      const a = m.index, b = a + m[0].length;
      const start = d ? d.from[a] : r.base + a, end = d ? d.to[b - 1] : r.base + b;
      out.push({ file, start, end, text: m[0], slide: r.slide ?? null, slideKey: r.slideKey ?? null, ...(file === 'narr' ? { stepKey: r.stepKey } : {}) });
    }
  }
  return out;
}

export function findMatches({ deck, narr, query, matchCase = false, scope = 'all' }) {
  const q = String(query ?? '');
  if (!q) return { matches: [], slides: 0, script: 0 };
  const re = new RegExp(escRe(q), matchCase ? 'g' : 'gi');
  const D = deck != null ? deckRuns(String(deck)) : { runs: [], count: 0 };
  const dm = scope === 'script' || deck == null ? [] : search(D.runs, true, re, 'deck');
  let nm = scope === 'slides' || narr == null ? [] : search(narrRuns(narr), false, re, 'narr');
  // 台本の節の鍵 → スライドの番号（組み立てと同じ鍵：id・data-key・見出し・s<n>）
  const keys = deck != null ? analyzeSlideIds(String(deck)).slides.map((x) => x.key) : [];
  const index = (k) => { const i = k == null ? -1 : keys.indexOf(k); return i < 0 ? null : i; };
  nm = nm.map((x) => ({ ...x, slide: index(x.slideKey) }));
  for (const x of dm) x.slideKey = keys[x.slide] ?? null;
  const ord = (x) => (x.slide == null ? Infinity : x.slide);
  const matches = [...dm, ...nm].sort((a, b) => ord(a) - ord(b) || (a.file === b.file ? a.start - b.start : a.file === 'deck' ? -1 : 1));
  return { matches, slides: new Set(dm.map((x) => x.slide)).size, script: nm.length };
}

export function replaceMatches(text, matches, replacement, file) {
  let rep = String(replacement ?? '');
  rep = file === 'deck' ? escHtml(rep) : rep.replace(/[\r\n]+/g, ' ');
  let out = String(text);
  for (const m of [...matches].filter((x) => x.file === file).sort((a, b) => b.start - a.start)) out = out.slice(0, m.start) + rep + out.slice(m.end);
  return out;
}
