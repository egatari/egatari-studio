// 台本の解析。発表者ビューでも共有する、環境・外部モジュールに依存しない部分。
// スライドの鍵（docs/contract.md §4、format spec §8.1）：section の id、なければ見出しの正規化
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
// id が規則に合わないときも鍵には使い、badId を立てる（品質チェックが知らせる）
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

// 拡張の行（format spec §8.2・§9A）：段階の中の「@x-<名前>-<欄> <値>」。名前に - は入らない。
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

// 発表者への指示。最初の } までで、入れ子は不可。読み・区切りより先に除く。
export const NOTE = /\{note:([^{}]*)\}/g;
export function stripNotes(raw) { return String(raw).replace(NOTE, ''); }
// 本文に紛れた { と、閉じ忘れを検査。最初の } は終端なので、その直後の余分な } も知らせる。
export function noteProblems(raw) {
  const out = [];
  for (const m of String(raw).matchAll(/\{note:([^}]*)(\}|$)/g)) {
    if (!m[2] || m[1].includes('{') || raw[m.index + m[0].length] === '}') out.push({ text: m[0], offset: m.index });
  }
  return out;
}
// 発表者専用：指示の位置を保った表示の部品（HTML にせず、表示時にエスケープする）。
function presenterText(raw) { return raw.replace(BOUND, '').replace(READING, '$1').replace(/\s{2,}/g, ' '); }
export function presenterParts(raw) {
  const out = [];
  let at = 0;
  for (const m of raw.matchAll(NOTE)) {
    out.push({ text: presenterText(raw.slice(at, m.index)) }, { note: m[1] });
    at = m.index + m[0].length;
  }
  out.push({ text: presenterText(raw.slice(at)) });
  return out;
}

// 表示用（字幕・発表者ノート）と TTS 用の文字列を作る
//   {φ|ファイ} → 表示 φ / TTS ファイ、{cue} {mark:…} → 表示なし / TTS では区切り（bounds に順に記録）
export function renderText(raw) {
  raw = stripNotes(raw);
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
      cur = { slideKey, stepKey: m[1], line: idx + 1, end: idx + 1, turns: [], ext: [] };   // end：この段階の最後の行（空行を除く）
      out.push(cur); turn = null;
      if (m[2].trim()) addLine(m[2]);
      return;
    }
    // 拡張の行：発言には入れない（前の発言の続きにもしない）。段階の外のものは使わない
    const x = parseExtLine(ln);
    if (x) {
      if (cur) { cur.ext.push({ ...x, line: idx + 1 }); cur.end = idx + 1; }
      else if (slideKey !== null) warnings.push(`narration.md ${idx + 1} 行目: 拡張の行が段階（[k]）の外にある（使わない）`);
      return;
    }
    if (cur && ln.trim()) { addLine(ln.trim()); cur.end = idx + 1; }  // 空行は飛ばす（同じ段階の続き）
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


// {slideKey: {stepKey: [{role, text, ttsParts}]}}（deck.js の DECK.NARRATION。format spec §4 の deck-narration）
// ttsParts：読みを当てた話す部品（renderText の ttsParts。inputHash に入るのと同じ値、§5.4）。端末の読み上げ（§5.6）が使う。
// withTts を false にすると表示の文だけ（字の絞り込みなど、見える字だけを数えるとき）
// 鍵は原稿の文字列なので、__proto__ などでも壊れないよう原型のない object を使う
export function narrationMap(segs, withLines = false, withTts = true) {
  const m = Object.create(null);
  for (const s of segs) {
    (m[s.slideKey] ||= Object.create(null))[s.stepKey] = s.turns.map((t) => {
      const o = { role: t.role, text: t.display };
      if (withTts) o.ttsParts = t.ttsParts.slice();
      if (withLines) o.line = s.line;
      return o;
    });
  }
  return m;
}

// {"slideKey:stepKey": bounds}（deck.js の DECK.MARKS）。{mark} を含む段階だけ
export function marksMap(segs) {
  const m = Object.create(null);
  for (const s of segs) if (s.bounds.some((b) => b.type !== 'cue')) m[`${s.slideKey}:${s.stepKey}`] = s.bounds;
  return m;
}

