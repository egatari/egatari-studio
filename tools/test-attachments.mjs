// 添付（format spec §9C.3。kit/core/attachments.mjs）の試験
//   node tools/test-attachments.mjs [作業用のフォルダ] [--shots 画像のフォルダ]
// 1. コマンド：attachments/ と egatari.json の役割・題 → 1 ファイル（--portable）。index.attachments・files・profile（添付の .html はコードに数えない）
// 2. 展開して同じ（unpack の各ファイルが元の作業フォルダと同じバイト）、もう一度まとめても同じ sourceSha256 と一覧
// 3. 再生専用（--play-only）には添付が入らない（索引も添付の塊もない）
// 4. 上限（1 つ・合わせて・数）：外して知らせる。名前の規則（.. ・隠しファイル・リンク）
// 5. 検査器（kit/check.mjs --json）：役割がない・役割が正しくない・ない・名前が使えない・大きすぎる
// 6. 段 A（kit/core/tier-a.mjs）：足す・消す・名前と題を替える → 添付の場所と索引だけが変わる（tools/tier-a-diff.mjs）。原稿が書いている添付・上限を超えるものは断る
// 7. 再生器（ヘッドレス Chrome、file://）：帯のボタンと ? の一覧、ダウンロード（.html の添付も開かずに保存。ページは動かず、新しいタブもなく、スクリプトは動かない）。
//    壊れた添付は保存しない。再生専用・組んだ HTML には出ない
// 8. 編集アプリ：1 ファイル（OPFS のハンドル）の添付の板で足す・役割と題・名前を替える・消す → 保存は段 A（場所を見分ける差分）。
//    作業フォルダ（OPFS）でも足す・消す（.cache/edits/ に控え）。画像（--shots）：player-attachments.png・editor-attachments.png（1280×800）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable, playOnly, scanDocument } from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { attachmentsOf, ATTACH_LIMITS, planAttachments } from '../kit/core/attachments.mjs';
import { unpack } from './portable.mjs';
import { regionDiff } from './tier-a-diff.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1)) || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-attach-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const enc = new TextEncoder(), dec = new TextDecoder();
const CFG = FORMAT.CONFIG_FILE, KEY = FORMAT.ATTACH_KEY;

