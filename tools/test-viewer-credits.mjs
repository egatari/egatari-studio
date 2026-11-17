// Egatari Viewer：作成と編集の表示（format spec §3.6.1 edits・§7.3、handoff #32）
//   node tools/test-viewer-credits.mjs [作業フォルダ] [--webkit] [--shots]
// test-all: platform（--platform でも走らせる：WebKit の分は CI の macOS で）
// Viewer は教材の deck-meta（なければ索引の metadata）から edits を読み、上のバーの題名の下に 1 行
// 「作成：<作成者> ／ 編集：<いちばん新しい項目> ほか n 件」を出す。押すと全部の一覧（#cred-box）。プレーヤーの版に頼らない。
// 3 つの教材で確かめる：
//  1. 古いプレーヤー（仕様の見本 minimal.ega.html、Egatari Player 1.0.0）に段 A の保存で edits を足したもの。プレーヤーは替わらない
//  2. 新しいプレーヤーで組んだもの（edits が索引と deck-meta に入る）。名前のない項目は「元の教材から編集されています」
//  3. edits のないもの：行は出ない
// 英語の画面・ダイアログの開け閉め（Esc で閉じて行に戻る）・教材を閉じると消える・幅 390px では 2 行まで折り返し「編集：」が見える（横にはみ出さない）も見る
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { webkit } from 'playwright-core';
import { launch } from '../kit/browser.mjs';
import { buildPortable } from '../kit/build.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { readPortable, manifestFromAudio } from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { updateConfig, merge as configMerge } from '../kit/core/config-file.mjs';
import { scanLesson } from '../play/scan.mjs';
import { buildPlay } from './build-play.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const WEBKIT = args.includes('--webkit'), SHOTS = args.includes('--shots');
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-viewer-credits-')));
fs.mkdirSync(work, { recursive: true });
console.log('work: ' + work);
let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { ms = scaled(ms); const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch { /* retry */ } await sleep(60); } try { return !!(await f()); } catch { return false; } };
const enc = new TextEncoder(), dec = new TextDecoder();

