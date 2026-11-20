// しおり（format spec §8.0 Bookmarks、Player P4.3）の確認
//   node tools/test-bookmarks.mjs [作業フォルダ] [--shots 画像のフォルダ]
// 操作の帯のしおりのボタン（名前・まとまり・「しおり：名前」）、押すとそのスライドの最終状態へ、「元の位置に戻る」と Backspace、
// q で次のしおりへ・最後の次は元の位置へ、キーの一覧の q の行、一覧（o）のしおりの名前、発表者ビューの同じボタンと q、
// 英語のデッキの言葉、動画（?mode=video）と印刷には出ないこと
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
const work = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-bookmarks-')));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

const deckOf = (lang) => `<!DOCTYPE html>
<html lang="${lang}" data-theme="default">
<head><meta charset="utf-8"><title>Bookmarks</title></head>
<body>
<div id="stage">
<section class="slide noconcl" id="s-one"><h2>One</h2><div class="body"><p data-step="1">a</p><p data-step="2">b</p></div></section>
<section class="slide" id="s-two" data-bookmark="${lang === 'ja' ? '質疑用' : 'Q&amp;A'}"><h2>Results</h2><div class="body"><p data-step="1">c</p><p data-step="2">d</p></div><div class="concl"><span>Two</span></div></section>
<section class="slide noconcl" id="s-three"><h2>Three</h2><div class="body"><p>e</p></div></section>
<section class="slide noconcl" id="s-four" data-bookmark="Figure"><h2>Four</h2><div class="body"><p data-step="1">f</p></div></section>
<section class="slide noconcl" id="s-five"><h2>Five</h2><div class="body"><p>g</p></div></section>
</div>
</body>
</html>
`;
const URL_OF = {};
for (const lang of ['ja', 'en', 'none']) {
  const dir = path.join(work, lang);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), lang === 'none' ? deckOf('ja').replace(/ data-bookmark="[^"]*"/g, '') : deckOf(lang));
  const out = path.join(dir, 'out', 'deck.html');
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html'), '-o', out], { stdio: 'pipe' });
  URL_OF[lang] = fileUrl(out);
}

const b = await launch();
const errs = [];
const watch = (p, name) => {
  p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push(name + ': pageerror: ' + e.message));
};
const ready = (p) => p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: scaled(10000) });
const st = (p) => p.evaluate(() => { const s = DECK.state(); return `${s.slide}:${s.step}`; });
const settle = (p, ms = 250) => p.waitForTimeout(ms);
const visible = (p, sel) => p.evaluate((sel) => { const e = document.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; }, sel);
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const open = async (lang, q = '') => { const p = await ctx.newPage(); watch(p, lang + q); await p.goto(URL_OF[lang] + q); await ready(p); return p; };

