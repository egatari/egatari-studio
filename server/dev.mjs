// 開発サーバー：ブラウザの上で原稿・口述原稿を直し、Claude への指示（コメント）を残す
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
import { rewriteNarration, narrationRev, rawTurns as narrRawTurns, splitKey } from '../kit/narration.mjs';
import { safeWriteFile, readContained, backupFile, pruneBackups } from '../kit/safe-fs.mjs';

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
// 書き込み・控え・読み出しは、どれも原稿のフォルダの実体（DIR_REAL）の中だけ（kit/safe-fs.mjs。リンクを通る書き込みは断る）
const DIR_REAL = fs.realpathSync(DIR);
const SRC_IN = path.join(DIR_REAL, path.basename(SRC));
const NARR = path.join(DIR_REAL, 'narration.md');
const COMMENTS = path.join(DIR_REAL, 'comments.json');
const EDITS_REL = path.join('.cache', 'edits');
const KEEP_EDITS = 30;

const short = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
// 書き込みと原稿の読み出しに要る合言葉（起動のたびに作り直す）。配る画面に埋め込み、client.js が X-Deck-Token で送る
const TOKEN = crypto.randomBytes(24).toString('hex');
const TOKEN_TAG = `<script>window.__DECK_DEV_TOKEN=${JSON.stringify(TOKEN)};</script>`;

