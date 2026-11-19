// 編集の記録 metadata.edits（format spec §3.6.1・§7.3）の試験
//   node tools/test-metadata-edits.mjs [作業用のフォルダ]
// 1. 書く形（normalizeEdits）・足し方（app/rights.js の addEdit）・変更を示すよう求めるライセンス（requiresChangeNote）
// 2. 組み立て：設定のファイルの metadata.edits を索引と deck-meta に写す（1 ファイルも作業フォルダの組み立ても）。形の合わない項目は捨てて知らせる。
//    検査器（validateIndex・validateDeckMeta）は形の合わない edits を断る
// 3. 段 A の保存：設定のファイルの edits が変わったら索引と deck-meta を同じ値に（組み直さない）。edits を消した設定のファイルは断る
// 4. プレーヤーのファイルの情報（? の窓）：作成者の後に「編集：名前（内容）」、名前のない項目は「元の教材から編集されています」（日本語と英語）
// 5. 編集アプリ：ほかの人の教材を初めて保存するとき「この教材の作成者ですか」と聞き、編集なら edits に足す（段 A のまま）。
//    名前が空でもライセンスが求めれば名前なしの項目。作成者と答えれば足さない。答えはこの端末で覚え、次からは聞かない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { normalizeEdits } from '../kit/core/build-core.mjs';
import { readPortable, scanDocument, validateIndex, validateDeckMeta, manifestFromAudio } from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { updateConfig, merge as configMerge } from '../kit/core/config-file.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { addEdit, requiresChangeNote } from '../app/rights.js';
import { clickDlg } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-edits-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const enc = new TextEncoder(), dec = new TextDecoder();

// ---------------------------------------------------------------- 1. 書く形・足し方・ライセンス
{
  const n = normalizeEdits([{ by: ' ○○高校 情報科 ', note: '2 章を差し替え' }, {}, 'x', { by: 3 }, { by: 'a', when: '2026' }, null, { note: '  ' }]);
  ok(same(n.edits, [{ by: '○○高校 情報科', note: '2 章を差し替え' }, {}, {}]) && n.dropped === 4, 'normalizeEdits: trims, keeps {} and drops malformed entries ' + JSON.stringify(n));
  ok(same(normalizeEdits({ by: 'a' }), { edits: null, dropped: 1 }) && same(normalizeEdits(undefined), { edits: null, dropped: 0 }), 'normalizeEdits: not an array → nothing');
  ok(['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-ND-4.0', 'https://creativecommons.org/licenses/by-nc/4.0/deed.ja'].every(requiresChangeNote), 'requiresChangeNote: the CC 4.0 licenses');
  ok(!['CC0-1.0', 'CC-BY-3.0', 'MIT', '', null, 'All rights reserved'].some(requiresChangeNote), 'requiresChangeNote: not CC0, CC 3.0, MIT or none');
  const base = [{ by: 'A', note: 'old' }];
  ok(same(addEdit(base, { by: 'B', note: 'n' }), [{ by: 'A', note: 'old' }, { by: 'B', note: 'n' }]) && same(base, [{ by: 'A', note: 'old' }]), 'addEdit: appends, the original list is not changed');
  ok(same(addEdit(base, { by: ' A ', note: 'new' }), [{ by: 'A', note: 'new' }]), 'addEdit: the same name updates its note instead of adding');
  ok(addEdit(base, { by: 'A', note: '' }) === null, 'addEdit: the same name without a note changes nothing');
  ok(same(addEdit(base, { by: '', note: '', required: true }), [{ by: 'A', note: 'old' }, {}]), 'addEdit: no name, the license requires it → an entry without by');
  ok(addEdit(base, { by: '', note: '', required: false }) === null, 'addEdit: no name, not required → nothing');
  ok(addEdit([{}], { by: '', required: true }) === null && same(addEdit([{ note: 'x' }], { by: '', note: 'y', required: true }), [{ note: 'x' }, { note: 'y' }]), 'addEdit: entries without a name are never rewritten');
}

