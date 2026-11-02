// TEST ONLY. A stand-in for the producer's build-time rendering (Egatari spec §6.2) of katex fields, until Egatari Studio
// does it: for every element of a migrated part that declares `static build = {fields: {<path>: "katex"}, options?: {katex}}`,
// it renders each declared field of the element's data (its child <script type="application/json">) with the KaTeX that the
// pinned Studio pins (tools/studio.json → .studio/package-lock.json; KATEX_VERSION below must equal it), adds the result beside
// the field (<field>Html: "tex" → "texHtml") and records the renderer once at the top level of the data:
//   renderers: {katex: {version: "0.19.0", options: {output, displayMode, throwOnError, strict, trust}}}
// (spec §6.2 Render; the same record belongs in the part's index.components entry, which the producer writes, not this tool).
// Options are the build's (Studio's kit/core/build-core.mjs): strict "ignore", the trusted commands \htmlClass \htmlId
// \htmlData (spec §8.0) and the macros of §8.0: \hlE \hlT \hlM, \morph, then macros.tex in the deck's folder and
// <script type="text/x-tex-macros"> in the deck (read with Studio's own readMacros). output is "htmlAndMathml" (the spec's
// default) unless the part declares build.options.katex.output = "html" (allowed for fields whose meaning the part also gives
// as text). A formula KaTeX refuses gets no <field>Html (the part then shows its source and reports it, spec §6.2 Missing
// output) and a warning here. Rendering is deterministic: same tex, version and options → same bytes (tools/test-katex-produce.mjs).
//   node tools/katex-produce.mjs <deck.html> [-o <out.html>]        (default: print to stdout)
//   import { produce } from './katex-produce.mjs'; await produce(html, {deckDir}) → {html, warnings, rendered}
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { migratedNames, partClass } from './parts.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The KaTeX version the pinned Studio (tools/studio.json, 03eaf06) locks; checked against .studio/package-lock.json and the
// loaded module, so that a Studio pin moved without this line fails loudly
export const KATEX_VERSION = '0.19.0';
export const TRUSTED = ['\\htmlClass', '\\htmlData', '\\htmlId'];
export const BASE_OPTIONS = Object.freeze({ displayMode: false, throwOnError: true, strict: 'ignore', trust: TRUSTED });

const studioDir = () => process.env.EGATARI_STUDIO ? path.resolve(process.env.EGATARI_STUDIO) : path.join(ROOT, '.studio');
let K = null;
export async function katexOf() {
  if (K) return K;
  const dir = studioDir();
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
  const locked = lock.packages && lock.packages['node_modules/katex'] && lock.packages['node_modules/katex'].version;
  if (locked !== KATEX_VERSION) throw new Error(`katex-produce: the pinned Studio locks katex ${locked}, this tool pins ${KATEX_VERSION}`);
  const katex = createRequire(path.join(dir, 'package.json'))('katex');
  if (katex.version !== KATEX_VERSION) throw new Error(`katex-produce: loaded katex ${katex.version}, expected ${KATEX_VERSION}`);
  const core = await import(pathToFileURL(path.join(dir, 'kit', 'core', 'build-core.mjs')).href);
  return (K = { katex, readMacros: core.readMacros });
}

// The deck's macros, as Studio's build gathers them (spec §8.0)
export function macrosOf(html, deckDir, readMacros) {
  const m = { '\\hlE': '\\htmlClass{emph}{#1}', '\\hlT': '\\htmlClass{term}{#1}', '\\hlM': '\\htmlClass{muted}{#1}' };
  const f = deckDir && path.join(deckDir, 'macros.tex');
  if (f && fs.existsSync(f)) Object.assign(m, readMacros(fs.readFileSync(f, 'utf8')));
  m['\\morph'] ??= '\\htmlData{id=#1}{#2}';
  for (const s of html.match(/<script type="text\/x-tex-macros">([\s\S]*?)<\/script>/g) || []) Object.assign(m, readMacros(s));
  return m;
}