// ---------------------------------------------------------------- 組み立て
let buildFn = null, buildVer = 0, needReimport = true;
let page = null;     // {html, error, slides}
async function rebuild() {
  try {
    if (needReimport) { buildFn = (await import(pathToFileURL(BUILD).href + '?v=' + (++buildVer))).build; needReimport = false; }
    const r = buildFn(SRC, { dev: true, audioBase: '/deck/audio/', ...(theme ? { theme } : {}) });
    const warn = `<script>window.__DEV_WARN=${JSON.stringify(r.stats.warn).replace(/<\//g, '<\\/')};</script>`;
    const inject = `${warn}\n${TOKEN_TAG}\n<script src="/__dev/client.js"></script>\n`;
    const at = r.html.lastIndexOf('</body>');
    const html = at >= 0 ? r.html.slice(0, at) + inject + r.html.slice(at) : r.html + inject;
    const changed = !page || page.html !== html;
    page = { html, error: null, slides: r.slides };
    for (const w of r.stats.warn) console.warn('  ⚠ ' + w);
    return changed;
  } catch (e) {
    const changed = !page || page.error !== String(e.stack || e);
    page = { html: null, error: String(e.stack || e), slides: page?.slides || [] };
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
${TOKEN_TAG}<script src="/__dev/client.js"></script></body></html>`;
}

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
function watch(dir, filter, onKit) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.watch(dir, { recursive: true }, (_ev, name) => {
      if (filter && !filter(name)) return;
      if (onKit && name && /build\.mjs$/.test(String(name))) needReimport = true;
      schedule(String(name || path.basename(dir)));
    });
  } catch (e) { console.warn('watch failed: ' + dir + ' ' + e.message); }
}
// 原稿のフォルダの直下と audio/ は、フォルダそのものを見張る（recursive にしない）。Linux の recursive はファイルごとの見張りで、
// 保存（一時ファイルに書いて rename で入れ替える）でファイルの実体が替わると、その後の変更に気づかなくなる
function watchDir(dir, filter) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.watch(dir, (_ev, name) => {
      const rel = path.relative(DIR, path.join(dir, String(name || '')));
      if (filter && !filter(rel)) return;
      schedule(rel || path.basename(dir));
    });
  } catch (e) { console.warn('watch failed: ' + dir + ' ' + e.message); }
}
watchDir(DIR, deckRelevant);
watchDir(path.join(DIR, 'audio'), deckRelevant);
for (const d of ['data', 'figs', 'components']) watch(path.join(DIR, d), (name) => deckRelevant(path.join(d, String(name || ''))));
for (const d of ['kit', 'components', 'themes']) {
  const abs = path.join(ROOT, d);
  if (abs === DIR || DIR.startsWith(abs + path.sep)) continue;
  watch(abs, null, d === 'kit');
}

// ---------------------------------------------------------------- 原稿の書き換え
// 控えは .cache/edits の中に、掃除はそこの控えの名前のファイルだけ（フォルダがリンクなら控えを書かず、何も消さずに断る）
function backup(file) {
  if (backupFile(DIR_REAL, file, EDITS_REL) === null) return;
  pruneBackups(DIR_REAL, EDITS_REL, KEEP_EDITS);
}
// 書く（原稿・口述原稿・コメント）。リンクを通るなら UnsafePathError（応答は 403）
const writeIn = (file, text) => safeWriteFile(DIR_REAL, file, text);
const readIn = (file) => readContained(DIR_REAL, file, 'utf8');
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

// ---------------------------------------------------------------- コメント（Claude への指示）
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
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
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
function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}
async function afterWrite() { await rebuild(); clearTimeout(timer); broadcast(); }

const server = http.createServer(async (req, res) => {
  if (!hostOk(req)) return send(res, 403, 'forbidden host', 'text/plain; charset=utf-8');
  let u, p;
  try { u = new URL(req.url, 'http://127.0.0.1'); p = decodeURIComponent(u.pathname); }
  catch { return send(res, 400, 'bad request', 'text/plain; charset=utf-8'); }
  const isApi = p.startsWith('/__dev/') && p !== '/__dev/client.js';
  if (isApi || req.method !== 'GET' && req.method !== 'HEAD') {
    if (!originOk(req)) return send(res, 403, { error: 'origin が違います' });
    if (!tokenOk(p === '/__dev/events' ? u.searchParams.get('token') : req.headers['x-deck-token'])) return send(res, 403, { error: '合言葉（token）が違います。再読み込みしてください' });
    if (req.method === 'POST' && !/^application\/json(\s*;|$)/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { error: 'Content-Type は application/json にしてください' });
  }
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      if (!page) await rebuild();
      return send(res, 200, page.html || errorPage(page.error), 'text/html; charset=utf-8');
    }
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (p === '/__dev/client.js') return serveFile(res, path.join(HERE, 'client.js'));
    if (p === '/__dev/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p.startsWith('/deck/')) {
      const r = deckFile(p.slice('/deck/'.length));
      if (!r.file) return send(res, r.code, r.code === 403 ? 'forbidden' : 'not found', 'text/plain; charset=utf-8');
      return serveFile(res, r.file);
    }
    if (req.method === 'GET' && p === '/__dev/source') {
      const r = parseRange(u.searchParams.get('range'));
      const src = readIn(SRC_IN) ?? '';
      if (!r || r[1] > src.length) return send(res, 400, { error: '範囲が正しくありません' });
      const text = src.slice(r[0], r[1]);
      return send(res, 200, { text, h: short(text) });
    }
    if (req.method === 'POST' && p === '/__dev/edit') {
      const b = await readBody(req);
      const r = parseRange(b.range);
      if (!r || typeof b.text !== 'string') return send(res, 400, { error: '範囲または本文が正しくありません' });
      const src = readIn(SRC_IN) ?? '';
      if (r[1] > src.length || short(src.slice(r[0], r[1])) !== b.h) return send(res, 409, { error: '原稿が変わっています。再読み込みしてください' });
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
      if (!b.slideKey || !/^(\d+|concl)$/.test(String(b.stepKey)) || !Array.isArray(b.turns)) return send(res, 400, { error: 'slideKey / stepKey / turns が正しくありません' });
      if (typeof b.rev !== 'string') return send(res, 400, { error: 'rev（読み込んだときの版）がありません' });
      const sk = String(b.slideKey), st = String(b.stepKey);
      const text = readIn(NARR) ?? '# 口述原稿\n';
      if (narrationRev(text, sk, st) !== b.rev) return send(res, 409, { error: '口述原稿が変わっています。再読み込みしてください' });
      const order = (page?.slides || []).map((s) => s.key);
      const out = rewriteNarration(text, sk, st, b.turns, order);
      if (out !== text) { backup(NARR); writeIn(NARR, out); console.log(`narration ${sk}:${st}`); await afterWrite(); }
      return send(res, 200, { ok: true, changed: out !== text, rev: narrationRev(out, sk, st) });
    }
    if (req.method === 'GET' && p === '/__dev/comments') return send(res, 200, readComments());
    if (req.method === 'POST' && p === '/__dev/comment') {
      const b = await readBody(req);
      if (!b.comment || !String(b.comment).trim()) return send(res, 400, { error: '指示が空です' });
      const list = readComments();
      const c = { id: 'c' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), created: new Date().toISOString(),
        key: String(b.key || ''), range: b.range || null, quote: String(b.quote || '').slice(0, 200), comment: String(b.comment).trim(), status: 'open' };
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
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
});

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
