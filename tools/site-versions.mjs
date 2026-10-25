// 版ごとの編集アプリ（#32）：公開のサイトは根に最新版、/vX.Y.Z/ に各リリースの凍結した写しを置く（docs/editor.md「Versions」、RELEASING.md）
//   node tools/site-versions.mjs asset <vX.Y.Z>… [--out out/site]
//       タグごとに git worktree（一時フォルダ）・npm ci・build-app で編集アプリを組み、editor-site-vX.Y.Z.tar.gz（dist の中身。並びと時刻を
//       固定した ustar + gzip）と、リリースの説明に足す sha256 の行（editor-site-vX.Y.Z.sha256.txt）を作る。どこにも上げない（上げてリリースの説明に sha256 を書くコマンドを出す）
//   node tools/site-versions.mjs verify <vX.Y.Z>… [--repo owner/name]
//       リリースに添えた tar.gz を取り、リリースの説明に書いた sha256（と GitHub の記録する digest）と合うか確かめる
//   node tools/site-versions.mjs assemble --site _site [--current vX.Y.Z] [--repo owner/name]
//       pages のワークフローが使う：_site（いま組んだ版。根に置く）に、その写しを _site/v<今の版>/ に、前の各リリースの tar.gz を取って
//       確かめて _site/vX.Y.Z/ に広げ、_site/versions.json を書く。案内を持たない古い写しには ../version-notice.js を読み込ませる
// リリースの説明の sha256 の行：「editor-site-vX.Y.Z.tar.gz sha256: <64 字>」（shaLine）。tar.gz のないリリース（v0.4.0 まで）は飛ばす。
// tar.gz があるのに sha256 の行がない・合わない・中身に変なパスがあれば失敗（その版を置かずに公開しない）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cmpVersion, MARK } from '../app/version-ui.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const VERSION_DIR = /^v(\d+\.\d+\.\d+)$/;
export const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;
export const assetName = (version) => `editor-site-v${version}.tar.gz`;
export const shaLine = (version, hex) => `${assetName(version)} sha256: ${hex}`;
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// GitHub Pages のサイトの上限は 1 GB（版ごとに約 50 MB）
export const SITE_WARN = 800 * 1048576, SITE_MAX = 1000 * 1048576;
const MAX_UNPACKED = 512 * 1048576;   // 1 つの版の中身の上限（壊れた・細工した tar.gz を広げすぎない）

