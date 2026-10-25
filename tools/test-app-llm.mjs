// 編集アプリの AI のやり方（「新規作成…」「スライドの挿入…」「修正…」と「AI への修正依頼をコピー」。app/llm.js）の確認。tools/test-app.mjs が呼ぶ
// test-all: part of test-app（tools/test-app.mjs が読み込む。単独では走らせない）
//   testLlm({browser, BASE, ok, watch, shotDir})
// 使う人の場面を通して歩く試験（S1〜S7）は tools/test-app-newdeck.mjs。ここは仕組みの細かいところ：
// 1. 新規作成：どの欄にも名前・読み上げの領域・写す指示の大きさ・貼り付けの間違い（閉じていないコードブロック・関係のない文字・分けられないもの）と送り直しを頼む文
// 2. 台本の途中で切れた出力：スライドは受け取り、台本の欄に切れたことを出す → 送り直してもらった台本だけを台本の欄に → 作成（id・品質チェック 0 エラー）
// 3. スクリプトの入った出力：コードの確かめが出て、取り消せば開かない（前のデッキのまま）
// 4. 規格を破った出力 → 品質チェックのエラー → 修正依頼の文章 →「AI の出力を貼り付ける…」で修正の ③ → 直したスライドと台本を 2 つの欄に →［置き換える］
// 5. ほかのデッキ（見本の 1 ファイル・作業フォルダ）の置き換え・直したスライドだけ・台本だけ・修正依頼の ①・スライドの挿入
// 6. 新規作成の図の札・プラン（有料はすべての分野）・シード値（作るときに 1 回、修正で戻す、保存に残る）
// 画像（shotDir があれば）：paste-error.png・paste-cutoff.png・paste-opened.png・fix-check.png・fix-request.png・paste-replace.png・fix-replaced.png・revise.png・insert-ai.png・new-purposes-ja.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packWithRequest } from '../kit/core/llm-request.mjs';
import { packKb } from '../kit/core/llm-pack.mjs';
import { seedOf } from '../kit/core/new-deck.mjs';
import { clickUntil, clickDlg, clickCommand } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Windows の checkout では CRLF になることがあるので LF にそろえる（試験の正規表現と、textarea が CRLF を LF にすることに合わせる）
const worked = (n, f) => fs.readFileSync(path.join(ROOT, 'tools', 'llm-guide', 'worked', n, f), 'utf8').replace(/\r\n/g, '\n');

export function replyOf(deck, narration, { crlf = false, labels = ['html', 'markdown'] } = {}) {
  const t = `Here is your lesson.\n\n**deck.html**\n\`\`\`${labels[0]}\n${deck.trim()}\n\`\`\`\n\nAnd the narration:\n\n\`\`\`${labels[1]}\n${narration.trim()}\n\`\`\`\n\nLet me know if you want changes.\n`;
  return crlf ? t.replace(/\n/g, '\r\n') : t;
}
// 新規作成の ①〜③ に答えて ④ ⑤ を出す（S1〜S7 の歩き方は tools/test-app-newdeck.mjs）
export async function answerNew(p, { cat = 'teaching', sub = 'class', title = 'How binary search works' } = {}) {
  await p.waitForSelector('#dlg[open] #paste-step-kind');
  await p.check('#paste-cat-' + cat);
  if (sub) await p.check('#paste-sub-' + sub);
  await p.click('#paste-next-kind');
  await p.fill('#paste-title', title);
  await p.click('#paste-next-content');
  await p.click('#paste-next-theme');
  await p.waitForSelector('#paste-step-paste:not([hidden]) #paste-deck');
}

