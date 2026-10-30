// 口述原稿（narration.md）の解析と書き換え。Node にもブラウザにも依存しない（fs・crypto を使わない）
// kit/narration.mjs（build・TTS）、server/dev.mjs（開発サーバー）、app/（編集アプリ）が共有する
// 書式は docs/contract.md §4
import { short } from './sha1.mjs';

export * from './narration-parse.mjs';
import { parseNarration, parseHeading, normalizeKey, headingLine, isStepKey, joinLines, parseExtLine } from './narration-parse.mjs';
const HEAD = /^##\s+(.+?)\s*$/;
const ROLE = /^(Expert|Novice|E|N)\s*[:：]\s*/;

// ---------------------------------------------------------------- 書き換え（開発サーバーと編集アプリの口述原稿の引き出し。その段階の行だけを置き換える）
const stepOrder = (s) => (s === 'concl' ? Infinity : +s);

// parseNarration と同じ規則で、節（## 見出し）と段階（[k]）の行の範囲を求める
function scanNarration(lines) {
  const sections = [];
  let sec = null, blk = null, inComment = false;
  lines.forEach((ln, idx) => {
    if (inComment) { if (ln.includes('-->')) inComment = false; return; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; return; }
    if (/^\s*<!--.*-->\s*$/.test(ln)) return;
    const h = ln.match(HEAD);
    if (h) {
      if (sec) sec.end = idx;
      sec = { key: parseHeading(h[1]).key, head: idx, end: lines.length, blocks: [], lastContent: idx };
      sections.push(sec); blk = null; return;
    }
    if (/^#\s/.test(ln)) return;
    const m = ln.match(/^\s*\[(\d+|concl)\]\s*(.*)$/);
    // 使えない番号（[01] など）は段階ではないが、前の段階の続きにもしない（parseNarration と同じ）
    if (m && sec && !isStepKey(m[1])) { blk = null; sec.lastContent = idx; return; }
    if (m && sec) {
      blk = { step: m[1], start: idx, end: idx + 1 };
      sec.blocks.push(blk); sec.lastContent = idx; return;
    }
    if (ln.trim() && sec) { sec.lastContent = idx; if (blk) blk.end = idx + 1; }
  });
  return sections;
}
function oneLine(s) { return String(s).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(''); }
function formatBlock(step, turns) {
  // 話者の表記：全員が Expert で 1 発言なら書かない。Expert が複数の発言のときは、書かないと 1 発言に
  // 繋がってしまう（parseNarration は話者のない行を前の発言の続きとして読む）ので Expert: を書く
  const allExpert = turns.every((t) => t.role !== 'novice');
  const bare = allExpert && turns.length === 1 && !ROLE.test(turns[0].text);
  return turns.map((t, j) => (j ? '    ' : `[${step}] `) +
    (bare ? '' : t.role === 'novice' ? 'Novice: ' : 'Expert: ') + t.text);
}
// slideOrder：原稿のスライドの順。鍵の文字列か {key, id, heading}（build の slides）の配列。
// 新しい節の見出しは、id のあるスライドなら「## 見出し {#id}」にする
export function rewriteNarration(text, slideKey, stepKey, turns, slideOrder = []) {
  if (!isStepKey(stepKey)) throw new Error(`bad step key: ${stepKey}`);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  // 行ごとの改行（CRLF / LF）を覚えておき、触らない行はそのまま書き戻す。新しい行は文書の改行で
  const parts = String(text).split(/(\r?\n)/);
  const lines = [], eols = [];
  for (let j = 0; j < parts.length; j += 2) { lines.push(parts[j]); eols.push(parts[j + 1] ?? null); }
  const splice = (at, del, add) => { lines.splice(at, del, ...add); eols.splice(at, del, ...add.map(() => null)); };
  turns = turns.map((t) => ({ role: t.role === 'novice' ? 'novice' : 'expert', text: oneLine(t.text) })).filter((t) => t.text);
  const block = turns.length ? formatBlock(stepKey, turns) : [];
  const sections = scanNarration(lines);
  const sec = [...sections].reverse().find((s) => s.key === slideKey);
  if (sec) {
    const same = sec.blocks.filter((b) => b.step === stepKey);
    if (same.length) {
      // 同じ段階が複数あれば、効いている最後のものを置き換え、前のものは消す
      const last = same[same.length - 1];
      const keep = extLinesOf(lines, last);
      const add = withExt(stepKey, block, keep);
      // 拡張の行は文字も改行もそのまま
      // 新しい行は、置き換える行の同じ位置の改行を使う（改行の混ざった原稿でも、ほかの行と同じ書き方に）
      const was = eols.slice(last.start, last.end);
      const addEols = add.map((l, j) => { const k = keep.find((x) => x.text === l && !x.used); if (k) { k.used = true; return eols[k.idx]; } return was[Math.min(j, was.length - 1)] ?? null; });
      lines.splice(last.start, last.end - last.start, ...add);
      eols.splice(last.start, last.end - last.start, ...addEols);
      for (const b of same.slice(0, -1).reverse()) splice(b.start, b.end - b.start, []);
    } else if (block.length) {
      const later = sec.blocks.find((b) => stepOrder(b.step) > stepOrder(stepKey));
      const at = later ? later.start : sec.lastContent + 1;
      splice(at, 0, block);
    }
  } else if (block.length) {
    // 新しい節：原稿のスライドの順で、次のスライドの節の前に入れる
    const order = slideOrder.map((s) => (typeof s === 'string' ? { key: s } : s));
    const idx = order.findIndex((s) => s.key === slideKey);
    const nextSec = idx >= 0 ? order.slice(idx + 1).map((o) => sections.find((s) => s.key === o.key)).find(Boolean) : null;
    const add = [idx >= 0 && typeof slideOrder[idx] !== 'string' ? headingLine(order[idx]) : `## ${slideKey}`, ...block, ''];
    if (nextSec) splice(nextSec.head, 0, add);
    else {
      while (lines.length && lines[lines.length - 1] === '') { lines.pop(); eols.pop(); }
      splice(lines.length, 0, ['', ...add]);
    }
  }
  return lines.map((l, j) => l + (j < lines.length - 1 ? (eols[j] ?? eol) : '')).join('');
}
// 段階の行の範囲の中の拡張の行と、その前にある発言の数（書き換えた後も同じ発言の後ろに置く）
function extLinesOf(lines, blk) {
  const out = [];
  let n = 0;
  for (let j = blk.start; j < blk.end; j++) {
    const ln = lines[j];
    if (j === blk.start) { const m = ln.match(/^\s*\[(\d+|concl)\]\s*(.*)$/); if (m && m[2].trim()) n = 1; continue; }
    if (parseExtLine(ln)) { out.push({ idx: j, text: ln, after: n }); continue; }
    if (!ln.trim() || /^\s*<!--/.test(ln)) continue;
    if (ROLE.test(ln.trim()) || n === 0) n++;
  }
  return out;
}
// 新しい段階の行に拡張の行を差し込む。最初の発言の前のもの（と、発言が空になったとき）は「[k]」だけの行の後ろに
function withExt(step, block, ext) {
  if (!ext.length) return block;
  const n = block.length;
  const lead = ext.filter((x) => x.after === 0 || n === 0);
  const out = [];
  let body = block;
  if (lead.length) {
    out.push(`[${step}]`, ...lead.map((x) => x.text));
    body = block.map((l, j) => (j ? l : '    ' + l.replace(/^\[[^\]]*\]\s?/, '')));
  }
  body.forEach((l, j) => {
    out.push(l);
    for (const x of ext) if (x.after > 0 && Math.min(x.after, n) === j + 1) out.push(x.text);
  });
  return out;
}
// その段階の行（同じ段階が複数あればすべて）の短い hash。口述原稿の保存の衝突を見分けるのに使う
export function narrationRev(text, slideKey, stepKey) {
  const lines = String(text).split(/\r?\n/);
  const sec = [...scanNarration(lines)].reverse().find((s) => s.key === slideKey);
  const blocks = sec ? sec.blocks.filter((b) => b.step === stepKey).map((b) => lines.slice(b.start, b.end).join('\n')) : [];
  return short(JSON.stringify(blocks));
}
// その段階の発言（書いたままの文字列）。同じ段階が複数あれば効いている最後のもの
export function rawTurns(text, slideKey, stepKey) {
  if (text == null) return { turns: [], exists: false };
  const segs = parseNarration(text).filter((s) => s.slideKey === slideKey && s.stepKey === stepKey);
  const seg = segs[segs.length - 1];
  return seg ? { turns: seg.turns.map((t) => ({ role: t.role, text: t.raw })), exists: true, line: seg.line } : { turns: [], exists: false };
}
// "鍵:段階" → [スライドの鍵, 段階]（スライドの鍵に : があってもよい）
export function splitKey(key) { const p = String(key).lastIndexOf(':'); return p < 0 ? [String(key), '0'] : [key.slice(0, p), key.slice(p + 1)]; }
