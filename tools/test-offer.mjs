// 見せるモードと見え方（metadata.offer → deck-meta.offer。format spec §1.2、Player P1・P2・P8）と、learn をなくしたこと（Player 1.4.0）の確認：
//   node tools/test-offer.mjs [作業フォルダ]
// 組み立て：metadata.offer を deck-meta.offer に写す（作業フォルダの build・1 ファイル・再生専用）。learn は talk に、知らない値・重なりは捨て、open は offer の中だけ。
//   索引の metadata.offer も同じ形。normalizeOffer の表。読むときは前の版の learn も誤りにしない
// 再生器（Chromium）：?mode=learn・offer の learn・埋め込みの {egatari:"mode", mode:"learn"} は talk。offer.open がモードと見え方を選ぶ。
//   優先：?mode・?layout・埋め込み ＞ この端末で選んだ並べ方 ＞ offer.open ＞ metadata.primary ＞ <html data-mode> ＞ 既定。
//   offer.faces にない見え方は「表示」の一覧・r・「本で読む」に出ない。offer.modes に talk がなく open がなければ offer の初めのモードで開く
//   見る人の video（offer.open・?mode=video。自動操作でないブラウザ）：開始のボタン 1 つ、押すとタイムラインで最後まで、帯は出ない。書き出しのブラウザでは出ない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { normalizeOffer } from '../kit/core/build-core.mjs';
import { validateDeckMeta, validateIndex } from '../kit/core/portable.mjs';
import { FORMAT } from '../kit/core/format.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const work = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'test-offer-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const J = (x) => JSON.stringify(x);

// ---------------------------------------------------------------- 1. normalizeOffer の表
const cases = [
  [{ modes: ['learn', 'video', 'talk', 'x'], faces: ['read', 'read'], open: { mode: 'learn', face: 'talk' } }, { modes: ['talk', 'video'], faces: ['read'], open: { mode: 'talk' } }],
  [{ modes: ['learn'] }, { modes: ['talk'] }],
  [{ modes: [], faces: ['x'] }, null],
  [{ open: { mode: 'video', face: 'read' } }, { open: { mode: 'video', face: 'read' } }],
  [{ modes: ['talk'], open: { mode: 'video' } }, { modes: ['talk'] }],
  [null, null], ['talk', null], [['talk'], null],
];
for (const [i, o] of cases) ok(J(normalizeOffer(i)) === J(o), `normalizeOffer(${J(i)}) → ${J(o)} (${J(normalizeOffer(i))})`);
ok(validateDeckMeta({ offer: { modes: ['learn'] } }).every((e) => !/offer/.test(e)), 'reading: a former learn in deck-meta.offer is not an error (players read it as talk)');
ok(validateDeckMeta({ offer: { modes: ['x'] } }).some((e) => /deck-meta\.offer\.modes/.test(e)), 'reading: an unknown mode in deck-meta.offer is an error');

