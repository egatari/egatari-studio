// しおりが多いときの「しおり ▾」（handoff #90、Player P4.3）の確認
//   node tools/test-bookmark-menu.mjs [作業フォルダ] [--shots 画像のフォルダ]
// しおり 20 個のデッキを幅 768 px と 390 px で開く：名前のボタンは 1 つの「しおり ▾」にまとまり、ツールバーが横にはみ出さない
// （scrollWidth <= clientWidth、帯の中のどの要素も画面の外に出ない）。「しおり ▾」は menu button（aria-haspopup・aria-expanded）。
// 押すと名前の一覧（role=menu、項目は名前で読まれる）が画面の中に開き、項目で飛ぶ（そのスライドの最終状態）。飛んだ後の「元の位置に戻る」・q・Backspace は今と同じ。
// キーボード：Enter / Space で開いて項目へ、↓↑ で動く（端で回る）、Home / End、Esc で閉じて「しおり ▾」へ、Enter で飛ぶ。帯の外を押すと閉じる。
// 窓の大きさを変えると測り直す（広げると名前のボタン、狭めると「しおり ▾」）。しおり 3 個・幅 1280 px では名前のボタンがそのまま並ぶ。英語のデッキは「Bookmarks ▾」
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(args.splice(si, 2)[1]) : null;
const work = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-bookmark-menu-')));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// しおり n 個のデッキ（しおりのスライドの間に、しおりのないスライドを 1 枚ずつ）
const NAMES_JA = ['結果の表', '付録の扉', '実験の設定', '比較の図', '誤差の分布', '学習曲線', '計算量', '先行研究', '定理 1', '証明の概略',
  'データセット', 'ハイパーパラメータ', 'アブレーション', '失敗例', '今後の課題', '参考文献', '付録 A', '付録 B', '付録 C', '連絡先'];
const deckOf = (lang, names) => `<!DOCTYPE html>
<html lang="${lang}" data-theme="default">
<head><meta charset="utf-8"><title>Bookmark menu</title></head>
<body>
<div id="stage">
<section class="slide noconcl" id="s-start"><h2>Start</h2><div class="body"><p data-step="1">a</p></div></section>
${names.map((n, k) => `<section class="slide" id="s-b${k}" data-bookmark="${n}"><h2>${n}</h2><div class="body"><p data-step="1">x</p><p data-step="2">y</p></div><div class="concl"><span>${n}</span></div></section>
<section class="slide noconcl" id="s-p${k}"><h2>Plain ${k}</h2><div class="body"><p>z</p></div></section>`).join('\n')}
</div>
</body>
</html>
`;
const URL_OF = {};
for (const [key, lang, names] of [['ja20', 'ja', NAMES_JA], ['ja3', 'ja', NAMES_JA.slice(0, 3)], ['en20', 'en', NAMES_JA.map((_, k) => `Appendix ${k + 1}`)]]) {
  const dir = path.join(work, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), deckOf(lang, names));
  const out = path.join(dir, 'out', 'deck.html');
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html'), '-o', out], { stdio: 'pipe' });
  URL_OF[key] = fileUrl(out);
}

