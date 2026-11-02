// The tests build each component's demo with a pinned commit of Egatari Studio (tools/studio.json):
// its build (kit/build.mjs), runtime (kit/deck.js, kit/shape.js), themes, fonts and browser launcher.
// This keeps the harness small: nothing of Studio is copied into this repository.
//
//   node tools/studio.mjs          fetch the pinned Studio into .studio/ (if needed) and overlay this repository's components
//   import { studio } from './studio.mjs'; const S = await studio();   same, from a test
//
// tools/studio.json pins a full commit sha ("commit"); "ref" (or "tag") only names where it came from, for messages.
// .studio/ is a shallow fetch of exactly that commit (checked after checkout), with `npm ci` run in it.
// The overlay replaces Studio's own copy of the components with the files in components/ here:
//   - Studio up to v0.4.x reads components from <studio>/components/<name>/
//   - later Studio reads them from vendor/components/<name>/<version>/ with components.lock.json; the overlay then
//     writes version "0.0.0-test" and makes it the default in the lock
// Migrated element parts (2.0 parts with an element, e.g. m-bars): the pinned Studio has no parts registry, so the overlay
// writes, as their index.js, the registry shim with the parts they require and the part itself (tools/parts.mjs c2Bundle).
// The 1.x tests then build, play and check them through the shim's bridge to DECK. Library parts are not overlaid.
// Build-time rendering (spec §6.2): the pinned Studio does not render parts' declared fields yet, so build() first runs the
// stand-in producer (tools/katex-produce.mjs) on the deck when it uses a migrated part with katex fields, writing the result to
// <deck>.produced.html beside it (same folder, so relative files resolve) and building that. build(src, out, {produce: false})
// builds the deck as written (tools/test-c2-identity.mjs, for the 1.x side).
// Environment: EGATARI_STUDIO=<path> uses an existing Studio checkout instead (it is overlaid in place, so use a scratch copy).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeEol, toCrlf } from './identity.mjs';
import { isLibraryDir, migratedNames, c2Bundle } from './parts.mjs';
import { katexOf, katexParts, produceWith } from './katex-produce.mjs';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PIN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'studio.json'), 'utf8'));
export const TEST_VERSION = '0.0.0-test';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' && cmd === 'npm' }).toString().trim();

// The parts of this repository: directories under components/ with an index.js
export function partNames() {
  return fs.readdirSync(path.join(ROOT, 'components'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, 'components', d.name, 'index.js')))
    .map((d) => d.name).sort();
}
// The components (element parts, <m-<name>>): every part except the 2.0 library parts (tools/parts.mjs), which define no
// element and are not overlaid into Studio (the pinned Studio has no registry; tools/registry-shim.js stands in for tests)
export function componentNames() { return partNames().filter((n) => !isLibraryDir(path.join(ROOT, 'components', n))); }
// The 2.0 library parts (base, expr, …)
export function libraryNames() { return partNames().filter((n) => isLibraryDir(path.join(ROOT, 'components', n))); }

