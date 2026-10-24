// test-all: part of test-app
// 新規作成の画面いっぱいのページ・内容の欄とトークンの目安・長い教材の 2 回に分けた作り方（構成案 → 6 枚ずつ。kit/core/llm-outline.mjs）
//   testAppOutline({browser, BASE, ok, watch, shotDir})
//   画像（shotDir があれば）：new-page.png・new-content-budget.png・new-outline.png・outline-progress.png
import path from 'node:path';
import { replyOf } from './test-app-llm.mjs';
import { clickDlg } from './click-retry.mjs';

const head = (i) => `見出し ${i}`;
export function slidesOf(from, to, whole) {
  const secs = [];
  for (let i = from; i <= to; i++) secs.push(`<section class="slide"><h2>${head(i)}</h2><div class="body"><p>本文 ${i}</p></div><div class="concl"><span>まとめ ${i}</span></div></section>`);
  const narr = Array.from({ length: to - from + 1 }, (_, j) => `## ${head(from + j)}\n[0] これはスライド ${from + j} です。\n[concl] まとめ ${from + j} です。`).join('\n\n') + '\n';
  const deck = whole ? `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head>\n<meta charset="utf-8">\n<title>長い教材</title>\n</head>\n<body>\n<div id="stage">\n${secs.join('\n')}\n</div>\n</body>\n</html>\n` : secs.join('\n') + '\n';
  return { deck, narr: (whole ? '# 口述原稿：長い教材\n\n' : '') + narr };
}
const outlineReply = (k) => 'こちらが構成案です。\n\n```outline\n| 番号 | 見出し | 要点 |\n|---|---|---|\n' + Array.from({ length: k }, (_, i) => `| ${i + 1} | ${head(i + 1)} | 要点 ${i + 1} |`).join('\n') + '\n```\n';