export async function testLlm({ browser, BASE, ok, watch, shotDir }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin }).catch(() => {});
  const page = await ctx.newPage();
  watch(page, 'llm');
  const shot = async (name, id) => { if (shotDir) { if (id) await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'start' }), id); await page.screenshot({ path: path.join(shotDir, name) }); } };
  const state = () => page.evaluate(() => window.__APP_TEST.state());
  const files = () => page.evaluate(() => { const f = window.__APP_TEST.files(); if (!f) return null; const d = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, d(v)])); });
  const discard = async () => { await page.waitForSelector('#dlg[open] #dlg-discard', { timeout: 30000 }); await clickDlg(page, '#dlg-discard'); };
  const waitPanel = () => page.waitForSelector('#panel:not([hidden]) #panel-body .sum', { timeout: 30000 });
  const st = (p = page) => p.evaluate(() => ({ deck: document.getElementById('paste-deck-st').textContent, narr: document.getElementById('paste-narr-st').textContent, off: document.getElementById('dlg-import').disabled }));
  const clip = (p = page) => p.evaluate(() => navigator.clipboard.readText().catch(() => '')).then((t) => t.replace(/\r\n/g, '\n'));
  await page.goto(BASE + '?lang=en');
  await page.waitForSelector('#drop');

  // ---------------------------------------------------------------- 1. 新規作成：名前・読み上げの領域・大きさ・貼り付けの間違い
  ok((await page.textContent('#w-new')) === 'New…' && !(await page.$('#w-paste')), 'llm: the welcome screen has “New…” (no separate AI entry)');
  await page.click('#w-new');
  await page.waitForSelector('#dlg[open] #paste-step-kind');
  const unlabelled = await page.$$eval('#dlg-body input, #dlg-body textarea, #dlg-body select', (xs) => xs.filter((x) => !x.labels?.length && !x.closest('label') && !x.getAttribute('aria-label')).map((x) => x.id));
  ok(!unlabelled.length, 'llm a11y: every field in the new-deck page has a label: ' + JSON.stringify(unlabelled));
  const live = await page.evaluate(() => ['paste-copied', 'paste-deck-st', 'paste-narr-st', 'paste-info', 'paste-structure', 'paste-go-note', 'paste-msg'].map((id) => (document.getElementById(id) || {}).getAttribute?.('role')));
  ok(live.join() === 'status,status,status,status,status,status,alert', 'llm a11y: the copy result, the field states, the notes and the note beside the button are status regions; errors are alerts: ' + live.join());
  await answerNew(page);
  // 写す指示の大きさは、写す文そのもの（UTF-8 のバイト数 / 1024）
  await page.evaluate(() => { window.__APP_TEST.lastCopy = null; });
  await page.click('#paste-copy-guide');
  await page.waitForFunction(() => window.__APP_TEST.lastCopy);
  const c0 = await page.evaluate(() => window.__APP_TEST.lastCopy);
  ok((await page.textContent('#paste-pack-size')) === `Instructions: ${packKb(c0)} KB` && c0.startsWith('# Instructions for the AI') && !c0.includes('For people.') && c0 === packWithRequest({ series: [], lang: 'en', request: c0.slice(c0.indexOf('# What I want')) }),
    'llm: the size shown is that of the copied text, which starts at “Instructions for the AI”');
  ok((await clip()) === c0, 'llm: the instructions are on the clipboard');
  // 閉じていないコードブロック（スライドの途中で切れた）：スライドの欄に知らせ、作成は押せない、送り直しを頼む文
  await page.fill('#paste-deck', 'Sure! Here is the deck:\n\n```deck.html\n<!DOCTYPE html>\n<html lang="en"><body><div id="stage">\n<section class="slide"><h2>Cut</h2>');
  let s = await st();
  ok(/^The code block from line 3 is not closed: the AI’s output was probably cut off\. Ask the AI to continue\.$/.test(s.deck) && s.off && await page.isVisible('#paste-copy-cutoff') && (await page.textContent('#paste-copy-cutoff')) === 'Copy a request to resend',
    'llm: an unclosed code block shows the reason under the slides field, keeps “Create” disabled and offers “Copy a request to resend”: ' + s.deck);
  await page.click('#paste-copy-cutoff');
  await page.waitForFunction(() => /^Copied/.test(document.getElementById('paste-cut-copied').textContent));
  ok(/Send the lesson again in a shorter form/.test(await clip()) && (await page.textContent('#paste-cut-copied')) === 'Copied. Paste it into the chat and send, then paste the AI’s output here.', 'llm: the resend request asks for a shorter lesson');
  await shot('paste-error.png', 'paste-step-paste');
  await page.fill('#paste-deck', 'I could not do it, sorry.');
  s = await st();
  ok(s.deck === 'No slides or script found. Copy the code blocks of the AI’s output with the copy button at the top right of each box, and paste them.' && s.off && await page.isVisible('#paste-copy-cutoff'), 'llm: unrelated text says neither was found and how to copy');
  await page.click('#paste-copy-cutoff');
  await page.waitForFunction(() => /no code blocks/.test(document.getElementById('paste-cut-copied').textContent) || true);
  ok(/Do not output files, a canvas or attachments/.test(await clip()), 'llm: no code blocks → the resend request asks for both blocks in the message body');
  await page.fill('#paste-deck', '<section class="slide"><h2>A</h2></section>\n\n## A\n[0] Hello.');
  ok(/so they cannot be separated/.test((await st()).deck), 'llm: slides and script mixed without ``` lines are refused as ambiguous');
  await page.fill('#paste-deck', '');
  ok((await st()).deck === 'Not pasted yet' && await page.isHidden('#paste-copy-cutoff'), 'llm: emptying the field starts over (no hidden state)');

  // ---------------------------------------------------------------- 2. 台本の途中で切れた出力 → 台本だけを送り直してもらう → 作成
  const bdeck = worked('business', 'deck.html'), bnarr = worked('business', 'narration.md');
  const cutReply = replyOf(bdeck, bnarr, { crlf: true }).replace(/\r\n```\r\n\r\nLet me know[\s\S]*$/, '').replace(/\[concl\] 次は[^\r]*$/, '[concl] 次は、伸びの');
  await page.fill('#paste-deck', cutReply);
  s = await st();
  ok(s.deck === '✓ 3 slides' && /^The code block from line \d+ is not closed/.test(s.narr) && s.off && await page.isVisible('#paste-copy-cutoff'), 'llm: an output cut off inside the script keeps the slides and says so under the script field: ' + JSON.stringify(s));
  await page.click('#paste-copy-cutoff');
  await page.waitForFunction(() => /Copied/.test(document.getElementById('paste-cut-copied').textContent));
  ok(/Send only the narration\.md block again/.test(await clip()), 'llm: the resend request asks only for the script block');
  await shot('paste-cutoff.png', 'paste-step-paste');
  await page.fill('#paste-narr', 'Here is the narration again:\n\n```narration.md\n' + bnarr.trim() + '\n```\n');
  s = await st();
  ok(s.narr === '✓ Script, 3 sections' && !s.off, 'llm: the resent script block fills the script field; “Create” is enabled');
  await clickDlg(page, '#dlg-import');
  await page.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().loads > 0, null, { timeout: 30000 });
  await waitPanel();
  const st2 = await state();
  let F = await files();
  const ids = [...F['deck.html'].matchAll(/<section class="slide[^"]*" id="(s-[a-z2-7]{6})"/g)].map((m) => m[1]);
  ok(st2.portable && st2.portable.name === '配送センターの改善報告（架空）.ega.html' && st2.portable.dirty && st2.portable.rightsOk, `llm: the output opens as a new unsaved single file (${st2.portable && st2.portable.name}, no rights prompt)`);
  ok(ids.length === 3 && ids.every((id) => F['narration.md'].includes(`{#${id}}`)) && !F['deck.html'].includes('\r'), `llm: ids added to all 3 slides and the script headings (${ids.join(', ')})`);
  ok(/^0 errors/.test(await page.textContent('#panel-body .sum')), 'llm: the quality check runs after creating and reports no errors');
  let docId1 = st2.portable.docId;
  await shot('paste-opened.png');

  // ---------------------------------------------------------------- 3. スクリプトの入った出力 → コードの確かめ
  const evil = bdeck.replace('</body>', '<script>window.__pastedRan = true;</script>\n</body>');
  await clickCommand(page, '#b-new');
  await answerNew(page);
  ok((await page.textContent('#b-new')) === 'New…' && !(await page.$('#b-paste')) && !(await page.$('#b-fiximport')), 'llm: the menu has “New…” (no separate AI import entries)');
  await page.fill('#paste-deck', replyOf(evil, bnarr));
  await clickDlg(page, '#dlg-import');
  await discard();
  await page.waitForSelector('#dlg[open] #dlg-run', { timeout: 30000 });
  ok(/script/i.test(await page.textContent('#dlg-body')), 'llm: a pasted output with a script asks before running the code (like an opened file)');
  await clickDlg(page, '#dlg-cancel');
  await page.waitForTimeout(400);
  ok((await state()).portable.docId === docId1, 'llm: cancelling the code prompt keeps the previous deck open');

  // ---------------------------------------------------------------- 4. 規格を破った出力 → 修正依頼 → 置き換え
  const bad = bdeck.replace('<h2>導入から 3 か月の結果</h2>', '<h2>新しい仕分けの手順を入れてから 3 か月がたった今の結果のまとめ</h2>');
  const badN = bnarr.replace('## 導入から 3 か月の結果', '## 新しい仕分けの手順を入れてから 3 か月がたった今の結果のまとめ')
    .replace('[concl] 件数が増えても', '[4] {1-η|いちマイナスイータ} は使わない例です。\n[concl] 件数が増えても');
  await clickUntil(page, '#panel-close', () => page.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 2500 }));
  await clickCommand(page, '#b-new');
  await answerNew(page);
  await page.fill('#paste-narr', replyOf(bad, badN, { labels: ['html title="deck.html"', 'md'] }));
  await clickDlg(page, '#dlg-import');
  await discard();
  await page.waitForFunction((d) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.docId !== d; }, docId1, { timeout: 30000 });
  await waitPanel();
  const sum2 = await page.textContent('#panel-body .sum');
  const items = await page.$$eval('#panel-body .res', (xs) => xs.map((x) => x.textContent));
  ok(/^[1-9]\d* errors/.test(sum2) && items.some((t) => /title is .*max 26/.test(t)) && items.some((t) => /narration \[4\] has no matching step.*valid keys are \[0\]/.test(t)) && items.some((t) => /reads an expression/.test(t)),
    'llm: the quality check reports the long title, the orphan [4] and the expression reading: ' + sum2);
  { const bd = await page.evaluate(() => window.__APP_TEST.badge()); ok(bd.errs > 0 && bd.bad && !bd.hidden, `llm: with errors, the Quality check badge shows the counts (“${bd.text}”)`); }
  const note2 = await page.textContent('#panel-body .hint');
  ok(/^The browser quality checker/.test(note2) && /If there are errors, press “Copy a fix request for your AI” below/.test(note2), 'llm: with errors, the quality check note points to the fix request button: ' + note2);
  ok((await page.textContent('#panel-body #b-revise')) === 'Revise…' && (await page.textContent('#panel-body #b-fixreq')) === 'Copy a fix request for your AI', 'llm: the quality check panel starts with “Revise…” next to the fix request button');
  await shot('fix-check.png');
  const docId2 = (await state()).portable.docId;
  await page.click('#b-fixreq');
  await page.waitForSelector('#dlg[open] #fix-text');
  const req = await page.inputValue('#fix-text');
  ok(req.includes('R-title') && /\*\*R-title\*\* Heading: Japanese at most 26 units/.test(req) && req.includes('R-narr-steps') && req.includes('R-reading') && req.includes('````deck.html') && req.includes('{#s-'),
    'llm: the fix request names the errors, quotes their rules from the guide and includes the current files');
  ok(req.includes('## Components used in this deck') && req.includes('### `<m-kpi>`') && req.includes('### `<m-bars>`') && !req.includes('### `<m-sweep>`'), 'llm: the fix request includes the notes of the components the deck uses');
  ok((await clip()) === req, 'llm: the fix request is on the clipboard');
  ok(/narration \[4\] has no matching step on the slide \(narration\.md line/.test(req) && /Lines to change: line \d+: “\[4\]/.test(req), 'llm: the fix request quotes the orphan narration lines');
  ok(/^Copied \d+ finding\(s\), their rules and the current slides and script\. Paste it into the same chat and send, then paste the AI’s output in step 3 of “Revise…”\.$/.test(await page.textContent('#fix-lead')), 'llm: the fix request dialog says where the output goes: ' + await page.textContent('#fix-lead'));
  await shot('fix-request.png');
  F = await files();
  const sid = F['deck.html'].match(/<section class="slide" id="(s-[a-z2-7]{6})">\s*<h2>新しい仕分け/)[1];
  const fixedSec = bdeck.match(/<section class="slide">\s*<h2>導入から 3 か月の結果<\/h2>[\s\S]*?<\/section>/)[0].replace('<section class="slide">', `<section class="slide" id="${sid}">`);
  const fixedNarr = bnarr.match(/## 導入から 3 か月の結果\n[\s\S]*?(?=\n## |\s*$)/)[0].replace('## 導入から 3 か月の結果', `## 導入から 3 か月の結果 {#${sid}}`);
  ok((await page.textContent('#dlg-paste')) === 'Paste the AI’s output…', 'llm: the fix request dialog leads to “Paste the AI’s output…”');
  await clickDlg(page, '#dlg-paste');
  await page.waitForSelector('#dlg[open] #paste-deck');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'paste-deck');
  ok((await page.textContent('#dlg-title')) === 'Revise' && await page.$('#paste-wish') && (await page.textContent('#dlg-import')) === 'Replace' && (await page.textContent('#ai-howto')) === 'Write what to change to make a fix request for a chat AI. Paste the AI’s output here and the slides are replaced.',
    'llm: “Paste the AI’s output…” opens Revise with the focus in the slides field');
  await page.fill('#paste-deck', fixedSec);
  await page.fill('#paste-narr', fixedNarr);
  s = await st();
  ok(s.deck === '✓ 1 slide' && s.narr === '✓ Script, 1 section' && !s.off, 'llm fix import: the fixed slide and its script in the two fields');
  await shot('paste-replace.png', 'paste-step-paste');
  await page.evaluate(() => { document.getElementById('panel').hidden = true; });
  await clickDlg(page, '#dlg-import');
  await waitPanel();
  const st4 = await state();
  F = await files();
  ok(st4.portable.docId === docId2 && F['deck.html'].includes(`id="${sid}">\n  <h2>導入から 3 か月の結果`) && !F['narration.md'].includes('[4]') && F['narration.md'].includes(`## 導入から 3 か月の結果 {#${sid}}`) && st4.portable.dirty,
    `llm: replacing with the fixed slide keeps the docId (${docId2}), replaces only that slide and its script, and leaves the file unsaved`);
  ok(/^0 errors/.test(await page.textContent('#panel-body .sum').catch(() => '')), 'llm: after the fix the quality check reports no errors');
  await shot('fix-replaced.png');

  // ---------------------------------------------------------------- 5. ほかのデッキの置き換え・修正依頼の ①・スライドの挿入
  await testReplace({ ctx, BASE, ok, watch, bdeck, bnarr, shotDir });

  // ---------------------------------------------------------------- 6. 図の札・プラン・シード値（ja）
  {
    const pk = await ctx.newPage();
    watch(pk, 'llm-new');
    await pk.goto(BASE + '?lang=ja');
    await pk.waitForSelector('#drop');
    await pk.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; }, readText: async () => window.__copied || '' } }); });
    await pk.click('#w-new');
    await answerNew(pk, { cat: 'research', sub: 'conference', title: '研究の進め方' });
    const copy = async () => { await pk.evaluate(() => { window.__copied = null; }); await pk.click('#paste-copy-guide'); await pk.waitForFunction(() => window.__copied !== null); return pk.evaluate(() => window.__copied); };
    const mats = await pk.$$eval('#paste-materials li', (xs) => xs.map((x) => [x.textContent, !!x.querySelector('button,input')]));
    ok(mats.map((m) => m[0]).join() === '表,画像,数式,図形' && mats.every((m) => !m[1]), 'new materials: 表・画像・数式・図形 are always available (not toggles)');
    await pk.click('#paste-purposes-fold-h');
    const tiles = await pk.$$eval('#paste-purposes button.tile', (xs) => xs.map((x) => [x.getAttribute('aria-pressed'), x.querySelector('.tile-label').textContent]));
    ok(tiles.length === 14 && tiles.every((t) => t[0] === 'true') && (await pk.textContent('#paste-purposes-hint')) === '今は全部使えます。押した図は、AI が使いません' && (await pk.textContent('#paste-purposes-sum')) === '言いたいこと：14 個のうち 14 個を使う',
      'new purposes: 14 tiles, all in use, and the hint 「押した図は、AI が使いません」');
    const c1 = await copy();
    ok(c1.includes('- 場面：研究発表／学会の口頭発表\n- 構成の型：背景 → 目的') && c1.includes('### `<m-flow>`') && !c1.includes('使わない言いたいこと'), 'new copy: the request has the setting and its structure; with all figures in use, every part is described');
    const size1 = +(await pk.getAttribute('#paste-pack-size', 'data-bytes'));
    await pk.click('#paste-purpose-process');
    await pk.click('#paste-purpose-contents');
    const offStyle = await pk.$eval('#paste-purpose-process', (b) => ({ o: +getComputedStyle(b).opacity, deco: getComputedStyle(b.querySelector('.tile-label')).textDecorationLine, pressed: b.getAttribute('aria-pressed') }));
    ok(offStyle.pressed === 'false' && offStyle.o < 1 && offStyle.deco.includes('line-through') && (await pk.textContent('#paste-parts-count')) === '使える図：1 種類（外したもの 2）',
      'new purposes: a tile turned off is aria-pressed=false, faded and struck through; the fold counts the parts turned off');
    const c2 = await copy();
    const size2 = +(await pk.getAttribute('#paste-pack-size', 'data-bytes'));
    ok(!c2.includes('### `<m-flow>`') && !c2.includes('| `<m-menu>` |') && c2.includes('- 使わない言いたいこと（作者が外した）：手順・工程・目次。その表し方（`m-flow`・`m-menu`）は使わない') && size2 < size1,
      `new copy: the figures turned off leave the copied pack and the request says so (${size1} → ${size2} bytes)`);
    if (shotDir) { await pk.evaluate(() => document.getElementById('paste-purposes').scrollIntoView({ block: 'start' })); await pk.screenshot({ path: path.join(shotDir, 'new-purposes-ja.png') }); }
    await pk.check('#paste-plan-paid');
    const c3 = await copy();
    const size3 = +(await pk.getAttribute('#paste-pack-size', 'data-bytes'));
    ok(c3.includes('### `<m-timeline>`') && c3.includes('`<m-kanbun>`') && !c3.includes('### `<m-flow>`') && size3 > size2, `new plan: the paid plan copies every series and the paid-only parts, still without the figures turned off (${size2} → ${size3} bytes)`);
    // 写した後に札を変えても、egatari.json に残すのは写したときの選び方
    await pk.click('#paste-purpose-timeline');
    await pk.fill('#paste-narr', replyOf(worked('kokugo', 'deck.html').replace('<html ', '<html data-egatari-seed="42" '), worked('kokugo', 'narration.md')));
    await clickDlg(pk, '#dlg-import');
    await pk.waitForFunction(() => { const s = window.__APP_TEST.state(); return s && s.portable; }, null, { timeout: 30000 });
    const filesOf = () => pk.evaluate(() => { const f = window.__APP_TEST.files(); const d = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, d(v)])); });
    const F1 = await filesOf();
    const seed = seedOf(F1['deck.html']);
    const nd = JSON.parse(F1['egatari.json'] || '{}').studio?.newDeck;
    ok(Number.isInteger(seed) && seed !== 42 && (F1['deck.html'].match(/data-egatari-seed/g) || []).length === 1 && JSON.stringify(nd) === JSON.stringify({ v: 1, plan: 'paid', category: 'research', subcategory: 'conference', subjects: [], purposesOff: ['contents', 'process'] }),
      `new create: a fresh seed is written once on <html> (${seed}; the output's 42 is replaced) and the choices copied are kept in studio.newDeck (not the tile changed after copying)`);
    // 修正…：出力が <html> を書き直してシード値を落としても、前のシード値のまま
    await pasteReplace(pk, replyOf(worked('kokugo', 'deck.html').replace('<title>', '<title>改 '), worked('kokugo', 'narration.md')));
    await pk.waitForFunction(() => { const f = window.__APP_TEST.files(); return f && new TextDecoder().decode(Uint8Array.from(atob(f['deck.html']), (c) => c.charCodeAt(0))).includes('<title>改 '); }, null, { timeout: 30000 });
    const F2 = await filesOf();
    ok(seedOf(F2['deck.html']) === seed, `new revise: a revised deck without the seed keeps the earlier seed (${seedOf(F2['deck.html'])})`);
    await pk.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('seed-' + Date.now() + '.ega.html', { create: true }); });
    const sv = pk.evaluate(() => window.__APP_TEST.save('save'));
    const which = await Promise.race([sv.then(() => 'saved'), pk.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 }).then(() => 'tierB')]);
    if (which === 'tierB') await clickDlg(pk, '#dlg-rebuild');
    await sv;
    const saved = await pk.evaluate(async () => (await (await window.__APP_TEST.saveHandle.getFile()).text()));
    ok(seedOf(saved) === seed && seedOf((await filesOf())['deck.html']) === seed, 'new save: the saved single file carries the same seed');
    await pk.close();
  }
  await ctx.close();
}

