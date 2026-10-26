// スライドに安定した id を付ける本体（format spec §8.1、docs/contract.md §4）。Node にもブラウザにも依存しない（純粋な ESM）
// npm run ids（tools/ids.mjs：ファイルの読み書き・控え・JSON の鍵の付け替え）と、編集アプリの「新規作成…」「修正…」などのチャットの AI のやり方（app/llm.js）が共有する
//
//   planIds(src, {taken, byOrder})        → {slides, docIds, problems, rename: Map(旧い鍵 → id), newIds: Map(番号 → id), order}
//   rewriteDeckIds(src, plan)             → {out, morphs}       id のない <section class="slide"> に id="…" を足し、data-morph="旧い鍵" を付け替える
//   rewriteNarrationIds(text, plan)       → {out, n}            「## 見出し」を「## 見出し {#id}」に（見出しの文字列はそのまま。行の区切りもそのまま）
//   assignIds(deck, narration, opts)      → {deck, narration, added: [{index, id, key}], problems}   上の 3 つをまとめて
//   exportIds(files, opts)                → {changed: {名前: 文字列}, rename, added, orphans, problems}   書き出し（1 ファイル）の前に、どのスライドにも id、
//                                           narration.md のどの見出しにも {#id} を付ける（format spec §8.1：ファイルに書くときは必ず）。手で書いた data-key は消し、
//                                           audio/manifest.json・timeline.json・comments.json の鍵も付け替える。files：{deck, narration?, manifest?, timeline?, comments?}（文字列）
//
// byOrder（AI の返事の取り込みだけ）：同じ見出しのスライドが 2 枚以上あっても断らず、narration.md の同じ見出しの節を、出てきた順に
// それぞれのスライドに対応させる（n 番目の「## まとめ」→ n 番目の「まとめ」のスライド）。npm run ids は重なりを直さない（先に手で直す）
import { parse } from 'parse5';
import { analyzeSlideIds } from './build-core.mjs';
import { parseHeading, newSlideId, splitKey } from './narration-core.mjs';

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
      // plan.dropDataKey（書き出し）：手で書いた data-key（旧来の鍵）を消す。鍵は id だけ（format spec §8.1）
      const dk = loc.attrs && loc.attrs['data-key'];
      if (plan.dropDataKey && dk) {
        let a = dk.startOffset;
        while (a > loc.startOffset && /\s/.test(text[a - 1])) a--;
        ins.push([a, dk.endOffset - a, '']);
      }
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