// ---------------------------------------------------------------- 2. 組み立てが deck-meta.offer を書く
const SL = [['s-of1aaa', '春'], ['s-of2bbb', '夏'], ['s-of3ccc', '秋']];
function makeDeck(name, metadata, { article = false } = {}) {
  const dir = path.join(work, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>見せ方の試験</title></head>
<body>
<div id="stage">
${SL.map(([id, t]) => `<section class="slide" id="${id}"${article ? ` data-article="sec-${id}"` : ''}><h2>${t}</h2><div class="body"><p data-step="1">${t}の点。</p></div></section>`).join('\n')}
</div>
</body>
</html>
`);
  fs.writeFileSync(path.join(dir, 'narration.md'), SL.map(([id, t]) => `## ${t} {#${id}}\n[0] ${t}の話です。\n[1] ${t}の点です。\n`).join('\n'));
  if (article) fs.writeFileSync(path.join(dir, 'article.md'), `---\ntitle: 季節\n---\n\n${SL.map(([id, t]) => `(sec-${id})=\n## ${t}\n\n${t}の本文。\n`).join('\n')}`);
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ docId: '5b1e2c3d-4a5b-4c6d-8e7f-9a0b1c2d3e4f', metadata }, null, 1));
  return dir;
}
function build(dir, flags = []) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html'), ...flags], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
}
const scriptJson = (html, id) => { const m = html.match(new RegExp(`<script type="application/[a-z.+]*json" id="${id}"[^>]*>([\\s\\S]*?)</script>`)); return m ? JSON.parse(m[1]) : null; };
const OFFER_IN = { modes: ['learn', 'video'], faces: ['talk', 'read'], open: { mode: 'learn', face: 'read' } };
const OFFER_OUT = { modes: ['talk', 'video'], faces: ['talk', 'read'], open: { mode: 'talk', face: 'read' } };
const D = makeDeck('built', { offer: OFFER_IN, primary: 'read' });
build(D);
const folderMeta = scriptJson(fs.readFileSync(path.join(D, 'out', 'deck.html'), 'utf8'), 'deck-meta');
ok(J(folderMeta && folderMeta.offer) === J(OFFER_OUT), `working-folder build: deck-meta.offer from metadata.offer, learn read as talk (${J(folderMeta && folderMeta.offer)})`);
build(D, ['--portable']);
const ega = fs.readdirSync(D).find((f) => f.endsWith(FORMAT.FILE_EXT) && !f.endsWith(FORMAT.PLAY_EXT));
const egaHtml = fs.readFileSync(path.join(D, ega), 'utf8');
const pMeta = scriptJson(egaHtml, 'deck-meta'), pIndex = scriptJson(egaHtml, FORMAT.INDEX_ID);
ok(J(pMeta.offer) === J(OFFER_OUT) && validateDeckMeta(pMeta).length === 0, `Egatari file: deck-meta.offer written and valid (${J(pMeta.offer)})`);
ok(J(pIndex.metadata.offer) === J(OFFER_OUT) && pIndex.metadata.primary === 'read' && validateIndex(pIndex).length === 0, `Egatari file: index metadata.offer (no learn) and primary (${J(pIndex.metadata.offer)}, ${pIndex.metadata.primary})`);
build(D, ['--play-only']);
const po = fs.readdirSync(D).find((f) => f.endsWith(FORMAT.PLAY_EXT));
const poMeta = po ? scriptJson(fs.readFileSync(path.join(D, po), 'utf8'), 'deck-meta') : null;
ok(poMeta && J(poMeta.offer) === J(OFFER_OUT), `play-only: deck-meta.offer is kept (${J(poMeta && poMeta.offer)})`);
const E = makeDeck('empty-offer', { offer: { modes: ['x'] } });
build(E);
ok(!('offer' in scriptJson(fs.readFileSync(path.join(E, 'out', 'deck.html'), 'utf8'), 'deck-meta')), 'an offer with nothing valid is not written');