// ---------------------------------------------------------------- 作業フォルダ
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3000, 7), Buffer.from('\n%%EOF\n')]);
const EVIL = '<!doctype html><title>evil</title><script>try{window.top.__PWNED=1;parent.__PWNED=1;localStorage.setItem("pwned","1")}catch(e){}</script><h1>attachment</h1>';
function makeDeck(dir, conf) {
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  fs.mkdirSync(path.join(dir, 'attachments', 'code'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'attachments', 'paper.pdf'), PDF);
  fs.writeFileSync(path.join(dir, 'attachments', 'evil.html'), EVIL);
  fs.writeFileSync(path.join(dir, 'attachments', 'data.csv'), 'x,y\n1,2\n3,4\n');
  fs.writeFileSync(path.join(dir, 'attachments', 'code', 'run.py'), 'print("hi")\n');
  fs.writeFileSync(path.join(dir, CFG), JSON.stringify(conf, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
const CONF = {
  docId: '6f2b8a3e-1c4d-4e5f-8a9b-0c1d2e3f4a5b',
  metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author' },
  [KEY]: [
    { path: 'attachments/paper.pdf', role: 'pdf', title: 'Paper (PDF)' },
    { path: 'attachments/evil.html', role: 'supplement', title: 'Handout (HTML)' },
    { path: 'attachments/data.csv', role: 'data', note: 'kept unknown member' },
  ],
};
const DECK = makeDeck(path.join(work, 'deck'), CONF);
const OUT = path.join(work, 'a' + FORMAT.FILE_EXT);

// ---------------------------------------------------------------- 1. コマンド
{
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.dirname(DECK), '--portable', '-o', OUT], { encoding: 'utf8' });
  ok(r.status === 0, 'cli: build --portable with attachments succeeds' + (r.status ? ': ' + r.stderr : ''));
  ok(/attachments\/code\/run\.py" has no role/.test(r.stderr), 'cli: a file without a role is reported (packed, not listed)');
  const html = fs.readFileSync(OUT, 'utf8');
  const p = await readPortable(html);
  const list = p.index[KEY];
  ok(Array.isArray(list) && list.map((e) => e.path).join() === 'attachments/paper.pdf,attachments/evil.html,attachments/data.csv' && list[0].title === 'Paper (PDF)' && list[2].note === 'kept unknown member' && !('title' in list[2]),
    'cli: index.attachments lists the entries with a role, in the order of egatari.json, with title and unknown members: ' + JSON.stringify(list));
  ok(['attachments/paper.pdf', 'attachments/evil.html', 'attachments/data.csv', 'attachments/code/run.py'].every((f) => f in p.files) && Buffer.from(p.files['attachments/paper.pdf']).equals(PDF), 'cli: every attachment is in files, bytes unchanged');
  ok(p.index.profile === 'core' && !p.index.requires.some((f) => /article/.test(f)), `cli: an .html attachment is not code (profile ${p.index.profile}); attachments are ignorable, so nothing is added to requires (${p.index.requires})`);
  ok(attachmentsOf(p.index).length === 3 && p.warnings.length === 0, 'cli: attachmentsOf lists the 3 attachments, no read warnings');
}

// ---------------------------------------------------------------- 2. 展開して同じ・まとめ直しても同じ
{
  const dir = path.join(work, 'unpacked');
  await unpack(OUT, dir);
  const src = path.dirname(DECK);
  const walk = (d, pre = '') => fs.readdirSync(d).flatMap((n) => { const p = path.join(d, n); return fs.statSync(p).isDirectory() ? walk(p, pre + n + '/') : [pre + n]; });
  const got = walk(dir).sort();
  const same = got.every((f) => fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(src, f))));
  ok(got.includes('attachments/evil.html') && got.includes('attachments/code/run.py') && same, 'roundtrip: unpack writes attachments/ and egatari.json byte for byte as in the working folder');
  const a = await readPortable(fs.readFileSync(OUT, 'utf8'));
  const r2 = await buildPortable(path.join(dir, 'deck.html'), { out: path.join(work, 'b' + FORMAT.FILE_EXT) });
  ok(r2.index.sourceSha256 === a.index.sourceSha256 && JSON.stringify(r2.index[KEY]) === JSON.stringify(a.index[KEY]), 'roundtrip: packing the unpacked folder gives the same sourceSha256 and attachment list');
}

// ---------------------------------------------------------------- 3. 再生専用
{
  const html = fs.readFileSync(OUT, 'utf8');
  const a = await readPortable(html);
  const po = playOnly(html);
  const ids = Object.keys(a.index.files).filter((f) => f.startsWith('attachments/')).map((f) => a.index.files[f]);
  ok(!scanDocument(po).byId.has(FORMAT.INDEX_ID) && ids.every((id) => !po.includes(FORMAT.BLOB_PREFIX + id)), 'play-only: neither the index nor any attachment blob is in the play-only file (also role source)');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.dirname(DECK), '--play-only', '-o', path.join(work, 'p' + FORMAT.PLAY_EXT)], { encoding: 'utf8' });
  ok(r.status === 0 && !fs.readFileSync(path.join(work, 'p' + FORMAT.PLAY_EXT), 'utf8').includes('%PDF'), 'play-only: build --play-only leaves the attachments out');
}

