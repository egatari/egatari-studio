// Egatari Play (play/, play.egatari.org) を組む：_play/ に静的なファイル一式を書く（説明は docs/play.md）
//   node tools/build-play.mjs [--out _play] [--live-endpoint https://live.example.org …] [--dev-loopback] [--version-tag <字>]
//   --live-endpoint  このページが自分でつないでよいライブの部屋の origin（くり返せる。既定は FORMAT.LIVE_ENDPOINT だけ）。
//                    ほかの endpoint の教材には、参加のページへのリンクだけを出す。ページの CSP の connect-src にも同じものを書く
//   --dev-loopback   ループバックの http: の部屋を許す（試験だけ。配る版には付けない）
//   --version-tag    版の名前に足す字（試験で「新しい版」を作るため）
// 実行系（kit/）は写さない：kit/core/link-policy.mjs・live-policy.mjs・bounded-html.mjs（parse5）と app/preview-doc.js を esbuild で取り込む
// 書くもの：index.html・guard.js・play.css・play.js（本体）・reader.js（教材を読む Worker）・sw.js（版つき。自分のファイルだけを覚える）・
// manifest.webmanifest（share_target）・icons/（assets/logo の 192・512 px ほか）・_headers（CSP・枠の中を断る。Cloudflare の静的なファイルの見出し）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { FORMAT } from '../kit/core/format.mjs';
import { LivePolicy } from '../kit/core/live-policy.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (...p) => path.join(ROOT, ...p);

export function parseArgs(argv) {
  const o = { out: rel('_play'), endpoints: [], devLoopback: false, tag: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--live-endpoint') o.endpoints.push(argv[++i]);
    else if (a === '--dev-loopback') o.devLoopback = true;
    else if (a === '--version-tag') o.tag = String(argv[++i] || '');
    else throw new Error(`build-play: unknown argument ${a}`);
  }
  if (!o.endpoints.length) o.endpoints.push(FORMAT.LIVE_ENDPOINT);
  return o;
}

// the page's policy. A srcdoc lesson inherits it (and adds the preview policy of its trusted prefix, which narrows
// connect-src to 'none'): so it allows what lessons need (inline scripts and styles, data: and blob:), and nothing else.
export function pageCsp(endpoints, policy) {
  const connect = ["'self'", ...endpoints.map((e) => policy.connectSrc(e))].join(' ');
  return [
    "default-src 'none'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
    'media-src data: blob:', `connect-src ${connect}`, "worker-src 'self'", "manifest-src 'self'", "frame-src 'none'", "object-src 'none'",
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
  ].join('; ');
}
export const PERMISSIONS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), display-capture=(), publickey-credentials-get=()';

export function headersFile(csp) {
  return [
    '# Egatari Play: response headers for every file (Cloudflare Workers static assets and Pages read this file; docs/play.md).',
    '# Self-hosting: send the same headers from your server. A host that cannot send headers (e.g. GitHub Pages) cannot refuse framing.',
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    `  Permissions-Policy: ${PERMISSIONS}`,
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Cross-Origin-Resource-Policy: same-origin',
    '/sw.js',
    '  Cache-Control: no-cache',
    '',
  ].join('\n');
}

const MANIFEST = {
  id: './',
  name: 'Egatari Play',
  short_name: 'Egatari Play',
  description: 'Egatari ファイル（.ega.html）をこの端末で開いて再生します / Open and play Egatari files (.ega.html) on this device',
  lang: 'ja',
  dir: 'ltr',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#4A488E',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
  share_target: {
    action: './share',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'lesson', accept: ['text/html', '.html', '.htm'] }] },
  },
};

const ICONS = [['icon-192.png'], ['icon-512.png'], ['favicon.ico'], ['apple-touch-icon.png'], ['egatari-32-light.svg'], ['egatari-32-dark.svg']];

export async function buildPlay(opts) {
  const policy = LivePolicy({ allowLoopback: opts.devLoopback });
  const endpoints = [];
  for (const e of opts.endpoints) {
    const u = policy.parseEndpoint(e);
    if (!u) throw new Error(`build-play: --live-endpoint ${e} is not an https origin${opts.devLoopback ? ' (or a loopback http origin)' : ''}`);
    if (!endpoints.includes(u.origin)) endpoints.push(u.origin);
  }
  const out = opts.out;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(rel('package.json'), 'utf8'));
  const files = {};   // published path → bytes (all but sw.js and _headers)
  const shim = fs.readFileSync(rel('play', 'lesson-shim.js'), 'utf8');
  const common = { bundle: true, write: false, platform: 'browser', target: ['es2020', 'safari15'], legalComments: 'none', minify: true, logLevel: 'silent' };
  const define = (v) => ({ __PLAY_VERSION__: JSON.stringify(v), __PLAY_LIVE__: JSON.stringify(endpoints), __PLAY_DEV__: String(!!opts.devLoopback), __LESSON_SHIM__: JSON.stringify(shim) });
  const bundleMain = async (v) => (await esbuild.build({ ...common, entryPoints: [rel('play', 'main.js')], format: 'esm', define: define(v) })).outputFiles[0].text;
  const worker = await esbuild.build({ ...common, entryPoints: [rel('play', 'reader-worker.mjs')], format: 'iife' });
  files['reader.js'] = Buffer.from(worker.outputFiles[0].text);
  for (const f of ['index.html', 'guard.js', 'play.css']) files[f] = fs.readFileSync(rel('play', f));
  for (const [f] of ICONS) files['icons/' + f] = fs.readFileSync(rel('assets', 'logo', f));
  files['manifest.webmanifest'] = Buffer.from(JSON.stringify(MANIFEST, null, 2) + '\n');
  // the version: package version + a hash of every file (the main bundle built without a version)
  const h = crypto.createHash('sha256');
  h.update(await bundleMain(''));
  for (const k of Object.keys(files).sort()) { h.update(k); h.update(files[k]); }
  h.update(opts.tag || '');
  const version = `${pkg.version}-${h.digest('hex').slice(0, 10)}${opts.tag ? '-' + opts.tag.replace(/[^A-Za-z0-9._-]/g, '') : ''}`;
  files['play.js'] = Buffer.from(await bundleMain(version));
  // the page is cached as ./ only (Cloudflare's html_handling redirects /index.html to /; a redirected response cannot answer a navigation)
  const list = ['./', ...Object.keys(files).filter((f) => f !== 'index.html').sort().map((f) => './' + f)];
  const sw = fs.readFileSync(rel('play', 'sw.js'), 'utf8').replace("'__VERSION__'", JSON.stringify(version)).replace('__FILES__', JSON.stringify(list));
  for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(out, ...k.split('/')), v);
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  const csp = pageCsp(endpoints, policy);
  fs.writeFileSync(path.join(out, '_headers'), headersFile(csp));
  return { out, version, files: list, csp, endpoints };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = await buildPlay(parseArgs(process.argv.slice(2)));
    console.log(`build-play: ${path.relative(process.cwd(), r.out) || '.'} (version ${r.version}, ${r.files.length} files cached by the service worker; Live endpoints: ${r.endpoints.join(', ')})`);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
