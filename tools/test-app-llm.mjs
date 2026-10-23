// 編集アプリの「AI で新しく作る」「AI の直しを取り込む」と「AI への修正依頼を写す」（app/llm.js）の確認。tools/test-app.mjs が呼ぶ
// test-all: part of test-app（tools/test-app.mjs が読み込む。単独では走らせない）
//   testLlm({browser, BASE, ok, watch, shotDir})
// 1. 「AI で新しく作る」の窓：3 つのステップ（① 頼みたいことを書く → ② 指示をコピーして送る → ③ 返事を貼り付けて開く）・ラベルと読み上げ・
//    A（新しく作る）と B（このチャットの内容で）の記入が写した指示の最後に入る・添付になってもそのまま送る知らせ・共通の本体は外せない・
//    系列（新しいデッキなら academic、開いているデッキならその部品・テーマから推したもの）・誤り（関係のない文字・閉じていない囲み・分けられないもの）
// 2. 見本の返事（tools/llm-guide/worked/business：前置きの文章・```html と ```markdown・CRLF）を取り込む → 新しい 1 ファイルとして開き、
//    スライドに id が付き、口述原稿の見出しが {#id} になり、品質チェックのエラーが 0
// 2b. 囲みを 1 つずつ（囲みの行なし）：deck.html → narration.md と、その逆の順。受け取った知らせ・同じ方をもう一度・返事の全体と同じものが開く・
//    捨てて最初から・窓を閉じると捨てる
// 3. スクリプトの入った返事：コードの確かめが出て、取り消せば開かない（前のデッキのまま）。開くの一覧の 2 つの入口の名前
// 4. 規格を破った返事 → 品質チェックのエラー → 修正依頼の文章に、エラーの言葉・規格の名前と文章・今のファイルが入る →
//    直したスライドだけの返事を「AI の直しを取り込む」で、囲みを 1 つずつ取り込む → docId はそのまま、そのスライドだけが替わり、エラー 0
// 5. ほかのデッキ（見本の 1 ファイル・作業フォルダ）を開いていて、別のデッキの返事を「AI の直しを取り込む」で取り込む →
//    品質チェックが新しいプレビューに答える（前の読み込みに頼んで「応答しません」にならない）・プレビューが新しいデッキ・保存できる・
//    直したスライドだけの置き換え・口述原稿だけの直しを「これだけで取り込む」も同じ。結果が 0 件の品質チェックの説明の文
// 6. 日本語の画面：入口の名前・3 つのステップ・大きさ・受け取った知らせ
// 画像（shotDir があれば）：ai-step1(-ja).png・ai-step2(-ja).png・ai-step3-ja.png・paste-held(-ja).png・paste-dialog.png・paste-error.png・paste-cutoff.png・
// paste-opened.png・fix-check.png・fix-request.png・paste-replace.png・fix-replaced.png（1280×800）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack, packSize, packKb, kbOf } from '../kit/core/llm-pack.mjs';
import { filledRequest, packWithRequest } from '../kit/core/llm-request.mjs';
import { clickUntil, clickDlg, clickMenuOpen, clickMenuItem } from './click-retry.mjs';

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
  const discard = async () => { await page.waitForSelector('#dlg[open] #dlg-discard', { timeout: 30000 }); await clickDlg(page, '#dlg-discard'); };
  const waitPanel = () => page.waitForSelector('#panel:not([hidden]) #panel-body .sum', { timeout: 30000 });
  await page.goto(BASE + '?lang=en');
  await page.waitForSelector('#drop');

  // ---------------------------------------------------------------- 1. 「AI で新しく作る」の窓：3 つのステップ・頼みたいこと（A・B）を書いて指示に入れる・指示を写す・誤り
  ok((await page.textContent('#w-paste')) === 'Make with AI', 'llm: the welcome screen has “Make with AI”');
  await page.click('#w-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  const steps = await page.$$eval('#dlg-body section.paste-step', (xs) => xs.map((x) => [x.id, x.querySelector('h3').textContent, x.getAttribute('aria-labelledby') === x.querySelector('h3').id]));
  ok(steps.map((x) => x[0]).join() === 'paste-step1,paste-step2,paste-step3' && steps.map((x) => x[1]).join('|') === '1. Write what you want|2. Copy the instructions, paste them into the chat and send|3. Paste the reply and open it' && steps.every((x) => x[2]),
    'llm: the dialog has 3 steps in order, each a section labelled by its heading: ' + JSON.stringify(steps.map((x) => x[1])));
  ok((await page.textContent('#dlg-title')) === 'Make with AI' && (await page.textContent('#dlg-import')) === 'Open', 'llm: the dialog is titled “Make with AI” and its button is “Open”');
  const unlabelled = await page.$$eval('#dlg-body input, #dlg-body textarea', (xs) => xs.filter((x) => !x.labels?.length && !x.closest('label') && !x.getAttribute('aria-label')).map((x) => x.id));
  ok(!unlabelled.length, 'llm a11y: every field in the dialog has a label: ' + JSON.stringify(unlabelled));
  const live = await page.evaluate(() => ['paste-copied', 'paste-state', 'paste-msg'].map((id) => document.getElementById(id).getAttribute('role')));
  ok(live.join() === 'status,status,alert', 'llm a11y: the copy result and the received-block state are status regions, errors are alerts');
  // 既定は A（新しく作る）。話者は指示の既定の値。B の欄は隠れている
  ok(await page.isChecked('#paste-kind-a') && await page.isVisible('#paste-a-topic') && !(await page.isVisible('#paste-b-length')) && (await page.inputValue('#paste-a-speakers')) === 'one narrator',
    'llm: step 1 starts with A (make a new lesson); the speakers field has the default from the instructions');
  const boxes = await page.$$eval('#paste-series input[type=checkbox]', (xs) => xs.map((x) => [x.value, x.checked, x.closest('label').textContent]));
  ok(boxes.map((b) => b[0]).join() === 'academic,business,kokugo,info' && boxes.filter((b) => b[1]).map((b) => b[0]).join() === 'academic' && boxes.every((b) => /\+\d+\.\d KB$/.test(b[2])) && boxes[0][2].endsWith(`+${kbOf(packSize(buildPack({ series: ['academic'], lang: 'en' })) - packSize(buildPack({ series: [], lang: 'en' })))} KB`),
    'llm: the instructions have series checkboxes with sizes; with no deck open, academic is ticked: ' + JSON.stringify(boxes.map((b) => b[2])));
  ok(await page.isChecked('#paste-common') && await page.isDisabled('#paste-common') && (await page.textContent('label.paste-common')).includes(`Common body (always included)`) && (await page.textContent('label.paste-common')).includes(`${packKb(buildPack({ series: [], lang: 'en' }))} KB`) && (await page.textContent('#paste-series legend')) === 'Series (add only when needed)',
    'llm: the common body is shown as always included (ticked, cannot be removed) with its size; the series say “add only when needed”');
  // A の題材がないまま写そうとすると、① に戻す
  await page.click('#paste-copy-guide');
  await page.waitForSelector('#paste-copied:not([hidden])');
  ok((await page.textContent('#paste-copied')) === 'Write the topic in step 1.' && await page.evaluate(() => document.activeElement && document.activeElement.id === 'paste-a-topic'), 'llm: copying with no topic asks for it and moves the focus to the topic field');
  const reqA = { topic: 'How binary search works', audience: 'First-year students', length: '5 slides', examples: 'Finding a name in a phone book\nGuessing a number' };
  for (const [k, v] of Object.entries(reqA)) await page.fill('#paste-a-' + k, v);
  const total0 = await page.textContent('#paste-pack-size');
  const wantA = filledRequest({ kind: 'A', values: { ...reqA, speakers: 'one narrator', language: '' } }, 'en');
  ok(total0 === `${packKb(packWithRequest({ series: ['academic'], lang: 'en', request: wantA }))} KB in all`, 'llm: the total follows what is written in step 1: ' + total0);
  await shot('ai-step1.png');
  await page.click('#paste-copy-guide');
  await page.waitForFunction(() => /^Copied/.test(document.getElementById('paste-copied').textContent));
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(clip.startsWith('# Instructions for the AI') && clip.includes('**R-output**') && !clip.includes('For people.') && clip.includes('## Series pack: academic') && clip.includes('`<m-sweep>`') && !clip.includes('## Series pack: business') && !clip.includes('`<m-kpi>`'),
    `llm: “Copy instructions for your AI” copies the common body from “Instructions for the AI” and the academic pack (${Math.round(clip.length / 1024)} KB)`);
  ok(clip === packWithRequest({ series: ['academic'], lang: 'en', request: wantA }) && clip.endsWith(wantA) && clip.includes('- Topic: How binary search works') && clip.includes('- Examples or figures to include: Finding a name in a phone book\n  Guessing a number') && !clip.includes('*(Fill in A or B') && !clip.includes('**B. From our discussion so far**'),
    'llm: what was written for A is at the end of the copied instructions (the blank form and B are left out)');
  const copiedMsg = await page.textContent('#paste-copied');
  ok(/with what you wrote in step 1/.test(copiedMsg) && /If it turns into an attachment, just send it\./.test(copiedMsg) && /go to step 3/.test(copiedMsg), 'llm: after copying, the dialog says to send it even if it becomes an attachment: ' + copiedMsg);
  await shot('ai-step2.png');
  // B（このチャットでここまで話し合った内容で）
  await page.click('#paste-kind-b');
  ok(await page.isVisible('#paste-b-length') && !(await page.isVisible('#paste-a-topic')), 'llm: choosing B shows its fields and hides A');
  await page.fill('#paste-b-length', '10 minutes');
  await page.click('#paste-series-academic');
  await page.click('#paste-series-business');
  await page.click('#paste-series-info');
  await page.click('#paste-copy-guide');
  await page.waitForFunction((c) => navigator.clipboard.readText().then((t) => t !== c).catch(() => false), clip);
  const clipB = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  const wantB = filledRequest({ kind: 'B', values: { length: '10 minutes', audience: '' } }, 'en');
  ok(clipB.includes('## Series pack: business') && clipB.includes('`<m-kpi>`') && clipB.includes('## Series pack: info') && !clipB.includes('## Series pack: academic') && clipB.indexOf('Series pack: business') < clipB.indexOf('Series pack: info') && (await page.textContent('#paste-pack-size')) !== total0,
    'llm: ticking business and info (and unticking academic) copies those packs, in order, and updates the total');
  ok(clipB.endsWith(wantB) && clipB.includes('Make the lesson from what we have discussed so far in this chat.') && clipB.includes('- Length (slides or minutes): 10 minutes') && !clipB.includes('**A. Make a new lesson**'),
    'llm: B (from this chat) is at the end of the copied instructions');
  await page.click('#paste-kind-a');
  const bdeck = worked('business', 'deck.html'), bnarr = worked('business', 'narration.md');
  await page.fill('#paste-text', replyOf(bdeck, bnarr, { crlf: true }));
  await shot('paste-dialog.png');
  await page.fill('#paste-text', 'Sure! Here is the deck:\n\n```deck.html\n<!DOCTYPE html>\n<html lang="en"><body><div id="stage">\n<section class="slide"><h2>Cut</h2>');
  await clickDlg(page, '#dlg-import');
  await page.waitForSelector('#dlg[open] #paste-msg:not([hidden])');
  const emsg = await page.textContent('#paste-msg');
  ok(/not closed/.test(emsg) && /cut off/.test(emsg) && !(await state()).open, 'llm: a reply with an unclosed block shows a clear error in the dialog and opens nothing: ' + emsg);
  await shot('paste-error.png');
  await page.fill('#paste-text', 'I could not do it, sorry.');
  await clickDlg(page, '#dlg-import');
  await page.waitForFunction(() => /No code blocks/.test(document.getElementById('paste-msg').textContent));
  const unrel = await page.textContent('#paste-msg');
  ok(/no deck\.html or narration\.md content/.test(unrel) && /two blocks one at a time/.test(unrel) && await page.isHidden('#paste-state') && !(await state()).open, 'llm: unrelated text says neither file was found and how to copy (whole reply, or one block at a time); nothing is kept: ' + unrel);
  await page.waitForSelector('#dlg[open] #paste-copy-cutoff:not([hidden])');
  await page.click('#paste-copy-cutoff');
  await page.waitForFunction(() => /Copied/.test(document.getElementById('paste-cut-copied').textContent));
  const nob = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/no code blocks/.test(nob) && /Do not output files, a canvas or attachments/.test(nob) && /R-output/.test(nob), 'llm: no code blocks → “Copy a resend request” asks for both blocks in the message body');
  await page.evaluate(() => { const m = document.getElementById('paste-cut-copied'); m.hidden = true; m.textContent = ''; });
  // 囲みの行なしで、スライドと口述原稿が混ざったもの：分けられないと言う
  await page.fill('#paste-text', '<section class="slide"><h2>A</h2></section>\n\n## A\n[0] Hello.');
  await clickDlg(page, '#dlg-import');
  await page.waitForFunction(() => /cannot be told apart/.test(document.getElementById('paste-msg').textContent));
  ok(await page.isHidden('#paste-state'), 'llm: slides and narration mixed without ``` lines are refused as ambiguous, with how to copy instead');

  // ---------------------------------------------------------------- 2. 見本の返事を取り込む：はじめは narration.md の途中で切れた返事 →
  // 送り直しを頼む文を写す → narration.md の囲みだけの返事で、前の deck.html と合わせて開く
  const cutReply = replyOf(bdeck, bnarr, { crlf: true }).replace(/\r\n```\r\n\r\nLet me know[\s\S]*$/, '').replace(/\[concl\] 次は[^\r]*$/, '[concl] 次は、伸びの');
  await page.fill('#paste-text', cutReply);
  await clickDlg(page, '#dlg-import');
  await page.waitForSelector('#dlg[open] #paste-copy-cutoff:not([hidden])');
  ok(/narration\.md/.test(await page.textContent('#paste-msg')), 'llm: a reply cut off inside narration.md says so and offers “Copy a resend request for your AI”');
  await page.click('#paste-copy-cutoff');
  await page.waitForFunction(() => /Copied/.test(document.getElementById('paste-cut-copied').textContent));
  const resend = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(/cut off/.test(resend) && /Send only the narration\.md block again/.test(resend) && /R-output/.test(resend), 'llm: the resend request asks for only the missing narration.md block: ' + JSON.stringify(resend.slice(0, 90)));
  await shot('paste-cutoff.png');
  await page.fill('#paste-text', 'Here is the narration again:\n\n```narration.md\n' + bnarr.trim() + '\n```\n');
  await clickDlg(page, '#dlg-import');
  await page.waitForFunction(() => window.__APP_TEST.state().portable && window.__APP_TEST.state().loads > 0, null, { timeout: 30000 });
  await waitPanel();
  const st = await state();
  let F = await files();
  const ids = [...F['deck.html'].matchAll(/<section class="slide[^"]*" id="(s-[a-z2-7]{6})"/g)].map((m) => m[1]);
  ok(st.portable && st.portable.name === '配送センターの改善報告（架空）.ega.html' && st.portable.dirty && st.portable.rightsOk, `llm: the pasted reply opens as a new unsaved portable file (${st.portable && st.portable.name}, no rights prompt)`);
  ok(ids.length === 3 && ids.every((id) => F['narration.md'].includes(`{#${id}}`)) && !F['deck.html'].includes('\r'), `llm: ids added to all 3 slides and the narration headings (${ids.join(', ')})`);
  const sum1 = await page.textContent('#panel-body .sum');
  ok(/^0 errors/.test(sum1), 'llm: the quality check runs after import and reports no errors: ' + sum1);
  let docId1 = st.portable.docId;
  await shot('paste-opened.png');

  // ---------------------------------------------------------------- 2b. 囲みを 1 つずつ写して貼る（チャットの囲みの右上のコピー：囲みの行なし）
  // deck.html → narration.md、narration.md → deck.html のどちらの順でも、返事の全体を貼ったときと同じものが開く。捨てて最初から・窓を閉じると捨てる
  const noIds = (t) => t.replace(/ id="s-[a-z2-7]{6}"/g, '').replace(/ \{#s-[a-z2-7]{6}\}/g, '');
  const whole = { deck: noIds(F['deck.html']), narration: noIds(F['narration.md']) };
  const openPaste = async () => { await clickMenuOpen(page, '#b-openmenu'); await clickMenuItem(page, '#b-paste'); await page.waitForSelector('#dlg[open] #paste-text'); };
  const pasteOne = async (text) => { await page.fill('#paste-text', text); await clickDlg(page, '#dlg-import'); };
  const heldText = () => page.waitForSelector('#dlg[open] #paste-state:not([hidden])').then(() => page.textContent('#paste-state-text'));
  for (const order of [['deck', 'narration'], ['narration', 'deck']]) {
    await openPaste();
    const part = { deck: '\n' + bdeck.trim() + '\n', narration: bnarr.trim() + '\n' };
    await pasteOne(part[order[0]]);
    const h = await heldText();
    const wantHeld = order[0] === 'deck' ? /^Got deck\.html \(3 slides; 1 of 2\)\. Now copy the narration\.md block/ : /^Got narration\.md \(3 sections; 1 of 2\)\. Now copy the deck\.html block/;
    ok(wantHeld.test(h) && (await page.inputValue('#paste-text')) === '' && await page.isVisible('#paste-reset') && await page.evaluate(() => document.activeElement && document.activeElement.id === 'paste-text') && !(await page.$('#dlg-only')),
      `llm separate (${order.join(' → ')}): the first block is kept and the dialog says which one arrived and asks for the other (box emptied, focus back in it): ${h}`);
    if (order[0] === 'deck') {
      await shot('paste-held.png');
      // 同じ方をもう一度：入れ替えたと言う
      await pasteOne(part.deck);
      await page.waitForFunction(() => /^Got deck\.html again/.test(document.getElementById('paste-state-text').textContent));
      ok(true, 'llm separate: the same block pasted again replaces the kept one and says so');
    }
    await pasteOne(part[order[1]]);
    await discard();
    await page.waitForFunction((d) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.docId !== d; }, docId1, { timeout: 30000 });
    await waitPanel();
    const G = await files();
    const toastT = await page.waitForFunction(() => /Joined/.test(document.getElementById('toast').textContent), null, { timeout: 10000 }).then(() => page.textContent('#toast')).catch(() => page.textContent('#toast'));
    ok(noIds(G['deck.html']) === whole.deck && noIds(G['narration.md']) === whole.narration && /^0 errors/.test(await page.textContent('#panel-body .sum')),
      `llm separate (${order.join(' → ')}): joining the two blocks opens the same deck.html and narration.md as the whole reply (ids aside), and the quality check passes`);
    ok(/Joined deck\.html and narration\.md pasted separately/.test(toastT) && !/No code blocks: took/.test(toastT), 'llm separate: the import message says the two blocks were joined: ' + toastT);
    docId1 = (await state()).portable.docId;
  }
  // 捨てて最初から・窓を閉じると捨てる
  await openPaste();
  await pasteOne(bdeck.trim());
  await heldText();
  await page.click('#paste-reset');
  await page.waitForFunction(() => /^Discarded/.test(document.getElementById('paste-state-text').textContent));
  ok(await page.isHidden('#paste-reset'), 'llm separate: “Discard and start over” drops the kept block and says so');
  await pasteOne(bnarr.trim());
  ok(/^Got narration\.md/.test(await heldText()), 'llm separate: after starting over, the next block is the first of two again (not joined with the discarded one)');
  await clickDlg(page, '#dlg-cancel');
  await openPaste();
  ok(await page.isHidden('#paste-state'), 'llm separate: closing the dialog (Cancel) drops the kept block; the dialog opens empty again');
  await clickDlg(page, '#dlg-cancel');

  // ---------------------------------------------------------------- 3. スクリプトの入った返事 → コードの確かめ
  const evil = bdeck.replace('</body>', '<script>window.__pastedRan = true;</script>\n</body>');
  await clickMenuOpen(page, '#b-openmenu');
  await clickMenuItem(page, '#b-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  ok((await page.textContent('#b-paste')) === 'Make with AI…' && (await page.textContent('#b-fiximport')) === 'Import AI fixes…' && !(await page.$('#paste-replace')), 'llm: the Open menu has “Make with AI…” and “Import AI fixes…”; making a new deck has no replace choice');
  ok(await page.isChecked('#paste-series-business') && !(await page.isChecked('#paste-series-academic')), 'llm: with the business deck open, the instructions default to the business series (from its components and theme)');
  await page.fill('#paste-text', replyOf(evil, bnarr));
  await clickDlg(page, '#dlg-import');
  await discard();
  await page.waitForSelector('#dlg[open] #dlg-run', { timeout: 30000 });
  ok(/script/i.test(await page.textContent('#dlg-body')), 'llm: a pasted reply with a script asks before running the code (like an opened file)');
  await clickDlg(page, '#dlg-cancel');
  await page.waitForTimeout(400);
  const st3 = await state();
  ok(st3.portable && st3.portable.docId === docId1, 'llm: cancelling the code prompt keeps the previous deck open');

  // ---------------------------------------------------------------- 4. 規格を破った返事 → 修正依頼 → 置き換え
  const bad = bdeck.replace('<h2>導入から 3 か月の結果</h2>', '<h2>新しい仕分けの手順を入れてから 3 か月がたった今の結果のまとめ</h2>');
  const badN = bnarr.replace('## 導入から 3 か月の結果', '## 新しい仕分けの手順を入れてから 3 か月がたった今の結果のまとめ')
    .replace('[concl] 件数が増えても', '[4] {1-η|いちマイナスイータ} は使わない例です。\n[concl] 件数が増えても');
  await clickUntil(page, '#panel-close', () => page.waitForSelector('#panel[hidden]', { state: 'attached', timeout: 2500 }));   // 前の結果の板を閉じておく（新しい品質チェックの板を待つため）
  await clickMenuOpen(page, '#b-openmenu');
  await clickMenuItem(page, '#b-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  await page.fill('#paste-text', replyOf(bad, badN, { labels: ['html title="deck.html"', 'md'] }));
  await clickDlg(page, '#dlg-import');
  await discard();
  await page.waitForFunction((d) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.docId !== d; }, docId1, { timeout: 30000 });
  await waitPanel();
  const sum2 = await page.textContent('#panel-body .sum');
  const items = await page.$$eval('#panel-body .res', (xs) => xs.map((x) => x.textContent));
  ok(/^[1-9]\d* errors/.test(sum2) && items.some((t) => /title is .*max 26/.test(t)) && items.some((t) => /narration \[4\] has no matching step.*valid keys are \[0\]/.test(t)) && items.some((t) => /reads an expression/.test(t)),
    'llm: quality check reports the long title, the orphan [4] and the expression reading: ' + sum2);
  const note2 = await page.textContent('#panel-body .hint');
  ok(/^The browser quality checker/.test(note2) && /If there are errors, press “Copy fix request for your AI” below/.test(note2), 'llm: with errors, the quality check note points to the fix request button below: ' + note2);
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
  await clickDlg(page, '#dlg-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  ok((await page.textContent('#dlg-title')) === 'Import AI fixes' && !(await page.$('#paste-step1')) && !(await page.$('#paste-copy-guide')) && (await page.textContent('#dlg-import')) === 'Import',
    'llm: “Import AI fixes…” in the fix request opens “Import AI fixes” (just the paste box, into the current deck)');
  // 直しの返事も、囲みを 1 つずつ：deck.html（直したスライドだけ）→ 「これだけで取り込む」も出る → narration.md で合わせて取り込む
  await page.fill('#paste-text', fixedSec);
  await clickDlg(page, '#dlg-import');
  await page.waitForSelector('#dlg[open] #paste-state:not([hidden])');
  const heldFix = await page.textContent('#paste-state-text');
  ok(/^Got deck\.html \(1 slide; 1 of 2\)/.test(heldFix) && /Import just this/.test(heldFix) && (await page.textContent('#dlg-only')) === 'Import just this', 'llm fix import: one block of a fix is kept, with “Import just this” for a fix that has only one: ' + heldFix);
  await shot('paste-replace.png');
  await page.fill('#paste-text', fixedNarr);
  await page.evaluate(() => { document.getElementById('panel').hidden = true; });
  await clickDlg(page, '#dlg-import');
  await waitPanel();
  const st4 = await state();
  F = await files();
  const sum3 = await page.textContent('#panel-body .sum').catch(() => '');
  ok(st4.portable.docId === docId2 && F['deck.html'].includes(`id="${sid}">\n  <h2>導入から 3 か月の結果`) && !F['narration.md'].includes('[4]') && F['narration.md'].includes(`## 導入から 3 か月の結果 {#${sid}}`) && st4.portable.dirty,
    `llm: replacing with the fixed slide keeps the docId (${docId2}), replaces only that slide and its narration, and leaves the file unsaved`);
  ok(/^0 errors/.test(sum3), 'llm: after the fix the quality check reports no errors: ' + sum3);
  await shot('fix-replaced.png');

  // ---------------------------------------------------------------- 5. ほかのデッキを開いていて、別のデッキの返事で「今のデッキを置き換える」
  // （1 ファイルの見本と作業フォルダ。置き換えの直後の品質チェックが、前の読み込みのプレビューに頼んで「デッキが応答しません」にならない）
  await testReplace({ ctx, BASE, ok, watch, bdeck, bnarr });

  // 日本語の画面：入口の名前・大きさは日本語の指示のもの（英語の大きさではない。node kit/llm-pack.mjs --list --lang ja と同じ計算）・
  // 3 つのステップと、囲みを 1 つずつ貼ったときの知らせ（画像は shotDir があれば ai-step1-ja.png・ai-step2-ja.png・ai-step3-ja.png・paste-held-ja.png）
  {
    const pj = await ctx.newPage();
    watch(pj, 'llm-ja');
    await pj.goto(BASE + '?lang=ja');
    await pj.waitForSelector('#drop');
    ok((await pj.textContent('#w-paste')) === 'AI で新しく作る', 'llm ja: the welcome screen has 「AI で新しく作る」');
    await pj.click('#w-paste');
    await pj.waitForSelector('#dlg[open] #paste-text');
    const heads = await pj.$$eval('#dlg-body section.paste-step h3', (xs) => xs.map((x) => x.textContent));
    ok(heads.join('|') === '① 頼みたいことを書く|② AI への指示をコピーして、チャットに貼って送る|③ 返事を貼り付けて開く', 'llm ja: the 3 steps: ' + heads.join(' / '));
    const common = await pj.textContent('label.paste-common'), legend = await pj.textContent('#paste-series legend'), total = await pj.textContent('#paste-pack-size');
    const ja = packKb(buildPack({ series: [], lang: 'ja' }));
    const jaA = packKb(packWithRequest({ series: ['academic'], lang: 'ja', request: filledRequest({ kind: 'A', values: { speakers: '1 人' } }, 'ja') }));
    ok(common.includes('共通の本体（必ず入る）') && common.includes(`${ja} KB`) && legend === '系列（必要なときだけ足す）' && total.includes(`${jaA} KB`) && ja !== packKb(buildPack({ series: [], lang: 'en' })),
      `llm ja: the Japanese UI shows the sizes of the Japanese instructions (${common} / ${total})`);
    const scrollTo = (id) => pj.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'start' }), id);
    for (const [k, v] of Object.entries({ topic: '二分探索のしくみ', audience: '高校 2 年生', length: '5 枚', language: '日本語', examples: '電話帳で名前を探す' })) await pj.fill('#paste-a-' + k, v);
    if (shotDir) await pj.screenshot({ path: path.join(shotDir, 'ai-step1-ja.png') });
    await pj.click('#paste-copy-guide');
    await pj.waitForFunction(() => /^コピーしました/.test(document.getElementById('paste-copied').textContent));
    const clipJ = await pj.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    const cm = await pj.textContent('#paste-copied');
    ok(clipJ.endsWith('# 頼みたいこと\n\n**A. 新しく作る**\n\n- 題材：二分探索のしくみ\n- 対象（だれ向け）：高校 2 年生\n- 長さ（枚数か分）：5 枚\n- 言語：日本語\n- 話者：1 人\n- 入れたい例や図：電話帳で名前を探す\n') && /添付のファイルの形になっても、そのまま送ってください/.test(cm),
      'llm ja: the request written in step 1 ends the copied instructions, and the hint says to send it even as an attachment: ' + cm);
    await scrollTo('paste-step2');
    if (shotDir) await pj.screenshot({ path: path.join(shotDir, 'ai-step2-ja.png') });
    await scrollTo('paste-step3');
    await pj.fill('#paste-text', replyOf(worked('kokugo', 'deck.html'), worked('kokugo', 'narration.md')));
    await top(pj);
    await scrollTo('paste-step3');
    if (shotDir) await pj.screenshot({ path: path.join(shotDir, 'ai-step3-ja.png') });
    await pj.fill('#paste-text', worked('kokugo', 'deck.html').trim());
    await clickDlg(pj, '#dlg-import');
    await pj.waitForSelector('#dlg[open] #paste-state:not([hidden])');
    const hj = await pj.textContent('#paste-state-text');
    ok(/^deck\.html を受け取りました（スライド \d+ 枚。2 つのうち 1 つ目）。次に narration\.md の囲みを/.test(hj) && (await pj.textContent('#paste-reset')) === '受け取ったものを捨てて最初から', 'llm ja: the received-block state in Japanese: ' + hj);
    await scrollTo('paste-step3');
    if (shotDir) await pj.screenshot({ path: path.join(shotDir, 'paste-held-ja.png') });
    await pj.close();
  }
  await ctx.close();
}

