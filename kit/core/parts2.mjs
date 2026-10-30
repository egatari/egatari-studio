// 部品庫 2.0 のパーツ（format spec §6.1・§6.2）：固定のファイル（components2.lock.json）を読む・使うパーツを依存の順に並べる・
// 組み立てのときの描画（build.fields）と絞り込み（build.subset）。Node とブラウザの編集アプリが共有する（node: を読み込まない）
//
// 写しは vendor/components/sha256/<hash>/（components.lock.json の content 表から resolveComponent で引く）。
// カタログとパーツの宣言だけ components2.lock.json に持つ：1.x の教材はそのまま 1.x で組む（既定）。教材が 2.0 を選ぶのは、作業フォルダの設定のファイル
// （egatari.json）の "componentsCatalogue"（"2" か、カタログの版 "2.0.0-rc.1"）か、組み立ての opts.componentsCatalogue。
// 1 つの教材の部品庫の要素は全部 1.x か全部 2.0（同じ要素の名前 m-bars を 2 つの土台で定義できないため）。
//
// components2.lock.json：
//   {source, default: <カタログの版>, catalogues: {<カタログの版>: {tag, tarballSha256, manifestSha256, parts: {名前: パーツの版}}},
//    parts: {名前: {<パーツの版>: {sha256, kind: "element" | "library", tag?, requires: {名前: 版}, build?, glyphs?, license}}}}
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
// 返すもの：{parts: [{name, version, source: 'registry' | 'embedded', tag?, requires, file?, code?, meta}], missing: [要素の名前], warn: [文], conflicts: [文]}
// 順：要るパーツが先（深さ優先の後順、名前の順に辿る）。同じ名前のライブラリのパーツの違う版は両方入る（name@version で分ける）。
// 要素の名前は 1 つのファイルで 1 つ（§6.1 Order）：同じ要素の名前を定義するパーツが 2 つ要る（1 つのパーツの 2 つの版でも、名前の違うパーツでも）なら
// conflicts に書く。組み立てはそのとき断る（どちらかの版を落とすと、それを要るパーツが動かない。作り手がパーツを直す：§7.2 段 C）
export function resolveParts(lock2, catalogue, used, { local = {}, pins = {} } = {}) {
  const cat = lock2.catalogues[catalogue];
  const byTag = new Map();
  for (const [n, v] of Object.entries(cat.parts)) { const p = lock2.parts[n][v]; if (p.kind === 'element') byTag.set(p.tag, n); }
  const run = () => {
    const warn = [], missing = [];
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
      if (!loc && !reg) { warn.push(`parts: ${id}${from ? ` (required by ${from})` : ''} is not in ${LOCK2_FILE}`); return false; }
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
    return { parts: out, missing, warn };
  };
  const r = run();
  const tags = new Map(), conflicts = [];
  for (const p of r.parts) if (p.tag) { if (!tags.has(p.tag)) tags.set(p.tag, []); tags.get(p.tag).push(`${p.name}@${p.version}`); }
  for (const [tag, ids] of tags) if (ids.length > 1) conflicts.push(`<${tag}> is defined by ${ids.join(' and ')}, but one file defines an element name once (format spec §6.1 Order); update the parts so that one definition satisfies every requirement`);
  return { ...r, conflicts };
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
const BLOCK_RE = /\/\*@egatari-block ([a-z][a-z0-9-]{0,63})\*\/([\s\S]*?)\/\*@egatari-block-end\*\//g;
// code の中の印の付いた塊を、text に出てくるキーだけに絞る。decl：パーツの build.subset（1 つか配列）。
// 教材の字（text）は、呼ぶ側が集める（§6.2 Subset：原稿の全部の字（属性の値も）・口述原稿・パーツに渡すデータ・パーツの glyphs）。
// 宣言ごとに別々に、宣言した順に絞る。残したキー（keys）は、どの宣言で残したものも合わせて 1 回ずつ、符号の順
// 返すもの：{code, keys, blocks: [名前], problems: [文]}。塊のないパーツは code のまま
export function subsetCode(code, decl, text) {
  const list = (Array.isArray(decl) ? decl : [decl]).filter((d) => isObj(d));
  const chars = new Set(Array.from(String(text)));
  const kept = new Set(), blocks = [], problems = [];
  let out = String(code);
  for (const d of list) {
    if (typeof d.data !== 'string' || typeof d.key !== 'string') { problems.push(`entry ${JSON.stringify(d).slice(0, 80)}: needs data and key`); continue; }
    if (!/^block:[a-z][a-z0-9-]{0,63}$/.test(d.data)) { problems.push(`entry data ${JSON.stringify(d.data.slice(0, 64))} is not block:<name>`); continue; }
    const name = d.data.slice(6), keyField = d.key;
    let found = false;
    out = out.replace(BLOCK_RE, (m, bn, json) => {
      if (bn !== name) return m;
      found = true;
      let v;
      try { v = JSON.parse(json); } catch (e) { problems.push(`block ${name}: not JSON (${e.message})`); return m; }
      let res;
      if (Array.isArray(v)) {
        res = v.filter((it) => isObj(it) && typeof it[keyField] === 'string' && chars.has(it[keyField]));
        res.forEach((it) => kept.add(it[keyField]));
      } else if (isObj(v)) {
        res = {};
        for (const k of Object.keys(v)) if (k.startsWith('_')) res[k] = v[k];   // _ で始まる欄（使用条件の表示など）は先に、そのまま
        for (const k of Object.keys(v)) if (!k.startsWith('_') && chars.has(k)) { res[k] = v[k]; kept.add(k); }
      } else { problems.push(`block ${name}: neither an object nor an array`); return m; }
      if (!blocks.includes(name)) blocks.push(name);
      return `/*@egatari-block ${name}*/${JSON.stringify(res)}/*@egatari-block-end*/`;
    });
    if (!found) problems.push(`block ${name}: not found in the code`);
  }
  const keys = [...kept].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
  return { code: out, keys, blocks, problems };
}