// ---------------------------------------------------------------- 3. 再生器
const B = makeDeck('player', {}, { article: true });
build(B);
const base = fs.readFileSync(path.join(B, 'out', 'deck.html'), 'utf8');
// deck-meta を書き換えた写し（試験のためだけ）
function variant(name, meta = {}, { dataMode = null } = {}) {
  let h = base.replace(/(<script type="application\/json" id="deck-meta">)([\s\S]*?)(<\/script>)/, (m, a, j, b) => a + JSON.stringify({ ...JSON.parse(j), ...meta }) + b);
  if (dataMode) h = h.replace(/<html /, `<html data-mode="${dataMode}" `);
  const f = path.join(B, 'out', name + '.html');
  fs.writeFileSync(f, h);
  return f;
}
const browser = await launch();
const errors = [];
async function open(file, { q = '', ctx = null, w = 1280, h = 720 } = {}) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: h } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${path.basename(file)}: ${e.message}`));
  await p.goto(fileUrl(file) + q);
  await p.waitForFunction(() => window.DECK && DECK.ready && (DECK.mode === 'video' || DECK.panes));
  return p;
}
const state = (p) => p.evaluate(() => ({ mode: DECK.mode, from: DECK.modeFrom, ctx: DECK.state().mode, layout: DECK.panes ? DECK.panes.layout() : null,
  offered: DECK.panes && DECK.panes.offered ? DECK.panes.offered() : null, view: !!document.querySelector('#dt-cb [data-b="view"]'), bar: !!document.getElementById('dt-cb'),
  html: document.documentElement.getAttribute('data-mode') }));
const close = (p) => p.context().close();

// learn → talk：アドレス・offer・埋め込みの命令
{
  let p = await open(variant('plain'), { q: '?mode=learn' });
  let s = await state(p);
  ok(s.mode === 'talk' && s.html === 'talk' && s.from === 'query' && s.bar, `?mode=learn opens talk with the toolbar (${J(s)})`);
  await close(p);
  p = await open(variant('learn-offer', { offer: { modes: ['learn'], open: { mode: 'learn' } } }));
  s = await state(p);
  const o = await p.evaluate(() => DECK.offer());
  ok(s.mode === 'talk' && J(o.modes) === '["talk"]' && o.open.mode === 'talk', `offer {modes:[learn], open:{mode:learn}} is read as talk (${J(o)})`);
  await close(p);
  p = await open(variant('learn-html', {}, { dataMode: 'learn' }));
  ok((await state(p)).mode === 'talk', '<html data-mode="learn"> is read as talk');
  await close(p);
  // 埋め込み（Player P8）：親の窓からの {egatari:"mode"}
  const host = path.join(B, 'out', 'host.html');
  fs.writeFileSync(host, `<!doctype html><meta charset="utf-8"><body><iframe id="f" style="width:960px;height:540px"></iframe><script>
