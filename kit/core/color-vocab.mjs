// テーマの色の語彙の外の色（format spec §8.4「Theme colours」）を原稿（deck.html）から探す。品質チェック（kit/check.mjs）が警告にする（R-colors。
// 教材は組める：スライドは SHOULD）。Node にもブラウザにも依存しない
//   colorsOutsideVocabulary(src) → [{kind, items: [{what, n, line}], n, line}]（見つかった kind だけ。items は値ごとに 1 つ、出た順。n は数、line は最初の行）
//     kind 'literal'：色をじかに書いたもの。16 進（#rgb #rgba #rrggbb #rrggbbaa）、色の関数（rgb() rgba() hsl() hsla() hwb() lab() lch() oklab() oklch() color()）、
//                     色の名前（red・white など。色を取るプロパティと属性の中だけ）。var(--x, …) の予備の値の中のものも（§8.4：予備は役割から作る）
//     kind 'hue'    ：相対色の構文（rgb(from …) hsl(from …) oklch(from …) color(from …) など）で、色相を変えたもの。役割のない新しい色になる（§8.4）
// 見るところ：<style> の宣言の値、style 属性、SVG と HTML の色の属性（fill・stroke・stop-color・flood-color・lighting-color・color・bgcolor）。
// <script> の中は見ない（部品の JavaScript の文字列は色かどうか分からない）。url(…) と文字列（"…" '…'）とコメントは飛ばす。
// 許すもの：var(--役割)（どの名前でも。var() は色をじかに書いたものではない。--lit も）、transparent・currentColor・none・inherit など、color-mix()
// （中の色が許すものだけなら。役割どうし・役割と --bg を混ぜた色は役割を保つ：§8.4）。
// 相対色の決まり（保守的な読み：既定のテーマが --title を oklch(from var(--base) min(l, 0.32) c h) で作り、淡色を color-mix で作るのと同じく、
// 色相を保って明るさ・鮮やかさ・不透明度を変えた色は役割を保つ。§8.4 が知らせると言うのは色相を変えたものだけ）：
//   色相のある空間（hsl hwb lch oklch）：色相の成分が `h` そのもの以外（calc(h + 30)・数・ほかの成分の名前・none）なら 'hue'。ほかの成分（明るさ・鮮やかさ・白・黒）と
//     不透明度（/ の後）は変えてよい
//   色相のない空間（rgb lab oklab color()）：rgb と color() の srgb などの 3 成分は、どれか 1 つでも元の名前そのもの（r g b、color() は r g b か x y z）でなければ 'hue'
//     （成分ごとに変えると色相が変わる。等しく変えたかどうかは見分けない）。lab・oklab は a・b が元のまま（a b）なら明るさ l だけを変えてよい。不透明度は変えてよい
//   元の色（from の後）がじかに書いた色なら、その色を 'literal' として知らせ、相対色としては重ねて知らせない
import { parse } from 'parse5';

// CSS の色の名前（CSS Color 4。transparent と currentcolor は除く：色を足さない）
const NAMED = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse '
  + 'chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen '
  + 'darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray '
  + 'dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred '
  + 'indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey '
  + 'lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon '
  + 'mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue '
  + 'mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred '
  + 'papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna '
  + 'silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
