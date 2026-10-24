// 長いデッキを 2 回に分けてチャットの AI に頼む（編集アプリの「新規作成…」。app/llm.js）。Node にもブラウザにも依存しない（純粋な ESM）
//   1 回目（構成案）：枚数が OUTLINE_OVER を超えたら、頼む文の最後に「構成案だけを返す」を付ける。返事は ```outline の囲み 1 つ
//     （Markdown の表：番号・見出し・要点（1 行））。parseOutline で読む
//   2 回目から（バッチ）：構成案の BATCH 枚ずつ（「構成案の 7〜12 枚目」）。頼む文は構成案の全体と、足す場所の前のスライド（とその口述原稿）を添える。
//     最初のバッチは deck.html の全体（<!DOCTYPE html> から）、次からはスライドの挿入（kit/core/llm-insert.mjs）と同じく足すスライドだけ
//   構成案は設定のファイル（egatari.json）の studio.outline に置く（{v: 1, next, rows}）。設定のファイルは作業フォルダにも 1 ファイルの原稿にも
//   必ず入るので、どちらの形でも教材と一緒に動く（別のファイル（outline.md など）は組み立てが読まないので 1 ファイルに入らない）。
//   形式の決まった項目と混ざらないよう、Studio の項目は studio の下にまとめる。次に頼む番号（next）も一緒に書く
//
//   slideCountOf(text) → 枚数 | null       「12 枚」「12 slides」「スライド 12」（「10 分」は数えない）
//   outlineRequest({n, lang}) → 文字列     頼みたいことの後ろに付ける「構成案だけを返す」の節
//   parseOutline(text) → {rows: [{heading, point}]} | {error: {code, line?}}
//     code：'no-outline'（```outline の囲みがない）・'unclosed'（閉じていない）・'no-table'（表の行がない）・'empty-heading'（見出しのない行。line）・
//     'too-many'（OUTLINE_MAX を超える）・'too-few'（2 行より少ない）
//   withOutline(configText, {rows, next}) → 設定のファイルの文字列（studio.outline を書く）。outlineOf(configText) → {rows, next} | null
//   nextBatch({rows, next}) → {from, to, size} | null（1 から数える。終わっていれば null）。remaining({rows, next}) → 残りの枚数
//   batchRequest({rows, from, to, deck, narration, first, lang}) → 文字列
import { slideChunks } from './slide-ops.mjs';
import { narrSections } from './llm-import.mjs';
import { parseHeading } from './narration-core.mjs';
import { updateConfig, merge } from './config-file.mjs';

export const OUTLINE_OVER = 8;      // これより多い枚数は 2 回に分ける（8 枚まではこれまでどおり 1 回で）
export const BATCH = 6;             // 1 回に頼む枚数（返事が途中で切れないように）
export const OUTLINE_MAX = 60;