export async function testAppOutline({ browser, BASE, ok, watch, shotDir }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  watch(page, 'outline');
  const shot = (name) => (shotDir ? page.screenshot({ path: path.join(shotDir, name) }) : null);
  const copied = () => page.evaluate(() => window.__APP_TEST.lastCopy || '');
  try {
    await page.goto(BASE + '?lang=ja');
    await page.waitForSelector('#drop');
    // 画面いっぱいのページ：見出し・「← 戻る」・Esc
    await page.click('#w-new');
    await page.waitForSelector('#dlg[open] #paste-text');
    const full = await page.evaluate(() => { const d = document.getElementById('dlg'), r = d.getBoundingClientRect(); return { page: d.classList.contains('page'), w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; });
    ok(full.page && full.w >= full.iw - 1 && full.h >= full.ih - 1 && await page.isVisible('#page-back') && (await page.textContent('#page-back')) === '← 戻る', `new page: 新規作成… is a full-screen page with 「← 戻る」 (${Math.round(full.w)}×${Math.round(full.h)})`);
    ok(await page.evaluate(() => document.activeElement && document.getElementById('dlg').contains(document.activeElement)) && (await page.$$eval('#dlg h2, #dlg h3', (xs) => xs.length)) >= 6, 'new page: the focus is in the page; a heading for the page and each step');
    await shot('new-page.png');
    await page.click('#page-back');
    await page.waitForSelector('#dlg[open]', { state: 'detached', timeout: 5000 }).catch(() => {});
    ok(!(await page.$('#dlg[open]')), 'new page: 「← 戻る」 leaves the page');
    await page.click('#w-new');
    await page.waitForSelector('#dlg[open] #paste-text');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok(!(await page.$('#dlg[open]')), 'new page: Esc leaves the page');
    // ③ 内容の欄とトークンの目安。8 枚までは 1 回で
    await page.click('#w-new');
    await page.waitForSelector('#dlg[open] #paste-content');
    ok((await page.textContent('label[for=paste-content]')) === '内容（要点・メモ・元の資料の文を貼る）', 'content: the large field 「内容（要点・メモ・元の資料の文を貼る）」 is in ③');
    await page.fill('#paste-a-topic', '二分探索');
    await page.fill('#paste-a-length', '8 枚');
    await page.fill('#paste-content', '・半分ずつ探す\n・並んでいることが前提');
    await page.waitForTimeout(200);
    const bud = await page.evaluate(() => { const b = document.getElementById('paste-budget'), t = document.getElementById('paste-pack-size'); return { text: b.textContent, tokens: +b.dataset.tokens, bytes: +b.dataset.bytes, total: +t.dataset.bytes, warn: b.classList.contains('warn') }; });
    ok(/トークン/.test(bud.text) && bud.bytes === bud.total && bud.tokens === Math.ceil(bud.bytes / 3) && !bud.warn && await page.isHidden('#paste-phase'), `content: next to it, the size and the token estimate use the same byte count as the total (${bud.text})`);
    await page.click('#paste-copy-guide');
    await page.waitForFunction(() => /^コピーしました/.test(document.getElementById('paste-copied').textContent));
    let c = await copied();
    ok(c.includes('## 内容（要点・メモ・元の資料）\n\n・半分ずつ探す\n・並んでいることが前提') && !c.includes('# まず構成案だけを返してください'), 'content: the content goes into the copied text; 8 slides stay single-shot (no outline request)');
    // 長い内容：80% を超えたら知らせる（止めない）
    await page.fill('#paste-content', 'あ'.repeat(30000));
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.getElementById('paste-budget').classList.contains('warn')) && /内容を要点だけにするか/.test(await page.textContent('#paste-budget')) && !(await page.isDisabled('#paste-copy-guide')), 'content: over about 80% of 32k tokens, a soft note says what to shorten (copying still works)');
    await page.evaluate(() => document.getElementById('paste-content').scrollIntoView({ block: 'center' }));
    await shot('new-content-budget.png');
    await page.fill('#paste-content', '・半分ずつ探す');
    // 24 枚：まず構成案
    await page.fill('#paste-a-length', '24 枚');
    await page.waitForTimeout(200);
    ok(await page.isVisible('#paste-phase') && /24 枚なので、2 回に分けて作ります/.test(await page.textContent('#paste-phase')), 'outline: with 24 slides, ③ says it is made in two passes');
    await page.click('#paste-copy-guide');
    await page.waitForFunction(() => /^コピーしました/.test(document.getElementById('paste-copied').textContent) && (window.__APP_TEST.lastCopy || '').includes('# まず構成案だけを返してください'));
    c = await copied();
    ok(c.includes('# まず構成案だけを返してください') && c.includes('24 枚') && c.indexOf('## 内容') < c.indexOf('# まず構成案') && c.includes('- テーマ：default'), 'outline: the copied request asks for an outline only, after the content and the theme');
    // 壊れた構成案は断る
    await page.fill('#paste-text', '```outline\n| 1 | 見出し 1 | x |\n');
    await clickDlg(page, '#dlg-import');
    await page.waitForSelector('#dlg[open] #paste-msg:not([hidden])');
    ok(/閉じていません/.test(await page.textContent('#paste-msg')), 'outline: an unclosed outline block is refused with a reason');
    await page.fill('#paste-text', outlineReply(24));
    await clickDlg(page, '#dlg-import');
    await page.waitForSelector('#dlg[open] #paste-step-outline');
    ok((await page.textContent('#paste-outline-got')) === '構成案を受け取りました（24 枚）。6 枚ずつ作ります' && (await page.$$eval('#paste-outline-list li', (x) => x.length)) === 24, 'outline: the parsed outline is shown with 「6 枚ずつ作ります」');
    await page.click('#paste-outline-copy');
    await page.waitForFunction(() => (window.__APP_TEST.lastCopy || '').includes('構成案の 1〜6 枚目'));
    c = await copied();
    ok(c.includes('ちょうど 6 枚') && c.includes('| 24 | 見出し 24 | 要点 24 |') && c.includes('<!DOCTYPE html>'), 'outline: the first batch asks for slides 1–6 (a whole deck.html), with the outline');
    await page.evaluate(() => document.getElementById('paste-step-outline').scrollIntoView({ block: 'start' }));
    await shot('new-outline.png');
    // 1〜6 枚目の返事で開く：outline.md（次は 7）と「残り 18 枚」
    const b1 = slidesOf(1, 6, true);
    await page.fill('#paste-text', replyOf(b1.deck, b1.narr));
    await clickDlg(page, '#dlg-import');
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.portable && s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: 30000 });
    await page.waitForSelector('#notice-outline', { timeout: 30000 });
    const ofile = () => page.evaluate(() => { const f = window.__APP_TEST.files(); const t = f && f['egatari.json'] ? new TextDecoder().decode(Uint8Array.from(atob(f['egatari.json']), (ch) => ch.charCodeAt(0))) : null; try { return t ? JSON.parse(t).studio.outline : null; } catch { return null; } });
    let of = await ofile();
    ok(of && of.next === 7 && of.rows.length === 24 && of.rows[23].heading === '見出し 24' && (await page.evaluate(() => window.__APP_TEST.state().portable.name)) === '長い教材.ega.html', 'outline: the first reply opens the lesson and stores the outline in egatari.json (studio.outline, next: 7)');
    ok(/構成案：残り 18 枚（全 24 枚）/.test(await page.textContent('#notice-outline')) && (await page.textContent('#b-outline-next')) === '次の 6 枚を頼む', 'outline: the notice shows 「残り 18 枚」 and 「次の 6 枚を頼む」');
    await shot('outline-progress.png');
    // 次の 6 枚：スライドの挿入の道（7〜12 枚目、構成案と前のスライド）
    await page.click('#b-outline-next');
    await page.waitForSelector('#dlg[open] #paste-batch-where');
    ok((await page.textContent('#dlg-title')) === '構成案の続き' && /7〜12 枚目（全 24 枚。残り 18 枚）/.test(await page.textContent('#paste-batch-where')), 'batch: 「次の 6 枚を頼む」 opens the insert dialog for slides 7–12 with the remaining count');
    await page.click('#paste-copy-guide');
    await page.waitForFunction(() => (window.__APP_TEST.lastCopy || '').includes('構成案の 7〜12 枚目'));
    c = await copied();
    ok(c.includes('ちょうど 6 枚') && c.includes('<h2>見出し 6</h2>') && c.includes('[0] これはスライド 6 です。') && !c.includes('<h2>見出し 5</h2>') && /\| 7 \| 見出し 7 \| 要点 7 \|\s+← 今回は 7〜12 枚目/.test(c), 'batch: the request carries the outline, the range and the previous slide (with its narration)');
    const b2 = slidesOf(7, 12, false);
    await page.fill('#paste-text', replyOf(b2.deck, b2.narr));
    await clickDlg(page, '#dlg-import');
    await page.waitForFunction(() => /残り 12 枚/.test((document.getElementById('notice-outline') || {}).textContent || ''), null, { timeout: 30000 });
    of = await ofile();
    const hs = await page.evaluate(() => (window.__APP_TEST.state().portable ? true : false));
    ok(of.next === 13 && hs, 'batch: after inserting slides 7–12, studio.outline says next: 13 and the notice 「残り 12 枚」');
  } finally { await ctx.close(); }
}