// 貼り付けの窓から「今のデッキを置き換える」で取り込み、品質チェックの板の結果（.sum か、確かめられなかった言葉）を返す
async function pasteReplace(p, text, { only = false } = {}) {
  await p.evaluate(() => { document.getElementById('panel').hidden = true; });
  // 一覧もそのあとの窓も、プレビューの iframe の上に出る。押したものが iframe に行ってしまっても（tools/click-retry.mjs）、もう一度押す
  await clickUntil(p, '#b-openmenu', () => p.waitForSelector('#m-open', { state: 'visible', timeout: 2500 }));
  await clickUntil(p, '#b-fiximport', () => p.waitForSelector('#dlg[open] #paste-text', { timeout: 2500 }));
  await p.fill('#paste-text', text);
  const t0 = Date.now();
  await clickDlg(p, '#dlg-import');
  // 囲みの中身だけ（片方）：持っておく知らせが出る →「これだけで取り込む」
  if (only) { await p.waitForSelector('#dlg[open] #dlg-only'); await clickDlg(p, '#dlg-only'); }
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

async function testReplace({ ctx, BASE, ok, watch, bdeck, bnarr }) {
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
    const r3 = await pasteReplace(p, sec2, { only: true });
    const N1 = await p.evaluate(() => new TextDecoder().decode(Uint8Array.from(atob(window.__APP_TEST.files()['narration.md']), (c) => c.charCodeAt(0))));
    ok(/^0 errors/.test(r3.sum) && N1.includes('[0] 拠点ごとの出荷を、直した口述原稿で読みます。') && N1.replace(sec2, sec) === N0, `llm replace (single file): a narration-only fix pasted as one block and imported with “Import just this” replaces just that section: ${r3.sum}`);
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
    ok(/^The browser quality checker \(size, length, missing narration, color contrast\)\.( |$)/.test(note0) && /“Copy fix request for your AI”/.test(note0) && /appears here/.test(note0) && !/npm run check/.test(note0) && !(await p.$('#b-fixreq')),
      'llm quality check: with no results, the note says the fix request button appears when there are errors: ' + note0);
    await p.close();
  }
}
