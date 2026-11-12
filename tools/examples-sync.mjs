// サンプルの写し（examples/index.json の path のあるもの）：egatari/examples の決まったコミットから、直さずに写す。
//   node tools/examples-sync.mjs <examples の clone> --commit <sha> <名前>… | --all
//     その名前のフォルダ（examples/<名前>/）を、clone の <sha> の <path> の、git が持つファイル（.gitignore を除く）だけで作り直し、
//     SOURCE.json（リポジトリ・コミット・path・各ファイルの sha256）を書く。clone は読むだけ（チェックアウトしない。git show で読む）
//   node tools/examples-sync.mjs --check [--lessons <egatari.org の src/gallery/lessons.json>]
//     写したフォルダが SOURCE.json のとおりか（ファイルの過不足・sha256）、SOURCE.json の path が index.json と同じかを確かめる。
//     フォルダに置いてよい、写しでないファイルは SOURCE.json と、元に sample.json がないときの sample.json だけ（本のサンプル：Studio が書く）。
//     --lessons があれば、index.json の各サンプルの section が egatari.org の lessons.json の section と同じか、表紙の絵が同じかも確かめる（その一覧にある名前だけ）。
//     egatari.org の札の id が Studio の名前と違うもの（なし）は、ここに表を足す
// 写し直したあとは --check が「コミットだけが変わり、ファイルの sha256 は同じ」になることを確かめる（samples-from-sample を main に入れたあとの写し直し）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EX = path.join(ROOT, 'examples');
const NOTE = 'Copied unmodified from that commit of egatari/examples (every tracked file of the path except .gitignore; the .ega.html is not tracked there and is built here by tools/examples-portable.mjs). Do not edit; change the examples repository and copy again (tools/examples-sync.mjs).';

export function readIndex(root = ROOT) {
  const idx = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'index.json'), 'utf8'));
  const ids = new Set(idx.sections.map((s) => s.id));
  const seen = new Set();
  for (const e of idx.examples) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(e.name)) throw new Error(`examples/index.json: bad name ${JSON.stringify(e.name)}`);
    if (seen.has(e.name)) throw new Error(`examples/index.json: ${e.name} is listed twice`);
    seen.add(e.name);
    if (!ids.has(e.section)) throw new Error(`examples/index.json: ${e.name}: section ${JSON.stringify(e.section)} is not one of ${[...ids].join(', ')}`);
    if (e.fromSample !== undefined && typeof e.fromSample !== 'boolean') throw new Error(`examples/index.json: ${e.name}: fromSample must be true or false`);
  }
  return idx;
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const git = (clone, args, enc = 'utf8') => execFileSync('git', ['-C', clone, ...args], { encoding: enc, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name), base) : [path.relative(base, path.join(dir, d.name)).split(path.sep).join('/')]);

export function sync(clone, commit, names, { root = ROOT, log = console.log } = {}) {
  const idx = readIndex(root);
  const full = git(clone, ['rev-parse', '--verify', `${commit}^{commit}`]).trim();
  for (const name of names) {
    const e = idx.examples.find((x) => x.name === name);
    if (!e) throw new Error(`examples-sync: ${name} is not in examples/index.json`);
    if (!e.path) throw new Error(`examples-sync: ${name} has no path in examples/index.json (it is not a copy)`);
    const listed = git(clone, ['ls-tree', '-r', '-z', '--name-only', full, '--', e.path + '/']).split('\0').filter(Boolean);
    const files = listed.map((f) => f.slice(e.path.length + 1)).filter((f) => f && path.posix.basename(f) !== '.gitignore').sort();
    if (!files.includes('deck.html')) throw new Error(`examples-sync: ${name}: ${e.path}/deck.html is not in ${full.slice(0, 12)}`);
    const dir = path.join(root, 'examples', name);
    // 写しでない sample.json（本のサンプル）は残す
    const keepSample = !files.includes('sample.json') && fs.existsSync(path.join(dir, 'sample.json')) ? fs.readFileSync(path.join(dir, 'sample.json')) : null;
    fs.rmSync(dir, { recursive: true, force: true });
    const hashes = {};
    for (const f of files) {
      const buf = git(clone, ['show', `${full}:${e.path}/${f}`], 'buffer');
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), buf);
      hashes[f] = sha(buf);
    }
    if (keepSample) fs.writeFileSync(path.join(dir, 'sample.json'), keepSample);
    const src = { repository: idx.repository, commit: full, path: e.path, files: hashes, note: NOTE };
    fs.writeFileSync(path.join(dir, 'SOURCE.json'), JSON.stringify(src, null, 2) + '\n');
    log(`${name}: ${files.length} files from ${e.path} at ${full.slice(0, 12)}`);
  }
}

