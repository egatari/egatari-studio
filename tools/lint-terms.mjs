// 画面の言葉の検査（npm run lint:terms）：用語集（docs/terms.json）の avoid の言葉が、使う人の目に触れる文字列に残っていないかを見る
//   node tools/lint-terms.mjs [--root <dir>] [--json] [--counts]
// 言葉の一覧はこのファイルに書かない：docs/terms.json（言葉）と docs/terms-allow.json（正当な使い方と、照らし方の設定）だけを読む。
// 見る所（使う人の目に触れる文字列）：
//   - 画面のコード（app/*.js・kit/tools.js・kit/presenter.js・kit/deck.js・kit/live.js・kit/core/live-results.mjs・kit/core/part-labels.mjs・
//     server/editor-ui.js・server/hints.js）の文字列リテラル（コメントは見ない）
//   - README(.ja).md・docs/*.md・docs/*.ja.md（AI への指示の文書 authoring-with-llms* を除く）と skills/*/SKILL.md の地の文（フェンスのコード・`コード`・HTML のコメント・URL は見ない）
// 見ない所：AI への指示（kit/core/llm-pack-data.mjs・tools/llm-guide/**・docs/authoring-with-llms*・docs/llm-parts/*）、コードの名前・CSS のクラス・CLI の引数、
//   コメント、changes/ と CHANGELOG
// 照らし方：
//   - avoid の言葉の後ろの（…）／(…) は、使う所の断り書き（「（画面で）」「(UI)」など）。断り書きのある言葉は画面の文字列だけで照らす
//   - 短い言葉（日本語は空白を除いて 2 字以下、英語は 1 語）と terms-allow.json の uiOnly は画面の文字列だけで照らす。
//     terms-allow.json の docsToo は短くても文書でも照らす（段階・部品のように、文書でも紛れない言葉）
//   - 文書の「…」“…” の中（画面の言葉を引いた所）は、画面の文字列と同じに照らす
//   - 正しい言葉（どれかの用語の ja・en）の中に入っている所は数えない（「使う場面」の「場面」、「Quality check」の「check」）
//   - 英語は語の境で、先頭の字だけ大文字小文字を問わない（zip は Zip・zip に当たり、ZIP に当たらない）。複数形の s も当たる
//   - 英語の 1 語が名前の一部（deck.html・--play-only・narration_md など）なら数えない
// 許す使い方：docs/terms-allow.json の allow：{file（* と ** を使える）, pattern（正規表現。その当たりが行の中の pattern の当たりに入っていれば許す）
//   か line（その文字列を含む行なら許す）, term, reason, keep?}。使われなかった許しは知らせる（keep が真のもの＝今は当たる所がなくても残す、正当な使い方の記録、を除く）
// ja と en の組：画面の文字列の表（{ja: …, en: …} の兄弟、const ja / const en、EN ? 'en' : 'ja' のような 3 項）で、
//   ja にある用語の ja に対して、en にその用語の en があるか（大文字小文字を問わない。語幹で比べる）。合わなければ失敗。
//   正当な違い（ja の「授業」が授業の表示でなく授業そのものを言うときなど）は terms-allow.json の allow に pairs: true で書く。
//   terms-allow.json の noPairs（用語の id の並び）は組の検査をしない（ja の言葉が短く一般的な用語：本・形式）
// 出力：ファイル:行  見つけた言葉  用語の id → 置き換え。avoid に当たれば終了コード 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const ri = args.indexOf('--root');
const ROOT = ri >= 0 ? path.resolve(args[ri + 1]) : path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const JSON_OUT = args.includes('--json');
const COUNTS = args.includes('--counts');


// ---- 見る所 ----
const UI_CODE = ['app/*.js', 'kit/tools.js', 'kit/presenter.js', 'kit/deck.js', 'kit/live.js', 'kit/core/live-results.mjs', 'kit/core/part-labels.mjs', 'server/editor-ui.js', 'server/hints.js'];
const PROSE = ['docs/*.md', 'README.md', 'README.ja.md', 'skills/*/SKILL.md'];
const PROSE_EXCLUDE = ['docs/authoring-with-llms*', 'docs/terms.md'];

