// 原稿（deck.html）を 1 つの HTML に組む本体。Node にもブラウザにも依存しない（純粋な ESM）
//
// 読み書きは呼び出し側が渡す env を通してだけ行う（kit/build.mjs は Node の fs、app/ はフォルダの写し）
//   env.path                       path の関数（Node の node:path、ブラウザでは kit/core/path-posix.mjs）
//   env.KIT, env.ROOT              kit/ とリポジトリの根の場所（env.path の上の場所）
//   env.exists(p) env.isFile(p)    有無とファイルか
//   env.readText(p)                UTF-8 の文字列
//   env.readBase64(p)              中身の base64
//   env.within(p, dir)             p が dir の中にあるか（Node では実体のパスで比べる）
//   env.size(p)                    任意。ファイルのバイト数（読む前に上限に数える。なければ読んだ後・つなぐ前に数える）
//   env.katex                      KaTeX（renderToString）
//   env.katexDir                   katex の dist（katex.min.css・katex.min.js・fonts/）
//   env.fontDir(pkg)               @fontsource の包みの場所（{w}.css と files/）
//   env.version                    デッキに入れる版（DECK.VERSION）
//   env.subset(text, font)         任意。使っている字だけに絞った BIZ UDPゴシック（font が 'mincho' なら BIZ UDP明朝）（{css, n, bytes} か null）
//   env.compressAudio(file)        任意。埋め込む音声を小さくしたファイル（できなければ元のまま）。env.audioFailed() で失敗を知る
// 書式・記法は kit/build.mjs の頭の注釈、約束事は docs/contract.md
import { parse } from 'parse5';
import { short } from './sha1.mjs';
import { applyMetrics, DEFAULT_METRICS } from './theme-metrics.mjs';
import { RUNTIME_FORMAT, FORMAT } from './format.mjs';
import { runtimeAttachTypes } from './attach-content.mjs';
// 実行系に渡す形式の識別子と、再生器が添付を出すか決める §3.8 の型の表（役割 → 拡張子。kit/tools.js）
const RUNTIME_FORMAT_ALL = Object.freeze({ ...RUNTIME_FORMAT, attachTypes: runtimeAttachTypes() });
import { faviconLink, wantsFavicon } from './favicon.mjs';
import { KATEX_RANGES } from './katex-ranges.mjs';
import { readLock, vendorDir, pickVersion, configPins, yankedInfo } from './components-lock.mjs';
import { readThemesLock, themesVendorDir, pickThemeVersion, configThemePins, themeUpdate, themePinnedWarning, excludedFromThemeHash } from './themes-lock.mjs';
import { documentReasons, SCRIPTING } from './code-scan.mjs';
import { NotRegularFileError, ReadOverError, utf8Length } from './bounded-read-core.mjs';
import { normalizeKey, parseNarration, narrationMap, marksMap, MARK_EFFECTS, isSlideId, headingText } from './narration-core.mjs';

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

// 原稿に data-key（常に）と data-src（開発時）を書き足す。挿入は後ろから行い、位置をずらさない
// スライドの鍵（format spec §8.1）：section の id、なければ手書きの data-key、なければ最初の見出しの正規化、なければ s<n>
// 鍵が重なる原稿は正しくない（品質チェックがエラーにする。analyzeSlideIds）が、組めるように、明示の id / data-key が重なれば警告して「#n」を付け、
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
      secs.push({ n, h, explicit: attr(n, 'id') || attr(n, 'data-key') || '' });
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
    // id：section の id（鍵がその id のとき）。heading：見出しの 1 行の文字列（narration.md の新しい節の見出しに使う）
    const id = attr(n, 'id') || null;
    slides.push({ key, id: id && id === key ? id : null, title: h ? inner(src, h) : key, heading: h ? headingText(inner(src, h)) : '', start: loc.startOffset });
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

