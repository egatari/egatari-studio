// 前の版のファイル・作業フォルダ（app/earlier-draft.js。format spec §7.1「Drafts before 1.0」、docs/terms.json の earlier-draft-file）
//   node tools/test-app-earlier.mjs [作業用のフォルダ]
// 1. 決まり（Node）：前の版かどうかは readPortable の preDraft（索引に player がない）だけで決める。player のない索引は、作ったのがこの Studio の同じ版でも前の版・
//    この Studio が書き出した 1.0 のファイル（player がある）は前の版にしない・
//    開く Studio の版（versions.json にあればその版、なければ 1.0 より前の最も新しい版、読めなければ凍結した写しの範囲か v0.4.8）・作業フォルダ（egatari.json があり、どのスライドにも id がない。手で足した id のないスライドだけでは前の版にしない）
// 2. 編集アプリ（tools/build-app.mjs で組んで 127.0.0.1 で配る。versions.json のあるサイト /site/ とないところ /nosite/）：
//    仕様の試験用のファイル（vendor/egatari-spec/fixtures/documents。player のない草案のファイル）を開くと知らせと 2 つのボタン（正しい URL）が出て、
//    ファイルそのものがプレビューで再生され、編集・保存は断る。player を足した写し（1.0 のファイルのつもり）と、この Studio が書き出したものは知らせなし。
//    player がなく generator がこの Studio の版のもの（0.6.0 より前のリリースが同じ版の番号で書いたもの）は知らせあり。
//    英語の画面。作業フォルダ：egatari.json と id のないスライド → 知らせ（npm run ids。編集は断らない）→ id を付けて組み直すと知らせが消える。id のあるフォルダに id のないスライドを手で足しても知らせなし。egatari.json のないフォルダは知らせなし
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { scanDocument, replaceIndexText, readPortable, GENERATOR } from '../kit/core/portable.mjs';
import { analyzeSlideIds } from '../kit/core/build-core.mjs';
import { earlierFile, earlierFolder, draftStudioVersion, draftStudioUrl, guideUrl, FIRST_1_0, LAST_DRAFT_STUDIO, STUDIO_SITE } from '../app/earlier-draft.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-earlier-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 1. 決まり
const SPEC_DOCS = path.join(ROOT, ...FORMAT.VENDOR_DIR.split('/'), 'fixtures', 'documents');
const draftHtml = fs.readFileSync(path.join(SPEC_DOCS, 'minimal-portable-core.ega.html'), 'utf8');
const indexOf = (html) => JSON.parse(scanDocument(html).byId.get(FORMAT.INDEX_ID).text);
const draftIx = indexOf(draftHtml);
const me = { name: GENERATOR, version: VERSION };
ok(!Object.prototype.hasOwnProperty.call(draftIx, 'player') && draftIx.generator.version === '0.3.1', `fixture: minimal-portable-core has no player (made with ${draftIx.generator.version})`);
// この Studio の書き出し（1.0 の形）：examples/minimal を写したフォルダを詰める（書き出しは id をフォルダに書き戻すので写しで）
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-earlier-pack-'));
for (const f of ['deck.html', 'narration.md']) fs.copyFileSync(path.join(ROOT, 'examples', 'minimal', f), path.join(packDir, f));
const packedPath = path.join(packDir, 'lesson' + FORMAT.FILE_EXT);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'portable.mjs'), 'pack', packDir, '-o', packedPath], { stdio: 'pipe' });
const packedHtml = fs.readFileSync(packedPath, 'utf8');
const readDraft = await readPortable(draftHtml);
const readPacked = await readPortable(packedHtml);
ok(readDraft.preDraft === true && JSON.stringify(earlierFile(readDraft)) === JSON.stringify({ made: '0.3.1' }), 'rule: a file without player (readPortable preDraft) is from an earlier version');
ok(readPacked.preDraft === false && Object.prototype.hasOwnProperty.call(readPacked.index, 'player') && earlierFile(readPacked) === null, `rule: a 1.0 file written by this Studio (player ${readPacked.index.player && readPacked.index.player.version}) is not flagged`);
ok(earlierFile({ preDraft: false, index: { ...draftIx, player: { name: 'egatari-player', version: '1.0.0' } } }) === null, 'rule: preDraft false (an index with player) is a 1.0 file');
ok(JSON.stringify(earlierFile({ preDraft: true, index: { ...draftIx, generator: { name: GENERATOR, version: VERSION } } })) === JSON.stringify({ made: VERSION }), `rule: no player is flagged even when made by this Studio's version number (${VERSION}): one source of truth, no exception`);
ok(earlierFile({ preDraft: true, index: { ...draftIx, generator: { name: 'other-tool', version: VERSION } } }) !== null, 'rule: no player from another producer is flagged');
ok(earlierFile({ preDraft: true, index: { ...draftIx, generator: undefined } }).made === null, 'rule: no generator → made is null');
ok(earlierFile({ index: draftIx }) === null && earlierFile(null) === null, 'rule: only preDraft decides (an index alone, without the reader\'s verdict, is not flagged)');
const site = { versions: ['0.6.0', '0.4.8', '0.4.7', '0.4.1'] };
ok(draftStudioVersion('0.4.7', site) === '0.4.7', 'studio: the version that made it, when versions.json lists it');
ok(draftStudioVersion('0.3.1', site) === '0.4.8' && draftStudioVersion(null, site) === '0.4.8', 'studio: otherwise the newest listed version before ' + FIRST_1_0);
ok(draftStudioVersion('0.6.0', site) === '0.4.8', 'studio: never a 1.0 Studio');
ok(draftStudioVersion('0.4.5', null) === '0.4.5' && draftStudioVersion('0.3.1', null) === LAST_DRAFT_STUDIO && draftStudioVersion('0.4.8-rc.1', null) === LAST_DRAFT_STUDIO, 'studio: without versions.json, the made version if it has a frozen copy, else ' + LAST_DRAFT_STUDIO);
ok(draftStudioUrl('0.4.8') === 'https://studio.egatari.org/v0.4.8/' && draftStudioUrl('0.4.7', 'http://x/site/') === 'http://x/site/v0.4.7/', 'studio: versioned URL under the site root');
ok(guideUrl('ja') === 'https://github.com/egatari/egatari-studio/blob/main/docs/migrating-0.x.ja.md' && guideUrl('en') === 'https://github.com/egatari/egatari-studio/blob/main/docs/migrating-0.x.md', 'guide: GitHub main URLs');
for (const f of ['migrating-0.x.md', 'migrating-0.x.ja.md']) ok(fs.existsSync(path.join(ROOT, 'docs', f)), `guide: docs/${f} exists`);
const handAdded = '<!doctype html><html lang="ja"><body><div id="stage"><section class="slide"><h2>一</h2></section><section class="slide" id="s-two"><h2>二</h2></section></div></body></html>';
const noIds = handAdded.replace(' id="s-two"', '');
const withIds = handAdded.replace('<section class="slide"><h2>一</h2>', '<section class="slide" id="s-one"><h2>一</h2>');
ok(JSON.stringify(earlierFolder(analyzeSlideIds(noIds), true)) === '{"noId":2}', 'folder: egatari.json and no slide with an id → earlier version');
ok(earlierFolder(analyzeSlideIds(handAdded), true) === null, 'folder: egatari.json, slides with ids and one added by hand without an id → not flagged (a missing id alone does not decide)');
ok(earlierFolder(analyzeSlideIds(noIds), false) === null && earlierFolder(analyzeSlideIds(withIds), true) === null, 'folder: no egatari.json, or every slide has an id → not flagged');

