// The layout of each component (no browser):
//   components/<name>/index.js     defines <m-<name>> (DECK.define('m-<name>', …))
//   components/<name>/README.md    frontmatter: name (m-<name>), version (the part's own version X.Y.Z, spec §6.1; 1.x parts: 1.13.0),
//                                  series, tier (standard | specialized | extra), set (only for specialized: stats, math, science, maps,
//                                  kokugo, english, music, business, tools), display (optional: "<ja> / <en>", a name other than the tag),
//                                  summary, steps, purposes (ids in purposes.json), props,
//                                  license (optional: an SPDX expression MIT AND <id>, for a part carrying data under another licence),
//                                  and variants when index.js declares `static variants` (the same names in the same order)
//   components/<name>/demo.html    a 1–2 slide sample deck (required for new components; m-sweep predates the rule)
// Interactive parts (操作できるパーツ, docs/conventions.md §6): index.js declares `static interactive = true;` when the viewer can
// operate the part, and `static viewerInput = true;` when it also takes viewer input (spec §8.4). The flags stay out of the README
// (its frontmatter is shown to AI authors). A simple heuristic on index.js (comments ignored) finds parts that must say interactive:
//   a method input(…), addEventListener for click / dblclick / pointer* / mouse* / touch* / key* / input / change,
//   createElement of a / button / input / select / textarea, or child links as its data (static shape = {links: true, …}).
// It fails when such a part lacks `static interactive = true`, and when viewerInput is set without interactive.
// Answers under preview (docs/conventions.md §1.2, spec §8.4): a part whose later steps are an answer declares
// `static preview = "none";` (the only value) and shows nothing ahead; tools/release.mjs writes it to the manifest.
// 2.0 parts (components 2.0, spec §6.1) call egatariParts.define({name, version, requires?, element?}, factory): the meta is
// checked (exact versions, no DECK / window / globalThis / import / require; lintMeta), and a library part (no element: base, expr) has its own
// README frontmatter (name = folder, version = the meta's, kind: library, summary, requires; lintLibrary) and no demo.html.
// <name> is a registry name: ^[a-z][a-z0-9-]{0,63}$ (Egatari spec §6). Only regular files; no symbolic links, no out/ in git.
//   node tools/lint.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partMeta, EXACT, dependencyOrder, partDeclarations } from './parts.mjs';
import { subsetCode } from './subset-produce.mjs';

export const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
export const SERIES = ['common', 'academic', 'business', 'kokugo', 'info', 'social', 'music', 'english'];
// How a series is named to people (CATALOG.md, gallery). The ids above never change; `common` is 標準パーツ / Standard parts,
// `kokugo` 国語 / Japanese, `music` 音楽 / Music, `english` 英語 / English (subject series, like kokugo)
// Tiers of element parts (parts-tiers-2026-10-27 §1, owner decision): standard parts are always offered, specialized ones
// in sets (chosen by scene and words), extra ones only when a lesson clearly needs them (read their README). Library parts
// have no tier. The ids never change; TIER_LABEL and SET_LABEL are how CATALOG.md names them.
export const TIERS = ['standard', 'specialized', 'extra'];
export const TIER_LABEL = { standard: '標準', specialized: '専門', extra: '特殊' };
export const SETS = ['stats', 'math', 'science', 'maps', 'kokugo', 'english', 'music', 'business', 'tools'];
export const SET_LABEL = { stats: '統計', math: '数学', science: '理科', maps: '地図', kokugo: '国語', english: '英語', music: '音楽', business: 'ビジネス', tools: '道具' };
export const DISPLAY_RE = /^[^/]+ \/ [^/]+$/;
export const SERIES_LABEL = { common: '標準パーツ', academic: '数理・統計', business: 'ビジネス', kokugo: '国語', info: '情報', social: '地図（社会）', music: '音楽', english: '英語' };
// Components released before demo.html was required (do not add to this list)
const NO_DEMO = new Set([]);

