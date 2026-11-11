// 版ごとの編集アプリ（#32）：公開のサイトは根に最新版、/vX.Y.Z/ に各リリースの凍結した写しを置く（docs/editor.md「Versions」、RELEASING.md）
//   node tools/site-versions.mjs asset <vX.Y.Z>… [--out out/site]
//       タグごとに git worktree（一時フォルダ）・npm ci・build-app で編集アプリを組み、editor-site-vX.Y.Z.tar.gz（dist の中身。並びと時刻を
//       固定した ustar + gzip）と、リリースの説明に足す sha256 の行（editor-site-vX.Y.Z.sha256.txt）を作る。どこにも上げない（上げてリリースの説明に sha256 を書くコマンドを出す）
//   node tools/site-versions.mjs verify <vX.Y.Z>… [--repo owner/name]
//       リリースに添えた tar.gz を取り、リリースの説明に書いた sha256（と GitHub の記録する digest）と合うか確かめる
//   node tools/site-versions.mjs assemble --site _site [--current vX.Y.Z | vX.Y.Z-rc.N] [--repo owner/name]
//       pages のワークフローが使う：_site（いま組んだ版。根に置く）に、その写しを _site/v<今の版>/ に、前の各リリースの tar.gz を取って
//       確かめて _site/vX.Y.Z/ に広げ、_site/versions.json を書く。案内を持たない古い写しには ../version-notice.js を読み込ませる
//       パーツのサンプルのページ（_site/parts/v<パーツライブラリの版>/。build-app.mjs --parts、backlog #158）：版の写し（/vX.Y.Z/）には入れず、
//       前のリリースの tar.gz の parts/v<版>/ を _site/parts/ に移す。同じパーツライブラリの版は、最初に公開したリリース（Studio の版の小さいもの）のページを
//       残し（凍結）、いま組んだものは前のリリースにない版にだけ使う。_site/parts/index.html（版の一覧）と versions.json を書き直す
// リリースの説明の sha256 の行：「editor-site-vX.Y.Z.tar.gz sha256: <64 字>」（shaLine）。tar.gz のないリリース（v0.4.0 まで）は飛ばす。
// tar.gz があるのに sha256 の行がない・合わない・中身に変なパスがあれば失敗（その版を置かずに公開しない）
// 置く版の下限（HOSTED_FROM）より前のリリースは、tar.gz を取りも広げもせず、/vX.Y.Z/index.html に「もう置いていない」の小さなページ（stubHtml）だけを置く。
// そのページは versions.json に入れない（版の一覧に出ない）。tar.gz の名前が editor-site-vX.Y.Z.tar.gz でも .archived.tar.gz でも同じ
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cmpVersion, MARK } from '../app/version-ui.js';
import { PARTS_DIR } from '../app/parts-gallery.js';
import { writePartsIndex, partsCurrent, STATIC_PAGE_CSP } from './parts-gallery.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const VERSION_DIR = /^v(\d+\.\d+\.\d+)$/;
export const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;
// package.json の版：リリースは X.Y.Z、候補は X.Y.Z-rc.N（npm.yml のタグ vX.Y.Z-rc.N と同じ。RELEASING.md）
export const CURRENT_VERSION = /^(\d+\.\d+\.\d+)(-rc\.\d+)?$/;
export const assetName = (version) => `editor-site-v${version}.tar.gz`;
// 置くのをやめたリリースの tar.gz は、消さずにこの名前に変えてある（2026-11-06。v0.4.1〜v0.4.8）
export const archivedAssetName = (version) => `editor-site-v${version}.archived.tar.gz`;
// 置く版の下限（作者の決定、2026-11-06）：v0.6.5 のサイトが 1030 MB になり、GitHub Pages の上限（1 GB、SITE_MAX）で断られた。
// これより前のリリースは /vX.Y.Z/ に広げず、「もう置いていない」のページだけを置く（一式はそのリリースから取れる）。
// 上げるときは、この値を次に置く最も古い版にする（SITE_WARN の知らせが候補を挙げる）。tar.gz の名前を戻しても、下限より前の版はまた置かれない
export const HOSTED_FROM = '0.6.0';
// 置く前のリリースの数（作者の決定、2026-11-11：「1 つ前の版だけ持っていればよい。順次入れ替える」）：サイトは根の今の版（と /v<今の版>/）と、
//   今の版より前のリリースのうち新しい KEEP_PREVIOUS 個だけを置く。それより前は HOSTED_FROM より前と同じ「もう置いていない」のページ。
//   候補（X.Y.Z-rc.N）では X.Y.Z より前の新しい KEEP_PREVIOUS 個。HOSTED_FROM は下限として残す（これより前は数に関わらず置かない）
export const KEEP_PREVIOUS = 1;
// releases：公開したリリースの版（"0.6.8" など）。current："0.6.9" か "0.6.9-rc.1" → 置く最も古い版（なければ HOSTED_FROM）
export function hostedFloor(releases, current, { keep = KEEP_PREVIOUS, min = HOSTED_FROM } = {}) {
  const m = CURRENT_VERSION.exec(current);
  if (!m) throw new Error(`bad current version ${current}`);
  const prev = releases.filter((v) => cmpVersion(v, m[1]) > 0 && !belowFloor(v, min)).sort(cmpVersion);   // 今の版より前・新しい順
  return prev.length >= keep && keep > 0 ? prev[keep - 1] : min;
}
export const belowFloor = (version, floor = HOSTED_FROM) => cmpVersion(version, floor) > 0;   // cmpVersion は新しい順
export const DEFAULT_REPO = 'egatari/egatari-studio';
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
// 下限より前の版の /vX.Y.Z/index.html：日本語と英語で、もう置いていないこと・そのリリース（一式を取れる）・最新版（../）へのリンク。スクリプトなし
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const releaseUrl = (repo, version) => `https://github.com/${repo}/releases/tag/v${version}`;
export function stubHtml({ version, repo = DEFAULT_REPO }) {
  const v = escHtml('v' + version), rel = escHtml(releaseUrl(repo, version));
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${STATIC_PAGE_CSP}">
<meta name="robots" content="noindex">
<title>Egatari Studio ${v}</title>
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<style>
:root{--bg:#fff;--fg:#1d2433;--muted:#5b6475;--line:#d9dde5;--link:#1f5fbf}
@media (prefers-color-scheme:dark){:root{--bg:#14171d;--fg:#e8ebf1;--muted:#a3abba;--line:#323844;--link:#8fb3ff}}
body{margin:0 auto;max-width:44rem;padding:32px 16px;background:var(--bg);color:var(--fg);font:16px/1.7 system-ui,"Hiragino Sans","Noto Sans JP",sans-serif}
h1{font-size:1.5rem;margin:0 0 1rem}p{margin:.5rem 0}a{color:var(--link)}section+section{margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--line)}
</style>
</head>
<body>
<h1>Egatari Studio ${v}</h1>
<section>
<p>Egatari Studio ${v} は、このサイトにはもう置いていません。一式は <a href="${rel}">GitHub のリリース</a>から取れます。</p>
<p><a href="../">最新版を開く</a></p>
</section>
<section lang="en">
<p>Egatari Studio ${v} is no longer hosted on this site. You can download it from its <a href="${rel}">GitHub release</a>.</p>
<p><a href="../">Open the latest version</a></p>
</section>
</body>
</html>
`;
}
const dirBytes = (d) => walk(d).reduce((n, f) => n + fs.statSync(path.join(d, f)).size, 0);
// site：いま組んだ版（根）。current："0.4.3"。releases：[{version, buf, body, digest}]（前のリリースの tar.gz。current と同じ版は使わない。
// hostedFrom より前の版は buf を使わず（なくてよい）、「もう置いていない」のページだけ）。repo：そのページのリリースへのリンク。warnAt・maxAt は試験のため
// → {versions, stubs, sizes, injected, total, parts}
export function assemble({ site, current, releases = [], log = console.log, hostedFrom = HOSTED_FROM, repo = DEFAULT_REPO, warnAt = SITE_WARN, maxAt = SITE_MAX }) {
  if (!fs.existsSync(path.join(site, 'index.html'))) throw new Error(`${site}: no index.html (build the editor first)`);
  const cm = CURRENT_VERSION.exec(current);
  if (!cm) throw new Error(`bad current version ${current}`);
  // 候補（X.Y.Z-rc.N）：置かない版。/v<版>/ の写しは作らず、サイトの版の一覧は前のリリースだけ（根の版は直近のリリース）。パーツのサンプルは X.Y.Z（次のリリース）が公開したものとして扱う
  const rc = !!cm[2], base = cm[1];
  for (const e of fs.readdirSync(site)) if (VERSION_DIR.test(e)) fs.rmSync(path.join(site, e), { recursive: true, force: true });
  fs.rmSync(path.join(site, 'versions.json'), { force: true });
  const rootFiles = fs.readdirSync(site).filter((e) => e !== PARTS_DIR);
  const versions = [], stubs = [], sizes = {}, injected = {};
  if (!rc) {
    const cur = path.join(site, 'v' + current);
    fs.mkdirSync(cur);
    for (const e of rootFiles) fs.cpSync(path.join(site, e), path.join(cur, e), { recursive: true });
    versions.push(current); sizes[current] = dirBytes(cur);
  }
  // パーツのサンプルのページ：版 → それを公開した Studio の版（いま組んだものは current）
  const partsDir = path.join(site, PARTS_DIR), partsNow = partsCurrent(site);
  const partsFrom = {};
  for (const v of partsVersions(partsDir)) partsFrom[v] = base;
  for (const r of releases) {
    if (r.version === base || versions.includes(r.version) || stubs.includes(r.version)) continue;
    if (belowFloor(r.version, hostedFrom)) {
      const d = path.join(site, 'v' + r.version);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'index.html'), stubHtml({ version: r.version, repo }));
      stubs.push(r.version);
      log(`v${r.version}: below the hosting floor v${hostedFrom}; not hosted, /v${r.version}/ links to ${releaseUrl(repo, r.version)}`);
      continue;
    }
    verifyAsset(r.buf, r);
    const d = path.join(site, 'v' + r.version);
    const n = unpackSite(r.buf, d);
    if (!fs.existsSync(path.join(d, 'index.html'))) throw new Error(`v${r.version}: ${assetName(r.version)} has no index.html`);
    const moved = takeParts(d, partsDir, r.version, partsFrom);
    const inj = injectNotice(d);
    if (inj.length) injected[r.version] = inj;
    versions.push(r.version); sizes[r.version] = dirBytes(d);
    log(`v${r.version}: ${n} files, ${(sizes[r.version] / 1048576).toFixed(1)} MB${inj.length ? ` (version notice added to ${inj.join(', ')})` : ''}${moved.length ? ` (parts ${moved.map((v) => 'v' + v).join(', ')})` : ''}`);
  }
  const parts = writePartsIndex(site, partsNow, partsFrom);
  if (parts) log(`parts: ${parts.versions.map((v) => `v${v} (from Studio v${partsFrom[v]})`).join(', ')}; current v${parts.current}`);
  versions.sort(cmpVersion); stubs.sort(cmpVersion);
  const root = rc ? versions[0] : current;   // 候補では直近のリリース（なければ書かない）
  fs.writeFileSync(path.join(site, 'versions.json'), JSON.stringify(root ? { root, versions } : { versions }, null, 1) + '\n');
  const total = dirBytes(site);
  log(`site: root v${current}${rc ? ' (release candidate: not copied to /v…/; the list shows releases only)' : ''} + ${versions.map((v) => 'v' + v).join(', ')}: ${(total / 1048576).toFixed(0)} MB` +
    (stubs.length ? `; not hosted (below v${hostedFrom}): ${stubs.map((v) => 'v' + v).join(', ')}` : ''));
  const raise = () => { const c = floorCandidates(versions, current, sizes, total, warnAt); return c.drop.length ? ` Candidates for the next floor raise (HOSTED_FROM in tools/site-versions.mjs, now ${hostedFrom}): the oldest hosted versions ${c.drop.map((v) => `v${v} (${(sizes[v] / 1048576).toFixed(0)} MB)`).join(', ')}${c.next ? `; set HOSTED_FROM to '${c.next}'` : ''}.` : ''; };
  if (total > maxAt) throw new Error(`site is ${(total / 1048576).toFixed(0)} MB, over the GitHub Pages limit (1 GB).${raise()}`);
  if (total > warnAt) log(`warning: site is ${(total / 1048576).toFixed(0)} MB; GitHub Pages allows 1 GB.${raise()}`);
  return { versions, stubs, sizes, injected, total, parts };
}
// 下限を次に上げるときの候補：置いている版（今の版を除く）を古い順に、サイトが SITE_WARN 以下になるまで（少なくとも 1 つ）
// → {drop: 古い順, next: 新しい下限（残る最も古い版。なければ null）}
export function floorCandidates(versions, current, sizes = {}, total = 0, target = SITE_WARN) {
  const old = versions.filter((v) => v !== current).sort((a, b) => cmpVersion(b, a));   // 古い順
  const drop = [];
  for (const v of old) { if (drop.length && total <= target) break; drop.push(v); total -= sizes[v] || 0; }
  const next = versions.filter((v) => !drop.includes(v)).sort((a, b) => cmpVersion(b, a))[0] || null;
  return { drop, next };
}
// dir/v<版>/index.html のある版
function partsVersions(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((e) => VERSION_DIR.test(e) && fs.existsSync(path.join(dir, e, 'index.html'))).map((e) => VERSION_DIR.exec(e)[1]) : [];
}
// 前のリリースの写し d の parts/ を、サイトの parts/ に移す（その版をまだ誰も公開していないか、後の Studio の版が公開したものしかないときだけ）。
// 写しの parts/ は消す（/vX.Y.Z/parts/ は置かない）→ 移した版
export function takeParts(d, partsDir, studio, from) {
  const src = path.join(d, PARTS_DIR), moved = [];
  for (const v of partsVersions(src)) {
    if (from[v] && cmpVersion(from[v], studio) >= 0) continue;   // もっと前（か同じ）の Studio が公開した（cmpVersion は新しい順）
    fs.rmSync(path.join(partsDir, 'v' + v), { recursive: true, force: true });
    fs.mkdirSync(partsDir, { recursive: true });
    fs.cpSync(path.join(src, 'v' + v), path.join(partsDir, 'v' + v), { recursive: true });
    from[v] = studio;
    moved.push(v);
  }
  fs.rmSync(src, { recursive: true, force: true });
  return moved;
}

// ---------------------------------------------------------------- GitHub（gh）
const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1048576, ...opts });
function repoOf(args) { const i = args.indexOf('--repo'); return i >= 0 ? args[i + 1] : process.env.GITHUB_REPOSITORY || DEFAULT_REPO; }
// 公開したリリース（下書き・候補を除く）→ [{version, tag, body, asset: {name, digest} | null, archived: {name, digest} | null}]
//   asset：editor-site-vX.Y.Z.tar.gz、archived：editor-site-vX.Y.Z.archived.tar.gz（置くのをやめた版。下限より前の版の「もう置いていない」のページの目印にだけ使う）
export function parseReleases(out) {
  return out.split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => !r.draft && !r.prerelease && RELEASE_TAG.test(r.tag))
    .map((r) => {
      const version = RELEASE_TAG.exec(r.tag)[1];
      return { version, tag: r.tag, body: r.body || '', asset: r.assets.find((a) => a.name === assetName(version)) || null, archived: r.assets.find((a) => a.name === archivedAssetName(version)) || null };
    })
    .sort((a, b) => cmpVersion(a.version, b.version));
}
export function listReleases(repo) {
  return parseReleases(gh(['api', '--paginate', `repos/${repo}/releases`, '--jq', '.[] | {tag: .tag_name, draft, prerelease, body, assets: [.assets[] | {name, digest}]}']));
}
function download(repo, r, dir) {
  gh(['release', 'download', r.tag, '--repo', repo, '--pattern', r.asset.name, '--dir', dir, '--clobber'], { stdio: ['ignore', 'pipe', 'inherit'] });
  return fs.readFileSync(path.join(dir, r.asset.name));
}
// floor：これより前の版は tar.gz を取らず {version, stub: true} だけ（tar.gz がどちらの名前でもあるとき）。null なら下限なし（verify）
// list・get は試験のため差し替えられる
export function fetchReleases(repo, { only = null, skip = null, floor = HOSTED_FROM, log = console.log, list = listReleases, get = download } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-site-'));
  const got = [];
  for (const r of list(repo)) {
    if ((only && !only.includes(r.version)) || r.version === skip) continue;   // skip：今の版（いま組んだものを使う）
    if (floor && belowFloor(r.version, floor)) {
      if (r.asset || r.archived) got.push({ version: r.version, stub: true });
      else log(`v${r.version}: no ${assetName(r.version)} on the release; not included`);
      continue;
    }
    if (!r.asset) { log(`v${r.version}: no ${assetName(r.version)} on the release; not included`); continue; }
    got.push({ version: r.version, body: r.body, digest: r.asset.digest || null, buf: get(repo, r, tmp) });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return got;
}

// ---------------------------------------------------------------- コマンド
const versionOfTag = (t, allowRc = false) => { const m = (allowRc ? /^v(\d+\.\d+\.\d+(?:-rc\.\d+)?)$/ : RELEASE_TAG).exec(t); if (!m) throw new Error(`not a release tag: ${t} (vX.Y.Z)`); return m[1]; };
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
      run(process.execPath, [path.join(src, 'tools', 'build-app.mjs'), '--out', site, '--parts'], src);   // --parts：パーツのサンプルのページも（前の版の build-app は知らない引数を無視する）
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
  const got = fetchReleases(repo, { only: want.length ? want : null, floor: null });   // 下限より前の版の tar.gz も確かめられる
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
  if (si < 0) throw new Error('usage: node tools/site-versions.mjs assemble --site _site [--current vX.Y.Z[-rc.N]] [--repo owner/name]');
  const site = path.resolve(args[si + 1]);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const current = ci >= 0 ? versionOfTag(args[ci + 1], true) : pkg;
  if (!CURRENT_VERSION.test(pkg)) throw new Error(`package.json version ${pkg} is not X.Y.Z or X.Y.Z-rc.N`);
  if (current !== pkg) throw new Error(`--current v${current} but package.json is ${pkg} (tag the release commit)`);
  const repo = repoOf(args);
  const all = listReleases(repo);
  const floor = hostedFloor(all.map((r) => r.version), current);
  assemble({ site, current, repo, hostedFrom: floor, releases: fetchReleases(repo, { skip: current, floor, list: () => all }) });
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