// ---------------------------------------------------------------- 2. 編集アプリ
// 試験のファイル：前の版（そのまま）・作った版が versions.json にある前の版（0.4.7）・1.0（player を足した写し）・
// player がなく generator がこの Studio の版のもの（前の版）・この Studio が書き出した 1.0 のファイル
const editIx = (fn) => replaceIndexText(draftHtml, (() => { const x = indexOf(draftHtml); fn(x); return JSON.stringify(x); })());
const FILES = {
  draft: draftHtml,
  v047: await editIx((x) => { x.generator.version = '0.4.7'; }),
  v10: await editIx((x) => { x.player = { name: 'egatari-player', version: '1.0.0' }; }),
  mine: await editIx((x) => { x.generator = { name: GENERATOR, version: VERSION }; }),
  packed: packedHtml,
};
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST], { stdio: 'inherit' });
const VERSIONS = JSON.stringify({ root: '0.6.0', versions: ['0.6.0', '0.4.8', '0.4.7', '0.4.1'] });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
// /site/：versions.json のあるサイトの根（studio.egatari.org の形）。/nosite/：versions.json のないところ（開発のサーバー・ほかの置き場所の形）
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const m = /^\/(site|nosite)(\/.*)$/.exec(p);
  if (!m) { res.writeHead(404); return res.end(); }
  p = m[2];
  if (p === '/versions.json') { if (m[1] === 'site') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(VERSIONS); } res.writeHead(404); return res.end(); }
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `http://127.0.0.1:${srv.address().port}/`;