export function check({ root = ROOT, lessons = null } = {}) {
  const idx = readIndex(root);
  const errs = [];
  for (const e of idx.examples) {
    const dir = path.join(root, 'examples', e.name);
    if (!fs.existsSync(path.join(dir, 'deck.html'))) { errs.push(`${e.name}: examples/${e.name}/deck.html is missing`); continue; }
    const srcFile = path.join(dir, 'SOURCE.json');
    if (!e.path) { if (fs.existsSync(srcFile)) errs.push(`${e.name}: has SOURCE.json but no path in examples/index.json`); continue; }
    if (!fs.existsSync(srcFile)) { errs.push(`${e.name}: SOURCE.json is missing (node tools/examples-sync.mjs <clone> --commit <sha> ${e.name})`); continue; }
    const src = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
    if (src.path !== e.path) errs.push(`${e.name}: SOURCE.json path ${src.path} differs from examples/index.json ${e.path}`);
    if (src.repository !== idx.repository) errs.push(`${e.name}: SOURCE.json repository ${src.repository} differs from examples/index.json ${idx.repository}`);
    if (!/^[0-9a-f]{40}$/.test(src.commit || '')) errs.push(`${e.name}: SOURCE.json commit is not a full sha`);
    const disk = walk(dir).filter((f) => f !== 'SOURCE.json' && !(f === 'sample.json' && !('sample.json' in src.files)));
    for (const f of disk) if (!(f in src.files)) errs.push(`${e.name}: ${f} is not in SOURCE.json (not a copy)`);
    for (const [f, h] of Object.entries(src.files)) {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) errs.push(`${e.name}: ${f} is missing`);
      else if (sha(fs.readFileSync(p)) !== h) errs.push(`${e.name}: ${f} differs from its copy (edited here? change egatari/examples and copy again)`);
    }
  }
  if (lessons) {
    const site = JSON.parse(fs.readFileSync(lessons, 'utf8'));
    const bySite = new Map((site.lessons || []).map((l) => [l.id, l.section]));
    for (const e of idx.examples) if (bySite.has(e.name) && bySite.get(e.name) !== e.section) errs.push(`${e.name}: section ${e.section}, but egatari.org's lessons.json says ${bySite.get(e.name)}`);
    // 表紙の絵：サイトにある絵（<lessons.json のフォルダ>/covers/<id>.webp）と Studio の examples/_covers/<名前>.webp が同じバイトか（tools/example-covers.mjs --site が写す）
    const coversDir = path.join(path.dirname(lessons), 'covers');
    for (const e of idx.examples) {
      const siteCover = path.join(coversDir, e.name + '.webp'), mine = path.join(root, 'examples', '_covers', e.name + '.webp');
      if (!bySite.has(e.name) || !fs.existsSync(siteCover)) continue;
      if (!fs.existsSync(mine) || sha(fs.readFileSync(mine)) !== sha(fs.readFileSync(siteCover))) errs.push(`${e.name}: the cover differs from egatari.org's covers/${e.name}.webp (node tools/example-covers.mjs --site <site>/src/gallery ${e.name})`);
    }
    const siteSections = new Map((site.sections || []).map((s) => [s.id, s]));
    for (const s of idx.sections) {
      const t = siteSections.get(s.id);
      if (!t) errs.push(`section ${s.id} is not in egatari.org's lessons.json`);
      else if ((t.title || '') !== s.title.ja || (t.subtitle || '') !== s.subtitle.ja) errs.push(`section ${s.id}: ${s.title.ja}／${s.subtitle.ja} differs from egatari.org's ${t.title}／${t.subtitle}`);
    }
  }
  return errs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a.splice(i, 2)[1] : null; };
  try {
    if (a.includes('--check')) {
      a.splice(a.indexOf('--check'), 1);
      const lessons = opt('--lessons');
      const errs = check({ lessons });
      for (const e of errs) console.error('examples-sync: ' + e);
      if (errs.length) process.exit(1);
      const n = readIndex().examples.filter((e) => e.path).length;
      console.log(`examples-sync: ${n} copies match their SOURCE.json${lessons ? '; sections and covers match egatari.org' : ''}`);
    } else {
      const commit = opt('--commit');
      const all = a.includes('--all');
      const rest = a.filter((x) => x !== '--all');
      const clone = rest.shift();
      if (!clone || !commit || (!all && !rest.length)) { console.error('usage: node tools/examples-sync.mjs <examples clone> --commit <sha> <name>… | --all\n       node tools/examples-sync.mjs --check [--lessons <lessons.json>]'); process.exit(2); }
      const names = all ? readIndex().examples.filter((e) => e.path).map((e) => e.name) : rest;
      sync(path.resolve(clone), commit, names);
    }
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