try {
  // ---- 操作の帯のボタン（日本語）
  {
    const p = await open('ja');
    const btns = await p.evaluate(() => [...document.querySelectorAll('#dt-cb .dt-bm [data-bm]')].map((e) => [e.textContent, e.title, e.getAttribute('aria-label')]));
    ok(JSON.stringify(btns) === JSON.stringify([['質疑用', 'しおり：質疑用', 'しおり：質疑用'], ['Figure', 'しおり：Figure', 'しおり：Figure']]), `帯にしおりのボタンが名前で並ぶ（${JSON.stringify(btns)}）`);
    ok(await p.evaluate(() => { const g = document.querySelector('#dt-cb .dt-bm'); return g.getAttribute('role') === 'group' && g.getAttribute('aria-label') === 'しおり'; }), 'しおりのボタンは 1 つのまとまり（role=group「しおり」）');
    ok(!(await visible(p, '#dt-cb [data-b="bmback"]')), '初めは「元の位置に戻る」がない');
    await p.keyboard.press('ArrowRight'); await settle(p);
    ok(await st(p) === '1:1', `1 枚目のステップ 1 から（${await st(p)}）`);
    await p.evaluate(() => document.querySelector('#dt-cb [data-bm="0"]').click()); await settle(p);
    ok(await st(p) === '2:3', `しおりのボタンでそのスライドの最終状態（結論の段階）へ（${await st(p)}）`);
    ok(await p.evaluate(() => location.hash) === '#s-two:concl', `# は #s-two:concl（${await p.evaluate(() => location.hash)}）`);
    await p.evaluate(() => document.querySelector('#dt-cb').classList.add('show'));
    ok(await visible(p, '#dt-cb [data-b="bmback"]'), 'しおりで来たら帯に「元の位置に戻る」');
    ok(await p.evaluate(() => { const e = document.querySelector('#dt-cb [data-b="bmback"]'); return e.getAttribute('aria-label') === '元の位置に戻る' && e.textContent.includes('元の位置に戻る'); }), '「元の位置に戻る」の名前');
    ok(await p.evaluate(() => document.querySelector('#deck-back .lab').textContent) === '元の位置に戻る', '左上の戻るボタンも「元の位置に戻る」');
    // 続けて別のしおりへ：戻る先は変わらない
    await p.evaluate(() => document.querySelector('#dt-cb [data-bm="1"]').click()); await settle(p);
    ok(await st(p) === '4:1', `続けて 2 つ目のしおり（結論の行のないスライドは最後のステップ。${await st(p)}）`);
    ok(await p.evaluate(() => DECK.links().depth) === 1, '続けて飛んでも戻るの跡は 1 つ');
    await p.evaluate(() => document.querySelector('#dt-cb [data-b="bmback"]').click()); await settle(p);
    ok(await st(p) === '1:1', `「元の位置に戻る」でしおりを使う前の位置へ（${await st(p)}）`);
    ok(!(await visible(p, '#dt-cb [data-b="bmback"]')), '戻ったら「元の位置に戻る」は消える');
    // Backspace
    await p.evaluate(() => document.querySelector('#dt-cb [data-bm="1"]').click()); await settle(p);
    await p.keyboard.press('Backspace'); await settle(p);
    ok(await st(p) === '1:1', `Backspace でも元の位置へ（${await st(p)}）`);
    // q：次のしおりへ、最後の次は元の位置へ
    await p.keyboard.press('q'); await settle(p);
    ok(await st(p) === '2:3', `q で次のしおり（${await st(p)}）`);
    await p.keyboard.press('q'); await settle(p);
    ok(await st(p) === '4:1', `もう一度 q で次のしおり（${await st(p)}）`);
    await p.keyboard.press('q'); await settle(p);
    ok(await st(p) === '1:1', `最後のしおりの次の q は、最初の q の前の位置へ（${await st(p)}）`);
    ok(await p.evaluate(() => DECK.links().depth) === 0, '戻りきると跡は空');
    // 最後のしおりより後で q：最初のしおりへ
    await p.evaluate(() => DECK.go(4, 0, false)); await settle(p);
    await p.keyboard.press('q'); await settle(p);
    ok(await st(p) === '2:3', `最後のしおりより後の q は最初のしおりへ（${await st(p)}）`);
    await p.keyboard.press('q'); await p.keyboard.press('q'); await settle(p);
    ok(await st(p) === '5:0', `一巡りすると q を押す前の位置へ（${await st(p)}）`);
    // キーの一覧
    await p.keyboard.press('?'); await settle(p);
    ok(await p.evaluate(() => [...document.querySelectorAll('.dt-row')].some((r) => r.textContent === 'q次のしおりへ（最後の次は元の位置へ）')), 'キーの一覧に q の行');
    await p.keyboard.press('Escape'); await settle(p);
    // 一覧（o）
    await p.keyboard.press('o'); await p.waitForSelector('#dt-ov');
    const caps = await p.evaluate(() => [...document.querySelectorAll('#dt-ov .dt-cell')].map((c) => (c.querySelector('.dt-bmk') || {}).textContent || ''));
    ok(JSON.stringify(caps) === JSON.stringify(['', 'しおり：質疑用', '', 'しおり：Figure', '']), `一覧の題の後ろにしおりの名前（${JSON.stringify(caps)}）`);
    ok(await p.evaluate(() => document.querySelectorAll('#dt-ov .dt-cell')[1].getAttribute('aria-label').includes('しおり：質疑用')), '一覧の縮図の名前にもしおり');
    await p.keyboard.press('Escape');
    // 印刷では見えない
    await p.evaluate(() => document.querySelector('#dt-cb').classList.add('show'));
    await p.emulateMedia({ media: 'print' });
    ok(!(await visible(p, '#dt-cb .dt-bm')) && !(await visible(p, '#dt-cb [data-bm="0"]')), '印刷ではしおりのボタンが出ない');
    await p.emulateMedia({ media: 'screen' });

    // ---- 発表者ビュー
    await p.evaluate(() => DECK.go(0, 0, false)); await settle(p);
    const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
    watch(pv, 'presenter');
    await pv.waitForLoadState(); await pv.waitForSelector('#pv-bm button[data-bm]', { timeout: scaled(10000) });
    const pb = await pv.evaluate(() => [...document.querySelectorAll('#pv-bm [data-bm]')].map((e) => [e.textContent, e.getAttribute('aria-label')]));
    ok(JSON.stringify(pb) === JSON.stringify([['質疑用', 'しおり：質疑用'], ['Figure', 'しおり：Figure']]), `発表者ビューにも同じしおりのボタン（${JSON.stringify(pb)}）`);
    ok(await pv.evaluate(() => document.getElementById('pv-bmback').hidden), '発表者ビューも初めは「元の位置に戻る」がない');
    await pv.click('#pv-bm [data-bm="1"]'); await settle(pv, 500);
    ok(await st(p) === '4:1', `発表者ビューのボタンで本体がしおりへ（${await st(p)}）`);
    await pv.waitForFunction(() => !document.getElementById('pv-bmback').hidden, null, { timeout: scaled(3000) }).catch(() => {});
    ok(!(await pv.evaluate(() => document.getElementById('pv-bmback').hidden)), '発表者ビューに「元の位置に戻る」');
    ok(await pv.evaluate(() => document.getElementById('pv-back').hidden), '発表者ビューの「戻る」は重ねて出さない');
    await pv.click('#pv-bmback'); await settle(pv, 500);
    ok(await st(p) === '1:0', `発表者ビューの「元の位置に戻る」（${await st(p)}）`);
    await pv.click('#pv-text'); await pv.keyboard.press('q'); await settle(pv, 500);
    ok(await st(p) === '2:3', `発表者ビューの q で次のしおり（${await st(p)}）`);
    await pv.keyboard.press('Backspace'); await settle(pv, 500);
    ok(await st(p) === '1:0', `発表者ビューの Backspace で元の位置へ（${await st(p)}）`);
    await pv.close();
    await p.close();
  }

  // ---- 英語のデッキ
  {
    const p = await open('en');
    const btns = await p.evaluate(() => [...document.querySelectorAll('#dt-cb .dt-bm [data-bm]')].map((e) => [e.textContent, e.getAttribute('aria-label')]));
    ok(JSON.stringify(btns) === JSON.stringify([['Q&A', 'Bookmark: Q&A'], ['Figure', 'Bookmark: Figure']]), `en: the bookmark buttons (${JSON.stringify(btns)})`);
    ok(await p.evaluate(() => document.querySelector('#dt-cb .dt-bm').getAttribute('aria-label')) === 'Bookmarks', 'en: the group is “Bookmarks”');
    await p.keyboard.press('q'); await settle(p);
    ok(await p.evaluate(() => document.querySelector('#dt-cb [data-b="bmback"]').getAttribute('aria-label')) === 'Back to where you were', 'en: “Back to where you were”');
    ok(await p.evaluate(() => document.querySelector('#deck-back .lab').textContent) === 'Back to where you were', 'en: the back button at the top left');
    await p.keyboard.press('?'); await settle(p);
    ok(await p.evaluate(() => [...document.querySelectorAll('.dt-row')].some((r) => r.textContent === 'qNext bookmark (after the last one, back to where you were)')), 'en: the q row in the key list');
    await p.keyboard.press('Escape');
    await p.keyboard.press('o'); await p.waitForSelector('#dt-ov');
    ok(await p.evaluate(() => document.querySelectorAll('#dt-ov .dt-cell')[1].querySelector('.dt-bmk').textContent) === 'Bookmark: Q&A', 'en: the overview shows “Bookmark: Q&A”');
    await p.close();
  }

  // ---- 動画（?mode=video）：しおりは出ず、q も動かない
  {
    const p = await open('ja', '?mode=video');
    ok(await p.evaluate(() => !document.querySelector('.dt-bm') && !document.querySelector('[data-bm]')), '動画にはしおりのボタンがない');
    ok(await p.evaluate(() => DECK.bookmarks().length === 0 && DECK.bookmark(0) === false), '動画では DECK.bookmarks() が空で、飛ばない');
    await p.keyboard.press('q'); await settle(p);
    ok(await st(p) === '1:0', `動画では q で動かない（${await st(p)}）`);
    await p.close();
  }

  // ---- しおりのないデッキ：帯にまとまりも区切りも足さず、キーの一覧に q の行もない
  {
    const p = await open('none');
    ok(await p.evaluate(() => !document.querySelector('.dt-bm') && ![...document.querySelectorAll('#dt-cb > .sep')].some((s) => s.nextElementSibling && s.nextElementSibling.classList.contains('sep'))), 'しおりのないデッキ：帯にしおりのまとまりがなく、区切りも重ならない');
    await p.keyboard.press('q'); await settle(p);
    ok(await st(p) === '1:0', `しおりのないデッキ：q で動かない（${await st(p)}）`);
    await p.keyboard.press('?'); await settle(p);
    ok(await p.evaluate(() => ![...document.querySelectorAll('.dt-row')].some((r) => r.textContent.startsWith('q'))), 'しおりのないデッキ：キーの一覧に q の行がない');
    await p.close();
  }
  // ---- 帯の見た目（--shots があれば撮る）
  if (SHOTS) {
    const p = await open('ja');
    await p.keyboard.press('q'); await settle(p, 600);
    await p.evaluate(() => document.querySelector('#dt-cb').classList.add('show'));
    await p.screenshot({ path: path.join(SHOTS, 'bookmarks-bar-ja.png') });
    await p.close();
  }
} finally {
  await b.close();
}
ok(errs.length === 0, 'エラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
if (fails) { console.log(`\n${fails} 件の失敗`); process.exit(1); }
console.log('\nall ok');
