// 「このデッキはコードを動かせるか」を、申告（持ち運べる 1 ファイルの index.profile）ではなく中身から決める（format spec §6）。
// 編集アプリが、プレビューと発表者ビューでデッキのコードを動かす前に知らせて確かめるかどうかに使い、持ち運べる 1 ファイルの書き出しも
// profile をこれで決める。何も実行しない（parse5 で文字列として読むだけ）。Node にもブラウザにも依存しない
//
//   codeReasons(files, {entry})  files：Map か {相対パス: Uint8Array | 文字列}。返すもの：理由の文字列の配列（空ならコードなし）
//   markupReasons(text, where)   1 つの文書（HTML・SVG・XML、組み立てが取り込みうるテキスト）の中の理由
//   documentReasons(html, trusted) 組んだ文書（表示するバイトそのもの）の中の理由。組み立てとエディタはこれで決める（build の stats.codeReasons）。
//                                codeReasons は原稿のフォルダ・取り出した原稿の全体を見る補い（同じバイトから、少しでも疑わしいものを足す）
//
// コードと見なすもの（どれか 1 つでもあれば、そのデッキのコードが動く）：
//   - JavaScript のファイル（.js・.mjs・.cjs。原稿のフォルダの部品 components/<名前>/index.js も）
//   （原稿のほかの .html は、原稿がその名前を書いているときだけ。書き出した教材などを数えない）
//   - データの type を持たない <script>（type なし・JavaScript の MIME・module・importmap、知らない type も含む）。
//     ただし src のない、中身が空か空白だけの <script> はコードではない（format spec §6。何も動かない。コメントだけのものはコード）
//   - on で始まる属性（onerror・onload などのイベントの処理）
//   - javascript: / vbscript: の URL を値に持つ属性（SVG の <animate values="…; javascript:…"> も）
//   - srcdoc 属性、文書を入れる要素（iframe・frame・frameset・object・embed・portal）
//   - 部品庫の部品で式を new Function で作るもの（m-sweep の f・m-curves の系列の f）の、決まった数式の形に入らない式
// 中身を読めないもの（大きすぎるテキスト・解けない {{JSON:…}}）も、確かめられないのでコードと見なす（少しでも疑わしければ聞く側に倒す）
import { parse } from 'parse5';
import { FORMAT } from './format.mjs';

const BINARY = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'tif', 'tiff', 'woff', 'woff2', 'ttf', 'otf', 'eot',
  'wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'mp4', 'm4v', 'webm', 'mov', 'pdf', 'zip', 'gz']);
const JS_EXT = new Set(['js', 'mjs', 'cjs']);
// 中身を読まないもの：口述原稿・コメント・音声の記録・秒数（組み立ては JSON の中に < を逃がして入れるだけで、文書には入れない）
const NOT_MARKUP = new Set(['comments.json', 'audio/manifest.json', 'timeline.json', 'narration.md', 'voice.json']);
// データの type（実行しない）
const DATA_TYPES = new Set(['application/json', 'application/ld+json', 'application/octet-stream', 'text/x-tex-macros', 'text/plain', FORMAT.MIME]);
const EMBED = new Set(['iframe', 'frame', 'frameset', 'object', 'embed', 'portal']);
const MAX_SCAN = 16 * 1024 * 1024;
// 解析の規則：表示するブラウザと同じ、スクリプトを動かすときのもの（format spec §6。<noscript> の中は文字で、最初の </noscript> で閉じる。
// スクリプトを止めた規則で読むと、<noscript><p title="</noscript><script>…"> が属性の文字に見えるが、ブラウザではスクリプトが動く）。
// parse5 は解析するだけで何も実行しない。組み立ての境目（kit/core/build-core.mjs）と持ち運べる形式の読み取り（kit/core/bounded-html.mjs）も同じ規則
export const SCRIPTING = true;
const dec = new TextDecoder();
const extOf = (rel) => { const m = /\.([A-Za-z0-9]+)$/.exec(rel); return m ? m[1].toLowerCase() : ''; };

// ---------------------------------------------------------------- 部品庫の部品の式（m-sweep・m-curves）
const MATH_NAMES = new Set(Object.getOwnPropertyNames(Math));
const EXPR = {
  'm-sweep': { attrs: ['f'], vars: ['u', 'c'], withMath: false },
  'm-curves': { json: 'f', vars: ['x', 'N'], withMath: true },
};
// 決まった数式の形：数・許した名前（変数・Math・Math.<名前>、with(Math) の部品では Math の名前そのまま）・演算子・括弧・コンマ・?:。
// 文字列・[ ]・{ }・代入・; ・\ は通さない（[ ] と文字列がなければ、許した名前の外の値に届かない）
export function safeExpression(expr, { vars = [], withMath = false } = {}) {
  if (typeof expr !== 'string' || expr.length > 2000) return false;
  const allowed = new Set([...vars, 'Math', ...(withMath ? MATH_NAMES : [])]);
  const re = /\s+|(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_$][\w$]*)|(\*\*|===|!==|==|!=|<=|>=|&&|\|\||[-+*/%<>!?:,().&|^~])/y;
  let i = 0, prev = null, prevIdent = null;
  while (i < expr.length) {
    re.lastIndex = i;
    const m = re.exec(expr);
    if (!m || m.index !== i) return false;
    i = re.lastIndex;
    if (m[0].trim() === '') continue;
    if (m[2]) {
      const id = m[2];
      if (prev === '.') { if (prevIdent !== 'Math' || !MATH_NAMES.has(id)) return false; }
      else if (!allowed.has(id)) return false;
      prevIdent = id; prev = 'id';
      continue;
    }
    if (m[3] === '.' && prev !== 'id') return false;
    prev = m[3] || 'num'; if (m[3] !== '.') prevIdent = null;
  }
  return true;
}