export function globRe(g) {
  let s = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { s += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') s += '[^/]*';
    else if (c === '?') s += '[^/]';
    else s += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + s + '$');
}
function listFiles(root, globs, exclude = []) {
  const out = new Set();
  const all = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (['node_modules', '.git', 'vendor', 'out', 'dist'].includes(e.name)) continue;
      const rel = dir ? dir + '/' + e.name : e.name;
      if (e.isDirectory()) walk(rel); else all.push(rel);
    }
  };
  for (const top of new Set(globs.map((g) => g.split('/')[0]))) {
    const p = path.join(root, top);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(top); else all.push(top);
  }
  const inc = globs.map(globRe), exc = exclude.map(globRe);
  for (const f of all.sort()) if (inc.some((r) => r.test(f)) && !exc.some((r) => r.test(f))) out.add(f);
  return [...out];
}

// ---- JavaScript の字句：文字列リテラル（テンプレートは地の部分）と、上の階の字句の並び ----
const ID_START = /[A-Za-z_$\u0080-￿]/;
const ID_PART = /[A-Za-z0-9_$\u0080-￿]/;
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
export function tokenize(src) {
  const strings = [];   // {start, end, text}：文字列の中身（テンプレートは ${} の外の部分ごと）
  const tokens = [];    // 上の階の字句：{type: 'str'|'tpl'|'id'|'num'|'punc'|'regex', value, start, end}。テンプレートは 1 つ（中の字句は出さない）
  let i = 0;
  const n = src.length;
  let prev = '';        // 正規表現が来られるかを決める直前の字句
  const tplStack = [];  // テンプレートの ${ の中：{depth, start}
  let depth = 0;        // ${ の中の { の深さ
  const emit = (t) => { if (!tplStack.length) tokens.push(t); };
  const readTemplate = (start) => {   // src[start] === '`' か、${…} の } の直後から
    let j = start, segStart = start;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') { strings.push({ start: segStart, end: j, text: src.slice(segStart, j) }); return { end: j + 1, open: false }; }
      if (c === '$' && src[j + 1] === '{') { strings.push({ start: segStart, end: j, text: src.slice(segStart, j) }); return { end: j + 2, open: true }; }
      j++;
    }
    strings.push({ start: segStart, end: n, text: src.slice(segStart, n) });
    return { end: n, open: false };
  };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      strings.push({ start: i + 1, end: j, text: src.slice(i + 1, j) });
      emit({ type: 'str', value: src.slice(i + 1, j), start: i, end: j + 1 });
      i = j + 1; prev = 'a'; continue;
    }
    if (c === '`') {
      const tStart = i;
      const r = readTemplate(i + 1);
      if (r.open) { tplStack.push({ depth, start: tStart }); depth = 0; i = r.end; prev = '('; continue; }
      emit({ type: 'tpl', value: src.slice(i, r.end), start: i, end: r.end });
      i = r.end; prev = 'a'; continue;
    }
    if (c === '}' && tplStack.length && depth === 0) {
      const top = tplStack[tplStack.length - 1];
      const r = readTemplate(i + 1);
      if (r.open) { i = r.end; prev = '('; continue; }
      tplStack.pop(); depth = top.depth;
      emit({ type: 'tpl', value: src.slice(top.start, r.end), start: top.start, end: r.end });
      i = r.end; prev = 'a'; continue;
    }
    if (c === '/') {
      const regexOk = prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || REGEX_AFTER_WORD.has(prev);
      if (regexOk) {
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        emit({ type: 'regex', value: src.slice(i, j), start: i, end: j });
        i = j; prev = 'a'; continue;
      }
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < n && ID_PART.test(src[j])) j++;
      const w = src.slice(i, j);
      emit({ type: 'id', value: w, start: i, end: j });
      i = j; prev = REGEX_AFTER_WORD.has(w) ? w : 'a'; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) j++;
      emit({ type: 'num', value: src.slice(i, j), start: i, end: j });
      i = j; prev = 'a'; continue;
    }
    if (tplStack.length) { if (c === '{') depth++; else if (c === '}') depth--; }
    emit({ type: 'punc', value: c, start: i, end: i + 1 });
    i++; prev = c === ')' || c === ']' ? ')' : c === '}' ? '}' : c;
  }
  return { strings, tokens };
}

