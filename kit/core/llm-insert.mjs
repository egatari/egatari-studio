// スライドの挿入をチャットの AI に頼む（編集アプリの「スライドの挿入…」→「チャットの AI に書いてもらう」。app/llm.js。backlog #93）。
// Node にもブラウザにも依存しない（純粋な ESM）。指示の本文（kit/core/llm-pack-data.mjs）は変えない：頼む文はここで作る
//
//   insertRequest({deck, narration, after, n, wish, lang}) → 文字列
//     「スライド X の後ろに続きの n 枚」（n が 1 なら「ここに 1 枚」）を頼む短い文。頼む文を短く保つよう、今のデッキの全体は
//     付けず、スライドの見出しの一覧と、足す場所の前のスライド（とその口述原稿の節）だけを添える。after：0 から。-1 なら先頭（前のスライドなし）
//   insertSlides({deck, narration, patchDeck, patchNarration, after, lang, rand}) → {deck, narration, ids: [新しい id…], at（最初の新しいスライドの番号）}
//     返事のスライド（<section class="slide">。id は付けない約束だが、付いていても新しく付け直す）を after 番目の後ろに順に入れ、
//     スライドの一覧の「足す」（kit/core/slide-ops.mjs）と同じに id を付け（newIdFor）、口述原稿の節を同じ順で入れる（見出しの行は
//     「## 見出し {#id}」）。口述原稿の節は、見出しが同じものを先に、なければ順に対応させる。節のないスライドには仮の行（✎）を入れる
import { slideChunks, insertSlide, insertSection, newIdFor } from './slide-ops.mjs';
import { headingLine, parseHeading } from './narration-core.mjs';
import { sectionsOf, narrSections } from './llm-import.mjs';
import { placeholderLine } from './template-text.mjs';

const L = {
  ja: {
    head: '# スライドを足してほしい',
    lead: '今の教材にスライドを足してください。規格（R-…）と出力の形（R-output）は、教材を作ったときの AI への指示のとおりです。',
    where: (x) => (x ? `スライド ${x.n}「${x.h}」の後ろ` : '先頭'),
    one: (w) => `- 頼みたいこと：ここ（${w}）に、スライドを 1 枚足してください`,
    many: (w, n) => `- 頼みたいこと：${w}に、続きのスライドを ${n} 枚足してください`,
    wish: (t) => `- 足したいこと：${t}`,
    list: (n) => `## 今の教材のスライド（全 ${n} 枚、順に。返さない）`,
    here: '← この後ろに足す',
    near: '## 足す場所の前のスライド（参考。返さない）',
    reply: '## 返し方',
    replyText: '足すスライドだけを返してください。```deck.html の囲みに <section class="slide"> だけを並べ（<!DOCTYPE>・<html>・<head> は付けない。id は書かない）、```narration.md の囲みに、そのスライドの口述原稿の節（## 見出し と [0] からの行）を同じ順で書きます。ほかのスライドは返しません。',
  },
  en: {
    head: '# Please add slides',
    lead: 'Add slides to the current lesson. The standards (R-…) and the output format (R-output) are the ones in the instructions for the AI used to make it.',
    where: (x) => (x ? `after slide ${x.n}, “${x.h}”` : 'at the beginning'),
    one: (w) => `- What I want: one slide here, ${w}`,
    many: (w, n) => `- What I want: the next ${n} slides, ${w}`,
    wish: (t) => `- What to add: ${t}`,
    list: (n) => `## The slides of the lesson now (${n} in all, in order; do not send them back)`,
    here: '← add after this one',
    near: '## The slide before the new ones (for reference; do not send it back)',
    reply: '## How to reply',
    replyText: 'Send only the new slides: in a ```deck.html block, only the <section class="slide"> elements (no <!DOCTYPE>, <html> or <head>; no ids), and in a ```narration.md block their narration sections (## heading and the lines from [0]) in the same order. Do not send the other slides back.',
  },
};
const fence = (name, body) => '````' + name + '\n' + String(body).replace(/\s+$/, '') + '\n````';
const textOf = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const headingIn = (html) => { const m = String(html).match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i); return m ? textOf(m[1]) : ''; };

