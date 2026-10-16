// 口述原稿（narration.md）の解析と書き換え。Node にもブラウザにも依存しない（fs・crypto を使わない）
// kit/narration.mjs（build・TTS・canon）、server/dev.mjs（開発サーバー）、app/（編集アプリ）が共有する
// 書式は docs/contract.md §4
import { short } from './sha1.mjs';

// スライドの鍵：section の id、なければ見出しの元の文字列からタグと空白を除いたもの
export function normalizeKey(s) {
  return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, '').trim();
}

const ROLE = /^(Expert|Novice|E|N)\s*[:：]\s*/;

// 段階の中の区切り：{cue}（部品の同期点）と {mark:…}（注目の演出、docs/contract.md §7）。
// どちらも TTS では区切りになり、tts/synth.py がその時刻を cues に記録する
const BOUND = /\{(cue|mark:[^{}]*)\}/g;
const READING = /\{([^{}|]+)\|([^{}]+)\}/g;
export const MARK_EFFECTS = ['underline', 'circle', 'box', 'spot', 'laser'];

// "cue" / "mark:ID|effect|hold=2" / "mark:clear" → {type:'cue'} / {type:'mark', id, effect, hold} / {type:'clear'}
export function parseBound(tok) {
  if (tok === 'cue') return { type: 'cue' };
  const [id, ...opts] = tok.slice(5).split('|').map((x) => x.trim());
  if (id === 'clear') return { type: 'clear' };
  const b = { type: 'mark', id, effect: 'underline', hold: null };
  for (const o of opts) {
    const h = o.match(/^hold\s*=\s*([\d.]+)$/);
    if (h) b.hold = +h[1];
    else if (o) b.effect = o;
  }
  return b;
}

// 表示用（字幕・発表者ノート・canon）と TTS 用の文字列を作る
//   {φ|ファイ} → 表示 φ / TTS ファイ、{cue} {mark:…} → 表示なし / TTS では区切り（bounds に順に記録）
export function renderText(raw) {
  const display = raw.replace(BOUND, '').replace(READING, '$1').replace(/\s{2,}/g, ' ').trim();
  const pieces = raw.split(/\{(cue|mark:[^{}]*)\}/);   // 奇数番目が区切りの中身
  const parts = [], bounds = [];
  pieces.forEach((p, j) => {
    if (j % 2) bounds.push(parseBound(p));
    else parts.push(p.replace(READING, '$2').trim());
  });
  return { display, tts: parts.join(''), ttsParts: parts, bounds };
}

