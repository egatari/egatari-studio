// 原稿（deck.html）を、外部の読み込みなしで表示できる 1 つの HTML にする
//
//   node kit/build.mjs <deck.html> [-o 出力.html] [--theme 名前] [--dev] [--embed-audio]
//
// 原稿の中で使える記法
//   \( … \)，\[ … \]        数式。KaTeX で事前に組む（<script> <style> <svg> <textarea> の中は対象外）
//   /*INCLUDE:ファイル*/     ファイルの中身をそのまま入れる（原稿のフォルダ → kit の順に探す）
//   {{FIG:名前}}            figs/名前.svg（なければ原稿のフォルダの 名前.svg）を埋め込む。id に図の名前を前置する
//   {{JSON:ファイル}}        JSON をそのまま入れる（data/ → 原稿のフォルダの順に探す）
//   <m-名前 …>              部品。components/名前/index.js（原稿のフォルダ → リポジトリの順に探す）を自動で読み込む
// 原稿のフォルダに置くと読まれるもの
//   narration.md（口述原稿）、timeline.json（秒数の調整）、audio/manifest.json（TTS の出力）、macros.tex（数式のマクロ）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { normalizeKey, readNarration, narrationMap, marksMap, MARK_EFFECTS } from './narration.mjs';

const require = createRequire(import.meta.url);
const katex = require('katex');
const KIT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(KIT);
// 版（package.json の version）。デッキに DECK.VERSION として埋め込む（フィードバックの欄に入れる）
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '';

// ---------------------------------------------------------------- 原稿の解析：スライドの鍵と、編集用の元の位置
const EDITABLE = new Set(['h1', 'h2', 'p', 'li', 'td', 'th']);
const EDITABLE_CLASS = ['big', 'note', 'sub', 'venue', 'au', 'thm', 'box', 'lead'];

function walk(node, fn, parent = null) {
  fn(node, parent);
  for (const c of node.childNodes || []) walk(c, fn, node);
  if (node.content) walk(node.content, fn, node);
}
const attr = (n, name) => (n.attrs || []).find((a) => a.name === name)?.value;
const hasClass = (n, c) => (attr(n, 'class') || '').split(/\s+/).includes(c);
const short = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

// 原稿に data-key（常に）と data-src（開発時）を書き足す。挿入は後ろから行い、位置をずらさない
// スライドの鍵は文書全体で重複しない：明示の data-key / id が重なれば警告して「#n」を付け、
// 見出しや番号から作る鍵は、明示の鍵とも「#n」付きの鍵とも重ならないようにする。書き換えた鍵は data-key に書く
export function annotate(src, dev, warn = []) {
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const ins = []; // [offset, text, deleteLength]
  const slides = [];
  const secs = [];
  walk(doc, (n) => {
    if (!n.tagName || !n.sourceCodeLocation) return;
    const loc = n.sourceCodeLocation;
    if (n.tagName === 'section' && hasClass(n, 'slide')) {
      const h = findFirst(n, (x) => x.tagName === 'h2' || x.tagName === 'h1');
      secs.push({ n, h, explicit: attr(n, 'data-key') || attr(n, 'id') || '' });
    }
    if (dev && loc.startTag && loc.endTag) {
      const cls = (attr(n, 'class') || '').split(/\s+/);
      const ok = EDITABLE.has(n.tagName) || cls.some((c) => EDITABLE_CLASS.includes(c)) ||
        (n.tagName === 'span' && parentHasClass(n, 'concl'));
      if (ok && !n.tagName.includes('-')) {
        const a = loc.startTag.endOffset, b = loc.endTag.startOffset;
        ins.push([loc.startTag.endOffset - 1, ` data-src="${a}-${b}" data-src-h="${short(src.slice(a, b))}"`, 0]);
      }
    }
  });
  // 鍵を決める：明示の鍵を先に（最初に現れたものが元の鍵のまま）押さえ、残りはそれを避ける
  const taken = new Set();
  const free = (base) => { let c = 2; while (taken.has(`${base}#${c}`)) c++; return `${base}#${c}`; };
  const keyOf = new Array(secs.length);
  secs.forEach((s, i) => { if (s.explicit && !taken.has(s.explicit)) { taken.add(s.explicit); keyOf[i] = s.explicit; } });
  secs.forEach((s, i) => {
    if (keyOf[i]) return;
    let key = s.explicit;
    if (key) { key = free(key); warn.push(`slide key: 「${s.explicit}」が重複している（data-key / id）。2 つ目以降を「${key}」にした`); }
    else {
      key = (s.h ? normalizeKey(inner(src, s.h)) : '') || `s${i + 1}`;
      if (taken.has(key)) key = free(key);
    }
    taken.add(key); keyOf[i] = key;
  });
  secs.forEach(({ n, h }, i) => {
    const key = keyOf[i], loc = n.sourceCodeLocation;
    slides.push({ key, title: h ? inner(src, h) : key, start: loc.startOffset });
    const dk = loc.startTag.attrs && loc.startTag.attrs['data-key'];
    if (attr(n, 'data-key') === undefined) ins.push([loc.startTag.endOffset - 1, ` data-key="${escAttr(key)}"`, 0]);
    else if (attr(n, 'data-key') !== key && dk) ins.push([dk.startOffset, `data-key="${escAttr(key)}"`, dk.endOffset - dk.startOffset]);
    if (h && !attr(h, 'data-title')) ins.push([h.sourceCodeLocation.startTag.endOffset - 1, ` data-title="${escAttr(plainTitle(inner(src, h)))}"`, 0]);
  });
  ins.sort((x, y) => y[0] - x[0]);
  let out = src;
  for (const [o, t, del] of ins) {
    // 自己終了タグ（/>）の手前に入れないように
    const at = !del && out[o - 1] === '/' ? o - 1 : o;
    out = out.slice(0, at) + t + out.slice(at + del);
  }
  return { html: out, slides };
}
function findFirst(n, pred) { let r = null; walk(n, (x) => { if (!r && x !== n && pred(x)) r = x; }); return r; }
function parentHasClass(n, c) { return n.parentNode && n.parentNode.tagName && hasClass(n.parentNode, c); }
function inner(src, n) { const l = n.sourceCodeLocation; return l.startTag && l.endTag ? src.slice(l.startTag.endOffset, l.endTag.startOffset) : ''; }
function plainTitle(s) { return s.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]*>/g, '').replace(/\\\(|\\\)/g, '').replace(/\s+/g, ' ').trim(); }
function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// ---------------------------------------------------------------- 数式のマクロ（\newcommand と \def の簡単なもの）
export function readMacros(text) {
  const m = {};
  const re = /\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)\}?\s*(?:\[(\d)\])?\s*\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}|\\def\\([A-Za-z]+)\s*\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;
  let x;
  while ((x = re.exec(text))) {
    if (x[1]) m['\\' + x[1]] = x[3]; else m['\\' + x[4]] = x[5];
  }
  return m;
}