export function insertRequest({ deck, narration = '', after, n = 1, wish = '', lang = 'en' }) {
  const M = L[lang === 'ja' ? 'ja' : 'en'];
  const S = slideChunks(deck).slides;
  const at = Math.max(-1, Math.min(S.length - 1, after ?? S.length - 1));
  const x = at >= 0 ? { n: at + 1, h: S[at].heading || S[at].key } : null;
  const w = M.where(x);
  const out = [M.head, '', M.lead, '', n > 1 ? M.many(w, n) : M.one(w)];
  if (String(wish).trim()) out.push(M.wish(String(wish).trim().replace(/\s*\n\s*/g, ' / ')));
  out.push('', M.list(S.length), '');
  S.forEach((s, i) => out.push(`${i + 1}. ${s.heading || s.key}${i === at ? '   ' + M.here : ''}`));
  if (at >= 0) {
    const sl = S[at];
    const N = narrSections(String(narration).replace(/\r\n?/g, '\n'));
    const sec = N.out.filter((s) => (sl.id && s.id === sl.id) || parseHeading(N.lines[s.start].replace(/^##\s+/, '')).key === sl.key)
      .map((s) => N.lines.slice(s.start, s.end).join('\n').replace(/\s+$/, '')).join('\n\n');
    out.push('', M.near, '', fence('deck.html', deck.slice(sl.start, sl.end)));
    if (sec) out.push('', fence('narration.md', sec));
  }
  out.push('', M.reply, '', M.replyText);
  return out.join('\n') + '\n';
}

export function insertSlides({ deck, narration = '', patchDeck, patchNarration = null, after, lang = 'en', rand }) {
  const secs = sectionsOf(String(patchDeck || ''));
  if (!secs.length) return { deck, narration, ids: [], at: -1 };
  const n0 = slideChunks(deck).slides.length;
  const at0 = Math.max(-1, Math.min(n0 - 1, after ?? n0 - 1));
  // 口述原稿の節（見出しと行）
  const N = patchNarration ? narrSections(String(patchNarration).replace(/\r\n?/g, '\n')) : { lines: [], out: [] };
  const pool = N.out.map((s) => ({ heading: parseHeading(N.lines[s.start].replace(/^##\s+/, '')).heading.trim(), lines: N.lines.slice(s.start + 1, s.end), used: false }));
  let out = deck, narr = narration ?? '';
  const ids = [];
  secs.forEach((s, j) => {
    const id = newIdFor(out, rand);
    // id を付け直す（AI の id・重なる id は使わない。slide-ops の「足す」と同じ newIdFor）
    const html = patchDeck.slice(s.start, s.end).replace(/^<section\b([^>]*)>/i, (m, attrs) => `<section${attrs.replace(/\s+id\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')} id="${id}">`);
    out = insertSlide(out, at0 + j, html);
    ids.push(id);
    const h = headingIn(html);
    const sec = pool.find((p) => !p.used && h && p.heading === h) || pool.find((p) => !p.used);
    let body;
    if (sec) { sec.used = true; body = sec.lines.slice(); while (body.length && !body[body.length - 1].trim()) body.pop(); }
    if (!body || !body.some((l) => /^\s*\[(\d+|concl)\]/.test(l))) body = [`[0] ${placeholderLine(lang === 'ja' ? 'このスライドの口述原稿' : 'narration for this slide')}`];
    const keys = slideChunks(out).slides.map((x) => x.key);
    narr = insertSection(narr, keys, id, [headingLine({ key: id, id, heading: h }), ...body]);
  });
  return { deck: out, narration: narr, ids, at: at0 + 1 };
}