// ---------------------------------------------------------------- the three lessons
const FIX = {};
// 1. an old player + edits added by a tier A save
const OLD_SRC = path.join(ROOT, 'vendor', 'egatari-spec', 'fixtures', 'documents-1.0', 'minimal.ega.html');
const OLD_EDITS = [{ by: '△△中学校', note: '問いを 1 つ足した' }, { by: '○○高校 情報科', note: '2 章の例を地域のデータに差し替え' }];
{
  const html = fs.readFileSync(OLD_SRC, 'utf8');
  const r = await readPortable(html);
  const ws = new Map(Object.entries(r.files));
  if (r.index.audio && Object.keys(r.index.audio).length) ws.set('audio/manifest.json', enc.encode(manifestFromAudio(r.index.audio)));
  const CFG = FORMAT.CONFIG_FILE;
  const cfg = ws.has(CFG) ? dec.decode(ws.get(CFG)) : '{}\n';
  ws.set(CFG, enc.encode(updateConfig(cfg, { metadata: configMerge({ edits: OLD_EDITS }) })));
  const a = await tierA(html, ws, {});
  ok(a.ok, `old player: tier A adds edits (${a.code || ''} ${a.reason || ''})`);
  const back = await readPortable(a.html);
  ok(JSON.stringify(back.deckMeta.player) === JSON.stringify(r.deckMeta.player) && /^1\.0\./.test(back.deckMeta.player.version), 'old player: the file keeps its player ' + JSON.stringify(back.deckMeta.player));
  FIX.old = path.join(work, 'old-player' + FORMAT.FILE_EXT); fs.writeFileSync(FIX.old, a.html);
  FIX.oldMeta = back.deckMeta;
}
// 2. a new player, edits in the metadata (one without a name); 3. no edits
function prepare(dir, metadata) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata }, null, 2) + '\n');
  return path.join(dir, 'deck.html');
}
const META = { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', creators: ['Test Author', 'B 商事'] };
const NEW_EDITS = [{ by: '○○高校 情報科', note: '2 章の例を地域のデータに差し替え' }, {}, { by: '△△中学校' }];
async function portable(name, metadata) {
  const out = path.join(work, name + FORMAT.FILE_EXT);
  const b = await buildPortable(prepare(path.join(work, 'src-' + name), metadata), { out, subset: false });
  if (!fs.existsSync(out)) fs.writeFileSync(out, b.html);
  return out;
}
FIX.new = await portable('new-player', { ...META, edits: NEW_EDITS });
FIX.none = await portable('no-edits', META);

// ---------------------------------------------------------------- scanLesson (Node)
{
  const s = scanLesson(fs.readFileSync(FIX.old, 'utf8'));
  ok(s.ok && JSON.stringify(s.meta.credits.edits) === JSON.stringify(OLD_EDITS), 'scan: edits from the old-player file ' + JSON.stringify(s.ok && s.meta.credits));
  const n = scanLesson(fs.readFileSync(FIX.new, 'utf8'));
  ok(n.ok && JSON.stringify(n.meta.credits) === JSON.stringify({ creators: META.creators, edits: [{ by: '○○高校 情報科', note: '2 章の例を地域のデータに差し替え' }, { by: '', note: '' }, { by: '△△中学校', note: '' }], copyright: META.copyright, license: META.license }), 'scan: creators, edits (an entry without by kept), copyright and license ' + JSON.stringify(n.ok && n.meta.credits));
  const z = scanLesson(fs.readFileSync(FIX.none, 'utf8'));
  ok(z.ok && z.meta.credits.edits.length === 0, 'scan: no edits → an empty list');
}

// ---------------------------------------------------------------- the Viewer
const OUT = path.join(work, '_play');
await buildPlay({ out: OUT, endpoints: ['https://live.egatari.org'], devLoopback: false, tag: '' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const headers = {};
for (const line of fs.readFileSync(path.join(OUT, '_headers'), 'utf8').split('\n')) { const m = /^\s+([^:]+):\s*(.*)$/.exec(line); if (m && !/^Cache/i.test(m[1])) headers[m[1]] = m[2]; }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(OUT, ...p.split('/').filter(Boolean));
  if (!f.startsWith(OUT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/`;

let browser;
if (WEBKIT) { try { browser = await webkit.launch(); } catch (e) { console.log('skip: WebKit is not installed: ' + String(e.message).split('\n')[0]); srv.close(); process.exit(0); } }
else browser = await launch();
console.log(WEBKIT ? 'WebKit' : 'Chromium');
const errors = [];
async function page({ locale = 'ja-JP', width = 1280 } = {}) {
  const c = await browser.newContext({ locale, viewport: { width, height: 800 }, serviceWorkers: 'block' });
  await c.route((u) => !u.href.startsWith(URL0), (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL0); await p.waitForSelector('html[data-ready]');
  return { c, p };
}
// wait for the new lesson's frame (the one before it may still be there and ready for a moment)
async function open(p, file) {
  await p.evaluate(() => { const f = document.getElementById('lesson'); if (f) f.dataset.before = '1'; });
  await p.setInputFiles('#file', file);
  await until(async () => { const el = await p.$('#lesson:not([data-before])'); const f = el && await el.contentFrame(); return f && await f.evaluate(() => !!(window.DECK && DECK.ready)); }, 15000);
}
const line = (p) => p.evaluate(() => { const b = document.getElementById('lesson-credit'); return b.hidden ? null : b.textContent; });
const rows = (p) => p.evaluate(() => [...document.querySelectorAll('#cred-list dt')].map((dt) => dt.textContent + '=' + dt.nextElementSibling.textContent));
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(work, `${name}${WEBKIT ? '-webkit' : ''}.png`) }); };

{
  const { c, p } = await page();
  // 1. old player
  await open(p, FIX.old);
  const oldCr = (FIX.oldMeta.creators || []).join('、');
  const want1 = `${oldCr ? `作成：${oldCr} ／ ` : ''}編集：○○高校 情報科 ほか 1 件`;
  ok(await line(p) === want1, `old player: the line under the title says ${JSON.stringify(want1)} (${JSON.stringify(await line(p))})`);
  await shot(p, 'credits-old');
  // 2. new player
  await open(p, FIX.new);
  ok(await line(p) === '作成：Test Author、B 商事 ／ 編集：△△中学校 ほか 2 件', 'new player: the most recent edit and the number of the others ' + JSON.stringify(await line(p)));
  await p.click('#lesson-credit');
  ok(await until(() => p.evaluate(() => document.getElementById('cred-box').open)), 'pressing the line opens the list');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'b-cred-close'), 'the list: focus on 閉じる');
  const r = await rows(p);
  ok(JSON.stringify(r) === JSON.stringify(['作成者=Test Author、B 商事', '編集=○○高校 情報科（2 章の例を地域のデータに差し替え）', '編集=元の教材から編集されています', '編集=△△中学校', '著作権=© 2026 Test Author', 'ライセンス=CC-BY-4.0']), 'the list: creators, every edit oldest first, copyright, license ' + JSON.stringify(r));
  ok(await p.evaluate(() => document.getElementById('cred-lesson').textContent.length > 0), 'the list names the lesson');
  await shot(p, 'credits-list');
  await p.keyboard.press('Escape');
  ok(await until(() => p.evaluate(() => !document.getElementById('cred-box').open && document.activeElement && document.activeElement.id === 'lesson-credit')), 'Esc closes the list and focus goes back to the line');
  // English while the lesson plays
  await p.click('#b-lang');
  ok(await line(p) === 'Created by Test Author, B 商事 / Edited by △△中学校 and 2 more', 'English line ' + JSON.stringify(await line(p)));
  await p.click('#lesson-credit');
  await until(() => p.evaluate(() => document.getElementById('cred-box').open));
  const re = await rows(p);
  ok(JSON.stringify(re) === JSON.stringify(['Created by=Test Author, B 商事', 'Edited by=○○高校 情報科 (2 章の例を地域のデータに差し替え)', 'Edited=Edited from the original lesson', 'Edited by=△△中学校', 'Copyright=© 2026 Test Author', 'License=CC-BY-4.0']), 'English list ' + JSON.stringify(re));
  await p.click('#b-cred-close');
  await p.click('#b-lang');
  // 3. no edits
  await open(p, FIX.none);
  ok(await line(p) === null, 'no edits: no line under the title');
  // closing the lesson hides it
  await open(p, FIX.new);
  await p.click('#b-close');
  ok(await until(() => p.evaluate(() => document.getElementById('lesson-info').hidden && !document.getElementById('cred-box').open)), 'closing the lesson hides the line');
  await c.close();
}
{
  // a phone width: up to two lines, the 編集： part visible, inside the bar
  const { c, p } = await page({ width: 390 });
  await open(p, FIX.new);
  const m = await p.evaluate(() => {
    const el = document.getElementById('lesson-credit'), b = el.getBoundingClientRect(), bar = document.getElementById('bar').getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    // where 編集： sits: a Range over the text, its last rectangle must lie inside the button's box (not clipped by the two-line limit)
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && !t.data.includes('編集：')) { /* next */ }
    const i = t.data.indexOf('編集：'), r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 3);
    const e = [...r.getClientRects()].pop();
    return { lines: Math.round(b.height / lh), editBottom: e.bottom, boxBottom: b.bottom, right: b.right, barRight: bar.right, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  });
  ok(m.lines <= 2 && m.editBottom <= m.boxBottom + 0.5 && m.right <= m.barRight + 0.5 && m.sw <= m.cw, '390px: at most two lines, 編集： is shown, inside the bar, no sideways scroll ' + JSON.stringify(m));
  await shot(p, 'credits-390');
  await c.close();
}
ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close(); srv.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