// ---------------------------------------------------------------- 4. 上限・名前
{
  const r1 = await buildPortable(DECK, { out: path.join(work, 'l1.html'), attachLimits: { fileBytes: 1000 } });
  ok(!('attachments/paper.pdf' in r1.files) && r1.warnings.some((w) => /paper\.pdf" is \d+ bytes, over the limit of 1000/.test(w)) && r1.index[KEY].every((e) => e.path !== 'attachments/paper.pdf'), 'limits: an attachment over the per-file limit is left out and reported');
  const r2 = await buildPortable(DECK, { out: path.join(work, 'l2.html'), attachLimits: { totalBytes: 3100 } });
  ok(Object.keys(r2.files).filter((f) => f.startsWith('attachments/')).length === 3 && r2.warnings.some((w) => /together, over the limit of 3100/.test(w)), 'limits: attachments over the total limit are left out (in order) and reported');
  const r3 = await buildPortable(DECK, { out: path.join(work, 'l3.html'), attachLimits: { count: 2 } });
  ok(Object.keys(r3.files).filter((f) => f.startsWith('attachments/')).length === 2 && r3.warnings.some((w) => /more than 2 attachments/.test(w)), 'limits: more than the maximum number is reported');
  ok(ATTACH_LIMITS.fileBytes === 20 * 1048576 && ATTACH_LIMITS.totalBytes === 50 * 1048576 && ATTACH_LIMITS.count === 100, 'limits: defaults 20 MiB each, 50 MiB together, 100 files');
  const plan = planAttachments([{ path: 'attachments/.secret', size: 1 }, { path: 'attachments/a.bak', size: 1 }, { path: 'attachments/CON.txt', size: 1 }, { path: 'attachments/ok.txt', size: 1 }],
    { [KEY]: [{ path: 'attachments/../deck.html', role: 'pdf' }, { path: 'deck.html', role: 'pdf' }, { path: 'attachments/ok.txt', role: 'slides' }, { path: 'attachments/OK.txt', role: 'data' }] });
  const codes = plan.problems.map((x) => x.code + ':' + (x.path || ''));
  ok(plan.include.join() === 'attachments/ok.txt' && plan.list.length === 0 && ['attachBadName:attachments/../deck.html', 'attachBadName:deck.html', 'attachBadRole:attachments/ok.txt', 'attachDuplicate:attachments/OK.txt', 'attachExcluded:attachments/.secret', 'attachExcluded:attachments/a.bak', 'attachBadName:attachments/CON.txt'].every((c) => codes.includes(c)),
    'names: path traversal, outside attachments/, hidden and backup files, reserved names, case-folded duplicates and bad roles are refused: ' + codes.join(' '));
  // シンボリックリンクはたどらない（中身が外のファイルでも入れない）
  const d2 = path.join(work, 'deck-link');
  const deck2 = makeDeck(d2, CONF);
  let linked = false;
  try { fs.symlinkSync(path.join(ROOT, 'package.json'), path.join(d2, 'attachments', 'leak.json')); linked = true; } catch { /* Windows など */ }
  if (linked) { const r = await buildPortable(deck2, { out: path.join(work, 'link.html') }); ok(!('attachments/leak.json' in r.files), 'names: a symbolic link in attachments/ is not followed'); }
}

// ---------------------------------------------------------------- 5. 検査器
{
  const d = path.join(work, 'deck-check');
  const deck = makeDeck(d, { ...CONF, [KEY]: [...CONF[KEY], { path: 'attachments/missing.zip', role: 'code' }, { path: 'attachments/../x', role: 'pdf' }, { path: 'attachments/code/run.py', role: 'slides' }] });
  fs.writeFileSync(path.join(d, 'attachments', '.hidden'), 'x');
  fs.writeFileSync(path.join(d, 'attachments', 'norole.txt'), 'x');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), deck, '--json'], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* 下で落ちる */ }
  const codes = j ? j.results.filter((x) => /^attach/.test(x.code)).map((x) => `${x.sev}:${x.code}:${x.data.path || ''}`) : [];
  const want = ['warn:attachMissing:attachments/missing.zip', 'warn:attachBadName:attachments/../x', 'warn:attachBadRole:attachments/code/run.py', 'warn:attachExcluded:attachments/.hidden', 'warn:attachNoRole:attachments/norole.txt', 'info:attachList:'];
  ok(!!j && want.every((w) => codes.includes(w)), 'checker: missing file, bad name, bad role, hidden file and missing role are warnings; a summary is info: ' + codes.join(' '));
  const big = path.join(work, 'deck-big');
  const deckB = makeDeck(big, CONF);
  fs.writeFileSync(path.join(big, 'attachments', 'huge.bin'), Buffer.alloc(ATTACH_LIMITS.fileBytes + 1));
  const rb = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), deckB, '--json', '--lang', 'en'], { encoding: 'utf8' });
  const jb = JSON.parse(rb.stdout);
  ok(jb.results.some((x) => x.code === 'attachTooLarge' && x.sev === 'warn' && /too large/.test(x.msg)), 'checker: an oversize attachment is a warning (English message)');
}

