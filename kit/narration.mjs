// 口述原稿（narration.md）の読み書き。build・TTS・canon への出力・開発サーバーが共有する
// 書式は docs/contract.md §4
import fs from 'node:fs';
import crypto from 'node:crypto';

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

// narration.md → [{slideKey, stepKey, line, turns:[{role, raw, display, tts, ttsParts}]}]
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
      turn.raw += s;
    }
  }
  for (const seg of out) {
    for (const t of seg.turns) Object.assign(t, renderText(t.raw));
    // 段階の区切りの並び（ターンをまたいで順に）。synth.py の cues と 1 対 1 に対応する
    seg.bounds = seg.turns.flatMap((t) => t.bounds);
  }
  return out;
}

export function readNarration(path) {
  if (!fs.existsSync(path)) return [];
  return parseNarration(fs.readFileSync(path, 'utf8'));
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

// 音声キャッシュの鍵：話者・TTS 用の文字列・声の設定から作る（marp2mp4 の turns_digest と同じ考え方）
export function segDigest(seg, voice = {}) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify({ turns: seg.turns.map((t) => [t.role, t.ttsParts]), voice }));
  return h.digest('hex').slice(0, 12);
}