// ---------------------------------------------------------------- 字：使っている字を含む部分だけを埋め込む
// 日本語のデッキ（<html lang> が ja か、lang が無い）は BIZ UDPゴシックだけ。
// それ以外の言語（英語など）は本文を Source Sans 3 にし、BIZ UDPゴシックは和文などラテン文字以外の予備にする
const FONTS = {
  biz: { family: 'BIZ UDPGothic', pkg: '@fontsource/biz-udpgothic' },
  sans3: { family: 'Source Sans 3', pkg: '@fontsource/source-sans-3' },
};
export const isJapanese = (lang) => !lang || /^ja\b/i.test(lang);
// 英語などのデッキで、BIZ UDPゴシックに任せる字（Source Sans 3 が持つラテン文字・記号の大部分より後ろ）
const LATIN_MAX = 0x24f;
function fontFaces(font, weights = [400, 700]) {
  const dir = path.dirname(require.resolve(`${font.pkg}/package.json`));
  const faces = [];
  for (const w of weights) {
    const css = fs.readFileSync(path.join(dir, `${w}.css`), 'utf8');
    for (const block of css.match(/@font-face\s*\{[^}]*\}/g) || []) {
      const url = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
      const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
      if (!url) continue;
      faces.push({ w, family: font.family, file: path.join(dir, 'files', url), range: parseRange(range || 'U+0-10FFFF') });
    }
  }
  return faces;
}
function parseRange(s) {
  return s.split(',').map((p) => {
    const [a, b] = p.trim().replace(/^U\+/i, '').split('-');
    if (a.includes('?')) return [parseInt(a.replace(/\?/g, '0'), 16), parseInt(a.replace(/\?/g, 'F'), 16)];
    return [parseInt(a, 16), parseInt(b || a, 16)];
  });
}
// 字の絞り込みに使う fonttools / brotli の版（キャッシュの鍵にも入れる）
const FONTTOOLS = '4.67.0', BROTLI = '1.2.0';
const _hash = new Map();
function fileHash(f) { if (!_hash.has(f)) _hash.set(f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16)); return _hash.get(f); }
// fonts/ に TTF があれば、使っている字だけに絞った woff2 を作る（uv で fonttools を動かす。結果はキャッシュする）
function subsetCss(text) {
  const chars = [...new Set(text)].filter((c) => c.codePointAt(0) >= 0x20).sort().join('');
  const out = [];
  for (const [w, f] of [[400, 'BIZUDPGothic-Regular.ttf'], [700, 'BIZUDPGothic-Bold.ttf']]) {
    const ttf = path.join(ROOT, 'fonts', f);
    if (!fs.existsSync(ttf)) return null;
    const cache = path.join(os.tmpdir(), 'motion-slides-fonts');
    fs.mkdirSync(cache, { recursive: true });
    const woff = path.join(cache, `${w}-${short(chars + w + fileHash(ttf) + FONTTOOLS)}.woff2`);
    if (!fs.existsSync(woff)) {
      const txt = woff + '.txt'; fs.writeFileSync(txt, chars);
      const r = spawnSync('uv', ['run', '--quiet', '--no-project', '--with', `fonttools==${FONTTOOLS}`, '--with', `brotli==${BROTLI}`, 'pyftsubset', ttf,
        `--text-file=${txt}`, '--flavor=woff2', `--output-file=${woff}`, '--layout-features=*', '--no-hinting'], { encoding: 'utf8' });
      if (r.status !== 0) { console.warn('  ⚠ フォントの絞り込みに失敗（分割ファイルを使う）: ' + (r.stderr || r.error)); return null; }
    }
    out.push(`@font-face{font-family:"BIZ UDPGothic";font-style:normal;font-display:block;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(woff).toString('base64')}) format("woff2")}`);
  }
  return { css: out.join('\n') + '\n', n: out.length, bytes: 0 };
}
// 字の絞り込みに使う字を集める。HTML の文字参照・JSON や JS の \\u エスケープをほどき、
// 実行時や部品が作る字（数字・ASCII・「付録」「Appendix」など）と、部品・実行系の JS の文字列も入れる
const RUNTIME_GLYPHS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
  'Appendix–—…“”‘’';
