// パーツの読める中身（format spec §2.1 Readable content of components、backlog #216）の試験
//   node tools/test-readable-parts.mjs
// 1. 作り直し（kit/core/readable-parts.mjs）：使ってよい要素と colspan・rowspan・lang だけを残し、ほかの要素はその字に、ほかの属性は外す。script も字
// 2. 1 ファイルへの書き出し（kit/build.mjs の buildPortable、ヘッドレスのブラウザ）：tools/fixtures/readable-parts の作業フォルダのパーツ m-rdcode の
//    印の pre と table が、読める層のそのスライドの article に、ステップの div の後に写る。印の中の印は 1 回だけ、パーツの外の印は写さない
// 3. 再生器を開けない書き出し（env.readableParts がない）は写さずに知らせる。印のない教材ではブラウザを起動しない（env を呼ばない）
// 4. 編集アプリの書き出し（プレビューの再生器に聞く。app/main.js の askReadable）も、コマンド版と同じ読める層を書く
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { launch } from '../kit/browser.mjs';
import { scaled } from './wait-scale.mjs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sanitizeReadable, readablePartsOf } from '../kit/core/readable-parts.mjs';
import { buildPortable, nodeEnv } from '../kit/build.mjs';
import { exportPortable } from '../kit/core/portable.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0, failed = 0;
const ok = async (name, f) => { try { await f(); n++; console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n      ', e.message.split('\n').slice(0, 6).join('\n       ')); } };
const copy = (from) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'readable-parts-')); fs.cpSync(from, d, { recursive: true }); return d; };
const layer = (h) => { const i = h.indexOf('<section id="egatari-readable"'); return h.slice(i, h.indexOf('\n</section>', i) + 11); };

await ok('sanitize: allowed elements and colspan, rowspan and lang only; other elements become their text; script is text', () => {
  assert.equal(sanitizeReadable('<pre class="x" data-readable>a &lt; b</pre>'), '<pre>a &lt; b</pre>');
  assert.equal(sanitizeReadable('<table><tr><td colspan="2" rowspan="1" lang="en" onclick="x()" style="color:red">c</td></tr></table>'), '<table><tbody><tr><td colspan="2" rowspan="1" lang="en">c</td></tr></tbody></table>');
  assert.equal(sanitizeReadable('<p>a <b>b</b> <a href="javascript:x()">link</a></p>'), '<p>a b link</p>');
  assert.equal(sanitizeReadable('<div><script>alert(1)</script><pre>x</pre></div>'), 'alert(1)x');
  assert.equal(sanitizeReadable('<svg><text>t</text></svg><span>"q"</span>'), 't<span>"q"</span>');
  assert.equal(sanitizeReadable('<p title="a&quot;b" lang="ja&quot;"></p>'), '<p lang="ja&quot;"></p>');
});
await ok('readablePartsOf: only known slides, strings only, empty results dropped', () => {
  const w = [];
  assert.deepEqual(readablePartsOf({ a: ['<pre>x</pre>', 3, ''], b: ['<p>y</p>'], c: 'no' }, new Set(['a', 'c']), (m) => w.push(m)), { a: ['<pre>x</pre>'] });
  assert.equal(w.length, 1);
  assert.deepEqual(readablePartsOf(null, new Set(['a'])), {});
});

