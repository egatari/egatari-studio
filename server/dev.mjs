// 開発サーバー：ブラウザの上で原稿・口述原稿を直し、Claude への指示（コメント）を残す
//
//   node server/dev.mjs <deck.html> [--port 5173] [--theme 名前]
//   npm run dev -- <deck.html>
//
// 127.0.0.1 だけで待ち受ける。説明は docs/dev-server.md
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseNarration, normalizeKey } from '../kit/narration.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const BUILD = path.join(ROOT, 'kit', 'build.mjs');

// ---------------------------------------------------------------- 引数
const args = process.argv.slice(2);
let srcArg = null, port = 5173, theme = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port') port = +args[++i];
  else if (args[i] === '--theme') theme = args[++i];
  else srcArg = args[i];
}
if (!srcArg) { console.error('usage: node server/dev.mjs <deck.html> [--port 5173] [--theme name]'); process.exit(1); }
const SRC = path.resolve(srcArg);
if (!fs.existsSync(SRC)) { console.error('not found: ' + SRC); process.exit(1); }
const DIR = path.dirname(SRC);
const NARR = path.join(DIR, 'narration.md');
const COMMENTS = path.join(DIR, 'comments.json');
const EDITS = path.join(DIR, '.cache', 'edits');
const KEEP_EDITS = 30;

const short = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

// ---------------------------------------------------------------- 組み立て
let buildFn = null, buildVer = 0, needReimport = true;
let page = null;     // {html, error, slides}
async function rebuild() {
  try {
    if (needReimport) { buildFn = (await import(pathToFileURL(BUILD).href + '?v=' + (++buildVer))).build; needReimport = false; }
    const r = buildFn(SRC, { dev: true, audioBase: '/deck/audio/', ...(theme ? { theme } : {}) });
    const warn = `<script>window.__DEV_WARN=${JSON.stringify(r.stats.warn).replace(/<\//g, '<\\/')};</script>`;
    const inject = `${warn}\n<script src="/__dev/client.js"></script>\n`;
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
<script src="/__dev/client.js"></script></body></html>`;
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
watch(DIR, deckRelevant);
for (const d of ['kit', 'components', 'themes']) {
  const abs = path.join(ROOT, d);
  if (abs === DIR || DIR.startsWith(abs + path.sep)) continue;
  watch(abs, null, d === 'kit');
}

// ---------------------------------------------------------------- 原稿の書き換え
function backup(file) {
  if (!fs.existsSync(file)) return;
  fs.mkdirSync(EDITS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(file, path.join(EDITS, `${stamp}-${path.basename(file)}`));
  const all = fs.readdirSync(EDITS).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP_EDITS))) fs.rmSync(path.join(EDITS, f), { force: true });
}
function parseRange(s) {
  const m = /^(\d+)-(\d+)$/.exec(String(s || ''));
  if (!m) return null;
  const a = +m[1], b = +m[2];
  return a <= b ? [a, b] : null;
}

// ---------------------------------------------------------------- 口述原稿の書き換え（その段階の行だけを置き換える）
const ROLE = /^(Expert|Novice|E|N)\s*[:：]\s*/;
const stepOrder = (s) => (s === 'concl' ? Infinity : +s);

// parseNarration と同じ規則で、節（## 見出し）と段階（[k]）の行の範囲を求める
function scanNarration(lines) {
  const sections = [];
  let sec = null, blk = null, inComment = false;
  lines.forEach((ln, idx) => {
    if (inComment) { if (ln.includes('-->')) inComment = false; return; }
    if (/^\s*<!--/.test(ln) && !ln.includes('-->')) { inComment = true; return; }
    if (/^\s*<!--.*-->\s*$/.test(ln)) return;
    const h = ln.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (sec) sec.end = idx;
      sec = { key: normalizeKey(h[1]), head: idx, end: lines.length, blocks: [], lastContent: idx };
      sections.push(sec); blk = null; return;
    }
    if (/^#\s/.test(ln)) return;
    const m = ln.match(/^\s*\[(\d+|concl)\]\s*(.*)$/);
    if (m && sec) {
      blk = { step: m[1], start: idx, end: idx + 1 };
      sec.blocks.push(blk); sec.lastContent = idx; return;
    }
    if (ln.trim() && sec) { sec.lastContent = idx; if (blk) blk.end = idx + 1; }
  });
  return sections;
}
function oneLine(s) { return String(s).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(''); }
function formatBlock(step, turns) {
  // 話者の表記：全員が Expert で 1 発言なら書かない。Expert が複数の発言のときは、書かないと 1 発言に
  // 繋がってしまう（parseNarration は話者のない行を前の発言の続きとして読む）ので Expert: を書く
  const allExpert = turns.every((t) => t.role !== 'novice');
  const bare = allExpert && turns.length === 1 && !ROLE.test(turns[0].text);
  return turns.map((t, j) => (j ? '    ' : `[${step}] `) +
    (bare ? '' : t.role === 'novice' ? 'Novice: ' : 'Expert: ') + t.text);
}
export function rewriteNarration(text, slideKey, stepKey, turns, slideOrder) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  turns = turns.map((t) => ({ role: t.role === 'novice' ? 'novice' : 'expert', text: oneLine(t.text) })).filter((t) => t.text);
  const block = turns.length ? formatBlock(stepKey, turns) : [];
  const sections = scanNarration(lines);
  const sec = [...sections].reverse().find((s) => s.key === slideKey);
  if (sec) {
    const same = sec.blocks.filter((b) => b.step === stepKey);
    if (same.length) {
      // 同じ段階が複数あれば、効いている最後のものを置き換え、前のものは消す
      const last = same[same.length - 1];
      lines.splice(last.start, last.end - last.start, ...block);
      for (const b of same.slice(0, -1).reverse()) lines.splice(b.start, b.end - b.start);
    } else if (block.length) {
      const later = sec.blocks.find((b) => stepOrder(b.step) > stepOrder(stepKey));
      const at = later ? later.start : sec.lastContent + 1;
      lines.splice(at, 0, ...block);
    }
  } else if (block.length) {
    // 新しい節：原稿のスライドの順で、次のスライドの節の前に入れる
    const idx = slideOrder.indexOf(slideKey);
    const nextSec = idx >= 0 ? slideOrder.slice(idx + 1).map((k) => sections.find((s) => s.key === k)).find(Boolean) : null;
    const add = [`## ${slideKey}`, ...block, ''];
    if (nextSec) lines.splice(nextSec.head, 0, ...add);
    else {
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.push('', ...add);
    }
  }
  return lines.join(eol);
}
function rawTurns(slideKey, stepKey) {
  if (!fs.existsSync(NARR)) return { turns: [], exists: false };
  const segs = parseNarration(fs.readFileSync(NARR, 'utf8')).filter((s) => s.slideKey === slideKey && s.stepKey === stepKey);
  const seg = segs[segs.length - 1];
  return seg ? { turns: seg.turns.map((t) => ({ role: t.role, text: t.raw })), exists: true, line: seg.line } : { turns: [], exists: false };
}
function splitKey(key) { const p = String(key).lastIndexOf(':'); return p < 0 ? [String(key), '0'] : [key.slice(0, p), key.slice(p + 1)]; }

