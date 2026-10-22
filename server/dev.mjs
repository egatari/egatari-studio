// 開発サーバー：ブラウザの上で原稿・口述原稿を直し、AI へのメモ（コメント）を残す
//   /          外枠（server/shell.js・server/editor-ui.js）。デッキは sandbox の iframe に入れ、編集の画面と合言葉は外枠にだけ置く
//   /preview   デッキの文書（知らせだけを送る server/hints.js 入り。合言葉なし、外へ繋がらない CSP と CSP の sandbox）。iframe に入れてよいのはここだけ。
//              外枠が読み込むたびに渡す印（?cap=…）と、ブラウザが付ける Sec-Fetch-Dest: iframe がそろったときだけ出す
//              （タブで直接開いた最上位の文書には、外枠の frame-src が効かないので、デッキを出さずに無害なページを返す。format spec §11）
//   /deck/…    原稿のフォルダのファイル（音声・画像・字はそのまま、ほかは文書として開けない形で。どれも CSP の sandbox 付き）
//   /__dev/…  読み書き（合言葉・同じ origin・JSON が要る）
//
//   node server/dev.mjs <deck.html> [--port 8730] [--theme 名前]   （使われていれば次の番号を順に試す）
//   npm run dev -- <deck.html>
//
// 127.0.0.1 だけで待ち受ける。説明は docs/dev-server.md
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rewriteNarration, narrationRev, rawTurns as narrRawTurns, splitKey, isStepKey } from '../kit/narration.mjs';
import { safeWriteFile, readContained, backupFile, pruneBackups } from '../kit/safe-fs.mjs';
import { READ_LIMITS, ReadOverError, utf8Length } from '../kit/bounded-read.mjs';
import { normPin, entryStrokes, strokesCentroid } from '../kit/core/comment-core.mjs';
import { userThemeDirs } from '../kit/theme-dirs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const BUILD = path.join(ROOT, 'kit', 'build.mjs');

// ---------------------------------------------------------------- 引数
const args = process.argv.slice(2);
// 既定は 8730（Vite の 5173 や 3000・8080 のようによく使われる番号を避ける）
let srcArg = null, port = 8730, portGiven = false, theme = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') { port = +args[++i]; portGiven = true; }
  else if (args[i] === '--theme') theme = args[++i];
  else srcArg = args[i];
}
if (!srcArg) { console.error('usage: node server/dev.mjs <deck.html> [--port 8730] [--theme name]'); process.exit(1); }
const SRC = path.resolve(srcArg);
if (!fs.existsSync(SRC)) { console.error('not found: ' + SRC); process.exit(1); }
const DIR = path.dirname(SRC);
// 書き込み・控え・読み出しは、どれも原稿のフォルダの実体（DIR_REAL）の中だけ（kit/safe-fs.mjs。リンクを通る書き込みは断る。format spec §11）
const DIR_REAL = fs.realpathSync(DIR);
const SRC_IN = path.join(DIR_REAL, path.basename(SRC));
const NARR = path.join(DIR_REAL, 'narration.md');
const COMMENTS = path.join(DIR_REAL, 'comments.json');
const EDITS_REL = path.join('.cache', 'edits');
const KEEP_EDITS = 30;