// 貼り付けの窓から「今のデッキを置き換える」で取り込み、品質チェックの板の結果（.sum か、確かめられなかった言葉）を返す
// 「修正…」は道具の列の「スライド ▾」にある（品質チェックの板の先頭にもある。そちらは上の試験で確かめる）
async function openRevise(p, sel = '#paste-deck') {
  await clickCommand(p, '#b-revise-cmd');
  await p.waitForSelector('#dlg[open] ' + sel, { timeout: 10000 });
}
// field：貼る欄（'deck' か 'narr'。出力の全体はどちらでもよい）
async function pasteReplace(p, text, { field = 'deck' } = {}) {
  await openRevise(p);
  await p.evaluate(() => { document.getElementById('panel').hidden = true; });
  await p.fill(field === 'deck' ? '#paste-deck' : '#paste-narr', text);
  const t0 = Date.now();
  await clickDlg(p, '#dlg-import');
  await p.waitForFunction(() => { const b = document.getElementById('panel-body'); return !document.getElementById('panel').hidden && b && (b.querySelector('.sum') || /did not answer/.test(b.textContent)); }, null, { timeout: 40000 });
  return { sum: await p.evaluate(() => { const s = document.querySelector('#panel-body .sum'); return s ? s.textContent : document.getElementById('panel-body').textContent; }), ms: Date.now() - t0 };
}
// プレビューに今出ている見出し（want が出るまで待つ）
async function previewHeadings(p, want) {
  // プレビューは sandbox（origin を持たない）なので、ページからは中を読めない。Playwright の frame で読む
  const read = async () => {
    const f = p.frames().find((x) => x.parentFrame() === p.mainFrame());
    return f ? f.evaluate(() => [...document.querySelectorAll('section.slide h2')].map((h) => h.textContent.trim())).catch(() => null) : null;
  };
  for (let t0 = Date.now(); Date.now() - t0 < 20000; await p.waitForTimeout(100)) {
    const h = await read();
    if (h && h.includes(want)) return h;
  }
  return read();
}
const sectionOf = (deck, heading) => {
  const id = deck.match(new RegExp(`<section class="slide" id="(s-[a-z2-7]{6})">\\s*<h2>${heading}`))[1];
  return deck.match(new RegExp(`<section class="slide" id="${id}">[\\s\\S]*?</section>`))[0];
};

