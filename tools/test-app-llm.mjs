// 編集アプリの「AI の出力を貼り付ける」と「AI への直しの依頼を写す」（app/llm.js）の確認。tools/test-app.mjs が呼ぶ
//   testLlm({browser, BASE, ok, watch, shotDir})
// 1. 貼り付けの窓：開く・指示を写す（系列を選ぶ：新しいデッキなら academic、開いているデッキならその部品・テーマから推したもの）・
//    誤り（囲みなし・閉じていない囲み）を窓の中に出す
// 2. 見本の返事（tools/llm-guide/worked/business：前置きの文章・```html と ```markdown・CRLF）を取り込む → 新しい 1 ファイルとして開き、
//    スライドに id が付き、口述原稿の見出しが {#id} になり、簡易チェックのエラーが 0
// 3. スクリプトの入った返事：コードの確かめが出て、取り消せば開かない（前のデッキのまま）
// 4. 決まりを破った返事 → 簡易チェックのエラー → 直しの依頼の文章に、エラーの言葉・決まりの名前と文章・今のファイルが入る →
//    直したスライドだけの返事を「今のデッキを置き換える」で取り込む → docId はそのまま、そのスライドだけが替わり、エラー 0
// 画像（shotDir があれば）：paste-dialog(-ja).png・paste-error.png・paste-cutoff.png・paste-opened.png・fix-check.png・fix-request.png・fix-replaced.png（1280×800）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Windows の checkout では CRLF になることがあるので LF にそろえる（試験の正規表現と、textarea が CRLF を LF にすることに合わせる）
const worked = (n, f) => fs.readFileSync(path.join(ROOT, 'tools', 'llm-guide', 'worked', n, f), 'utf8').replace(/\r\n/g, '\n');

export function replyOf(deck, narration, { crlf = false, labels = ['html', 'markdown'] } = {}) {
  const t = `Here is your lesson.\n\n**deck.html**\n\`\`\`${labels[0]}\n${deck.trim()}\n\`\`\`\n\nAnd the narration:\n\n\`\`\`${labels[1]}\n${narration.trim()}\n\`\`\`\n\nLet me know if you want changes.\n`;
  return crlf ? t.replace(/\n/g, '\r\n') : t;
}

