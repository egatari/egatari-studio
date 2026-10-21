// 発表の道具と編集モードを同時に使わない（#69）：どの状態から編集モードに入っても、編集の操作が勝つことを表で確かめる
//   node tools/test-edit-modes.mjs <作業用のフォルダ>
// examples/minimal を作業用のフォルダに写し、段階ごとに音の出る音声（audio/manifest.json）を付けて開発サーバーで開く。
// 行（入る前の状態）：ペン・消えるペン・レーザー・一覧（o）・暗転（b）・自動再生（a、音声が鳴り段階が進んでいる）・授業モード（l）・字幕（s）・
// 全画面（f）・発表者ビュー（p、そこでペン）・打ちかけのページ番号（3）・キーの一覧（?）。切り離した窓の機能はない（発表者ビューだけ）
// 各行で同じことを確かめる（列）：
//   enter    編集モードに入ると道具が切れ、一覧・暗転・キーの一覧・全画面が閉じ、自動再生と音声が止まり、打ちかけの番号が消える。
//            授業モードと字幕はそのまま。道具のボタンは隠れ、ペンのボタンだけが「手書きメモ」として残る（#70）
//   ink      入力欄の外の d で手書きメモになり（画面の端は「編集中：手書きメモ」）、もう一度 d で切れる。帯のペンのボタンも同じ
//   mode     画面の端（外枠の下の帯）の表示が「編集中」（aria-live）
//   click    文字をダブルクリックすると原稿の欄が開き、線は描かれない
//   type     原稿の欄に a–z・0–9・Space・← →・Backspace・Enter が入り、Esc で取り消す。デッキの位置・道具・表示は変わらない
//   deck-ce  プレビューの中の入力欄（contenteditable）でも d・v・x・Backspace などは字として入り、道具（手書きメモも）も位置も変わらない
//   leave    編集モードを出ても前の道具・状態は戻らず、位置 (i, k) は入ったときのまま、表示は「表示」、ペンのボタンは「ペン」に戻る
//   sync     発表者ビューの道具も切れ、位置が本体と同じ（発表者ビューを開いた行だけ。ほかは -）
// 最後に、編集モードでないときは発表者ビューと再生専用の 1 ファイルの道具がこれまでどおり使えることを確かめる
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { parseNarration } from '../kit/narration.mjs';
import { encodeWav } from '../kit/core/audio-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'motion-edit-modes'));
const deckDir = path.join(work, 'deck');
fs.rmSync(deckDir, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.cpSync(path.join(ROOT, 'examples/minimal'), deckDir, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
// 段階ごとに 1.2 秒の音（無音でない：鳴っているかを確かめる）
{
  const SR = 24000, sec = 1.2, a = new Float32Array(Math.round(SR * sec));
  for (let i = 0; i < a.length; i++) a[i] = 0.2 * Math.sin(2 * Math.PI * 330 * i / SR);
  const wav = encodeWav(a, SR), segments = {};
  fs.mkdirSync(path.join(deckDir, 'audio'), { recursive: true });
  parseNarration(fs.readFileSync(path.join(deckDir, 'narration.md'), 'utf8')).forEach((x, j) => {
    fs.writeFileSync(path.join(deckDir, 'audio', `t${j}.wav`), wav);
    segments[`${x.slideKey}:${x.stepKey}`] = { file: `t${j}.wav`, dur: sec, cues: [], engine: 'stub-tts' };
  });
  fs.writeFileSync(path.join(deckDir, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
}
const DECK_FILE = path.join(deckDir, 'deck.html');
const deck0 = fs.readFileSync(DECK_FILE, 'utf8');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

const srv = spawn(process.execPath, [path.join(ROOT, 'server/dev.mjs'), DECK_FILE, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
let slog = '';
srv.stderr.on('data', (d) => { slog += d; });
const base = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server did not start\n' + slog)), 15000);
  srv.stdout.on('data', (d) => { slog += d; const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); res(m[0]); } });
});

const browser = await launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } });
// 鳴らした音声を数える（デッキの Audio は外から見えないので、play を包む）
await ctx.addInitScript(() => {
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { (window.__media = window.__media || []).includes(this) || window.__media.push(this); return play.call(this); };
});
const errs = [];
const watch = (p, tag) => {
  p.on('pageerror', (e) => errs.push(tag + ' pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/play\(\) request was interrupted|The play\(\) request/.test(m.text())) errs.push(tag + ' console: ' + m.text()); });
};
const page = await ctx.newPage();
watch(page, 'shell');
const deckOf = (p) => p.frames().find((f) => f.parentFrame() === p.mainFrame());
const dk = () => deckOf(page);
const sleep = (ms) => page.waitForTimeout(ms);
async function until(fn, ms = 4000) { const t = Date.now(); for (;;) { try { if (await fn()) return true; } catch { /* 読み込み中 */ } if (Date.now() - t > ms) return false; await sleep(60); } }
async function ready() {
  await page.waitForFunction(() => window.__DEV_LOADS > 0, null, { timeout: 15000 });
  if (!(await until(() => dk().evaluate(() => !!(window.DECK && DECK.ready)), 15000))) throw new Error('deck not ready');
  await sleep(200);
}
// デッキの中の状態
const S = () => dk().evaluate(() => {
  const de = document.documentElement, cb = document.getElementById('dt-cb'), c = document.getElementById('dt-canvas');
  const hidden = (n) => { const b = cb && cb.querySelector('[data-b="' + n + '"]'); return !b || getComputedStyle(b).display === 'none'; };
  let ink = 0;
  if (c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) ink++; }
  const st = DECK.state();
  return {
    i: st.slide - 1, k: st.step, tool: DECK.tools.mode(), edit: de.classList.contains('dev-edit'),
    ov: !!document.getElementById('dt-ov'), help: !!document.querySelector('#dt-help.show'), black: de.classList.contains('blackout'),
    auto: de.classList.contains('autoplay'), audio: (window.__media || []).some((m) => !m.paused), lecture: DECK.mode === 'lecture',
    cap: !!DECK.captions(), fs: !!document.fullscreenElement, jump: (document.getElementById('jump') || {}).textContent || '',
    layerOn: !!document.querySelector('#dt-layer.on'), layerPE: (() => { const l = document.getElementById('dt-layer'); return l ? getComputedStyle(l).pointerEvents : null; })(),
    toolBtnsHidden: ['laser', 'vpen', 'clear', 'auto', 'over', 'full'].every(hidden), toolBtnsShown: !['laser', 'pen', 'vpen', 'clear'].some(hidden), ink,
    penBtn: (() => { const b = cb && cb.querySelector('[data-b="pen"]'); return b ? { shown: !hidden('pen'), label: b.getAttribute('aria-label'), title: b.title, pressed: b.getAttribute('aria-pressed') } : null; })(),
  };
});
const UI = () => page.evaluate(() => ({ ...window.__DEV_UI.state(), live: document.getElementById('dev-mode') && document.getElementById('dev-mode').getAttribute('aria-live') }));
// デッキにキーを送る（フォーカスをデッキの本体に置いて）
async function deckKey(k) {
  await dk().evaluate(() => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); window.focus(); });
  await dk().locator('body').press(k);
  await sleep(120);
}
// 舞台の点（1280×720）をページの座標に
async function stagePt(x, y) {
  const fb = await page.locator('#deck').boundingBox();
  const r = await dk().evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { x: b.left, y: b.top, k: b.width / 1280 }; });
  return [fb.x + r.x + x * r.k, fb.y + r.y + y * r.k];
}
async function strokeOnStage() {
  const pts = Array.from({ length: 10 }, (_, j) => [300 + j * 40, 600 + Math.sin(j) * 20]);
  await page.mouse.move(...await stagePt(...pts[0])); await page.mouse.down();
  for (const q of pts.slice(1)) await page.mouse.move(...await stagePt(...q), { steps: 3 });
  await page.mouse.up(); await sleep(100);
}
const toggleEdit = (on) => page.evaluate((on) => window.__DEV_UI.toggleEdit(on), on);

