// Build the site player (play/site-player.mjs; docs/viewer.md "Site player"): the files a static site vendors to play its
// sample lessons the way Egatari Viewer plays a file.
//   node tools/build-site-player.mjs [--out _site-player]
// Writes site-play.js (one ES module: the Viewer's frame, trusted prefix, lesson shim and link box), site-play.css, and
// BUILD.json (Studio version and commit, SHA-256 of each file, and the page policy below). The site's page must carry
// PAGE_CSP as its first <meta http-equiv="Content-Security-Policy"> (a host like GitHub Pages cannot send headers); the
// lesson's srcdoc document inherits it, under the trusted prefix's own preview policy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { readRegular, readRegularText } from '../kit/bounded-read.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (...p) => path.join(ROOT, ...p);

// the Viewer's page policy (tools/build-play.mjs pageCsp) without Live: connect-src is this site only (the lock and the file),
// and frame-ancestors is left out (ignored in <meta>; the player refuses to run framed instead)
export const PAGE_CSP = [
  "default-src 'none'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  'media-src data: blob:', "connect-src 'self'", "worker-src 'none'", "manifest-src 'self'", "frame-src 'none'", "object-src 'none'",
  "base-uri 'none'", "form-action 'none'",
].join('; ');

export async function buildSitePlayer({ out = rel('_site-player') } = {}) {
  const pkg = JSON.parse(readRegularText(rel('package.json'), { max: 1024 * 1024 }).text);
  let commit = '';
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { commit = ''; }
  try { if (commit && execFileSync('git', ['status', '--porcelain', '--', 'play', 'app', 'kit/core'], { cwd: ROOT, encoding: 'utf8' }).trim()) commit += '+dirty'; } catch { /* no git */ }
  const shim = readRegularText(rel('play', 'lesson-shim.js'), { max: 1024 * 1024 }).text;
  for (const bad of [/<\/script/i, /<!--/]) if (bad.test(shim)) throw new Error(`build-site-player: play/lesson-shim.js contains ${bad.source}`);
  const version = `${pkg.version}${commit ? '-' + commit.slice(0, 10) : ''}`;
  const r = await esbuild.build({
    entryPoints: [rel('play', 'site-player.mjs')], bundle: true, write: false, platform: 'browser', format: 'esm', target: ['es2020', 'safari15'],
    legalComments: 'none', minify: true, logLevel: 'silent',
    define: { __LESSON_SHIM__: JSON.stringify(shim), __SITE_PLAYER_VERSION__: JSON.stringify(version) },
  });
  const banner = `/* Egatari site player ${version} (egatari/egatari-studio play/site-player.mjs; built by tools/build-site-player.mjs). MIT */\n`;
  const files = { 'site-play.js': Buffer.from(banner + r.outputFiles[0].text), 'site-play.css': readRegular(rel('play', 'site-player.css'), { max: 1024 * 1024 }) };
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const sums = {};
  for (const [k, v] of Object.entries(files)) { fs.writeFileSync(path.join(out, k), v); sums[k] = crypto.createHash('sha256').update(v).digest('hex'); }
  const build = { studio: pkg.version, commit, version, sha256: sums, pageCsp: PAGE_CSP };
  fs.writeFileSync(path.join(out, 'BUILD.json'), JSON.stringify(build, null, 2) + '\n');
  return { out, ...build };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--out');
  const b = await buildSitePlayer(i >= 0 ? { out: path.resolve(a[i + 1]) } : {});
  console.log(`build-site-player: ${path.relative(process.cwd(), b.out)} (${b.version}); page policy:\n${b.pageCsp}`);
}