async function testReplace({ ctx, BASE, ok, watch, bdeck, bnarr, shotDir }) {
  const ex = fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8');
  const exN = fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'narration.md'), 'utf8');
  const reply = replyOf(bdeck, bnarr);
  // 5a. 1 ファイル（見本の minimal.ega.html）
  {
    const p = await ctx.newPage();
    watch(p, 'llm-replace-portable');
    await p.goto(BASE + '?lang=en');
    await p.waitForSelector('#drop');
    ok(await p.evaluate(async () => { const u = new Uint8Array(await (await fetch('examples/minimal.ega.html')).arrayBuffer()); return window.__APP_TEST.openFile({ bytes: u, name: 'minimal.ega.html' }); }) === true, 'llm replace: opened the minimal example as a single file');
    await p.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.allowed && s.frameLoaded === s.loads && s.pos; }, null, { timeout: 30000 });
    const docId = (await p.evaluate(() => window.__APP_TEST.state())).portable.docId;
    const r = await pasteReplace(p, reply);
    ok(/^0 errors/.test(r.sum) && r.ms < 15000, `llm replace (single file): replacing with another deck runs the quality check on the new preview (${r.ms} ms): ${r.sum}`);
    const st = await p.evaluate(() => window.__APP_TEST.state());
    const h = await previewHeadings(p, '導入から 3 か月の結果');
    ok(st.portable.docId === docId && st.portable.dirty && h && h.includes('導入から 3 か月の結果') && !h.includes('更新の式'), 'llm replace (single file): the docId stays, the file is unsaved and the preview shows the new deck: ' + JSON.stringify(h));
    // 直したスライドだけの返事（id で戻す）
    const F = await p.evaluate(() => new TextDecoder().decode(Uint8Array.from(atob(window.__APP_TEST.files()['deck.html']), (c) => c.charCodeAt(0))));
    const r2 = await pasteReplace(p, '```deck.html\n' + sectionOf(F, '拠点ごとの').replace('拠点ごとの 1 日の出荷', '拠点ごとの出荷') + '\n```\n');
    const h2 = await previewHeadings(p, '拠点ごとの出荷');
    ok(/^0 errors/.test(r2.sum) && h2 && h2.includes('拠点ごとの出荷') && h2.includes('導入から 3 か月の結果'), `llm replace (single file): a reply with one slide replaces just that slide and the quality check answers (${r2.ms} ms): ${r2.sum}`);
    // 口述原稿だけの直し（囲みの中身だけ、id 付きの節 1 つ）→「これだけで取り込む」：その節だけが替わる
    const N0 = await p.evaluate(() => new TextDecoder().decode(Uint8Array.from(atob(window.__APP_TEST.files()['narration.md']), (c) => c.charCodeAt(0))));
    const sec = N0.match(/## 拠点ごとの[^\n]*\{#s-[a-z2-7]{6}\}\n[\s\S]*?(?=\n## |\s*$)/)[0];
    const sec2 = sec.replace(/^\[0\] .*$/m, '[0] 拠点ごとの出荷を、直した口述原稿で読みます。');
    const r3 = await pasteReplace(p, sec2, { field: 'narr' });
    const N1 = await p.evaluate(() => new TextDecoder().decode(Uint8Array.from(atob(window.__APP_TEST.files()['narration.md']), (c) => c.charCodeAt(0))));
    ok(/^0 errors/.test(r3.sum) && N1.includes('[0] 拠点ごとの出荷を、直した口述原稿で読みます。') && N1.replace(sec2, sec) === N0, `llm replace (single file): a script-only fix pasted into the script field replaces just that section (the slides stay): ${r3.sum}`);
    // 保存：置き換えた中身が 1 ファイルに入り、保存していない印が消える
    await p.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('replaced-' + Date.now() + '.ega.html', { create: true }); });
    const sv = p.evaluate(() => window.__APP_TEST.save('save'));
    const which = await Promise.race([sv.then(() => 'saved'), p.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 }).then(() => 'tierB')]);
    if (which === 'tierB') await clickDlg(p, '#dlg-rebuild');
    await sv;
    const saved = await p.evaluate(async () => (await (await window.__APP_TEST.saveHandle.getFile()).text()));
    const st2 = await p.evaluate(() => window.__APP_TEST.state());
    ok(!st2.portable.dirty && saved.includes('拠点ごとの出荷') && saved.includes('導入から 3 か月の結果') && !saved.includes('<h2>更新の式</h2>'), `llm replace (single file): Save writes the replaced deck and clears the unsaved mark (tier ${st2.portable.lastTier})`);
    await p.close();
  }
  // 5b. 作業フォルダ（OPFS に examples/minimal を写す）：置き換えは deck.html・narration.md に書いて組み直す（書いたものがそのまま保存）
  {
    const p = await ctx.newPage();
    watch(p, 'llm-replace-folder');
    await p.goto(BASE + '?lang=en');
    await p.waitForSelector('#drop');
    await p.evaluate(async ([d, n]) => {
      const root = await navigator.storage.getDirectory();
      const top = await root.getDirectoryHandle('replace-' + Date.now(), { create: true });
      for (const [k, v] of [['deck.html', d], ['narration.md', n]]) { const w = await (await top.getFileHandle(k, { create: true })).createWritable(); await w.write(v); await w.close(); }
      window.__rdir = top;
      window.__APP_TEST.open(top);
    }, [ex, exN]);
    await p.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.open && s.allowed && s.frameLoaded === s.loads && s.pos; }, null, { timeout: 30000 });
    const read = (rel) => p.evaluate(async (rel) => (await (await window.__rdir.getFileHandle(rel)).getFile()).text(), rel);
    const r = await pasteReplace(p, reply);
    ok(/^0 errors/.test(r.sum) && r.ms < 15000, `llm replace (working folder): replacing with another deck runs the quality check on the rebuilt preview (${r.ms} ms): ${r.sum}`);
    const h = await previewHeadings(p, '導入から 3 か月の結果');
    const D = await read('deck.html'), N = await read('narration.md');
    ok(h && h.includes('導入から 3 か月の結果') && !h.includes('更新の式') && D.includes('<h2>導入から 3 か月の結果</h2>') && !D.includes('更新の式') && /## 導入から 3 か月の結果 \{#s-[a-z2-7]{6}\}/.test(N),
      'llm replace (working folder): deck.html and narration.md are written and the preview shows the new deck: ' + JSON.stringify(h));
    const r2 = await pasteReplace(p, '```deck.html\n' + sectionOf(D, '拠点ごとの').replace('拠点ごとの 1 日の出荷', '拠点ごとの出荷') + '\n```\n');
    const h2 = await previewHeadings(p, '拠点ごとの出荷');
    const D2 = await read('deck.html');
    ok(/^0 errors/.test(r2.sum) && h2 && h2.includes('拠点ごとの出荷') && D2.includes('<h2>拠点ごとの出荷</h2>') && D2.includes('<h2>導入から 3 か月の結果</h2>'),
      `llm replace (working folder): a reply with one slide replaces just that slide in deck.html and the quality check answers (${r2.ms} ms): ${r2.sum}`);
    // 結果が 0 件でも、説明の文は途中で切れず、エラーがあれば修正依頼のボタンが出ることを言う
    const note0 = await p.textContent('#panel-body .hint');
    ok(/^The browser quality checker \(size, length, missing narration, color contrast\)\.( |$)/.test(note0) && /“Copy a fix request for your AI”/.test(note0) && /appears here/.test(note0) && !/npm run check/.test(note0) && !(await p.$('#b-fixreq')),
      'llm quality check: with no results, the note says the fix request button appears when there are errors: ' + note0);

    // ---------------------------------------------------------------- 5c. 修正…：① 直してほしいこと・開いているメモ（comments.json）が修正依頼に入る。直すことがなければそう言う
    await openRevise(p, '#paste-wish');
    ok((await p.textContent('#dlg-title')) === 'Revise' && /^Write what to change to make a fix request/.test(await p.textContent('#ai-howto')) && !(await p.$('#dlg-body input[type=radio]')),
      'llm revise: “Revise…” opens “Revise” with the explanation first and no mode choice');
    await p.click('#paste-copy-guide');
    await p.waitForFunction(() => /^Nothing to fix was found/.test(document.getElementById('paste-copied').textContent), null, { timeout: 20000 });
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'paste-wish'), 'llm revise: with no findings, notes or wishes, it says there is nothing to fix and moves to step 1');
    await clickDlg(p, '#dlg-cancel');
    await p.evaluate(async () => {
      const list = [{ id: 'c1', key: '', quote: '3 か月', comment: 'Use a bar chart here', status: 'open' }, { id: 'c2', key: '', quote: '', comment: 'Already done', status: 'resolved' }];
      const w = await (await window.__rdir.getFileHandle('comments.json', { create: true })).createWritable(); await w.write(JSON.stringify(list)); await w.close();
    });
    await openRevise(p, '#paste-wish');
    await p.fill('#paste-wish', 'Make the second slide shorter');
    await p.click('#paste-copy-guide');
    await p.waitForFunction(() => /^Copied/.test(document.getElementById('paste-copied').textContent), null, { timeout: 20000 });
    const rev = (await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))).replace(/\r\n/g, '\n');
    ok(rev.includes('## What I want changed\n\nMake the second slide shorter') && rev.includes('## Open notes (comments)') && rev.includes('“3 か月”: Use a bar chart here') && !rev.includes('Already done') && rev.includes('````deck.html') && /1 comment\(s\)/.test(await p.textContent('#paste-copied')),
      'llm revise: the fix request has what to change, the open notes (not resolved ones) and the current files');
    if (shotDir) await p.screenshot({ path: path.join(shotDir, 'revise.png') });
    await clickDlg(p, '#dlg-cancel');

    // ---------------------------------------------------------------- 5d. スライドの挿入…：スライド一覧で選んだスライドの後ろに、チャットの AI に書いてもらう
    const D3 = await read('deck.html');
    const ids3 = [...D3.matchAll(/<section class="slide[^"]*" id="(s-[a-z2-7]{6})"/g)].map((m) => m[1]);
    const heads3 = [...D3.matchAll(/<section class="slide[^"]*" id="s-[a-z2-7]{6}">[\s\S]*?<h[12][^>]*>([^<]*)</g)].map((m) => m[1].trim());
    await clickUntil(p, '#b-slides', () => p.waitForSelector('#slides:not([hidden]) #sl-o-0', { timeout: 2500 }));
    await p.click('#sl-o-0');
    await clickUntil(p, '#sl-add', () => p.waitForSelector('#sl-add-menu:not([hidden])', { timeout: 2500 }));
    ok((await p.textContent('#sl-add')) === 'Insert slide ▾' && (await p.textContent('#sl-add-tpl-h')) === 'From a template' && (await p.textContent('#sl-add-ai')) === 'Have a chat AI write it…' && await p.$('#sl-add-title-body'),
      'llm insert: the slide list’s “Insert slide ▾” offers From a template (the slide templates) and Have a chat AI write it');
    await p.click('#sl-add-ai');
    await p.waitForSelector('#dlg[open] #paste-insert-n');
    ok((await p.textContent('#dlg-title')) === 'Insert slides' && (await p.textContent('#paste-insert-where')) === `Insert after slide 1, “${heads3[0]}”` && /^Describe the slides to add/.test(await p.textContent('#ai-howto'))
      && !(await p.isChecked('#paste-with-pack')) && await p.isHidden('#paste-pack-parts') && !(await p.$('#dlg-body input[type=radio]')) && (await p.textContent('#dlg-import')) === 'Insert',
      'llm insert: the dialog says where (after the selected slide 1), explains first, has no mode choice, and leaves the instructions out by default');
    await p.fill('#paste-insert-n', '2');
    await p.fill('#paste-insert-wish', 'one worked example');
    await p.click('#paste-copy-guide');
    await p.waitForFunction(() => /^Copied/.test(document.getElementById('paste-copied').textContent));
    const insReq = (await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))).replace(/\r\n/g, '\n');
    const other = (i) => D3.match(new RegExp(`<section class="slide[^"]*" id="${ids3[i]}">[\\s\\S]*?</section>`))[0];
    ok(insReq.startsWith('# Please add slides') && insReq.includes(`the next 2 slides, after slide 1, “${heads3[0]}”`) && insReq.includes('- What to add: one worked example') && heads3.every((h, i) => insReq.includes(`${i + 1}. ${h}`))
      && insReq.includes(other(0)) && !insReq.includes(other(1)) && !insReq.includes(other(2)) && !insReq.includes('Instructions for the AI') && insReq.length < D3.length,
      `llm insert: the request asks for the next 2 slides after slide 1 with only the heading list and that slide (not the whole deck; ${insReq.length} vs ${D3.length} characters)`);
    await p.check('#paste-with-pack');
    ok(await p.isVisible('#paste-pack-parts'), 'llm insert: ticking “Send to a different chat” shows the subjects');
    await p.click('#paste-copy-guide');
    await p.waitForFunction((c) => navigator.clipboard.readText().then((t) => t.replace(/\r\n/g, '\n') !== c).catch(() => false), insReq);
    const insPack = (await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))).replace(/\r\n/g, '\n');
    ok(insPack.startsWith('# Instructions for the AI') && insPack.endsWith(insReq) && !insPack.includes('# What I want'), 'llm insert: with the instructions, the pack comes first and the insert request replaces “What I want” at the end');
    await p.uncheck('#paste-with-pack');
    if (shotDir) await p.screenshot({ path: path.join(shotDir, 'insert-ai.png') });
    // 出力：コードブロックを 1 つずつ（それぞれの欄に）。id のないスライド 2 枚
    const newDeck = '<section class="slide">\n  <h2>Worked example</h2>\n  <div class="body"><p>Step by step.</p></div>\n  <div class="concl"><span>Done.</span></div>\n</section>\n\n<section class="slide noconcl">\n  <h2>Try it</h2>\n  <div class="body"><p>Your turn.</p></div>\n</section>';
    const newNarr = '## Worked example\n[0] Here is a worked example.\n[concl] That is all.\n\n## Try it\n[0] Now try it yourself.';
    await p.fill('#paste-deck', newDeck);
    ok((await p.textContent('#paste-deck-st')) === '✓ 2 slides' && !(await p.isDisabled('#dlg-import')) && (await p.textContent('#paste-go-note')) === 'They will be inserted without a script (you can write one later).', 'llm insert: with the slides alone, “Insert” is enabled and says they go in without a script');
    await p.fill('#paste-narr', newNarr);
    await p.evaluate(() => { document.getElementById('panel').hidden = true; });
    await clickDlg(p, '#dlg-import');
    await p.waitForFunction(() => { const b = document.getElementById('panel-body'); return !document.getElementById('panel').hidden && b && b.querySelector('.sum'); }, null, { timeout: 40000 });
    const D4 = await read('deck.html'), N4 = await read('narration.md');
    const ids4 = [...D4.matchAll(/<section class="slide[^"]*" id="(s-[a-z2-7]{6})"/g)].map((m) => m[1]);
    ok(ids4.length === 5 && ids4[0] === ids3[0] && ids4[3] === ids3[1] && ids4[4] === ids3[2] && new Set(ids4).size === 5 && /<h2>Worked example<\/h2>/.test(D4.match(new RegExp(`id="${ids4[1]}">[\\s\\S]*?</section>`))[0]) && /<h2>Try it<\/h2>/.test(D4.match(new RegExp(`id="${ids4[2]}">[\\s\\S]*?</section>`))[0]),
      `llm insert: the two new slides go right after slide 1, with new ids (${ids4.slice(1, 3).join(', ')})`);
    const order = [...N4.matchAll(/^## .*\{#(s-[a-z2-7]{6})\}$/gm)].map((m) => m[1]);
    ok(N4.includes(`## Worked example {#${ids4[1]}}\n[0] Here is a worked example.\n[concl] That is all.`) && N4.includes(`## Try it {#${ids4[2]}}\n[0] Now try it yourself.`) && order.join() === ids4.join(),
      'llm insert: their narration sections get the same ids and sit in slide order; the quality check ran');
    // 最後のスライドを選んで「スライドの挿入 ▾ → 雛形から」：最後の後ろ
    await p.click('#sl-o-4');
    await clickUntil(p, '#sl-add', () => p.waitForSelector('#sl-add-menu:not([hidden])', { timeout: 2500 }));
    if (shotDir) await p.screenshot({ path: path.join(shotDir, 'insert-menu.png') });
    await p.click('#sl-add-quote');
    for (let t0 = Date.now(); Date.now() - t0 < 20000; await p.waitForTimeout(100)) if ((await read('deck.html')).match(/<section class="slide/g).length === 6) break;
    const D5 = await read('deck.html');
    const ids5 = [...D5.matchAll(/<section class="slide[^"]*" id="(s-[a-z2-7]{6})"/g)].map((m) => m[1]);
    ok(ids5.length === 6 && ids5.slice(0, 5).join() === ids4.join() && !ids4.includes(ids5[5]), 'llm insert: from a template with the last slide selected, the new slide goes after the last one');
    // 選んだスライドがない（一覧の外から。null）：最後のスライドの後ろ
    await clickUntil(p, '#sl-close', () => p.waitForSelector('#slides[hidden]', { state: 'attached', timeout: 2500 }));
    await p.evaluate(() => { window.__APP_TEST.insertAi(null); });
    await p.waitForSelector('#dlg[open] #paste-insert-where');
    ok(/^Insert after the last slide \(6, /.test(await p.textContent('#paste-insert-where')), 'llm insert: with no slide selected, the chat AI insert goes after the last slide: ' + await p.textContent('#paste-insert-where'));
    await clickDlg(p, '#dlg-cancel');
    await p.close();
  }
}