let pop = null, pv = null;
async function openPresenter() {
  const [p] = await Promise.all([ctx.waitForEvent('page'), deckKey('p')]);
  pop = p; watch(pop, 'presenter');
  for (let i = 0; i < 150 && !pv; i++) { const x = deckOf(pop); try { if (x && await x.evaluate(() => !!document.getElementById('pv') && !!(window.DECK && DECK.ptools))) pv = x; } catch { /* 読み込み中 */ } if (!pv) await sleep(100); }
  if (!pv) throw new Error('presenter view did not open');
  await sleep(900);
}
// 発表者ビューの本体（#pf の中の文書）にキーを送る
async function pvKey(k) {
  await pop.bringToFront();
  if (!(await pv.evaluate(() => document.hasFocus()))) await pv.click('#pv-notes').catch(() => {});
  await pop.keyboard.press(k);
}
async function closePresenter() { if (pop) await pop.close(); pop = null; pv = null; await page.bringToFront(); }

// 行：[名前, 入る前にすること, 編集に入る方法]
const ROWS = [
  ['pen', async () => { await deckKey('d'); await strokeOnStage(); }, 'deck e'],
  ['fading pen', async () => { await deckKey('v'); }, 'deck e'],
  ['laser', async () => { await deckKey('x'); await page.mouse.move(...await stagePt(640, 360)); }, 'deck e'],
  ['overview (o)', async () => { await deckKey('o'); }, 'shell'],             // 一覧はすべてのキーを止めるので、外枠（アプリの「編集」ボタンと同じ）から入る
  ['blackout (b)', async () => { await deckKey('b'); }, 'deck e'],
  ['autoplay (a)', async () => { await deckKey('a'); }, 'deck e'],
  ['lecture (l)', async () => { await deckKey('l'); }, 'deck e'],
  ['captions (s)', async () => { await deckKey('s'); }, 'deck e'],
  ['fullscreen (f)', async () => { await deckKey('f'); }, 'deck e'],
  ['presenter (p)', async () => { await openPresenter(); await pvKey('d'); await sleep(300); await page.bringToFront(); }, 'shell'],
  ['typed "3"', async () => { await deckKey('3'); }, 'shell'],   // デッキの e は打ちかけの番号をそれだけで消すので、外枠から入る
  ['help (?)', async () => { await deckKey('?'); }, 'deck e'],
];
const table = [];
try {
  await page.goto(base); await ready();
  ok(!!(await page.$('#dev-bar #dev-mode')), 'the mode indicator sits in the shell bar below the preview');
  {
    const fb = await page.locator('#deck').boundingBox(), mb = await page.locator('#dev-mode').boundingBox();
    ok(mb.y >= fb.y + fb.height - 0.5, `the mode indicator does not cover the preview (preview bottom ${fb.y + fb.height}, indicator top ${mb.y})`);
  }
  ok((await UI()).modeText === '表示', 'mode indicator: 表示 when neither editing nor using a tool');
  for (const [name, setup, how] of ROWS) {
    const row = { state: name, enter: '', mode: '', ink: '', click: '', type: '', 'deck-ce': '', leave: '', sync: '-' };
    const fail = (col, why) => { row[col] = 'FAIL'; ok(false, `[${name}] ${col}: ${why}`); };
    try {
      // 毎回同じところから：編集モードを出て、本文のあるスライドへ
      await toggleEdit(false);
      await dk().evaluate(() => { DECK.autoplay(false); DECK.tools.setMode(null); DECK.tools.clear(true); DECK.go(2, 1, false); });
      await sleep(150);
      await setup();
      const s0 = await S();
      // 準備ができたか（その状態になっていなければ、この行は確かめられない）
      const armed = { pen: s0.tool === 'pen' && s0.ink > 0, 'fading pen': s0.tool === 'vpen', laser: s0.tool === 'laser', 'overview (o)': s0.ov, 'blackout (b)': s0.black,
        'lecture (l)': s0.lecture, 'captions (s)': s0.cap, 'typed "3"': s0.jump === '3', 'help (?)': s0.help }[name];
      if (name === 'autoplay (a)') {
        const k0 = s0.i * 100 + s0.k;
        const moving = await until(async () => { const s = await S(); return s.auto && s.audio && s.i * 100 + s.k > k0; }, 8000);
        if (!moving) throw new Error('autoplay did not start with audio');
      } else if (name === 'fullscreen (f)') {
        if (!(await until(async () => (await S()).fs, 3000))) throw new Error('fullscreen did not start in the headless browser');
      } else if (name === 'presenter (p)') {
        if (!(await until(async () => (await S()).tool === 'pen' && await pv.evaluate(() => DECK.ptools.mode() === 'pen')))) throw new Error('presenter pen did not reach the deck ' + JSON.stringify([(await S()).tool, await pv.evaluate(() => DECK.ptools.mode())]));
      } else if (armed === false) throw new Error('could not set up the state');
      const pre = await S();
      // ---- 編集モードに入る
      if (how === 'deck e') await deckKey('e'); else await toggleEdit(true);
      if (!(await until(async () => (await S()).edit))) throw new Error('edit mode did not start');
      await sleep(250);
      const e1 = await S();
      const bad = [];
      if (e1.tool !== null || e1.layerOn || e1.layerPE !== 'none') bad.push('tool still on');
      if (e1.ov) bad.push('overview open'); if (e1.help) bad.push('help open'); if (e1.black) bad.push('blackout on');
      if (e1.auto) bad.push('autoplay on'); if (e1.audio) bad.push('audio playing'); if (e1.fs) bad.push('fullscreen'); if (e1.jump) bad.push('typed number kept');
      if (e1.lecture !== pre.lecture || e1.cap !== pre.cap) bad.push('lecture/captions changed');
      if (!e1.toolBtnsHidden) bad.push('tool buttons visible');
      if (!e1.penBtn || !e1.penBtn.shown || e1.penBtn.label !== '手書きメモ' || !/^手書きメモ（d）$/.test(e1.penBtn.title)) bad.push('pen button is not the ink note ' + JSON.stringify(e1.penBtn));
      if (name === 'pen' && !(e1.ink > 0)) bad.push('the ink drawn before editing is gone');   // 書いた線は見えたまま（板が開いて枠が狭まるので画素の数は変わる）
      row.enter = bad.length ? 'FAIL' : 'ok'; if (bad.length) fail('enter', bad.join(', '));
      // ---- 画面の端の表示
      const u1 = await UI();
      row.mode = u1.modeText === '編集中' && u1.mode === 'edit' && u1.live === 'polite' && u1.tool === null ? 'ok' : 'FAIL';
      if (row.mode !== 'ok') fail('mode', JSON.stringify(u1));
      const at = { i: e1.i, k: e1.k };
      // 進む・暗転などのキーを押しても、道具と一覧のキーは効かない（入力欄の外で押したとき）
      for (const k of ['v', 'x', 'o', 'a', 'b', 'f']) await deckKey(k);
      const e2 = await S();
      if (e2.tool || e2.ov || e2.auto || e2.black || e2.fs) fail('enter', 'a tool/view key worked in edit mode: ' + JSON.stringify(e2));
      // ---- ペンのキー d・帯のペンのボタン → 手書きメモ（#70）
      {
        const ib = [];
        await deckKey('d');
        const i1 = await S(), iu = await UI();
        if (i1.tool !== 'ink' || i1.penBtn.pressed !== 'true' || i1.layerPE !== 'auto' || iu.modeText !== '編集中：手書きメモ') ib.push('d did not enter the ink note ' + JSON.stringify({ tool: i1.tool, pen: i1.penBtn, pe: i1.layerPE, mode: iu.modeText }));
        await deckKey('d');
        const i2 = await S();
        if (i2.tool !== null || (await UI()).modeText !== '編集中') ib.push('d again did not leave it ' + i2.tool);
        await dk().evaluate(() => document.querySelector('#dt-cb [data-b="pen"]').click());
        await sleep(120);
        const i3 = await S();
        if (i3.tool !== 'ink') ib.push('the pen button did not enter the ink note ' + i3.tool);
        await dk().evaluate(() => document.querySelector('#dt-cb [data-b="pen"]').click());
        await sleep(120);
        if ((await S()).tool !== null) ib.push('the pen button did not leave it');
        row.ink = ib.length ? 'FAIL' : 'ok'; if (ib.length) fail('ink', ib.join(', '));
      }
      // ---- 文字をダブルクリック → 原稿の欄。線は描かれない
      const tgt = await dk().evaluate(() => {
        const el = [...document.querySelectorAll('#stage .slide.active [data-src]')].find((x) => { const r = x.getBoundingClientRect(); return r.width > 30 && r.height > 8 && /\S/.test(x.textContent); });
        const st = document.getElementById('stage').getBoundingClientRect(), r = el.getBoundingClientRect(), k = st.width / 1280;
        return { x: (r.left + Math.min(r.width / 2, 40) - st.left) / k, y: (r.top + r.height / 2 - st.top) / k };
      });
      const inkBefore = (await S()).ink;
      await page.mouse.dblclick(...await stagePt(tgt.x, tgt.y));
      const opened = await until(() => page.evaluate(() => { const t = document.querySelector('#dev-editor textarea'); return !!(t && !t.disabled); }), 5000);
      const inkAfter = (await S()).ink;
      row.click = opened && inkAfter === inkBefore ? 'ok' : 'FAIL';
      if (row.click !== 'ok') fail('click', `editor opened ${opened}, ink ${inkBefore} → ${inkAfter}`);
      // ---- 原稿の欄に打つ
      if (opened) {
        const ta = page.locator('#dev-editor textarea');
        await ta.focus(); await ta.press('ControlOrMeta+a'); await ta.press('Delete');
        const AZ = 'abcdefghijklmnopqrstuvwxyz0123456789';
        await ta.pressSequentially(AZ);
        for (const k of ['Space', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Enter']) await ta.press(k);
        const v = await ta.inputValue(), s2 = await S();
        const same = s2.i === at.i && s2.k === at.k && s2.tool === null && !s2.ov && !s2.black && !s2.auto && s2.lecture === pre.lecture && s2.cap === pre.cap && !s2.jump;
        await ta.press('Escape');
        const closed = await until(() => page.evaluate(() => !document.querySelector('#dev-editor')));
        row.type = v === AZ + '\n' && same && closed && fs.readFileSync(DECK_FILE, 'utf8') === deck0 ? 'ok' : 'FAIL';
        if (row.type !== 'ok') fail('type', `value ${JSON.stringify(v)}, deck unchanged ${same}, Esc closed ${closed}`);
      } else row.type = 'FAIL';
      // ---- プレビューの中の入力欄（contenteditable）
      await dk().evaluate(() => { const d = document.createElement('div'); d.id = 't-ce'; d.contentEditable = 'true'; d.style.cssText = 'position:absolute;left:40px;top:40px;width:400px;height:60px;background:#fff;z-index:50'; document.querySelector('#stage .slide.active').appendChild(d); d.focus(); });
      for (const k of ['d', 'v', 'x', 'a', 'D', 'o', 'b', '3', 'Backspace', 'Space', 'ArrowLeft', 'ArrowRight', 'Enter', 'l', 's']) await dk().locator('#t-ce').press(k);
      const ce = await dk().evaluate(() => document.getElementById('t-ce').innerText.replace(/\s/g, '')), s3 = await S();
      await dk().evaluate(() => document.getElementById('t-ce').remove());
      const ceSame = s3.i === at.i && s3.k === at.k && s3.tool === null && !s3.ov && !s3.black && !s3.auto && s3.lecture === pre.lecture && s3.cap === pre.cap && !s3.jump;
      row['deck-ce'] = ce === 'dvxaDobls' && ceSame ? 'ok' : 'FAIL';
      if (row['deck-ce'] !== 'ok') fail('deck-ce', `text ${JSON.stringify(ce)}, deck unchanged ${ceSame} ${JSON.stringify(s3)}`);
      // ---- 編集モードを出る（デッキの e）
      await deckKey('e');
      const left = await until(async () => !(await S()).edit);
      await sleep(250);
      const s4 = await S(), u4 = await UI();
      const lb = [];
      if (!left) lb.push('still editing');
      if (s4.tool !== null || s4.ov || s4.help || s4.black || s4.auto || s4.audio || s4.fs || s4.jump) lb.push('a state came back ' + JSON.stringify(s4));
      if (s4.i !== at.i || s4.k !== at.k) lb.push(`position ${at.i},${at.k} → ${s4.i},${s4.k}`);
      if (!s4.toolBtnsShown) lb.push('tool buttons still hidden');
      if (!s4.penBtn || s4.penBtn.label !== 'ペン') lb.push('pen button still the ink note ' + JSON.stringify(s4.penBtn));
      if (u4.modeText !== '表示') lb.push('indicator ' + u4.modeText);
      row.leave = lb.length ? 'FAIL' : 'ok'; if (lb.length) fail('leave', lb.join(', '));
      if (pv) {
        const ps = await pv.evaluate(() => ({ mode: DECK.ptools.mode() }));
        const syncPos = await until(async () => {
          const fr = pv.childFrames().find((f) => f.url().includes('view=follow'));
          if (!fr) return false;
          const st = await fr.evaluate(() => DECK.state());
          return st.slide - 1 === s4.i && st.step === s4.k;
        });
        row.sync = ps.mode === null && syncPos ? 'ok' : 'FAIL';
        if (row.sync !== 'ok') fail('sync', `presenter tool ${ps.mode}, position in sync ${syncPos}`);
      }
    } catch (e) {
      ok(false, `[${name}] ${e.message.split('\n')[0]}`);
      for (const k of Object.keys(row)) if (!row[k]) row[k] = 'ERR';
    }
    table.push(row);
    if (name === 'presenter (p)') {
      // 編集モードでないときは、発表者ビューの道具がこれまでどおり本体に届く
      await toggleEdit(false);
      await pvKey('d'); await sleep(400);
      ok(await until(async () => (await S()).tool === 'pen'), 'presenter view: outside edit mode, d in the presenter view still turns the pen on in the deck');
      await pvKey('d'); await sleep(200);
      // 編集中に発表者ビューで道具を選んでも、本体は断り、発表者ビューの道具も切れる
      await page.bringToFront(); await toggleEdit(true); await until(async () => (await S()).edit);
      await pvKey('x'); await sleep(500);
      ok((await S()).tool === null && await until(() => pv.evaluate(() => DECK.ptools.mode() === null)), 'presenter view: while editing, a tool chosen in the presenter view is refused and turned off there too');
      await page.bringToFront(); await toggleEdit(false);
      await closePresenter();
    }
    // 次の行のために、残った状態を戻す
    await dk().evaluate(() => { if (DECK.mode === 'lecture') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true })); if (DECK.captions()) DECK.captions(false); }).catch(() => {});
  }
  // 表
  const cols = ['state', 'enter', 'mode', 'ink', 'click', 'type', 'deck-ce', 'leave', 'sync'];
  const w = cols.map((c) => Math.max(c.length, ...table.map((r) => String(r[c]).length)));
  const line = (r) => '  | ' + cols.map((c, j) => String(r[c]).padEnd(w[j])).join(' | ') + ' |';
  console.log('\n' + line(Object.fromEntries(cols.map((c) => [c, c]))));
  console.log('  |' + w.map((n) => '-'.repeat(n + 2)).join('|') + '|');
  for (const r of table) console.log(line(r));
  console.log('  (detached window: not a feature of Egatari Studio; the presenter view is the only other window)\n');

  // 道具を選んでいる間の表示（aria-live）
  await deckKey('d');
  ok(await until(async () => (await UI()).modeText === '発表の道具：ペン'), 'mode indicator: 発表の道具：ペン while the pen is on');
  await deckKey('x');
  ok(await until(async () => (await UI()).modeText === '発表の道具：レーザー'), 'mode indicator: 発表の道具：レーザー');
  await deckKey('Escape');
  ok(await until(async () => (await UI()).modeText === '表示'), 'mode indicator: back to 表示 after Esc');
} catch (e) {
  fails++; console.error(e);
}