export async function testLlm({ browser, BASE, ok, watch, shotDir }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin }).catch(() => {});
  const page = await ctx.newPage();
  watch(page, 'llm');
  const top = (p) => p.evaluate(() => { for (const t of document.querySelectorAll('#dlg textarea')) { t.scrollTop = 0; try { t.setSelectionRange(0, 0); } catch { /* 読むだけ */ } } });
  const shot = async (name) => { if (shotDir) { await top(page); await page.screenshot({ path: path.join(shotDir, name) }); } };
  const state = () => page.evaluate(() => window.__APP_TEST.state());
  const files = () => page.evaluate(() => { const f = window.__APP_TEST.files(); if (!f) return null; const d = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, d(v)])); });
  // 開いている 1 ファイルに保存していない変更があれば、開く前に「変更を捨てる」かを聞かれる（取り込んだデッキは保存していない）
  const discard = async () => { await page.waitForSelector('#dlg[open] #dlg-discard', { timeout: 30000 }); await page.click('#dlg-discard'); };
  const waitPanel = () => page.waitForSelector('#panel:not([hidden]) #panel-body .sum', { timeout: 30000 });
  await page.goto(BASE + '?lang=en');
  await page.waitForSelector('#drop');

  // ---------------------------------------------------------------- 1. 窓・指示を写す・誤り
  ok((await page.textContent('#w-paste')) === 'Paste AI output', 'llm: the welcome screen has “Paste AI output”');
  await page.click('#w-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  const boxes = await page.$$eval('#paste-series input[type=checkbox]', (xs) => xs.map((x) => [x.value, x.checked, x.closest('label').textContent]));
  ok(boxes.map((b) => b[0]).join() === 'academic,business,kokugo,info' && boxes.filter((b) => b[1]).map((b) => b[0]).join() === 'academic' && boxes.every((b) => /\+\d+ KB$/.test(b[2])),
    'llm: the instructions have series checkboxes with sizes; with no deck open, academic is ticked: ' + JSON.stringify(boxes.map((b) => b[2])));
  ok(/^Series \(added to the common body, \d+ KB\)$/.test(await page.textContent('#paste-series legend')) && /^\d+ KB in all$/.test(await page.textContent('#paste-pack-size')), 'llm: the legend gives the common body size and the total is shown');
  await page.click('#paste-copy-guide');
  await page.waitForSelector('#paste-copied:not([hidden])');
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(clip.startsWith('# Instructions for the AI') && clip.includes('**R-output**') && !clip.includes('For people.') && clip.includes('## Series pack: academic') && clip.includes('`<m-sweep>`') && !clip.includes('## Series pack: business') && !clip.includes('`<m-kpi>`'),
    `llm: “Copy instructions for your AI” copies the common body from “Instructions for the AI” and the academic pack (${Math.round(clip.length / 1024)} KB)`);
  const total0 = await page.textContent('#paste-pack-size');
  await page.click('#paste-series-academic');
  await page.click('#paste-series-business');
  await page.click('#paste-series-info');
  await page.click('#paste-copy-guide');
  await page.waitForFunction((c) => navigator.clipboard.readText().then((t) => t !== c).catch(() => false), clip);
  const clipB = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(clipB.includes('## Series pack: business') && clipB.includes('`<m-kpi>`') && clipB.includes('## Series pack: info') && !clipB.includes('## Series pack: academic') && clipB.indexOf('Series pack: business') < clipB.indexOf('Series pack: info') && (await page.textContent('#paste-pack-size')) !== total0,
    'llm: ticking business and info (and unticking academic) copies those packs, in order, and updates the total');
  const bdeck = worked('business', 'deck.html'), bnarr = worked('business', 'narration.md');
  await page.fill('#paste-text', replyOf(bdeck, bnarr, { crlf: true }));
  await shot('paste-dialog.png');
  await page.fill('#paste-text', 'Sure! Here is the deck:\n\n```deck.html\n<!DOCTYPE html>\n<html lang="en"><body><div id="stage">\n<section class="slide"><h2>Cut</h2>');
  await page.click('#dlg-import');
  await page.waitForSelector('#dlg[open] #paste-msg:not([hidden])');
  const emsg = await page.textContent('#paste-msg');
  ok(/not closed/.test(emsg) && /cut off/.test(emsg) && !(await state()).open, 'llm: a reply with an unclosed block shows a clear error in the dialog and opens nothing: ' + emsg);
  await shot('paste-error.png');
  await page.fill('#paste-text', 'I could not do it, sorry.');
  await page.click('#dlg-import');
  await page.waitForFunction(() => /No code blocks/.test(document.getElementById('paste-msg').textContent));
  ok(true, 'llm: a reply without code blocks shows “No code blocks …”');
  await page.waitForSelector('#dlg[open] #paste-copy-cutoff:not([hidden])');
  await page.click('#paste-copy-cutoff');
  await page.waitForFunction(() => /Copied/.test(document.getElementById('paste-copied').textContent));
  const nob = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/no code blocks/.test(nob) && /Do not output files, a canvas or attachments/.test(nob) && /R-output/.test(nob), 'llm: no code blocks → “Copy a resend request” asks for both blocks in the message body');
  await page.evaluate(() => { const m = document.getElementById('paste-copied'); m.hidden = true; m.textContent = ''; });

  // ---------------------------------------------------------------- 2. 見本の返事を取り込む：はじめは narration.md の途中で切れた返事 →
  // 送り直しを頼む文を写す → narration.md の囲みだけの返事で、前の deck.html と合わせて開く
  const cutReply = replyOf(bdeck, bnarr, { crlf: true }).replace(/\r\n```\r\n\r\nLet me know[\s\S]*$/, '').replace(/\[concl\] 次は[^\r]*$/, '[concl] 次は、伸びの');
  await page.fill('#paste-text', cutReply);
  await page.click('#dlg-import');
  await page.waitForSelector('#dlg[open] #paste-copy-cutoff:not([hidden])');
  ok(/narration\.md/.test(await page.textContent('#paste-msg')), 'llm: a reply cut off inside narration.md says so and offers “Copy a resend request for your AI”');
  await page.click('#paste-copy-cutoff');
  await page.waitForFunction(() => /Copied/.test(document.getElementById('paste-copied').textContent));
  const resend = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/cut off/.test(resend) && /Send only the narration\.md block again/.test(resend) && /R-output/.test(resend), 'llm: the resend request asks for only the missing narration.md block: ' + JSON.stringify(resend.slice(0, 90)));
  await shot('paste-cutoff.png');
  await page.fill('#paste-text', 'Here is the narration again:\n\n```narration.md\n' + bnarr.trim() + '\n```\n');
  await page.click('#dlg-import');
  await page.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().loads > 0, null, { timeout: 30000 });
  await waitPanel();
  const st = await state();
  let F = await files();
  const ids = [...F['deck.html'].matchAll(/<section class="slide[^"]*" id="(s-[a-z2-7]{6})"/g)].map((m) => m[1]);
  ok(st.portable && st.portable.name === '配送センターの改善報告（架空）.ega.html' && st.portable.dirty && st.portable.rightsOk, `llm: the pasted reply opens as a new unsaved portable file (${st.portable && st.portable.name}, no rights prompt)`);
  ok(ids.length === 3 && ids.every((id) => F['narration.md'].includes(`{#${id}}`)) && !F['deck.html'].includes('\r'), `llm: ids added to all 3 slides and the narration headings (${ids.join(', ')})`);
  const sum1 = await page.textContent('#panel-body .sum');
  ok(/^0 errors/.test(sum1), 'llm: the quick check runs after import and reports no errors: ' + sum1);
  const docId1 = st.portable.docId;
  await shot('paste-opened.png');

  // ---------------------------------------------------------------- 3. スクリプトの入った返事 → コードの確かめ
  const evil = bdeck.replace('</body>', '<script>window.__pastedRan = true;</script>\n</body>');
  await page.click('#b-openmenu');
  await page.click('#b-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  ok(await page.isChecked('#paste-new'), 'llm: “Paste AI output…” from the menu defaults to a new deck');
  ok(await page.isChecked('#paste-series-business') && !(await page.isChecked('#paste-series-academic')), 'llm: with the business deck open, the instructions default to the business series (from its components and theme)');
  await page.fill('#paste-text', replyOf(evil, bnarr));
  await page.click('#dlg-import');
  await discard();
  await page.waitForSelector('#dlg[open] #dlg-run', { timeout: 30000 });
  ok(/script/i.test(await page.textContent('#dlg-body')), 'llm: a pasted reply with a script asks before running the code (like an opened file)');
  await page.click('#dlg-cancel');
  await page.waitForTimeout(400);
  const st3 = await state();
  ok(st3.portable && st3.portable.docId === docId1, 'llm: cancelling the code prompt keeps the previous deck open');

  // ---------------------------------------------------------------- 4. 決まりを破った返事 → 直しの依頼 → 置き換え
  const bad = bdeck.replace('<h2>導入から 3 か月の結果</h2>', '<h2>新しい仕分けの手順を入れてから 3 か月がたった今の結果のまとめ</h2>');
  const badN = bnarr.replace('## 導入から 3 か月の結果', '## 新しい仕分けの手順を入れてから 3 か月がたった今の結果のまとめ')
    .replace('[concl] 件数が増えても', '[4] {1-η|いちマイナスイータ} は使わない例です。\n[concl] 件数が増えても');
  await page.click('#panel-close');   // 前の結果の板を閉じておく（新しい簡易チェックの板を待つため）
  await page.click('#b-openmenu');
  await page.click('#b-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  await page.fill('#paste-text', replyOf(bad, badN, { labels: ['html title="deck.html"', 'md'] }));
  await page.click('#dlg-import');
  await discard();
  await page.waitForFunction((d) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.docId !== d; }, docId1, { timeout: 30000 });
  await waitPanel();
  const sum2 = await page.textContent('#panel-body .sum');
  const items = await page.$$eval('#panel-body .res', (xs) => xs.map((x) => x.textContent));
  ok(/^[1-9]\d* errors/.test(sum2) && items.some((t) => /title is .*max 26/.test(t)) && items.some((t) => /narration \[4\] has no matching step.*valid keys are \[0\]/.test(t)) && items.some((t) => /reads an expression/.test(t)),
    'llm: quick check reports the long title, the orphan [4] and the expression reading: ' + sum2);
  await shot('fix-check.png');
  const docId2 = (await state()).portable.docId;
  await page.click('#b-fixreq');
  await page.waitForSelector('#dlg[open] #fix-text');
  const req = await page.inputValue('#fix-text');
  const clip2 = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(req.includes('R-title') && /\*\*R-title\*\* Heading: Japanese at most 26 units/.test(req) && req.includes('R-narr-steps') && req.includes('R-reading') && /title is \d+(\.\d+)? units/.test(req) && req.includes('````deck.html') && req.includes('{#s-'),
    'llm: the fix request names the errors, quotes their rules from the guide and includes the current files');
  ok(req.includes('## Components used in this deck') && req.includes('### `<m-kpi>`') && req.includes('### `<m-bars>`') && !req.includes('### `<m-sweep>`'), 'llm: the fix request includes the notes of the components the deck uses (m-kpi, m-bars)');
  ok(clip2.replace(/\r\n/g, '\n') === req, 'llm: the fix request is on the clipboard');
  ok(/narration \[4\] has no matching step on the slide \(narration\.md line/.test(req) && /Lines to change: line \d+: “\[4\]/.test(req) && /previous step \[\d\]/.test(req), 'llm: the fix request quotes the orphan narration lines and the step to merge into');
  await shot('fix-request.png');
  // 返事：直したスライドだけ（id はそのまま）
  F = await files();
  const sid = F['deck.html'].match(/<section class="slide" id="(s-[a-z2-7]{6})">\s*<h2>新しい仕分け/)[1];
  const fixedSec = bdeck.match(/<section class="slide">\s*<h2>導入から 3 か月の結果<\/h2>[\s\S]*?<\/section>/)[0].replace('<section class="slide">', `<section class="slide" id="${sid}">`);
  const fixedNarr = bnarr.match(/## 導入から 3 か月の結果\n[\s\S]*?(?=\n## |\s*$)/)[0].replace('## 導入から 3 か月の結果', `## 導入から 3 か月の結果 {#${sid}}`);
  await page.click('#dlg-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  ok(await page.isChecked('#paste-replace'), 'llm: “Paste the reply…” opens the paste dialog with “Replace the current deck” selected');
  await page.fill('#paste-text', 'Fixed:\n\n```deck.html\n' + fixedSec + '\n```\n\n```narration.md\n' + fixedNarr + '\n```\n');
  await shot('paste-replace.png');
  await page.evaluate(() => { document.getElementById('panel').hidden = true; });
  await page.click('#dlg-import');
  await waitPanel();
  const st4 = await state();
  F = await files();
  const sum3 = await page.textContent('#panel-body .sum').catch(() => '');
  ok(st4.portable.docId === docId2 && F['deck.html'].includes(`id="${sid}">\n  <h2>導入から 3 か月の結果`) && !F['narration.md'].includes('[4]') && F['narration.md'].includes(`## 導入から 3 か月の結果 {#${sid}}`) && st4.portable.dirty,
    `llm: replacing with the fixed slide keeps the docId (${docId2}), replaces only that slide and its narration, and leaves the file unsaved`);
  ok(/^0 errors/.test(sum3), 'llm: after the fix the quick check reports no errors: ' + sum3);
  await shot('fix-replaced.png');

  // 日本語の画面の窓（画像だけ）
  if (shotDir) {
    const pj = await ctx.newPage();
    watch(pj, 'llm-ja');
    await pj.goto(BASE + '?lang=ja');
    await pj.waitForSelector('#drop');
    await pj.click('#w-paste');
    await pj.waitForSelector('#dlg[open] #paste-text');
    await pj.fill('#paste-text', replyOf(worked('kokugo', 'deck.html'), worked('kokugo', 'narration.md')));
    await top(pj);
    await pj.screenshot({ path: path.join(shotDir, 'paste-dialog-ja.png') });
    await pj.close();
  }
  await ctx.close();
}