const dir = copy(path.join(ROOT, 'tools/fixtures/readable-parts'));
try {
  await ok('export: the marked pre and table are copied into the slide\'s article after the step divs; nested marks once; none outside parts', async () => {
    const r = await buildPortable(path.join(dir, 'deck.html'), {});
    const L = layer(r.html);
    const code = L.slice(L.indexOf('<article data-slide-key="s-code">'), L.indexOf('</article>', L.indexOf('s-code')));
    assert.ok(code.indexOf('<div data-step-key="s-code:0">') < code.indexOf('<pre>'), 'after the step divs');
    assert.match(code, /<pre>line 1\nline 2\nif \(a &lt; b &amp;&amp; c\) \{\}\nline 4<\/pre>/);
    assert.match(code, /<table><tbody><tr><th colspan="2">head bold<\/th><\/tr><tr><td lang="en">cell<\/td><td>img<\/td><\/tr><\/tbody><\/table>/);
    assert.equal(code.split('>cell<').length, 2, 'the mark inside the marked table is copied once');
    assert.ok(!/class=|onclick|<img|data-readable/.test(code), 'no other attributes or elements');
    assert.ok(!L.includes('<p>パーツの外の段落</p>'), 'a mark outside parts is not copied');
    assert.deepEqual(r.warnings.filter((x) => /readable/.test(x)), []);
  });
  await ok('a producer that cannot open the player copies nothing and says so', async () => {
    const { readableParts, ...env } = nodeEnv;   // eslint-disable-line no-unused-vars
    const r = await exportPortable(env, path.join(dir, 'deck.html'), { fromFolder: true });
    assert.ok(!layer(r.html).includes('<pre>'));
    assert.ok(r.warnings.some((x) => /cannot open the player to copy it into the readable layer/.test(x)), r.warnings.join(' | '));
  });
  await ok('a lesson without the mark never asks for the player', async () => {
    const plain = copy(path.join(ROOT, 'examples/minimal'));
    let asked = 0;
    const r = await exportPortable({ ...nodeEnv, readableParts: async () => { asked++; return {}; } }, path.join(plain, 'deck.html'), { fromFolder: true });
    assert.equal(asked, 0);
    assert.ok(r.html.includes('<section id="egatari-readable"'));
    fs.rmSync(plain, { recursive: true, force: true });
  });
  await ok('editor: exporting from the editor writes the same readable layer as the command line', async () => {
    const DIST = fs.mkdtempSync(path.join(os.tmpdir(), 'readable-parts-app-'));
    execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'ignore' });
    const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.wasm': 'application/wasm' };
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
      if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const browser = await launch();
    try {
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' })).newPage();
      await page.goto(`http://127.0.0.1:${srv.address().port}/?lang=ja`);
      await page.waitForFunction(() => !!window.__APP_TEST && !!window.__APP_TEST_OPEN);
      const src = path.join(ROOT, 'tools/fixtures/readable-parts');
      const files = Object.fromEntries(fs.readdirSync(src, { recursive: true }).filter((f) => fs.statSync(path.join(src, f)).isFile())
        .map((f) => [f.split(path.sep).join('/'), fs.readFileSync(path.join(src, f)).toString('base64')]));
      await page.evaluate(async (files) => {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('readable-parts', { recursive: true }).catch(() => {});
        const d = await root.getDirectoryHandle('readable-parts', { create: true });
        for (const [rel, b64] of Object.entries(files)) {
          const parts = rel.split('/'); let dir = d;
          for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
          const w = await (await dir.getFileHandle(parts[parts.length - 1], { create: true })).createWritable(); await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); await w.close();
        }
        window.__testDir = d;
      }, files);
      // 作業フォルダのパーツのコードは、動かす前に聞かれる（app/main.js の codeConsent）：「実行」を押す
      const opened = page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir));
      await page.waitForSelector('#dlg[open] #dlg-run', { timeout: scaled(30000) });
      await page.click('#dlg-run');
      assert.equal(await opened, true);
      await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.allowed && !s.building && s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: scaled(60000) });
      const ax = await page.evaluate(() => window.__APP_TEST.exportPortable());
      const cli = await buildPortable(path.join(copy(src), 'deck.html'), { fromFolder: false });
      assert.equal(layer(ax.html), layer(cli.html));
      assert.match(layer(ax.html), /<pre>line 1\nline 2\nif \(a &lt; b/);
    } finally { await browser.close(); srv.close(); fs.rmSync(DIST, { recursive: true, force: true }); }
  });
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
if (failed) { console.log(`readable-parts: ${failed} failed`); process.exit(1); }
console.log(`readable-parts: ${n} ok`);