// ---------------------------------------------------------------- tar（ustar。ファイルだけ、名前の順、時刻 0、所有者 0、0644）
function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(dir, rel));
    else if (e.isFile()) out.push(rel);
    else throw new Error(`${rel}: not a regular file`);
  }
  return out;
}
function octal(buf, off, len, n) { buf.write(n.toString(8).padStart(len - 1, '0') + '\0', off, len, 'ascii'); }
function header(name, size) {
  const h = Buffer.alloc(512);
  let prefix = '', nm = name;
  if (Buffer.byteLength(nm) > 100) {
    // 前（prefix、155 バイトまで）と名前（100 バイトまで）に / で分ける。前をできるだけ短く
    let cut = -1;
    for (let j = name.indexOf('/'); j >= 0; j = name.indexOf('/', j + 1)) if (Buffer.byteLength(name.slice(j + 1)) <= 100) { cut = j; break; }
    if (cut < 0 || Buffer.byteLength(name.slice(0, cut)) > 155) throw new Error(`${name}: path too long for ustar`);
    prefix = name.slice(0, cut); nm = name.slice(cut + 1);
  }
  h.write(nm, 0, 100, 'utf8');
  octal(h, 100, 8, 0o644); octal(h, 108, 8, 0); octal(h, 116, 8, 0); octal(h, 124, 12, size); octal(h, 136, 12, 0);
  h.fill(' ', 148, 156);
  h.write('0', 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii'); h.write('00', 263, 2, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}
// dir の中身（dir 自身は入れない）→ tar.gz のバイト
export function packSite(dir) {
  const parts = [];
  for (const rel of walk(dir).sort()) {
    const data = fs.readFileSync(path.join(dir, rel));
    parts.push(header(rel, data.length), data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  const gz = zlib.gzipSync(Buffer.concat(parts), { level: 9 });
  gz[9] = 255;   // 作った機械の OS を書かない（どこで作っても同じバイトに）
  return gz;
}
// 安全なパスか（相対・.. なし・空の段なし・\ なし）
export function safeRel(p) {
  return typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !p.includes('\\') && !p.includes('\0') && p.split('/').every((s) => s && s !== '.' && s !== '..');
}
// tar.gz のバイト → [{name, data}]（ファイルとフォルダだけ。リンク・pax などは断る）
export function readTar(gz) {
  const tar = zlib.gunzipSync(gz, { maxOutputLength: MAX_UNPACKED });
  const out = [];
  for (let off = 0; off + 512 <= tar.length;) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, b) => { const s = h.subarray(a, b); const z = s.indexOf(0); return (z >= 0 ? s.subarray(0, z) : s).toString('utf8'); };
    let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (parseInt(str(148, 156).trim(), 8) !== sum) throw new Error(`tar: bad header checksum at ${off}`);
    const type = String.fromCharCode(h[156] || 48), size = parseInt(str(124, 136).trim() || '0', 8);
    const prefix = str(345, 500), name = (prefix ? prefix + '/' : '') + str(0, 100).replace(/\/$/, '');
    if (!safeRel(name)) throw new Error(`tar: unsafe path ${JSON.stringify(name)}`);
    off += 512;
    if (type === '0') { if (off + size > tar.length) throw new Error(`tar: ${name} is cut short`); out.push({ name, data: tar.subarray(off, off + size) }); }
    else if (type !== '5') throw new Error(`tar: ${name}: entry type ${JSON.stringify(type)} is not allowed`);
    off += Math.ceil(size / 512) * 512;
  }
  return out;
}
export function unpackSite(gz, dest) {
  const entries = readTar(gz);
  const seen = new Set();
  for (const { name, data } of entries) {
    if (seen.has(name)) throw new Error(`tar: duplicate ${name}`);
    seen.add(name);
    const to = path.join(dest, ...name.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, data);
  }
  return entries.length;
}

// ---------------------------------------------------------------- 確かめる
// リリースの説明から、その版の tar.gz の sha256 を読む（なければ null）
export function recordedSha(body, version) {
  const name = assetName(version).replace(/[.]/g, '\\.');
  const m = new RegExp(`${name}\\W+sha256\\W+([0-9a-fA-F]{64})\\b`).exec(String(body || ''));
  return m ? m[1].toLowerCase() : null;
}
// buf が説明の sha256（必ず）と GitHub の digest（あれば）に合うか。合わなければ投げる
export function verifyAsset(buf, { version, body, digest }) {
  const want = recordedSha(body, version), got = sha256(buf);
  if (!want) throw new Error(`v${version}: the release has ${assetName(version)} but its notes do not record "${shaLine(version, '<sha256>')}"`);
  if (got !== want) throw new Error(`v${version}: ${assetName(version)} sha256 ${got} does not match the release notes (${want})`);
  if (digest && digest.toLowerCase() !== 'sha256:' + got) throw new Error(`v${version}: ${assetName(version)} does not match GitHub's digest ${digest}`);
  return got;
}

// ---------------------------------------------------------------- 組み立て
// 案内（version-ui.js）を持たない写しの index.html・editor.html に ../version-notice.js を読み込ませる → 書き換えたファイル
export function injectNotice(dir) {
  const changed = [];
  const app = path.join(dir, 'app.js');
  if (fs.existsSync(app) && fs.readFileSync(app, 'utf8').includes(MARK)) return changed;
  for (const f of ['index.html', 'editor.html']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, 'utf8');
    if (html.includes(MARK)) continue;
    // 決まり（CSP の <meta>）の直後に（script-src 'self' で読める）
    const m = /<meta http-equiv="Content-Security-Policy"[^>]*>/i.exec(html.slice(0, 20000));
    if (!m) throw new Error(`${p}: no CSP meta to put the version notice after`);
    const at = m.index + m[0].length;
    fs.writeFileSync(p, html.slice(0, at) + `\n<script src="../version-notice.js" defer data-${MARK}></script>` + html.slice(at));
    changed.push(f);
  }
  return changed;
}
const dirBytes = (d) => walk(d).reduce((n, f) => n + fs.statSync(path.join(d, f)).size, 0);
// site：いま組んだ版（根）。current："0.4.3"。releases：[{version, buf, body, digest}]（前のリリースの tar.gz。current と同じ版は使わない）
// → {versions, sizes, injected}
export function assemble({ site, current, releases = [], log = console.log }) {
  if (!fs.existsSync(path.join(site, 'index.html'))) throw new Error(`${site}: no index.html (build the editor first)`);
  if (!/^\d+\.\d+\.\d+$/.test(current)) throw new Error(`bad current version ${current}`);
  for (const e of fs.readdirSync(site)) if (VERSION_DIR.test(e)) fs.rmSync(path.join(site, e), { recursive: true, force: true });
  fs.rmSync(path.join(site, 'versions.json'), { force: true });
  const rootFiles = fs.readdirSync(site);
  const cur = path.join(site, 'v' + current);
  fs.mkdirSync(cur);
  for (const e of rootFiles) fs.cpSync(path.join(site, e), path.join(cur, e), { recursive: true });
  const versions = [current], sizes = { [current]: dirBytes(cur) }, injected = {};
  for (const r of releases) {
    if (r.version === current || versions.includes(r.version)) continue;
    verifyAsset(r.buf, r);
    const d = path.join(site, 'v' + r.version);
    const n = unpackSite(r.buf, d);
    if (!fs.existsSync(path.join(d, 'index.html'))) throw new Error(`v${r.version}: ${assetName(r.version)} has no index.html`);
    const inj = injectNotice(d);
    if (inj.length) injected[r.version] = inj;
    versions.push(r.version); sizes[r.version] = dirBytes(d);
    log(`v${r.version}: ${n} files, ${(sizes[r.version] / 1048576).toFixed(1)} MB${inj.length ? ` (version notice added to ${inj.join(', ')})` : ''}`);
  }
  versions.sort(cmpVersion);
  fs.writeFileSync(path.join(site, 'versions.json'), JSON.stringify({ root: current, versions }, null, 1) + '\n');
  const total = dirBytes(site);
  log(`site: root v${current} + ${versions.map((v) => 'v' + v).join(', ')}: ${(total / 1048576).toFixed(0)} MB`);
  if (total > SITE_MAX) throw new Error(`site is ${(total / 1048576).toFixed(0)} MB, over the GitHub Pages limit (1 GB): leave out the oldest versions`);
  if (total > SITE_WARN) log(`warning: site is ${(total / 1048576).toFixed(0)} MB; GitHub Pages allows 1 GB`);
  return { versions, sizes, injected, total };
}

// ---------------------------------------------------------------- GitHub（gh）
const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1048576, ...opts });
function repoOf(args) { const i = args.indexOf('--repo'); return i >= 0 ? args[i + 1] : process.env.GITHUB_REPOSITORY || 'egatari/egatari-studio'; }
// 公開したリリース（下書き・候補を除く）→ [{version, tag, body, asset: {name, digest} | null}]
export function listReleases(repo) {
  const out = gh(['api', '--paginate', `repos/${repo}/releases`, '--jq', '.[] | {tag: .tag_name, draft, prerelease, body, assets: [.assets[] | {name, digest}]}']);
  return out.split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => !r.draft && !r.prerelease && RELEASE_TAG.test(r.tag))
    .map((r) => { const version = RELEASE_TAG.exec(r.tag)[1]; return { version, tag: r.tag, body: r.body || '', asset: r.assets.find((a) => a.name === assetName(version)) || null }; })
    .sort((a, b) => cmpVersion(a.version, b.version));
}
function download(repo, r, dir) {
  gh(['release', 'download', r.tag, '--repo', repo, '--pattern', r.asset.name, '--dir', dir, '--clobber'], { stdio: ['ignore', 'pipe', 'inherit'] });
  return fs.readFileSync(path.join(dir, r.asset.name));
}
function fetchReleases(repo, { only = null, skip = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-site-'));
  const got = [];
  for (const r of listReleases(repo)) {
    if ((only && !only.includes(r.version)) || r.version === skip) continue;   // skip：今の版（いま組んだものを使う）
    if (!r.asset) { console.log(`v${r.version}: no ${assetName(r.version)} on the release; not included`); continue; }
    got.push({ version: r.version, body: r.body, digest: r.asset.digest || null, buf: download(repo, r, tmp) });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return got;
}

// ---------------------------------------------------------------- コマンド
const versionOfTag = (t) => { const m = RELEASE_TAG.exec(t); if (!m) throw new Error(`not a release tag: ${t} (vX.Y.Z)`); return m[1]; };
function cmdAsset(args) {
  const oi = args.indexOf('--out');
  const OUT = path.resolve(oi >= 0 ? args[oi + 1] : path.join(ROOT, 'out', 'site'));
  const tags = args.filter((a, i) => !a.startsWith('--') && !(oi >= 0 && i === oi + 1));
  if (!tags.length) throw new Error('usage: node tools/site-versions.mjs asset <vX.Y.Z>… [--out out/site]');
  fs.mkdirSync(OUT, { recursive: true });
  const lines = [];
  for (const tag of tags) {
    const version = versionOfTag(tag);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-asset-'));
    const src = path.join(tmp, 'src'), site = path.join(tmp, 'site');
    const run = (cmd, a, cwd) => execFileSync(cmd, a, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm' });
    try {
      run('git', ['-C', ROOT, 'worktree', 'add', '--detach', src, tag]);
      const v = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version;
      if (v !== version) throw new Error(`${tag}: package.json says ${v}`);
      run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], src);   // インストールのスクリプトは走らせない（SECURITY.md）
      run(process.execPath, [path.join(src, 'tools', 'build-app.mjs'), '--out', site], src);
      const gz = packSite(site), file = path.join(OUT, assetName(version)), hex = sha256(gz);
      fs.writeFileSync(file, gz);
      fs.writeFileSync(path.join(OUT, `editor-site-v${version}.sha256.txt`), shaLine(version, hex) + '\n');   // リリースの説明に足す行
      lines.push({ tag, version, file, hex });
      console.log(`${file}: ${(gz.length / 1048576).toFixed(1)} MB, sha256 ${hex}`);
    } finally {
      try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', src], { stdio: 'ignore' }); } catch { /* なかった */ }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  const rel = (f) => { const r = path.relative(process.cwd(), f); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : f; };
  console.log('\nNot uploaded. To attach each asset and record its sha256 in the release notes:\n');
  for (const x of lines) {
    console.log(`gh release upload ${x.tag} ${rel(x.file)}`);
    const notes = rel(path.join(OUT, `notes-${x.tag}.md`));
    console.log(`gh release view ${x.tag} --json body -q .body > ${notes} && printf '\\n%s\\n' '${shaLine(x.version, x.hex)}' >> ${notes} && gh release edit ${x.tag} --notes-file ${notes}`);
  }
  console.log(`node tools/site-versions.mjs verify ${lines.map((x) => x.tag).join(' ')}`);
}
function cmdVerify(args) {
  const repo = repoOf(args);
  const tags = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--repo');
  const want = tags.map(versionOfTag);
  const got = fetchReleases(repo, { only: want.length ? want : null });
  let bad = 0;
  for (const v of want) if (!got.some((r) => r.version === v)) { console.error(`v${v}: no ${assetName(v)} on the release`); bad++; }
  for (const r of got) {
    try {
      const hex = verifyAsset(r.buf, r);
      const n = readTar(r.buf);
      if (!n.some((e) => e.name === 'index.html')) throw new Error(`v${r.version}: no index.html in ${assetName(r.version)}`);
      console.log(`v${r.version}: ok (${n.length} files, sha256 ${hex})`);
    } catch (e) { console.error(e.message); bad++; }
  }
  if (bad) process.exit(1);
}
function cmdAssemble(args) {
  const si = args.indexOf('--site'), ci = args.indexOf('--current');
  if (si < 0) throw new Error('usage: node tools/site-versions.mjs assemble --site _site [--current vX.Y.Z] [--repo owner/name]');
  const site = path.resolve(args[si + 1]);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const current = ci >= 0 ? versionOfTag(args[ci + 1]) : pkg;
  if (current !== pkg) throw new Error(`--current v${current} but package.json is ${pkg} (tag the release commit)`);
  assemble({ site, current, releases: fetchReleases(repoOf(args), { skip: current }) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'asset') cmdAsset(rest);
    else if (cmd === 'verify') cmdVerify(rest);
    else if (cmd === 'assemble') cmdAssemble(rest);
    else { console.error('usage: node tools/site-versions.mjs asset|verify|assemble …'); process.exit(2); }
  } catch (e) { console.error(e.message || e); process.exit(1); }
}
