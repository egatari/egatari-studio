// スライドに安定した id を付ける本体（format spec §8.1、docs/contract.md §4）。Node にもブラウザにも依存しない（純粋な ESM）
// npm run ids（tools/ids.mjs：ファイルの読み書き・控え・JSON の鍵の付け替え）と、編集アプリの「AI で新しく作る」「AI の直しを取り込む」（app/llm.js）が共有する
//
//   planIds(src, {taken, byOrder})        → {slides, docIds, problems, rename: Map(旧い鍵 → id), newIds: Map(番号 → id), order}
//   rewriteDeckIds(src, plan)             → {out, morphs}       id のない <section class="slide"> に id="…" を足し、data-morph="旧い鍵" を付け替える
//   rewriteNarrationIds(text, plan)       → {out, n}            「## 見出し」を「## 見出し {#id}」に（見出しの文字列はそのまま。行の区切りもそのまま）
//   assignIds(deck, narration, opts)      → {deck, narration, added: [{index, id, key}], problems}   上の 3 つをまとめて
//
// byOrder（AI の出力の取り込みだけ）：同じ見出しのスライドが 2 枚以上あっても断らず、narration.md の同じ見出しの節を、出てきた順に
// それぞれのスライドに対応させる（n 番目の「## まとめ」→ n 番目の「まとめ」のスライド）。npm run ids は重なりを直さない（先に手で直す）
import { parse } from 'parse5';
import { analyzeSlideIds } from './build-core.mjs';
import { parseHeading, newSlideId } from './narration-core.mjs';

function walk(node, fn) {
  fn(node);
  for (const c of node.childNodes || []) walk(c, fn);
  if (node.content) walk(node.content, fn);
}

export function planIds(src, { byOrder = false, rand } = {}) {
  const a = analyzeSlideIds(src);
  const taken = new Set([...a.docIds.keys(), ...a.slides.map((s) => s.key)]);
  const rename = new Map(), newIds = new Map(), order = new Map();   // order：旧い鍵 → [id, …]（byOrder のとき。同じ鍵のスライドの順）
  for (const s of a.slides) {
    if (s.id !== null) continue;
    const id = rand ? newSlideId(taken, rand) : newSlideId(taken);
    taken.add(id); newIds.set(s.index, id);
    if (!rename.has(s.key)) rename.set(s.key, id);
    if (byOrder) (order.get(s.key) || order.set(s.key, []).get(s.key)).push(id);
  }
  // byOrder なら鍵の重なりは問題にしない（id を付ければ重ならなくなる）。id の書式・ほかの id との衝突は残す
  const problems = byOrder ? a.problems.filter((p) => !/^slide key: /.test(p.msg)) : a.problems;
  return { ...a, problems, rename, newIds, order, byOrder };
}

export function rewriteDeckIds(text, plan) {
  const doc = parse(text, { sourceCodeLocationInfo: true });
  const ins = [];   // [位置, 消す長さ, 入れる文字列]
  let n = 0, morphs = 0;
  walk(doc, (node) => {
    if (!node.tagName || !node.sourceCodeLocation) return;
    const loc = node.sourceCodeLocation.startTag;
    const has = (a) => (node.attrs || []).find((x) => x.name === a);
    if (node.tagName === 'section' && (has('class')?.value || '').split(/\s+/).includes('slide')) {
      const id = plan.newIds.get(n++);
      if (id) {
        // 開始タグの「>」（自己終了なら「/>」）の手前。class などの後ろに足す
        let at = loc.endOffset - 1;
        if (text[at - 1] === '/') at--;
        while (at > loc.startOffset && /\s/.test(text[at - 1])) at--;
        ins.push([at, 0, ` id="${id}"`]);
      }
    }
    const dm = has('data-morph');
    if (dm && plan.rename.has(dm.value) && loc.attrs && loc.attrs['data-morph']) {
      const a = loc.attrs['data-morph'];
      ins.push([a.startOffset, a.endOffset - a.startOffset, `data-morph="${plan.rename.get(dm.value)}"`]);
      morphs++;
    }
  });
  ins.sort((x, y) => y[0] - x[0]);
  let out = text;
  for (const [at, del, t] of ins) out = out.slice(0, at) + t + out.slice(at + del);
  return { out, morphs };
}

// 注釈（<!-- … -->）の中は parseNarration と同じく見ない
export function rewriteNarrationIds(text, plan) {
  const parts = String(text).split(/(\r?\n)/);
  let inComment = false, n = 0;
  const used = new Map();   // byOrder：旧い鍵 → 使った数
  for (let j = 0; j < parts.length; j += 2) {
    const ln = parts[j];
    if (inComment) { if (ln.includes('-->')) inComment = false; continue; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; continue; }
    const h = ln.match(/^##\s+(.+?)\s*$/);
    if (!h) continue;
    const p = parseHeading(h[1]);
    if (p.id !== null || !plan.rename.has(p.key)) continue;
    let id = plan.rename.get(p.key);
    if (plan.byOrder && plan.order.has(p.key)) {
      const list = plan.order.get(p.key), u = used.get(p.key) || 0;
      id = list[Math.min(u, list.length - 1)];
      used.set(p.key, u + 1);
    }
    parts[j] = `## ${p.heading} {#${id}}`;
    n++;
  }
  return { out: parts.join(''), n };
}

export function assignIds(deck, narration = '', opts = {}) {
  const plan = planIds(deck, opts);
  if (plan.problems.length) return { deck, narration, added: [], problems: plan.problems, plan };
  const d = rewriteDeckIds(deck, plan);
  const n = narration ? rewriteNarrationIds(narration, plan) : { out: narration, n: 0 };
  const added = plan.slides.filter((s) => plan.newIds.has(s.index)).map((s) => ({ index: s.index, id: plan.newIds.get(s.index), key: s.key }));
  return { deck: d.out, narration: n.out, added, problems: [], plan, morphs: d.morphs, headings: n.n };
}