export function slideCountOf(text) {
  const t = String(text || '');
  const m = t.match(/(\d{1,3})\s*(?:枚|slides?\b)/i) || t.match(/(?:スライド|slides?)\s*(\d{1,3})\b/i);
  const n = m ? +m[1] : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

const L = {
  ja: {
    outlineHead: '# まず構成案だけを返してください',
    outlineText: (n) => `この教材は ${n} 枚あるので、2 回に分けて作ります。今回は deck.html と narration.md はまだ書かず、構成案だけを返してください（R-outline）。` +
      '```outline の囲み 1 つに、Markdown の表を書きます。列は「番号」「見出し」「要点（1 行）」で、スライドごとに 1 行、全スライドを順に並べます。囲みの外には 1 行の添え書きだけ。',
    tableHead: '| 番号 | 見出し | 要点 |',
    batchHead: (a, b) => `# 構成案の ${a}〜${b} 枚目を作ってください`,
    batchFirst: (a, b, n) => `構成案（全 ${n} 枚）の ${a}〜${b} 枚目を、ちょうど ${b - a + 1} 枚作ってください。規格（R-…）と出力の形（R-output）は AI への指示のとおりで、deck.html は <!DOCTYPE html> からの全体を書きます。残りのスライドは後で頼みます。`,
    batchNext: (a, b, n, x) => `構成案（全 ${n} 枚）の ${a}〜${b} 枚目を、ちょうど ${b - a + 1} 枚作ってください。今の教材の${x}の後ろに入ります。規格と出力の形は、教材を作ったときの AI への指示のとおりです。`,
    where: (x) => `スライド ${x.n}「${x.h}」`,
    outlineList: '## 構成案（全体。返さない）', range: (a, b) => `← 今回は ${a}〜${b} 枚目`,
    near: '## 足す場所の前のスライド（参考。返さない）',
    reply: '## 返し方',
    replyFirst: '```deck.html の囲みに deck.html の全体（今回のスライドだけ）を、```narration.md の囲みにその口述原稿を書きます。',
    replyNext: '足すスライドだけを返してください。```deck.html の囲みに <section class="slide"> だけを並べ（<!DOCTYPE>・<html>・<head> は付けない。id は書かない）、```narration.md の囲みに、そのスライドの口述原稿の節（## 見出し と [0] からの行）を同じ順で書きます。',
  },
  en: {
    outlineHead: '# First, send only the outline',
    outlineText: (n) => `This lesson has ${n} slides, so it is made in two passes. This time, write no deck.html or narration.md yet: send only the outline (R-outline). ` +
      'In one ```outline block, write a Markdown table with the columns “#”, “Heading” and “Point (one line)”, one row per slide, every slide in order. Outside the block, at most a one-line note.',
    tableHead: '| # | Heading | Point |',
    batchHead: (a, b) => `# Please make slides ${a}–${b} of the outline`,
    batchFirst: (a, b, n) => `Make slides ${a}–${b} of the outline (${n} slides in all), exactly ${b - a + 1} slides. The standards (R-…) and the output format (R-output) are those of the instructions for the AI; write the whole deck.html from <!DOCTYPE html>. The other slides are requested later.`,
    batchNext: (a, b, n, x) => `Make slides ${a}–${b} of the outline (${n} slides in all), exactly ${b - a + 1} slides. They go ${x} of the current lesson. The standards and the output format are those of the instructions for the AI used to make it.`,
    where: (x) => `after slide ${x.n}, “${x.h}”,`,
    outlineList: '## The outline (all of it; do not send it back)', range: (a, b) => `← this time: ${a}–${b}`,
    near: '## The slide before the new ones (for reference; do not send it back)',
    reply: '## How to reply',
    replyFirst: 'In a ```deck.html block write the whole deck.html (with only these slides), and in a ```narration.md block their narration.',
    replyNext: 'Send only the new slides: in a ```deck.html block, only the <section class="slide"> elements (no <!DOCTYPE>, <html> or <head>; no ids), and in a ```narration.md block their narration sections (## heading and the lines from [0]) in the same order.',
  },
};
const M = (lang) => L[lang === 'ja' ? 'ja' : 'en'];
const fence = (name, body) => '````' + name + '\n' + String(body).replace(/\s+$/, '') + '\n````';
const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function outlineRequest({ n, lang = 'en' }) {
  const X = M(lang);
  return [X.outlineHead, '', X.outlineText(n), ''].join('\n');
}

// 表の 1 行を桁に分ける（\| は字のまま）
function cellsOf(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out = []; let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (t[i] === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += t[i];
  }
  out.push(cur.trim());
  return out;
}
// 表の行（見出しの行と区切りの行は除く）→ [{heading, point}]。最初の桁が番号なら外す
function rowsOfTable(lines, base = 0) {
  const rows = [];
  let sawSep = false, headerSkipped = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!/^\s*\|/.test(ln)) continue;
    const c = cellsOf(ln);
    if (c.every((x) => /^:?-{2,}:?$/.test(x) || x === '')) { sawSep = true; continue; }
    if (!sawSep && !headerSkipped && !/^\d+$/.test(c[0])) { headerSkipped = true; continue; }   // 見出しの行（番号でない）
    const k = /^\d+\.?$/.test(c[0]) ? c.slice(1) : c;
    const heading = (k[0] || '').trim(), point = k.slice(1).join(' / ').trim();
    if (!heading) return { error: { code: 'empty-heading', line: base + i + 1 } };
    rows.push({ heading, point });
  }
  return { rows };
}
export function parseOutline(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const open = lines.findIndex((l) => /^\s*(`{3,}|~{3,})\s*outline\b/i.test(l));
  if (open < 0) return { error: { code: 'no-outline' } };
  const mark = lines[open].trim().match(/^(`{3,}|~{3,})/)[1];
  let close = -1;
  for (let i = open + 1; i < lines.length; i++) if (lines[i].trim().startsWith(mark[0].repeat(3)) && /^(`{3,}|~{3,})\s*$/.test(lines[i].trim())) { close = i; break; }
  if (close < 0) return { error: { code: 'unclosed', line: open + 1 } };
  const r = rowsOfTable(lines.slice(open + 1, close), open + 1);
  if (r.error) return r;
  if (!r.rows.length) return { error: { code: 'no-table' } };
  if (r.rows.length > OUTLINE_MAX) return { error: { code: 'too-many', n: r.rows.length } };
  if (r.rows.length < 2) return { error: { code: 'too-few', n: r.rows.length } };
  return { rows: r.rows };
}

const table = (rows, lang, mark) => [M(lang).tableHead, '|---|---|---|', ...rows.map((r, i) => `| ${i + 1} | ${cell(r.heading)} | ${cell(r.point)} |${mark && mark(i + 1) ? '   ' + mark(i + 1) : ''}`)];
// 設定のファイル（egatari.json）の studio.outline：{v: 1, next, rows: [{heading, point}]}。ほかの項目はそのまま
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// 書くのは kit/core/config-file.mjs の updateConfig だけ（studio の中の outline だけを差し替え、ほかの項目はバイトのまま。読めないファイルは code 'bad-config' で断る）
export function withOutline(configText, { rows, next = 1 }) {
  const outline = { v: 1, next, rows: rows.map((r) => ({ heading: String(r.heading), point: String(r.point || '') })) };
  return updateConfig(configText || null, { studio: merge({ outline }) });
}
export function outlineOf(configText) {
  let c;
  try { c = JSON.parse(configText || 'null'); } catch { return null; }
  const o = isObj(c) && isObj(c.studio) ? c.studio.outline : null;
  if (!isObj(o) || o.v !== 1 || !Array.isArray(o.rows) || !o.rows.length || o.rows.length > OUTLINE_MAX) return null;
  const rows = o.rows.filter((r) => isObj(r) && typeof r.heading === 'string' && r.heading.trim()).map((r) => ({ heading: r.heading.trim().slice(0, 200), point: typeof r.point === 'string' ? r.point.trim().slice(0, 400) : '' }));
  if (rows.length !== o.rows.length) return null;
  return { rows, next: Number.isInteger(o.next) && o.next >= 1 ? o.next : 1 };
}
export function remaining({ rows, next }) { return Math.max(0, rows.length - next + 1); }
export function nextBatch({ rows, next }) {
  if (next > rows.length) return null;
  const to = Math.min(rows.length, next + BATCH - 1);
  return { from: next, to, size: to - next + 1 };
}

export function batchRequest({ rows, from, to, deck = '', narration = '', first = false, lang = 'en' }) {
  const X = M(lang);
  const out = [X.batchHead(from, to), ''];
  let prev = null;
  if (first) out.push(X.batchFirst(from, to, rows.length));
  else {
    const S = slideChunks(deck).slides;
    const at = S.length - 1;
    prev = at >= 0 ? { n: at + 1, h: S[at].heading || S[at].key, s: S[at] } : null;
    out.push(X.batchNext(from, to, rows.length, prev ? X.where(prev) : ''));
  }
  out.push('', X.outlineList, '', ...table(rows, lang, (i) => (i === from ? X.range(from, to) : '')));
  if (prev) {
    const N = narrSections(String(narration).replace(/\r\n?/g, '\n'));
    const sl = prev.s;
    const sec = N.out.filter((s) => (sl.id && s.id === sl.id) || parseHeading(N.lines[s.start].replace(/^##\s+/, '')).key === sl.key)
      .map((s) => N.lines.slice(s.start, s.end).join('\n').replace(/\s+$/, '')).join('\n\n');
    out.push('', X.near, '', fence('deck.html', deck.slice(sl.start, sl.end)));
    if (sec) out.push('', fence('narration.md', sec));
  }
  out.push('', X.reply, '', first ? X.replyFirst : X.replyNext);
  return out.join('\n') + '\n';
}