const b = await launch();
const errs = [];
const ready = (p) => p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: scaled(10000) });
const st = (p) => p.evaluate(() => { const s = DECK.state(); return `${s.slide}:${s.step}`; });
const settle = (p, ms = 250) => p.waitForTimeout(ms);
const show = (p) => p.evaluate(() => document.getElementById('dt-cb').classList.add('show'));
async function open(key, width, height) {
  const ctx = await b.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${key}@${width}: ${m.text()}`); });
  p.on('pageerror', (e) => errs.push(`${key}@${width}: pageerror: ${e.message}`));
  await p.goto(URL_OF[key]); await ready(p); await settle(p, 400);
  await show(p);
  return p;
}
// 帯の様子：まとめたか・「しおり ▾」が見えるか・名前のボタンが見えるか・横にはみ出すか・画面の外に出る要素
const bar = (p) => p.evaluate(() => {
  const cb = document.getElementById('dt-cb'), g = cb.querySelector('.dt-bm'), mb = cb.querySelector('[data-b="bmmenu"]');
  const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
  const out = [...cb.querySelectorAll('*')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5; }).map((e) => e.getAttribute('data-b') || e.getAttribute('data-bm') || e.className || e.tagName);
  const cr = cb.getBoundingClientRect();
  return { folded: g.classList.contains('dt-bmc'), menu: vis(mb), names: [...g.querySelectorAll(':scope > [data-bm]')].filter(vis).length,
    scroll: cb.scrollWidth, client: cb.clientWidth, out, inView: cr.left >= -0.5 && cr.right <= innerWidth + 0.5,
    mbText: mb.textContent, haspopup: mb.getAttribute('aria-haspopup'), expanded: mb.getAttribute('aria-expanded'), controls: mb.getAttribute('aria-controls') };
});
const list = (p) => p.evaluate(() => {
  const ml = document.getElementById('dt-bml');
  if (!ml || ml.hidden) return null;
  const r = ml.getBoundingClientRect();
  return { role: ml.getAttribute('role'), label: ml.getAttribute('aria-label'), items: [...ml.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent),
    inView: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5, focus: document.activeElement && document.activeElement.getAttribute('role') === 'menuitem' ? document.activeElement.textContent : null };
});
const focused = (p) => p.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute('data-b') || (a.getAttribute('role') === 'menuitem' ? 'item:' + a.textContent : a.tagName)) : null; });

try {
  // ---- しおり 20 個：幅 768 px と 390 px
  for (const [w, h] of [[768, 1024], [390, 844]]) {
    const p = await open('ja20', w, h);
    const s = await bar(p);
    ok(s.folded && s.menu && s.names === 0, `${w}px: 20 個の名前のボタンは「しおり ▾」にまとまる（${JSON.stringify({ folded: s.folded, menu: s.menu, names: s.names })}）`);
    ok(s.scroll <= s.client, `${w}px: ツールバーが横にはみ出さない（scrollWidth ${s.scroll} <= clientWidth ${s.client}）`);
    ok(s.out.length === 0 && s.inView, `${w}px: ツールバーのどの要素も画面の外に出ない（${JSON.stringify(s.out)}）`);
    ok(s.mbText === 'しおり ▾' && s.haspopup === 'menu' && s.expanded === 'false' && s.controls === 'dt-bml', `${w}px: 「しおり ▾」は menu button（${JSON.stringify([s.mbText, s.haspopup, s.expanded])}）`);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `bookmark-menu-${w}.png`) });
    // マウスで開いて項目で飛ぶ
    await p.evaluate(() => DECK.go(0, 1, false)); await settle(p);
    await p.click('#dt-cb [data-b="bmmenu"]'); await settle(p);
    const l = await list(p);
    ok(!!l && l.role === 'menu' && l.label === 'しおり' && JSON.stringify(l.items) === JSON.stringify(NAMES_JA), `${w}px: 押すと名前の一覧（role=menu、20 項目）${l ? '' : '：開かない'}`);
    ok(!!l && l.inView, `${w}px: 一覧は画面の中に開く`);
    ok((await bar(p)).expanded === 'true', `${w}px: 開いている間は aria-expanded=true`);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `bookmark-menu-${w}-open.png`) });
    await p.click('#dt-bml [data-bm="4"]'); await settle(p);
    ok(await st(p) === '10:3', `${w}px: 一覧の項目で、そのスライドの最終状態へ（${await st(p)}）`);
    ok(await list(p) === null && (await bar(p)).expanded === 'false', `${w}px: 飛んだら一覧は閉じる`);
    await show(p);
    ok(await p.evaluate(() => { const e = document.querySelector('#dt-cb [data-b="bmback"]'); return !e.hidden && e.getClientRects().length > 0; }), `${w}px: 飛んだ後は「元の位置に戻る」が出る`);
    const s2 = await bar(p);
    ok(s2.scroll <= s2.client && s2.out.length === 0, `${w}px: 「元の位置に戻る」が出てもはみ出さない（${s2.scroll} <= ${s2.client}、${JSON.stringify(s2.out)}）`);
    await p.keyboard.press('q'); await settle(p);
    ok(await st(p) === '12:3', `${w}px: q で次のしおり（${await st(p)}）`);
    await p.keyboard.press('Backspace'); await settle(p);
    ok(await st(p) === '1:1', `${w}px: Backspace で一覧を使う前の位置へ（${await st(p)}）`);
    // 帯の外を押すと閉じる
    await show(p);
    await p.click('#dt-cb [data-b="bmmenu"]'); await settle(p);
    await p.mouse.click(Math.round(w / 2), 40); await settle(p);
    ok(await list(p) === null, `${w}px: 帯の外を押すと一覧が閉じる`);
    await p.context().close();
  }

  // ---- キーボード（幅 768 px）
  {
    const p = await open('ja20', 768, 1024);
    await p.focus('#dt-cb [data-b="bmmenu"]');
    await p.keyboard.press('Enter'); await settle(p);
    let l = await list(p);
    ok(!!l && l.focus === NAMES_JA[0], `Enter で開いて最初の項目へ（${l && l.focus}）`);
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
    ok(await focused(p) === 'item:' + NAMES_JA[2], `↓ で次の項目（${await focused(p)}）`);
    await p.keyboard.press('ArrowUp');
    ok(await focused(p) === 'item:' + NAMES_JA[1], `↑ で前の項目（${await focused(p)}）`);
    await p.keyboard.press('End');
    ok(await focused(p) === 'item:' + NAMES_JA[19], `End で最後の項目（${await focused(p)}）`);
    await p.keyboard.press('ArrowDown');
    ok(await focused(p) === 'item:' + NAMES_JA[0], `最後の次は最初へ回る（${await focused(p)}）`);
    await p.keyboard.press('Home');
    ok(await focused(p) === 'item:' + NAMES_JA[0], `Home で最初の項目（${await focused(p)}）`);
    ok(await st(p) === '1:0', `一覧の間、矢印キーでスライドは動かない（${await st(p)}）`);
    await p.keyboard.press('Escape'); await settle(p);
    ok(await list(p) === null && await focused(p) === 'bmmenu', `Esc で閉じて「しおり ▾」へ（${await focused(p)}）`);
    await p.keyboard.press(' '); await settle(p);
    l = await list(p);
    ok(!!l && l.focus === NAMES_JA[0], `Space でも開く（${l && l.focus}）`);
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
    await p.keyboard.press('Enter'); await settle(p);
    ok(await st(p) === '8:3', `Enter でその項目のしおりへ（${await st(p)}）`);
    ok(await list(p) === null && await focused(p) === 'bmmenu', `飛んだら閉じて「しおり ▾」にフォーカス（${await focused(p)}）`);
    // しおりで来ている間に開くと、今のしおりの項目へ（aria-current）
    await p.keyboard.press('Enter'); await settle(p);
    l = await list(p);
    ok(!!l && l.focus === NAMES_JA[3] && await p.evaluate(() => document.activeElement.getAttribute('aria-current') === 'true'), `しおりで来ている間は、今のしおりの項目から（${l && l.focus}）`);
    await p.keyboard.press('Escape');
    await p.keyboard.press('ArrowUp'); await settle(p);
    l = await list(p);
    ok(!!l && l.focus === NAMES_JA[19], `「しおり ▾」の上の ↑ で開いて最後の項目へ（${l && l.focus}）`);
    await p.keyboard.press('Tab'); await settle(p);
    ok(await list(p) === null, 'Tab で一覧が閉じる');
    await p.context().close();
  }

  // ---- 窓の大きさを変えると測り直す
  {
    const p = await open('ja20', 390, 844);
    ok((await bar(p)).folded, '390px で開くと「しおり ▾」');
    await p.setViewportSize({ width: 2400, height: 900 }); await settle(p, 400); await show(p);
    let s = await bar(p);
    ok(!s.folded && !s.menu && s.names === 20 && s.scroll <= s.client, `幅 2400 px に広げると名前のボタンが並ぶ（${JSON.stringify({ folded: s.folded, names: s.names, scroll: s.scroll, client: s.client })}）`);
    await p.setViewportSize({ width: 768, height: 1024 }); await settle(p, 400); await show(p);
    s = await bar(p);
    ok(s.folded && s.menu && s.scroll <= s.client, `768 px に狭めると「しおり ▾」に戻る（${JSON.stringify({ folded: s.folded, scroll: s.scroll, client: s.client })}）`);
    await p.context().close();
  }

  // ---- しおり 3 個・幅 1280 px：名前のボタンがそのまま
  {
    const p = await open('ja3', 1280, 720);
    const s = await bar(p);
    ok(!s.folded && !s.menu && s.names === 3, `3 個・1280 px では名前のボタンが並び、「しおり ▾」は出ない（${JSON.stringify({ folded: s.folded, menu: s.menu, names: s.names })}）`);
    ok(s.scroll <= s.client && s.out.length === 0, '3 個・1280 px でもはみ出さない');
    await p.evaluate(() => document.querySelector('#dt-cb .dt-bm > [data-bm="1"]').click()); await settle(p);
    ok(await st(p) === '4:3', `名前のボタンは今までどおり飛ぶ（${await st(p)}）`);
    if (SHOTS) { await show(p); await p.screenshot({ path: path.join(SHOTS, 'bookmark-menu-1280-3.png') }); }
    await p.context().close();
  }

  // ---- 英語のデッキ
  {
    const p = await open('en20', 390, 844);
    const s = await bar(p);
    ok(s.folded && s.mbText === 'Bookmarks ▾', `en: “Bookmarks ▾” (${s.mbText})`);
    ok(s.scroll <= s.client && s.out.length === 0, 'en: the toolbar does not overflow at 390 px');
    await p.click('#dt-cb [data-b="bmmenu"]'); await settle(p);
    const l = await list(p);
    ok(!!l && l.label === 'Bookmarks' && l.items[0] === 'Appendix 1' && l.items.length === 20, 'en: the list is “Bookmarks” with the names');
    await p.context().close();
  }
} finally {
  await b.close();
}
ok(errs.length === 0, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
if (fails) { console.log(`\n${fails} 件の失敗`); process.exit(1); }
console.log('\nall ok');
