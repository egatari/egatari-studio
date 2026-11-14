// 見出しの上の札（format spec §8.0）の品質チェック。原稿の文字列だけで決まり、コマンド版と編集アプリが同じ関数を使う
import { parse } from 'parse5';

const hasClass = (n, c) => (n.attrs || []).some((a) => a.name === 'class' && a.value.split(/\s+/).includes(c));
// 字数は layout-scan.mjs と同じ全角 1・半角 0.5。ラテン文字の札は教材の言語によらず 40 文字まで
const units = (t) => [...t].reduce((n, ch) => n + (/[\u0000-ÿ]/.test(ch) ? 0.5 : 1), 0);
const textOf = (n) => n.nodeName === '#text' ? n.value : ['script', 'style', 'rt'].includes(n.tagName) ? '' : (n.childNodes || []).map(textOf).join('');

export function kickerFindings(src) {
  const out = [];
  let index = 0;
  const walk = (n) => {
    if (n.tagName === 'section' && hasClass(n, 'slide')) {
      const i = index++, nodes = [];
      const collect = (x) => {
        for (const c of x.childNodes || []) {
          if (c.tagName === 'section' && hasClass(c, 'slide')) continue;
          if (c.tagName) nodes.push(c);
          collect(c);
        }
      };
      collect(n);
      const heading = nodes.find((x) => x.tagName === 'h2' || x.tagName === 'h1'), kickers = nodes.filter((x) => hasClass(x, 'kicker'));
      const add = (sev, code, a = {}) => out.push({ i, sev, code, a });
      if (kickers.length) {
        const next = (e) => { const siblings = e.parentNode.childNodes.filter((x) => x.tagName); return siblings[siblings.indexOf(e) + 1]; };
        if (!heading || kickers.length > 1 || kickers.some((e) => next(e) !== heading)) add('warn', 'kickerPlace');
        if (['cover', 'sec', 'layout-tate'].some((c) => hasClass(n, c))) add('info', 'kickerSlide');
        for (const e of kickers) {
          const t = textOf(e).replace(/\s+/g, ' ').trim();
          const latin = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]*$/u.test(t);
          const n = latin ? [...t].length : units(t), max = latin ? 40 : 24;
          if (n > max) add('warn', 'kickerLong', { n, max, latin, t });
        }
      }
    }
    for (const c of n.childNodes || []) walk(c);
    if (n.content) walk(n.content);
  };
  walk(parse(String(src)));
  return out;
}