// ---------------------------------------------------------------- 書き出しの前の id（format spec §8.1）
// 見出しの行の鍵（{#id} のないもの）→ id の決め方：
//   1. id のないスライドの旧来の鍵（見出し・手で書いた data-key・s<n>）→ そのスライドに付けた新しい id
//   2. id のあるスライドの見出しから作る旧来の鍵（同じ見出しのスライドが 1 枚だけのとき）→ その id
//   3. 鍵がそのままスライドの id（「## s-k3f9q2」）→ その id
//   4. どれでもない（どのスライドにも当たらない節）→ 新しい id（orphans に知らせる。読める層には入らない）
// JSON の鍵（"<旧い鍵>:<段階>"）も同じ表で付け替える。変えるものがなければ changed は空
export function exportIds(files, { rand } = {}) {
  const plan = planIds(files.deck, { rand });
  if (plan.problems.length) return { changed: {}, rename: new Map(), aliases: new Map(), ids: new Set(), added: [], orphans: [], problems: plan.problems };
  plan.dropDataKey = true;
  const taken = new Set([...plan.docIds.keys(), ...plan.slides.map((x) => x.key), ...plan.newIds.values()]);
  const ids = new Set(plan.slides.map((x) => (x.id !== null ? x.id : plan.newIds.get(x.index))));
  const byHeading = new Map(), dupHeading = new Set();
  for (const x of plan.slides) {
    if (x.id === null || !x.headingKey) continue;
    if (byHeading.has(x.headingKey)) dupHeading.add(x.headingKey); else byHeading.set(x.headingKey, x.id);
  }
  const rename = new Map(plan.rename);
  const orphans = [];
  const idFor = (k) => {
    if (rename.has(k)) return rename.get(k);
    let id = null;
    if (byHeading.has(k) && !dupHeading.has(k)) id = byHeading.get(k);
    else if (ids.has(k)) id = k;
    else { id = rand ? newSlideId(taken, rand) : newSlideId(taken); taken.add(id); orphans.push({ key: k, id }); }
    rename.set(k, id);
    return id;
  };
  const changed = {};
  const deckOut = rewriteDeckIds(files.deck, plan).out;
  if (deckOut !== files.deck) changed.deck = deckOut;
  if (typeof files.narration === 'string') {
    const parts = files.narration.split(/(\r?\n)/);
    let inComment = false, n = 0;
    for (let j = 0; j < parts.length; j += 2) {
      const ln = parts[j];
      if (inComment) { if (ln.includes('-->')) inComment = false; continue; }
      if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; continue; }
      const h = ln.match(/^##\s+(.+?)\s*$/);
      if (!h) continue;
      const p = parseHeading(h[1]);
      if (p.id !== null) continue;
      const id = idFor(p.key);
      parts[j] = p.heading && p.heading !== id ? `## ${p.heading} {#${id}}` : `## {#${id}}`;
      n++;
    }
    if (n) changed.narration = parts.join('');
  }
  // 旧来の鍵 → id の表（JSON と設定のファイルの鍵の付け替えに使う）：付けた id・見出しから結んだもの（rename）に、id のあるスライドの
  // 見出しの鍵（同じ見出しが 1 枚だけのとき）と手で書いた data-key を足す（原稿は既に id を持つが、記録の鍵が旧いままのもの）。今のスライドの id はそのまま
  const aliases = new Map(rename);
  for (const [hk, id] of byHeading) if (!dupHeading.has(hk) && !aliases.has(hk) && !ids.has(hk)) aliases.set(hk, id);
  for (const x of plan.slides) if (x.id !== null && x.dataKey && x.dataKey !== x.id && !aliases.has(x.dataKey) && !ids.has(x.dataKey)) aliases.set(x.dataKey, x.id);
  // JSON：書き方（字下げ・改行・末尾の改行）は元に合わせる。読めないものは変えない
  const renameKey = (k) => {
    const s = String(k);
    if (!s.includes(':')) return aliases.has(s) && !ids.has(s) ? aliases.get(s) : s;
    const [sk, st] = splitKey(s);
    return aliases.has(sk) && !ids.has(sk) ? `${aliases.get(sk)}:${st}` : s;
  };
  const renameObj = (o) => {
    let n = 0;
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const nk = renameKey(k);
      if (nk !== k) n++;
      if (Object.prototype.hasOwnProperty.call(out, nk)) continue;
      Object.defineProperty(out, nk, { value: v, enumerable: true, writable: true, configurable: true });
    }
    return { out, n };
  };
  const jsonLike = (orig, value) => {
    const eol = orig.includes('\r\n') ? '\r\n' : '\n';
    const m = orig.match(/\n([ \t]+)\S/);
    const indent = m ? m[1] : (orig.trim().includes('\n') ? 2 : 0);
    let t = JSON.stringify(value, null, indent);
    if (eol === '\r\n') t = t.replace(/\n/g, '\r\n');
    return t + (/\r?\n$/.test(orig) ? eol : '');
  };
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const json = (name, fn) => {
    const text = files[name];
    if (typeof text !== 'string' || !aliases.size) return;
    let j; try { j = JSON.parse(text); } catch { return; }
    const r = fn(j);
    if (r && r.n) changed[name] = jsonLike(text, r.value);
  };
  json('manifest', (j) => {
    if (isObj(j) && isObj(j.segments)) { const x = renameObj(j.segments); return { value: { ...j, segments: x.out }, n: x.n }; }
    if (!isObj(j)) return null;
    const x = renameObj(j); return { value: x.out, n: x.n };
  });
  json('timeline', (j) => { if (!isObj(j)) return null; const x = renameObj(j); return { value: x.out, n: x.n }; });
  json('comments', (j) => {
    if (!Array.isArray(j)) return null;
    let n = 0;
    const value = j.map((c) => { if (!isObj(c) || typeof c.key !== 'string') return c; const nk = renameKey(c.key); if (nk === c.key) return c; n++; return { ...c, key: nk }; });
    return { value, n };
  });
  const added = plan.slides.filter((x) => plan.newIds.has(x.index)).map((x) => ({ index: x.index, id: plan.newIds.get(x.index), key: x.key }));
  return { changed, rename, aliases, ids, added, orphans, problems: [] };
}