// ---- 文書：照らさない所（フェンス・`コード`・HTML のコメント・URL・i18n の印の行）を同じ長さの空白にする ----
export function maskProse(text) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  let t = text.replace(/<!--[\s\S]*?-->/g, blank);
  const lines = t.split('\n');
  let fence = null;
  for (let k = 0; k < lines.length; k++) {
    const m = lines[k].match(/^\s*(`{3,}|~{3,})/);
    if (fence) { if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null; lines[k] = blank(lines[k]); continue; }
    if (m) { fence = m[1]; lines[k] = blank(lines[k]); continue; }
    lines[k] = lines[k]
      .replace(/(`+)[\s\S]*?\1/g, blank)
      .replace(/\]\([^)]*\)/g, blank)
      .replace(/<https?:[^>]*>|https?:\/\/\S+/g, blank)
      .replace(/<[a-zA-Z/][^>]*>/g, blank);
  }
  return lines.join('\n');
}

// ---- 用語集から照らす言葉を作る ----
const JA_CHAR = /[぀-ヿ㐀-鿿＀-￯]/;
const stripQual = (s) => {
  const m = s.match(/^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/);
  return m && m[1].trim() ? { word: m[1].trim(), qual: m[2].trim() } : { word: s.trim(), qual: '' };
};
// 正しい言葉の面：ja・en の全体と、／ や " / " で分けたもの、（…）と … を落としたもの
function surfaces(s) {
  if (!s || /^[（(]/.test(s)) return [];
  const out = new Set([s.trim()]);
  for (const part of s.split(/\s*[／]\s*|\s+\/\s+/)) {
    out.add(part.trim());
    const core = part.replace(/[（(［[][^）)］\]]*[）)］\]]/g, '').replace(/…/g, '').trim();
    if (core) out.add(core);
  }
  return [...out].filter((x) => x.length > 0);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isJa = (s) => JA_CHAR.test(s);
function wordRe(word) {
  if (isJa(word)) return new RegExp(esc(word).replace(/\\? /g, '\\s?'), 'g');   // 「1 ファイル」は「1ファイル」にも当たる
  const first = word[0];
  const head = /[a-z]/i.test(first) ? `[${first.toLowerCase()}${first.toUpperCase()}]` : esc(first);
  return new RegExp(`(?<![A-Za-z0-9_\\-./#{])${head}${esc(word.slice(1))}(?:s|es)?(?![A-Za-z0-9_\\-/=(])(?!\\.[a-z])`, 'g');
}

export function loadRules(root) {
  const terms = JSON.parse(fs.readFileSync(path.join(root, 'docs/terms.json'), 'utf8')).terms;
  const allowFile = path.join(root, 'docs/terms-allow.json');
  const cfg = fs.existsSync(allowFile) ? JSON.parse(fs.readFileSync(allowFile, 'utf8')) : {};
  const uiOnly = new Set(cfg.uiOnly || []), docsToo = new Set(cfg.docsToo || []);
  const canon = [];
  for (const t of terms) for (const s of [...surfaces(t.ja), ...surfaces(t.en)]) canon.push({ s, re: wordRe(s), id: t.id });
  // avoid の言葉がほかの用語の正しい言葉と同じなら（cue の「マーカー」と marker の「マーカー」）、その言葉は正しい言葉として扱う（照らせない。用語集で決め直す）
  const avoid = [];
  for (const t of terms) {
    for (const lang of ['ja', 'en']) {
      for (const raw of (t.avoid && t.avoid[lang]) || []) {
        const { word, qual } = stripQual(raw);
        if (!word) continue;
        const short = isJa(word) ? word.replace(/\s/g, '').length <= 2 : !/\s/.test(word);
        const ui = !docsToo.has(word) && (!!qual || short || uiOnly.has(word));
        avoid.push({ id: t.id, word, raw, lang, uiOnly: ui, re: wordRe(word), to: lang === 'ja' ? t.ja : t.en });
      }
    }
  }
  const allow = (cfg.allow || []).map((a, k) => ({ ...a, k, used: 0, fre: globRe(a.file), pre: a.pattern ? new RegExp(a.pattern, 'g') : null }));
  // noPairs：ja↔en の組の検査をしない用語（ja の言葉が短く一般的で、部分一致が数え方や別の語に当たる：本 → 2 本・日本語、形式）
  const noPairs = new Set(cfg.noPairs || []);
  return { terms, canon, avoid, allow, noPairs };
}

