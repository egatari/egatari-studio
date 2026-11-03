// Parts of components 2.0 (Egatari spec §6.1), read without running them:
//   partMeta(js)   the meta of a part's egatariParts.define(meta, factory) call: {name, version, requires, element?}, or null
//                  for a 1.x part (DECK.define). The meta is written as an object literal of plain values (names and
//                  versions as strings), so it is read as JSON after quoting its keys; anything else is an error.
//   isLibrary(js)  a 2.0 part without `element` (a library part such as base or expr: other parts use it, it defines no element)
//   EXACT          an exact version (semver X.Y.Z with an optional pre-release); `requires` in a part are always exact
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The release the 2.0 migration starts from: a migrated part draws what it drew there (tools/test-c2-identity.mjs), and its
// move to egatariParts.define is not a change for the gallery's marks (tools/gallery.mjs)
export const C2_BASELINE = 'v1.13.0';
// Identity rule (egatari-spec ce96072 decision): byte identity of the DOM where a part's data format is unchanged; where the
// spec changed the format, 0-pixel identity against the last commit before the change, recorded in the part's CHANGELOG.
// A part that was never released in 1.x has no C2_BASELINE version either. The only such entry is m-score: its last commit
// before egatari-spec 8a410b0 changed its data (top-level renderers, the rendered-markup list) in a form this test can run
// as the 1.x side is cc0e60a (origin/m-score, merged 745654d; its 2.0 migration dc4468e was byte-identical to it). The 2.0
// side plays the part's current demo; frames are compared by pixels.
export const C2_BASELINE_OF = { score: { rev: 'cc0e60ab42e1dcddbe109c4ce97272ce77bd35a7', demo: 'current', compare: 'pixels' } };
export const c2Baseline = (name) => C2_BASELINE_OF[name] || { rev: C2_BASELINE, demo: 'baseline', compare: 'dom' };
export const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const CALL = 'egatariParts.define(';

// The source with comments blanked (strings kept), so that a comment that mentions egatariParts.define is not read
function stripComments(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
}

