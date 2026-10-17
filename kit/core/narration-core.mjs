// 口述原稿（narration.md）の解析と書き換え。Node にもブラウザにも依存しない（fs・crypto を使わない）
// kit/narration.mjs（build・TTS・canon）、server/dev.mjs（開発サーバー）、app/（編集アプリ）が共有する
// 書式は docs/contract.md §4
import { short } from './sha1.mjs';

// スライドの鍵（docs/contract.md §4、spec/etoki-1.0.md §8.1）：section の id、なければ見出しの正規化
// （タグを除き、&nbsp; を空白とみなし、空白をすべて除いたもの）
export function normalizeKey(s) {
  return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, '');
}

// スライドの id：英字で始まり、英数字・_・- が続く 64 字まで。作るときは s- と base32 の小文字 6 字（乱数）
export const SLIDE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const isSlideId = (s) => typeof s === 'string' && SLIDE_ID.test(s);
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
// taken：使ってはいけない id（文書の中のすべての id と、スライドの鍵）。has(x) を持つもの（Set・Map）
// rand(n)：n バイトの乱数（Uint8Array）。既定は Web Crypto（Node 22 とブラウザの globalThis.crypto）
export function newSlideId(taken = new Set(), rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  for (let tries = 0; tries < 1000; tries++) {
    const id = 's-' + [...rand(6)].map((b) => B32[b & 31]).join('');
    if (!taken.has(id)) return id;
  }
  throw new Error('newSlideId: no free id');
}
// 段階の番号：0〜999 の 10 進（先頭の 0 なし）か concl
export const STEP_KEY = /^(?:0|[1-9]\d{0,2}|concl)$/;
export const isStepKey = (s) => STEP_KEY.test(String(s));

// 見出しの行（## の後ろ）→ {key, id, heading}。末尾の {#id} があればその id が鍵（見出しの文字列より強い）。
// なければ見出しの正規化（id と同じ文字列の見出し「## s-k3f9q2」は、正規化してもそのまま id になる）
// id が規則に合わないときも鍵には使い、badId を立てる（検査器が知らせる）
const HEAD_ID = /^(.*?)\s*\{#([^{}\s]+)\}$/;
export function parseHeading(text) {
  const t = String(text).trim();
  const m = t.match(HEAD_ID);
  if (m) return { key: m[2], id: m[2], heading: m[1], badId: !isSlideId(m[2]) };
  return { key: normalizeKey(t), id: null, heading: t, badId: false };
}
const HEAD = /^##\s+(.+?)\s*$/;
// 見出しにする文字列：1 行・タグなし・よくある文字参照をほどく（{#id} の前に置く）
export function headingText(html) {
  return String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\\\(|\\\)/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\{#/g, '{ #').replace(/\s+/g, ' ').trim();
}
// 新しい節の見出しの行。slide は鍵の文字列か {key, id, heading}
export function headingLine(slide) {
  if (typeof slide === 'string') return `## ${slide}`;
  const h = headingText(slide.heading ?? '');
  if (slide.id && slide.key === slide.id) return h && h !== slide.id ? `## ${h} {#${slide.id}}` : `## ${slide.id}`;
  return `## ${h && normalizeKey(h) === slide.key ? h : slide.key}`;
}

const ROLE = /^(Expert|Novice|E|N)\s*[:：]\s*/;

// 拡張の行（spec/etoki-1.0.md §8.2・§9A）：段階の中の「@x-<名前>-<欄> <値>」。名前に - は入らない。
// 発言・表示・TTS・区切り・hash のどれにも入らず、段階ごとの ext: [{name, field, value, line}] として返す。
// 書き換え（rewriteNarration）でも行はそのまま残す
export const EXT_LINE = /^\s*@x-([a-z][a-z0-9]{0,31})-([a-z][a-z0-9-]{0,31})(?:[ \t]+(.*))?$/;
export function parseExtLine(ln) {
  const m = String(ln).match(EXT_LINE);
  return m ? { name: m[1], field: m[2], value: m[3] ?? '' } : null;
}

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
// 返す配列の sections は節（## 見出し）の一覧 [{key, id, heading, line}]（段階のない節も入る）
// 段階の番号は 0〜999 の 10 進（先頭の 0 なし）か concl。[01] や [1000] は使わず warnings に書く（その中身も捨てる）
export function parseNarration(text) {
  const out = [];
  const sections = [], warnings = [];
  let slideKey = null, cur = null, turn = null;
  const lines = text.split(/\r?\n/);
  let inComment = false;
  lines.forEach((ln, idx) => {
    if (inComment) { if (ln.includes('-->')) inComment = false; return; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; return; }
    if (/^\s*<!--.*-->\s*$/.test(ln)) return;
    const h = ln.match(HEAD);
    if (h) {
      const p = parseHeading(h[1]);
      slideKey = p.key; cur = null; turn = null;
      sections.push({ key: p.key, id: p.id, heading: p.heading, line: idx + 1 });
      if (p.badId) warnings.push(`narration.md ${idx + 1} 行目: id「${p.id}」が規則（英字で始まり英数字・_・- の 64 字まで）に合わない`);
      return;
    }
    if (/^#\s/.test(ln)) return;
    const m = ln.match(/^\s*\[(\d+|concl)\]\s*(.*)$/);
    if (m && slideKey !== null && !isStepKey(m[1])) {
      warnings.push(`narration.md ${idx + 1} 行目: 段階の番号「[${m[1]}]」は使えない（0〜999、先頭の 0 なし）。この段階は読まない`);
      cur = null; turn = null; return;
    }
    if (m && slideKey !== null) {
      cur = { slideKey, stepKey: m[1], line: idx + 1, turns: [], ext: [] };
      out.push(cur); turn = null;
      if (m[2].trim()) addLine(m[2]);
      return;
    }
    // 拡張の行：発言には入れない（前の発言の続きにもしない）。段階の外のものは使わない
    const x = parseExtLine(ln);
    if (x) {
      if (cur) cur.ext.push({ ...x, line: idx + 1 });
      else if (slideKey !== null) warnings.push(`narration.md ${idx + 1} 行目: 拡張の行が段階（[k]）の外にある（使わない）`);
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
  uniq.sections = sections;
  return uniq;
}


// {slideKey: {stepKey: [{role, text}]}}（deck.js の DECK.NARRATION）
// 鍵は原稿の文字列なので、__proto__ などでも壊れないよう原型のない object を使う
export function narrationMap(segs, withLines = false) {
  const m = Object.create(null);
  for (const s of segs) {
    (m[s.slideKey] ||= Object.create(null))[s.stepKey] = s.turns.map((t) => withLines ? { role: t.role, text: t.display, line: s.line } : { role: t.role, text: t.display });
  }
  return m;
}

// {"slideKey:stepKey": bounds}（deck.js の DECK.MARKS）。{mark} を含む段階だけ
export function marksMap(segs) {
  const m = Object.create(null);
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