// ---------------------------------------------------------------- 6. 段 A
const HTML = fs.readFileSync(OUT, 'utf8');
{
  const p = await readPortable(HTML);
  const files = new Map(Object.entries(p.files));
  files.delete('attachments/evil.html');
  files.set('attachments/notes.md', enc.encode('# notes\n'));
  const conf = JSON.parse(dec.decode(files.get(CFG)));
  conf[KEY] = [{ path: 'attachments/paper.pdf', role: 'pdf', title: 'The paper' }, { path: 'attachments/data.csv', role: 'data', note: 'kept unknown member' }, { path: 'attachments/notes.md', role: 'source' }];
  files.set(CFG, enc.encode(JSON.stringify(conf, null, 2) + '\n'));
  const a = await tierA(HTML, files);
  ok(a.ok, 'tier A: adding, removing and retitling attachments is a tier A edit' + (a.ok ? '' : ` (${a.code}: ${a.reason})`));
  if (a.ok) {
    let diffOk = true; try { regionDiff(HTML, a.html); } catch (e) { diffOk = false; console.log('    ' + e.message); }
    ok(diffOk, 'tier A: only the index, the chunks and deck-meta.sourceSha256 change (region-aware diff)');
    const b = await readPortable(a.html);
    ok(b.sourceMatches && !('attachments/evil.html' in b.files) && dec.decode(b.files['attachments/notes.md']) === '# notes\n' && b.index[KEY].map((e) => e.path + '=' + e.role + (e.title ? '/' + e.title : '')).join() === 'attachments/paper.pdf=pdf/The paper,attachments/data.csv=data,attachments/notes.md=source' && b.index[KEY][1].note === 'kept unknown member',
      'tier A: the saved file reads back with the new files and list (unknown members kept)');
  }
  // スライドの原稿が書いている添付を替えたら組み直す
  const p2files = new Map(Object.entries(p.files));
  const refDeck = makeDeck(path.join(work, 'deck-ref'), CONF);
  fs.writeFileSync(refDeck, fs.readFileSync(refDeck, 'utf8').replace('</section>', '<p><a href="attachments/data.csv">data</a></p></section>'));
  const ref = await buildPortable(refDeck, { out: path.join(work, 'ref.html') });
  const rf = await readPortable(ref.html);
  const m = new Map(Object.entries(rf.files)); m.set('attachments/data.csv', enc.encode('changed\n'));
  const a2 = await tierA(ref.html, m);
  ok(!a2.ok && a2.code === 'source-changed' && /refers to the changed attachment/.test(a2.reason), 'tier A: changing an attachment the slide source mentions needs a rebuild');
  const m3 = new Map(p2files); m3.set('attachments/big.bin', new Uint8Array(ATTACH_LIMITS.fileBytes + 1));
  const a3 = await tierA(HTML, m3);
  ok(!a3.ok && a3.code === 'attachments', 'tier A: an attachment over the limit is refused');
}