// 続きの行を前の行に繋ぐ。境目の両側が CJK 以外（英字・数字・記号）なら空白 1 つを挟み、
// どちらかが CJK（かな・漢字・全角の記号）なら詰める（日本語の原稿は従来どおり）
const CJK = /[\u3000-\u303f\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
export function joinLines(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = a[a.length - 1], y = b[0];
  if (/\s/.test(x) || /\s/.test(y) || CJK.test(x) || CJK.test(y)) return a + b;
  return a + ' ' + b;
}

// narration.md → [{slideKey, stepKey, line, turns:[{role, raw, display, tts, ttsParts}]}]
// 同じ段階（slideKey:stepKey）が 2 回あれば後のものを使い、返す配列の warnings に書く
export function parseNarration(text) {
  const out = [];
  let slideKey = null, cur = null, turn = null;
  const lines = text.split(/\r?\n/);
  let inComment = false;
  lines.forEach((ln, idx) => {
    if (inComment) { if (ln.includes('-->')) inComment = false; return; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; return; }
    if (/^\s*<!--.*-->\s*$/.test(ln)) return;
    const h = ln.match(/^##\s+(.+?)\s*$/);
    if (h) { slideKey = normalizeKey(h[1]); cur = null; turn = null; return; }
    if (/^#\s/.test(ln)) return;
    const m = ln.match(/^\s*\[(\d+|concl)\]\s*(.*)$/);
    if (m && slideKey !== null) {
      cur = { slideKey, stepKey: m[1], line: idx + 1, turns: [] };
      out.push(cur); turn = null;
      if (m[2].trim()) addLine(m[2]);
      return;
    }
    if (cur && ln.trim()) addLine(ln.trim());  // 空行は飛ばす（同じ段階の続き）
  });
  function addLine(s) {
    const r = s.match(ROLE);
    if (r || !turn) {
      const role = r ? (r[1][0] === 'N' ? 'novice' : 'expert') : 'expert';
      turn = { role, raw: r ? s.slice(r[0].length) : s };
      cur.turns.push(turn);
    } else {
      turn.raw = joinLines(turn.raw, s);
    }
  }
  // 同じ段階が重なったら後のものだけ残す（字幕・音声・注目の演出がどれも同じものを使うように）
  const warnings = [];
  const last = new Map();
  out.forEach((seg, j) => {
    const key = `${seg.slideKey}:${seg.stepKey}`;
    if (last.has(key)) warnings.push(`narration.md ${seg.line} 行目: 段階「${key}」が重複（${out[last.get(key)].line} 行目を上書き）`);
    last.set(key, j);
  });
  const uniq = out.filter((seg, j) => last.get(`${seg.slideKey}:${seg.stepKey}`) === j);
  for (const seg of uniq) {
    for (const t of seg.turns) Object.assign(t, renderText(t.raw));
    // 段階の区切りの並び（ターンをまたいで順に）。synth.py の cues と 1 対 1 に対応する
    seg.bounds = seg.turns.flatMap((t) => t.bounds);
  }
  uniq.warnings = warnings;
  return uniq;
}


// {slideKey: {stepKey: [{role, text}]}}（deck.js の DECK.NARRATION）
export function narrationMap(segs, withLines = false) {
  const m = {};
  for (const s of segs) {
    (m[s.slideKey] ||= {})[s.stepKey] = s.turns.map((t) => withLines ? { role: t.role, text: t.display, line: s.line } : { role: t.role, text: t.display });
  }
  return m;
}

// {"slideKey:stepKey": bounds}（deck.js の DECK.MARKS）。{mark} を含む段階だけ
export function marksMap(segs) {
  const m = {};
  for (const s of segs) if (s.bounds.some((b) => b.type !== 'cue')) m[`${s.slideKey}:${s.stepKey}`] = s.bounds;
  return m;
}

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
    const h = ln.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (sec) sec.end = idx;
      sec = { key: normalizeKey(h[1]), head: idx, end: lines.length, blocks: [], lastContent: idx };
      sections.push(sec); blk = null; return;
    }
    if (/^#\s/.test(ln)) return;
    const m = ln.match(/^\s*\[(\d+|concl)\]\s*(.*)$/);
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
export function rewriteNarration(text, slideKey, stepKey, turns, slideOrder) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  turns = turns.map((t) => ({ role: t.role === 'novice' ? 'novice' : 'expert', text: oneLine(t.text) })).filter((t) => t.text);
  const block = turns.length ? formatBlock(stepKey, turns) : [];
  const sections = scanNarration(lines);
  const sec = [...sections].reverse().find((s) => s.key === slideKey);
  if (sec) {
    const same = sec.blocks.filter((b) => b.step === stepKey);
    if (same.length) {
      // 同じ段階が複数あれば、効いている最後のものを置き換え、前のものは消す
      const last = same[same.length - 1];
      lines.splice(last.start, last.end - last.start, ...block);
      for (const b of same.slice(0, -1).reverse()) lines.splice(b.start, b.end - b.start);
    } else if (block.length) {
      const later = sec.blocks.find((b) => stepOrder(b.step) > stepOrder(stepKey));
      const at = later ? later.start : sec.lastContent + 1;
      lines.splice(at, 0, ...block);
    }
  } else if (block.length) {
    // 新しい節：原稿のスライドの順で、次のスライドの節の前に入れる
    const idx = slideOrder.indexOf(slideKey);
    const nextSec = idx >= 0 ? slideOrder.slice(idx + 1).map((k) => sections.find((s) => s.key === k)).find(Boolean) : null;
    const add = [`## ${slideKey}`, ...block, ''];
    if (nextSec) lines.splice(nextSec.head, 0, ...add);
    else {
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.push('', ...add);
    }
  }
  return lines.join(eol);
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