// ---------------------------------------------------------------- コメント（Claude への指示）
function readComments() {
  if (!fs.existsSync(COMMENTS)) return [];
  try { return JSON.parse(fs.readFileSync(COMMENTS, 'utf8')); } catch { return []; }
}
function writeComments(list) { fs.writeFileSync(COMMENTS, JSON.stringify(list, null, 2) + '\n'); }

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
function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}
async function afterWrite() { await rebuild(); clearTimeout(timer); broadcast(); }

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const p = decodeURIComponent(u.pathname);
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
      const file = path.resolve(DIR, '.' + p.slice('/deck'.length));
      if (file !== DIR && !file.startsWith(DIR + path.sep)) return send(res, 403, 'forbidden', 'text/plain; charset=utf-8');
      return serveFile(res, file);
    }
    if (req.method === 'GET' && p === '/__dev/source') {
      const r = parseRange(u.searchParams.get('range'));
      const src = fs.readFileSync(SRC, 'utf8');
      if (!r || r[1] > src.length) return send(res, 400, { error: '範囲が正しくありません' });
      const text = src.slice(r[0], r[1]);
      return send(res, 200, { text, h: short(text) });
    }
    if (req.method === 'POST' && p === '/__dev/edit') {
      const b = await readBody(req);
      const r = parseRange(b.range);
      if (!r || typeof b.text !== 'string') return send(res, 400, { error: '範囲または本文が正しくありません' });
      const src = fs.readFileSync(SRC, 'utf8');
      if (r[1] > src.length || short(src.slice(r[0], r[1])) !== b.h) return send(res, 409, { error: '原稿が変わっています。再読み込みしてください' });
      backup(SRC);
      fs.writeFileSync(SRC, src.slice(0, r[0]) + b.text + src.slice(r[1]));
      console.log(`edit ${deckBase} ${b.range}`);
      await afterWrite();
      return send(res, 200, { ok: true, error: page.error ? '保存しましたが、組み立てに失敗しました' : null });
    }
    if (req.method === 'GET' && p === '/__dev/narration') {
      const [sk, st] = splitKey(u.searchParams.get('key') || '');
      return send(res, 200, { key: `${sk}:${st}`, slideKey: sk, stepKey: st, ...rawTurns(sk, st) });
    }
    if (req.method === 'POST' && p === '/__dev/narration') {
      const b = await readBody(req);
      if (!b.slideKey || !/^(\d+|concl)$/.test(String(b.stepKey)) || !Array.isArray(b.turns)) return send(res, 400, { error: 'slideKey / stepKey / turns が正しくありません' });
      const text = fs.existsSync(NARR) ? fs.readFileSync(NARR, 'utf8') : '# 口述原稿\n';
      const order = (page?.slides || []).map((s) => s.key);
      const out = rewriteNarration(text, String(b.slideKey), String(b.stepKey), b.turns, order);
      if (out !== text) { backup(NARR); fs.writeFileSync(NARR, out); console.log(`narration ${b.slideKey}:${b.stepKey}`); await afterWrite(); }
      return send(res, 200, { ok: true, changed: out !== text });
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
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
});

await rebuild();
server.listen(port, '127.0.0.1', () => {
  console.log(`dev server: http://127.0.0.1:${server.address().port}/  (${SRC})`);
});