const browser = await launch();
const errs = [];
async function newPage(where, lang = 'ja') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'en' ? 'en-US' : 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${where} pageerror: ${e.message}`));
  await page.goto(`${HOST}${where}/?lang=${lang}`);
  await page.waitForFunction(() => !!window.__APP_TEST);
  return page;
}
const openFile = (page, key) => page.evaluate(([b64, name]) => {
  const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return window.__APP_TEST.openFile({ bytes: u, name });
}, [Buffer.from(FILES[key]).toString('base64'), key + FORMAT.FILE_EXT]);
const state = (page) => page.evaluate(() => window.__APP_TEST.state());
const notice = (page) => page.evaluate(() => {
  const n = document.getElementById('notice-earlier');
  if (!n) return null;
  const a = (id) => { const e = document.getElementById(id); return e ? { href: e.getAttribute('href'), target: e.getAttribute('target'), rel: e.getAttribute('rel'), text: e.textContent } : null; };
  return { kind: n.dataset.kind, visible: !document.getElementById('notice').hidden, lead: document.getElementById('earlier-lead').textContent, studio: a('b-earlier-studio'), guide: a('b-earlier-guide'),
    hint: document.getElementById('earlier-hint').textContent, cli: document.getElementById('earlier-cli').textContent, readonly: !!document.getElementById('notice-readonly') };
});
// プレビューの枠で、ファイルのプレーヤーが組み上がったか（スライドの数）
async function previewSlides(page, timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    const f = page.frames().find((x) => x.parentFrame() === page.mainFrame() && x.name() !== 'sl-thumbs');
    try { const n = f && await f.evaluate(() => (window.DECK && DECK.ready && DECK.slides ? DECK.slides.length : 0)); if (n) return n; } catch { /* 読み込み中 */ }
    if (Date.now() - t0 > timeout) return 0;
    await page.waitForTimeout(100);
  }
}
async function toastAfter(page, fn) {
  await page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.className = ''; });
  await fn();
  await page.waitForSelector('#toast.show', { timeout: 5000 }).catch(() => {});
  return page.textContent('#toast');
}

try {
  // 2a. サイト（versions.json あり）・日本語
  const page = await newPage('site');
  ok(await openFile(page, 'draft') === true, 'file: a pre-1.0 file opens (not refused)');
  let n = await notice(page);
  ok(n && n.kind === 'file' && n.visible && !n.readonly, 'file: the earlier-version notice is shown (instead of the generic read-only line)');
  ok(n && n.lead === '前の版のファイルです（Egatari Studio v0.3.1 で作成）。 このまま再生できますが、この版の Studio では編集も保存もできません。前の版の Studio で開けば、これまでどおり編集できます。この版で編集するには、移し替えの手引きに沿って移してください。', 'file: notice names the situation and what to do ' + JSON.stringify(n && n.lead));
  ok(n && n.studio.text === '前の版の Studio で開く' && n.studio.href === HOST + 'site/v0.4.8/' && n.studio.target === '_blank' && /noopener/.test(n.studio.rel), 'file: 「前の版の Studio で開く」 → newest pre-1.0 version in versions.json (0.3.1 is not listed) ' + JSON.stringify(n && n.studio));
  ok(n && n.guide.text === '移し替えの手引きを開く' && n.guide.href === guideUrl('ja'), 'file: 「移し替えの手引きを開く」 → docs/migrating-0.x.ja.md on GitHub');
  ok(n && n.hint === '前の版の Studio（v0.4.8）は新しいタブで開きます。そこで、このファイルをもう一度開いてください。' && n.cli.includes('v0.4.8 のタグで npm run portable -- unpack <ファイル> <フォルダ>'), 'file: hint (new tab) and the CLI line (unpack at the earlier tag)');
  ok(await previewSlides(page) > 0, 'file: the file plays in the preview with its own player (no rebuild)');
  let st = await state(page);
  ok(st.earlier && st.earlier.version === '0.4.8' && st.portable && st.portable.readOnly && st.builds === 0, 'file: read-only, nothing rebuilt ' + JSON.stringify({ earlier: st.earlier, builds: st.builds }));
  ok((await toastAfter(page, () => page.click('#b-edit'))).startsWith('前の版のファイルなので、この版では編集できません'), 'file: editing is refused with the reason');
  ok((await toastAfter(page, () => page.evaluate(() => window.__APP_TEST.save('save')))).startsWith('前の版のファイルなので、この版では保存できません') && await page.evaluate(() => window.__APP_TEST.saved()) === null, 'file: saving is refused');

  ok(await openFile(page, 'v047') === true && (n = await notice(page)) && n.studio.href === HOST + 'site/v0.4.7/' && n.lead.includes('v0.4.7 で作成'), 'file: made with 0.4.7 (listed) → v0.4.7/ ' + JSON.stringify(n && n.studio));

  ok(await openFile(page, 'v10') === true, 'file: a 1.0 file (player added) opens');
  st = await state(page);
  ok(!(await notice(page)) && st.earlier === null, 'file: a 1.0 file has no earlier-version notice');
  ok(await openFile(page, 'mine') === true && (n = await notice(page)) && n.kind === 'file' && n.lead.includes(`v${VERSION} で作成`), `file: no player, generator this Studio's version (${VERSION}) → the notice (preDraft decides) ` + JSON.stringify(n && n.lead));
  ok(await openFile(page, 'packed') === true && !(await notice(page)) && (await state(page)).earlier === null, 'file: a 1.0 file written by this Studio → no notice');
  st = await state(page);
  ok(st.portable && !st.portable.readOnly, 'file: a 1.0 file written by this Studio is not read-only');

  // 作業フォルダ（OPFS）：egatari.json と id のないスライド
  const deck = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
  const narr = fs.readFileSync(path.join(ROOT, 'examples/minimal/narration.md'), 'utf8');
  const nslides = analyzeSlideIds(deck).slides.filter((s) => s.id === null).length;
  const writeFolder = (name, files) => page.evaluate(async ([name, files]) => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(name, { recursive: true }).catch(() => {});
    const d = await root.getDirectoryHandle(name, { create: true });
    for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
    window.__dir = d;
  }, [name, files]);
  await writeFolder('old', { 'deck.html': deck, 'narration.md': narr, [FORMAT.CONFIG_FILE]: JSON.stringify({ docId: '3f2c9a8e-1b2d-4c5e-9f00-112233445566' }, null, 2) + '\n' });
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__dir)) === true, 'folder: opens');
  n = await notice(page);
  ok(n && n.kind === 'folder' && n.lead.startsWith(`前の版の作業フォルダです（id のないスライドが ${nslides} 枚あります）。`) && n.studio.href === HOST + 'site/v0.4.8/' && n.guide.href === guideUrl('ja'), 'folder: notice with both actions ' + JSON.stringify(n));
  ok(n && n.cli.includes('npm run ids -- <このフォルダ>') && n.hint.includes('このフォルダをもう一度開いて'), 'folder: CLI line is npm run ids (step 2 of the guide)');
  ok(await page.evaluate(() => window.__APP_TEST.ui().edit === undefined || true) && !(await toastAfter(page, () => page.click('#b-edit'))).includes('前の版'), 'folder: editing is not refused (notice only)');
  await page.keyboard.press('Escape');
  // 移し替えの手順 2（npm run ids）の後：組み直すと知らせが消える
  const ids = analyzeSlideIds(deck).slides;
  let moved = deck, k = 0;
  moved = moved.replace(/<section class="slide([^"]*)"(?![^>]*\bid=)/g, (m0, c) => `<section class="slide${c}" id="s-mig${k++}"`);
  ok(k === ids.filter((s) => s.id === null).length, 'folder: test gives every slide an id');
  await page.evaluate(async (text) => { const w = await (await window.__dir.getFileHandle('deck.html')).createWritable(); await w.write(text); await w.close(); }, moved);
  await page.evaluate(() => window.__APP_TEST.rebuild());
  ok(!(await notice(page)) && (await state(page)).earlier === null, 'folder: after the ids are added, the notice goes away');
  // 1.0 の作業フォルダ（どのスライドにも id があり、egatari.json がある）に、id のないスライドを手で 1 枚足した：知らせなし・編集できる
  const added = moved.replace('</div>\n</body>', '<section class="slide">\n  <h2>手で足したスライド</h2>\n</section>\n</div>\n</body>');
  ok(added !== moved && analyzeSlideIds(added).slides.filter((s) => s.id === null).length === 1, 'folder: test adds one slide without an id by hand');
  await writeFolder('current', { 'deck.html': added, 'narration.md': narr, [FORMAT.CONFIG_FILE]: JSON.stringify({ docId: '3f2c9a8e-1b2d-4c5e-9f00-112233445566' }, null, 2) + '\n' });
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__dir)) === true && !(await notice(page)) && (await state(page)).earlier === null, 'folder: egatari.json and a hand-added slide without an id → no earlier-version notice');
  await writeFolder('plain', { 'deck.html': deck, 'narration.md': narr });
  ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__dir)) === true && !(await notice(page)), 'folder: without egatari.json → no notice');
  await page.context().close();

  // 2b. versions.json のないところ・英語
  const pe = await newPage('nosite', 'en');
  ok(await openFile(pe, 'draft') === true && (n = await notice(pe)) && n.studio.href === STUDIO_SITE + 'v' + LAST_DRAFT_STUDIO + '/' && n.studio.text === 'Open in the earlier Studio'
    && n.guide.href === guideUrl('en') && n.guide.text === 'Open the migration guide' && n.lead.startsWith('File from an earlier version (made with Egatari Studio v0.3.1).'), 'en, no versions.json: studio.egatari.org/v0.4.8/ and the English guide ' + JSON.stringify(n));
  ok(await openFile(pe, 'v047') === true && (n = await notice(pe)) && n.studio.href === STUDIO_SITE + 'v0.4.7/', 'en, no versions.json: made with 0.4.7 → studio.egatari.org/v0.4.7/');
  await pe.context().close();
} catch (e) {
  fails++;
  console.log('  FAIL ' + (e.stack || e));
} finally {
  await browser.close();
  srv.close();
  fs.rmSync(packDir, { recursive: true, force: true });
}
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
