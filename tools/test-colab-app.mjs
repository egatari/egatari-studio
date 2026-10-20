// 編集アプリの「Colab で音声を作る」の往復の確かめ（app/audio-panel.js の Colab の群。ブラウザ。モデルも Colab も使わない）
//   node tools/test-colab-app.mjs [作業用のフォルダ]
// 書き出した tts-job.json から、tools/colab-fixture.mjs（ノートブックの dry-run と同じ形の zip を JS で作る）で zip を作って取り込む：
//   フォルダ：群が出る（WebGPU がなければ開く）・確認した範囲の記し・プライバシーの確認（取り消せる）・tts-job.json（docId・段階・inputHash・読みを適用した文）・
//     取り込みで inputHash が合う段階だけ cue つきの MP3（kind tts・sync auto・recipe）・原稿が変わった段階は印付き（使わない。「古い印のまま使う」で古いまま）・
//     別の教材の zip は拒否・敵対の zip（偽の WAV・展開爆弾）は何も書かない・コンソールのエラーがない
//   持ち運べる 1 ファイル：取り込み → 「保存」が段 A（音声の段階だけが変わる）・読み戻して cue と sync auto
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import * as PF from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { MP3, PROCESSING } from '../kit/core/audio-core.mjs';
import { writeZip } from '../kit/core/zip-read.mjs';
import { expectedCues, COLAB_VERIFIED } from '../kit/core/colab-core.mjs';
import { colabZip } from './colab-fixture.mjs';
import { silentWav } from './portable-fixtures.mjs';
import { regionDiff } from './tier-a-diff.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-colab-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-single'], { stdio: 'inherit' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

const browser = await launch({});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP', acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errs.push('console: ' + m.text()); });
const deckFrame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());
async function frameReady(timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    const f = deckFrame();
    const want = await page.evaluate(() => window.__APP_TEST.state().loads);
    try { if (f && await f.evaluate((w) => !!(window.DECK && DECK.ready && window.__APP_LOAD === w), want)) { await page.waitForTimeout(120); return f; } } catch { /* 読み込み中 */ }
    if (Date.now() - t0 > timeout) throw new Error('deck frame not ready');
    await page.waitForTimeout(100);
  }
}
const opfsRead = (rel, bin) => page.evaluate(async ([rel, bin]) => {
  try { const parts = rel.split('/'); const name = parts.pop(); let d = window.__testDir; for (const x of parts) d = await d.getDirectoryHandle(x); const f = await (await d.getFileHandle(name)).getFile(); return bin ? [...new Uint8Array(await f.arrayBuffer())] : await f.text(); }
  catch { return null; }
}, [rel, !!bin]);
const idle = () => page.waitForFunction(() => { const s = window.__APP_TEST.audio(); return !s.busy && !s.loading; }, null, { timeout: 60000 });
const msgs = () => page.$$eval('#dev-audio .dv-colab-msg', (e) => e.map((x) => x.textContent));
// 書き出す（確かめの窓 → 取り消すか進む）→ ダウンロードした tts-job.json
async function exportJob(scope = 'need') {
  await page.selectOption('#dev-audio-colab-scope', scope);
  await page.click('#dev-audio-colab-export');
  await page.waitForSelector('#dlg[open] #colab-privacy');
  const dl = page.waitForEvent('download');
  await page.click('#dlg-ok');
  const d = await dl;
  ok(d.suggestedFilename() === 'tts-job.json', 'export: downloads tts-job.json');
  return JSON.parse(fs.readFileSync(await d.path(), 'utf8'));
}
async function importZip(bytes) {
  const fc = page.waitForEvent('filechooser');
  await page.click('#dev-audio-colab-import');
  await (await fc).setFiles({ name: 'egatari-tts-result.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => document.querySelector('#dev-audio .dv-colab-msg'), null, { timeout: 60000 });
  await idle();
}

try {
  await page.goto(BASE);
  await page.waitForSelector('#drop');
  // ---------------------------------------------------------------- 1. 作業フォルダ
  const SRC = path.join(ROOT, 'examples/minimal');
  const narr = fs.readFileSync(path.join(SRC, 'narration.md'), 'utf8');
  const segs = parseNarration(narr);
  const keys = segs.map((s) => `${s.slideKey}:${s.stepKey}`);
  const DOC = PF.newDocId();
  const files = { 'deck.html': fs.readFileSync(path.join(SRC, 'deck.html'), 'utf8'), 'narration.md': narr, [FORMAT.CONFIG_FILE]: JSON.stringify({ docId: DOC }) + '\n' };
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('colab-deck', { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle('colab-deck', { create: true });
    for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
    window.__testDir = d;
  }, files);
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir)) === true, 'folder: opened');
  await frameReady();
  // WebGPU がない（学校の PC・Safari）：群は開いていて、そこに誘導する
  await page.evaluate(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  await page.click('#b-audio');
  await page.waitForSelector('#dev-audio #dev-audio-colab');
  await idle();
  ok(await page.evaluate(() => document.getElementById('dev-audio-colab').open), 'panel: the Colab group is open when the browser has no WebGPU');
  ok(await page.evaluate(() => document.getElementById('dev-audio-tts').disabled), 'panel: browser TTS is off without WebGPU');
  const un = await page.$('#dev-audio-colab-verified');
  ok(!!un && (await un.textContent()) === COLAB_VERIFIED.ja, 'panel: the "verified" note (what was and was not verified) is shown');
  const href = await page.getAttribute('#dev-audio-colab-open', 'href');
  ok(/^https:\/\/colab\.research\.google\.com\/github\/egatari\/egatari-studio\/blob\/[^/]+\/colab\/egatari-tts\.ipynb$/.test(href) && (await page.getAttribute('#dev-audio-colab-open', 'rel')) === 'noopener', 'panel: "Open Colab" links to the official notebook (new tab, noopener)');
  ok((await page.textContent('#dev-audio-colab-scope option[value=need]')).includes(`（${keys.length}）`), `panel: the default scope counts the steps without audio (${keys.length})`);
  // プライバシーの確認：取り消せば書き出さない
  await page.click('#dev-audio-colab-export');
  await page.waitForSelector('#dlg[open] #colab-privacy');
  ok((await page.textContent('#colab-privacy')).includes('Google'), 'export: the privacy note says the narration is processed in Google’s environment');
  let downloaded = false; page.once('download', () => { downloaded = true; });
  await page.click('#dlg-cancel');
  await page.waitForTimeout(300);
  ok(!downloaded, 'export: cancelling the privacy question writes nothing');
  // 書き出す
  const job = await exportJob('need');
  ok(job.egatari === 'tts-job' && job.v === 1 && job.docId === DOC && job.steps.length === keys.length, `export: tts-job.json has docId and ${keys.length} steps`);
  ok(job.recipe.engine === 'irodori' && job.recipe.processing === PROCESSING && /^[0-9a-f]{64}$/.test(job.recipe.dictionary), 'export: recipe target (engine, processing, reading dictionary hash)');
  const sj = job.steps.find((x) => x.key === keys[0]), seg0 = segs[0];
  ok(sj.inputHash === await PF.inputHash(seg0) && JSON.stringify(sj.turns[0].segments.length) === JSON.stringify(seg0.turns[0].ttsParts.length), 'export: inputHash and the segments follow the narration');
  const eta = job.steps.find((x) => x.turns.some((t) => t.segments.some((s) => s.includes('イータ'))));
  ok(!!eta && !job.steps.some((x) => x.turns.some((t) => t.segments.some((q) => /[{}]/.test(q)))), 'export: the reading dictionary is applied by the editor (イータ), no markup');
  ok((await msgs()).some((m) => m.includes('tts-job.json')), 'export: the panel says what to do next');
  // 書き出した後に、1 つの段階の原稿を直す（その段階は印付きになる）
  const changed = keys[2];
  const nr = await page.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), changed);
  const r1 = await page.evaluate(([k, nr]) => window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, k.lastIndexOf(':')), stepKey: k.slice(k.lastIndexOf(':') + 1), rev: nr.rev, turns: nr.turns.map((t, i) => (i ? t : { ...t, text: t.text + 'もう一文足しました。' })) }), [changed, nr]);
  ok(r1._status === 200 && r1.changed, 'folder: one step’s narration is edited after the export');
  // 取り込み：別の教材の zip は拒否
  const other = await colabZip(job, { docId: PF.newDocId() });
  await importZip(other);
  ok((await msgs()).some((m) => m.includes('別の教材')) && (await opfsRead('audio/manifest.json')) === null, 'import: a zip made for another lesson (docId) is refused and nothing is written');
  // 敵対の zip：HTML を音声と言い張る・展開爆弾
  await importZip(await colabZip({ ...job, steps: [job.steps[0]] }, { mutate: (r, e) => { e[1] = [e[1][0], new TextEncoder().encode('<html><script>alert(1)</script></html>')]; } }));
  ok((await msgs()).some((m) => m.includes('WAV')) && !(await opfsRead('audio/manifest.json') || '').includes('"tts"'), 'import: a fake WAV (HTML) is refused; nothing is applied from it');
  const bomb = new Uint8Array(40_000_000);
  await importZip(writeZip([['records.json', new TextEncoder().encode('{"egatari":"tts-records","v":1,"steps":{}}'), { comp: zlib.deflateRawSync(bomb), usize: 100 }]]));
  ok((await msgs()).some((m) => m.includes('取り込めません')) , 'import: a zip bomb (declared small, expands big) is refused');
  await importZip(new TextEncoder().encode('not a zip'));
  ok((await msgs()).some((m) => m.includes('取り込めません')), 'import: a file that is not a zip is refused with a message');
  // 本番の zip
  await importZip(await colabZip(job));
  const sum = (await msgs())[0];
  ok(sum.includes(`適用 ${keys.length - 1} 件`) && sum.includes('印付き 1 件'), 'import: ' + sum);
  const man = JSON.parse(await opfsRead('audio/manifest.json'));
  const applied = keys.filter((k) => k !== changed);
  ok(JSON.stringify(Object.keys(man.segments)) === JSON.stringify(applied), 'import: only the steps whose narration matches are written (the changed step is not)');
  let allGood = true;
  for (const k of applied) {
    const e = man.segments[k], seg = segs.find((s) => `${s.slideKey}:${s.stepKey}` === k);
    const g = e.kind === 'tts' && e.sync === 'auto' && e.cues.length === expectedCues(seg) && e.inputHash === await PF.inputHash(seg) && e.recipe.processing === PROCESSING + '+colab1' && e.processing === PROCESSING + '+colab1'
      && /^tts_[0-9a-f]{16}\.mp3$/.test(e.file) && e.startOffset === MP3.startOffset && e.engine === 'dry-run';
    if (!g) { allGood = false; console.log('       bad entry ' + k + ' ' + JSON.stringify(e)); }
  }
  ok(allGood, 'import: each record is kind tts, sync auto, cues = the narration’s {cue}/{mark} count, inputHash, recipe, MP3 with startOffset');
  const mp3 = await opfsRead('audio/' + man.segments[applied[0]].file, true);
  ok(mp3 && (mp3[0] === 0xff || String.fromCharCode(...mp3.slice(0, 3)) === 'ID3'), 'import: the audio is encoded to MP3 by the usual path');
  const withCues = applied.find((k) => man.segments[k].cues.length > 0);
  ok(withCues ? man.segments[withCues].cues.every((c, i, a) => c >= 0 && (i === 0 || c >= a[i - 1])) : true, 'import: the measured cue times are increasing seconds');
  ok(!(await opfsRead('audio/manifest.json')).includes(changed), 'import: the changed step has no audio yet');
  // 印付き
  ok(await page.isVisible(`#dev-audio .dv-marked[data-key="${changed}"]`), 'marked: the changed step is listed as marked (not applied)');
  ok((await audioStateOf()).takes === 0, 'marked: no take was made for it');
  await page.click(`#dev-audio .dv-marked[data-key="${changed}"] .dv-use-old`);
  await page.waitForFunction((k) => { const s = window.__APP_TEST.audio(); return !s.busy && !!document.querySelector('#dev-audio-cur'); }, changed);
  await page.waitForFunction(async (k) => (await window.__testDir.getDirectoryHandle('audio').then((d) => d.getFileHandle('manifest.json')).then((h) => h.getFile()).then((f) => f.text())).includes(k), changed, { timeout: 30000 });
  const man2 = JSON.parse(await opfsRead('audio/manifest.json')).segments[changed];
  ok(man2.kind === 'tts' && man2.inputHash === job.steps.find((x) => x.key === changed).inputHash && man2.inputHash !== await PF.inputHash(parseNarration(await opfsRead('narration.md')).find((s) => `${s.slideKey}:${s.stepKey}` === changed)), 'marked: "use it, still marked stale" writes the old inputHash (so it shows stale)');
  // 古い印のままでも、書き出し直しの対象に入る
  await page.evaluate(() => window.__APP_TEST.audioPanel.reload());
  await idle();
  ok((await page.textContent('#dev-audio-colab-scope option[value=need]')).includes('（1）'), 'export scope: the stale step is the only one left to export');
  ok((await audioStateOf()).errors === undefined, 'panel state is readable');

  // ---------------------------------------------------------------- 2. 持ち運べる 1 ファイル
  const PDIR = path.join(work, 'pmin');
  fs.rmSync(PDIR, { recursive: true, force: true });
  fs.cpSync(SRC, PDIR, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
  fs.mkdirSync(path.join(PDIR, 'audio'), { recursive: true });
  {
    const segments = {};
    segs.forEach((x, j) => { fs.writeFileSync(path.join(PDIR, 'audio', `seg_js${j}.wav`), silentWav(0.5)); segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], sync: 'none' }; });
    fs.writeFileSync(path.join(PDIR, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
    fs.writeFileSync(path.join(PDIR, 'egatari.json'), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', creators: ['Test Author'] } }, null, 2) + '\n');
  }
  const pmin = await buildPortable(path.join(PDIR, 'deck.html'), { out: path.join(PDIR, 'out', 'deck.ega.html') });
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('colab-saved.ega.html', { create: true }); });
  ok(await page.evaluate(([html]) => window.__APP_TEST.openFile({ bytes: new TextEncoder().encode(html), name: 'deck.ega.html' }), [pmin.html]), 'portable: opened');
  await frameReady();
  await page.click('#b-audio');
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlg-ok');
  await page.waitForSelector('#dev-audio #dev-audio-colab');
  await idle();
  const pjob = await exportJob('all');
  const pdoc = (await page.evaluate(() => window.__APP_TEST.state().portable)).docId;
  ok(pjob.docId === pdoc && pjob.steps.length === keys.length, 'portable: the job carries the index docId; all steps are exported');
  await importZip(await colabZip(pjob));
  ok((await msgs())[0].includes(`適用 ${keys.length} 件`), 'portable: ' + (await msgs())[0]);
  ok(await page.evaluate(() => window.__APP_TEST.state().portable.dirty), 'portable: the imported audio marks the file unsaved');
  await page.evaluate(() => window.__APP_TEST.save('save'));
  const ps = await page.evaluate(() => window.__APP_TEST.state().portable);
  ok(ps.lastTier === 'A' && ps.lastTierA && JSON.stringify([...ps.lastTierA.audio].sort()) === JSON.stringify([...keys].sort()) && !ps.dirty, 'portable: saved by tier A; only the audio of the imported steps changed');
  const saved = await page.evaluate(() => window.__APP_TEST.saved());
  let diffOk = true;
  try { regionDiff(pmin.html, saved, { audio: keys }); } catch (e) { diffOk = false; console.log('       ' + e.message.slice(0, 300)); }
  ok(diffOk, 'portable: bytes outside the tier A regions are identical (region diff)');
  const back = await PF.readPortable(saved);
  const rec = back.index.audio[keys[2]], seg2 = segs[2];
  ok(rec.kind === 'tts' && rec.sync === 'auto' && rec.cues.length === expectedCues(seg2) && rec.inputHash === await PF.inputHash(seg2) && rec.recipe.engine === 'dry-run' && back.index.blobs[back.index.files[rec.file]].mime === 'audio/mpeg', 'portable: read back: kind tts, sync auto, cues, inputHash, recipe, MP3 blob');
  ok(!(await PF.isStale(rec, seg2)), 'portable: read back: the step is up to date (inputHash matches)');

  ok(!errs.length, 'console: no errors' + (errs.length ? '\n       ' + errs.join('\n       ') : ''));
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e.stack || e.message));
} finally {
  await browser.close();
  srv.close();
}
async function audioStateOf() { return page.evaluate(() => { const s = window.__APP_TEST.audio(); return { takes: Object.values(s.takes).reduce((n, l) => n + l.length, 0) }; }); }
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
