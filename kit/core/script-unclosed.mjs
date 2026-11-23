// 閉じていない <script>（handoff #96）：パーツのデータの <script type="application/json"> に </script> がないと、HTML の読み方では
// 次の </script> か原稿の終わりまでが <script> の中の文字になる。後ろのスライドは DOM に現れず（id も付かない）、台本の節は
// 「スライドが見つからない」、組み立てた文書の再生器の <script> まで飲み込んで、前のスライドの台本まで「ない」と出る。
// 原因の 1 か所を指す。Node にもブラウザにも依存しない（純粋な ESM）。品質チェックのコマンド版（kit/check.mjs）と編集アプリ（kit/core/check-source.mjs）が同じものを出す
//   scriptUnclosedFindings(src) → [{i（その <script> があるスライドの番号か null）, sev: 'error', code: 'scriptUnclosed', a: {line, n, headings}}]
//     閉じていないとみなす <script>：終わりのタグがない・中にスライドの開始タグ（<section class="slide">）がある・
//     データの <script type="application/json"> の中にパーツの終わりのタグ（</m-…>）がある
//     headings：<script> の中に入ったスライドの見出し（n 枚。見出しのないスライドは ''）
import { parse } from 'parse5';

const SLIDE_START = /<section\b[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'|slide\b)[^>]*>/gi;
const attr = (n, name) => (n.attrs || []).find((a) => a.name === name)?.value;
const isSlide = (n) => n.tagName === 'section' && (attr(n, 'class') || '').split(/\s+/).includes('slide');
const plain = (s) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function swallowedHeadings(text) {
  const starts = [...text.matchAll(SLIDE_START)].map((m) => m.index + m[0].length);
  return starts.map((at, k) => {
    const part = text.slice(at, k + 1 < starts.length ? starts[k + 1] : text.length);
    const h = part.match(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/i);
    return h ? plain(h[2]) : '';
  });
}

export function scriptUnclosedFindings(src) {
  if (typeof src !== 'string' || !src || !/<script\b/i.test(src)) return [];
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const out = [];
  let slide = -1;
  const lineOf = (off) => src.slice(0, off).split('\n').length;
  const visit = (node, inSlide) => {
    let here = inSlide;
    if (node.tagName && isSlide(node) && inSlide === null) { slide++; here = slide; }
    if (node.tagName === 'script' && node.sourceCodeLocation) {
      const loc = node.sourceCodeLocation;
      const text = (node.childNodes || []).map((c) => c.value || '').join('');
      const json = /^\s*application\/(?:ld\+)?json\s*$/i.test(attr(node, 'type') || '');
      if (!loc.endTag || new RegExp(SLIDE_START.source, 'i').test(text) || (json && /<\/m-[a-z]/i.test(text))) {
        const headings = swallowedHeadings(text);
        out.push({ i: here, sev: 'error', code: 'scriptUnclosed', a: { line: lineOf(loc.startOffset), n: headings.length, headings } });
      }
      return;
    }
    for (const c of node.childNodes || []) visit(c, here);
    if (node.content) visit(node.content, here);
  };
  visit(doc, null);
  return out;
}