// 1 つの文字列（行か、文字列リテラルの中身）の中の当たり
function hitsIn(text, rules, { ui }) {
  const out = [];
  // 正しい言葉が占める所
  const covered = [];
  for (const c of rules.canon) { c.re.lastIndex = 0; let m; while ((m = c.re.exec(text))) { covered.push([m.index, m.index + m[0].length, m[0].length, c.id]); if (!m[0].length) c.re.lastIndex++; } }
  for (const a of rules.avoid) {
    if (a.uiOnly && !ui) continue;
    a.re.lastIndex = 0;
    let m;
    while ((m = a.re.exec(text))) {
      const s = m.index, e = s + m[0].length;
      if (covered.some(([cs, ce, len, id]) => cs <= s && e <= ce && (len > m[0].length || id !== a.id))) continue;
      out.push({ a, start: s, end: e, found: m[0] });
    }
  }
  return out;
}

function allowed(rules, file, lineText, h) {
  for (const a of rules.allow) {
    if (a.term !== h.a.id || !a.fre.test(file)) continue;
    if (a.line && lineText.includes(a.line)) { a.used++; return true; }
    if (a.pre) {
      a.pre.lastIndex = 0;
      let m;
      while ((m = a.pre.exec(lineText))) {
        if (m.index <= h.col && h.col + h.found.length <= m.index + m[0].length) { a.used++; return true; }
        if (!m[0].length) a.pre.lastIndex++;
      }
    }
  }
  return false;
}

const lineStarts = (text) => { const r = [0]; for (let k = 0; k < text.length; k++) if (text[k] === '\n') r.push(k + 1); return r; };
const lineOf = (starts, off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo; };

// 画面のコードの文字列リテラル：日本語か、空白をはさむ英字を含むもの（'click'・'deck' のようなコードの名前は見ない）
const isUiText = (s) => isJa(s) || /[A-Za-z]{2,}[^\S\n]+[A-Za-z]/.test(s) || /^[A-Z][a-z]+[^A-Za-z0-9_\-]*$/.test(s.trim());

export function lintFile(root, file, rules) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const starts = lineStarts(text);
  const lines = text.split('\n');
  const found = [];
  const push = (off, h) => {
    const ln = lineOf(starts, off);
    const col = off - starts[ln];
    // 置き換えは、見つけた言葉の言語の側（「TTS」は ja にも en にもある：英語の文の中なら en の言葉）
    const t = rules.terms.find((x) => x.id === h.a.id);
    const to = isJa(h.found) || isJa(lines[ln]) && h.a.lang === 'ja' ? t.ja : t.en;
    const hit = { file, line: ln + 1, col, found: h.found, id: h.a.id, word: h.a.word, to, lang: h.a.lang, a: h.a };
    if (allowed(rules, file, lines[ln], hit)) return;
    found.push(hit);
  };
  if (/\.(m?js)$/.test(file)) {
    for (const s of tokenize(text).strings) {
      if (!isUiText(s.text)) continue;
      for (const h of hitsIn(s.text, rules, { ui: true })) push(s.start + h.start, h);
    }
  } else {
    const masked = maskProse(text);
    const mlines = masked.split('\n');
    for (let k = 0; k < mlines.length; k++) {
      const L = mlines[k];
      for (const h of hitsIn(L, rules, { ui: false })) push(starts[k] + h.start, h);
      // 「…」“…” の中は画面の言葉として照らす（文書の照らし方で当たった所は除く）
      const re = /「([^「」]*)」|“([^“”]*)”/g;
      let m;
      while ((m = re.exec(L))) {
        const inner = m[1] ?? m[2];
        const base = m.index + 1;
        for (const h of hitsIn(inner, rules, { ui: true })) if (h.a.uiOnly) push(starts[k] + base + h.start, h);
      }
    }
  }
  // 同じ所に重なった当たりは、長い言葉の 1 つにする
  found.sort((x, y) => x.line - y.line || x.col - y.col || y.found.length - x.found.length);
  const out = [];
  for (const h of found) {
    const prevH = out[out.length - 1];
    if (prevH && prevH.line === h.line && h.col < prevH.col + prevH.found.length && h.col >= prevH.col) continue;
    out.push(h);
  }
  return out;
}