const short = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
// 書き込みと原稿の読み出しに要る合言葉（起動のたびに作り直す）。外枠のページ（/）にだけ埋め込み、server/shell.js が X-Deck-Token で送る。
// デッキの文書（/preview）には入れない：デッキは sandbox の iframe（origin を持たない）の中で動き、知らせ（server/hints.js）を送るだけ
const TOKEN = crypto.randomBytes(24).toString('hex');
// デッキの文書に入れる知らせの部品（そのまま <script> の中に入れるので、</script と <!-- を含んではいけない）
const HINTS = fs.readFileSync(path.join(HERE, 'hints.js'), 'utf8');
if (/<\/script|<!--/i.test(HINTS)) throw new Error('server/hints.js contains </script or <!-- (cannot be inlined)');
const HINTS_TAG = `<script>${HINTS}</script>`;
// /preview の印（capability）：外枠のページ（と発表者ビューの窓）を出すたびに 1 つ作り、そのページだけに入れる。新しい 64 個だけ覚える。
// 印だけでは足りない（デッキは自分の URL から印を知りうる）ので、Sec-Fetch-Dest: iframe（ページの script からは偽れない）も要る
const CAPS = new Map();
function issueCap() {
  const c = crypto.randomBytes(16).toString('hex');
  CAPS.set(c, Date.now());
  while (CAPS.size > 64) CAPS.delete(CAPS.keys().next().value);
  return c;
}
const capOk = (c) => typeof c === 'string' && /^[0-9a-f]{32}$/.test(c) && CAPS.has(c);
// 外枠が読み込む部品（合言葉を含まない。誰でも読める）
const STATIC = { '/__dev/shell.js': 'shell.js', '/__dev/editor-ui.js': 'editor-ui.js' };

