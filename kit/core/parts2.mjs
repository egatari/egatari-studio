// 部品庫 2.0 のパーツ（format spec §6.1・§6.2）：固定のファイル（components2.lock.json）を読む・使うパーツを依存の順に並べる・
// 組み立てのときの描画（build.fields）と絞り込み（build.subset）。Node とブラウザの編集アプリが共有する（node: を読み込まない）
//
// 写しは vendor/components/sha256/<hash>/（components.lock.json の content 表から resolveComponent で引く）。
// カタログとパーツの宣言だけ components2.lock.json に持つ：1.x の教材はそのまま 1.x で組む（既定）。教材が 2.0 を選ぶのは、作業フォルダの設定のファイル
// （egatari.json）の "componentsCatalogue"（"2" か、カタログの版 "2.0.0"）か、組み立ての opts.componentsCatalogue。
// 1 つの教材の部品庫の要素は全部 1.x か全部 2.0（同じ要素の名前 m-bars を 2 つの土台で定義できないため）。
//
// components2.lock.json：
//   {source, default: <カタログの版>, catalogues: {<カタログの版>: {tag, tarballSha256, manifestSha256, parts: {名前: パーツの版}, content?: {名前: <フォルダの content hash>}}},
//    parts: {名前: {<パーツの版>: {sha256, kind: "element" | "library", tag?, requires: {名前: 版}, build?, glyphs?, license}}}}
//   catalogues.<版>.content：そのリリースの manifest の files とちょうど同じバイトの写し（vendor/components/sha256/<hash>/）。部品庫は版を
//   上げずに README・demo だけを直すことがあるので、カタログごとに持つ（resolveCatalogueContent で引く）。ない古い固定は版の写しに戻る。
//   組み立てが読む index.js は、同じ版ならどの写しでも同じ（components.lock.json の content.<版> の写しを使い続ける：組んだ教材は変わらない）
import { parse } from 'parse5';
export const LOCK2_FILE = 'components2.lock.json';
// カタログの manifest と使用条件だけの場所。パーツのコードは resolveComponent で引く。
export const VENDOR_PARTS2 = ['vendor', 'components-2'];
const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION_RE = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9a-z][0-9a-z.-]{0,31})?$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function lock2Problems(lock) {
  const e = [];
  if (!isObj(lock)) return ['not an object'];
  if (!isObj(lock.catalogues) || !Object.keys(lock.catalogues).length) e.push('no catalogues');
  if (!isObj(lock.parts)) e.push('no parts');
  if (e.length) return e;
  if (!own(lock.catalogues, lock.default)) e.push(`default ${lock.default} is not a catalogue`);
  for (const [cv, c] of Object.entries(lock.catalogues)) {
    if (!VERSION_RE.test(cv)) e.push(`catalogue ${cv}: not a version`);
    if (!isObj(c) || !isObj(c.parts)) { e.push(`catalogue ${cv}: no parts`); continue; }
    for (const [n, v] of Object.entries(c.parts)) if (!isObj(lock.parts[n]) || !isObj(lock.parts[n][v])) e.push(`catalogue ${cv}: ${n}@${v} is not in parts`);
    if (own(c, 'content')) {
      if (!isObj(c.content)) e.push(`catalogue ${cv}: content is not an object`);
      else {
        for (const n of Object.keys(c.parts)) if (!own(c.content, n) || !/^[0-9a-f]{64}$/.test(String(c.content[n]))) e.push(`catalogue ${cv}: content.${n} is not a sha256`);
        for (const n of Object.keys(c.content)) if (!own(c.parts, n)) e.push(`catalogue ${cv}: content.${n} is not a part of the catalogue`);
      }
    }
  }
  for (const [n, vs] of Object.entries(lock.parts)) {
    if (!NAME_RE.test(n)) { e.push(`part ${n}: not a part name`); continue; }
    if (!isObj(vs)) { e.push(`part ${n}: not an object`); continue; }
    for (const [v, p] of Object.entries(vs)) {
      if (!VERSION_RE.test(v)) e.push(`${n}@${v}: not a version`);
      if (!isObj(p) || !/^[0-9a-f]{64}$/.test(p.sha256 || '')) { e.push(`${n}@${v}: no sha256`); continue; }
      if (p.kind !== 'element' && p.kind !== 'library') e.push(`${n}@${v}: kind is ${p.kind}`);
      if (p.kind === 'element' && !/^m-[a-z0-9-]+$/.test(p.tag || '')) e.push(`${n}@${v}: element without tag`);
      if (!isObj(p.requires)) e.push(`${n}@${v}: requires is not an object`);
      else for (const [r, rv] of Object.entries(p.requires)) if (!isObj(lock.parts[r]) || !isObj(lock.parts[r][rv])) e.push(`${n}@${v}: requires ${r}@${rv}, which is not in parts`);
    }
  }
  return e;
}
export function parseLock2(text) {
  const lock = JSON.parse(text);
  const p = lock2Problems(lock);
  if (p.length) throw new Error(`${LOCK2_FILE}: ${p.join('; ')}`);
  return lock;
}
export function readLock2(env, root) {
  const f = env.path.join(root, LOCK2_FILE);
  return env.exists(f) ? parseLock2(env.readText(f)) : null;
}