// ---- ja と en の組 ----
// 上の階の字句から、{ … } の兄弟の ja・en、const ja / const en、3 項（片方だけが日本語の文字列）を見つける
function parseObject(tokens, i, src) {   // tokens[i] は '{'。{entries: [{key, value: {start, end, open?}}], end}
  const entries = [];
  let k = i + 1;
  while (k < tokens.length && !(tokens[k].type === 'punc' && tokens[k].value === '}')) {
    const t = tokens[k];
    let key = null;
    if ((t.type === 'id' || t.type === 'str' || t.type === 'num') && tokens[k + 1] && tokens[k + 1].value === ':') { key = t.value; k += 2; }
    // 値の終わり（深さ 0 の , か }）まで
    const vStart = k;
    let d = 0;
    while (k < tokens.length) {
      const v = tokens[k];
      if (v.type === 'punc') {
        if ('([{'.includes(v.value)) d++;
        else if (')]}'.includes(v.value)) { if (d === 0) break; d--; }
        else if (v.value === ',' && d === 0) break;
      }
      k++;
    }
    if (key !== null && k > vStart) entries.push({ key, ti: vStart, tj: k, start: tokens[vStart].start, end: tokens[k - 1].end });
    if (tokens[k] && tokens[k].value === ',') k++;
  }
  return { entries, end: k };
}
function flatten(tokens, entry, src, prefix, out) {
  const first = tokens[entry.ti];
  if (first.type === 'punc' && first.value === '{' && entry.tj - entry.ti > 1 && tokens[entry.tj - 1].value === '}') {
    const o = parseObject(tokens, entry.ti, src);
    if (o.end === entry.tj - 1) { for (const e of o.entries) flatten(tokens, e, src, prefix ? prefix + '.' + e.key : e.key, out); return; }
  }
  out.set(prefix, { text: src.slice(entry.start, entry.end), start: entry.start });
}
export function findPairs(src) {
  const { tokens } = tokenize(src);
  const pairs = [];   // {ja: Map(path → {text, start}), en: Map, where}
  const seen = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'punc' || t.value !== '{' || seen.has(i)) continue;
    const o = parseObject(tokens, i, src);
    const ja = o.entries.find((e) => e.key === 'ja'), en = o.entries.find((e) => e.key === 'en');
    if (ja && en) {
      const mj = new Map(), me = new Map();
      flatten(tokens, ja, src, '', mj); flatten(tokens, en, src, '', me);
      pairs.push({ ja: mj, en: me });
      for (let k = ja.ti; k < ja.tj; k++) seen.add(k);
      for (let k = en.ti; k < en.tj; k++) seen.add(k);
    }
  }
  // const ja = { … } と const en = { … }
  const top = {};
  for (let i = 0; i + 3 < tokens.length; i++) {
    if (tokens[i].type === 'id' && /^(const|let|var)$/.test(tokens[i].value) && tokens[i + 1].type === 'id' && /^(ja|en)$/.test(tokens[i + 1].value) && tokens[i + 2].value === '=' && tokens[i + 3].value === '{') {
      const o = parseObject(tokens, i + 3, src);
      const m = new Map();
      flatten(tokens, { ti: i + 3, tj: o.end + 1, start: tokens[i + 3].start, end: tokens[o.end].end }, src, '', m);
      top[tokens[i + 1].value] = m;
    }
  }
  if (top.ja && top.en) pairs.push({ ja: top.ja, en: top.en });
  // 3 項：c ? A : B の A・B が文字列で、片方だけが日本語
  const lit = (x) => x && (x.type === 'str' || x.type === 'tpl');
  for (let i = 0; i + 3 < tokens.length; i++) {
    if (tokens[i].value !== '?' || !lit(tokens[i + 1]) || tokens[i + 2].value !== ':' || !lit(tokens[i + 3])) continue;
    const a = tokens[i + 1], b = tokens[i + 3];
    const aj = isJa(a.value), bj = isJa(b.value);
    if (aj === bj || !/[A-Za-z]{2,}/.test(aj ? b.value : a.value)) continue;   // 片方が空（'' など）なら組でない
    const [J, E] = aj ? [a, b] : [b, a];
    pairs.push({ ja: new Map([['', { text: J.value, start: J.start }]]), en: new Map([['', { text: E.value, start: E.start }]]), ternary: true });
  }
  return pairs;
}