// ---- 再生専用の 1 ファイル（編集の画面のない書き出し）：道具はこれまでどおり
try {
  const out = path.join(work, 'play.ega.html');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/portable.mjs'), 'pack', deckDir, '-o', out, '--play-only'], { stdio: 'pipe' });
  const p = await ctx.newPage(); watch(p, 'play-only');
  await p.goto(fileUrl(out)); await p.waitForFunction(() => window.DECK && DECK.ready);
  ok(await p.evaluate(() => !window.DECK_DEV), 'play-only file: no edit hints');
  await p.keyboard.press('d');
  const r = await p.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { x: b.left, y: b.top, k: b.width / 1280 }; });
  await p.mouse.move(r.x + 300 * r.k, r.y + 600 * r.k); await p.mouse.down();
  for (let j = 1; j < 8; j++) await p.mouse.move(r.x + (300 + j * 50) * r.k, r.y + (600 + (j % 2) * 20) * r.k, { steps: 3 });
  await p.mouse.up();
  const ink = await p.evaluate(() => { const c = document.getElementById('dt-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++; return n; });
  ok(await p.evaluate(() => DECK.tools.mode()) === 'pen' && ink > 0, `play-only file: d turns the pen on and it draws (${ink} px)`);
  await p.keyboard.press('Backspace');
  ok(await p.evaluate(() => DECK.tools.mode()) === 'pen', 'play-only file: Backspace with the pen clears ink and keeps the pen');
  await p.close();
} catch (e) { fails++; console.error(e); }

ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
srv.kill();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