// ---------------------------------------------------------------- 組み立て
let buildFn = null, buildVer = 0, needReimport = true;
let page = null;     // {html, error, slides, warn, lang, ranges}（ranges：この組み立てで直せる要素の data-src の範囲）
async function rebuild() {
  try {
    if (needReimport) { buildFn = (await import(pathToFileURL(BUILD).href + '?v=' + (++buildVer))).build; needReimport = false; }
    const r = buildFn(SRC, { dev: true, audioBase: '/deck/audio/', ...(theme ? { theme } : {}) });
    const inject = `${HINTS_TAG}\n`;
    const at = r.html.lastIndexOf('</body>');
    const html = at >= 0 ? r.html.slice(0, at) + inject + r.html.slice(at) : r.html + inject;
    const changed = !page || page.html !== html;
    const ranges = new Set([...r.html.matchAll(/ data-src="(\d+-\d+)" data-src-h="[0-9a-f]{8}"/g)].map((m) => m[1]));
    const lang = (/<html\b[^>]*\blang="([^"]*)"/i.exec(r.html) || [])[1] || 'ja';
    page = { html, error: null, slides: r.slides, warn: r.stats.warn.slice(), lang: /^en\b/i.test(lang) ? 'en' : 'ja', ranges };
    for (const w of r.stats.warn) console.warn('  ⚠ ' + w);
    return changed;
  } catch (e) {
    const changed = !page || page.error !== String(e.stack || e);
    page = { html: null, error: String(e.stack || e), slides: page?.slides || [], warn: [], lang: page?.lang || 'ja', ranges: new Set() };
    console.error('build error: ' + (e.message || e));
    return changed;
  }
}
function errorPage(err) {
  const esc = err.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>組み立てに失敗しました</title>
<style>body{margin:0;background:#2b1d1d;color:#fdd;font:15px/1.6 system-ui,sans-serif}
.box{max-width:960px;margin:48px auto;padding:24px 28px;background:#3a2222;border:1px solid #a44;border-radius:10px}
h1{font-size:20px;margin:0 0 12px;color:#fff}pre{white-space:pre-wrap;font:13px/1.5 ui-monospace,Menlo,monospace;color:#fcc}
p{color:#dbb}</style></head><body><div class="box"><h1>原稿を組み立てられませんでした</h1>
<p>原稿を直して保存すると、自動で読み込み直します。</p><pre>${esc}</pre></div>
</body></html>`;
}
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jsonInHtml = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
// 外枠のページ：デッキを sandbox の iframe（allow-same-origin なし）に入れ、編集の画面（server/editor-ui.js）を外に置く。合言葉はここだけ
function shellPage() {
  const cfg = { token: TOKEN, cap: issueCap(), lang: page?.lang || 'ja', warn: page?.warn || [] };
  return `<!DOCTYPE html><html lang="${cfg.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${escHtml(deckBase)} — dev</title><link rel="icon" href="data:,">
<style>html,body{margin:0;height:100%;background:#1b1b1b;overflow:hidden}body{display:flex;flex-direction:column}#wrap{display:flex;flex:1;min-height:0}#deck{flex:1;min-width:0;height:100%;border:0;display:block;background:#1b1b1b}
#dev-bar{flex:none;display:flex;align-items:center;height:22px;padding:0 12px;background:#111;color:#c9ced8;border-top:1px solid #2a2a2a}</style>
<script type="application/json" id="dev-cfg">${jsonInHtml(cfg)}</script>
</head><body><div id="wrap"><iframe id="deck" title="slides" sandbox="allow-scripts allow-modals" allow="fullscreen; autoplay"></iframe></div><div id="dev-bar"></div>
<script type="module" src="/__dev/shell.js"></script></body></html>`;
}
// 発表者ビューの窓（外枠が開く）：中のデッキも sandbox の iframe。外枠（opener）との間の知らせを中継するだけで、合言葉は持たない
function presenterPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Presenter — ${escHtml(deckBase)}</title><link rel="icon" href="data:,">
<style>html,body{margin:0;height:100%;background:#1b1b1b;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><script type="application/json" id="pres-cfg">${jsonInHtml({ cap: issueCap() })}</script><iframe id="pf" sandbox="allow-scripts allow-modals" allow="fullscreen" title="presenter"></iframe><script src="/__dev/presenter.js"></script></body></html>`;
}
const PRESENTER_JS = `var f=document.getElementById("pf"),n=0,cap=JSON.parse(document.getElementById("pres-cfg").textContent).cap;
function load(){f.src="/preview?presenter=1&cap="+encodeURIComponent(cap)+(n?"&_r="+n:"");n++;}
load();
addEventListener("message",function(e){
  var m=e.data||{};
  if(e.source===f.contentWindow){ if(opener&&!opener.closed) opener.postMessage({type:"app-pres-up",m:m},"*"); }
  else if(opener&&e.source===opener){ if(m.type==="app-pres-down"&&m.m) f.contentWindow&&f.contentWindow.postMessage(m.m,"*"); else if(m.type==="app-pres-reload") load(); }
});`;
// デッキの文書の決まり（Content-Security-Policy）：外へ繋がらない（connect-src 'none'）。読み込めるのは data: と blob: と、
// このサーバーの /deck/audio/（音声）だけ。iframe に入れられるのは /preview（発表者ビューの中の画面）だけ（/deck/ の下の文書は入れない）。
// フォームと <base> も使えない。sandbox は iframe の sandbox と同じ（直接開いたときも origin を持たず、ほかの窓を開けない）
const PREVIEW_PATH = '/preview';
const DECK_SANDBOX = 'sandbox allow-scripts allow-modals';
function selfOrigin(req) { return 'http://' + String(req.headers.host).toLowerCase(); }
function deckCsp(req) {
  const self = selfOrigin(req);
  return [DECK_SANDBOX, `default-src 'none'`, `script-src 'unsafe-inline' 'unsafe-eval'`, `style-src 'unsafe-inline'`, `img-src data: blob:`, `font-src data:`,
    `media-src data: blob: ${self}/deck/audio/`, `frame-src ${self}${PREVIEW_PATH}`, `connect-src 'none'`, `worker-src 'none'`, `object-src 'none'`,
    `manifest-src 'none'`, `form-action 'none'`, `base-uri 'none'`].join('; ');
}
// /deck/ の下のファイル：どれも CSP の sandbox（スクリプトは動かない）と default-src 'none'。音声・動画・画像・字は型のまま（sniff させない）、
// それ以外（HTML・SVG・XML・JS・テキストなど、文書として開けるもの）は text/plain か octet-stream にして、ダウンロードさせる（attachment）
const FILE_CSP = `sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'`;
const MEDIA_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.wav', '.mp3', '.m4a', '.ogg', '.opus', '.mp4', '.webm', '.woff2']);
const TEXT_EXT = new Set(['.html', '.htm', '.svg', '.xml', '.xhtml', '.xsl', '.js', '.mjs', '.css', '.json', '.txt', '.md', '.tex', '.csv', '.yaml', '.yml']);
// 外枠の決まり：iframe に入れてよいのは /preview だけ（デッキが自分の iframe を別の場所へ移すことも、この frame-src が止める）
const shellCsp = (req) => `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-src ${selfOrigin(req)}${PREVIEW_PATH}; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`;

// ---------------------------------------------------------------- 再読み込みの通知（Server-Sent Events）
const clients = new Set();
function broadcast(ev = 'reload', data = '{}') {
  for (const res of clients) res.write(`event: ${ev}\ndata: ${data}\n\n`);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();

let timer = null;
function schedule(reason) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (await rebuild()) { console.log(`rebuilt (${reason})`); broadcast(); }
  }, 120);
}

// ---------------------------------------------------------------- 変更の監視
const deckBase = path.basename(SRC);
const TOP = new Set([deckBase, 'narration.md', 'timeline.json', 'macros.tex']);
function deckRelevant(rel) {
  if (!rel) return true;
  rel = rel.split(path.sep).join('/');
  if (TOP.has(rel)) return true;
  if (rel === 'audio/manifest.json') return true;
  return /^(data|figs|components)(\/|$)/.test(rel);
}
// 原稿のフォルダの見張りは、原稿のフォルダの実体（DIR_REAL）の中のフォルダだけ。リンク（外を指す・中を指すどちらも）や、実体が DIR_REAL の
// 外にあるフォルダは見張らない（一度だけ知らせる）。外のフォルダの変更で組み直しを繰り返させない
function deckWatchDir(rel) {
  const dir = rel ? path.join(DIR_REAL, rel) : DIR_REAL;
  let st;
  try { st = fs.lstatSync(dir); } catch { return null; }
  let real = null;
  try { real = fs.realpathSync(dir); } catch { /* 下で断る */ }
  if (!st.isDirectory() || st.isSymbolicLink() || real !== dir) {
    console.warn(`  ⚠ not watching ${rel || '.'}: it is ${st.isSymbolicLink() ? 'a symbolic link' : 'not a folder inside the working folder'} (changes there do not rebuild)`);
    return null;
  }
  return dir;
}
function watch(dir, filter, onKit) {
  if (!dir || !fs.existsSync(dir)) return;
  try {
    fs.watch(dir, { recursive: true }, (_ev, name) => {
      if (filter && !filter(name)) return;
      if (onKit && name && /build\.mjs$/.test(String(name))) needReimport = true;
      schedule(String(name || path.basename(dir)));
    });
  } catch (e) { console.warn('watch failed: ' + dir + ' ' + e.message); }
}
// 原稿のフォルダの直下と audio/ は、フォルダそのものを見張る（recursive にしない）。Linux の recursive はファイルごとの見張りで、
// 保存（一時ファイルに書いて rename で入れ替える）でファイルの実体が替わると、その後の変更に気づかなくなる（v0.2.3 と同じ直し）
function watchDir(dir, filter) {
  if (!dir) return;
  try {
    fs.watch(dir, (_ev, name) => {
      const rel = path.relative(DIR_REAL, path.join(dir, String(name || '')));
      if (filter && !filter(rel)) return;
      schedule(rel || path.basename(dir));
    });
  } catch (e) { console.warn('watch failed: ' + dir + ' ' + e.message); }
}
watchDir(deckWatchDir(''), deckRelevant);
watchDir(deckWatchDir('audio'), deckRelevant);
for (const d of ['data', 'figs', 'components']) watch(deckWatchDir(d), (name) => deckRelevant(path.join(d, String(name || ''))));
// 部品庫の写し（vendor/components/<名前>/<版>/。npm run components:update で変わる）
for (const d of ['kit', 'vendor/components', 'themes']) {
  const abs = path.join(ROOT, ...d.split('/'));
  if (abs === DIR || DIR.startsWith(abs + path.sep)) continue;
  watch(abs, null, d === 'kit');
}
// 利用者のテーマのフォルダ（EGATARI_THEMES・~/.egatari/themes。kit/theme-dirs.mjs）：変われば組み直す
for (const d of userThemeDirs()) watch(d, null, false);

// ---------------------------------------------------------------- 原稿の書き換え
// 控えは .cache/edits の中に、掃除はそこの控えの名前のファイルだけ（フォルダがリンクなら控えを書かず、何も消さずに断る）
function backup(file) {
  if (backupFile(DIR_REAL, file, EDITS_REL, { max: limitOf(file) }) === null) return;
  pruneBackups(DIR_REAL, EDITS_REL, KEEP_EDITS);
}
// 書く（原稿・口述原稿・コメント）。リンクを通るなら UnsafePathError（応答は 403）
// 読み書きする 3 つのファイルの上限（バイト。kit/core/bounded-read-core.mjs の READ_LIMITS）：読む前に開いた fd の大きさで、読んだ後も実際のバイトで
// 確かめる（kit/bounded-read.mjs）。超えるものは読まずに 413。書くものも上限を超えるなら書かずに 413（次に読めなくなるものを書かない）
const limitOf = (file) => (file === NARR ? READ_LIMITS.narration : file === COMMENTS ? READ_LIMITS.comments : READ_LIMITS.source);
const writeIn = (file, text) => {
  const n = utf8Length(text), max = limitOf(file);
  if (n > max) throw new ReadOverError(n, max, path.basename(file));
  return safeWriteFile(DIR_REAL, file, text);
};
const readIn = (file) => readContained(DIR_REAL, file, 'utf8', { max: limitOf(file) });
function parseRange(s) {
  const m = /^(\d+)-(\d+)$/.exec(String(s || ''));
  if (!m) return null;
  const a = +m[1], b = +m[2];
  return a <= b ? [a, b] : null;
}

// ---------------------------------------------------------------- 口述原稿の書き換え（その段階の行だけを置き換える）
// 規則の本体は kit/core/narration-core.mjs（ブラウザの編集アプリと共有）。ここからも書き出す（以前の import 先を保つ）
export { rewriteNarration, narrationRev };
function readNarr() { return readIn(NARR) ?? ''; }
function rawTurns(slideKey, stepKey) { return narrRawTurns(readIn(NARR), slideKey, stepKey); }

// ---------------------------------------------------------------- コメント（AI へのメモ）
function readComments() {
  const t = readIn(COMMENTS);
  if (t === null) return [];
  try { return JSON.parse(t); } catch { return []; }
}
function writeComments(list) { writeIn(COMMENTS, JSON.stringify(list, null, 2) + '\n'); }

// ---------------------------------------------------------------- HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > 2e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
// /deck/ の下：ドットで始まる名前（.cache/edits の控え、.env など）は出さず、symlink で外へ出るものも断る
function deckFile(rel) {
  const parts = rel.split('/').filter(Boolean);
  if (!parts.length || parts.some((x) => x.startsWith('.') || x.includes('\\') || x.includes('\0'))) return { code: 403 };
  const file = path.resolve(DIR_REAL, ...parts);
  if (!file.startsWith(DIR_REAL + path.sep)) return { code: 403 };
  let real;
  try { real = fs.realpathSync(file); } catch { return { code: 404 }; }
  if (!real.startsWith(DIR_REAL + path.sep)) return { code: 403 };
  if (path.relative(DIR_REAL, real).split(path.sep).some((x) => x.startsWith('.'))) return { code: 403 };
  return { file: real };
}
// 守り：Host は 127.0.0.1:番号 か localhost:番号 だけ（DNS rebinding 対策）。書き込みは JSON・同じ Origin・合言葉が要る
function allowedOrigins() { const n = server.address().port; return [`127.0.0.1:${n}`, `localhost:${n}`]; }
function hostOk(req) { return allowedOrigins().includes(String(req.headers.host || '').toLowerCase()); }
function originOk(req) { const o = req.headers.origin; return o === undefined || allowedOrigins().some((h) => o === 'http://' + h); }
function tokenOk(given) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// 外枠が読み込む部品（server/ の中の決まったファイル）
function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}
// 原稿のフォルダのファイル（/deck/…）：どれも文書としては動かない（FILE_CSP）
function serveDeckFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    const ext = path.extname(file).toLowerCase();
    const media = MEDIA_EXT.has(ext);
    const h = { 'content-type': media ? MIME[ext] : TEXT_EXT.has(ext) ? 'text/plain; charset=utf-8' : 'application/octet-stream', 'content-length': st.size,
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': FILE_CSP, 'referrer-policy': 'no-referrer' };
    if (!media) h['content-disposition'] = 'attachment';
    res.writeHead(200, h);
    // 流すのは stat で見た大きさまで（content-length と同じ。大きくなるファイルを流し続けない。中身をメモリに貯めない）
    if (!st.size) return res.end();
    fs.createReadStream(file, { start: 0, end: st.size - 1 }).pipe(res);
  });
}
async function afterWrite() { await rebuild(); clearTimeout(timer); broadcast(); }

