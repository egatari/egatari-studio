// 授業の部屋の結果を先生の教材に取り込む（拡張 live §3・format spec §3.8。kit/core/live-results.mjs）の試験
//   node tools/test-live-results.mjs [作業用のフォルダ] [--shots 画像のフォルダ]（editor-live-results.png・editor-live-results-export.png）
// 1. 形：写しの Schema（FORMAT.LIVE_VENDOR_DIR の $defs/results）と同じ判定（ajv と比べる）・壊れた JSON・UTF-8 でない・10 MiB を超えるもの・要約・
//    添付の項目（役割 data、題は部屋と日付だけ、説明は学ぶ人の質問と答えが入ること。§3.8 の題・説明・役割と型・中身の検査）・部屋の照合
// 2. コマンド：npm run portable -- attach（部屋が違えば知らせて足す・同じものは断る・壊れたもの・大きすぎるもの）→ pack は知らせる、
//    --without-live-results は入れない、再生専用（部屋を付けたものも）には入らない
// 3. 編集アプリ（作業フォルダ、OPFS）：添付の板と授業の部屋の板の「授業の部屋の結果を取り込む…」。断る（壊れた JSON・大きすぎる）、
//    はじめての知らせ（一度だけ）、部屋が違えば知らせる、一覧の印と要約（字は文字として）、1 ファイルを書き出すときの知らせと「結果を外して書き出す」、
//    再生専用には入らない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable } from '../kit/core/portable.mjs';
import { parseResults, isLiveResults, summarizeResults, summaryLines, resultsRecord, roomMatch, RESULTS_MAX_BYTES } from '../kit/core/live-results.mjs';
import { titleProblem, descriptionProblem, roleProblem, inspectAttachment, blocking, ATTACH_LIMITS } from '../kit/core/attachments.mjs';
import { clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROTO = path.join(ROOT, ...FORMAT.LIVE_VENDOR_DIR.split('/'));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args[si + 1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const work = path.resolve(args.find((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1)) || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-live-results-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const enc = new TextEncoder();
const CFG = FORMAT.CONFIG_FILE, KEY = FORMAT.ATTACH_KEY;
const FIX = fs.readFileSync(path.join(PROTO, 'fixtures', 'http', 'results.json'));
const R0 = JSON.parse(FIX.toString('utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
// 学ぶ人の字に見せかけたマークアップ（どれも文字として出ること）
const XSS = '<img src=x onerror="window.__xss=1">';
const R1 = clone(R0);
R1.activities['s-k3f9q2:2'][0].prompt = XSS;
R1.activities['s-k3f9q2:2'][0].choices = ['<b id="xss-b">A</b>', 'B', 'C'];
R1.responses[0].text = '<script>window.__xss=2</script>';
R1.responses[1].name = '<img src=x onerror=window.__xss=3>';
R1.responses.push({ kind: 'poll', activity: 'p1', step: 's-k3f9q2:2', pid: 'q8Jk3nRy0MxS5uAb', at: '2026-10-30T09:21:00.000Z', choice: 1 },
  { kind: 'poll', activity: 'p1', step: 's-k3f9q2:2', pid: 'r9Kl4oSz1NyT6vBc', at: '2026-10-30T09:22:00.000Z', choice: 2 });
const R1B = Buffer.from(JSON.stringify(R1, null, 1));

// ---------------------------------------------------------------- 1. 形
console.log('shape');
{
  const ajv = new Ajv({ allErrors: true, strict: false, loadSchema: () => { throw new Error('no network'); } });
  const SCHEMA = JSON.parse(fs.readFileSync(path.join(PROTO, 'schema.json'), 'utf8'));
  ajv.addSchema(SCHEMA);
  const sv = ajv.getSchema(SCHEMA.$id + '#/$defs/results');
  ok(!!sv && sv(R0) && parseResults(FIX).ok, 'the vendored fixture http/results.json is valid results (schema and parseResults)');
  const m = (f) => { const x = clone(R0); f(x); return x; };
  const cases = [
    ['fixture', R0], ['xss strings', R1],
    ['extra member', m((x) => { x.extra = 1; })], ['v 2', m((x) => { x.v = 2; })], ['no exportedAt', m((x) => { delete x.exportedAt; })],
    ['bad room', m((x) => { x.room = 'r-ABCDEFGH'; })], ['bad window', m((x) => { x.window.from = '2026-10-30 09:00'; })], ['window extra', m((x) => { x.window.z = 1; })],
    ['activities bad step', m((x) => { x.activities['no-colon'] = []; })], ['activity kind', m((x) => { x.activities['*'][0].kind = 'board'; })],
    ['poll 13 choices', m((x) => { x.activities['s-k3f9q2:2'][0].choices = Array(13).fill('c'); })], ['prompt 301', m((x) => { x.activities['s-k3f9q2:2'][0].prompt = 'あ'.repeat(301); })],
    ['qa without hidden', m((x) => { delete x.responses[0].hidden; })], ['text 500 emoji', m((x) => { x.responses[0].text = '😀'.repeat(500); })], ['text 501', m((x) => { x.responses[0].text = 'a'.repeat(501); })],
    ['name 41', m((x) => { x.responses[1].name = 'n'.repeat(41); })], ['choice 12', m((x) => { x.responses[1].choice = 12; })], ['choice 1.5', m((x) => { x.responses[1].choice = 1.5; })],
    ['bad pid', m((x) => { x.responses[1].pid = 'short'; })], ['bad item id', m((x) => { x.responses[0].id = 'q-1'; })], ['response kind', m((x) => { x.responses[0].kind = 'board'; })],
    ['responses not a list', m((x) => { x.responses = {}; })], ['empty responses', m((x) => { x.responses = []; })], ['array', [R0]],
  ];
  const disagree = cases.filter(([, v]) => !!sv(v) !== parseResults(enc.encode(JSON.stringify(v))).ok).map(([n]) => n);
  ok(disagree.length === 0, `parseResults agrees with the vendored schema on ${cases.length} cases (${disagree.join(', ') || 'all agree'})`);
  ok(parseResults(enc.encode('{"v":1,')).code === 'not-json' && parseResults(new Uint8Array([0xff, 0xfe, 0x00])).code === 'not-utf8' && parseResults(enc.encode('{"v":1}')).code === 'not-results', 'bad JSON, non-UTF-8 and other JSON are refused with a code');
  ok(parseResults(new Uint8Array(RESULTS_MAX_BYTES + 1)).code === 'too-large' && RESULTS_MAX_BYTES === ATTACH_LIMITS.fileBytes, 'over 10 MiB (the §3.8 attachment limit) is refused before parsing');
  ok(isLiveResults(FIX) && !isLiveResults(enc.encode('{"a":1}')) && !isLiveResults(enc.encode('x,y\n1,2\n')), 'isLiveResults: by content');
  const s = summarizeResults(R1);
  ok(s.questions === 1 && s.responses === 4 && s.polls.length === 1 && s.polls[0].id === 'p1' && s.polls[0].counts.join() === '0,2,1' && s.polls[0].total === 3, 'summary: number of questions and the tally per poll');
  const inferred = summarizeResults({ ...R0, activities: {} });
  ok(inferred.polls.length === 1 && inferred.polls[0].counts.join() === '0,1' && summaryLines(inferred, 'en')[1] === 'Poll p1 — #1: 0 · #2: 1', 'summary: a poll without declared choices is tallied by index');
  ok(summaryLines(s, 'ja')[0] === '質問 1 件' && summaryLines(s, 'ja')[1] === `投票 p1「${XSS}」 — <b id="xss-b">A</b>: 0 · B: 2 · C: 1`, 'summary lines (the strings are kept as text)');
  for (const lang of ['ja', 'en']) {
    const rec = resultsRecord(R1, lang);
    ok(rec.path === 'attachments/live-r-7k2q6xw4-2026-10-30.json' && rec.role === 'data', `record (${lang}): name live-<room>-<date>.json, role data`);
    ok(rec.title === (lang === 'ja' ? '授業の部屋の結果（r-7k2q6xw4、2026-10-30）' : 'Live room results (r-7k2q6xw4, 2026-10-30)'), `record (${lang}): the title has only the room id and the date: ${rec.title}`);
    ok(!titleProblem(rec.title) && !descriptionProblem(rec.description) && !roleProblem(rec.path, 'data') && (lang === 'ja' ? /学ぶ人.*質問と投票の答え/ : /questions and poll answers learners/).test(rec.description), `record (${lang}): title ≤ 120 and description ≤ 300, one line (§3.8); the description says it holds learners' questions and answers`);
  }
  ok(resultsRecord(R0, 'ja', (p) => p.endsWith('2026-10-30.json')).path === 'attachments/live-r-7k2q6xw4-2026-10-30-2.json', 'record: a second import of the same room and day gets -2');
  const insp = await inspectAttachment('attachments/live-r-7k2q6xw4-2026-10-30.json', new Uint8Array(R1B));
  ok(!insp.problems.some(blocking) && insp.mime === 'application/json', 'the §3.8 content check accepts results (application/json, role data)');
  ok(roomMatch(R0, { room: 'r-7k2q6xw4' }) === 'match' && roomMatch(R0, { room: 'r-aaaaaaaa' }) === 'mismatch' && roomMatch(R0, null) === 'none', 'roomMatch: match, mismatch, none');
}

// ---------------------------------------------------------------- 2. コマンド
console.log('cli');
const deckDir = path.join(work, 'deck');
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), deckDir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
const cfgPath = path.join(deckDir, CFG);
const LIVE = { v: 1, endpoint: FORMAT.LIVE_ENDPOINT, room: 'r-7k2q6xw4', activities: R0.activities };
await buildPortable(path.join(deckDir, 'deck.html'), {});   // docId
const playBefore = (await buildPortable(path.join(deckDir, 'deck.html'), { playOnly: true })).html;
const cfg0 = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const portableCli = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), ...a], { encoding: 'utf8' });
const resFile = path.join(work, 'results.json'), otherFile = path.join(work, 'other.json'), badFile = path.join(work, 'bad.json'), bigFile = path.join(work, 'big.json');
fs.writeFileSync(resFile, R1B);
fs.writeFileSync(otherFile, JSON.stringify({ ...R0, room: 'r-bbbbbbbb' }));
fs.writeFileSync(badFile, '{"v":1,"room":');
fs.writeFileSync(bigFile, Buffer.alloc(RESULTS_MAX_BYTES + 1, 0x20));
{
  fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: LIVE } }, null, 2) + '\n');
  const a = portableCli('attach', deckDir, resFile);
  const conf = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const e = conf[KEY] && conf[KEY][0];
  ok(a.status === 0 && e && e.path === 'attachments/live-r-7k2q6xw4-2026-10-30.json' && e.role === 'data' && e.title === '授業の部屋の結果（r-7k2q6xw4、2026-10-30）' && fs.readFileSync(path.join(deckDir, e.path)).equals(R1B) && conf.extensions.live.room === 'r-7k2q6xw4' && conf.docId === cfg0.docId,
    'cli attach: the results become attachments/live-<room>-<date>.json with role data and the title; other settings kept' + (a.status ? ': ' + a.stderr : ''));
  ok(/learners typed/.test(a.stderr) && !/room r-/.test(a.stderr.replace(/live-r-/g, '')), 'cli attach: prints the privacy line; no room warning when the room matches');
  const dup = portableCli('attach', deckDir, resFile);
  ok(dup.status === 1 && /already attached/.test(dup.stderr), 'cli attach: the same results again are refused');
  const bad = portableCli('attach', deckDir, badFile), big = portableCli('attach', deckDir, bigFile);
  ok(bad.status === 1 && /not live room results/.test(bad.stderr) && big.status === 1 && /larger than 10485760/.test(big.stderr), 'cli attach: bad JSON and an oversize file are refused');
  const oth = portableCli('attach', deckDir, otherFile);
  ok(oth.status === 0 && /results are for room r-bbbbbbbb, but this lesson's live settings name room r-7k2q6xw4; added anyway/.test(oth.stderr), 'cli attach: a room mismatch warns but adds');
  const pk = portableCli('pack', deckDir, '-o', path.join(work, 'with.ega.html'));
  ok(pk.status === 0 && /this file contains live room results \("attachments\/live-r-7k2q6xw4-2026-10-30\.json", "attachments\/live-r-bbbbbbbb-2026-10-30\.json"\)/.test(pk.stderr), 'cli pack: warns that the single file contains live room results');
  const w = await readPortable(fs.readFileSync(path.join(work, 'with.ega.html'), 'utf8'));
  ok(w.index[KEY].length === 2 && w.index[KEY].every((x) => x.role === 'data') && Buffer.from(w.files['attachments/live-r-7k2q6xw4-2026-10-30.json']).equals(R1B), 'cli pack: the teacher\'s single file carries the results (role data)');
  const pk2 = portableCli('pack', deckDir, '-o', path.join(work, 'without.ega.html'), '--without-live-results');
  const wo = await readPortable(fs.readFileSync(path.join(work, 'without.ega.html'), 'utf8'));
  ok(pk2.status === 0 && !/this file contains live room results/.test(pk2.stderr) && /live room results left out/.test(pk2.stderr) && !(wo.index[KEY] || []).length && !Object.keys(wo.files).some((p) => p.startsWith('attachments/')) && !JSON.parse(new TextDecoder().decode(wo.files[CFG]))[KEY],
    'cli pack --without-live-results: no results in the file (nor in its egatari.json); the working folder keeps them');
  ok(JSON.parse(fs.readFileSync(cfgPath, 'utf8'))[KEY].length === 2, 'cli pack --without-live-results: the working folder\'s egatari.json is unchanged');
  const bo = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'build.mjs'), deckDir, '--portable', '--without-live-results', '-o', path.join(work, 'without2.ega.html')], { encoding: 'utf8' });
  ok(bo.status === 0 && !(await readPortable(fs.readFileSync(path.join(work, 'without2.ega.html'), 'utf8'))).index[KEY], 'cli build --portable --without-live-results: the same');
  // 再生専用：部屋の有無によらず結果は入らない（添付は再生専用に入らない。§3.7・拡張 live §3）
  const po = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'build.mjs'), deckDir, '--play-only', '-o', path.join(work, 'p.play.ega.html')], { encoding: 'utf8' });
  const play = fs.readFileSync(path.join(work, 'p.play.ega.html'), 'utf8');
  const sha = crypto.createHash('sha256').update(R1B).digest('hex');
  const b64 = R1B.toString('base64').slice(0, 40);
  ok(po.status === 0 && !/contains live room results/.test(po.stderr) && !play.includes(sha) && !play.includes(b64) && !play.includes('window.__xss') && !play.includes(`id="${FORMAT.INDEX_ID}"`), 'play-only: no results (no blob, no hash, no learner text, no index) and no warning');
  ok(play === playBefore, 'play-only: byte-identical to the play-only export before the results were attached');
  const now = Date.now(), iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const lr = await buildPortable(path.join(deckDir, 'deck.html'), { playOnly: true, live: { v: 1, endpoint: FORMAT.LIVE_ENDPOINT, room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: iso(now), to: iso(now + 3600e3) } } });
  ok(!lr.html.includes(sha) && !lr.html.includes(b64) && !lr.html.includes('window.__xss') && !lr.html.includes('勾配が消える'), 'play-only with a live room: no results either');
  // 次の試験のため、作業フォルダを結果のない状態に戻す
  for (const f of fs.readdirSync(path.join(deckDir, 'attachments'))) fs.rmSync(path.join(deckDir, 'attachments', f));
  fs.rmdirSync(path.join(deckDir, 'attachments'));
  fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg0, extensions: { live: LIVE } }, null, 2) + '\n');
}