// ---------------------------------------------------------------- スライドの id と鍵の検査（品質チェック・npm run ids が使う）
// 原稿（deck.html の元の文字列）→ {slides:[{index, id, key, rule, heading, line}], docIds: Map<id, 何か>, problems:[{sev, slide, msg}]}
//   slides[].key は build と同じ規則の鍵（重なっても「#n」を付けない元の鍵）
//   docIds：スライドの section 以外の要素の id 属性と、式の \htmlId{…}（注目の演出の目印）。スライドの id と同じ名前空間
//   problems：id の書式の誤り・鍵の重なり・id とほかの id の衝突（どれも error）
export function analyzeSlideIds(src) {
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const slides = [], docIds = new Map();
  const lineOf = (off) => src.slice(0, off).split('\n').length;
  walk(doc, (n) => {
    if (!n.tagName) return;
    const isSlide = n.tagName === 'section' && hasClass(n, 'slide');
    if (isSlide) {
      const h = findFirst(n, (x) => x.tagName === 'h2' || x.tagName === 'h1');
      const id = attr(n, 'id');
      const off = n.sourceCodeLocation ? n.sourceCodeLocation.startOffset : 0;
      // rule：鍵をどの規則で決めたか（id / data-key / heading / index）。data-key と index（s<n>）は旧来の規則（品質チェックが警告する）
      const dk = attr(n, 'data-key'), hk = h ? normalizeKey(inner(src, h)) : '';
      const rule = id ? 'id' : dk ? 'data-key' : hk ? 'heading' : 'index';
      // headingKey：見出しから作る旧来の鍵（id のあるスライドでも。書き出しが {#id} のない「## 見出し」をそのスライドに結ぶため）
      slides.push({ index: slides.length, id: id === undefined ? null : id, key: id || dk || hk || `s${slides.length + 1}`, rule,
        heading: h ? headingText(inner(src, h)) : '', headingKey: hk, dataKey: dk || null, line: lineOf(off), start: off });
      return;
    }
    const id = attr(n, 'id');
    if (id !== undefined && !docIds.has(id)) docIds.set(id, `<${n.tagName} id="${id}">（${n.sourceCodeLocation ? lineOf(n.sourceCodeLocation.startOffset) : '?'} 行目）`);
  });
  for (const m of src.matchAll(/\\htmlId\s*\{([^{}]*)\}/g)) {
    const id = m[1].trim();
    if (!docIds.has(id)) docIds.set(id, `\\htmlId{${id}}（${lineOf(m.index)} 行目）`);
  }
  const problems = [];
  const byKey = new Map();
  for (const s of slides) {
    const where = `スライド ${s.index + 1}（${s.line} 行目）`;
    if (s.id !== null && !isSlideId(s.id)) problems.push({ sev: 'error', slide: s.index, msg: `slide id: ${where}の id「${s.id}」が規則に合わない（英字で始まり、英数字・_・- が続く 64 字まで）` });
    if (s.id !== null && docIds.has(s.id)) problems.push({ sev: 'error', slide: s.index, msg: `slide id: ${where}の id「${s.id}」がほかの id と重なる：${docIds.get(s.id)}（スライドの id と注目の演出の目印は同じ名前空間）` });
    if (byKey.has(s.key)) {
      const o = byKey.get(s.key);
      problems.push({ sev: 'error', slide: s.index, msg: `slide key: ${where}の鍵「${s.key}」がスライド ${o.index + 1}（${o.line} 行目）と重なる（どちらかの <section> に id を付ける。npm run ids は重なりを直さない）` });
    } else byKey.set(s.key, s);
  }
  return { slides, docIds, problems };
}

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
// 明朝（BIZ UDP明朝）は、デッキが明朝を使うとき（usesMincho）だけ、ゴシックと同じ字を足して埋め込む
export const FONTS = {
  biz: { family: 'BIZ UDPGothic', pkg: '@fontsource/biz-udpgothic' },
  sans3: { family: 'Source Sans 3', pkg: '@fontsource/source-sans-3' },
  mincho: { family: 'BIZ UDPMincho', pkg: '@fontsource/biz-udpmincho' },
};
// 選べる字体の一覧（#133。handoff/fonts-inventory-2026-10-28.md §8.1）：どれも OFL で @fontsource にある。一覧は Studio の側にあり、
// ファイルに入るのは、教材が選んだ字体だけ（テーマの theme.json の fonts、テーマ・スライドの CSS が名指した字体）。使っている字の分割ファイルだけ。
//   group：ja（日本語）・en（英語）・mono（等幅）　weights：太さ（Klee One の太字は 600）　italic：斜体もある（英語の字体は斜体も入れる）
// 既定の 3 つ（BIZ UDPゴシック・Source Sans 3・BIZ UDP明朝）はこれまでどおり上の FONTS の決まりで入る（明朝は使うときだけ）。
// 一覧にない字体を CSS が名指してもよいが、ファイルには入らない（開く端末にあればその字体。品質チェックが fontNotEmbedded で知らせる）
export const FONT_LIST = Object.freeze([
  { family: 'BIZ UDPGothic', pkg: '@fontsource/biz-udpgothic', group: 'ja', weights: [400, 700], default: true },
  { family: 'BIZ UDPMincho', pkg: '@fontsource/biz-udpmincho', group: 'ja', weights: [400, 700] },
  { family: 'Shippori Mincho', pkg: '@fontsource/shippori-mincho', group: 'ja', weights: [400, 700] },
  { family: 'Zen Maru Gothic', pkg: '@fontsource/zen-maru-gothic', group: 'ja', weights: [400, 700] },
  { family: 'Klee One', pkg: '@fontsource/klee-one', group: 'ja', weights: [400, 600] },
  { family: 'Source Sans 3', pkg: '@fontsource/source-sans-3', group: 'en', weights: [400, 700], italic: true, default: true },
  { family: 'Source Serif 4', pkg: '@fontsource/source-serif-4', group: 'en', weights: [400, 700], italic: true },
  { family: 'Andika', pkg: '@fontsource/andika', group: 'en', weights: [400, 700], italic: true },
  { family: 'Atkinson Hyperlegible Next', pkg: '@fontsource/atkinson-hyperlegible-next', group: 'en', weights: [400, 700], italic: true },
  { family: 'Source Code Pro', pkg: '@fontsource/source-code-pro', group: 'mono', weights: [400, 700] },
].map((f) => Object.freeze(f)));
export const fontByFamily = (name) => FONT_LIST.find((f) => f.family.toLowerCase() === String(name || '').trim().replace(/^["']|["']$/g, '').toLowerCase()) || null;
// 教材が選んだ一覧の字体（既定の 3 つは除く）：テーマの theme.json の fonts（{body, heading} の字体の名前）と、テーマ・スライドの CSS に名前が出てくるもの
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function chosenFonts(css, cfgFonts) {
  const out = new Set();
  const named = cfgFonts && typeof cfgFonts === 'object' ? Object.values(cfgFonts) : [];
  for (const n of named) { const f = fontByFamily(n); if (f) out.add(f); }
  const c = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const f of FONT_LIST) if (new RegExp(`(^|[\\s,:"'])${reEsc(f.family)}(?=$|[\\s,;"'!}])`, 'i').test(c)) out.add(f);
  return [...out].filter((f) => f.family !== FONTS.biz.family && f.family !== FONTS.sans3.family && f.family !== FONTS.mincho.family);
}
// テーマの本文の字体（一覧のもの）：theme.json の fonts.body か、テーマの CSS の最後の --font-sans の最初の名前
export function bodyFont(themeCss, cfgFonts) {
  if (cfgFonts && typeof cfgFonts === 'object' && cfgFonts.body) return fontByFamily(cfgFonts.body);
  const all = [...String(themeCss || '').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--font-sans\s*:\s*([^;}]+)/g)];
  return all.length ? fontByFamily(all[all.length - 1][1].split(',')[0]) : null;
}
// スライドの CSS（<style> の中と style="" の値）。一覧の字体を名指しているかを見る
export function deckCss(html) {
  const h = String(html).replace(/data:[^"')\s]+/g, '');
  return [...h.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + '\n' +
    [...h.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2]).join(';\n');
}
// 斜体で出す字（英語の斜体 Source Sans 3 の 400i・700i を、使うときだけ・使う字の分割ファイルだけ入れるため）：
//   <em>・<i>・<cite>・<dfn>・<var>・<address> と style の font-style:italic|oblique の中の字。太字の中（<b>・<strong>・h1〜h6・<th>・class の concl・sub・b、
//   style の font-weight:bold|600〜900）なら w700、ほかは w400。スライドの <style> が font-style:italic を書いていれば、本文の字は全部 w400 に数える（規則の当たる先は見ない）。
//   部品の JS が italic を書いている行の文字列の字も w400 に数える（数式の記号 class "mi" は除く）。latin：ラテン文字（U+024F まで）だけにする（日本語の教材）
const ITALIC_TAGS = new Set(['em', 'i', 'cite', 'dfn', 'var', 'address']);
const BOLD_TAGS = new Set(['b', 'strong', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'th']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
export function italicText(html, compJs = '', latin = false) {
  const h = String(html).replace(/data:[^"')\s]+/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const body = h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const w = { 400: '', 700: '' };
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g)) {
    if (m[4] !== undefined) { const top = stack[stack.length - 1]; if (top && top.it) w[top.bold ? 700 : 400] += decodeEntities(m[4]); continue; }
    const name = m[2].toLowerCase(), attrs = m[3] || '';
    if (m[1]) { const k = stack.map((x) => x.name).lastIndexOf(name); if (k >= 0) stack.length = k; continue; }
    if (VOID_TAGS.has(name) || /\/\s*$/.test(attrs)) continue;
    const st = (attrs.match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || []).slice(1).join('');
    const cls = (attrs.match(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || []).slice(1).join('');
    const top = stack[stack.length - 1] || { it: false, bold: false };
    const it = /font-style\s*:\s*normal/i.test(st) ? false : top.it || ITALIC_TAGS.has(name) || /font-style\s*:\s*(italic|oblique)/i.test(st);
    const bold = /font-weight\s*:\s*(normal|[1-5]00)\b/i.test(st) ? false : top.bold || BOLD_TAGS.has(name) || /(^|\s)(concl|sub|b)(\s|$)/.test(cls) || /font-weight\s*:\s*(bold|[6-9]00)\b/i.test(st);
    stack.push({ name, it, bold });
  }
  const sheet = [...h.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((x) => x[1]).join('\n');
  if (/font-style\s*:\s*(italic|oblique)/i.test(sheet)) w[400] += decodeEntities(body.replace(/<[^>]*>/g, ''));
  // 部品の数式の記号（class "mi"、KaTeX_Math で出す。DECK.mtext）の italic は数えない
  // 斜体を書いている行の文字列だけを数える
  for (const l of String(compJs).split('\n')) if (/italic|oblique/.test(l) && !/["'\s]mi["'\s]|KaTeX/.test(l)) w[400] += unescapeJs(jsLiterals(l));
  const keep = (t) => [...new Set(t)].filter((c) => c.trim() && (!latin || c.codePointAt(0) <= LATIN_MAX)).join('');
  const out = { 400: keep(w[400]), 700: keep(w[700]) };
  if (latin) for (const k of [400, 700]) if (!/[A-Za-z]/.test(out[k])) out[k] = '';
  return out;
}
// デッキが明朝を使うか：原稿（取り込みの後）・テーマの CSS・使っている部品の JS のどれかが var(--font-mincho) か "BIZ UDPMincho" を書いている、
// <html data-font="mincho">、class に mincho がある。kit の CSS（--font-mincho の定義と .mincho の規則）は数えない
export function usesMincho(html, themeCss = '', compJs = '') {
  const h = String(html).replace(/data:[^"')\s]+/g, '');
  const ref = /var\(\s*--font-mincho\s*\)|BIZ UDPMincho/;
  return ref.test(h) || ref.test(themeCss) || ref.test(compJs) || /<html\b[^>]*\sdata-font\s*=\s*["']?mincho\b/i.test(h) ||
    /\sclass\s*=\s*["'][^"']*\bmincho\b/i.test(h);
}
export const isJapanese = (lang) => !lang || /^ja\b/i.test(lang);
// 英語などのデッキで、BIZ UDPゴシックに任せる字（Source Sans 3 が持つラテン文字・記号の大部分より後ろ）
export const LATIN_MAX = 0x24f;
// 字の分割ファイルの一覧：{w, family, file, range}（file は env.path の上の場所）
// italic：斜体の分割ファイル（@fontsource の {w}-italic.css。font-style:italic で書く）
export function fontFaces(env, font, weights = font.weights || [400, 700], italic = false) {
  const P = env.path;
  const dir = env.fontDir(font.pkg);
  const faces = [];
  for (const w of weights) {
    const css = env.readText(P.join(dir, `${w}${italic ? '-italic' : ''}.css`));
    for (const block of css.match(/@font-face\s*\{[^}]*\}/g) || []) {
      const url = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
      const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
      if (!url) continue;
      faces.push({ w, family: font.family, file: P.join(dir, 'files', url), range: parseRange(range || 'U+0-10FFFF'), ...(italic ? { style: 'italic' } : {}) });
    }
  }
  return faces;
}
export function parseRange(s) {
  return s.split(',').map((p) => {
    const [a, b] = p.trim().replace(/^U\+/i, '').split('-');
    if (a.includes('?')) return [parseInt(a.replace(/\?/g, '0'), 16), parseInt(a.replace(/\?/g, 'F'), 16)];
    return [parseInt(a, 16), parseInt(b || a, 16)];
  });
}
// 字の絞り込みに使う字を集める。HTML の文字参照・JSON や JS の \\u エスケープをほどき、
// 実行時や部品が作る字（数字・ASCII・「付録」「Appendix」など）と、部品・実行系の JS の文字列も入れる
const RUNTIME_GLYPHS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
  'Appendix–—…“”‘’';
const RUNTIME_GLYPHS_JA = '付録「」『』（）、。・：；！？　';
// 和文の字（英語などのデッキでは、部品の JS の文字列にある和文（説明文など）は数えない）
const CJK = /[　-鿿豈-﫿＀-￯]/gu;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', times: '×', middot: '·', copy: '©', reg: '®', deg: '°', minus: '−', larr: '←', rarr: '→', uarr: '↑', darr: '↓', le: '≤', ge: '≥', ne: '≠', plusmn: '±', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', thinsp: ' ', ensp: ' ', emsp: ' ' };
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
function rangeCss(env, fonts, text, italic = false) {
  const used = new Set();
  for (const ch of text) used.add(ch.codePointAt(0));
  const hit = (r) => { for (const [a, b] of r) for (const c of used) if (c >= a && c <= b) return true; return false; };
  let css = '', n = 0, bytes = 0;
  for (const f of fonts.flatMap((x) => fontFaces(env, x, x.weights || [400, 700], italic))) {
    if (!hit(f.range)) continue;
    const b64 = env.readBase64(f.file);
    bytes += b64.length; n++;
    css += fontFaceCss(f, b64);
  }
  return { css, n, bytes };
}
// 分割ファイル 1 つの @font-face（f：fontFaces の要素、b64：woff2 の base64）。段 A の編集の字の補い（kit/core/tier-a.mjs）も同じ形で書く
// f.style は任意（既定は normal。段 A の字の補いが、埋め込んである字と同じ font-style で書くため）
export function fontFaceCss(f, b64) {
  return `@font-face{font-family:"${f.family}";font-style:${f.style || 'normal'};font-display:block;font-weight:${f.w};src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${unicodeRange(f.range)}}\n`;
}
// [[a, b], …] → unicode-range の値（U+61-7a,U+3042）
export const unicodeRange = (range) => range.map(([a, b]) => a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`).join(',');
// 字の集まり → 続いた範囲 [[a, b], …]（小さい順）
export function rangesOf(chars) {
  const cps = [...new Set([...chars].map((c) => c.codePointAt(0)))].sort((a, b) => a - b), out = [];
  for (const c of cps) { const last = out[out.length - 1]; if (last && c === last[1] + 1) last[1] = c; else out.push([c, c]); }
  return out;
}
// 字の包みが env にあるか（編集アプリの 1 ファイル版は明朝を持たない）
const hasFont = (env, font, italic = false) => { try { return env.exists(env.path.join(env.fontDir(font.pkg), `400${italic ? '-italic' : ''}.css`)); } catch { return false; } };
// mincho：明朝も埋め込む（usesMincho）。warn：明朝の字がないときに知らせる
// more：{chosen：一覧から選んだ字体（chosenFonts）、italic：斜体で出す字 {400, 700}（italicText）、body：テーマの本文の字体（bodyFont）}
function fontCss(env, text, subset, lang, mincho = false, warn = [], more = {}) {
  const add = (a, b) => ({ css: a.css + b.css, n: a.n + b.n, bytes: a.bytes + b.bytes });
  // 本文の日本語の字体を一覧から選んだテーマ（浅葱の Zen Maru Gothic など。more.body）：BIZ UDPゴシックは、その字体が持たない字だけ（同じ字を 2 度入れない）
  const body = more.body && more.body.group === 'ja' && hasFont(env, more.body) && (more.chosen || []).includes(more.body) ? more.body : null;
  let gtext = text;
  if (body && isJapanese(lang)) {
    const rs = fontFaces(env, body, [body.weights[0]]).flatMap((f) => f.range);
    gtext = [...new Set(text)].filter((c) => { const cp = c.codePointAt(0); return !rs.some(([lo, hi]) => cp >= lo && cp <= hi); }).join('');
  }
  let g = fontCssGothic(env, gtext, subset, lang);
  // 英語の斜体（Source Sans 3 の 400i・700i）：斜体で出す字（italicText）があるときだけ、その太さの、その字を含む分割ファイルだけ。
  // 日本語の教材は強調の中のラテン文字だけで、強調の中のラテン文字をこの斜体で出す
  if (more.italic && hasFont(env, FONTS.sans3, true)) {
    let it = { css: '', n: 0, bytes: 0 };
    for (const wt of [400, 700]) if (more.italic[wt]) it = add(it, rangeCss(env, [{ ...FONTS.sans3, weights: [wt] }], more.italic[wt], true));
    if (it.n) g = add(g, isJapanese(lang) ? { ...it, css: it.css + `:is(em,i,cite){font-family:"${FONTS.sans3.family}",var(--font-sans)}\n` } : it);
  }
  for (const f of more.chosen || []) {
    if (!hasFont(env, f)) { warn.push(`字体「${f.family}」の字がないので埋め込まない（開く端末の字体で出る）。npm ci`); continue; }
    g = add(g, rangeCss(env, [f], text));
    if (f.italic) g = add(g, rangeCss(env, [f], text, true));
  }
  if (!mincho) return g;
  // 明朝は和文（ラテン文字より後ろ）のための字。英語などのデッキでは Source Sans 3 が持たない字だけ
  const t = isJapanese(lang) ? text : [...new Set(text)].filter((c) => c.codePointAt(0) > LATIN_MAX).join('');
  if (!t) return g;
  const m = (subset && env.subset ? env.subset(t, 'mincho') : null) || (hasFont(env, FONTS.mincho) ? rangeCss(env, [FONTS.mincho], t) : null);
  if (!m) { warn.push('明朝（BIZ UDP明朝）の字がないので埋め込まない（開く端末の明朝で表示されます）。node tools/get-fonts.mjs か npm ci'); return g; }
  return add(g, m);
}
function fontCssGothic(env, text, subset, lang) {
  const sub = (t) => (subset && env.subset ? env.subset(t) : null);
  if (isJapanese(lang)) {
    const r = sub(text); if (r) return r;
    return rangeCss(env, [FONTS.biz], text);
  }
  // 英語など：ラテン文字は Source Sans 3、それより後ろの字（和文・矢印など）だけを BIZ UDPゴシックで
  const latin = rangeCss(env, [FONTS.sans3], text);
  // Source Sans 3 の分割ファイルが持たない字だけを BIZ UDPゴシックに回す（引用符・ダッシュなどは Source Sans 3 で出す）
  const sansRanges = fontFaces(env, FONTS.sans3).flatMap((f) => f.range);
  const inSans = (c) => sansRanges.some(([lo, hi]) => c >= lo && c <= hi);
  const rest = [...new Set(text)].filter((c) => { const cp = c.codePointAt(0); return cp > LATIN_MAX && !inSans(cp); }).join('');
  let biz = { css: '', n: 0, bytes: 0 };
  if (rest) biz = sub(rest) || rangeCss(env, [FONTS.biz], rest);
  // 本文の字の差し替えと字間・行間は kit/latin.css（テーマの後に置く）
  return { css: latin.css + biz.css, n: latin.n + biz.n, bytes: latin.bytes + biz.bytes };
}

// ---------------------------------------------------------------- テーマ
// テーマのファイル（theme.json・tokens.css・ロゴ）と親のテーマ（extends、何段でも）は、読む前に許した根（authorized root）の中にあるかを
// 確かめる（env.within は Node では実体のパスで比べるので、外を指すシンボリックリンクは外に数える。format spec §11）。根は
//   原稿のフォルダのテーマ：原稿のフォルダ　　部品庫のテーマ（リポジトリの themes/）：themes/　　--theme で呼び出した人が選んだ外の場所：そのテーマのフォルダ
//   利用者のテーマのフォルダ（env.themeDirs：EGATARI_THEMES・~/.egatari/themes。kit/theme-dirs.mjs が実体のパスにしたもの）：そのフォルダ
// 探す順は 原稿のフォルダ → その themes/ → 利用者のテーマのフォルダ（並びの順）→ 同梱の themes/
// 親のテーマはその根か利用者のテーマのフォルダか themes/ の中だけを探す（根は継承の間ずっと運ぶ。原稿のフォルダのテーマの extends で外へ出ない）
// 返すもの：{dir, root}。root === null は呼び出した人が選んだもの（--theme）。外に出るものしかなければ null（warn に知らせる）。
// どこにもなければ null と見つからない知らせ（missing の配列に名前を入れる）。missing を渡さなければ投げる
function resolveTheme(env, name, baseDir, root, warn, ud = [], missing = null) {
  const P = env.path, reg = P.join(env.ROOT, 'themes');
  const cands = [P.resolve(baseDir, name), P.join(baseDir, 'themes', name), ...ud.map((u) => P.join(u, name)), P.join(reg, name)];
  let refused = false;
  for (const d of cands) {
    const tok = P.join(d, 'tokens.css');
    if (!env.exists(tok)) continue;
    const ok = (r) => env.within(d, r) && env.within(tok, r);
    const r = ok(reg) ? reg : root && ok(root) ? root : ud.find(ok) || (root === null ? (env.within(tok, d) ? d : null) : null);
    if (!r) { refused = true; continue; }
    return { dir: d, root: r };
  }
  if (refused) { warn.push(`refused: テーマ「${name}」は許した場所（作業フォルダ・利用者のテーマのフォルダ・themes/）の外にある（シンボリックリンクなど。読まない）`); return null; }
  if (missing) { missing.push(name); return null; }
  throw new Error(`theme not found: ${name}`);
}
// 見つからないテーマの知らせ（原稿の data-theme・extends）：既定のテーマで組む。env.themeDirs がなければ利用者のテーマのフォルダを読めない。
// 編集アプリ（env.app）は、選んだテーマのフォルダ・自分のテーマ（env.themeDirs が空でない）か、どちらもない（空。「テーマを読み込む…」で読み込める）かで言い分ける
function missingThemeWarning(env, name, used) {
  const ud = Array.isArray(env.themeDirs) && env.themeDirs.length > 0;
  const where = env.app ? (ud ? `選んだテーマのフォルダに ${name}/ を置くか、` : '編集アプリでは「テーマを読み込む…」で ZIP ファイルか自分のテーマのフォルダ（~/.egatari/themes など）から読み込むか、')
    : env.themeDirs ? 'EGATARI_THEMES・~/.egatari/themes に置くか、' : '編集アプリは利用者のテーマのフォルダ（EGATARI_THEMES・~/.egatari/themes）を読めないので、';
  return `theme not found: "${name}" — テーマ「${name}」が見つからないので ${used} で組む（探した場所：作業フォルダ、その themes/、利用者のテーマのフォルダ、同梱の themes/）。${where}作業フォルダの themes/${name}/ に置く`;
}
// 同梱のテーマの版の固定（themes.lock.json。kit/core/themes-lock.mjs）：教材が記録した前の版（作業フォルダの設定のファイルの themes、
// 組み直す文書の索引から opts.themeVersions）なら、同梱の themes/<名前>/ の代わりにその版の写し vendor/themes/<名前>/<版>/ で組む。
// 黙って新しい色にしない（部品庫の部品の版の固定と同じ。format spec §7.2 段 B）。知らせ（warn）と stats.themePinned（変わる色）を残す。
// 同梱のテーマ（themes/<名前>/ に結んだもの）だけ。原稿のフォルダ・利用者のテーマのフォルダのテーマは版を持たない
function pinTheme(env, sel, name, tctx, warn) {
  if (!sel || !tctx || !tctx.lock) return sel;
  const P = env.path, reg = P.join(env.ROOT, 'themes');
  if (P.resolve(sel.dir) !== P.join(reg, name)) return sel;
  const pick = pickThemeVersion(tctx.lock, name, Object.prototype.hasOwnProperty.call(tctx.pins, name) ? tctx.pins[name] : undefined);
  if (pick.note && !tctx.noted.has(name)) { tctx.noted.add(name); warn.push(pick.note); }
  if (!pick.version) return sel;
  tctx.versions[name] = pick.version;
  if (!pick.pinned) return sel;
  const vroot = themesVendorDir(P, env.ROOT), vdir = P.join(vroot, name, pick.version);
  if (!env.exists(P.join(vdir, 'tokens.css')) || !env.within(P.join(vdir, 'tokens.css'), vroot)) {
    warn.push(`theme ${name}: version ${pick.version} is in themes.lock.json but not in vendor/themes; using ${tctx.lock.themes[name].current}`);
    tctx.versions[name] = tctx.lock.themes[name].current;
    return sel;
  }
  if (!tctx.pinned.some((u) => u.name === name)) {
    const u = themeUpdate(tctx.lock, name, pick.version);
    tctx.pinned.push(u);
    warn.push(themePinnedWarning(u));
  }
  return { dir: vdir, root: vroot };
}
function themeAssets(env, t, warn, depth = 0, ud = [], tctx = null) {
  const P = env.path, { dir, root } = t;
  if (depth > 16) throw new Error(`theme: extends is nested too deeply (${dir})`);
  if (tctx && !tctx.dirs.includes(dir)) tctx.dirs.push(dir);
  const inRoot = (f) => env.within(f, root) && env.within(f, dir);
  const cfgPath = P.join(dir, 'theme.json');
  let cfg = {};
  if (env.exists(cfgPath)) {
    if (inRoot(cfgPath)) cfg = JSON.parse(env.readText(cfgPath));
    else warn.push(`refused: テーマの theme.json（${P.basename(dir)}）が許した場所の外を指している（読まない）`);
  }
  // "extends" なら、親の tokens.css を先に置き、差分だけを上書きする。logos を書かなければ親のロゴを使う（"logos": [] で消せる）
  // 親はこのテーマの根の中か利用者のテーマのフォルダか themes/ の中だけ（呼び出した人が選んだテーマなら、そのフォルダの中か利用者のテーマのフォルダか themes/）
  const miss = [];
  const pt = cfg.extends ? pinTheme(env, resolveTheme(env, String(cfg.extends), P.dirname(dir), root, warn, ud, miss), String(cfg.extends), tctx, warn) : null;
  if (miss.length) warn.push(missingThemeWarning(env, miss[0], `「${P.basename(dir)}」（親のテーマなし）`));
  const par = pt ? themeAssets(env, pt, warn, depth + 1, ud, tctx) : null;
  const logos = cfg.logos ? cfg.logos.filter((f) => {
    // 文書（README*・LICENSE*・*.md）はロゴにしない（テーマの一部でない。読まない）
    if (excludedFromThemeHash(f)) { warn.push(`theme: 「${f}」は文書（README・LICENSE・.md）なのでロゴにしない（読まない）`); return false; }
    const p = P.join(dir, String(f));
    if (!env.exists(p)) return false;
    if (inRoot(p)) return true;
    warn.push(`refused: テーマのロゴ「${f}」が許した場所の外にある（読まない）`);
    return false;
  }).map((f) => dataUri(env, P.join(dir, String(f)))) : (par ? par.logos : []);
  // 寸法の宣言（metrics。kit/core/theme-metrics.mjs）：親の値に項目ごとに重ねる。読めない値は警告して親の値（誤りにしない）
  const mr = applyMetrics(par ? par.metrics : DEFAULT_METRICS, Object.prototype.hasOwnProperty.call(cfg, 'metrics') ? cfg.metrics : undefined, P.basename(dir));
  for (const x of mr.warnings) warn.push(x);
  const metrics = mr.metrics, declared = mr.declared || !!(par && par.declared);
  const tok = P.join(dir, 'tokens.css');
  // resolveTheme が確かめたが、読む直前にもう一度（同じ根で）
  if (!inRoot(tok)) { warn.push(`refused: テーマの tokens.css（${P.basename(dir)}）が許した場所の外を指している（読まない）`); return { css: par ? par.css : '', logos, cfg, metrics, declared }; }
  return { css: (par ? par.css + '\n' : '') + env.readText(tok), logos, cfg, metrics, declared };
}
export const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', css: 'text/css', js: 'text/javascript', json: 'application/json', vtt: 'text/vtt' };
function dataUri(env, file) {
  const ext = env.path.extname(file).slice(1).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  return `data:${mime};base64,${env.readBase64(file)}`;
}

// ---------------------------------------------------------------- ローカルのファイルの埋め込み
// <img src> <source src/srcset> <video src/poster> <audio src> <track src> <image href>（SVG）<link rel="stylesheet|icon">
// <script src> と、<style> と style="" の中の url(…) / @import を data: URI か中身そのものにする。
// http(s) の参照はそのまま残して警告する（オフラインでは表示されない）。原稿のフォルダの外のファイルは読まない
const SKIP_REF = /^(?:data:|blob:|#|about:|javascript:|mailto:)/i;
const EXT_REF = /^(?:https?:)?\/\//i;
export function bundleAssets(env, html, deckDir, warn = [], budget = null) {
  const P = env.path;
  // 埋め込むたびに増える大きさと回数を数える（同じファイルの参照・@import の繰り返しで膨らませない）。読むたびに回数と読んだ大きさも（chargedEnv）
  const bud = budget || buildBudget({}, html.length);
  env = chargedEnv(env, bud);
  const grow = (t) => { bud.add(t.length, bud.L.bundledChars, 'bundled document'); return t; };
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
    const file = P.resolve(baseDir, rel);
    if (!env.exists(file) || !env.isFile(file)) { once(`missing: ${what} の「${r}」が見つからない`); return null; }
    if (!env.within(file, deckDir)) { once(`refused: ${what} の「${r}」は作業フォルダの外にある（埋め込まない）`); return null; }
    return file;
  };
  const uri = (ref, baseDir, what) => { const f = local(ref, baseDir, what); return f ? grow(dataUri(env, f)) : null; };
  const css = (text, baseDir, depth = 0) => text
    .replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?\s*([^;]*);/g, (m, q, ref) => {
      const f = depth < 8 && local(ref, baseDir, '@import');
      return f ? css(grow(env.readText(f)), P.dirname(f), depth + 1) : m;
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
        return f ? `<style>\n${css(grow(env.readText(f)), P.dirname(f)).replace(/<\/style/gi, '<\\/style')}\n</style>` : tag;
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
      if (f) parts[i] = open.replace(src[0], '') + grow(env.readText(f)).replace(/<\/script/gi, '<\\/script') + '</script>';
    }
  }
  return parts.join('');
}

// ---------------------------------------------------------------- 上限（format spec §11：確保の前・解析の前に大きさを確かめる）
// 組み立ては原稿を何倍にも膨らませうる（同じ小さなファイルを何万回も取り込む・@import や画像の参照を繰り返す・式を何万も書く）。
// 前処理（INCLUDE・JSON・FIG）と埋め込みの途中で、増えた大きさと取り込みの回数を数え、超えたらその場で断る（全部を作ってから数えない）。
// 解析（parse5）の前にもタグの数を数える。opts.limits で変えられる。既定は実際のデッキ（examples/tmlr2026-calibration：原稿 11 KB・
// 取り込み数個・式 27・タグ 3400）の 100 倍以上
export const BUILD_LIMITS = Object.freeze({
  sourceChars: 32 * 1048576,     // 原稿（deck.html）の文字数
  includes: 10000,               // 組み立てがファイルを読む回数の合計（INCLUDE・JSON・FIG・埋め込み（data: URI・<link>・<script src>・@import）・
                                 // テーマ（theme.json・tokens.css・ロゴ・親のテーマ）・部品・口述原稿・音声・字・実行系）
  expandedChars: 64 * 1048576,   // 前処理（INCLUDE・JSON・FIG）の後の文字数
  bundledChars: 256 * 1048576,   // 埋め込みと式の後の文字数（画像・動画の data: URI を含む）。組んだ出力の全体（字・テーマ・実行系・部品を入れた後）も
  readChars: 256 * 1048576,      // 組み立てが読むファイルの大きさの合計（原稿・取り込み・埋め込み・テーマと親のテーマ・ロゴ・部品・音声・字・実行系。
                                 // 文字で読むものはバイト数、base64 で読むものは base64 の字数。env.size があれば読む前に数える）
  tags: 500000,                  // 解析する文書のタグ（「<」と英字・/・!）の数（原稿と、組んだデッキの部分）
  math: 20000,                   // 式の数
});
export class BuildLimitError extends Error {
  constructor(what, n, max) { super(`build: ${what} (${n}) is over the limit (${max}); refusing to build`); this.name = 'BuildLimitError'; this.code = 'build-too-large'; this.what = what; }
}
const countTags = (t, max) => { let n = 0; const re = /<[A-Za-z!/?]/g; while (re.exec(t)) if (++n > max) break; return n; };
// 数え方（本体・bundleAssets・chargedEnv が共有する。組み立て 1 回に 1 つ）：
//   read(n)   ファイルを 1 回読む（回数を数え、n を読んだ大きさの合計に足す）。読む前に（大きさが分かれば）呼ぶ
//   charge(n) 読んだ大きさの合計に n を足す（回数は数えない）
//   add(n)    文書が n 字増える（前処理・埋め込み・ロゴ）。つなぐ前に呼ぶ
export function buildBudget(limits = {}, start = 0) {
  const L = { ...BUILD_LIMITS, ...(limits || {}) };
  let used = start, count = 0, input = 0;
  const charge = (n) => { input += n; if (input > L.readChars) throw new BuildLimitError('files read', input, L.readChars); };
  return {
    L,
    read(n = 0) {
      if (++count > L.includes) throw new BuildLimitError('includes and embeds', count, L.includes);
      charge(n);
    },
    charge,
    add(n, max = L.expandedChars, what = 'expanded source') {
      used += n;
      if (used > max) throw new BuildLimitError(what, used, max);
    },
    get used() { return used; },
    get count() { return count; },
    get input() { return input; },
    reset(n) { used = n; },
  };
}
// 通常のファイルでないもの（NotRegularFileError）・許された大きさを超えた読み取り（ReadOverError。env の読み取りが投げる。n は超えたと分かった
// 大きさ。chargedEnv が上限か「変わった」の知らせに替える）は、上限つきの読み取りの共通の部分（kit/core/bounded-read-core.mjs）のもの
export { NotRegularFileError, ReadOverError };
// 大きさを読んだ後に、ファイルが大きくなった（読む前の大きさより多く読めた）
export class FileChangedError extends Error {
  constructor(p, was, now) { super(`build: ${p} changed while reading (${was} bytes before, ${now} read); refusing to build`); this.name = 'FileChangedError'; this.code = 'build-too-large'; this.what = 'changed file'; }
}
// env の読み取り（readText・readBase64・readBytes）のたびに bud.read で数える。env.size(p) があれば読む前に（大きすぎるものは読まずに断る）、
// 読んだ後にも実際の大きさで数え直す（数えるのは max(読む前の大きさ, 実際の大きさ)。env.size は見積もりで、嘘をつくことも、読むまでに
// ファイルが大きくなることもある）。読む前の大きさより多く読めたら、上限の内でも断る（FileChangedError）。
// 読み取りには、読んでよい大きさ（バイト。大きさが分かればそれ、分からなければ残りの上限）を 2 つ目の引数で渡す：Node の env はそれを超えて
// 読まない（ReadOverError）。env.size が NotRegularFileError を投げたら（FIFO など）読まずに断る。同じ bud で包んだ env はそのまま返す。
// 大きさはいつもバイト数：文字で読むものは、env.readTextBytes(p, max) → {text, bytes}（読んだバイト数を返す。Node と編集アプリ）があればそれ、
// なければ readText の文字列の UTF-8 のバイト数で数える（UTF-16 の字数を大きさにしない）。
// env.compressAudio(p, max)（Node：env の外で元のファイルを読んで圧縮する）は、読む前に数え、数えた大きさを max として渡す（それを超えて
// 読まない。返す {path, read} の read（実際に読んだバイト）でも数え直す）
const CHARGED = Symbol('charged');
export function chargedEnv(env, bud) {
  if (env[CHARGED] === bud) return env;
  const sizeOf = (p) => {
    if (typeof env.size !== 'function') return null;
    let n; try { n = env.size(p); } catch (e) { if (e && e.code === 'build-not-a-file') throw e; return null; }
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const room = () => Math.max(0, bud.L.readChars - bud.input);
  // kind：'text'（実際の大きさは UTF-8 のバイト数）・'b64'（base64 の字数）・'bytes'。fn(p, max) → {v, len}（len は実際の大きさ）
  const read = (p, kind, fn) => {
    const n = sizeOf(p), b64 = kind === 'b64';
    const est = n === null ? 0 : b64 ? Math.ceil(n / 3) * 4 : n;
    bud.read(est);
    const max = n !== null ? n : b64 ? Math.floor(room() / 4) * 3 : room();
    let r;
    try { r = fn(p, max); } catch (e) {
      if (!e || e.code !== 'read-over') throw e;
      if (n !== null) throw new FileChangedError(p, n, e.n);
      throw new BuildLimitError('files read', bud.input + (b64 ? Math.ceil(e.n / 3) * 4 : e.n), bud.L.readChars);
    }
    const len = r.len;
    if (len > est) { bud.charge(len - est); if (n !== null) throw new FileChangedError(p, n, b64 ? Math.floor(len / 4) * 3 : len); }
    return r.v;
  };
  const text = typeof env.readTextBytes === 'function'
    ? (q, m) => { const r = env.readTextBytes(q, m); return { v: r.text, len: r.bytes }; }
    : (q, m) => { const v = env.readText(q, m); return { v, len: utf8Length(v) }; };
  const w = Object.create(env);
  Object.defineProperty(w, CHARGED, { value: bud });
  w.readText = (p) => read(p, 'text', text);
  w.readTextBytes = (p) => { const t = w.readText(p); return { text: t, bytes: utf8Length(t) }; };
  w.readBase64 = (p) => read(p, 'b64', (q, m) => { const v = env.readBase64(q, m); return { v, len: v.length }; });
  if (typeof env.readBytes === 'function') w.readBytes = (p) => read(p, 'bytes', (q, m) => { const v = env.readBytes(q, m); return { v, len: v.length }; });
  // 圧縮（env の外で元のファイルを読む）：読む前に数え、数えた大きさまでだけ読ませる。通常のファイルでなければ断る
  if (typeof env.compressAudio === 'function') w.compressAudio = (p) => read(p, 'bytes', (q, m) => {
    const r = env.compressAudio(q, m);
    return typeof r === 'string' ? { v: r, len: 0 } : { v: r.path, len: r.read };
  });
  // 字の絞り込み（Node）は env の外で字のファイルを読み、できた CSS を返す：使う前にその大きさを数える
  if (typeof env.subset === 'function') w.subset = (t, font) => { const r = env.subset(t, font); if (r && typeof r.css === 'string') bud.read(utf8Length(r.css)); return r; };
  return w;
}

// ---------------------------------------------------------------- 本体
// KaTeX で許す HTML 拡張：\htmlClass（色）、\htmlId と \htmlData（注目の演出の目印 §7、モーフの対応 §8。docs/contract.md）
const TRUSTED = new Set(['\\htmlClass', '\\htmlId', '\\htmlData']);
// 実行系の <script> に入れる kit/core の ES モジュール（依存なし・export function 1 つ。いまは position.mjs の PositionStore）を、
// 即時関数の中で読み、その関数を DECK.<name> に入れる形にする（窓のグローバルを増やさない）。形が違えば組み立てを止める
// 実行系に入れる kit/core の ES モジュール（kit/ から見た場所 → DECK の名前）。編集アプリ（tools/build-app.mjs）はこれを字として同梱する
export const RUNTIME_MODULES = Object.freeze({ 'core/position.mjs': 'PositionStore', 'core/link-policy.mjs': 'LinkPolicy' });
export function classicModule(src, name) {
  const s = String(src);
  const ex = s.match(/^export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm) || [];
  if (/^\s*import\b/m.test(s) || ex.length !== 1 || (s.match(/^\s*export\b/gm) || []).length !== 1) {
    throw new Error(`runtime module for DECK.${name}: needs exactly one "export function" and no import`);
  }
  const fn = ex[0].replace(/^export\s+function\s+/, '').replace(/\s*\($/, '');
  return `(function(){\n"use strict";\n${s.replace(/^export\s+function\s+/m, 'function ')}\nDECK.${name} = ${fn};\n})();`;
}

// 実行系に入れる kit/core の ES モジュールのうち、export が複数のもの（import なし・export function / export const だけ）。
// 即時関数の中で読み、export したものを DECK.<name> の object に入れる（読み上げで聞く：kit/tools.js が使う。format spec §5.6）
export const RUNTIME_NAMESPACES = Object.freeze({ 'core/tts-normalize.mjs': 'TtsNormalize', 'core/read-aloud.mjs': 'ReadAloud' });
export function classicNamespace(src, name) {
  const s = String(src);
  const names = [...s.matchAll(/^export\s+(?:function|const)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  if (/^\s*import\b/m.test(s) || !names.length || (s.match(/^\s*export\b/gm) || []).length !== names.length) {
    throw new Error(`runtime module for DECK.${name}: needs "export function" / "export const" only, and no import`);
  }
  return `(function(){\n"use strict";\n${s.replace(/^export\s+/gm, '')}\nDECK.${name} = {${names.join(', ')}};\n})();`;
}

export function build(env0, srcPath, opts = {}) {
  const P = env0.path, KIT = env0.KIT, ROOT = env0.ROOT;
  const deckDir = P.dirname(P.resolve(srcPath));
  // 読むものはすべて 1 つの数え方（回数と読んだ大きさの合計）に、読む前に数える（chargedEnv）
  // opts.budget：呼び手（持ち運べる形式の書き出し）と共有する数え方（組み立てと書き出しで 1 つ）
  const budget = opts.budget || buildBudget(opts.limits, 0), LIM = budget.L;
  const env = chargedEnv(env0, budget);
  { let n = null; if (typeof env0.size === 'function') { try { n = env0.size(srcPath); } catch (e) { if (e && e.code === 'build-not-a-file') throw e; } }
    if (Number.isFinite(n) && n > LIM.sourceChars * 4) throw new BuildLimitError('source', n, LIM.sourceChars); }   // UTF-8 は 1 字 4 バイトまで
  const raw = env.readText(srcPath);
  budget.reset(raw.length);
  if (raw.length > LIM.sourceChars) throw new BuildLimitError('source', raw.length, LIM.sourceChars);
  { const n = countTags(raw, LIM.tags); if (n > LIM.tags) throw new BuildLimitError('tags in the source', n, LIM.tags); }
  const warn = [];
  const { html: annotated, slides } = annotate(raw, !!opts.dev, warn);
  let html = annotated;
  // 原稿から読むファイルは、原稿のフォルダ（と kit）の中だけ。シンボリックリンクや ../ で外に出るものは読まない
  const inDeck = (p) => env.within(p, deckDir);

  const missingSeen = new Set();
  const find = (name, dirs) => {
    let outside = false;
    for (const d of dirs) {
      const p = P.join(d, name);
      if (!env.exists(p)) continue;
      if (env.within(p, d === KIT ? KIT : deckDir)) return p;
      outside = true;
    }
    if (outside) { warn.push(`refused: 「${name}」は作業フォルダの外にある（読まない）`); return null; }
    // opts.missingFiles === 'warn'：ないファイルは知らせて空のまま組む（編集アプリのメモリの上の原稿：deck.html だけを開いたときなど。
    // 既定（コマンド・フォルダ）は今までどおり断る）
    if (opts.missingFiles === 'warn') { if (!missingSeen.has(name)) { missingSeen.add(name); warn.push(`missing: 「${name}」が作業フォルダにない（空のまま組んだ）`); } return null; }
    throw new Error('not found: ' + name);
  };
  // 取り込むたびに、回数と読んだ大きさ（読む前に。env を通して）と増える大きさ（置き換える前に）を数える（同じ小さなファイルを何万回も取り込ませない）
  const readIn = (name, dirs) => { const p = find(name, dirs); if (p === null) return null; const t = env.readText(p); budget.add(t.length); return t; };
  html = html.replace(/\/\*INCLUDE:([^*]+?)\*\//g, (_, f) => readIn(f.trim(), [deckDir, KIT]) ?? '');
  html = html.replace(/\/\*KATEX_CSS\*\//g, '');
  html = html.replace(/\{\{JSON:([^}]+?)\}\}/g, (_, f) => { const t = readIn(f.trim(), [P.join(deckDir, 'data'), deckDir]); return t === null ? 'null' : JSON.stringify(JSON.parse(t)).replace(/<\//g, '<\\/'); });
  html = html.replace(/\{\{FIG:([\w-]+)\}\}/g, (_, name) => {
    let svg = readIn(name + '.svg', [P.join(deckDir, 'figs'), deckDir]);
    if (svg === null) return '';
    svg = svg.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
    svg = svg.replace(/id="([^"]+)"/g, `id="${name}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${name}-$1)`)
      .replace(/xlink:href="#([^"]+)"/g, `xlink:href="#${name}-$1"`).replace(/\shref="#([^"]+)"/g, ` href="#${name}-$1"`);
    svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1');
    return svg;
  });
  // 原稿が参照するローカルのファイル（画像・動画・CSS・スクリプト）を埋め込み、1 ファイルで完結させる
  if (html.length > LIM.expandedChars) throw new BuildLimitError('expanded source', html.length, LIM.expandedChars);
  budget.reset(html.length);
  html = bundleAssets(env, html, deckDir, warn, budget);

  // テーマ：引数 → <html data-theme> → default
  let themeName = opts.theme || html.match(/<html[^>]*\sdata-theme="([^"]+)"/)?.[1] || 'default';
  // 原稿が選んだテーマの根は原稿のフォルダ（themes/ も）。外へ出るものなら読まずに既定のテーマ（themes/default）にする
  // 利用者のテーマのフォルダ（Node：EGATARI_THEMES・~/.egatari/themes）は 1 回だけ求める。--theme で選んで見つからないものは投げる（今までどおり）
  const ud = Array.isArray(env0.themeDirs) ? env0.themeDirs : [];
  for (const m of ud.missing || []) warn.push(`EGATARI_THEMES: フォルダ「${m}」が見つからない（飛ばす）`);
  const miss = opts.theme ? null : [];
  // 同梱のテーマの版（themes.lock.json）：opts.updateThemes（--update-themes・編集アプリの「テーマを更新」）なら今の版。
  // ほかは 組み直す文書の記録（opts.themeVersions）→ 作業フォルダの設定のファイル（FORMAT.CONFIG_FILE）の themes → 今の版
  // dirs：組み立てが使ったテーマのフォルダ（親も。持ち運べる 1 ファイルが、原稿のフォルダのテーマの LICENSE* を一緒に入れるため。出力には書かない）
  const tctx = { lock: null, pins: {}, pinned: [], versions: {}, noted: new Set(), dirs: [] };
  try { tctx.lock = readThemesLock(env, ROOT); } catch (e) { warn.push(`themes.lock.json: ${e.message}`); }
  if (tctx.lock && !opts.updateThemes) {
    const cfg = P.join(deckDir, FORMAT.CONFIG_FILE);
    if (env.exists(cfg) && inDeck(cfg)) { try { tctx.pins = configThemePins(JSON.parse(env.readText(cfg))); } catch { tctx.pins = {}; } }
    if (opts.themeVersions && typeof opts.themeVersions === 'object') tctx.pins = { ...tctx.pins, ...opts.themeVersions };
  }
  let tsel = pinTheme(env, resolveTheme(env, themeName, deckDir, opts.theme ? null : deckDir, warn, ud, miss), themeName, tctx, warn);
  if (miss && miss.length) warn.push(missingThemeWarning(env0, themeName, 'default'));
  if (!tsel) { themeName = 'default'; tsel = pinTheme(env, resolveTheme(env, 'default', P.join(ROOT, 'themes'), P.join(ROOT, 'themes'), warn), 'default', tctx, warn); }
  const theme = themeAssets(env, tsel, warn, 0, ud, tctx);
  if (theme.logos.length) {
    // ロゴの data: URI（読む前に数えた）を表紙ごとに入れる：つなぐ前に、増える大きさを組んだ文書の上限に数える
    budget.reset(html.length);
    const imgsLen = theme.logos.reduce((n, u) => n + u.length + 20, 20);
    budget.add(imgsLen, LIM.bundledChars, 'document with logos');
    const imgs = `<div class="logos">${theme.logos.map((u) => `<img alt="" src="${u}">`).join('')}</div>`;
    let first = true;
    html = html.replace(/(<section\b[^>]*class="[^"]*\bcover\b[^"]*"[^>]*>)([\s\S]*?)(<\/section>)/g,
      (m, a, body, c) => {
        if (/class="logos"|data-nologos/.test(a + body)) return m;
        if (!first) budget.add(imgs.length, LIM.bundledChars, 'document with logos');
        first = false;
        return a + body + imgs + c;
      });
  }

  // 数式
  // 式の一部に色を付けるマクロ（テーマの変数に従う）：\hlE{…} 結論・問題、\hlT{…} 用語、\hlM{…} 既知の結果
  let macros = { '\\hlE': '\\htmlClass{emph}{#1}', '\\hlT': '\\htmlClass{term}{#1}', '\\hlM': '\\htmlClass{muted}{#1}' };
  const mfile = P.join(deckDir, 'macros.tex');
  if (env.exists(mfile) && inDeck(mfile)) Object.assign(macros, readMacros(env.readText(mfile)));   // 既定のマクロに足す（同じ名前は macros.tex が優先）
  // モーフの対応（docs/contract.md §8）：\morph{ID}{…} の部分は、前のスライドの同じ ID の部分から滑ってくる
  macros['\\morph'] ??= '\\htmlData{id=#1}{#2}';
  for (const s of html.match(/<script type="text\/x-tex-macros">([\s\S]*?)<\/script>/g) || []) Object.assign(macros, readMacros(s));
  let count = 0;
  const render = (tex, display) => {
    if (++count > LIM.math) throw new BuildLimitError('formulas', count, LIM.math);
    try { return env.katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'htmlAndMathml', macros: { ...macros }, trust: (c) => TRUSTED.has(c.command) }); }
    catch (e) { warn.push(`KaTeX: ${e.message.split('\n')[0]}  in: ${tex.slice(0, 60)}`); return `<span class="katex-error" title="${escAttr(e.message)}">${escAttr(tex)}</span>`; }
  };
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<textarea[\s\S]*?<\/textarea>|<!--[\s\S]*?-->)/);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => render(t, true)).replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => render(t, false));
  }
  html = parts.join('');
  if (html.length > LIM.bundledChars) throw new BuildLimitError('document with formulas', html.length, LIM.bundledChars);

  // 部品：使われている <m-名前> を探して読み込む
  const used = [...new Set([...html.matchAll(/<(m-[a-z0-9-]+)[\s>]/g)].map((m) => m[1]))];
  let compJs = '';
  const localComps = [];
  // 部品庫の部品は egatari/components のリリースの写し（vendor/components/<名前>/<版>/。kit/core/components-lock.mjs）。
  // 版は opts.componentVersions（組み直す文書の記録から）→ 作業フォルダの設定のファイル（FORMAT.CONFIG_FILE）の components → components.lock.json の既定の版
  const compRoot = vendorDir(P, ROOT);
  const lock = used.length ? readLock(env, ROOT) : null;
  let pins = {};
  const yankedUsed = [];   // 取り下げた版で組んだ部品庫の部品（format spec §6：知らせる。黙って置き換えない）
  if (used.length) {
    const cfg = P.join(deckDir, FORMAT.CONFIG_FILE);
    if (env.exists(cfg) && inDeck(cfg)) { try { pins = configPins(JSON.parse(env.readText(cfg))); } catch { pins = {}; } }
    if (opts.componentVersions && typeof opts.componentVersions === 'object') pins = { ...pins, ...opts.componentVersions };
  }
  for (const tag of used) {
    const name = tag.slice(2);
    // 読む前に、原稿のフォルダの部品は原稿のフォルダの中に、部品庫の部品は vendor/components/ の中にあること（実体のパスで。外を指すリンクは読まない。
    // 原稿のフォルダにあって外を指すものは、部品庫のものに替えずに使わない）
    const local = P.join(deckDir, 'components', name, 'index.js');
    const pick = pickVersion(lock, name, Object.prototype.hasOwnProperty.call(pins, name) ? pins[name] : undefined);
    const lib = pick.version ? P.join(compRoot, name, pick.version, 'index.js') : null;
    let file = null;
    if (env.exists(local)) {
      if (env.within(local, deckDir)) file = local;
      else { warn.push(`refused: 部品 ${tag} の components/${name}/index.js が作業フォルダの外を指している（シンボリックリンクなど。読まない）`); continue; }
    } else if (lib && env.exists(lib)) {
      if (pick.note) warn.push(pick.note);
      const y = yankedInfo(lock, pick.version);
      if (y) {
        // 置き換え先の版が手元にあるか・index.js の同一性の hash が変わるか（編集アプリが組み直しの知らせに使う）
        const lc = lock.components[name], ok = !!lc && lc.versions.includes(y.replacement);
        yankedUsed.push({ tag, name, version: pick.version, replacement: y.replacement, reason: y.reason, date: y.date, replacementAvailable: ok, sha256Changes: ok ? lc.sha256[pick.version] !== lc.sha256[y.replacement] : null });
        warn.push(`yanked: ${tag} ${pick.version} was withdrawn by the component registry on ${y.date} (replacement ${y.replacement}; ${y.reason}). It is built as recorded, never replaced silently. To rebuild with ${y.replacement}, set "${name}": "${y.replacement}" under components in egatari.json (the editor has a button) / 部品庫が取り下げた版：記録のまま組む。黙って置き換えない`);
      }
      if (env.within(lib, compRoot)) file = lib;
      else { warn.push(`refused: 部品庫の部品 ${tag} が vendor/components/ の外を指している（読まない）`); continue; }
    }
    if (!file) { warn.push(`component not found: ${tag}`); continue; }
    // 注釈の場所は、原稿のフォルダの部品ならそこから、部品庫ならリポジトリから（端末ごとのパスを出力に書かない）
    const where = env.within(file, deckDir) ? P.relative(deckDir, file) : P.relative(ROOT, file);
    if (env.within(file, deckDir)) localComps.push(where.split(P.sep).join('/'));
    compJs += `\n// ---- ${tag} (${where.split(P.sep).join('/')})\n` + env.readText(file).replace(/<\/script/gi, '<\\/script');
  }
  // 原稿の中の <script> の部品定義も含めて、SVG の中の式（svgMath）を使うなら KaTeX を実行時にも読み込む
  const needKatexJs = /svgMath/.test(compJs) || /DECK\.svgMath/.test(html.replace(/<script[^>]*src=[^>]*>/g, ''));

  // 口述原稿・音声・秒数の調整
  const narrPath = P.join(deckDir, 'narration.md');
  if (env.exists(narrPath) && !inDeck(narrPath)) warn.push('refused: narration.md が作業フォルダの外を指している（読まない）');
  const segs = env.exists(narrPath) && !inDeck(narrPath) ? [] : (env.exists(narrPath) ? parseNarration(env.readText(narrPath)) : Object.assign([], { warnings: [] }));
  for (const w of segs.warnings || []) warn.push(`narration: ${w}`);
  const keySet = new Set(slides.map((s) => s.key));
  // 鍵がどのスライドにも合わない節（## 見出し）。段階のない節も知らせる
  for (const s of segs.sections || segs) if (!keySet.has(s.key ?? s.slideKey)) warn.push(`narration: スライドが見つからない「## ${s.heading || s.key || s.slideKey}」（鍵「${s.key ?? s.slideKey}」、narration.md ${s.line} 行目）`);
  const narration = narrationMap(segs, !!opts.dev);
  const marks = marksMap(segs);
  checkMarks(html, segs, warn);
  const timingPath = P.join(deckDir, 'timeline.json');
  const timing = env.exists(timingPath) && inDeck(timingPath) ? JSON.parse(env.readText(timingPath)) : {};
  const manPath = P.join(deckDir, 'audio', 'manifest.json');
  // 音声の作り方（format spec §5.2 の kind を deck-audio にも写す。§7.3：再生器が合成した声・作り方の記録がない音声を示す）。
  // kind のない tts/synth.py の記録は engine があれば tts。dry-run の無音には付けない
  const audioKind = (v, def) => (v.engine === 'dry-run' || (v.recipe && v.recipe.engine === 'dry-run')) ? undefined
    : ['tts', 'recorded', 'imported'].includes(v.kind) ? v.kind : !v.kind && typeof v.engine === 'string' ? 'tts' : v.kind ? undefined : def;
  const offsetOk = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 1;
  const audio = {};
  if (!opts.noAudio && env.exists(manPath) && inDeck(manPath)) {
    const man = JSON.parse(env.readText(manPath));
    const outDir = P.dirname(P.resolve(opts.out || defaultOut(P, srcPath)));
    for (const [k, v] of Object.entries(man.segments || man)) {
      const file = P.resolve(deckDir, 'audio', v.file);
      if (!env.exists(file)) continue;
      if (!inDeck(file)) { warn.push(`refused: audio/manifest.json の「${v.file}」は作業フォルダの外にある（使わない）`); continue; }
      // opts.audioRef(key, file, entry)：持ち運べる形式の書き出し（kit/core/portable.mjs）が音声の参照（<scheme><blob>）を決める。null なら入れない
      if (opts.audioRef) {
        const src = opts.audioRef(k, file, v);
        if (src == null) continue;
        audio[k] = { src, dur: v.dur, cues: v.sync === 'none' ? [] : v.cues || [] };
        if (v.sync && v.sync !== 'auto') audio[k].sync = v.sync;
        if (offsetOk(v.startOffset)) audio[k].startOffset = v.startOffset;
        const kd = audioKind(v, 'tts');   // 索引の記録と同じ（kind がなければ tts。portable.mjs）
        if (kd) audio[k].kind = kd;
        continue;
      }
      audio[k] = { src: opts.embedAudio ? dataUri(env, env.compressAudio ? env.compressAudio(file) : file) : (opts.audioBase ? opts.audioBase + v.file : P.relative(outDir, file).split(P.sep).join('/')), dur: v.dur, cues: v.sync === 'none' ? [] : v.cues || [] };
      // 区切りをまだ置いていない録音（sync: "none"。編集アプリの音声の板）は同期しない（持ち運べる形式と同じ。format spec §5）
      if (v.sync && v.sync !== 'auto') audio[k].sync = v.sync;
      // 符号化の遅れ（MP3 の先頭。format spec §5.2 startOffset）：実行系はこの時刻から鳴らし、そこを 0 秒とみなす
      if (offsetOk(v.startOffset)) audio[k].startOffset = v.startOffset;
      const kd = audioKind(v);
      if (kd) audio[k].kind = kd;
    }
  }
  if (env.audioFailed && env.audioFailed()) warn.push('音声を AAC に圧縮できなかった（ffmpeg がない？）ので WAV のまま埋め込んだ。ファイルが大きくなる');
  const j = jsonScript;

  // CSS と JS を組み込む
  // KaTeX の CSS は env ごとに 1 回だけ作る（元の env で覚える）。読んだ回と同じ大きさを毎回数える
  const kcss = katexCss(env0);
  budget.read(utf8Length(kcss));
  const read = (dir, f) => env.readText(P.join(dir, f));
  // 実行系（deck.js など）の UI の文字列は全部は入れない（英語のデッキで和文の分割ファイルが増える）。スライドに出る字は RUNTIME_GLYPHS で足す
  const lang = html.match(/<html[^>]*\slang="([^"]*)"/)?.[1] || '';
  // 字の絞り込みは見える字だけ（ttsParts の読みは画面に出ない）
  const textForFont = glyphText(html, narrationMap(segs, !!opts.dev, false), compJs, lang);
  const fonts = fontCss(env, textForFont, opts.subset !== false && !opts.dev, lang, usesMincho(html, theme.css, compJs), warn,
    { chosen: chosenFonts(theme.css + '\n' + deckCss(html), theme.cfg && theme.cfg.fonts), italic: italicText(html, compJs, isJapanese(lang)), body: bodyFont(theme.css, theme.cfg && theme.cfg.fonts) });
  // 信頼する部分（字・テーマ・実行系の CSS と、実行系のスクリプト）の中身は、それを入れた要素から抜け出せないようにする（</style・</script・<!--）
  const styleSafe = (t) => String(t).replace(/<\/style/gi, '<\\/style').replace(/<!--/g, '<\\!--');
  const scriptSafe = (t) => String(t).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  // 読む順：字 → KaTeX → 実行系（base.css）→ 体裁（layouts.css）→ テーマ（tokens.css。extends の親から順に）→ 英語など（latin.css）。
  // テーマは体裁の後に読むので、同じ詳細度の規則ならテーマが勝つ（表紙の題名の位置や本文の欄の余白などをテーマが替えられる。html を前に付けて詳細度で勝たなくてよい）。
  // latin.css はテーマの後のまま（日本語以外のデッキの字の既定。docs/reference.md「Themes」）
  const headCss = `<style id="deck-base">\n${styleSafe(`${fonts.css}${kcss}\n${read(KIT, 'base.css')}\n${read(KIT, 'layouts.css')}\n${theme.css}\n${isJapanese(lang) ? '' : read(KIT, 'latin.css')}`)}</style>`;
  if (!/id="bar"/.test(html)) html = html.replace(/<\/body>/, '<div id="bar"></div><div id="jump"></div>\n</body>');
  const scriptList = [
    j('deck-narration', narration), j('deck-marks', marks), j('deck-audio', audio), j('deck-timing', timing),
    j('deck-meta', opts.deckMeta || { version: env.version }),
    // マクロは原稿（macros.tex・<script type="text/x-tex-macros">）から来る。< を \u003c にして </script で抜けられないように
    needKatexJs ? `<script>${scriptSafe(read(env.katexDir, 'katex.min.js'))}\nkatex.__macros=${JSON.stringify(macros).replace(/</g, '\\u003c')};</script>` : '',
    // DECK.FORMAT：形式の識別子（kit/core/format.mjs。deck.js は形式の名前を書かずにここから読む）
    `<script>\nwindow.DECK = window.DECK || {}; DECK.FORMAT = ${JSON.stringify(RUNTIME_FORMAT_ALL).replace(/</g, '\\u003c')};\n${scriptSafe(read(KIT, 'shape.js'))}\n${Object.entries(RUNTIME_MODULES).map(([f, name]) => scriptSafe(classicModule(read(KIT, f), name))).join('\n')}\n${Object.entries(RUNTIME_NAMESPACES).map(([f, name]) => scriptSafe(classicNamespace(read(KIT, f), name))).join('\n')}\n${scriptSafe(read(KIT, 'deck.js'))}\n</script>`,
    `<script>\n${scriptSafe(read(KIT, 'presenter.js'))}\n</script>`,
    `<script>\n${scriptSafe(read(KIT, 'tools.js'))}\n</script>`,
    compJs ? `<script>${scriptSafe(compJs)}\n</script>` : '',
  ].filter(Boolean);
  const scripts = scriptList.join('\n');
  // 入れる場所は、正規表現ではなく解析した文書の要素の境目（注釈・属性・<template> の中の <head> や <script> の文字に飲み込まれない）。
  //   字と CSS：本当の <head> の開始タグの直後（原稿の <style> が後に来るように）
  //   実行系：原稿の中の <script>（部品の定義など）より前。<body> の中の最初の「データの type でない <script>」で、部品（m-…）・<template>・SVG・
  //   MathML・<noscript> の中にないものの前。なければ </body> の前、それもなければ文書の終わり（部品の子に実行系の JSON が入らないように）
  // 規則は判定（kit/core/code-scan.mjs の SCRIPTING）と同じ、スクリプトを動かすブラウザのもの（<noscript> の中は文字）
  { const n = countTags(html, LIM.tags); if (n > LIM.tags) throw new BuildLimitError('tags in the built deck', n, LIM.tags); }
  const pdoc = parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: SCRIPTING });
  const htmlEl = (pdoc.childNodes || []).find((n) => n.tagName === 'html');
  const headEl = htmlEl && (htmlEl.childNodes || []).find((n) => n.tagName === 'head');
  const bodyEl = htmlEl && (htmlEl.childNodes || []).find((n) => n.tagName === 'body');
  const headTag = headEl && headEl.sourceCodeLocation && headEl.sourceCodeLocation.startTag;
  if (!headTag) throw new Error('<head> がない');
  // 入れる場所：<head> の開始タグの直後。ただし <head> の最初の要素が <meta charset> ならその後ろ（字の宣言を文書の先頭の 1024 バイトの内に残す。
  // ファイルの決まり（format spec §4.2）は <meta charset> の次）
  const head1 = (headEl.childNodes || []).find((n) => n.tagName);
  const charsetFirst = head1 && head1.tagName === 'meta' && (head1.attrs || []).some((a) => a.name === 'charset') && head1.sourceCodeLocation;
  const headAt = charsetFirst ? head1.sourceCodeLocation.endOffset : headTag.endOffset;
  const FENCE = (n) => n.tagName && (n.tagName.startsWith('m-') || ['template', 'svg', 'math', 'noscript'].includes(n.tagName));
  let at = -1;
  const seekScript = (n) => {
    for (const c of n.childNodes || []) {
      if (at >= 0) return;
      if (c.tagName === 'script' && c.namespaceURI === 'http://www.w3.org/1999/xhtml' && c.sourceCodeLocation && !/^(application\/json|application\/ld\+json|text\/x-tex-macros)$/.test((attr(c, 'type') || '').trim().toLowerCase())) { at = c.sourceCodeLocation.startOffset; return; }
      if (!FENCE(c)) seekScript(c);
    }
  };
  if (bodyEl) seekScript(bodyEl);
  if (at < 0) at = bodyEl && bodyEl.sourceCodeLocation && bodyEl.sourceCodeLocation.endTag ? bodyEl.sourceCodeLocation.endTag.startOffset : html.length;
  if (at < headAt) at = html.length;
  // opts.runtimePrefix：実行系の前に入れる文字列（持ち運べる形式の書き出しが、読める層・索引・塊をここに入れる。実行系が読む前に DOM にあるように）。
  // これは信頼する部分に数えない（判定が読む）
  const pre = opts.runtimePrefix || '';
  // 組んだ出力の全体の大きさを、つなぐ前に確かめる（字・テーマ・実行系・部品・音声を入れた後）
  { const n = html.length + 1 + headCss.length + pre.length + scripts.length + 1;
    if (n > LIM.bundledChars) throw new BuildLimitError('built document', n, LIM.bundledChars); }
  // タブのアイコン（kit/core/favicon.mjs）：原稿が <link rel="icon"> を持つか <html data-favicon="off"> なら入れない。<style id="deck-base"> の前の別の行（信頼する部分の外。<link> は実行しない）
  const hasOwnIcon = (() => {
    const seek = (n) => (n.childNodes || []).some((c) => c.tagName === 'template' ? false
      : (c.tagName === 'link' && (attr(c, 'rel') || '').toLowerCase().split(/\s+/).includes('icon')) || seek(c));
    return seek(pdoc);
  })();
  const iconLink = wantsFavicon(attr(htmlEl, 'data-favicon'), hasOwnIcon) ? faviconLink() + '\n' : '';
  // opts.policyMeta：ファイルの決まり（format spec §4.2。持ち運べる形式の書き出しが渡す CSP の <meta>）。どのスクリプト・スタイル・<link>・URL の属性よりも前
  const a1 = html.slice(0, headAt) + '\n' + (opts.policyMeta ? opts.policyMeta + '\n' : '') + iconLink, a2 = html.slice(headAt, at) + pre;
  html = a1 + headCss + a2 + scripts + '\n' + html.slice(at);
  const trusted = [
    { name: 'deck-base', start: a1.length, end: a1.length + headCss.length, tags: ['style'] },
    { name: 'runtime', start: a1.length + headCss.length + a2.length, end: a1.length + headCss.length + a2.length + scripts.length, tags: scriptList.map(() => 'script') },
  ];
  // コードが動くか（format spec §6）：組んだ文書そのもの（表示するバイト）を、組み立てが入れた信頼する部分を除いて読む。
  // 原稿のフォルダの部品（components/<名前>/index.js）は、組み立てが実行系の中に入れるので、別に数える
  const codeReasons = documentReasons(html, trusted);
  for (const f of localComps) codeReasons.push(`script file ${f}`);

  // theme：選んだテーマの名前と寸法の宣言（metrics。品質チェックが限りに使う。描くのには使わない）
  return { html, trusted, stats: { math: count, slides: slides.length, components: used, yanked: yankedUsed, themePinned: tctx.pinned, themeVersions: tctx.versions, themeDirs: tctx.dirs, fontFiles: fonts.n, narration: segs.length, audio: Object.keys(audio).length, warn, theme: themeName, codeReasons }, slides, segs,
    theme: { name: themeName, metrics: theme.metrics, declared: theme.declared } };
}
// 実行系の JSON のブロック。format spec §2：JSON の中の < はすべて \u003c と書く（</script や <!-- で抜けられないように）
export function jsonScript(id, o) {
  return `<script type="application/json" id="${id}">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
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
// KaTeX の CSS（字は data: URI で埋め込む）。env ごとに 1 回だけ作る
const _kcss = new WeakMap();
function katexCss(env) {
  if (_kcss.has(env)) return _kcss.get(env);
  const P = env.path, kdir = env.katexDir;
  let css = env.readText(P.join(kdir, 'katex.min.css'));
  // unicode-range：字の cmap が持つ字（kit/core/katex-ranges.mjs。KaTeX の版が違えば書かない。試験が知らせる）
  const ranges = env.katex && env.katex.version === KATEX_RANGES.version ? KATEX_RANGES.fonts : {};
  css = css.replace(/src:url\(fonts\/([^)]+?)\.woff2\) format\("woff2"\)[^;}]*/g, (_, f) =>
    `src:url(data:font/woff2;base64,${env.readBase64(P.join(kdir, 'fonts', f + '.woff2'))}) format("woff2")` + (ranges[f] ? `;unicode-range:${ranges[f]}` : ''));
  if (/url\(fonts\//.test(css)) throw new Error('unreplaced font url');
  _kcss.set(env, css);
  return css;
}
export function defaultOut(P, srcPath) {
  const p = P.parse(P.resolve(srcPath));
  return P.join(p.dir, 'out', p.name + '.html');
}