// The renderer options recorded for a part (spec §6.2 renderers record): the build's, with the part's declared output
export function optionsOf(build) {
  const own = (build && build.options && build.options.katex) || {};
  return { output: own.output === 'html' ? 'html' : 'htmlAndMathml', ...BASE_OPTIONS };
}
// One formula: the markup, or null when KaTeX refuses it (msg in warn)
export function render(katex, tex, options, macros, warn) {
  try {
    return katex.renderToString(String(tex), { ...options, trust: (c) => options.trust.includes(c.command), macros: { ...macros } });
  } catch (e) { warn.push(`KaTeX: ${String(e.message).split('\n')[0]} in: ${String(tex).slice(0, 60)}`); return null; }
}

// Every value at a field path of the spec's syntax ("nodes[].tex", "center.tex", "abc"): [{holder, key}]
export function at(data, p) {
  let cur = [data];
  const segs = p.split('.');
  segs.forEach((s, i) => {
    const arr = s.endsWith('[]'), k = arr ? s.slice(0, -2) : s, last = i === segs.length - 1;
    const next = [];
    for (const o of cur) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
      if (last && !arr) { if (typeof o[k] === 'string') next.push({ holder: o, key: k }); continue; }
      const v = o[k];
      if (arr) { if (Array.isArray(v)) next.push(...v); } else if (v !== undefined) next.push(v);
    }
    cur = next;
  });
  return cur.filter((x) => x && x.holder);
}

// The parts whose fields are rendered here: migrated element parts with katex build fields, {tag: {name, fields, options}}
export function katexParts(root = ROOT) {
  const out = {};
  for (const name of migratedNames(root)) {
    const C = partClass(fs.readFileSync(path.join(root, 'components', name, 'index.js'), 'utf8'));
    const b = C && C.build;
    const fields = b && b.fields ? Object.keys(b.fields).filter((f) => b.fields[f] === 'katex') : [];
    if (fields.length) out[`m-${name}`] = { name, fields, options: optionsOf(b) };
  }
  return out;
}

const JSON_SCRIPT = /(<script\s+type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/i;
export async function produce(html, opts = {}) { return produceWith(await katexOf(), html, opts); }
// The same with KaTeX already loaded (K from katexOf()), synchronously (tools/studio.mjs build)
export function produceWith(K, html, { deckDir = null, parts = katexParts() } = {}) {
  const { katex, readMacros } = K;
  const macros = macrosOf(html, deckDir, readMacros), warnings = [];
  let rendered = 0;
  const tags = Object.keys(parts);
  if (!tags.length) return { html, warnings, rendered };
  const open = new RegExp(`<(${tags.join('|')})(?=[\\s>])[^>]*>`, 'g');
  let out = '', last = 0, m;
  while ((m = open.exec(html))) {
    const tag = m[1], p = parts[tag], from = m.index + m[0].length, end = html.indexOf(`</${tag}>`, from);
    if (end < 0) continue;
    const inner = html.slice(from, end), j = JSON_SCRIPT.exec(inner);
    if (!j) continue;
    let data;
    try { data = JSON.parse(j[2]); } catch { warnings.push(`<${tag}>: the data is not JSON (not rendered)`); continue; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    let n = 0;
    for (const f of p.fields) for (const { holder, key } of at(data, f)) {
      const r = render(katex, holder[key], p.options, macros, warnings);
      if (r !== null) { holder[key + 'Html'] = r; n++; }
    }
    if (!n) continue;
    data.renderers = { ...(data.renderers || {}), katex: { version: katex.version, options: p.options } };
    rendered += n;
    // < as <: the JSON stays inside its <script> whatever the markup holds
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    out += html.slice(last, from) + inner.slice(0, j.index) + j[1] + json + j[3];
    last = from + j.index + j[0].length;
  }
  return { html: out + html.slice(last), warnings, rendered };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), oi = args.indexOf('-o'), outFile = oi >= 0 ? args.splice(oi, 2)[1] : null;
  const src = args[0];
  if (!src) { console.error('usage: node tools/katex-produce.mjs <deck.html> [-o <out.html>]'); process.exit(2); }
  const r = await produce(fs.readFileSync(src, 'utf8'), { deckDir: path.dirname(path.resolve(src)) });
  for (const w of r.warnings) console.error('katex-produce: ' + w);
  if (outFile) { fs.writeFileSync(outFile, r.html); console.error(`katex-produce: ${r.rendered} formula(s) rendered with katex ${KATEX_VERSION} → ${outFile}`); }
  else process.stdout.write(r.html);
}
