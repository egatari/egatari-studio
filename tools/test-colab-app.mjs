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
import { expectedCues, COLAB_STEPS, COLAB_TIME } from '../kit/core/colab-core.mjs';
import { colabZip } from './colab-fixture.mjs';
import { silentWav } from './portable-fixtures.mjs';
import { regionDiff } from './tier-a-diff.mjs';
import { clickUntil, clickDlg } from './click-retry.mjs';

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
// C1 台本を書き出す（このブラウザで初めてなら確かめの窓 → 進む）→ ダウンロードした tts-job.json。sel：押すボタン
async function exportJob(confirm, sel = '#dev-audio-colab-export') {
  const dl = page.waitForEvent('download');
  if (confirm) {
    await clickUntil(page, sel, () => page.waitForSelector('#dlg[open] #colab-privacy', { timeout: 2500 }));
    await clickDlg(page, '#dlg-ok');
  } else await page.click(sel);
  const d = await dl;
  ok(!confirm ? !(await page.$('#dlg[open] #colab-privacy')) : true, 'export: no privacy question after the first time');
  ok(d.suggestedFilename() === 'tts-job.json', 'export: downloads tts-job.json');
  return JSON.parse(fs.readFileSync(await d.path(), 'utf8'));
}
let lastChooser = null;
async function importZip(bytes) {
  const fc = page.waitForEvent('filechooser');
  await page.click('#dev-audio-colab-import');
  const chooser = await fc;
  lastChooser = { multiple: chooser.isMultiple(), accept: await chooser.element().getAttribute('accept'), type: await chooser.element().getAttribute('type'), dir: await chooser.element().evaluate((e) => e.webkitdirectory) };
  await chooser.setFiles({ name: 'egatari-tts-result.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
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
  // WebGPU がない（学校の PC・Safari）：B の既定はクラウド（Google Colab）で、C1〜C3 が出る
  await page.evaluate(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  await page.click('#b-audio');
  await page.waitForSelector('#dev-audio #dev-audio-cloud-body');
  await idle();
  ok(await page.evaluate(() => document.getElementById('dev-audio-how').open && document.querySelector('#dev-audio-how input:checked').value === 'cloud' && !document.getElementById('dev-audio-how-local') && !document.getElementById('dev-audio-tts')), 'B: without WebGPU, クラウド is the default and この PC is not offered');
  ok((await page.textContent('#dev-audio-deck')) === `まだ音声がありません（${keys.length} ステップ）` && !(await page.$('#dev-audio-action')), 'A: no audio yet, no action (B is open instead)');
  const cb = await page.evaluate(() => ({ c: [...document.querySelectorAll('#dev-audio-cloud-body .dv-steps > li')].map((li) => li.querySelector('.dv-c > button, .dv-c > a').textContent), c2: [...document.querySelectorAll('#dev-audio-c2-steps li')].map((x) => x.textContent), note: document.getElementById('dev-audio-c2-note').textContent, text: document.getElementById('dev-audio-cloud-body').textContent }));
  ok(cb.c.join('|') === '台本を書き出す|Colab を開く|できた音声を取り込む…', 'C1–C3: 台本を書き出す, Colab を開く, できた音声を取り込む… ' + cb.c.join('|'));
  ok(JSON.stringify(cb.c2) === JSON.stringify(COLAB_STEPS.ja) && /「接続」/.test(cb.c2[0]) && /ランタイムのタイプを変更/.test(cb.c2[0]) && cb.note === COLAB_TIME.ja, 'C2: the steps in the panel (接続 → CPU when it cannot connect → すべてのセルを実行 → choose the file → ZIP downloads) and the T4 timing');
  ok(!cb.c2.some((x) => /\d+\s*(秒|分)/.test(x)) && (cb.text.match(/\d+\s*(秒|分)/g) || []).length === 1, 'C2: only the T4 timing line (no CPU timing)');
  ok((await page.textContent('#dev-audio-c1 .dv-note')) === `音声の要る ${keys.length} ステップの台本を 1 つのファイルにします`, 'C1: counts the steps that need audio');
  const href = await page.getAttribute('#dev-audio-colab-open', 'href');
  ok(/^https:\/\/colab\.research\.google\.com\/github\/egatari\/egatari-studio\/blob\/[^/]+\/colab\/egatari-tts\.ipynb$/.test(href) && (await page.getAttribute('#dev-audio-colab-open', 'rel')) === 'noopener' && (await page.getAttribute('#dev-audio-colab-open', 'target')) === '_blank', 'C2: "Colab を開く" links to the official notebook (new tab, noopener)');
  // プライバシーの確認（初めての 1 回）：キャンセルすれば書き出さない
  await clickUntil(page, '#dev-audio-colab-export', () => page.waitForSelector('#dlg[open] #colab-privacy', { timeout: 2500 }));
  await page.waitForSelector('#dlg[open] #colab-privacy');
  ok((await page.textContent('#colab-privacy')) === '台本の文は Google の環境で処理されます。共有してよい文だけにしてください。スライドやほかのファイルは渡しません。' && (await page.textContent('#dlg-title')).includes('台本を Google Colab に渡します') && (await page.textContent('#dlg-cancel')) === 'キャンセル', 'C1: the privacy question (台本を Google Colab に渡します / 書き出す / キャンセル)');
  let downloaded = false; page.once('download', () => { downloaded = true; });
  await clickDlg(page, '#dlg-cancel');
  await page.waitForTimeout(300);
  ok(!downloaded && !(await page.$('#dev-audio-c1[data-done="1"]')), 'C1: cancelling the privacy question writes nothing (no ✓)');
  // 書き出す（確かめる）
  const job = await exportJob(true);
  ok(await page.waitForSelector('#dev-audio-c1[data-done="1"]', { timeout: 5000 }).then(() => true, () => false), 'C1: ✓ after the export');
  ok((await page.evaluate(() => window.__APP_TEST.audio().method)) === 'cloud' && JSON.parse(await opfsRead('egatari.json')).studio.audioMethod === 'cloud' && JSON.parse(await opfsRead('egatari.json')).docId === DOC, 'method: the export records studio.audioMethod = cloud (docId kept)');
  // C2：Colab を開く（新しいタブ。試験ではネットワークに出ない）→ ✓
  await ctx.route('https://colab.research.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>colab</title>' }));
  const popP = ctx.waitForEvent('page');
  await page.click('#dev-audio-colab-open');
  await (await popP).close();
  ok(await page.waitForSelector('#dev-audio-c2[data-done="1"]', { timeout: 5000 }).then(() => true, () => false), 'C2: ✓ after opening Colab');
  // もう一度書き出す：確かめは出ない（このブラウザで 1 回だけ）
  await exportJob(false);
  ok(job.egatari === 'tts-job' && job.v === 1 && job.docId === DOC && job.steps.length === keys.length, `export: tts-job.json has docId and ${keys.length} steps`);
  ok(job.recipe.engine === 'irodori' && job.recipe.processing === PROCESSING && /^[0-9a-f]{64}$/.test(job.recipe.dictionary), 'export: recipe target (engine, processing, reading dictionary hash)');
  const sj = job.steps.find((x) => x.key === keys[0]), seg0 = segs[0];
  ok(sj.inputHash === await PF.inputHash(seg0) && JSON.stringify(sj.turns[0].segments.length) === JSON.stringify(seg0.turns[0].ttsParts.length), 'export: inputHash and the segments follow the narration');
  const eta = job.steps.find((x) => x.turns.some((t) => t.segments.some((s) => s.includes('イータ'))));
  ok(!!eta && !job.steps.some((x) => x.turns.some((t) => t.segments.some((q) => /[{}]/.test(q)))), 'export: the reading dictionary is applied by the editor (イータ), no markup');
  ok((await msgs()).some((m) => /^台本を書き出しました（\d+ ステップ）。次は「Colab を開く」$/.test(m)) && !(await msgs()).some((m) => m.includes('tts-job.json')), 'export: the panel says what to do next (no file name)');
  // 書き出した後に、1 つの段階の原稿を直す（その段階は印付きになる）
  const changed = keys[2];
  const nr = await page.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), changed);
  const r1 = await page.evaluate(([k, nr]) => window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, k.lastIndexOf(':')), stepKey: k.slice(k.lastIndexOf(':') + 1), rev: nr.rev, turns: nr.turns.map((t, i) => (i ? t : { ...t, text: t.text + 'もう一文足しました。' })) }), [changed, nr]);
  ok(r1._status === 200 && r1.changed, 'folder: one step’s narration is edited after the export');
  // 取り込み：別の教材の zip は拒否
  const other = await colabZip(job, { docId: PF.newDocId(), title: 'ほかの授業' });
  await importZip(other);
  ok((await msgs()).some((m) => m.startsWith('この ZIP ファイルには、この教材の音声が入っていません。この教材で書き出した台本から作った ZIP ファイルを選んでください') && m.includes('「ほかの授業」') && !m.includes('docId')) && (await opfsRead('audio/manifest.json')) === null, 'import: a ZIP file made for another lesson (docId) is refused and nothing is written');
  ok(lastChooser && lastChooser.type === 'file' && !lastChooser.multiple && !lastChooser.dir && /\.zip/.test(lastChooser.accept), 'C3: a plain <input type=file> for one ZIP file (no folder picker) ' + JSON.stringify(lastChooser));
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
  ok(sum === `${keys.length - 1} ステップに AI 音声を付けました。1 ステップは、書き出した後に台本が変わっているので使っていません`, 'import: ' + sum);
  ok(await page.waitForSelector('#dev-audio-c3[data-done="1"]', { timeout: 5000 }).then(() => true, () => false), 'C3: ✓ after the import');
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
  // 合わなかったステップ：使わず（印付きの一覧はない）、「音声を更新（1 ステップ）」が前のやり方（クラウド）でその分を書き出す
  ok(!(await page.$('.dv-marked, .dv-use-old')) && (await audioStateOf()).takes === 0, 'import: the changed step is not used and not listed as “marked”; no take for it');
  ok((await page.textContent('#dev-audio-update-left')) === '音声を更新（1 ステップ）', 'import: offers 音声を更新（1 ステップ） for the step whose script changed');
  ok((await page.textContent('#dev-audio-action')) === '残りの音声を作る（1 ステップ）', 'A: one step left: 残りの音声を作る（1 ステップ）');
  const job2 = await exportJob(false, '#dev-audio-update-left');
  ok(job2.steps.length === 1 && job2.steps[0].key === changed, 'update: continues with the cloud: exports only the changed step');
  await importZip(await colabZip(job2));
  ok((await msgs())[0] === '1 ステップに AI 音声を付けました' && JSON.parse(await opfsRead('audio/manifest.json')).segments[changed], 'update: the changed step is imported');
  ok((await page.textContent('#dev-audio-deck .dv-line')) === `${keys.length} ステップすべてに音声があります` && !(await page.$('#dev-audio-action')), 'A: all steps have audio, no action');

  // ---------------------------------------------------------------- 2. 持ち運べる 1 ファイル
  const PDIR = path.join(work, 'pmin');
  fs.rmSync(PDIR, { recursive: true, force: true });
  fs.cpSync(SRC, PDIR, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
  fs.mkdirSync(path.join(PDIR, 'audio'), { recursive: true });
  {
    const segments = {};
    // 最初のステップだけ音声あり（ほかは音声なし。書き出すのは音声の要るステップ）
    segs.slice(0, 1).forEach((x, j) => { fs.writeFileSync(path.join(PDIR, 'audio', `seg_js${j}.wav`), silentWav(0.5)); segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], sync: 'none' }; });
    fs.writeFileSync(path.join(PDIR, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
    fs.writeFileSync(path.join(PDIR, 'egatari.json'), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', creators: ['Test Author'] } }, null, 2) + '\n');
  }
  const pmin = await buildPortable(path.join(PDIR, 'deck.html'), { out: path.join(PDIR, 'out', 'deck.ega.html') });
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('colab-saved.ega.html', { create: true }); });
  ok(await page.evaluate(([html]) => window.__APP_TEST.openFile({ bytes: new TextEncoder().encode(html), name: 'deck.ega.html' }), [pmin.html]), 'portable: opened');
  await frameReady();
  await page.click('#b-audio');
  await page.waitForSelector('#dlg[open]');
  await clickDlg(page, '#dlg-ok');
  await page.waitForSelector('#dev-audio #dev-audio-cloud-body');
  await idle();
  // iPad の Safari のように、フォルダ・ファイルを選ぶ仕組み（File System Access）がない
  await page.evaluate(() => { for (const k of ['showDirectoryPicker', 'showOpenFilePicker']) { try { delete window[k]; } catch { /* 無視 */ } window[k] = undefined; } });
  const need = keys.length - 1;
  const pjob = await exportJob(false);
  const pdoc = (await page.evaluate(() => window.__APP_TEST.state().portable)).docId;
  ok(pjob.docId === pdoc && pjob.steps.length === need && !pjob.steps.some((x) => x.key === keys[0]), 'portable: the job carries the index docId; the steps that need audio are exported');
  await importZip(await colabZip(pjob));
  ok((await msgs())[0] === `${need} ステップに AI 音声を付けました`, 'C3 without a folder picker: the ZIP file is imported through a plain file input: ' + (await msgs())[0]);
  ok(lastChooser && lastChooser.type === 'file' && !lastChooser.dir, 'C3: no folder picker was needed');
  ok(await page.evaluate(() => window.__APP_TEST.state().portable.dirty), 'portable: the imported audio marks the file unsaved');
  ok((await page.textContent('#dev-audio-deck .dv-line[data-kind="unsaved"]')) === '保存するまでファイルには入っていません' && (await page.textContent('#dev-audio-action')) === '保存', 'A: single file: 保存するまでファイルには入っていません and the action is 保存');
  await page.click('#dev-audio-action');
  await page.waitForFunction(() => !window.__APP_TEST.state().portable.dirty, null, { timeout: 30000 });
  const ps = await page.evaluate(() => window.__APP_TEST.state().portable);
  ok(ps.lastTier === 'A' && ps.lastTierA && JSON.stringify([...ps.lastTierA.audio].sort()) === JSON.stringify([...keys.slice(1)].sort()) && !ps.dirty, 'portable: saved by tier A; only the audio of the imported steps changed');
  const saved = await page.evaluate(() => window.__APP_TEST.saved());
  let diffOk = true;
  try { regionDiff(pmin.html, saved, { audio: keys.slice(1) }); } catch (e) { diffOk = false; console.log('       ' + e.message.slice(0, 300)); }
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