// 教材が選んだカタログ：opts.componentsCatalogue → 設定のファイルの componentsCatalogue。"2"・"2.x" は固定のファイルの既定のカタログ。
// 返すもの：カタログの版（1.x のままなら null）と知らせ
export function pickCatalogue(lock2, want) {
  if (want === undefined || want === null || want === '' || want === '1' || want === 1) return { catalogue: null, note: null };
  const w = String(want);
  if (!lock2) return { catalogue: null, note: `componentsCatalogue "${w.slice(0, 40)}": ${LOCK2_FILE} is missing; building with components 1.x` };
  if (w === '2' || w === '2.x') return { catalogue: lock2.default, note: null };
  if (own(lock2.catalogues, w)) return { catalogue: w, note: null };
  return { catalogue: lock2.default, note: `componentsCatalogue "${w.slice(0, 40)}" is not in ${LOCK2_FILE}; using ${lock2.default}` };
}

// パーツの meta を字で読む（組み立てはパーツのコードを動かさない。§6.1 Registry：meta は define の最初の引数に、式のない JSON の object の
// 字のまま書く）。埋め込みのパーツ（作業フォルダの components/<名前>/index.js）にも、部品庫のパーツ（固定のファイルと照らす）にも使う。
// 読めるのは字（"…"）と object だけ。鍵は "…" か名前（部品庫のパーツは {name: "bars", …} と書く）。注釈・式・変数・' の字・末尾の , は読まない
// 返すもの：egatariParts.define( がなければ null。あれば {meta: {name, version, requires, element?}} か {problem: 文}
const DEFINE_RE = /\begatariParts\s*\.\s*define\s*\(/;
function metaLiteral(src, i0) {
  let i = i0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const err = (m) => { throw new Error(`${m} at offset ${i - i0}`); };
  const string = () => {
    let j = i + 1;
    for (; j < src.length && src[j] !== '"'; j++) { if (src[j] === '\\') j++; else if (src[j] === '\n') err('unterminated string'); }
    if (j >= src.length) err('unterminated string');
    let v;
    try { v = JSON.parse(src.slice(i, j + 1)); } catch { err('not a JSON string'); }
    i = j + 1;
    return v;
  };
  const object = (depth) => {
    if (depth > 4) err('nested too deeply');
    i++;   // {
    const o = {};
    ws();
    if (src[i] === '}') { i++; return o; }
    for (;;) {
      ws();
      let k;
      if (src[i] === '"') k = string();
      else { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80)); if (!m) err('a key is neither a JSON string nor a name'); k = m[0]; i += k.length; }
      if (own(o, k)) err(`key ${JSON.stringify(k)} is written twice`);
      ws();
      if (src[i] !== ':') err('expected ":"');
      i++; ws();
      if (src[i] === '"') o[k] = string();
      else if (src[i] === '{') o[k] = object(depth + 1);
      else err(`the value of ${JSON.stringify(k)} is not a string or an object literal`);
      ws();
      if (src[i] === ',') { i++; ws(); if (src[i] === '}') err('trailing comma'); continue; }
      if (src[i] === '}') { i++; return o; }
      err('expected "," or "}"');
    }
  };
  ws();
  if (src[i] !== '{') err('the first argument is not an object literal');
  const value = object(0);
  ws();
  if (src[i] !== ',') err('the meta is not followed by ","');
  return value;
}
export function readDefineMeta(code) {
  const src = String(code), m = DEFINE_RE.exec(src);
  if (!m) return null;
  let v;
  try { v = metaLiteral(src.slice(m.index + m[0].length, m.index + m[0].length + 8192), 0); }
  catch (e) { return { problem: `the meta of egatariParts.define is not a literal JSON object (format spec §6.1): ${e.message}` }; }
  const bad = (w) => ({ problem: `the meta of egatariParts.define: ${w}` });
  if (typeof v.name !== 'string' || !NAME_RE.test(v.name)) return bad('name is not a part name');
  if (typeof v.version !== 'string' || !VERSION_RE.test(v.version)) return bad('version is not an exact version');
  if (v.requires !== undefined && !isObj(v.requires)) return bad('requires is not an object');
  const requires = {};
  for (const [r, rv] of Object.entries(v.requires || {})) {
    if (!NAME_RE.test(r) || typeof rv !== 'string' || !VERSION_RE.test(rv)) return bad(`requires.${r.slice(0, 64)} is not a part name with an exact version`);
    requires[r] = rv;
  }
  if (v.element !== undefined && (typeof v.element !== 'string' || !/^[a-z][a-z0-9._-]*-[a-z0-9._-]*$/.test(v.element))) return bad('element is not a custom element name');
  return { meta: { name: v.name, version: v.version, requires, ...(v.element ? { element: v.element } : {}) } };
}
// パーツが宣言する字（§6.2・§7.2 の glyphs：パーツが自分で描く字で、教材の字には出てこないもの。地図の島の名前など）。字を切り出すとき、使うパーツのこの字も残す。
// 宣言はどこにあってもよい（全部を合わせる）：部品庫の記録（manifest・components2.lock.json の glyphs）、egatariParts.define の meta の glyphs、
// コードの static glyphs = <字列か {言語: 字列} のリテラル>。値は字列（どの教材でも）か、言語ごとの字列 {ja: "…", en: "…"}（教材の言語のものだけ）
//   partGlyphDecls(code, meta) → [宣言…]（字列か {言語: 字列}）
//   pickGlyphs(decls, lang) → 字列（言語ごとの宣言は、教材の言語の主な部分（ja・en…）の値。なければ en、それもなければ全部）
const STATIC_GLYPHS_RE = /\bstatic\s+glyphs\s*=\s*/g;
const glyphLiteral = (src, i) => {
  // 字列（"…"）か、値が字列のオブジェクト（{ja: "…", en: "…"}）。metaLiteral と同じ読み方（評価しない）
  if (src[i] === '"') { let j = i + 1; for (; j < src.length && src[j] !== '"'; j++) if (src[j] === '\\') j++; return JSON.parse(src.slice(i, j + 1)); }
  if (src[i] !== '{') return null;
  const o = metaLiteral(src.slice(i).replace(/^(\{[\s\S]*?\})/, '$1,'), 0);
  return Object.values(o).every((v) => typeof v === 'string') ? o : null;
};
const okDecl = (g) => typeof g === 'string' || (isObj(g) && Object.values(g).every((v) => typeof v === 'string'));
export function partGlyphDecls(code, meta) {
  const out = [];
  if (meta && okDecl(meta.glyphs) && meta.glyphs !== '') out.push(meta.glyphs);
  const src = String(code || '');
  const d = DEFINE_RE.exec(src);
  if (d) { try { const v = metaLiteral(src.slice(d.index + d[0].length, d.index + d[0].length + 8192), 0); if (okDecl(v.glyphs)) out.push(v.glyphs); } catch { /* readDefineMeta が知らせる */ } }
  for (const m of src.matchAll(STATIC_GLYPHS_RE)) { try { const g = glyphLiteral(src, m.index + m[0].length); if (g !== null && okDecl(g)) out.push(g); } catch { /* 読めない宣言は数えない */ } }
  return out;
}
export function pickGlyphs(decls, lang) {
  const primary = String(lang || '').toLowerCase().split('-')[0] || 'ja';
  let s = '';
  for (const g of decls || []) {
    if (typeof g === 'string') s += g;
    else if (own(g, primary)) s += g[primary];
    else if (own(g, 'en')) s += g.en;
    else s += Object.values(g).join('');
  }
  return s;
}
// 部品庫のパーツ：字で読んだ meta が固定のファイルの記録（requires・tag）と合うか。合わない点の文を返す
export function metaMismatch(meta, rec) {
  const e = [];
  if (!eqObj(meta.requires, rec.requires || {})) e.push(`requires ${JSON.stringify(meta.requires)} ≠ ${JSON.stringify(rec.requires || {})}`);
  if ((meta.element || null) !== (rec.tag || null)) e.push(`element ${meta.element || '(none)'} ≠ ${rec.tag || '(none)'}`);
  return e;
}
const eqObj = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.length === kb.length && ka.every((k, j) => k === kb[j] && a[k] === b[k]); };