// ---------------------------------------------------------------- 7. 再生器
const browser = await launch();
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, locale: 'ja-JP' });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(fileUrl(OUT));
  await pg.waitForFunction(() => document.querySelector('#dt-cb [data-b="attach"]'), null, { timeout: 15000 });
  ok((await pg.getAttribute('#dt-cb [data-b="attach"]', 'aria-label')) === '添付ファイル（3）', 'player: the bar has an attachments button with the count');
  await pg.mouse.move(640, 760);
  await pg.click('#dt-cb [data-b="attach"]');
  await pg.waitForSelector('#dt-help.show [data-att]');
  const rows = await pg.$$eval('#dt-help .dt-att li', (xs) => xs.map((x) => x.textContent));
  ok(rows.length === 3 && /Paper \(PDF\)/.test(rows[0]) && /paper\.pdf · PDF/.test(rows[0]) && /補足資料/.test(rows[1]) && /data\.csv/.test(rows[2]) && /データ/.test(rows[2]), 'player: ? lists the attachments (title, file name, role, size): ' + JSON.stringify(rows));
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'player-attachments.png') });
  const url0 = pg.url(), n0 = ctx.pages().length;
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#dt-help [data-att="1"]')]);
  const got = fs.readFileSync(await dl.path(), 'utf8');
  await pg.waitForTimeout(800);
  ok(dl.suggestedFilename() === 'evil.html' && got === EVIL, 'player: the .html attachment is saved as a file with its exact bytes');
  ok(pg.url() === url0 && ctx.pages().length === n0 && !(await pg.evaluate(() => window.__PWNED || null)) && (await pg.evaluate(() => { try { return localStorage.getItem('pwned'); } catch { return null; } })) === null && (await pg.title()) !== 'evil',
    'player: downloading does not navigate, open a tab or run the attachment');
  const [dl2] = await Promise.all([pg.waitForEvent('download'), pg.click('#dt-help [data-att="0"]')]);
  ok(Buffer.from(fs.readFileSync(await dl2.path())).equals(PDF) && pg.url() === url0, 'player: the PDF is saved, not opened in the page');
  ok(errs.length === 0, 'player: no console errors ' + JSON.stringify(errs));
  await ctx.close();
  // 壊れた添付（塊の中身を替えた）は保存しない。索引の hash は合っている
  const p = await readPortable(HTML);
  const id = p.index.files['attachments/data.csv'];
  const sc = scanDocument(HTML).byId.get(`${FORMAT.BLOB_PREFIX}${id}-0`);
  const bad = HTML.slice(0, sc.start) + HTML.slice(sc.start, sc.end).replace(/>[A-Za-z0-9+/=]+</, '>' + Buffer.from('x,y\n9,9\n9,9\n').toString('base64') + '<') + HTML.slice(sc.end);
  fs.writeFileSync(path.join(work, 'bad.html'), bad);
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const p2 = await c2.newPage();
  let downloads = 0; p2.on('download', () => downloads++);
  await p2.goto(fileUrl(path.join(work, 'bad.html')));
  await p2.waitForFunction(() => document.querySelector('#dt-cb [data-b="attach"]'), null, { timeout: 15000 });
  await p2.evaluate(() => DECK.tools.help(true));
  await p2.click('#dt-help [data-att="2"]');
  await p2.waitForTimeout(800);
  ok(downloads === 0 && /Corrupt|壊れている/.test(await p2.textContent('#dt-help .dt-att-note')), 'player: a corrupt attachment (sha256 mismatch) is not saved');
  // 再生専用・組んだ HTML：出ない
  for (const f of [path.join(work, 'p' + FORMAT.PLAY_EXT)]) {
    await p2.goto(fileUrl(f));
    await p2.waitForFunction(() => document.getElementById('dt-cb'), null, { timeout: 15000 });
    await p2.waitForTimeout(500);
    ok(!(await p2.$('#dt-cb [data-b="attach"]')), 'player: a play-only file shows no attachments');
  }
  await c2.close();
}

