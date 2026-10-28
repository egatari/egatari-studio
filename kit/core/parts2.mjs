// 部品庫 2.0 のパーツ（format spec §6.1・§6.2）：固定のファイル（components2.lock.json）を読む・使うパーツを依存の順に並べる・
// 組み立てのときの描画（build.fields）と絞り込み（build.subset）。Node とブラウザの編集アプリが共有する（node: を読み込まない）
//
// 写しは vendor/components-2/<名前>/<パーツの版>/（tools/components2-update.mjs が取り込む。手で直さない）。1.x の写し（vendor/components/、
// components.lock.json）とは別に持つ：1.x の教材はそのまま 1.x で組む（既定）。教材が 2.0 を選ぶのは、作業フォルダの設定のファイル
// （egatari.json）の "componentsCatalogue"（"2" か、カタログの版 "2.0.0-rc.1"）か、組み立ての opts.componentsCatalogue。
// 1 つの教材の部品庫の要素は全部 1.x か全部 2.0（同じ要素の名前 m-bars を 2 つの土台で定義できないため）。
//
// components2.lock.json：
//   {source, default: <カタログの版>, catalogues: {<カタログの版>: {tag, tarballSha256, manifestSha256, parts: {名前: パーツの版}}},
//    parts: {名前: {<パーツの版>: {sha256, kind: "element" | "library", tag?, requires: {名前: 版}, build?, glyphs?, license}}}}
export const LOCK2_FILE = 'components2.lock.json';
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
export const vendorDir2 = (P, root) => P.join(root, ...VENDOR_PARTS2);

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

// 埋め込みのパーツ（作業フォルダの components/<名前>/index.js）の meta：最初の egatariParts.define({…}) の name・version・requires・element を字で読む
// （組み立てはパーツのコードを動かさない）。読めなければ null
export function readDefineMeta(code) {
  const src = String(code), at = src.indexOf('egatariParts.define(');
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  if (open < 0 || src.slice(at + 20, open).trim() !== '') return null;
  // 対応する } まで（字の中の括弧は数えない）
  let depth = 0, end = -1, q = null;
  for (let i = open; i < src.length && i < open + 4096; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  let body = src.slice(open + 1, end);
  const requires = {};
  const rq = /requires\s*:\s*\{([^}]*)\}/.exec(body);
  if (rq) {
    for (const x of rq[1].matchAll(/["']?([a-z][a-z0-9-]*)["']?\s*:\s*["']([^"']+)["']/g)) requires[x[1]] = x[2];
    body = body.replace(rq[0], '');
  }
  const str = (k) => { const r = new RegExp(`(?:^|[,{\\s])["']?${k}["']?\\s*:\\s*["']([^"']*)["']`).exec(body); return r ? r[1] : undefined; };
  const name = str('name'), version = str('version'), element = str('element');
  if (!name || !version) return null;
  return { name, version, requires, ...(element ? { element } : {}) };
}

// 使う要素（m-…）から、書き込むパーツを依存の順に決める。
//   used：教材の中の要素の名前、local：{要素の名前: {meta, code, where}}（埋め込みのパーツ）、pins：{名前: 版}（設定のファイルの components）
// 返すもの：{parts: [{name, version, source: 'registry' | 'embedded', tag?, requires, file?, code?, meta}], missing: [要素の名前], warn: [文]}
// 順：要るパーツが先（深さ優先の後順、名前の順に辿る）。同じ名前の違う版は両方入る（name@version で分ける）
export function resolveParts(lock2, catalogue, used, { local = {}, pins = {} } = {}) {
  const warn = [], missing = [], cat = lock2.catalogues[catalogue];
  const byTag = new Map();
  for (const [n, v] of Object.entries(cat.parts)) { const p = lock2.parts[n][v]; if (p.kind === 'element') byTag.set(p.tag, n); }
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
// 1 つの要素のデータを描く。renderers = {katex: (src, options) => html}（ない描き手は描かない：§6.2 Missing output はパーツが出す）
// 返すもの：{data, rendered: n, missing: [描き手の名前], used: {名前: {version, options}}}
export function renderFields(data, build, renderers) {
  const fields = isObj(build) && isObj(build.fields) ? build.fields : {};
  const options = isObj(build) && isObj(build.options) ? build.options : {};
  const used = {}, missing = new Set();
  let n = 0;
  for (const [path, name] of Object.entries(fields)) {
    const r = renderers[name];
    if (!r) { missing.add(name); continue; }
    const opt = { ...(r.defaults || {}), ...(isObj(options[name]) ? options[name] : {}) };
    eachField(data, path, (holder, key) => {
      if (typeof holder[key] !== 'string') return;
      Object.assign(holder, r.render(holder[key], opt, key));
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
// 返すもの：{code, keys: 残したキー（字の並び、符号の順）, blocks: [名前], problems: [文]}。塊のないパーツは code のまま
export function subsetCode(code, decl, text) {
  const list = (Array.isArray(decl) ? decl : [decl]).filter((d) => isObj(d) && typeof d.data === 'string' && d.data.startsWith('block:'));
  const want = new Map(list.map((d) => [d.data.slice(6), d.key]));
  const chars = new Set(Array.from(String(text)));
  const kept = new Set(), blocks = [], problems = [];
  const out = String(code).replace(BLOCK_RE, (m, name, json) => {
    if (!want.has(name)) return m;
    let v;
    try { v = JSON.parse(json); } catch (e) { problems.push(`block ${name}: not JSON (${e.message})`); return m; }
    const keyField = want.get(name);
    let res;
    if (Array.isArray(v)) {
      res = v.filter((it) => isObj(it) && typeof it[keyField] === 'string' && chars.has(it[keyField]));
      res.forEach((it) => kept.add(it[keyField]));
    } else if (isObj(v)) {
      res = {};
      for (const k of Object.keys(v)) if (k.startsWith('_')) res[k] = v[k];   // _ で始まる欄（使用条件の表示など）は先に、そのまま
      for (const k of Object.keys(v)) if (!k.startsWith('_') && chars.has(k)) { res[k] = v[k]; kept.add(k); }
    } else { problems.push(`block ${name}: neither an object nor an array`); return m; }
    blocks.push(name);
    return `/*@egatari-block ${name}*/${JSON.stringify(res)}/*@egatari-block-end*/`;
  });
  for (const n of want.keys()) if (!blocks.includes(n) && !problems.some((p) => p.startsWith(`block ${n}:`))) problems.push(`block ${n}: not found in the code`);
  const keys = [...kept].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
  return { code: out, keys, blocks, problems };
}
