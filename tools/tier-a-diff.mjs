// 段 A の編集の試験の道具：場所を見分ける差分（tools/test-tier-a.mjs と tools/test-app.mjs が使う）
//   regionDiff(a, b, allowed)  a（元）と b（段 A の後）を比べ、format spec §7.2 の場所の外が 1 バイトでも違えば assert で落ちる
import assert from 'node:assert/strict';
import { FORMAT } from '../kit/core/format.mjs';
import * as PF from '../kit/core/portable.mjs';
import { scanLayout, jsonObjectAt } from '../kit/core/tier-a.mjs';

// ---------------------------------------------------------------- 場所を見分ける差分
// a（元）と b（段 A の後）を比べる。allowed：{narration: [段階の鍵], marks, timing, audio, meta: [deck-meta の項目]}
// 返すもの：{supplements: [新しい補いの id], chunksAdded, chunksDropped}。決まった場所の外が違えば assert で落ちる
export function skeleton(text, L, newSups) {
  const cut = [];
  for (const [id, b] of L.blocks) cut.push([b.cStart, b.cEnd, `<<${id}>>`]);
  cut.push([L.index.start, L.index.end, '<<index>>']);
  for (const c of L.chunks) cut.push([c.start, c.end + (text[c.end] === '\n' ? 1 : 0), '']);
  if (L.readable) cut.push([L.readable.cStart, L.readable.cEnd, '<<readable>>']);
  for (const s of L.styles) if (newSups.has(s.id)) cut.push([s.start - (text[s.start - 1] === '\n' ? 1 : 0), s.end, '']);
  cut.sort((x, y) => y[0] - x[0]);
  let out = text;
  for (const [s, e, r] of cut) out = out.slice(0, s) + r + out.slice(e);
  return out;
}
export const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `at ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 60), i + 80))}\n   vs ${JSON.stringify(b.slice(Math.max(0, i - 60), i + 80))}`; };
// JSON の object の各項目の生の文字列（{鍵: 文字列}）
const rawMembers = (t, at = 0) => { const o = jsonObjectAt(t, t.indexOf('{', at)); return Object.fromEntries(o.members.map((m) => [m.key, { raw: t.slice(m.valStart, m.valEnd), at: m.valStart }])); };
export function regionDiff(a, b, allowed = {}) {
  const La = scanLayout(a), Lb = scanLayout(b);
  const supsA = new Set(La.styles.map((s) => s.id).filter(Boolean)), newSups = new Set(Lb.styles.map((s) => s.id).filter((id) => id && !supsA.has(id)));
  for (const id of newSups) assert.ok(id.startsWith(FORMAT.FONT_SUPPLEMENT_PREFIX), `new <style id="${id}"> is not a font supplement`);
  const sa = skeleton(a, La, new Set()), sb = skeleton(b, Lb, newSups);
  assert.ok(sa === sb, 'bytes outside the tier A regions differ: ' + firstDiff(sa, sb));
  // 実行系の JSON：変わってよい項目のほかは生の文字列が同じ
  const allow = { 'deck-marks': allowed.marks || [], 'deck-timing': allowed.timing || [], 'deck-audio': allowed.audio || [], 'deck-meta': allowed.meta || ['sourceSha256'] };
  const text = (L, t, id) => t.slice(L.blocks.get(id).cStart, L.blocks.get(id).cEnd);
  for (const id of Object.keys(allow)) {
    const ma = rawMembers(text(La, a, id)), mb = rawMembers(text(Lb, b, id));
    for (const k of new Set([...Object.keys(ma), ...Object.keys(mb)])) if (!allow[id].includes(k)) assert.equal(mb[k]?.raw, ma[k]?.raw, `${id}["${k}"] changed but is not an affected entry`);
  }
  const na = rawMembers(text(La, a, 'deck-narration')), nb = rawMembers(text(Lb, b, 'deck-narration'));
  const narr = new Set(allowed.narration || []);
  for (const s of new Set([...Object.keys(na), ...Object.keys(nb)])) {
    const steps = (m) => (m[s] ? rawMembers(m[s].raw) : {});
    const xa = steps(na), xb = steps(nb);
    for (const st of new Set([...Object.keys(xa), ...Object.keys(xb)])) if (!narr.has(`${s}:${st}`)) assert.equal(xb[st]?.raw, xa[st]?.raw, `deck-narration["${s}"]["${st}"] changed but is not an affected step`);
  }
  // 読める層：変わった段階の div を除けば同じ
  const rd = (t, L) => {
    const cut = [];
    for (const art of L.readable.articles.values()) for (const [k, d] of art.divs) if (narr.has(k)) cut.push([d.start - (t[d.start - 1] === '\n' ? 1 : 0), d.end]);
    cut.sort((x, y) => y[0] - x[0]);
    let out = t.slice(L.readable.cStart, L.readable.cEnd), off = L.readable.cStart;
    for (const [s, e] of cut) out = out.slice(0, s - off) + out.slice(e - off);
    return out;
  };
  const ra = rd(a, La), rb = rd(b, Lb);
  assert.ok(ra === rb, 'readable layer changed outside the affected steps: ' + firstDiff(ra, rb));
  // 塊：両方にあるものは同じバイト。消えたものは新しい索引から参照されない。増えたものは参照される
  const ib = PF.parseJsonStrict(Lb.index && b.slice(Lb.index.cStart, Lb.index.cEnd));
  const used = new Set(Object.values(ib.blobs).flatMap((x) => x.chunks));
  const ca = new Map(La.chunks.map((c) => [c.id, a.slice(c.start, c.end)])), cb = new Map(Lb.chunks.map((c) => [c.id, b.slice(c.start, c.end)]));
  const added = [], dropped = [];
  for (const [id, t] of ca) { if (cb.has(id)) assert.equal(cb.get(id), t, `chunk ${id} changed`); else { dropped.push(id); assert.ok(!used.has(id), `dropped chunk ${id} is still referenced`); } }
  for (const id of cb.keys()) if (!ca.has(id)) { added.push(id); assert.ok(used.has(id), `added chunk ${id} is not referenced`); }
  return { supplements: [...newSups], chunksAdded: added, chunksDropped: dropped };
}