const COLOR_FN = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);
// 相対色の成分の名前（空間ごと）と、色相の成分の位置（なければ -1）
const CHANNELS = { rgb: ['r', 'g', 'b'], rgba: ['r', 'g', 'b'], hsl: ['h', 's', 'l'], hsla: ['h', 's', 'l'], hwb: ['h', 'w', 'b'], lab: ['l', 'a', 'b'], oklab: ['l', 'a', 'b'], lch: ['l', 'c', 'h'], oklch: ['l', 'c', 'h'] };
// 色の名前を色として読むプロパティ（16 進と色の関数はどのプロパティでも色）
const COLOR_PROP = /^(?:--|color$|background|border|outline|fill$|stroke$|stop-color$|flood-color$|lighting-color$|text-decoration|text-emphasis|box-shadow$|text-shadow$|caret-color$|accent-color$|column-rule|-webkit-text-(?:stroke|fill)|filter$|scrollbar-color$)/i;
const COLOR_ATTR = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color', 'bgcolor']);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// 値を字句に分ける：{t: 'fn', name, args: [字句…]} | {t: 'id', s} | {t: 'hex', s} | {t: 'op', s}（, / など）| {t: 'num', s}
function tokenize(s) {
  let i = 0;
  const read = (close) => {
    const out = [];
    while (i < s.length) {
      const c = s[i];
      if (close && c === ')') { i++; return out; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"' || c === "'") { const q = c; i++; while (i < s.length && s[i] !== q) i += s[i] === '\\' ? 2 : 1; i++; continue; }
      if (c === '#') { const m = /^#[0-9a-zA-Z_-]*/.exec(s.slice(i)); out.push({ t: 'hex', s: m[0] }); i += m[0].length; continue; }
      const id = /^-?-?[A-Za-z_][\w-]*/.exec(s.slice(i));
      if (id) {
        i += id[0].length;
        if (s[i] === '(') {
          i++;
          const name = id[0].toLowerCase();
          if (name === 'url') { while (i < s.length && s[i] !== ')') i += s[i] === '\\' ? 2 : 1; i++; continue; }
          const start = i;
          const args = read(true);
          out.push({ t: 'fn', name, args, text: `${id[0]}(${s.slice(start, i - 1)})` });
        } else out.push({ t: 'id', s: id[0] });
        continue;
      }
      if (c === '(') { i++; out.push({ t: 'fn', name: '', args: read(true), text: '' }); continue; }
      const num = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:%|[a-z]+)?/i.exec(s.slice(i));
      if (num) { out.push({ t: 'num', s: num[0] }); i += num[0].length; continue; }
      out.push({ t: 'op', s: c }); i++;
    }
    return out;
  };
  return read(false);
}
const isLiteralFn = (x) => x.t === 'fn' && COLOR_FN.has(x.name) && !(x.args[0] && x.args[0].t === 'id' && x.args[0].s.toLowerCase() === 'from');
const isRelativeFn = (x) => x.t === 'fn' && COLOR_FN.has(x.name) && x.args[0] && x.args[0].t === 'id' && x.args[0].s.toLowerCase() === 'from';
const short = (s) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > 60 ? t.slice(0, 57) + '…' : t; };

// 相対色が色相を変えるか。args は from の後ろ（[元の色, 成分…, / 不透明度]）
function relativeChangesHue(fn) {
  let args = fn.args.slice(2);
  let space = fn.name;
  if (space === 'color') {   // color(from <色> <空間> c1 c2 c3 [/ a])
    const sp = args[0] && args[0].t === 'id' ? args[0].s.toLowerCase() : '';
    args = args.slice(1);
    const names = /^xyz/.test(sp) ? ['x', 'y', 'z'] : ['r', 'g', 'b'];
    const ch = args.slice(0, args.findIndex((x) => x.t === 'op' && x.s === '/') >= 0 ? args.findIndex((x) => x.t === 'op' && x.s === '/') : args.length);
    return ch.length !== 3 || ch.some((x, k) => !(x.t === 'id' && x.s.toLowerCase() === names[k]));
  }
  const names = CHANNELS[space];
  const slash = args.findIndex((x) => x.t === 'op' && (x.s === '/' || x.s === ','));
  const ch = slash >= 0 ? args.slice(0, slash) : args;
  if (ch.length !== 3) return true;   // 読めない形は保守的に知らせる
  const same = (k) => ch[k].t === 'id' && ch[k].s.toLowerCase() === names[k];
  if (space === 'rgb' || space === 'rgba') return ![0, 1, 2].every(same);
  if (space === 'lab' || space === 'oklab') return !(same(1) && same(2));
  return !same(names.indexOf('h'));
}