const server = http.createServer(async (req, res) => {
  if (!hostOk(req)) return send(res, 403, 'forbidden host', 'text/plain; charset=utf-8');
  let u, p;
  try { u = new URL(req.url, 'http://127.0.0.1'); p = decodeURIComponent(u.pathname); }
  catch { return send(res, 400, 'bad request', 'text/plain; charset=utf-8'); }
  const isApi = p.startsWith('/__dev/') && !Object.hasOwn(STATIC, p) && p !== '/__dev/presenter.js';
  if (isApi || req.method !== 'GET' && req.method !== 'HEAD') {
    // デッキ（sandbox の iframe）からの問い合わせは Origin: null・Sec-Fetch-Site: cross-site になる。どちらも断る
    if (req.headers.origin === 'null') return send(res, 403, { error: 'origin が違います（null）' });
    if (!originOk(req)) return send(res, 403, { error: 'origin が違います' });
    const site = req.headers['sec-fetch-site'];
    if (isApi && site !== undefined && site !== 'same-origin') return send(res, 403, { error: '同じ origin からの問い合わせではありません' });
    if (!tokenOk(p === '/__dev/events' ? u.searchParams.get('token') : req.headers['x-deck-token'])) return send(res, 403, { error: '合言葉（token）が違います。再読み込みしてください' });
    if (req.method === 'POST' && !/^application\/json(\s*;|$)/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'Content-Type は application/json にしてください' });
  }
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      if (!page) await rebuild();
      const html = u.searchParams.get('presenter') ? presenterPage() : shellPage();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': shellCsp(req),
        'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' });
      return res.end(html);
    }
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (Object.hasOwn(STATIC, p)) return serveFile(res, path.join(HERE, STATIC[p]));
    if (p === '/__dev/presenter.js') return send(res, 200, PRESENTER_JS, 'text/javascript; charset=utf-8');
    if (p === '/__dev/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    // デッキの文書：sandbox の iframe の中で読む。合言葉は入っていない。外枠の印と Sec-Fetch-Dest: iframe がなければ（タブで直接開いた・
    // ほかのページの中など）、デッキを出さずに無害なページ（動かない・どこへも繋がらない）を返す
    if (req.method === 'GET' && p === PREVIEW_PATH && !(capOk(u.searchParams.get('cap')) && req.headers['sec-fetch-dest'] === 'iframe')) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': FILE_CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      return res.end(`The preview is shown only inside the dev server page. Open http://${String(req.headers.host)}/ instead.\nプレビューは開発サーバーのページの中でだけ表示します。http://${String(req.headers.host)}/ を開いてください。\n`);
    }
    if (req.method === 'GET' && p === PREVIEW_PATH) {
      if (!page) await rebuild();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': deckCsp(req),
        'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' });
      return res.end(page.html || errorPage(page.error));
    }
    if (p.startsWith('/deck/')) {
      const r = deckFile(p.slice('/deck/'.length));
      if (!r.file) return send(res, r.code, r.code === 403 ? 'forbidden' : 'not found', 'text/plain; charset=utf-8');
      return serveDeckFile(res, r.file);
    }
    if (req.method === 'GET' && p === '/__dev/info') return send(res, 200, { slides: page?.slides || [], warn: page?.warn || [], error: page?.error ? true : false, lang: page?.lang || 'ja' });
    if (req.method === 'GET' && p === '/__dev/source') {
      const r = parseRange(u.searchParams.get('range'));
      const src = readIn(SRC_IN) ?? '';
      if (!r || r[1] > src.length) return send(res, 400, { error: '範囲が正しくありません' });
      // 今の組み立てで直せる要素（data-src を付けたもの）の範囲だけ
      if (!page.ranges.has(`${r[0]}-${r[1]}`)) return send(res, 409, { error: '原稿が変わっています。再読み込みしてください' });
      const text = src.slice(r[0], r[1]);
      return send(res, 200, { text, h: short(text) });
    }
    if (req.method === 'POST' && p === '/__dev/edit') {
      const b = await readBody(req);
      const r = parseRange(b.range);
      if (!r || typeof b.text !== 'string') return send(res, 400, { error: '範囲または本文が正しくありません' });
      const src = readIn(SRC_IN) ?? '';
      if (!page.ranges.has(`${r[0]}-${r[1]}`) || r[1] > src.length || short(src.slice(r[0], r[1])) !== b.h) return send(res, 409, { error: '原稿が変わっています。再読み込みしてください' });
      backup(SRC_IN);
      writeIn(SRC_IN, src.slice(0, r[0]) + b.text + src.slice(r[1]));
      console.log(`edit ${deckBase} ${b.range}`);
      await afterWrite();
      return send(res, 200, { ok: true, error: page.error ? '保存しましたが、組み立てに失敗しました' : null });
    }
    if (req.method === 'GET' && p === '/__dev/narration') {
      const [sk, st] = splitKey(u.searchParams.get('key') || '');
      return send(res, 200, { key: `${sk}:${st}`, slideKey: sk, stepKey: st, rev: narrationRev(readNarr(), sk, st), ...rawTurns(sk, st) });
    }
    if (req.method === 'POST' && p === '/__dev/narration') {
      const b = await readBody(req);
      if (!b.slideKey || !isStepKey(b.stepKey) || !Array.isArray(b.turns)) return send(res, 400, { error: 'slideKey / stepKey / turns が正しくありません' });
      if (typeof b.rev !== 'string') return send(res, 400, { error: 'rev（読み込んだときの版）がありません' });
      const sk = String(b.slideKey), st = String(b.stepKey);
      if (!(page?.slides || []).some((x) => x.key === sk)) return send(res, 400, { error: 'そのスライドはデッキにありません' });
      const text = readIn(NARR) ?? '# 口述原稿\n';
      if (narrationRev(text, sk, st) !== b.rev) return send(res, 409, { error: '口述原稿が変わっています。再読み込みしてください' });
      // 新しい節の見出しは、id のあるスライドなら「## 見出し {#id}」（スライドの一覧 {key, id, heading} を渡す）
      const out = rewriteNarration(text, sk, st, b.turns, page?.slides || []);
      if (out !== text) { backup(NARR); writeIn(NARR, out); console.log(`narration ${sk}:${st}`); await afterWrite(); }
      return send(res, 200, { ok: true, changed: out !== text, rev: narrationRev(out, sk, st) });
    }
    if (req.method === 'GET' && p === '/__dev/comments') return send(res, 200, readComments());
    if (req.method === 'POST' && p === '/__dev/comment') {
      const b = await readBody(req);
      if (!b.comment || !String(b.comment).trim()) return send(res, 400, { error: '指示が空です' });
      const list = readComments();
      // pin（押した点のスライドの座標）は確かめて丸める（kit/core/comment-core.mjs）。なければ・形が違えば付けない（古いコメントと同じ形）
      // strokes（手書きメモの線。前の形の stroke も 1 本として読む）も同じく確かめて丸め・間引く。なければ・点（pin）がなければ付けない。
      // 線があれば pin は線の重心にする（docs/contract.md §13）。書くのは strokes だけ
      let pin = normPin(b.pin);
      const strokes = pin ? entryStrokes(b) : null;
      if (strokes) pin = strokesCentroid(strokes);
      const c = { id: 'c' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), created: new Date().toISOString(),
        key: String(b.key || ''), range: b.range || null, ...(pin ? { pin } : {}), ...(strokes ? { strokes } : {}), quote: String(b.quote || '').slice(0, 200), comment: String(b.comment).trim(), status: 'open' };
      list.push(c); writeComments(list);
      console.log(`comment ${c.key}: ${c.comment.slice(0, 40)}`);
      return send(res, 200, c);
    }
    if (req.method === 'POST' && p === '/__dev/comment/resolve') {
      const b = await readBody(req);
      const list = readComments(); const c = list.find((x) => x.id === b.id);
      if (!c) return send(res, 404, { error: 'コメントが見つかりません' });
      c.status = 'resolved'; c.resolved = new Date().toISOString(); writeComments(list);
      return send(res, 200, c);
    }
    send(res, 404, 'not found', 'text/plain; charset=utf-8');
  } catch (e) {
    // 原稿のフォルダの外を指すリンクを通る読み書き（kit/safe-fs.mjs）：書かずに 403
    if (e && e.code === 'unsafe-path') { console.error('  refused: ' + e.message); return send(res, 403, { error: 'リンク（symlink）を通る読み書きは断りました / refused a read or write through a symbolic link: ' + e.message }); }
    // 上限を超えるファイル（kit/bounded-read.mjs）：読まずに・書かずに 413
    if (e && e.code === 'read-over') { console.error('  refused: ' + e.message); return send(res, 413, { error: 'ファイルが大きすぎます / the file is too large: ' + e.message }); }
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
});
// 使っていない接続（keep-alive）をサーバーの側から先に閉じない。Node の既定では応答から 5 秒（Node 24 からは 6 秒）で閉じるが、
// 繋ぎっぱなしにする側（Playwright の request、timeout のない http.Agent）は Keep-Alive: timeout= を見ずに同じ接続を使い直すので、
// 閉じるのと次の問い合わせがちょうど重なると「socket hang up（ECONNRESET）」になる（試験で応答から 6.0 秒後の GET が落ちた）。
// ブラウザ（Chrome は使った接続を 5 分）より長く開けておき、閉じるのはいつも繋いだ側にする。127.0.0.1 だけなので開けておく数は小さい。
// 問い合わせの途中の時間切れ（headersTimeout・requestTimeout）はそのまま効く
server.keepAliveTimeout = 10 * 60 * 1000;

await rebuild();
// 使われているポートなら次の番号を試す（--port で 0 を渡すと空いている番号を OS が選ぶ）
let tries = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && port !== 0 && tries < 20) {
    console.log(`  port ${port} is in use, trying ${port + 1}`);
    tries++; port++; server.listen(port, '127.0.0.1');
  } else { console.error(e.message); process.exit(1); }
});
server.on('listening', () => {
  console.log(`dev server: http://127.0.0.1:${server.address().port}/  (${SRC})`);
});
server.listen(port, '127.0.0.1');