// 使う要素（m-…）から、書き込むパーツを依存の順に決める。
//   used：教材の中の要素の名前、local：{要素の名前: {meta, code, where}}（埋め込みのパーツ）、pins：{名前: 版}（設定のファイルの components）
// 返すもの：{parts: [{name, version, source: 'registry' | 'embedded', tag?, requires, file?, code?, meta}], missing: [要素の名前], requiresMissing: [{part: 名前@版, requires: 名前@版}], warn: [文], conflicts: [文]}
// 順：要るパーツが先（深さ優先の後順、名前の順に辿る）。同じ名前のライブラリのパーツの違う版は両方入る（name@version で分ける）。
// 要素の名前は 1 つのファイルで 1 つ（§6.1 Order）：同じ要素の名前を定義するパーツが 2 つ要る（1 つのパーツの 2 つの版でも、名前の違うパーツでも）なら
// conflicts に書く。組み立てはそのとき断る（どちらかの版を落とすと、それを要るパーツが動かない。作り手がパーツを直す：§7.2 段 C）
export function resolveParts(lock2, catalogue, used, { local = {}, pins = {} } = {}) {
  const cat = lock2.catalogues[catalogue];
  const byTag = new Map();
  for (const [n, v] of Object.entries(cat.parts)) { const p = lock2.parts[n][v]; if (p.kind === 'element') byTag.set(p.tag, n); }
  const run = () => {
    const warn = [], missing = [], requiresMissing = [];
    const versionOf = (n) => {
      if (own(pins, n) && isObj(lock2.parts[n]) && own(lock2.parts[n], pins[n])) return pins[n];
      if (own(pins, n)) warn.push(`part ${n}: version "${String(pins[n]).slice(0, 40)}" is not in ${LOCK2_FILE}; using ${cat.parts[n] || '(none)'}`);
      return cat.parts[n];
    };
    const out = [], seen = new Set(), visiting = new Set();
    const visit = (name, version, from) => {
      const id = `${name}@${version}`;
      if (seen.has(id)) return true;
      if (visiting.has(id)) { warn.push(`parts: ${id} requires itself (cycle via ${from}); not written`); return false; }
      const loc = Object.values(local).find((l) => l.meta && l.meta.name === name && l.meta.version === version);
      const reg = !loc && isObj(lock2.parts[name]) ? lock2.parts[name][version] : null;
      if (!loc && !reg) {
        if (from) requiresMissing.push({ part: from, requires: id });
        warn.push(`parts: ${id}${from ? ` (required by ${from})` : ''} is not in ${LOCK2_FILE}`);
        return false;
      }
      visiting.add(id);
      const requires = loc ? loc.meta.requires : reg.requires;
      for (const r of Object.keys(requires).sort()) visit(r, requires[r], id);
      visiting.delete(id);
      seen.add(id);
      out.push(loc
        ? { name, version, source: 'embedded', ...(loc.meta.element ? { tag: loc.meta.element } : {}), requires, code: loc.code, where: loc.where, meta: loc.meta }
        : { name, version, source: 'registry', ...(reg.tag ? { tag: reg.tag } : {}), requires, meta: reg });
      return true;
    };
    for (const tag of [...used].sort()) {
      if (own(local, tag)) { visit(local[tag].meta.name, local[tag].meta.version, null); continue; }
      const n = byTag.get(tag);
      if (!n) { missing.push(tag); continue; }
      visit(n, versionOf(n), null);
    }
    return { parts: out, missing, requiresMissing, warn };
  };
  const r = run();
  const tags = new Map(), conflicts = [];
  for (const p of r.parts) if (p.tag) { if (!tags.has(p.tag)) tags.set(p.tag, []); tags.get(p.tag).push(`${p.name}@${p.version}`); }
  for (const [tag, ids] of tags) if (ids.length > 1) conflicts.push(`<${tag}> is defined by ${ids.join(' and ')}, but one file defines an element name once (format spec §6.1 Order); update the parts so that one definition satisfies every requirement`);
  return { ...r, conflicts };
}