// 部品の子のデータの <script>（kit/deck.js の MotionElement の data と同じ選び方：type の前後の空白を除き、大文字小文字を区別せずに
// application/json。id によらない）。実行系と判定はこの規則を共有する（変えるときは両方を同時に。試験が両方を比べる）
export function isDataBlock(type) { return String(type ?? '').trim().toLowerCase() === 'application/json'; }
// 部品の系列（配列か 1 つのもの）の式がどれも決まった数式の形か。実行系（m-curves）は配列の各項目の f を読む。
// 項目が物でないもの・f が文字列でないものも通さない（文字列にして式にされうる）
function formulasOk(data, ex) {
  for (const item of Array.isArray(data) ? data : [data]) {
    if (item === null || typeof item !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(item, ex.json) && !safeExpression(item[ex.json], ex)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- 文書の中
const attr = (n, name) => { const a = (n.attrs || []).find((x) => x.name === name); return a ? a.value : null; };
const textOf = (n) => (n.childNodes || []).filter((c) => c.nodeName === '#text').map((c) => c.value).join('');
// src のない、中身が空か空白（空白・タブ・改行・改ページ・垂直タブ）だけの <script>（format spec §6：コードではない）。
// 空白はわざと狭く取る（ほかの字が 1 つでもあればコードとする。コメント・; だけのものもコード）
export function emptyScript(n) { return attr(n, 'src') === null && /^[ \t\n\r\f\v]*$/.test(textOf(n)); }
const JS_URL = /(^|[\s;,])(javascript|vbscript|livescript):/;
// resolveJson(name)：{{JSON:name}} の中身（文字列か null）。m-curves の子の JSON が取り込みのとき
export function markupReasons(text, where = '', resolveJson = null) {
  return scanTree(parse(String(text), { scriptingEnabled: SCRIPTING }), where, resolveJson, null);
}

// 組んだ文書（表示するのと同じバイト）の中の理由（format spec §6：判定は取り込み・前処理の後の原稿全体に対し、表示するのと同じバイトで行う）。
// trusted：組み立て・エディタが自分で入れた部分 [{start, end, tags}]（文字の位置。tags はその範囲にあるはずの要素の名前の並び）。
// 範囲の中にすっかり収まる要素だけを飛ばす。tags のある範囲は、範囲から作られた要素の並びが tags と違えば（信頼しないバイトに飲み込まれた・抜け出された）、
// その範囲は信頼せずに読み、そのことも理由にする（少しでも疑わしければコードとする）
export function documentReasons(html, trusted = []) {
  const text = String(html);
  const ranges = (trusted || []).map((r) => ({ ...r, ok: true }));
  const inside = (loc) => loc && typeof loc.startOffset === 'number' && typeof loc.endOffset === 'number' ? ranges.find((r) => r.ok && loc.startOffset >= r.start && loc.endOffset <= r.end) || null : null;
  const doc = parse(text, { scriptingEnabled: SCRIPTING, sourceCodeLocationInfo: true });
  // 範囲ごとに、すっかり収まる一番外側の要素の名前を並べて、tags と比べる
  const seen = new Map(ranges.map((r) => [r, []]));
  const look = (n) => {
    if (n.tagName) {
      const r = inside(n.sourceCodeLocation);
      if (r) { seen.get(r).push(n.tagName); return; }
      const l = n.sourceCodeLocation;
      // 範囲の中で始まって外で終わる要素（範囲を飲み込んだ・範囲から抜け出した）
      if (l && typeof l.startOffset === 'number') for (const q of ranges) if (q.tags && l.startOffset >= q.start && l.startOffset < q.end && !(l.endOffset <= q.end)) q.spill = true;
    }
    for (const c of n.childNodes || []) look(c);
    if (n.content) look(n.content);
  };
  look(doc);
  const extra = [];
  for (const r of ranges) {
    if (r.spill || (r.tags && seen.get(r).join(',') !== r.tags.join(','))) { r.ok = false; extra.push(`trusted part ${r.name || r.start} was not parsed as inserted`); }
  }
  return [...extra, ...scanTree(doc, '', null, (n) => !!inside(n.sourceCodeLocation))];
}

// skip(n)：その要素（と中身）を読まない（信頼する部分）
function scanTree(doc, where, resolveJson, skip) {
  const out = new Set();
  const visit = (n) => {
    if (n.tagName && skip && skip(n)) return;
    if (n.tagName) {
      const tag = n.tagName.toLowerCase();
      if (tag === 'script') {
        const t = (attr(n, 'type') || '').trim().toLowerCase().split(';')[0].trim();
        if (!DATA_TYPES.has(t) && !emptyScript(n)) out.add(`<script${t ? ` type="${t}"` : ''}>${where}`);
      }
      if (EMBED.has(tag)) out.add(`<${tag}>${where}`);
      if (tag === 'meta' && (attr(n, 'http-equiv') || '').trim().toLowerCase() === 'refresh') out.add(`<meta http-equiv="refresh">${where}`);
      for (const a of n.attrs || []) {
        const name = a.name.toLowerCase();
        if (/^on/.test(name)) out.add(`${name}=${where}`);
        if (name === 'srcdoc') out.add(`srcdoc=${where}`);
        if (JS_URL.test(String(a.value).toLowerCase().replace(/[\u0000-\u001f]/g, ''))) out.add(`${name}="javascript:…"${where}`);
      }
      const ex = EXPR[tag];
      if (ex) {
        for (const k of ex.attrs || []) { const v = attr(n, k); if (v !== null && !safeExpression(v, ex)) out.add(`<${tag} ${k}="…"> (not a plain formula)${where}`); }
        if (ex.json) {
          // 実行系（kit/deck.js の MotionElement の data）が選ぶのは、直接の子のうち isDataBlock に当たる <script> がちょうど 1 つのとき。
          // 2 つ以上なら実行系は使わないが、どれが選ばれるかを判定と実行系で食い違わせないために、判定できないもの（コード）とする。
          // 直接の子に限らず、部品の中の isDataBlock に当たる <script> はどれも式を確かめる（木の作り方の違いで選ばれるものが変わっても通らないように）
          const direct = (n.childNodes || []).filter((c) => c.tagName === 'script' && isDataBlock(attr(c, 'type')));
          if (direct.length > 1) out.add(`<${tag}> has ${direct.length} data blocks (ambiguous)${where}`);
          const all = [];
          const collect = (x) => { for (const c of x.childNodes || []) { if (c.tagName === 'script' && isDataBlock(attr(c, 'type'))) all.push(c); collect(c); } if (x.content) collect(x.content); };
          collect(n);
          if (all.length > direct.length) out.add(`<${tag}> has a nested data block (ambiguous)${where}`);
          for (const s of all) {
            let raw = textOf(s);
            const inc = /^\s*\{\{JSON:([^}]+?)\}\}\s*$/.exec(raw);
            if (inc) raw = resolveJson ? resolveJson(inc[1].trim()) : null;
            let data = null;
            try { data = raw === null ? undefined : JSON.parse(raw); } catch { data = undefined; }
            if (data === undefined) out.add(`<${tag}> data (cannot check the formulas)${where}`);
            else if (!formulasOk(data, ex)) out.add(`<${tag}> ${ex.json}: (not a plain formula)${where}`);
          }
        }
      }
    }
    for (const c of n.childNodes || []) visit(c);
    if (n.content) visit(n.content);
  };
  visit(doc);
  return [...out];
}

// ---------------------------------------------------------------- 原稿のフォルダ・取り出した原稿の全体
export function codeReasons(files, { entry = 'deck.html' } = {}) {
  const map = files instanceof Map ? files : new Map(Object.entries(files || {}));
  const text = (v) => (typeof v === 'string' ? v : dec.decode(v));
  const out = [];
  const resolveJson = (name) => {
    for (const p of ['data/' + name, name]) if (map.has(p)) { const v = map.get(p); return (typeof v === 'string' ? v.length : v.length) > MAX_SCAN ? null : text(v); }
    return null;
  };
  let et = null;
  const entryText = () => (et ??= map.has(entry) ? text(map.get(entry)) : '');
  for (const [rel, v] of [...map].sort(([a], [b]) => (a === entry ? -1 : b === entry ? 1 : a < b ? -1 : a > b ? 1 : 0))) {
    if (rel.split('/').some((s) => s.startsWith('.'))) continue;            // 控え（.cache）など
    if (rel.startsWith(FORMAT.ATTACH_DIR + '/')) continue;                   // 添付（§3.8）：組み立てに使わず、再生器はダウンロードだけ（実行しない）
    const ext = extOf(rel);
    if (JS_EXT.has(ext)) { out.push(`script file ${rel}`); continue; }
    if (BINARY.has(ext) || (NOT_MARKUP.has(rel) && rel !== entry)) continue;
    // 原稿のほかの HTML（書き出した教材・持ち運べる 1 ファイルなど）は、原稿がその名前を書いているとき（取り込みうるとき）だけ読む
    if ((ext === 'html' || ext === 'htm') && rel !== entry && !entryText().includes(rel.split('/').pop())) continue;
    const size = typeof v === 'string' ? v.length : v.length;
    if (size > MAX_SCAN) { out.push(`${rel} is too large to check`); continue; }
    out.push(...markupReasons(text(v), rel === entry ? '' : ` in ${rel}`, resolveJson));
  }
  return out;
}