const RUNTIME_GLYPHS_JA = '付録「」『』（）、。・：；！？　';
// 和文の字（英語などのデッキでは、部品の JS の文字列にある和文（説明文など）は数えない）
const CJK = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/gu;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', hellip: '…', times: '×', middot: '·', copy: '©', reg: '®', deg: '°', minus: '−', larr: '←', rarr: '→', uarr: '↑', darr: '↓', le: '≤', ge: '≥', ne: '≠', plusmn: '±', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', thinsp: '\u2009', ensp: '\u2002', emsp: '\u2003' };
export function decodeEntities(t) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(c); } catch { return m; } }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}
const unescapeJs = (t) => t.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (m, a, b) => { try { return String.fromCodePoint(parseInt(a || b, 16)); } catch { return m; } });
function jsonStrings(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => jsonStrings(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); jsonStrings(x, out); }
  return out;
}
// JS の文字列リテラルの中身（注釈は先に除く。粗いが、字を集めるだけなので足りる）
const jsLiterals = (js) => [...js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1').matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g)].map((m) => m[2]).join('\n');
export function glyphText(html, narration, compJs = '', lang = '') {
  const h = html.replace(/data:[^"')\s]+/g, '');
  const json = [];
  for (const m of h.matchAll(/<script\b[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonStrings(JSON.parse(m[1]), json); } catch { /* JSON でなければ本文として数える */ }
  }
  let comp = unescapeJs(jsLiterals(compJs));
  if (!isJapanese(lang)) comp = comp.replace(CJK, '');
  return RUNTIME_GLYPHS + (isJapanese(lang) ? RUNTIME_GLYPHS_JA : '') + decodeEntities(h) + '\n' + unescapeJs(h) + '\n' + json.join('\n') + '\n' + JSON.stringify(narration) + jsonStrings(narration, []).join('\n') + comp;
}

// 分割ファイル（unicode-range ごと）のうち、使っている字を含むものだけを埋め込む
function rangeCss(fonts, text) {
  const used = new Set();
  for (const ch of text) used.add(ch.codePointAt(0));
  const hit = (r) => { for (const [a, b] of r) for (const c of used) if (c >= a && c <= b) return true; return false; };
  let css = '', n = 0, bytes = 0;
  for (const f of fonts.flatMap((x) => fontFaces(x))) {
    if (!hit(f.range)) continue;
    const b64 = fs.readFileSync(f.file).toString('base64');
    bytes += b64.length; n++;
    css += `@font-face{font-family:"${f.family}";font-style:normal;font-display:block;font-weight:${f.w};src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${f.range.map(([a, b]) => a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`).join(',')}}\n`;
  }
  return { css, n, bytes };
}
function fontCss(text, subset, lang) {
  if (isJapanese(lang)) {
    if (subset) { const r = subsetCss(text); if (r) return r; }
    return rangeCss([FONTS.biz], text);
  }
  // 英語など：ラテン文字は Source Sans 3、それより後ろの字（和文・矢印など）だけを BIZ UDPゴシックで
  const latin = rangeCss([FONTS.sans3], text);
  // Source Sans 3 の分割ファイルが持たない字だけを BIZ UDPゴシックに回す（引用符・ダッシュなどは Source Sans 3 で出す）
  const sansRanges = fontFaces(FONTS.sans3).flatMap((f) => f.range);
  const inSans = (c) => sansRanges.some(([lo, hi]) => c >= lo && c <= hi);
  const rest = [...new Set(text)].filter((c) => { const cp = c.codePointAt(0); return cp > LATIN_MAX && !inSans(cp); }).join('');
  let biz = { css: '', n: 0, bytes: 0 };
  if (rest) biz = (subset && subsetCss(rest)) || rangeCss([FONTS.biz], rest);
  // 本文の字の差し替えと字間・行間は kit/latin.css（テーマの後に置く）
  return { css: latin.css + biz.css, n: latin.n + biz.n, bytes: latin.bytes + biz.bytes };
}

// ---------------------------------------------------------------- テーマ
// fromDeck：原稿の <html data-theme> で指定されたとき。原稿のフォルダかリポジトリの themes/ の中だけを探す
function resolveTheme(name, deckDir, fromDeck = false) {
  const cands = [path.resolve(deckDir, name), path.join(deckDir, 'themes', name), path.join(ROOT, 'themes', name)];
  for (const d of cands) {
    if (!fs.existsSync(path.join(d, 'tokens.css'))) continue;
    if (fromDeck && !within(d, deckDir) && !within(d, path.join(ROOT, 'themes'))) continue;
    return d;
  }
  throw new Error(`theme not found: ${name}`);
}
function themeAssets(dir) {
  const cfgPath = path.join(dir, 'theme.json');
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
  // "extends" なら、親の tokens.css を先に置き、差分だけを上書きする。logos を書かなければ親のロゴを使う（"logos": [] で消せる）
  const par = cfg.extends ? themeAssets(resolveTheme(cfg.extends, path.dirname(dir))) : null;
  const logos = cfg.logos ? cfg.logos.filter((f) => within(path.join(dir, f), dir)).map((f) => dataUri(path.join(dir, f))) : (par ? par.logos : []);
  return { css: (par ? par.css + '\n' : '') + fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8'), logos, cfg };
}
// p が dir の中にあるか（実体のパスで比べる。シンボリックリンクで外に出るものは外とみなす）
function within(p, dir) {
  try {
    const rp = fs.realpathSync(p), rd = fs.realpathSync(dir);
    return rp === rd || rp.startsWith(rd + path.sep);
  } catch { return false; }
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', css: 'text/css', js: 'text/javascript', json: 'application/json', vtt: 'text/vtt' };
function dataUri(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

// ---------------------------------------------------------------- ローカルのファイルの埋め込み
// <img src> <source src/srcset> <video src/poster> <audio src> <track src> <image href>（SVG）<link rel="stylesheet|icon">
// <script src> と、<style> と style="" の中の url(…) / @import を data: URI か中身そのものにする。
// http(s) の参照はそのまま残して警告する（オフラインでは表示されない）。原稿のフォルダの外のファイルは読まない
const SKIP_REF = /^(?:data:|blob:|#|about:|javascript:|mailto:)/i;
const EXT_REF = /^(?:https?:)?\/\//i;
export function bundleAssets(html, deckDir, warn = []) {
  const seen = new Set();
  const once = (msg) => { if (!seen.has(msg)) { seen.add(msg); warn.push(msg); } };
  // ref を、baseDir から見たローカルのファイルにする。埋め込めなければ null（元のまま残す）
  const local = (ref, baseDir, what) => {
    const r = decodeEntities(String(ref).trim());
    if (!r || SKIP_REF.test(r) || /\$\{|\{\{/.test(r)) return null;
    if (EXT_REF.test(r)) { once(`external: ${what} が外部の「${r.slice(0, 80)}」を参照している（オフラインでは表示されない）`); return null; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(r)) return null;          // file: など、ほかのスキーム
    let rel = r.replace(/[?#].*$/, '');
    try { rel = decodeURIComponent(rel); } catch { /* そのまま */ }
    const file = path.resolve(baseDir, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { once(`missing: ${what} の「${r}」が見つからない`); return null; }
    if (!within(file, deckDir)) { once(`refused: ${what} の「${r}」は原稿のフォルダの外にある（埋め込まない）`); return null; }
    return file;
  };
  const uri = (ref, baseDir, what) => { const f = local(ref, baseDir, what); return f ? dataUri(f) : null; };
  const css = (text, baseDir, depth = 0) => text
    .replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?\s*([^;]*);/g, (m, q, ref) => {
      const f = depth < 8 && local(ref, baseDir, '@import');
      return f ? css(fs.readFileSync(f, 'utf8'), path.dirname(f), depth + 1) : m;
    })
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (m, q, ref) => { const u = uri(ref, baseDir, 'CSS の url()'); return u ? `url("${u}")` : m; });
  const srcset = (v, what) => v.split(',').map((part) => {
    const [ref, ...d] = part.trim().split(/\s+/);
    const u = ref && uri(ref, deckDir, what);
    return u ? [u, ...d].join(' ') : part.trim();
  }).join(', ');
  // タグの属性を書き換える（値の引用符はそのまま）
  const setAttrs = (tag, names, fn) => tag.replace(new RegExp(`(\\s(?:${names})\\s*=\\s*)(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'gi'),
    (m, pre, a, b, c) => { const v = a ?? b ?? c; const nv = fn(v, pre.trim().replace(/\s*=$/, '').toLowerCase()); return nv == null ? m : `${pre}"${nv.replace(/"/g, '&quot;')}"`; });
  const markup = (t) => t
    .replace(/<link\b[^>]*>/gi, (tag) => {
      const rel = (tag.match(/\srel\s*=\s*["']?([^"'>]+)/i)?.[1] || '').toLowerCase();
      const href = tag.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i);
      if (!href) return tag;
      const ref = href[1] ?? href[2] ?? href[3];
      if (/\bstylesheet\b/.test(rel)) {
        const f = local(ref, deckDir, '<link rel="stylesheet">');
        return f ? `<style>\n${css(fs.readFileSync(f, 'utf8'), path.dirname(f)).replace(/<\/style/gi, '<\\/style')}\n</style>` : tag;
      }
      if (/\b(?:icon|apple-touch-icon|preload|prefetch|modulepreload|manifest)\b/.test(rel)) return setAttrs(tag, 'href', (v) => uri(v, deckDir, `<link rel="${rel}">`));
      if (EXT_REF.test(ref.trim())) once(`external: <link rel="${rel}"> が外部の「${ref.slice(0, 80)}」を参照している（オフラインでは使えない）`);
      return tag;
    })
    .replace(/<(img|source|video|audio|track|embed|input|image|feImage)\b[^>]*>/gi, (tag, name) => {
      const n = name.toLowerCase(), what = `<${n}>`;
      tag = setAttrs(tag, 'src|poster|href|xlink:href', (v, a) => {
        if (a.endsWith('href') && v.trim().startsWith('#')) return null;
        return uri(v, deckDir, what);
      });
      return setAttrs(tag, 'srcset', (v) => srcset(v, what));
    })
    .replace(/<(iframe|object)\b[^>]*>/gi, (tag, name) => {
      const v = tag.match(/\s(?:src|data)\s*=\s*["']?([^"'\s>]+)/i)?.[1];
      if (v && EXT_REF.test(v)) once(`external: <${name.toLowerCase()}> が外部の「${v.slice(0, 80)}」を参照している（オフラインでは表示されない）`);
      return tag;
    })
    .replace(/(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (m, pre, a, b) => {
      const v = a ?? b; if (!/url\(|@import/.test(v)) return m;
      const nv = css(decodeEntities(v), deckDir); return `${pre}"${nv.replace(/"/g, '&quot;')}"`;
    });
  const parts = html.split(/(<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<textarea\b[\s\S]*?<\/textarea\s*>)/i);
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (i % 2 === 0) { parts[i] = markup(t); continue; }
    if (/^<style/i.test(t)) {
      const open = t.match(/^<style\b[^>]*>/i)[0], close = t.match(/<\/style\s*>$/i)[0];
      parts[i] = open + css(t.slice(open.length, t.length - close.length), deckDir) + close;
    } else if (/^<script/i.test(t)) {
      const open = t.match(/^<script\b[^>]*>/i)[0];
      const src = open.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i);
      if (!src) continue;
      const ref = src[1] ?? src[2] ?? src[3];
      const f = local(ref, deckDir, '<script src>');
      if (f) parts[i] = open.replace(src[0], '') + fs.readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script') + '</script>';
    }
  }
  return parts.join('');
}

// ---------------------------------------------------------------- 本体
// KaTeX で許す HTML 拡張：\htmlClass（色）、\htmlId と \htmlData（注目の演出の目印 §7、モーフの対応 §8。docs/contract.md）
const TRUSTED = new Set(['\\htmlClass', '\\htmlId', '\\htmlData']);
export function build(srcPath, opts = {}) {
  const deckDir = path.dirname(path.resolve(srcPath));
  const raw = fs.readFileSync(srcPath, 'utf8');
  const warn = [];
  const { html: annotated, slides } = annotate(raw, !!opts.dev, warn);
  let html = annotated;
  // 原稿から読むファイルは、原稿のフォルダ（と kit）の中だけ。シンボリックリンクや ../ で外に出るものは読まない
  const inDeck = (p) => within(p, deckDir);

  const find = (name, dirs) => {
    let outside = false;
    for (const d of dirs) {
      const p = path.join(d, name);
      if (!fs.existsSync(p)) continue;
      if (within(p, d === KIT ? KIT : deckDir)) return p;
      outside = true;
    }
    if (outside) { warn.push(`refused: 「${name}」は原稿のフォルダの外にある（読まない）`); return null; }
    throw new Error('not found: ' + name);
  };
  const readIn = (name, dirs) => { const p = find(name, dirs); return p === null ? null : fs.readFileSync(p, 'utf8'); };
  html = html.replace(/\/\*INCLUDE:([^*]+?)\*\//g, (_, f) => readIn(f.trim(), [deckDir, KIT]) ?? '');
  html = html.replace(/\/\*KATEX_CSS\*\//g, '');
  html = html.replace(/\{\{JSON:([^}]+?)\}\}/g, (_, f) => { const t = readIn(f.trim(), [path.join(deckDir, 'data'), deckDir]); return t === null ? 'null' : JSON.stringify(JSON.parse(t)).replace(/<\//g, '<\\/'); });
  html = html.replace(/\{\{FIG:([\w-]+)\}\}/g, (_, name) => {
    let svg = readIn(name + '.svg', [path.join(deckDir, 'figs'), deckDir]);
    if (svg === null) return '';
    svg = svg.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
    svg = svg.replace(/id="([^"]+)"/g, `id="${name}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${name}-$1)`)
      .replace(/xlink:href="#([^"]+)"/g, `xlink:href="#${name}-$1"`).replace(/\shref="#([^"]+)"/g, ` href="#${name}-$1"`);
    svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1');
    return svg;
  });
  // 原稿が参照するローカルのファイル（画像・動画・CSS・スクリプト）を埋め込み、1 ファイルで完結させる
  html = bundleAssets(html, deckDir, warn);

  // テーマ：引数 → <html data-theme> → default
  const themeName = opts.theme || html.match(/<html[^>]*\sdata-theme="([^"]+)"/)?.[1] || 'default';
  const theme = themeAssets(resolveTheme(themeName, deckDir, !opts.theme));
  if (theme.logos.length) {
    const imgs = `<div class="logos">${theme.logos.map((u) => `<img alt="" src="${u}">`).join('')}</div>`;
    html = html.replace(/(<section\b[^>]*class="[^"]*\bcover\b[^"]*"[^>]*>)([\s\S]*?)(<\/section>)/g,
      (m, a, body, c) => /class="logos"|data-nologos/.test(a + body) ? m : a + body + imgs + c);
  }

  // 数式
  // 式の一部に色を付けるマクロ（テーマの変数に従う）：\hlE{…} 結論・問題、\hlT{…} 用語、\hlM{…} 既知の結果
  let macros = { '\\hlE': '\\htmlClass{emph}{#1}', '\\hlT': '\\htmlClass{term}{#1}', '\\hlM': '\\htmlClass{muted}{#1}' };
  const mfile = path.join(deckDir, 'macros.tex');
  if (fs.existsSync(mfile) && inDeck(mfile)) Object.assign(macros, readMacros(fs.readFileSync(mfile, 'utf8')));   // 既定のマクロに足す（同じ名前は macros.tex が優先）
  // モーフの対応（docs/contract.md §8）：\morph{ID}{…} の部分は、前のスライドの同じ ID の部分から滑ってくる
  macros['\\morph'] ??= '\\htmlData{id=#1}{#2}';
  for (const s of html.match(/<script type="text\/x-tex-macros">([\s\S]*?)<\/script>/g) || []) Object.assign(macros, readMacros(s));
  let count = 0;
  const render = (tex, display) => {
    count++;
    try { return katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'htmlAndMathml', macros: { ...macros }, trust: (c) => TRUSTED.has(c.command) }); }
    catch (e) { warn.push(`KaTeX: ${e.message.split('\n')[0]}  in: ${tex.slice(0, 60)}`); return `<span class="katex-error" title="${escAttr(e.message)}">${escAttr(tex)}</span>`; }
  };
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<textarea[\s\S]*?<\/textarea>|<!--[\s\S]*?-->)/);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => render(t, true)).replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => render(t, false));
  }
  html = parts.join('');

  // 部品：使われている <m-名前> を探して読み込む
  const used = [...new Set([...html.matchAll(/<(m-[a-z0-9-]+)[\s>]/g)].map((m) => m[1]))];
  let compJs = '';
  for (const tag of used) {
    const name = tag.slice(2);
    const file = [path.join(deckDir, 'components', name, 'index.js'), path.join(ROOT, 'components', name, 'index.js')].find((p) => fs.existsSync(p));
    if (!file) { warn.push(`component not found: ${tag}`); continue; }
    compJs += `\n// ---- ${tag} (${path.relative(ROOT, file)})\n` + fs.readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script');
  }
  // 原稿の中の <script> の部品定義も含めて、SVG の中の式（svgMath）を使うなら KaTeX を実行時にも読み込む
  const needKatexJs = /svgMath/.test(compJs) || /DECK\.svgMath/.test(html.replace(/<script[^>]*src=[^>]*>/g, ''));

  // 口述原稿・音声・秒数の調整
  const narrPath = path.join(deckDir, 'narration.md');
  if (fs.existsSync(narrPath) && !inDeck(narrPath)) warn.push('refused: narration.md が原稿のフォルダの外を指している（読まない）');
  const segs = fs.existsSync(narrPath) && !inDeck(narrPath) ? [] : readNarration(narrPath);
  for (const w of segs.warnings || []) warn.push(`narration: ${w}`);
  const keySet = new Set(slides.map((s) => s.key));
  for (const s of segs) if (!keySet.has(s.slideKey)) warn.push(`narration: スライドが見つからない「## ${s.slideKey}」（narration.md ${s.line} 行目）`);
  const narration = narrationMap(segs, !!opts.dev);
  const marks = marksMap(segs);
  checkMarks(html, segs, warn);
  const timingPath = path.join(deckDir, 'timeline.json');
  const timing = fs.existsSync(timingPath) && inDeck(timingPath) ? JSON.parse(fs.readFileSync(timingPath, 'utf8')) : {};
  const manPath = path.join(deckDir, 'audio', 'manifest.json');
  const audio = {};
  if (fs.existsSync(manPath) && inDeck(manPath)) {
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
    const outDir = path.dirname(path.resolve(opts.out || defaultOut(srcPath)));
    for (const [k, v] of Object.entries(man.segments || man)) {
      const file = path.resolve(deckDir, 'audio', v.file);
      if (!fs.existsSync(file)) continue;
      if (!inDeck(file)) { warn.push(`refused: audio/manifest.json の「${v.file}」は原稿のフォルダの外にある（使わない）`); continue; }
      audio[k] = { src: opts.embedAudio ? dataUri(compressAudio(file)) : (opts.audioBase ? opts.audioBase + v.file : path.relative(outDir, file).split(path.sep).join('/')), dur: v.dur, cues: v.cues || [] };
    }
  }
  if (compressAudio.failed) warn.push('音声を AAC に圧縮できなかった（ffmpeg がない？）ので WAV のまま埋め込んだ。ファイルが大きくなる');
  const j = (id, o) => `<script type="application/json" id="${id}">${JSON.stringify(o).replace(/<\//g, '<\\/')}</script>`;

  // CSS と JS を組み込む
  const kcss = katexCss();
  // 実行系（deck.js など）の UI の文字列は全部は入れない（英語のデッキで和文の分割ファイルが増える）。スライドに出る字は RUNTIME_GLYPHS で足す
  const lang = html.match(/<html[^>]*\slang="([^"]*)"/)?.[1] || '';
  const textForFont = glyphText(html, narration, compJs, lang);
  const fonts = fontCss(textForFont, opts.subset !== false && !opts.dev, lang);
  const headCss = `<style id="deck-base">\n${fonts.css}${kcss}\n${theme.css}\n${read(KIT, 'base.css')}\n${read(KIT, 'layouts.css')}\n${isJapanese(lang) ? '' : read(KIT, 'latin.css')}</style>`;
  if (/<head[^>]*>/.test(html)) {
    // 原稿の <style> が後に来るように、<head> の直後に入れる
    html = html.replace(/<head[^>]*>/, (m) => m + '\n' + headCss);
  } else throw new Error('<head> がない');
  if (!/id="bar"/.test(html)) html = html.replace(/<\/body>/, '<div id="bar"></div><div id="jump"></div>\n</body>');
  const scripts = [
    j('deck-narration', narration), j('deck-marks', marks), j('deck-audio', audio), j('deck-timing', timing),
    j('deck-meta', { version: VERSION }),
    needKatexJs ? `<script>${read(path.dirname(require.resolve('katex')), 'katex.min.js')}\nkatex.__macros=${JSON.stringify(macros)};</script>` : '',
    `<script>\n${read(KIT, 'deck.js')}\n</script>`,
    `<script>\n${read(KIT, 'presenter.js')}\n</script>`,
    `<script>\n${read(KIT, 'tools.js')}\n</script>`,
    compJs ? `<script>${compJs}\n</script>` : '',
  ].join('\n');
  // 原稿の中の <script>（部品の定義など）より前に実行系を置く：最初の <script> の前、なければ </body> の前
  const bodyClose = html.lastIndexOf('</body>');
  // 部品の子の JSON（<script type="application/json">）は飛ばす。その中に実行系が入ると部品のデータを取り違える
  const bodyAt = html.indexOf('<body'), mScript = html.slice(bodyAt).search(/<script(?![^>]*type="application\/json")/);
  const firstScript = mScript >= 0 ? bodyAt + mScript : -1;
  const at = firstScript >= 0 && firstScript < bodyClose ? firstScript : bodyClose;
  html = html.slice(0, at) + scripts + '\n' + html.slice(at);

  return { html, stats: { math: count, slides: slides.length, components: used, fontFiles: fonts.n, narration: segs.length, audio: Object.keys(audio).length, warn, theme: themeName }, slides, segs };
}
// {mark:ID} の目印（id="ID" か data-mark="ID"）がそのスライドにあるか。効果の名前が正しいか
function checkMarks(html, segs, warn) {
  const starts = [...html.matchAll(/<section\b[^>]*\bdata-key="([^"]*)"/g)].map((m) => ({ key: m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&'), at: m.index }));
  const body = new Map(starts.map((s, n) => [s.key, html.slice(s.at, n + 1 < starts.length ? starts[n + 1].at : html.length)]));
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const s of segs) {
    for (const b of s.bounds) {
      if (b.type !== 'mark') continue;
      const where = `「## ${s.slideKey}」[${s.stepKey}]（narration.md ${s.line} 行目）`;
      if (!MARK_EFFECTS.includes(b.effect)) warn.push(`mark: 効果「${b.effect}」は無い（${MARK_EFFECTS.join(' / ')}）${where}`);
      const sec = body.get(s.slideKey);
      if (sec === undefined) continue;
      const idRe = new RegExp(`\\s(?:id|data-mark)="${esc(escAttr(b.id))}"`);
      if (!idRe.test(sec)) warn.push(`mark: 目印「${b.id}」がスライドに無い（id="${b.id}" か data-mark="${b.id}"、式では \\htmlId{${b.id}}{…}）${where}`);
    }
  }
}
// 埋め込む音声は AAC（64 kbps・モノラル）にする。WAV のままだと 5 分で 30 MB を超える。結果はキャッシュする
function compressAudio(file) {
  if (!/\.wav$/i.test(file)) return file;
  const out = path.join(os.tmpdir(), 'motion-slides-audio', short(fs.readFileSync(file).toString('base64')) + '.m4a');
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c:a', 'aac', '-b:a', '64k', '-ac', '1', out]);
  if (r.status === 0) return out;
  compressAudio.failed = true;   // ffmpeg がない：WAV のまま埋め込む（大きくなる）
  return file;
}
function read(dir, f) { return fs.readFileSync(path.join(dir, f), 'utf8'); }
let _kcss = null;
function katexCss() {
  if (_kcss) return _kcss;
  const kdir = path.dirname(require.resolve('katex'));
  let css = read(kdir, 'katex.min.css');
  css = css.replace(/src:url\(fonts\/([^)]+?)\.woff2\) format\("woff2"\)[^;}]*/g, (_, f) =>
    `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(kdir, 'fonts', f + '.woff2')).toString('base64')}) format("woff2")`);
  if (/url\(fonts\//.test(css)) throw new Error('unreplaced font url');
  return (_kcss = css);
}
export function defaultOut(srcPath) {
  const p = path.parse(path.resolve(srcPath));
  return path.join(p.dir, 'out', p.name + '.html');
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opts = {}; let src = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '-o') opts.out = a[++i];
    else if (a[i] === '--theme') opts.theme = a[++i];
    else if (a[i] === '--dev') opts.dev = true;
    else if (a[i] === '--embed-audio') opts.embedAudio = true;
    else src = a[i];
  }
  if (!src) { console.error('usage: node kit/build.mjs <deck.html> [-o out.html] [--theme name] [--dev] [--embed-audio]'); process.exit(1); }
  const out = opts.out || defaultOut(src);
  const r = build(src, { ...opts, out });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.html);
  const s = r.stats;
  console.log(`slides: ${s.slides}, math: ${s.math}, components: ${s.components.join(' ') || '-'}, font files: ${s.fontFiles}, narration: ${s.narration}, audio: ${s.audio}, theme: ${s.theme}, size: ${(r.html.length / 1024).toFixed(0)} KB -> ${out}`);
  for (const w of s.warn) console.warn('  ⚠ ' + w);
}