// ---------------------------------------------------------------- 選んだカタログにない要素（format spec §6：運べないパーツは組まずに断り、パーツと直し方を言う）
// 1.x の教材（既定）が 2.x だけのパーツの要素（<m-score> など）を使う・2.x の教材が別のカタログにしかない要素を使う・ライブラリのパーツの名前を
// 要素に使う、のどれも組まずに断る（黙って落とすと、再生器は動かない部品を出し、動画は段階が減る）。どの部品庫にもない名前は今までどおり知らせだけ
// （作業フォルダの components/ に置き忘れた部品かもしれない。組み立てはどのパーツが要るかを言えない）
export const NOT_IN_CATALOGUE = 'component-not-in-catalogue';
// 選んだカタログにない要素のうち、componentsCatalogue を "2" にすれば組めるものだけか（編集アプリの「パーツライブラリ 2 を使う」）
export const fixableBy2 = (list) => Array.isArray(list) && list.length > 0 && list.every((a) => a && a.catalogue === '1.x' && (a.hint === 'select2' || a.hint === 'pin') && a.value === '2');
// 原稿の中で要素として使う m-… の名前（elements。注釈・<script>・<style> の中の字は数えない。<template> の中は数える）と、
// 原稿自身の <script> が定義する名前（defined：DECK.define・customElements.define の最初の引数の字、egatariParts.define の meta の element）
// legacyApi：原稿の <script> が再生器の 1.x 用の補助（DECK.define・DECK.MotionElement・DECK.el など。2.0 だけの教材では外す）を使うか
export const LEGACY_API_RE = /\bDECK\s*\.\s*(?:define|MotionElement|el|mtext|Plot|svgMath|color|ANIM|tween|ease|prog|lerp|clamp01|shape)\b/;
export function deckElements(html) {
  const elements = new Set(), defined = new Set();
  let legacyApi = false;
  const DEF = /\b(?:DECK|customElements)\s*\.\s*define\s*\(\s*["'`](m-[a-z0-9-]+)["'`]/g;
  const EL = /\belement\s*:\s*["'](m-[a-z0-9-]+)["']/g;
  const walk = (n) => {
    if (n.tagName && /^m-[a-z0-9-]+$/.test(n.tagName)) elements.add(n.tagName);
    if (n.tagName === 'script') {
      if (!isJsonScript(n) && !(n.attrs || []).some((a) => a.name === 'src')) {
        const body = (n.childNodes || []).map((c) => c.value || '').join('');
        for (const m of body.matchAll(DEF)) defined.add(m[1]);
        if (LEGACY_API_RE.test(body)) legacyApi = true;
        if (DEFINE_RE.test(body)) for (const m of body.matchAll(EL)) defined.add(m[1]);
      }
      return;
    }
    for (const c of n.childNodes || []) walk(c);
    if (n.content) walk(n.content);
  };
  walk(parse(String(html), { scriptingEnabled: true }));
  return { elements, defined, legacyApi };
}
const versionKey = (v) => String(v).split(/[.-]/).map((x) => (/^\d+$/.test(x) ? x.padStart(6, '0') : '~' + x));
const newest = (vs) => [...vs].sort((a, b) => { const x = versionKey(a), y = versionKey(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = x[i] ?? '', q = y[i] ?? ''; if (p !== q) return p < q ? -1 : 1; } return 0; }).pop();
// 要素 tag が選んだカタログにないとき、どこにあるか・どう直すか。lock：components.lock.json、lock2：components2.lock.json、
// selected：選んだ 2.x のカタログの版（1.x なら null）、pin：設定のファイルの components の固定の版（1.x の教材だけ）
// 返すもの：{tag, catalogue: '1.x' | <版>, hint, value?, part?, pin?}
//   hint：select2（value の componentsCatalogue を書く）・select1（componentsCatalogue を外す）・pin（1.x の教材で 2.x の版に固定している）・
//         library（ライブラリのパーツの名前。要素ではない）・unknown（どこにもない。知らせだけ）
export function catalogueHint(lock, lock2, tag, selected = null, pin = undefined) {
  const name = tag.slice(2), base = { tag, catalogue: selected || '1.x' };
  const c = lock && isObj(lock.components) && own(lock.components, name) ? lock.components[name] : null;
  const in1 = !!c && c.catalogue !== '2' && Array.isArray(c.versions) && c.versions.some((v) => /^1\./.test(v));
  const cats = [], lib = [];
  if (lock2 && isObj(lock2.catalogues) && isObj(lock2.parts)) {
    for (const [cv, cat] of Object.entries(lock2.catalogues)) {
      const v = isObj(cat) && isObj(cat.parts) ? cat.parts[name] : undefined;
      const p = v !== undefined && isObj(lock2.parts[name]) ? lock2.parts[name][v] : null;
      if (p && p.kind === 'element' && p.tag === tag) { if (cv !== selected) cats.push(cv); }
      else if (p && p.kind === 'library') lib.push(cv);
    }
  } else if (c && c.catalogue === '2') cats.push('2');
  const value = !cats.length ? null : lock2 && cats.includes(lock2.default) ? '2' : newest(cats);
  if (!selected) {
    if (in1 && typeof pin === 'string') return { ...base, hint: 'pin', part: name, pin, value: value || '2' };
    if (cats.length) return { ...base, hint: 'select2', value };
  } else {
    if (cats.length) return { ...base, hint: 'select2', value };
    if (in1) return { ...base, hint: 'select1' };
  }
  if (lib.length) return { ...base, hint: 'library', part: name };
  return { ...base, hint: 'unknown' };
}
// 知らせの言葉（品質チェック kit/check-messages.mjs・編集アプリ・組み立ての例外が同じものを使う）
export function catalogueMessage(lang, a) {
  const ja = lang === 'ja';
  const cat = a.catalogue === '1.x' ? (ja ? 'パーツライブラリ 1.x（既定）' : 'parts library 1.x (the default)') : (ja ? `パーツライブラリ ${a.catalogue}` : `parts library ${a.catalogue}`);
  const key = `"componentsCatalogue": "${a.value}"`;
  switch (a.hint) {
    case 'select2': return a.catalogue === '1.x'
      ? (ja ? `<${a.tag}> は、この教材が使う${cat}にないパーツです（パーツライブラリ 2.x のパーツ）。egatari.json に ${key} と書いて、パーツライブラリ 2.x を選んでください`
        : `<${a.tag}> is not in ${cat}, which this lesson uses; it is a parts library 2.x part. Select parts library 2.x: set ${key} in egatari.json.`)
      : (ja ? `<${a.tag}> は、egatari.json で選んだ${cat}にないパーツです。egatari.json に ${key} と書いてください`
        : `<${a.tag}> is not in ${cat}, which egatari.json selects. Set ${key} in egatari.json.`);
    case 'pin': return ja
      ? `<${a.tag}> は egatari.json の components で ${a.pin}（パーツライブラリ 2.x の版）に固定されていますが、この教材は${cat}を使います。egatari.json に ${key} と書くか、"${a.part}" の固定を外してください`
      : `<${a.tag}> is pinned to ${a.pin} (a parts library 2.x version) under components in egatari.json, but this lesson uses ${cat}. Set ${key} in egatari.json, or remove the "${a.part}" pin.`;
    case 'select1': return ja
      ? `<${a.tag}> は、egatari.json で選んだ${cat}にないパーツです（パーツライブラリ 1.x のパーツ）。1.x を使うには egatari.json から "componentsCatalogue" を外してください`
      : `<${a.tag}> is not in ${cat}, which egatari.json selects; it is a parts library 1.x part. Remove "componentsCatalogue" from egatari.json to use parts library 1.x.`;
    case 'library': return ja
      ? `<${a.tag}> は要素ではありません：${a.part} はほかのパーツが使うライブラリのパーツで、<${a.tag}> を定義しません。パーツの一覧にある要素を使うか、<${a.tag}> を外してください`
      : `<${a.tag}> is not an element: ${a.part} is a library part that other parts use, and it defines no <${a.tag}>. Use an element from the parts list, or remove <${a.tag}>.`;
    default: return ja ? `<${a.tag}> は${cat}にありません` : `<${a.tag}> is not in ${cat}.`;
  }
}
export function notInCatalogueError(list) {
  return Object.assign(new Error(list.map((a) => catalogueMessage('en', a)).join('\n')), { code: NOT_IN_CATALOGUE, notInCatalogue: list });
}

// ---------------------------------------------------------------- 組み立てのときの描画（§6.2 Render）
// path：nodes[].tex・center.tex・abc。手続き fn(holder, key) を、その欄を持つ object ごとに呼ぶ
export function eachField(data, path, fn) {
  const segs = String(path).split('.');
  const walk = (v, i) => {
    if (v === null || typeof v !== 'object') return;
    const s = segs[i], arr = s.endsWith('[]'), key = arr ? s.slice(0, -2) : s;
    if (i === segs.length - 1) { if (!arr && own(v, key)) fn(v, key); return; }
    const next = v[key];
    if (arr) { if (Array.isArray(next)) next.forEach((x) => walk(x, i + 1)); }
    else walk(next, i + 1);
  };
  walk(data, 0);
}
// 描いた結果の欄の名前（§6.2 Render。規範）：欄の名前に接尾辞を足す。katex は <欄>Html、abcjs は <欄>Svg と <欄>Map
export const RENDERED_SUFFIXES = Object.freeze({ katex: Object.freeze(['Html']), abcjs: Object.freeze(['Svg', 'Map']) });
export const renderedFieldNames = (renderer, field) => (RENDERED_SUFFIXES[renderer] || []).map((x) => field + x);
// 1 つの要素のデータを描く。renderers = {katex: {version, defaults, render: (src, options) => ({Html: …})}}：render は接尾辞ごとの結果を返す
// （欄の名前はここで決める。知らない接尾辞は捨てる）。ない描き手は描かない（§6.2 Missing output はパーツが出す）
// 返すもの：{data, rendered: n, missing: [描き手の名前], used: {名前: {version, options}}}
export function renderFields(data, build, renderers) {
  const fields = isObj(build) && isObj(build.fields) ? build.fields : {};
  const options = isObj(build) && isObj(build.options) ? build.options : {};
  const used = {}, missing = new Set();
  let n = 0;
  for (const [path, name] of Object.entries(fields)) {
    const r = renderers[name];
    if (!r || !own(RENDERED_SUFFIXES, name)) { missing.add(name); continue; }
    const opt = { ...(r.defaults || {}), ...(isObj(options[name]) ? options[name] : {}) };
    eachField(data, path, (holder, key) => {
      if (typeof holder[key] !== 'string') return;
      const res = r.render(holder[key], opt, key);
      if (!isObj(res)) return;
      let any = false;
      for (const x of RENDERED_SUFFIXES[name]) if (own(res, x)) { holder[key + x] = res[x]; any = true; }
      if (!any) return;
      n++;
      used[name] = { version: r.version, options: opt };
    });
  }
  if (n) data.renderers = { ...(isObj(data.renderers) ? data.renderers : {}), ...used };
  return { data, rendered: n, missing: [...missing], used };
}

// ---------------------------------------------------------------- 絞り込み（§6.2 Subset）
const BLOCK_END = '/*@egatari-block-end*/';
// 名前で絞る宣言（match: "name"）のキーと keep の名前の形（§6.2 Subset by name）
export const SUBSET_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// 符号の順（文字列を符号位置の列として比べる。UTF-16 の順とは astral の字で違う）
const cpOrder = (a, b) => { const x = Array.from(a), y = Array.from(b); for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d; } return x.length - y.length; };
// 教材の字（§6.2 Subset、egatari-spec subset-parse c6024bf）：節を \n でつなぐ（語が節をまたいでつながらない）。
//   原稿：parse5（8.0.1）で文書として読み（scripting は有効）、木の順に、字の節と属性の値（同じ名前の属性は parser が残す最初のものだけ）を数える。
//         template の中身も数える。文書型・注釈・<style> の中身・JSON でない <script> の中身は数えない（要素と属性の名前も数えない）。
//         字の参照・改行（CR・CRLF）はパーサーが読むとおり
//   パーツに渡すデータ（<script type="application/json"> の中身）：JSON として読んだ欄の名前・字列の値・数（String(n)）を文書の順に（JSON でなければ書いたままの 1 節）
//   口述原稿は書いたまま、パーツの glyphs
// 組み立て（build-core）と編集アプリが共有する（parse5 はどちらにもある）。部品庫の参照の実装（tools/subset-produce.mjs、c004416）の htmlPieces と同じ節
export function jsonPieces(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'number') out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => jsonPieces(x, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { out.push(k); jsonPieces(v[k], out); }
  return out;
}
const isJsonScript = (n) => /^application\/json$/i.test(((n.attrs || []).find((a) => a.name === 'type')?.value || '').trim());
export function htmlPieces(html) {
  const out = [];
  const walk = (n) => {
    if (n.nodeName === '#text') { if (n.value) out.push(n.value); return; }
    if (n.nodeName === '#comment' || n.nodeName === '#documentType') return;
    for (const a of n.attrs || []) out.push(a.value);
    if (n.tagName === 'style') return;
    if (n.tagName === 'script') {
      if (!isJsonScript(n)) return;
      const body = (n.childNodes || []).map((c) => c.value || '').join('');
      let v, okJson = true;
      try { v = JSON.parse(body); } catch { okJson = false; }
      if (okJson) jsonPieces(v, out); else out.push(body);
      return;
    }
    for (const c of n.childNodes || []) walk(c);
    if (n.content) walk(n.content);   // template の中身
  };
  walk(parse(String(html), { scriptingEnabled: true }));
  return out;
}
// sources：[{html}（原稿）| {narration}（口述原稿）| 字列（= html）]。glyphs：パーツの glyphs（あれば最後の節）
export function lessonText(sources, glyphs = '') {
  const pieces = [];
  for (const src of sources) {
    if (typeof src === 'string' || src.html !== undefined) pieces.push(...htmlPieces(typeof src === 'string' ? src : src.html));
    else if (src.narration !== undefined) pieces.push(String(src.narration));
    else throw new Error('subset: a lesson source is {html} or {narration}');
  }
  if (glyphs) pieces.push(glyphs);
  return pieces.join('\n');
}
// 名前で絞るときの教材の語（§6.2 Subset by name）：教材の字（char の宣言と同じ字）を a–z・0–9・- 以外の字ごとに切った語。大文字・小文字は畳まない。
// texts：字（1 つか配列）。返すもの：語の Set
export function lessonTokens(texts) {
  const set = new Set();
  for (const t of Array.isArray(texts) ? texts : [texts]) for (const w of String(t).split(/[^a-z0-9-]+/)) if (w) set.add(w);
  return set;
}
// code の中の印の付いた塊を、教材に出てくるキーだけに絞る。decl：パーツの build.subset（1 つか配列）。
// text：教材の字（§6.2 Subset。呼ぶ側が lessonText で作る。パーツの glyphs も）。char の宣言も name の宣言も同じ字を読む。
// names：name の宣言が残す語。省けば text を lessonTokens で切ったもの。記録した keys・names を当て直すときに渡す。
// 宣言ごとに別々に、宣言した順に絞る。
//   match "char"（既定）：キーが text の字に出てくるものを残す
//   match "name"：キーが語（か宣言の keep）にちょうど等しいものを残す
// 残したキー（keys）は char の宣言で残したものを合わせて 1 回ずつ、符号の順に 1 つの字列。names は name の宣言で残した名前を 1 回ずつ、符号の順に
// （name の宣言があれば、何も残さなくても []。なければ null）。記録した keys・names をもう一度渡せば同じバイトになる（編集アプリが信頼できる写しに当てて比べる）。
// 形の悪い宣言（§6.2 Bad declarations：match が char・name でない、keep が名前の配列でない・char の宣言にある、塊がない・JSON でない、キーが字列でない。
// ほかに data・key がない、data が block:<名前> でない、塊が 2 つある・閉じていない、塊が object・配列でない、name の塊のキーが名前の形でない）なら、どの塊も絞らない：
// code をそのまま、blocks を [] で返し、problems にわけを書く（呼ぶ側はパーツを全部のまま書き、索引に subset を書かない）
// 返すもの：{code, keys, names, blocks: [名前], problems: [文]}
export function subsetCode(code, decl, text, names) {
  const list = Array.isArray(decl) ? decl : [decl];
  const chars = new Set(Array.from(String(text)));
  const tokens = names === undefined ? lessonTokens(text) : new Set(names);
  const kept = new Set(), keptNames = new Set(), blocks = [], problems = [];
  let anyName = false;
  let out = String(code);
  for (const d of list) {
    if (!isObj(d)) { problems.push(`entry ${JSON.stringify(d)}: not an object`); continue; }
    if (typeof d.data !== 'string' || typeof d.key !== 'string') { problems.push(`entry ${JSON.stringify(d).slice(0, 80)}: needs data and key`); continue; }
    if (!/^block:[a-z][a-z0-9-]{0,63}$/.test(d.data)) { problems.push(`entry data ${JSON.stringify(d.data.slice(0, 64))} is not block:<name>`); continue; }
    const match = d.match === undefined ? 'char' : d.match;
    if (match !== 'char' && match !== 'name') { problems.push(`entry ${d.data}: match ${String(JSON.stringify(d.match)).slice(0, 40)} is not "char" or "name"`); continue; }
    if (d.keep !== undefined && (match !== 'name' || !Array.isArray(d.keep) || !d.keep.every((k) => typeof k === 'string' && SUBSET_NAME_RE.test(k)))) {
      problems.push(`entry ${d.data}: keep is not an array of names on a match: "name" entry`); continue;
    }
    const name = d.data.slice(6), keyField = d.key, byName = match === 'name';
    if (byName) anyName = true;
    const want = byName ? new Set([...tokens, ...(d.keep || [])]) : null;
    // 塊はちょうど 1 つ（始めの印が 1 つ、その後の最初の終わりの印まで。間に別の塊の始まりがない。参照の実装の blockOf と同じ）
    const begin = `/*@egatari-block ${name}*/`, at = out.indexOf(begin);
    if (at < 0) { problems.push(`block ${name}: not found in the code`); continue; }
    if (out.indexOf(begin, at + 1) >= 0) { problems.push(`block ${name}: more than one ${begin}`); continue; }
    const start = at + begin.length, end = out.indexOf(BLOCK_END, start), nested = out.indexOf('/*@egatari-block ', start);
    if (end < 0) { problems.push(`block ${name}: no ${BLOCK_END}`); continue; }
    if (nested >= 0 && nested < end) { problems.push(`block ${name}: not closed before the next block`); continue; }
    let v;
    try { v = JSON.parse(out.slice(start, end)); } catch (e) { problems.push(`block ${name}: not JSON (${e.message})`); continue; }
    // キーは字列（object の欄の名前か、配列の各項目の key の欄の値）。名前で絞る塊では名前の形（_ で始まる欄は除く）
    let ks;
    if (Array.isArray(v)) {
      if (!v.every((it) => isObj(it) && typeof it[keyField] === 'string')) { problems.push(`block ${name}: an item has no string ${JSON.stringify(keyField)} (keys are strings)`); continue; }
      ks = v.map((it) => it[keyField]);
    } else if (isObj(v)) ks = Object.keys(v).filter((k) => !k.startsWith('_'));
    else { problems.push(`block ${name}: neither an object nor an array`); continue; }
    if (byName) {
      const bad = ks.filter((k) => !SUBSET_NAME_RE.test(k));
      if (bad.length) { problems.push(`block ${name}: keys ${JSON.stringify(bad.slice(0, 5))} are not names (${SUBSET_NAME_RE.source})`); continue; }
    }
    const has = (k) => (byName ? want.has(k) : chars.has(k));
    let res;
    if (Array.isArray(v)) res = v.filter((it) => has(it[keyField]));
    else {
      res = {};
      for (const k of Object.keys(v)) if (k.startsWith('_')) res[k] = v[k];   // _ で始まる欄（使用条件の表示など）は先に、そのまま
      for (const k of ks) if (has(k)) res[k] = v[k];
    }
    for (const k of ks) if (has(k)) (byName ? keptNames : kept).add(k);
    if (!blocks.includes(name)) blocks.push(name);
    out = out.slice(0, start) + JSON.stringify(res) + out.slice(end);
  }
  if (problems.length) return { code: String(code), keys: '', names: null, blocks: [], problems };
  const keys = [...kept].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
  return { code: out, keys, names: anyName ? [...keptNames].sort(cpOrder) : null, blocks, problems };
}