// The flags declared in a component's index.js, and whether the heuristic above says it is operable by the viewer
export function flags(js) {
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
  const operable = /^\s+input\s*\(/m.test(code)
    || /addEventListener\(\s*["'](click|dblclick|pointer\w*|mouse\w*|touch\w*|key\w*|input|change)["']/.test(code)
    || /createElement\(\s*["'](a|button|input|select|textarea)["']/.test(code)
    || /static\s+shape\s*=\s*\{\s*links\s*:\s*true/.test(code);
  const g = code.match(/static\s+group\s*=\s*"([a-z][a-z0-9-]*)"\s*;/), pv = code.match(/static\s+preview\s*=\s*"([^"]*)"\s*;/), tm = code.match(/static\s+tile\s*=\s*(\{.*\})\s*;\s*$/m);
  let tile = null, tileError = null;
  if (tm) { try { tile = JSON.parse(tm[1]); } catch (e) { tileError = e.message; } }
  return { interactive: /static\s+interactive\s*=\s*true\s*;/.test(code), viewerInput: /static\s+viewerInput\s*=\s*true\s*;/.test(code), clock: /static\s+clock\s*=\s*true\s*;/.test(code), operable,
    group: g ? g[1] : null, preview: pv ? pv[1] : null, previewWritten: !!pv || /static\s+preview\s*=/.test(code), tile, tileError, tileWritten: !!tm || /static\s+tile\s*=/.test(code) };
}
// SPDX ids a part may name in its README frontmatter license: (with the licence text it must carry)
export const LICENSES = { MIT: {}, 'OFL-1.1': { file: 'OFL.txt' } };
export const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
// purposes.json: id → entry
export function purposeIds(root) {
  const j = JSON.parse(fs.readFileSync(path.join(root, 'purposes.json'), 'utf8'));
  return new Map(j.purposes.map((p) => [p.id, p]));
}

export function frontmatter(text) {
  const m = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const o = {};
  for (const line of m[1].split('\n')) {
    const x = line.match(/^([\w-]+):\s*(.*)$/);
    if (x) o[x[1]] = x[2].trim();
  }
  return o;
}

// A 2.0 part (one that calls egatariParts.define, spec §6.1): its meta, and no DECK, import or require
// (a data block's JSON, spec §6.2, is data: its strings, such as the icon name app-window, are not code)
const strip = (js) => js.replace(/\/\*@egatari-block [a-z][a-z0-9-]*\*\/[\s\S]*?\/\*@egatari-block-end\*\//g, '{}').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
// ctx.report's codes (spec §8.4, egatari-spec 71cb10c)
export const REPORT_CODES = ['data', 'attr', 'range', 'size', 'layout', 'theme', 'error'];
// Functions known to return one of REPORT_CODES (base's data-shape kind → code), accepted as a computed code
export const REPORT_CODE_HELPERS = ['reportCode'];
// Every `.report(` call in (comment-stripped) code, read statically: {code, codeSrc, msg, src}, where code is the first argument
// when it is a string literal on its own (else null), codeSrc the first argument's source, and msg the string literal the second
// argument starts with (else null)
export function reportCalls(code) {
  const out = [], re = /\.report\s*\(/g;
  const lit = (i) => {
    const q = code[i];
    if (q !== '"' && q !== "'" && q !== '`') return null;
    let v = '', j = i + 1;
    for (; j < code.length && code[j] !== q; j++) {
      if (code[j] === '\\') { j++; v += code[j] === 'n' ? '\n' : code[j]; } else if (q === '`' && code[j] === '$' && code[j + 1] === '{') return null; else v += code[j];
    }
    return j < code.length ? { v, end: j + 1 } : null;
  };
  const ws = (i) => { while (/\s/.test(code[i] || '')) i++; return i; };
  let m;
  while ((m = re.exec(code))) {
    let i = ws(m.index + m[0].length), c = null, msg = null;
    const start = i;
    let codeSrc = null;
    const a = lit(i);
    if (a) { const k = ws(a.end); if (code[k] === ',') { c = a.v; i = k; codeSrc = code.slice(start, a.end); } }
    if (c !== null) { const b = lit(ws(i + 1)); if (b) msg = b.v; }
    else {
      // the first argument is an expression: find the comma that ends it at depth 0, then read the second
      let d = 0, j = i;
      for (; j < code.length; j++) {
        const ch = code[j];
        if (ch === '"' || ch === "'" || ch === '`') { const s = lit(j); if (!s) break; j = s.end - 1; continue; }
        if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) { if (d === 0) break; d--; } else if (ch === ',' && d === 0) break;
      }
      codeSrc = code.slice(start, j).trim();
      if (code[j] === ',') { const b = lit(ws(j + 1)); if (b) msg = b.v; }
    }
    out.push({ code: c, codeSrc, msg, src: code.slice(m.index, Math.min(code.length, m.index + 60)) });
  }
  return out;
}
export function lintMeta(name, js, meta, warns = []) {
  const errs = [], at = `components/${name}/index.js`;
  const keys = Object.keys(meta);
  for (const k of keys) if (!['name', 'version', 'requires', 'element'].includes(k)) errs.push(`${at}: define meta has ${k} (only name, version, requires, element)`);
  if (!NAME_RE.test(meta.name || '')) errs.push(`${at}: define meta name ${JSON.stringify(meta.name)} is not a registry name`);
  if (!EXACT.test(meta.version || '')) errs.push(`${at}: define meta version ${JSON.stringify(meta.version)} is not an exact version X.Y.Z`);
  const req = meta.requires === undefined ? {} : meta.requires;
  if (!req || typeof req !== 'object' || Array.isArray(req)) errs.push(`${at}: define meta requires is not an object {name: version}`);
  else for (const [n, v] of Object.entries(req)) {
    if (!NAME_RE.test(n)) errs.push(`${at}: requires ${n}: not a registry name`);
    if (typeof v !== 'string' || !EXACT.test(v)) errs.push(`${at}: requires ${n}: ${JSON.stringify(v)} is not an exact version (ranges live only in a library's sources, spec §6.1)`);
  }
  if ('element' in meta && !/^[a-z][a-z0-9]*-[a-z0-9-]*$/.test(meta.element || '')) errs.push(`${at}: define meta element ${JSON.stringify(meta.element)} is not a custom element name`);
  // the registry name is the folder name (bars), element is the tag (m-bars)
  if ('element' in meta && meta.name !== name) errs.push(`${at}: define meta name ${JSON.stringify(meta.name)} must be the folder name ${JSON.stringify(name)} (the tag goes in element)`);
  if ('element' in meta && meta.element !== `m-${name}`) errs.push(`${at}: define meta element ${JSON.stringify(meta.element)} must be "m-${name}"`);
  const code = strip(js);
  if (/\bDECK\b/.test(code)) errs.push(`${at}: a 2.0 part must not use DECK (spec §6.1: no globals of the player; use ctx and base)`);
  if (/(^|[^.\w$])(window|globalThis)\b(?!\s*:)/m.test(code)) errs.push(`${at}: a 2.0 part must not use window or globalThis (spec §6.1: no globals of the player; the DOM through document and the element)`);
  if (/\brequire\s*\(/.test(code) || /(^|[^.\w$])import\b/m.test(code)) errs.push(`${at}: a 2.0 part must not import or require (spec §6.1)`);
  // an element part declares its registry name for report prefixes (base reads it): static partName = "<meta.name>"
  if ('element' in meta) {
    const pn = code.match(/static\s+partName\s*=\s*["']([^"']*)["']/);
    if (!pn) errs.push(`${at}: an element part declares static partName = "${meta.name}" (base prefixes its reports with it)`);
    else if (pn[1] !== meta.name) errs.push(`${at}: static partName "${pn[1]}" must be the define meta name "${meta.name}"`);
  }
  // static testing = {…} is for this part's own tests only: no part reads it (another part's or its own)
  if (/\.\s*testing\b|\[\s*["'`]testing["'`]\s*\]/.test(code)) errs.push(`${at}: reads .testing; static testing is for tests only and no part reads it (shared logic goes in a library part, docs/c2-migration.md)`);
  // one language test everywhere, 1.x's DECK.ja: /^ja\b/i.test(ctx.lang) (not startsWith("ja"), which also takes "jav" and not "JA")
  if (/startsWith\(\s*["'`]ja["'`]\s*\)/.test(code)) errs.push(`${at}: test the language with /^ja\\b/i.test(ctx.lang), as 1.x's DECK.ja (docs/c2-migration.md item 7)`);
  for (const e of reportCalls(code)) {
    const line = js.slice(0, js.indexOf(e.src)).split('\n').length;
    // a computed code cannot be read statically: allowed without a warning only through a known mapping helper
    if (e.code === null && !REPORT_CODE_HELPERS.some((h) => e.codeSrc.startsWith(h + '('))) warns.push(`${at}: ctx.report(${e.codeSrc.slice(0, 40)}, …): the code is computed; lint cannot check it is one of ${REPORT_CODES.join(', ')} (use a literal, or a known mapping helper: ${REPORT_CODE_HELPERS.join(', ')})${line > 1 ? ` (near line ${line})` : ''}`);
    if (e.code !== null && !REPORT_CODES.includes(e.code)) errs.push(`${at}: ctx.report(${JSON.stringify(e.code)}, …): the code must be one of ${REPORT_CODES.join(', ')} (spec §8.4)${line > 1 ? ` (near line ${line})` : ''}`);
    if ('element' in meta && e.msg !== null && !e.msg.startsWith(`[${meta.name}]`)) errs.push(`${at}: ctx.report(…, ${JSON.stringify(e.msg.slice(0, 40))}…): the message must start with "[${meta.name}]" (spec §8.4)${line > 1 ? ` (near line ${line})` : ''}`);
  }
  if ((code.match(/egatariParts\.define\s*\(/g) || []).length !== 1) errs.push(`${at}: a part calls egatariParts.define exactly once`);
  return errs;
}
// <!-- llm: omit --> (or another llm: block) opens a block that <!-- llm: end --> closes, before the next opener and before the end
// of the file: Studio's AI instructions read up to the closing marker
function llmBlocks(text, rel){
  const errs = [];
  let open = null;
  for (const m of text.matchAll(/<!--\s*llm:\s*([a-z-]+)\s*-->/g)){
    const line = text.slice(0, m.index).split('\n').length;
    if (m[1] === 'end'){ if (!open) errs.push(`${rel}:${line}: <!-- llm: end --> closes no block`); open = null; }
    else { if (open) errs.push(`${rel}:${open.line}: <!-- llm: ${open.kind} --> is not closed before line ${line}`); open = {kind: m[1], line}; }
  }
  if (open) errs.push(`${rel}:${open.line}: <!-- llm: ${open.kind} --> is not closed (add <!-- llm: end -->)`);
  return errs;
}

// A library part (2.0, no element): README frontmatter name (= the folder), version (= the meta's), kind: library, summary,
// requires (only when the meta requires something: "name@version, …" in the same order); no demo.html, series or purposes
export function lintLibrary(name, dir, meta) {
  const errs = [];
  if (meta.name !== name) errs.push(`components/${name}/index.js: define meta name ${meta.name} differs from the folder`);
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) return [...errs, `components/${name}: no README.md`];
  const rtext = fs.readFileSync(readme, 'utf8'), f = frontmatter(rtext);
  errs.push(...llmBlocks(rtext, `components/${name}/README.md`));
  if (!f) return [...errs, `components/${name}/README.md: no frontmatter`];
  for (const k of ['name', 'version', 'kind', 'summary']) if (!(k in f)) errs.push(`components/${name}/README.md: frontmatter has no ${k}`);
  if (f.name && f.name !== name) errs.push(`components/${name}/README.md: name is ${f.name}, expected ${name} (a library part has no tag)`);
  if (f.kind && f.kind !== 'library') errs.push(`components/${name}/README.md: kind is ${f.kind}, expected library`);
  if (f.version && f.version !== meta.version) errs.push(`components/${name}/README.md: version ${f.version} differs from the define meta's ${meta.version}`);
  const req = Object.entries(meta.requires || {}).map(([n, v]) => `${n}@${v}`).join(', ');
  if ((f.requires || '') !== req) errs.push(`components/${name}/README.md: requires "${f.requires || ''}" differs from the define meta's "${req}"`);
  for (const k of ['series', 'purposes', 'steps', 'props', 'variants', 'tier', 'set', 'display']) if (k in f) errs.push(`components/${name}/README.md: ${k} is for element parts, not a library part`);
  if (fs.existsSync(path.join(dir, 'demo.html'))) errs.push(`components/${name}: a library part has no demo.html (it is tested by tools/test-*.mjs)`);
  if ('license' in f) {
    const ids = f.license.split(/\s+AND\s+/);
    if (!ids.every((x) => LICENSES[x]) || !ids.includes('MIT')) errs.push(`components/${name}/README.md: license "${f.license}" is not MIT AND <one of ${Object.keys(LICENSES).filter((x) => x !== 'MIT').join(', ')}>`);
  }
  return errs;
}

export function lint(root, warns = []) {
  const errs = [];
  const base = path.join(root, 'components');
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'purposes.json'), 'utf8'));
  const seen = new Set();
  for (const t of TIERS) if (!TIER_LABEL[t]) errs.push(`tools/lint.mjs: tier ${t} has no TIER_LABEL`);
  for (const t of SETS) if (!SET_LABEL[t]) errs.push(`tools/lint.mjs: set ${t} has no SET_LABEL`);
  for (const s of SERIES) if (!SERIES_LABEL[s]) errs.push(`tools/lint.mjs: series ${s} has no SERIES_LABEL (how CATALOG.md and the gallery name it)`);
  for (const p of pj.purposes) {
    if (!/^[a-z][a-z-]*$/.test(p.id || '') || seen.has(p.id)) errs.push(`purposes.json: id ${JSON.stringify(p.id)} is not a unique lower-case id`);
    seen.add(p.id);
    if (!p.ja || !p.en || !p.steps || !p.steps.ja || !p.steps.en) errs.push(`purposes.json: ${p.id} needs ja, en and steps.{ja,en}`);
    // the new-deck tile (Studio builds its tiles from these): reserved ids have none; the others say own, none or {into: <an own tile>}
    const tile = p.tile, owns = new Set(pj.purposes.filter((q) => q.tile === 'own').map((q) => q.id));
    if (p.reserved) { if (tile !== undefined) errs.push(`purposes.json: ${p.id} is reserved and must not have a tile yet`); }
    else if (tile === 'own') { if (!p.label || !p.label.ja || !p.label.en || !p.examples || !p.examples.ja || !p.examples.en) errs.push(`purposes.json: ${p.id} has its own tile and needs label.{ja,en} and examples.{ja,en}`); }
    else if (tile !== 'none' && !(tile && typeof tile === 'object' && owns.has(tile.into))) errs.push(`purposes.json: ${p.id}: tile must be "own", "none" or {"into": <an id with its own tile>}`);
    if (!p.reserved && (typeof p.icon !== 'string' || !/^[a-z][a-z0-9-]*$/.test(p.icon))) errs.push(`purposes.json: ${p.id} needs an icon key`);
  }
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    const name = d.name, dir = path.join(base, name);
    if (name.startsWith('.')) continue;
    if (!d.isDirectory()) { errs.push(`components/${name}: only component directories belong in components/`); continue; }
    if (!NAME_RE.test(name)) errs.push(`components/${name}: not a registry name (${NAME_RE})`);
    const walk = (rel) => {
      for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (rel === '' && e.name === 'out') continue;
        if (e.isSymbolicLink()) errs.push(`components/${name}/${r}: symbolic link`);
        else if (e.isDirectory()) walk(r);
      }
    };
    walk('');
    if (!fs.existsSync(path.join(dir, 'index.js'))) { errs.push(`components/${name}: no index.js`); continue; }
    const js = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
    let meta = null;
    try { meta = partMeta(js); } catch (e) { errs.push(`components/${name}/index.js: ${e.message}`); continue; }
    if (meta) errs.push(...lintMeta(name, js, meta, warns));
    // a subset declaration must be good (spec §6.2, 6f2670b: registry-side tools reject a part a lesson producer would keep whole)
    if (meta && (partDeclarations(js, `${name}/index.js`).build || {}).subset) {
      try { subsetCode(js, '', []); } catch (e) { errs.push(`components/${name}/index.js: build.subset: ${e.message}`); }
    }
    if (meta && !meta.element) { errs.push(...lintLibrary(name, dir, meta)); continue; }
    if (!new RegExp(`['"]m-${name}['"]`).test(js)) errs.push(`components/${name}/index.js: does not define <m-${name}>`);
    if (!fs.existsSync(path.join(dir, 'demo.html')) && !NO_DEMO.has(name)) errs.push(`components/${name}: no demo.html`);
    const readme = path.join(dir, 'README.md');
    if (!fs.existsSync(readme)) { errs.push(`components/${name}: no README.md`); continue; }
    const rtext = fs.readFileSync(readme, 'utf8'), f = frontmatter(rtext);
    errs.push(...llmBlocks(rtext, `components/${name}/README.md`));
    if (!f) { errs.push(`components/${name}/README.md: no frontmatter`); continue; }
    for (const k of ['name', 'version', 'series', 'tier', 'summary', 'steps', 'props']) if (!(k in f)) errs.push(`components/${name}/README.md: frontmatter has no ${k}`);
    if ('tier' in f && !TIERS.includes(f.tier)) errs.push(`components/${name}/README.md: tier ${f.tier} is not one of ${TIERS.join(', ')}`);
    if (f.tier === 'specialized' && !SETS.includes(f.set)) errs.push(`components/${name}/README.md: a specialized part needs set: one of ${SETS.join(', ')}${'set' in f ? ` (not ${f.set})` : ''}`);
    if (f.tier !== 'specialized' && 'set' in f) errs.push(`components/${name}/README.md: set is only for tier: specialized`);
    if ('display' in f && !DISPLAY_RE.test(f.display)) errs.push(`components/${name}/README.md: display "${f.display}" is not "<ja> / <en>"`);
    if ('version' in f && !EXACT.test(f.version)) errs.push(`components/${name}/README.md: version ${f.version} is not X.Y.Z (the part's own version)`);
    if (meta && f.version !== meta.version) errs.push(`components/${name}/README.md: version ${f.version} differs from the define meta's ${meta.version}`);
    // a migrated part (2.0, element) keeps its own changelog, so that parts migrated in parallel do not all edit the
    // repository's CHANGELOG.md: components/<name>/CHANGELOG.md with a "## <version>" section (id rewrites are noted there)
    if (meta && /^2\./.test(f.version || '')) {
      const cl = path.join(dir, 'CHANGELOG.md');
      if (!fs.existsSync(cl)) errs.push(`components/${name}: a migrated part has its own CHANGELOG.md (docs/c2-migration.md)`);
      else if (!new RegExp(`^## ${meta.version.replace(/\./g, '\\.')}\\b`, 'm').test(fs.readFileSync(cl, 'utf8'))) errs.push(`components/${name}/CHANGELOG.md: no "## ${meta.version}" section`);
    }
    if ('kind' in f) errs.push(`components/${name}/README.md: kind is only for library parts (kind: library, no element)`);
    if (f.name && f.name !== `m-${name}`) errs.push(`components/${name}/README.md: name is ${f.name}, expected m-${name}`);
    if (f.series && !SERIES.includes(f.series)) errs.push(`components/${name}/README.md: series ${f.series} is not one of ${SERIES.join(', ')}`);
    // license (optional): an SPDX expression for a part not wholly under the repository's MIT licence, e.g. MIT AND OFL-1.1.
    // It must name MIT (the code) and only licences from LICENSES; each other licence needs its text in the part's folder
    if ('license' in f) {
      const ids = f.license.split(/\s+AND\s+/);
      if (!ids.every((x) => LICENSES[x]) || !ids.includes('MIT')) errs.push(`components/${name}/README.md: license "${f.license}" is not MIT AND <one of ${Object.keys(LICENSES).filter((x) => x !== 'MIT').join(', ')}>`);
      for (const x of ids) if (LICENSES[x] && LICENSES[x].file && !fs.existsSync(path.join(dir, LICENSES[x].file))) errs.push(`components/${name}: license ${x} needs ${LICENSES[x].file} in the part's folder`);
    }
    const ids = purposeIds(root);
    if (!f.purposes) errs.push(`components/${name}/README.md: frontmatter has no purposes`);
    else for (const p of list(f.purposes)) {
      if (!ids.has(p)) errs.push(`components/${name}/README.md: purpose ${p} is not in purposes.json`);
      else if (ids.get(p).reserved) errs.push(`components/${name}/README.md: purpose ${p} is reserved in purposes.json (remove "reserved" there when a component serves it)`);
    }
    const fl = flags(js);
    if (fl.operable && !fl.interactive) errs.push(`components/${name}/index.js: the viewer can operate it (an input() method, a click/pointer/key/input/change listener, a link or control, or links as data): declare static interactive = true;`);
    // groups of parts the user chooses (docs/conventions.md §7): today only "tool"; a tool needs its own new-deck tile
    if (fl.group !== null && fl.group !== 'tool') errs.push(`components/${name}/index.js: static group must be "tool" (the only group so far)`);
    // answers under preview (docs/conventions.md §1.2, spec §8.4): a part whose later steps are an answer shows nothing ahead and says so
    if (fl.previewWritten && fl.preview !== 'none') errs.push(`components/${name}/index.js: static preview must be "none" (the only value; leave it out for a part that previews its later steps)`);
    if (fl.tileWritten && !fl.tile) errs.push(`components/${name}/index.js: static tile must be one line of JSON ({"label": {"ja", "en"}, "examples": {"ja", "en"}, "icon"})${fl.tileError ? ': ' + fl.tileError : ''}`);
    if (fl.group === 'tool' && !(fl.tile && fl.tile.label && fl.tile.label.ja && fl.tile.label.en && fl.tile.examples && fl.tile.examples.ja && fl.tile.examples.en && /^[a-z][a-z0-9-]*$/.test(fl.tile.icon || ''))) errs.push(`components/${name}/index.js: a tool (static group = "tool") needs static tile with label.{ja,en}, examples.{ja,en} and icon`);
    if (fl.viewerInput && !fl.interactive) errs.push(`components/${name}/index.js: static viewerInput = true needs static interactive = true`);
    for (const [k, s] of [['interactive', 'interactive'], ['viewer-input', 'viewerInput'], ['clock', 'clock']]) if (k in f) errs.push(`components/${name}/README.md: ${k} belongs in index.js (static ${s} = true), not in the README`);
    const sv = js.match(/static\s+variants\s*=\s*\[([^\]]*)\]/);
    const declared = sv ? [...sv[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : [];
    if (declared.join() !== list(f.variants).join()) errs.push(`components/${name}/README.md: variants (${f.variants || 'none'}) differ from static variants in index.js (${declared.join(', ') || 'none'})`);
  }
  // 2.0 parts: every requirement is a part here at that exact version, and there is a dependency order (no cycle)
  const metas = {};
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    const f = path.join(base, d.name, 'index.js');
    if (!d.isDirectory() || !fs.existsSync(f)) continue;
    try { const m = partMeta(fs.readFileSync(f, 'utf8')); if (m) metas[d.name] = m; } catch { /* reported above */ }
  }
  for (const [n, m] of Object.entries(metas)) for (const [r, v] of Object.entries(m.requires || {})) {
    if (!metas[r]) errs.push(`components/${n}/index.js: requires ${r}, which is not a 2.0 part in components/`);
    else if (metas[r].version !== v) errs.push(`components/${n}/index.js: requires ${r}@${v}, but components/${r} is ${metas[r].version}`);
  }
  try { dependencyOrder(metas); } catch (e) { if (!/not a part here/.test(e.message)) errs.push(e.message); }
  return errs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const warns = [];
  const errs = lint(path.dirname(path.dirname(fileURLToPath(import.meta.url))), warns);
  for (const w of warns) console.log('WARN ' + w);
  for (const e of errs) console.log('FAIL ' + e);
  console.log(errs.length ? `\n${errs.length} problem(s)` : 'lint: ok');
  process.exit(errs.length ? 1 : 0);
}