// ---------------------------------------------------------------- 2. 組み立て
const EDITS_IN = [{ by: '○○高校 情報科', note: '2 章の例を地域のデータに差し替え' }, {}, 'bad', { by: 3 }, { by: 'x', extra: 1 }];
const EDITS_OUT = [{ by: '○○高校 情報科', note: '2 章の例を地域のデータに差し替え' }, {}];
const META = { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', creators: ['Test Author'] };
function prepare(dir, metadata, lang = 'ja') {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  if (lang !== 'ja') fs.writeFileSync(path.join(dir, 'deck.html'), fs.readFileSync(path.join(dir, 'deck.html'), 'utf8').replace(/<html([^>]*)\slang="[^"]*"/, `<html$1 lang="${lang}"`));
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata }, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
const deckMetaOf = (html) => JSON.parse(scanDocument(html).byId.get('deck-meta').text);
const p1 = await buildPortable(prepare(path.join(work, 'src-ja'), { ...META, edits: EDITS_IN }), { out: path.join(work, 'ja' + FORMAT.FILE_EXT), subset: false });
fs.writeFileSync(path.join(work, 'ja' + FORMAT.FILE_EXT), p1.html);
const r1 = await readPortable(p1.html);
ok(same(r1.index.metadata.edits, EDITS_OUT), 'Egatari file: metadata.edits in the index, malformed entries dropped ' + JSON.stringify(r1.index.metadata.edits));
ok(same(r1.deckMeta.edits, EDITS_OUT), 'Egatari file: deck-meta.edits is copied from the metadata');
ok(p1.warnings.some((w) => /metadata\.edits: 3 malformed entries were not copied/.test(w)), 'Egatari file: a warning names the dropped entries');
const b1 = build(prepare(path.join(work, 'src-folder'), { ...META, edits: EDITS_IN }));
ok(same(deckMetaOf(b1.html).edits, EDITS_OUT), 'working folder build: deck-meta.edits is copied, malformed entries dropped');
ok((b1.stats.warn || []).some((w) => /metadata\.edits: 3 malformed/.test(w)), 'working folder build: a warning names the dropped entries');
const b0 = build(prepare(path.join(work, 'src-none'), META));
ok(!('edits' in deckMetaOf(b0.html)), 'no edits in the configuration file → none in deck-meta');
{
  const ix = JSON.parse(JSON.stringify(r1.index));
  ix.metadata.edits = [{ by: 'a', at: 'x' }];
  ok(validateIndex(ix).some((e) => /metadata\.edits\[0\]: unknown member "at"/.test(e)), 'validateIndex: an edits entry with another member is refused');
  ix.metadata.edits = { by: 'a' };
  ok(validateIndex(ix).some((e) => /metadata\.edits: not an array/.test(e)), 'validateIndex: edits that is not an array is refused');
  ok(validateDeckMeta({ ...r1.deckMeta, edits: [{ by: 1 }] }).some((e) => /deck-meta\.edits\[0\]\.by: not a string/.test(e)), 'validateDeckMeta: a by that is not text is refused');
  ok(validateDeckMeta(r1.deckMeta).length === 0, 'validateDeckMeta: the built deck-meta is valid');
}

// ---------------------------------------------------------------- 3. 段 A の保存
const wsOf = (r) => {
  const m = new Map(Object.entries(r.files));
  if (r.index.audio && Object.keys(r.index.audio).length) m.set('audio/manifest.json', enc.encode(manifestFromAudio(r.index.audio)));
  return m;
};
{
  const ws = wsOf(r1);
  const CFG = FORMAT.CONFIG_FILE;
  const NEXT = [...EDITS_OUT, { by: '△△中学校', note: '問いを 1 つ足した' }];
  ws.set(CFG, enc.encode(updateConfig(dec.decode(ws.get(CFG)), { metadata: configMerge({ edits: NEXT }) })));
  const narr = dec.decode(ws.get('narration.md'));
  ws.set('narration.md', enc.encode(narr.replace(/\n\[0\][^\n]*/, (m) => m + '（直した）')));
  const a = await tierA(p1.html, ws, {});
  ok(a.ok, `tier A: a changed metadata.edits saves without rebuilding (${a.code || ''} ${a.reason || ''})`);
  if (a.ok) {
    const back = await readPortable(a.html);
    ok(same(back.index.metadata.edits, NEXT) && same(back.deckMeta.edits, NEXT) && back.sourceMatches, 'tier A: index metadata.edits and deck-meta.edits have the new list');
    ok(same(Object.keys(back.index.metadata), Object.keys(r1.index.metadata)), 'tier A: the other metadata members keep their order');
  }
  const ws2 = wsOf(r1);
  ws2.set(CFG, enc.encode(updateConfig(dec.decode(ws2.get(CFG)), { metadata: configMerge({ edits: undefined }) })));
  const a2 = await tierA(p1.html, ws2, {});
  ok(!a2.ok && a2.code === 'config-changed', 'tier A: a configuration file without the existing edits is refused (they are not removed silently)');
}

// ---------------------------------------------------------------- 4・5. ブラウザ
const p2 = await buildPortable(prepare(path.join(work, 'src-en'), { ...META, edits: EDITS_OUT }, 'en'), { out: path.join(work, 'en' + FORMAT.FILE_EXT), subset: false });
fs.writeFileSync(path.join(work, 'en' + FORMAT.FILE_EXT), p2.html);
// 編集アプリで開くもの（編集の記録のない、ほかの人の教材）
const p3 = await buildPortable(prepare(path.join(work, 'src-app'), META), { out: path.join(work, 'app' + FORMAT.FILE_EXT) });
const r3 = await readPortable(p3.html);
const seg = parseNarration(dec.decode(r3.files['narration.md']))[0];
const NKEY = `${seg.slideKey}:${seg.stepKey}`;

execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'inherit' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `http://127.0.0.1:${srv.address().port}/`;

const browser = await launch();
const errs = [];
try {
  // 4. プレーヤーのファイルの情報
  for (const [file, want] of [
    ['ja', [['作成者', 'Test Author'], ['編集', '○○高校 情報科（2 章の例を地域のデータに差し替え）'], ['編集', '元のファイルから編集されています']]],
    ['en', [['Created by', 'Test Author'], ['Edited by', '○○高校 情報科 (2 章の例を地域のデータに差し替え)'], ['Edited', 'Edited from the original file']]],
  ]) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errs.push(`${file} player: ${e.message}`));
    await page.goto(pathToFileURL(path.join(work, file + FORMAT.FILE_EXT)).href);
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: scaled(20000) });
    const rows = await page.evaluate(() => { DECK.tools.help(true); const x = [...document.querySelectorAll('#dt-help .dt-rights-r')].map((e) => [e.querySelector('dt').textContent, e.querySelector('dd').textContent]); DECK.tools.help(false); return x; });
    ok(same(rows.slice(1, 4), want), `player File info (${file}): the edits follow the creators ` + JSON.stringify(rows));
    await page.close();
  }

  // 5. 編集アプリ
  const b64 = Buffer.from(p3.html).toString('base64');
  const session = async (label, answer, { reopen = null } = {}) => {
    const ctx = reopen || await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ja-JP' });
    const page = ctx.pages()[0] || await ctx.newPage();
    if (!reopen) {
      page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
      await page.goto(`${HOST}?lang=ja`);
      await page.waitForFunction(() => !!window.__APP_TEST);
    }
    await page.evaluate(async (n) => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle(n, { create: true }); }, `${label}.ega.html`);
    const opened = page.evaluate((data) => { const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'lesson.ega.html' }); }, b64);
    if (reopen && await page.waitForSelector('#dlg[open] #dlg-discard', { timeout: scaled(1500) }).catch(() => null)) await clickDlg(page, '#dlg-discard');
    ok(await opened === true, `${label}: opens`);
    await page.waitForFunction(() => !window.__APP_TEST.state().building, null, { timeout: scaled(30000) });
    // 台本の 1 つのステップを直す（最初の編集の前の権利の確認には OK）
    const g = await page.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), NKEY);
    const post = page.evaluate(([k, rev, turns]) => { const i = k.lastIndexOf(':'); return window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, i), stepKey: k.slice(i + 1), rev, turns }); },
      [NKEY, g.rev, g.turns.map((t) => ({ role: t.role, text: t.text + '（直した）' }))]);
    if (await Promise.race([post.then(() => false), page.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(8000) }).then(() => true, () => false)])) await clickDlg(page, '#dlg-ok');
    const pr = await post;
    ok(pr && pr._status === 200, `${label}: the script is edited`);
    const saving = page.evaluate(() => window.__APP_TEST.save('save'));
    const asked = await Promise.race([saving.then(() => false), page.waitForSelector('#dlg[open] #edit-role-other', { timeout: scaled(15000) }).then(() => true, () => false)]);
    if (answer) {
      ok(asked, `${label}: before the first save, the editor asks whether you are a creator`);
      if (asked) {
        ok((await page.textContent('#dlg-title')) === 'このファイルの作成者ですか' && (await page.textContent('#edit-role-creators')) === '作成者：Test Author', `${label}: the question names the creators`);
        ok(await page.isDisabled('#dlg-save'), `${label}: Save is disabled until one answer is chosen`);
        await page.check('#edit-role-' + answer.role);
        if (answer.role === 'other') {
          ok(await page.isVisible('#edit-by') && await page.isVisible('#edit-required'), `${label}: name and note fields, and the license note (CC BY 4.0)`);
          if (answer.by) await page.fill('#edit-by', answer.by);
          if (answer.note) await page.fill('#edit-note', answer.note);
        } else ok(!(await page.isVisible('#edit-by')), `${label}: no name field for a creator`);
        if (label === 'other-named') await page.screenshot({ path: path.join(work, 'edit-role.png') });
        await clickDlg(page, '#dlg-save');
      }
    } else ok(!asked, `${label}: not asked again`);
    await saving;
    await page.waitForFunction(() => window.__APP_TEST.state().portable && !window.__APP_TEST.state().portable.dirty, null, { timeout: scaled(60000) });
    const st = await page.evaluate(() => window.__APP_TEST.state().portable);
    const saved = await readPortable(await page.evaluate(async () => new TextDecoder().decode(new Uint8Array(await (await window.__APP_TEST.saveHandle.getFile()).arrayBuffer()))));
    return { ctx, page, st, saved };
  };

  let s = await session('other-named', { role: 'other', by: '○○高校 情報科', note: '例を差し替え' });
  ok(s.st.lastTier === 'A', 'other, with a name: saved without rebuilding (tier A)');
  ok(same(s.saved.index.metadata.edits, [{ by: '○○高校 情報科', note: '例を差し替え' }]) && same(s.saved.deckMeta.edits, s.saved.index.metadata.edits), 'other, with a name: the entry is in metadata.edits and deck-meta.edits');
  ok(['license', 'copyright', 'creators'].every((k) => same(s.saved.index.metadata[k], META[k])), 'other: creators, copyright and license are kept');
  ok(await s.page.evaluate((id) => localStorage.getItem('egatari-edit-role:' + id), r3.index.docId) === 'other', 'other: the answer is remembered on this device for the docId');
  // 同じ端末でもう一度開いて直す：聞かない（記録は 1 件のまま）
  s = await session('other-again', null, { reopen: s.ctx });
  ok(s.saved.index.metadata.edits === undefined, 'remembered: the original file opened again is saved without asking and without an entry');
  await s.ctx.close();

  s = await session('other-noname', { role: 'other' });
  ok(same(s.saved.index.metadata.edits, [{}]) && same(s.saved.deckMeta.edits, [{}]), 'other, no name, CC BY 4.0: an entry without by');
  await s.ctx.close();

  s = await session('creator', { role: 'creator' });
  ok(s.saved.index.metadata.edits === undefined && !('edits' in s.saved.deckMeta), 'creator: no entry is added');
  await s.ctx.close();

  // 英語の画面
  const ce = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'en-US' });
  const pe = await ce.newPage();
  pe.on('pageerror', (e) => errs.push(`en: ${e.message}`));
  await pe.goto(`${HOST}?lang=en`);
  await pe.waitForFunction(() => !!window.__APP_TEST);
  await pe.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('en.ega.html', { create: true }); });
  ok(await pe.evaluate((data) => { const bin = atob(data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return window.__APP_TEST.openFile({ bytes: u, name: 'lesson.ega.html' }); }, b64), 'en: opens');
  await pe.waitForFunction(() => !window.__APP_TEST.state().building, null, { timeout: scaled(30000) });
  const g = await pe.evaluate((k) => window.__APP_TEST.api('GET', '/__dev/narration?key=' + encodeURIComponent(k)), NKEY);
  const post = pe.evaluate(([k, rev, turns]) => { const i = k.lastIndexOf(':'); return window.__APP_TEST.api('POST', '/__dev/narration', { slideKey: k.slice(0, i), stepKey: k.slice(i + 1), rev, turns }); }, [NKEY, g.rev, g.turns.map((t) => ({ role: t.role, text: t.text + ' (edited)' }))]);
  if (await Promise.race([post.then(() => false), pe.waitForSelector('#dlg[open] #rights-list', { timeout: scaled(8000) }).then(() => true, () => false)])) await clickDlg(pe, '#dlg-ok');
  await post;
  const sv = pe.evaluate(() => window.__APP_TEST.save('save'));
  await pe.waitForSelector('#dlg[open] #edit-role-other', { timeout: scaled(15000) });
  await pe.check('#edit-role-other');
  ok((await pe.textContent('#dlg-title')) === 'Are you a creator of this file?' && (await pe.textContent('#edit-required')).startsWith('The license of this file (CC-BY-4.0) asks you to indicate changes.'), 'en: the question and the license note');
  await clickDlg(pe, '#dlg-cancel');
  await sv;
  ok((await pe.evaluate(() => window.__APP_TEST.state().portable.dirty)) && (await pe.evaluate(() => window.__APP_TEST.saved())) === null, 'en: Cancel → nothing saved, still unsaved');
  await ce.close();
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e.stack || e));
} finally {
  await browser.close();
  srv.close();
}
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