const stem = (e) => { const w = e.toLowerCase().replace(/[…]/g, '').replace(/’/g, "'").trim(); const t = w.replace(/(ing|es|s|e)$/, ''); return t.length >= 3 ? t : w; };
export function checkPairs(root, file, rules) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const starts = lineStarts(src);
  const warnings = [];
  // 用語の組：ja の面 → en の面（同じ番号の部分どうし）
  const termPairs = [];
  for (const t of rules.terms) {
    if (rules.noPairs && rules.noPairs.has(t.id)) continue;   // terms-allow.json の noPairs
    const js = surfaces(t.ja), es = surfaces(t.en);
    if (!js.length || !es.length) continue;
    termPairs.push({ id: t.id, ja: js, en: es });
  }
  for (const p of findPairs(src)) {
    for (const [key, jv] of p.ja) {
      const ev = p.en.get(key);
      if (!ev) { warnings.push({ file, line: lineOf(starts, jv.start) + 1, key, kind: 'missing', msg: `no en partner for ja "${key}"` }); continue; }
      const jt = jv.text, et = ev.text.toLowerCase().replace(/’/g, "'");
      if (!isJa(jt)) continue;
      for (const tp of termPairs) {
        // ja の面のどれかが、より長い正しい言葉の中でなく現れるか
        let hit = null;
        for (const s of tp.ja) {
          const re = wordRe(s); let m;
          while ((m = re.exec(jt))) {
            const st = m.index, en = st + m[0].length;
            const inLonger = rules.canon.some((c) => c.s.length > m[0].length && isJa(c.s) && (() => { c.re.lastIndex = 0; let q; while ((q = c.re.exec(jt))) { if (q.index <= st && en <= q.index + q[0].length) return true; if (!q[0].length) c.re.lastIndex++; } return false; })());
            if (!inLonger) { hit = s; break; }
          }
          if (hit) break;
        }
        if (!hit) continue;
        // 同じ ja の用語（スライド：slides と slide）はどれの en でもよい。en は語幹で比べる（recording → record、slides → slide）
        const ens = termPairs.filter((x) => x.ja.includes(hit)).flatMap((x) => x.en);
        if (ens.some((e) => et.includes(stem(e)))) continue;
        const lineText = src.split('\n')[lineOf(starts, jv.start)];
        if (rules.allow.some((al) => al.pairs && al.term === tp.id && al.fre.test(file) && ((al.line && lineText.includes(al.line)) || (al.pre && new RegExp(al.pattern).test(lineText))) && ++al.used)) continue;
        warnings.push({ file, line: lineOf(starts, jv.start) + 1, key, kind: 'term', id: tp.id, msg: `ja has 「${hit}」 (${tp.id}) but en lacks "${tp.en[tp.en.length - 1]}"${key ? ` [${key}]` : ''}` });
      }
    }
    for (const [key, ev] of p.en) if (!p.ja.has(key)) warnings.push({ file, line: lineOf(starts, ev.start) + 1, key, kind: 'missing', msg: `no ja partner for en "${key}"` });
  }
  return warnings;
}

export function run(root) {
  const rules = loadRules(root);
  const files = [...listFiles(root, UI_CODE), ...listFiles(root, PROSE, PROSE_EXCLUDE)];
  const hits = [];
  for (const f of files) hits.push(...lintFile(root, f, rules));
  const pairWarnings = [];
  for (const f of listFiles(root, UI_CODE)) pairWarnings.push(...checkPairs(root, f, rules));
  const unused = rules.allow.filter((a) => !a.used && !a.keep);
  return { rules, files, hits, pairWarnings, unused };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { rules, files, hits, pairWarnings, unused } = run(ROOT);
  if (JSON_OUT) {
    console.log(JSON.stringify({ hits: hits.map(({ a, ...h }) => h), pairWarnings, unusedAllow: unused.map(({ fre, pre, used, ...a }) => a) }, null, 1));
  } else if (COUNTS) {
    const c = new Map();
    for (const h of hits) { const k = `${h.id}\t${h.word}`; c.set(k, (c.get(k) || 0) + 1); }
    for (const [k, v] of [...c].sort((x, y) => y[1] - x[1])) console.log(`${v}\t${k}`);
  } else {
    for (const h of hits) console.log(`${h.file}:${h.line}:${h.col + 1}  「${h.found}」  ${h.id} → ${h.to}`);
    for (const w of pairWarnings) console.log(`${w.file}:${w.line}  ${w.msg}`);
    for (const a of unused) console.log(`warning: docs/terms-allow.json: allow entry #${a.k} (${a.file}, ${a.term}) matched nothing; remove it if it is no longer needed`);
  }
  const missing = pairWarnings.filter((w) => w.kind === 'missing');
  const termW = pairWarnings.filter((w) => w.kind === 'term');
  const fail = hits.length > 0 || missing.length > 0 || termW.length > 0;
  console.error(`lint:terms: ${files.length} files, ${rules.avoid.length} avoid words; ${hits.length} to replace, ${missing.length} strings without a partner, ${termW.length} ja↔en term mismatches, ${unused.length} unused allow entries`);
  process.exit(fail ? 1 : 0);
}