window.msgs = []; var f = document.getElementById('f');
addEventListener('message', function(e){ if (e.source === f.contentWindow) window.msgs.push(e.data); });
f.src = 'plain.html?embed=1';
</script></body>`);
  const c = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const hp = await c.newPage();
  await hp.goto(fileUrl(host));
  await hp.waitForFunction(() => window.msgs.some((m) => m && m.egatari === 'position'), null, { timeout: 20000 });
  await hp.evaluate(() => { const w = document.getElementById('f').contentWindow; w.postMessage({ egatari: 'mode', id: 'm1', mode: 'learn' }, '*'); w.postMessage({ egatari: 'mode', id: 'm2', mode: 'video' }, '*'); w.postMessage({ egatari: 'rate', id: 'r1', value: 1.5 }, '*'); });
  await hp.waitForFunction(() => window.msgs.some((m) => m.id === 'm2') && window.msgs.some((m) => m.egatari === 'state' && m.rate === 1.5), null, { timeout: 10000 });
  const ms = await hp.evaluate(() => window.msgs);
  const m1 = ms.find((m) => m.id === 'm1'), m2 = ms.find((m) => m.id === 'm2');
  ok(m1 && m1.egatari === 'mode' && m1.mode === 'talk', `embedding: {egatari:"mode", mode:"learn"} is read as talk (${J(m1)})`);
  ok(m2 && m2.egatari === 'error' && m2.code === 'mode', `embedding: changing to another mode after loading answers an error (${J(m2)})`);
  ok(ms.some((m) => m.egatari === 'state' && m.rate === 1.5), 'embedding: {egatari:"rate"} sets the playback rate in talk and the player reports state');
  await c.close();
}

// offer.open がモードと見え方を選ぶ
{
  let p = await open(variant('open-video', { offer: { open: { mode: 'video' } } }));
  let s = await state(p);
  ok(s.mode === 'video' && s.from === 'offer' && !s.bar, `offer.open.mode video opens video mode (no toolbar) (${J(s)})`);
  await close(p);
  p = await open(variant('open-read', { offer: { open: { face: 'read' } } }));
  s = await state(p);
  ok(s.mode === 'talk' && s.layout === 'book', `offer.open.face read opens the book (${J(s)})`);
  await close(p);
  p = await open(variant('open-talk-face', { offer: { open: { face: 'talk' } }, primary: 'read' }));
  ok((await state(p)).layout === 'slides', 'offer.open.face talk wins over metadata.primary read');
  await close(p);
  p = await open(variant('primary-read', { primary: 'read' }));
  ok((await state(p)).layout === 'book', 'without offer.open, metadata.primary read opens the book');
  await close(p);
  p = await open(variant('only-video', { offer: { modes: ['video'] } }));
  ok((await state(p)).mode === 'video', 'offer.modes [video] without open: opens the first offered mode');
  await close(p);
}

// 優先の順（Player P1・P2）
{
  const OV = variant('prec', { offer: { open: { mode: 'video', face: 'read' } } }, { dataMode: 'talk' });
  let p = await open(OV, { q: '?mode=talk' });
  let s = await state(p);
  ok(s.mode === 'talk' && s.from === 'query' && s.layout === 'book', `?mode=talk wins over offer.open.mode video; the face still comes from offer.open (${J(s)})`);
  await close(p);
  p = await open(OV);
  ok((await state(p)).mode === 'video', 'offer.open.mode wins over <html data-mode>');
  await close(p);
  const HV = variant('html-video', {}, { dataMode: 'video' });
  p = await open(HV);
  ok((await state(p)).mode === 'video' && (await state(p)).from === 'html', '<html data-mode> applies without ?mode and offer.open');
  await close(p);
  const RF = variant('prec-face', { offer: { open: { face: 'read' } } });
  p = await open(RF, { q: '?layout=slides' });
  ok((await state(p)).layout === 'slides', '?layout=slides wins over offer.open.face read');
  await close(p);
  // この端末で選んだ並べ方は offer.open より強い（P2）。?layout はそれより強い
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  p = await open(RF, { ctx: c });
  await p.evaluate(() => DECK.panes.layout('split'));
  await p.close();
  p = await open(RF, { ctx: c });
  ok((await state(p)).layout === 'split', 'the layout this viewer chose wins over offer.open.face');
  await p.close();
  p = await open(RF, { ctx: c, q: '?layout=slides' });
  ok((await state(p)).layout === 'slides', '?layout wins over the remembered layout');
  await c.close();
}

// 見せる見え方だけを出す（offer.faces）
{
  let p = await open(variant('faces-talk', { offer: { faces: ['talk'] } }));
  let s = await state(p);
  ok(J(s.offered) === '["slides"]' && !s.view && s.layout === 'slides', `faces [talk]: only Slides, no View button (${J(s)})`);
  await p.click('#stage', { position: { x: 300, y: 300 } });
  await p.keyboard.press('r'); await p.waitForTimeout(150);
  ok((await state(p)).layout === 'slides', 'faces [talk]: r does not open the book');
  ok(await p.evaluate(() => { const b = document.getElementById('deck-readin'); return !b || b.hidden; }), 'faces [talk]: no “Read in the book” button');
  await p.keyboard.press('?');
  ok(!/スライド → /.test(await p.evaluate(() => document.getElementById('dt-help').textContent)), 'faces [talk]: the key list has no r row');
  await close(p);
  p = await open(variant('faces-read', { offer: { faces: ['read'] } }));
  s = await state(p);
  ok(J(s.offered) === '["book"]' && s.layout === 'book' && !s.view, `faces [read]: opens the book, only the book offered (${J(s)})`);
  ok(await p.evaluate(() => document.querySelector('#deck-text .dx-view').hidden), 'faces [read]: the book has no View button');
  await close(p);
  p = await open(variant('faces-read-q', { offer: { faces: ['read'] } }), { q: '?layout=slides' });
  ok((await state(p)).layout === 'slides', 'an explicit ?layout may open a face that is not offered (the viewer may override)');
  await close(p);
  p = await open(variant('faces-all', {}));
  s = await state(p);
  ok(J(s.offered) === '["slides","split","book"]' && s.view, `no offer: every layout is offered (${J(s.offered)})`);
  await p.evaluate(() => document.querySelector('#dt-cb [data-b="view"]').click());
  ok((await p.evaluate(() => document.querySelectorAll('#deck-layouts .dx-mi').length)) === 3, 'no offer: the View menu lists Slides, Slides and book, Book');
  await close(p);
  p = await open(variant('faces-both', { offer: { faces: ['talk', 'read'] } }), { w: 500, h: 800 });
  ok(J((await state(p)).offered) === '["slides","book"]', 'a narrow screen leaves out Slides and book, as before');
  await close(p);
}

// 見る人が video で開いたとき（Player P1、spec 609e145）：開始のボタンが 1 つだけ。押すとタイムラインに沿って最後まで進み、ほかの操作はない。
// 書き出し（自動操作のブラウザ。navigator.webdriver）ではボタンを出さない。ここでは見る人のブラウザのふりをする（webdriver を false に）
{
  const short = (h) => h.replace(/(<script type="application\/json" id="deck-timing">)([\s\S]*?)(<\/script>)/, (m, a, j, b) =>
    a + JSON.stringify(Object.fromEntries(SL.flatMap(([id]) => ['0', '1'].map((k) => [`${id}:${k}`, { dur: 0.6, hold: 0, lead: 0, pad_after: 0 }])))) + b);
  const VF = path.join(B, 'out', 'viewer-video.html');
  fs.writeFileSync(VF, short(fs.readFileSync(variant('vv', { offer: { open: { mode: 'video' } } }), 'utf8')));
  const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await c.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false }));
  for (const [label, file, q] of [['offer.open.mode video', VF, ''], ['?mode=video', path.join(B, 'out', 'plain.html'), '?mode=video']]) {
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    await p.goto(fileUrl(file) + q);
    await p.waitForFunction(() => window.DECK && DECK.ready);
    const s0 = await p.evaluate(() => ({ mode: DECK.mode, viewer: DECK.videoViewer(), buttons: [...document.querySelectorAll('button')].filter((b) => b.checkVisibility()).map((b) => b.id || b.className), bar: !!document.getElementById('dt-cb'), key: DECK.state().key }));
    ok(s0.mode === 'video' && s0.viewer && s0.buttons.length === 1 && s0.buttons[0] === 'deck-vstart' && !s0.bar, `${label} for a viewer: one start control and nothing else (${J(s0)})`);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);
    ok(await p.evaluate((k) => DECK.state().key === k && !DECK.playing(), s0.key), `${label}: not a still stage waiting for keys; nothing moves before the start control (keys do nothing)`);
    if (label === '?mode=video') { await p.close(); continue; }
    const seen = new Set([s0.key]);
    await p.click('#deck-vstart');
    ok(await p.evaluate(() => DECK.playing() && !document.getElementById('deck-vstart')), 'pressing it starts playback and removes the control');
    const last = await p.evaluate(() => DECK.timeline().at(-1).key);
    for (let j = 0; j < 80 && !seen.has(last); j++) { seen.add(await p.evaluate(() => DECK.state().key)); await p.waitForTimeout(100); }
    await p.waitForFunction(() => !DECK.playing(), null, { timeout: 15000 }).catch(() => {});
    const end = await p.evaluate(() => ({ key: DECK.state().key, playing: DECK.playing(), bar: !!document.getElementById('dt-cb'), vis: [...document.querySelectorAll('button')].filter((b) => b.checkVisibility()).length }));
    ok(seen.size === SL.length * 2 && end.key === last && !end.playing, `it advances through every step along the timeline to the end (${seen.size} steps seen, ends at ${end.key})`);
    ok(!end.bar && end.vis === 0, 'no toolbar or other control appears while or after playing');
    await p.close();
  }
  await c.close();
  // 書き出しのブラウザ（webdriver のまま）では出さない：render/render.mjs は ?mode=video で開いて DECK.seek で撮る
  const p = await open(VF);
  ok(await p.evaluate(() => DECK.mode === 'video' && !DECK.videoViewer() && !document.getElementById('deck-vstart') && !DECK.playing()), 'the export browser (navigator.webdriver) gets no start control and no playback, so render is unchanged');
  await close(p);
}

await browser.close();
ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('all ok');