// Files of a component that are part of it (everything except out/ and dot files)
export function componentFiles(name) {
  const dir = path.join(ROOT, 'components', name), out = [];
  const walk = (rel) => {
    for (const d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (d.name.startsWith('.') || (rel === '' && d.name === 'out')) continue;
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(r); else if (d.isFile()) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

function fetchStudio(dir) {
  const ok = () => {
    try { return run('git', ['rev-parse', 'HEAD'], dir) === PIN.commit && fs.existsSync(path.join(dir, 'node_modules', 'playwright-core')); } catch { return false; }
  };
  if (fs.existsSync(dir) && ok()) return;
  if (!/^[0-9a-f]{40}$/.test(PIN.commit || '')) throw new Error(`studio: tools/studio.json "commit" must be a full 40-hex sha, got ${JSON.stringify(PIN.commit)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`studio: fetching ${PIN.repository} ${pinLabel()} into ${path.relative(ROOT, dir) || dir}`);
  // a shallow fetch of the exact commit (GitHub serves any reachable sha), whatever branch or tag it is on
  fs.mkdirSync(dir, { recursive: true });
  run('git', ['init', '--quiet'], dir);
  run('git', ['remote', 'add', 'origin', PIN.repository], dir);
  run('git', ['fetch', '--quiet', '--depth', '1', '--no-tags', 'origin', PIN.commit], dir);
  run('git', ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], dir);
  const head = run('git', ['rev-parse', 'HEAD'], dir);
  if (head !== PIN.commit) throw new Error(`studio: fetched ${head}, expected ${PIN.commit} (stop and check)`);
  console.log('studio: npm ci');
  run('npm', ['ci', '--no-audit', '--no-fund', '--ignore-scripts'], dir);
}

// "v0.4.3 (8419183)" or "main@03eaf06"
export function pinLabel() {
  const short = PIN.commit.slice(0, 7);
  return PIN.tag ? `${PIN.tag} (${short})` : `${PIN.ref || 'commit'}@${short}`;
}

function overlay(dir) {
  const names = componentNames(), migrated = new Set(migratedNames(ROOT));
  // the code Studio reads for a component: its index.js, or for a migrated part the shim bundle
  const codeOf = (name) => migrated.has(name) ? Buffer.from(c2Bundle(ROOT, name)) : fs.readFileSync(path.join(ROOT, 'components', name, 'index.js'));
  const lockFile = path.join(dir, 'components.lock.json');
  const copy = (name, dest) => {
    fs.rmSync(dest, { recursive: true, force: true });
    for (const f of componentFiles(name)) {
      fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, 'components', name, f), path.join(dest, f));
    }
    if (migrated.has(name)) fs.writeFileSync(path.join(dest, 'index.js'), codeOf(name));
  };
  if (fs.existsSync(lockFile)) {
    // Studio with vendored components
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    lock.components ||= {};
    for (const name of names) {
      copy(name, path.join(dir, 'vendor', 'components', name, TEST_VERSION));
      const code = normalizeEol(codeOf(name));
      const sha = createHash('sha256').update(code).digest('hex'), crlf = createHash('sha256').update(toCrlf(code)).digest('hex');
      const c = lock.components[name] ||= { default: TEST_VERSION, versions: [], sha256: {} };
      c.default = TEST_VERSION;
      if (!c.versions.includes(TEST_VERSION)) c.versions.push(TEST_VERSION);
      c.sha256 = { ...c.sha256, [TEST_VERSION]: sha };
      if (c.crlfSha256) c.crlfSha256 = { ...c.crlfSha256, [TEST_VERSION]: crlf };
    }
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
    return { dir, layout: 'vendor', compDir: (name) => path.join(dir, 'vendor', 'components', name, TEST_VERSION) };
  }
  // Studio with components/ in the repository: replace them all (components removed here must not linger)
  const base = path.join(dir, 'components');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base, { withFileTypes: true }) : []) if (d.isDirectory()) fs.rmSync(path.join(base, d.name), { recursive: true, force: true });
  for (const name of names) copy(name, path.join(base, name));
  return { dir, layout: 'components', compDir: (name) => path.join(base, name) };
}

let cached = null;
// Returns {dir, layout, compDir(name), build(src, out, {produce}), produced(src, dir), browser: {launch, fileUrl}}
export async function studio() {
  if (cached) return cached;
  const dir = process.env.EGATARI_STUDIO ? path.resolve(process.env.EGATARI_STUDIO) : path.join(ROOT, '.studio');
  if (!process.env.EGATARI_STUDIO) fetchStudio(dir);
  const s = overlay(dir);
  const browser = await import(pathToFileURL(path.join(dir, 'kit', 'browser.mjs')).href);
  const K = await katexOf(), parts = katexParts();
  // The deck as the producer would build it: src itself, or <deck>.produced.html beside it (in dir, when given: a folder with
  // the same files, e.g. the overlaid copy of a component, so that nothing is written into components/)
  const produced = (src, dir = null) => {
    if (!Object.keys(parts).length) return src;
    const html = fs.readFileSync(src, 'utf8'), r = produceWith(K, html, { deckDir: path.dirname(path.resolve(src)), parts });
    if (r.html === html) return src;
    const out = path.join(dir || path.dirname(src), path.basename(src).replace(/\.html?$/i, '') + '.produced.html');
    fs.writeFileSync(out, r.html);
    return out;
  };
  const build = (src, out, { produce = true } = {}) =>
    execFileSync(process.execPath, [path.join(dir, 'kit', 'build.mjs'), produce ? produced(src) : src, '-o', out], { stdio: 'pipe' });
  cached = { ...s, build, produced, browser };
  return cached;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await studio();
  console.log(`studio: ${pinLabel()} at ${s.dir}, ${componentNames().length} components overlaid (${s.layout})`);
}