// ---------------------------------------------------------------- 8. 編集アプリ
{
  const DIST = path.join(work, 'dist');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'inherit' });
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}/`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(BASE + '?lang=ja');
  await page.waitForSelector('#drop');
  const st = () => page.evaluate(() => window.__APP_TEST.state());
  const toastText = async () => (await page.textContent('#toast')) || '';
  const waitIdle = async () => { await page.waitForFunction(() => !document.querySelector('#dlg[open]') && !window.__APP_TEST.attachBusy() && document.getElementById('attach-list'), null, { timeout: 30000 }); await page.waitForTimeout(200); };
  const rowsOf = () => page.$$eval('#attach-list .attach-row', (xs) => xs.map((x) => x.getAttribute('data-attach')));
  // 1 ファイル（OPFS のハンドル）
  await page.evaluate(async (b64) => {
    const root = await navigator.storage.getDirectory();
    const h = await root.getFileHandle('att' + '.ega.html', { create: true });
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const w = await h.createWritable(); await w.write(u); await w.close();
    window.__ph = h; window.__APP_TEST.saveHandle = h;
  }, Buffer.from(HTML).toString('base64'));
  await page.evaluate(() => window.__APP_TEST.openFile({ handle: window.__ph }));
  await page.waitForFunction(() => window.__APP_TEST.state().loads > 0, null, { timeout: 30000 });
  ok(!!(await page.$('#b-attach')) && (await page.textContent('#b-attach')) === '添付', 'editor: the toolbar has “添付”');
  await page.click('#b-attach');
  await page.waitForSelector('#attach-list');
  ok(/試行/.test(await page.textContent('#panel-title')) && /試行/.test(await page.getAttribute('#b-attach', 'aria-label') || await page.getAttribute('#b-attach', 'title') || ''), 'editor: the panel header and the tooltip mark attachments as experimental (試行)');
  ok((await rowsOf()).join() === 'attachments/code/run.py,attachments/data.csv,attachments/evil.html,attachments/paper.pdf', 'editor: the side panel lists the attachments of the single file');
  ok((await page.$eval('[data-attach-role="attachments/paper.pdf"]', (x) => x.value)) === 'pdf' && (await page.$eval('[data-attach-title="attachments/paper.pdf"]', (x) => x.value)) === 'Paper (PDF)' && (await page.$eval('[data-attach-role="attachments/code/run.py"]', (x) => x.value)) === '',
    'editor: role and title come from egatari.json (no role: empty)');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'editor-attachments.png') });
  // 足す（最初の書き込みの前に権利の確認）
  await page.setInputFiles('#attach-file', { name: 'slides.tex', mimeType: 'text/x-tex', buffer: Buffer.from('\\documentclass{article}\n') });
  await page.waitForSelector('#dlg[open] #dlg-ok');
  await page.click('#dlg-ok');
  await waitIdle();
  ok((await rowsOf()).includes('attachments/slides.tex') && (await page.$eval('[data-attach-role="attachments/slides.tex"]', (x) => x.value)) === 'source' && (await st()).portable.dirty, 'editor: adding a file (after the rights prompt) writes attachments/slides.tex with the role guessed as source; the file is unsaved');
  // 役割と題
  await page.selectOption('[data-attach-role="attachments/code/run.py"]', 'code');
  await waitIdle();
  await page.fill('[data-attach-title="attachments/code/run.py"]', 'Script');
  await page.press('[data-attach-title="attachments/code/run.py"]', 'Tab');
  await waitIdle();
  // 名前を替える・消す
  await page.click('[data-attach-rename="attachments/data.csv"]');
  await page.waitForSelector('#dlg[open] #attach-rename-input');
  await page.fill('#attach-rename-input', 'table.csv');
  await page.click('#dlg-ok');
  await waitIdle();
  await page.click('[data-attach-remove="attachments/evil.html"]');
  await page.waitForSelector('#dlg[open] #attach-remove-ask');
  await page.click('#dlg-ok');
  await waitIdle();
  ok((await rowsOf()).join() === 'attachments/code/run.py,attachments/paper.pdf,attachments/slides.tex,attachments/table.csv', 'editor: rename and remove update the list: ' + (await rowsOf()).join());
  // 不正な名前・大きすぎるもの
  await page.click('[data-attach-rename="attachments/table.csv"]');
  await page.waitForSelector('#dlg[open] #attach-rename-input');
  await page.fill('#attach-rename-input', '../deck.html');
  await page.click('#dlg-ok');
  await page.waitForTimeout(400);
  ok(/使えない名前/.test(await toastText()) && (await rowsOf()).includes('attachments/table.csv'), 'editor: a path-traversal name is refused');
  await page.setInputFiles('#attach-file', { name: 'huge.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(ATTACH_LIMITS.fileBytes + 1) });
  await page.waitForTimeout(800);
  ok(/大きすぎ/.test(await toastText()) && !(await rowsOf()).includes('attachments/huge.bin'), 'editor: a file over the limit is refused before it is read');
  // 保存：段 A
  await page.evaluate(() => window.__APP_TEST.save('save'));
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
  const s1 = await st();
  ok(s1.portable.lastTier === 'A' && s1.portable.lastTierA && s1.portable.lastTierA.attachments, 'editor: Save is a tier A save (attachments only)' + JSON.stringify(s1.portable.lastRefusal));
  const saved = await page.evaluate(() => window.__APP_TEST.saved());
  let diffOk = true; try { regionDiff(HTML, saved); } catch (e) { diffOk = false; console.log('    ' + e.message); }
  ok(diffOk, 'editor: the saved file differs from the original only in the tier A regions (region-aware diff)');
  const b = await readPortable(saved);
  ok(b.index[KEY].map((e) => `${e.path}=${e.role}${e.title ? '/' + e.title : ''}`).join() === 'attachments/paper.pdf=pdf/Paper (PDF),attachments/table.csv=data,attachments/slides.tex=source,attachments/code/run.py=code/Script' && !('attachments/evil.html' in b.files) && b.index[KEY][1].note === 'kept unknown member',
    'editor: the saved index lists the new attachments (rename keeps role and unknown members): ' + JSON.stringify(b.index[KEY]));
  // 作業フォルダ（OPFS）
  const SRC = path.dirname(DECK);
  const ff = {};
  for (const f of ['deck.html', 'narration.md', CFG]) ff[f] = fs.readFileSync(path.join(SRC, f)).toString('base64');
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('attdeck', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('attdeck', { create: true });
    for (const [rel, b64] of Object.entries(files)) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(u); await w.close(); }
    window.__fd = d;
  }, ff);
  await page.evaluate(() => window.__APP_TEST_OPEN(window.__fd));
  await page.waitForFunction(() => window.__APP_TEST.state().kind === 'folder', null, { timeout: 30000 });
  await page.click('#b-attach');
  await page.waitForSelector('#attach-list');
  await page.setInputFiles('#attach-file', { name: 'paper.pdf', mimeType: 'application/pdf', buffer: PDF });
  await waitIdle();
  const fread = (rel) => page.evaluate(async (rel) => { try { const parts = rel.split('/'); const n = parts.pop(); let d = window.__fd; for (const x of parts) d = await d.getDirectoryHandle(x); return await (await (await d.getFileHandle(n)).getFile()).text(); } catch { return null; } }, rel);
  const conf1 = JSON.parse(await fread(CFG));
  ok((await fread('attachments/paper.pdf')) !== null && conf1[KEY].some((e) => e.path === 'attachments/paper.pdf' && e.role === 'pdf') && conf1.docId === CONF.docId && conf1.metadata.license === 'CC-BY-4.0', 'editor (folder): adding writes attachments/paper.pdf and its entry into egatari.json (other members kept)');
  await page.click('[data-attach-remove="attachments/paper.pdf"]');
  await page.waitForSelector('#dlg[open] #attach-remove-ask');
  await page.click('#dlg-ok');
  await waitIdle();
  const backups = await page.evaluate(async () => { const out = []; try { const e = await (await window.__fd.getDirectoryHandle('.cache')).getDirectoryHandle('edits'); for await (const k of e.keys()) out.push(k); } catch { /* なし */ } return out; });
  ok((await fread('attachments/paper.pdf')) === null && backups.some((n) => n.endsWith('-paper.pdf')) && !JSON.parse(await fread(CFG))[KEY].some((e) => e.path === 'attachments/paper.pdf'), 'editor (folder): removing deletes the file (backup in .cache/edits/) and its entry');
  ok(errs.length === 0, 'editor: no console errors ' + JSON.stringify(errs.slice(0, 5)));
  await ctx.close();
  srv.close();
}
await browser.close();
console.log(fails ? `attachments: ${fails} FAILED` : 'attachments: all ok');
process.exit(fails ? 1 : 0);