// ---------------------------------------------------------------- 3. 編集アプリ
console.log('editor');
{
  const DIST = path.join(work, 'dist');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'inherit' });
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const errs = [], away = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  ctx.on('request', (r) => { const u = r.url(); if (!/^(data|blob|about):/.test(u) && !u.startsWith(BASE)) away.push(u); });
  try {
    await page.goto(BASE + '?lang=ja');
    await page.waitForSelector('#drop');
    const toastText = async () => (await page.textContent('#toast')) || '';
    const waitIdle = async () => { await page.waitForFunction(() => !document.querySelector('#dlg[open]') && !window.__APP_TEST.attachBusy() && document.getElementById('attach-list'), null, { timeout: 30000 }); await page.waitForTimeout(200); };
    const ff = {};
    for (const f of ['deck.html', 'narration.md', CFG]) ff[f] = fs.readFileSync(path.join(deckDir, f)).toString('base64');
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('lrdeck', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('lrdeck', { create: true });
      for (const [rel, b64] of Object.entries(files)) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(u); await w.close(); }
      window.__fd = d;
      window.__testDir = await root.getDirectoryHandle('lrout', { create: true });
    }, ff);
    await page.evaluate(() => window.__APP_TEST_OPEN(window.__fd));
    await page.waitForFunction(() => window.__APP_TEST.state().kind === 'folder' && window.__APP_TEST.state().loads > 0, null, { timeout: 30000 });
    const fread = (rel) => page.evaluate(async (rel) => { try { const parts = rel.split('/'); const n = parts.pop(); let d = window.__fd; for (const x of parts) d = await d.getDirectoryHandle(x); return await (await (await d.getFileHandle(n)).getFile()).text(); } catch { return null; } }, rel);
    const outRead = (name) => page.evaluate(async (n) => { try { return await (await (await window.__testDir.getFileHandle(n)).getFile()).text(); } catch { return null; } }, name);
    const exportTo = async (sel, name) => {
      await page.evaluate(async (n) => { window.__APP_TEST.saveHandle = await window.__testDir.getFileHandle(n, { create: true }); }, name);
      await page.evaluate((s) => document.querySelector(s).click(), sel);
    };
    const waitFile = async (name) => { let t = ''; for (let i = 0; i < 300 && t.length < 1000; i++) { await page.waitForTimeout(100); t = (await outRead(name)) || ''; } return t; };
    // 結果を取り込む前の再生専用
    await exportTo('#b-export-play', 'before.play.ega.html');
    const playBeforeApp = await waitFile('before.play.ega.html');
    // 添付の板
    await page.click('#b-attach');
    await page.waitForSelector('#attach-list');
    ok((await page.textContent('#attach-live')) === '授業の部屋の結果を取り込む…', 'editor: the attachments panel has 「授業の部屋の結果を取り込む…」');
    // 断る：壊れた JSON・大きすぎる
    await page.setInputFiles('#attach-live-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"v":1,"room":') });
    await page.waitForFunction(() => /取り込めません/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
    ok(/授業の部屋の結果の JSON ではないので取り込めません/.test(await toastText()) && !(await page.$('#dlg[open]')) && (await fread('attachments/live-r-7k2q6xw4-2026-10-30.json')) === null, 'editor: bad JSON is refused with a clear message');
    await page.setInputFiles('#attach-live-file', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ hello: 'world' })) });
    await page.waitForTimeout(400);
    ok(/授業の部屋の結果の JSON ではないので取り込めません/.test(await toastText()) && !(await page.$('#dlg[open]')), 'editor: JSON that is not results is refused');
    await page.setInputFiles('#attach-live-file', { name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(RESULTS_MAX_BYTES + 1, 0x20) });
    await page.waitForFunction(() => /大きすぎて/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
    ok(/10\.0 MB まで/.test(await toastText()), 'editor: an oversize file is refused (10 MiB)');
    // 取り込む：はじめての知らせ（部屋は合う）
    await page.setInputFiles('#attach-live-file', { name: 'results.json', mimeType: 'application/json', buffer: R1B });
    await page.waitForSelector('#dlg[open] #live-results-privacy');
    ok(/学ぶ人が打った字/.test(await page.textContent('#live-results-privacy')) && /どこにも送りません/.test(await page.textContent('#live-results-privacy')) && !(await page.$('#dlg #live-results-mismatch')), 'editor: the first import shows the privacy notice (no room warning when the room matches)');
    await clickDlg(page, '#dlg-ok');
    await waitIdle();
    const P1 = 'attachments/live-r-7k2q6xw4-2026-10-30.json';
    const conf1 = JSON.parse(await fread(CFG));
    const e1 = conf1[KEY].find((x) => x.path === P1);
    ok(e1 && e1.role === 'data' && e1.title === '授業の部屋の結果（r-7k2q6xw4、2026-10-30）' && /質問と投票の答え/.test(e1.description) && (await fread(P1)) === R1B.toString('utf8') && conf1.extensions.live.room === 'r-7k2q6xw4',
      'editor: the results are an attachment with role data, the title (room and date only) and the description');
    ok(await page.$eval(`[data-attach-role="${P1}"]`, (x) => x.value) === 'data' && await page.$eval(`[data-attach-title="${P1}"]`, (x) => x.value) === e1.title, 'editor: the list shows role data and the title');
    const row = `#attach-list [data-attach="${P1}"]`;
    ok((await page.textContent(`${row} .attach-badge`)) === '学ぶ人の回答', 'editor: the row is marked 「学ぶ人の回答」');
    const lines = await page.$$eval(`${row} .attach-live div`, (xs) => xs.map((x) => x.textContent));
    ok(lines.length === 2 && lines[0] === '質問 1 件' && lines[1] === `投票 p1「${XSS}」 — <b id="xss-b">A</b>: 0 · B: 2 · C: 1`, 'editor: the summary shows the number of questions and the tally per poll: ' + JSON.stringify(lines));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'editor-live-results.png') });
    ok(await page.evaluate(() => window.__xss === undefined && !document.querySelector('#attach-list img, #xss-b')), 'editor: the learner strings render as text (no element, no script run)');
    // 授業の部屋の板から：部屋が違う結果（知らせは一度だけなので、出るのは部屋の知らせ）
    await page.evaluate(() => document.getElementById('b-export-live').click());
    await page.waitForSelector('#live-panel #live-import-results');
    ok((await page.textContent('#live-import-results')) === '授業の部屋の結果を取り込む…', 'editor: the live panel has 「授業の部屋の結果を取り込む…」');
    await page.setInputFiles('#live-results-file', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...R0, room: 'r-bbbbbbbb' })) });
    await page.waitForSelector('#dlg[open] #live-results-mismatch');
    ok(/r-bbbbbbbb/.test(await page.textContent('#live-results-mismatch')) && /r-7k2q6xw4/.test(await page.textContent('#live-results-mismatch')), 'editor: a room mismatch shows a warning (and still allows the import)');
    await clickDlg(page, '#dlg-ok');
    await waitIdle();
    const P2 = 'attachments/live-r-bbbbbbbb-2026-10-30.json';
    ok(!!(await page.$(`#attach-list [data-attach="${P2}"] .attach-live`)) && JSON.parse(await fread(CFG))[KEY].some((x) => x.path === P2 && x.role === 'data'), 'editor: the mismatched results are added after the warning; the attachments panel shows them');
    // 同じものをもう一度：知らせなしで（部屋が合う）、断る
    await page.setInputFiles('#attach-live-file', { name: 'results.json', mimeType: 'application/json', buffer: R1B });
    await page.waitForFunction(() => /もう添付にあります/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
    ok(!(await page.$('#dlg[open]')), 'editor: the privacy notice is shown only once; the same results again are refused');
    // 1 ファイルを書き出す：知らせ → 結果を外して書き出す
    await exportTo('#b-export-portable', 'without.ega.html');
    await page.waitForSelector('#dlg[open] #live-results-export-warn');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'editor-live-results-export.png') });
    ok(/Live の結果が入っています。人に渡すなら外してください/.test(await page.textContent('#live-results-export-warn')) && !!(await page.$('#dlg-without')) && !!(await page.$('#dlg-with')), 'editor: exporting a single file with results warns and offers export without them');
    await clickDlg(page, '#dlg-without');
    const wo = await readPortable(await waitFile('without.ega.html'));
    ok(!(wo.index[KEY] || []).length && !Object.keys(wo.files).some((p) => p.startsWith('attachments/')), 'editor: “結果を外して書き出す” writes a single file without the results');
    ok(JSON.parse(await fread(CFG))[KEY].length === 2, 'editor: the working folder keeps the results');
    await exportTo('#b-export-portable', 'with.ega.html');
    await page.waitForSelector('#dlg[open] #live-results-export-warn');
    await clickDlg(page, '#dlg-with');
    const w = await readPortable(await waitFile('with.ega.html'));
    ok(w.index[KEY].map((x) => x.path).sort().join() === [P1, P2].sort().join() && w.index[KEY].every((x) => x.role === 'data'), 'editor: “入れたまま書き出す” keeps them (the teacher\'s own copy)');
    // 再生専用：入らない
    await exportTo('#b-export-play', 'after.play.ega.html');
    const play = await waitFile('after.play.ega.html');
    const sha = crypto.createHash('sha256').update(R1B).digest('hex');
    ok(!(await page.$('#dlg[open]')) && !play.includes(sha) && !play.includes(R1B.toString('base64').slice(0, 40)) && !play.includes('window.__xss') && !play.includes(`id="${FORMAT.INDEX_ID}"`), 'editor: the play-only export carries no results (and asks nothing)');
    ok(play === playBeforeApp, 'editor: the play-only export is byte-identical to the one before the import');
    ok(errs.length === 0, 'editor: no console errors ' + JSON.stringify(errs.slice(0, 5)));
    ok(away.length === 0, `editor: no request outside its own origin (${away.slice(0, 3).join(', ')})`);
  } finally {
    await ctx.close();
    await browser.close();
    srv.close();
  }
}
console.log(fails ? `live results: ${fails} FAILED` : 'live results: all ok');
process.exit(fails ? 1 : 0);
