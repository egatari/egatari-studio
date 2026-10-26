// 実行系が受ける postMessage の送り手（kit/deck.js・kit/tools.js、Player P8）
//   node tools/test-message-sources.mjs <built.html> [出力先]
// - 知らない窓・枠（自分・子の枠・この窓が開いた別の窓・埋め込みでない親）からの deck-cmd・deck-tool では動かない
// - この窓が開いた発表者ビューからは動く。編集のプレビュー（DECK_DEV の枠）では親の窓（中継）からの deck-cmd で動き、親に deck-pos が届く
// - 発表者ビューの中の画面（view=follow）は、親からの deck-goto だけで動く
// - 埋め込みでない親にも、?embed=1 の親にも deck-pos は届かない（埋め込みには Player P8 の position だけ）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, fileUrl } from '../kit/browser.mjs';

const [file, outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-message-sources-'))] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/test-message-sources.mjs <built.html> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const errs = [];
const watch = (p, n) => { p.on('pageerror', (e) => errs.push(n + ': ' + e.message)); };
const ready = (p) => p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
const state = (f) => f.evaluate(() => DECK.state().slide * 100 + DECK.state().step);
const settle = (p, ms = 300) => p.waitForTimeout(ms);

// ---- 上の窓のデッキ：自分・子の枠・この窓が開いた別の窓からの命令は聞かない
{
  const p = await ctx.newPage(); watch(p, 'top');
  await p.goto(fileUrl(file) + '#2'); await ready(p);
  const s0 = await state(p);
  await p.evaluate(() => window.postMessage({ type: 'deck-cmd', cmd: 'next' }, '*')); await settle(p);
  ok(await state(p) === s0, 'top: a deck-cmd from the window itself is ignored');
  await p.evaluate(() => { const c = document.createElement('iframe'); c.srcdoc = '<script>parent.postMessage({type:"deck-cmd",cmd:"goto",i:4,k:0},"*");parent.postMessage({type:"deck-cmd",cmd:"next"},"*");parent.postMessage({type:"deck-cmd",cmd:"hello"},"*");parent.postMessage({type:"deck-tool",cmd:"mode",mode:"pen"},"*")<\/script>'; document.body.appendChild(c); });
  await settle(p, 500);
  ok(await state(p) === s0, 'top: deck-cmd goto / next / hello from a child frame are ignored');
  ok(await p.evaluate(() => DECK.tools.mode()) === null, 'top: a deck-tool from a child frame is ignored');
  const [pop] = await Promise.all([ctx.waitForEvent('page'), p.evaluate(() => { window.__w = window.open('about:blank', 'other'); })]);
  await pop.evaluate(() => { opener.postMessage({ type: 'deck-cmd', cmd: 'goto', i: 4, k: 0 }, '*'); opener.postMessage({ type: 'deck-tool', cmd: 'mode', mode: 'laser' }, '*'); });
  await settle(p, 400);
  ok(await state(p) === s0 && await p.evaluate(() => DECK.tools.mode()) === null, 'top: commands from another window this page opened (not the presenter view) are ignored');
  await pop.close();
  // この窓が開いた発表者ビューからは動く
  const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
  watch(pv, 'presenter');
  await pv.waitForFunction(() => /\//.test((document.getElementById('pv-pos') || {}).textContent || ''), null, { timeout: 15000 });
  await pv.evaluate(() => opener.postMessage({ type: 'deck-cmd', cmd: 'next' }, '*')); await settle(p, 400);
  ok(await state(p) > s0, 'top: the presenter view this window opened still drives it');
  await pv.evaluate(() => opener.postMessage({ type: 'deck-tool', cmd: 'mode', mode: 'laser' }, '*')); await settle(p, 200);
  ok(await p.evaluate(() => DECK.tools.mode()) === 'laser', 'top: the presenter view still sets the tool');
  await pv.close();
  await p.close();
}

// ---- 枠の中のデッキ：埋め込みでない親・?embed=1 の親・編集のプレビュー（DECK_DEV）の親
const host = path.join(path.dirname(file), 'msg-host.html');
fs.writeFileSync(host, `<!doctype html><meta charset="utf-8"><body style="margin:0">
<iframe id="f" style="width:1280px;height:720px;border:0"></iframe>
<script>
window.msgs = [];
var f = document.getElementById('f');
window.addEventListener('message', function(e){ if (e.source === f.contentWindow) window.msgs.push(e.data); });
f.src = ${JSON.stringify(path.basename(file))} + location.search + location.hash;
</script>`);
async function frameReady(p) {
  let fr = null;
  for (let i = 0; i < 150 && !(fr = frameOf(p)); i++) await p.waitForTimeout(100);
  await fr.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  return fr;
}
const frameOf = (p) => p.frames().find((f) => f !== p.mainFrame() && /\.html/.test(f.url()) && !/msg-host/.test(f.url()));
for (const q of ['', '?embed=1']) {
  const p = await ctx.newPage(); watch(p, 'host' + q);
  await p.goto(fileUrl(host) + q + '#2');
  const fr = await frameReady(p);
  await settle(p, 500);
  const s0 = await state(fr);
  await p.evaluate(() => { f.contentWindow.postMessage({ type: 'deck-cmd', cmd: 'goto', i: 4, k: 0 }, '*'); f.contentWindow.postMessage({ type: 'deck-cmd', cmd: 'next' }, '*'); f.contentWindow.postMessage({ type: 'deck-tool', cmd: 'mode', mode: 'pen' }, '*'); });
  await settle(p, 400);
  ok(await state(fr) === s0 && await fr.evaluate(() => DECK.tools ? DECK.tools.mode() : null) === null, `frame${q || ' (no embed)'}: deck-cmd and deck-tool from a parent that is not the editor are ignored`);
  await fr.evaluate(() => DECK.go(2, 0, false)); await settle(p, 300);
  const msgs = await p.evaluate(() => window.msgs);
  ok(!msgs.some((m) => m && m.type === 'deck-pos'), `frame${q || ' (no embed)'}: no deck-pos reaches the parent (${msgs.length} messages)`);
  if (q) ok(msgs.some((m) => m && m.egatari === 'position'), 'frame?embed=1: the parent gets Player P8 position events');
  else ok(!msgs.some((m) => m && m.egatari), 'frame (no embed): no embedding events either');
  // 編集のプレビュー（server/hints.js が DECK_DEV を立てる）：親の窓（中継）からは動き、deck-pos が親に届く
  if (!q) {
    await fr.evaluate(() => { window.DECK_DEV = true; });
    await p.evaluate(() => { window.msgs = []; f.contentWindow.postMessage({ type: 'deck-cmd', cmd: 'goto', i: 1, k: 1 }, '*'); });
    await settle(p, 400);
    ok(await state(fr) === 201, 'editor preview (DECK_DEV): the relaying parent can navigate');
    ok(await p.evaluate(() => window.msgs.some((m) => m && m.type === 'deck-pos' && m.i === 1 && m.k === 1)), 'editor preview: deck-pos reaches the relaying parent');
    await fr.evaluate(() => { const c = document.createElement('iframe'); c.srcdoc = '<script>parent.postMessage({type:"deck-cmd",cmd:"goto",i:4,k:0},"*")<\/script>'; document.body.appendChild(c); });
    await settle(p, 400);
    ok(await state(fr) === 201, 'editor preview: a child frame still cannot navigate');
    await p.evaluate(() => f.contentWindow.postMessage({ type: 'deck-tool', cmd: 'mode', mode: 'laser' }, '*')); await settle(p, 200);
    ok(await fr.evaluate(() => DECK.tools.mode()) === 'laser', 'editor preview: the relaying parent can set the tool');
  }
  await p.close();
}

// ---- 発表者ビューの中の画面（view=follow）：親からの deck-goto だけ
{
  const p = await ctx.newPage(); watch(p, 'view');
  await p.goto(fileUrl(host) + '?view=follow');
  const fr = await frameReady(p);
  await fr.evaluate(() => window.postMessage({ type: 'deck-goto', i: 3, k: 0 }, '*')); await settle(p, 400);
  ok(await state(fr) === 100, 'view=follow: a deck-goto from itself is ignored');
  await p.evaluate(() => f.contentWindow.postMessage({ type: 'deck-goto', i: 2, k: 1 }, '*')); await settle(p, 400);
  ok(await state(fr) === 301, 'view=follow: a deck-goto from the parent (the presenter view) is followed');
  await p.close();
}

ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} failed` : 'all passed', '→', outdir);
process.exit(fails ? 1 : 0);