// 字句の並びを調べる。colorCtx：色の名前を色として読むか
function scan(tokens, colorCtx, add) {
  for (const x of tokens) {
    if (x.t === 'hex') { if (HEX.test(x.s)) add('literal', x.s); continue; }
    if (x.t === 'id') { if (colorCtx && NAMED.has(x.s.toLowerCase())) add('literal', x.s); continue; }
    if (x.t !== 'fn') continue;
    if (isLiteralFn(x)) { add('literal', x.text); continue; }
    if (isRelativeFn(x)) {
      const origin = x.args[1];
      let lit = false;
      const sub = (k, w) => { if (k === 'literal') lit = true; add(k, w); };
      if (origin) scan([origin], true, sub);
      if (!lit && relativeChangesHue(x)) add('hue', x.text);
      continue;
    }
    if (x.name === 'var') {   // var(--x, 予備)：名前は飛ばし、予備の値だけを見る
      const comma = x.args.findIndex((a) => a.t === 'op' && a.s === ',');
      if (comma >= 0) scan(x.args.slice(comma + 1), true, add);
      continue;
    }
    scan(x.args, colorCtx || x.name === 'color-mix' || /gradient$/.test(x.name) || x.name === 'light-dark' || x.name === 'drop-shadow', add);
  }
}
export function colorsInValue(value, { colorCtx = true } = {}) {
  const out = [];
  scan(tokenize(String(value)), colorCtx, (kind, what) => out.push({ kind, what: short(what) }));
  return out;
}
// CSS の文字（<style> の中身・style 属性）の宣言：[{prop, value, at}]（at は文字の中の位置）
export function declarations(css, { inline = false } = {}) {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const out = [];
  const re = inline ? /(^|;)\s*(--[\w-]+|-?[A-Za-z][\w-]*)\s*:([^;]*)/g : /(^|[;{])\s*(--[\w-]+|-?[A-Za-z][\w-]*)\s*:([^;{}]*)(?=[;}])/g;
  for (const m of text.matchAll(re)) out.push({ prop: m[2], value: m[3], at: m.index + m[1].length });
  return out;
}

function walk(n, fn) {
  fn(n);
  if (n.tagName === 'script') return;
  for (const c of n.childNodes || []) walk(c, fn);
  if (n.content) walk(n.content, fn);
}
export function colorsOutsideVocabulary(src) {
  const text = String(src);
  const doc = parse(text, { sourceCodeLocationInfo: true });
  const lineOf = (off) => text.slice(0, off).split('\n').length;
  const kinds = new Map();
  const add = (kind, what, at) => {
    if (!kinds.has(kind)) kinds.set(kind, new Map());
    const m = kinds.get(kind), k = what.toLowerCase();
    if (!m.has(k)) m.set(k, { what, n: 0, line: lineOf(at) });
    m.get(k).n++;
  };
  const ofDecls = (css, base, inline) => {
    for (const d of declarations(css, { inline })) for (const f of colorsInValue(d.value, { colorCtx: COLOR_PROP.test(d.prop) })) add(f.kind, f.what, base + d.at);
  };
  walk(doc, (n) => {
    if (!n.tagName || !n.sourceCodeLocation) return;
    const loc = n.sourceCodeLocation;
    if (n.tagName === 'style') {
      const body = (n.childNodes || []).map((c) => c.value || '').join('');
      const start = loc.startTag ? loc.startTag.endOffset : loc.startOffset;
      ofDecls(body, start, false);
    }
    for (const a of n.attrs || []) {
      const at = (loc.attrs && loc.attrs[a.name] ? loc.attrs[a.name].startOffset : loc.startOffset);
      if (a.name === 'style') ofDecls(a.value, at, true);
      else if (COLOR_ATTR.has(a.name.toLowerCase())) for (const f of colorsInValue(a.value)) add(f.kind, f.what, at);
    }
  });
  return ['literal', 'hue'].filter((k) => kinds.has(k)).map((kind) => {
    const items = [...kinds.get(kind).values()];
    return { kind, items, n: items.reduce((s, x) => s + x.n, 0), line: Math.min(...items.map((x) => x.line)) };
  });
}