export function partMeta(js) {
  const code = stripComments(js);
  const at = code.indexOf(CALL);
  if (at < 0) return null;
  let i = at + CALL.length;
  while (/\s/.test(code[i])) i++;
  if (code[i] !== '{') throw new Error('egatariParts.define: the meta is not an object literal');
  let depth = 0, j = i, q = null;
  for (; j < code.length; j++) {
    const c = code[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  const lit = code.slice(i, j + 1);
  let meta;
  try { meta = JSON.parse(lit.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')); } catch (e) { throw new Error(`egatariParts.define: the meta ${lit} is not plain values (${e.message})`); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('egatariParts.define: the meta is not an object');
  return meta;
}

export const isLibrary = (js) => { const m = partMeta(js); return !!m && !m.element; };
export const isLibraryDir = (dir) => fs.existsSync(path.join(dir, 'index.js')) && isLibrary(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'));
// The order a producer writes parts in (spec §6.1 Order): every part after the parts it requires. parts: {name: meta}
// (one version per name, as in this repository). Throws on a cycle or a requirement that is not among the parts.
export function dependencyOrder(parts) {
  const out = [], state = {};
  const visit = (n, from) => {
    if (state[n] === 2) return;
    if (state[n] === 1) throw new Error(`parts: a cycle through ${n}`);
    if (!parts[n]) throw new Error(`parts: ${from} requires ${n}, which is not a part here`);
    state[n] = 1;
    for (const r of Object.keys(parts[n].requires || {}).sort()) visit(r, n);
    state[n] = 2;
    out.push(n);
  };
  for (const n of Object.keys(parts).sort()) visit(n);
  return out;
}

// The 2.0 parts in components/ of root: {name: meta}
export function partMetas(root) {
  const base = path.join(root, 'components'), out = {};
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    const f = path.join(base, d.name, 'index.js');
    if (!d.isDirectory() || !fs.existsSync(f)) continue;
    const m = partMeta(fs.readFileSync(f, 'utf8'));
    if (m) out[d.name] = m;
  }
  return out;
}
// The migrated element parts (2.0 parts with an element), by folder name
// The migrated element parts, by folder name: derived, never listed. A part counts as migrated when its index.js calls
// egatariParts.define with an element and its README frontmatter says version: 2.x (tools that need the list import this,
// so that migrating a part edits only the part's own folder)
export function migratedNames(root) {
  return Object.entries(partMetas(root)).filter(([n, m]) => {
    if (!m.element) return false;
    const readme = path.join(root, 'components', n, 'README.md');
    const v = fs.existsSync(readme) && (fs.readFileSync(readme, 'utf8').replace(/\r\n?/g, '\n').match(/^---\n[\s\S]*?^version:\s*(\S+)/m) || [])[1];
    return /^2\./.test(v || '');
  }).map(([n]) => n).sort();
}
// The parts a part needs, itself last, in dependency order (spec §6.1 Order)
export function requiresClosure(name, metas) {
  const need = {};
  const walk = (n) => { if (need[n]) return; if (!metas[n]) throw new Error(`parts: ${n} is not a 2.0 part here`); need[n] = metas[n]; for (const r of Object.keys(metas[n].requires || {})) walk(r); };
  walk(name);
  return dependencyOrder(need);
}
// What a part declares for the producer (Egatari spec §6.2 "Declarations in the component"): {build?, glyphs?}, an element
// part's class statics, or the members of the value a library part's factory returns (run here with stub dependencies;
// meta never carries them). {} when the part declares neither or cannot be read.
export function partDeclarations(js, filename = 'index.js') {
  let v = null;
  try {
    const m = partMeta(js);
    if (m && !m.element) {
      const ctx = vm.createContext({ console: { warn() {} }, egatariParts: { define: (meta, fac) => { if (meta && !meta.element) v = fac(stubDeps); } } });
      vm.runInContext(js, ctx, { filename });
    } else v = partClass(js, filename);
  } catch { v = null; }
  return v ? { ...(v.build && typeof v.build === 'object' ? { build: v.build } : {}), ...(typeof v.glyphs === 'string' ? { glyphs: v.glyphs } : {}) } : {};
}

// TEST ONLY. How a migrated element part is served to the pinned Studio (which has no registry) in place of its 1.x
// index.js, until Studio hosts 2.0: the registry shim (tools/registry-shim.js), then the parts it requires in dependency
// order, then the part. Studio writes every component's code into one script after deck.js, so each piece is guarded: the
// shim is written once per page and each part once (by name@version), whatever other migrated parts the page also uses.
// Never shipped: tools/release.mjs packs components/<name>/index.js itself.
export function c2Bundle(root, name) {
  const metas = partMetas(root), read = (n) => fs.readFileSync(path.join(root, 'components', n, 'index.js'), 'utf8');
  const shim = fs.readFileSync(path.join(root, 'tools', 'registry-shim.js'), 'utf8');
  let out = `// TEST ONLY: ${name}@${metas[name].version} through the registry shim (tools/parts.mjs c2Bundle; not a release file)\n`;
  out += `if (!globalThis.egatariParts) {\n${shim}\n}\n`;
  for (const n of requiresClosure(name, metas)) {
    out += `// ---- part ${n}@${metas[n].version}\nif (!EGATARI_PARTS_SHIM.status(${JSON.stringify(`${n}@${metas[n].version}`)})) {\n${read(n)}\n}\n`;
  }
  return out;
}

// The element class a part's index.js defines, read without a browser (for its static props and shape: tools/pack-bytes.mjs,
// tools/test-part-shape.mjs). A 1.x part through a stub DECK.define; a 2.0 part through a stub egatariParts.define. Its
// dependencies are the library parts' own values where they load without a browser (markup-reader's LIST, which m-score's
// module code reads; the core parts), with stubs for what they require in turn; otherwise, and always for base, stubs
// (MotionElement an empty class, every other member a no-op function). null if it cannot be read.
const stubLib = () => new Proxy({}, { get: (_, k) => (k === 'MotionElement' ? class {} : function () {}) });
const stubDeps = new Proxy({}, { get: () => stubLib() });
const libCache = new Map();
function libraryValue(name) {
  if (libCache.has(name)) return libCache.get(name);
  let v = null;
  const f = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'components', name, 'index.js');
  if (name !== 'base' && fs.existsSync(f)) {
    try {
      const ctx = vm.createContext({ console: { warn() {} }, egatariParts: { define: (meta, fac) => { if (meta && !meta.element) v = fac(stubDeps); } } });
      vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: `${name}/index.js` });
    } catch { v = null; }
  }
  libCache.set(name, v);
  return v;
}
export function partClass(js, filename = 'index.js') {
  let cls = null;
  const D = { define: (n, c) => { cls = c; }, MotionElement: class {} };
  const deps = new Proxy({}, { get: (_, k) => (typeof k === 'string' && libraryValue(k)) || stubLib() });
  const ctx = vm.createContext({ DECK: D, window: { DECK: D }, console: { warn() {} },
    egatariParts: { define: (meta, f) => { if (meta && meta.element) cls = f(deps); } } });
  vm.runInContext(js, ctx, { filename });
  return cls;
}
