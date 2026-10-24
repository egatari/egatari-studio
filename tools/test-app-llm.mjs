// 編集アプリの AI のやり方（「新規作成…」「スライドの挿入…」「修正…」の「チャットの AI に…」）と「AI への修正依頼をコピー」（app/llm.js）の確認。tools/test-app.mjs が呼ぶ
// test-all: part of test-app（tools/test-app.mjs が読み込む。単独では走らせない）
//   testLlm({browser, BASE, ok, watch, shotDir})
// 1. 「新規作成…」→「チャットの AI に書いてもらう」の窓：最初の説明・3 つのステップ（① 頼みたいことを書く → ② 指示をコピーして送る → ③ 返事を貼り付けて開く）・ラベルと読み上げ・
//    A（新しく作る）と B（このチャットの内容で）の記入が写した指示の最後に入る・添付になってもそのまま送る知らせ・共通の本体は外せない・
//    系列（デッキを開いていなければどれも足さない（ヒントで「数理・統計」を勧める）、開いているデッキならその部品・テーマから推したもの）・誤り（関係のない文字・閉じていない囲み・分けられないもの）
// 2. 見本の返事（tools/llm-guide/worked/business：前置きの文章・```html と ```markdown・CRLF）を取り込む → 新しい 1 ファイルとして開き、
//    スライドに id が付き、口述原稿の見出しが {#id} になり、品質チェックのエラーが 0
// 2b. 囲みを 1 つずつ（囲みの行なし）：deck.html → narration.md と、その逆の順。受け取った知らせ・同じ方をもう一度・返事の全体と同じものが開く・
//    捨てて最初から・窓を閉じると捨てる
// 3. スクリプトの入った返事：コードの確かめが出て、取り消せば開かない（前のデッキのまま）。開くの一覧の 2 つの入口の名前
// 4. 規格を破った返事 → 品質チェックのエラー → 修正依頼の文章に、エラーの言葉・規格の名前と文章・今のファイルが入る →
//    直したスライドだけの返事を「修正…」で、囲みを 1 つずつ取り込む → docId はそのまま、そのスライドだけが替わり、エラー 0
// 5. ほかのデッキ（見本の 1 ファイル・作業フォルダ）を開いていて、別のデッキの返事を「修正…」で取り込む →
//    品質チェックが新しいプレビューに答える（前の読み込みに頼んで「応答しません」にならない）・プレビューが新しいデッキ・保存できる・
//    直したスライドだけの置き換え・口述原稿だけの直しを「これだけで取り込む」も同じ。結果が 0 件の品質チェックの説明の文
// 6. 日本語の画面：入口の名前・3 つのステップ・大きさ・受け取った知らせ
// 画像（shotDir があれば）：ai-step1(-ja).png・ai-step2(-ja).png・ai-step3-ja.png・paste-held(-ja).png・paste-dialog.png・paste-error.png・paste-cutoff.png・
// paste-opened.png・fix-check.png・fix-request.png・paste-replace.png・fix-replaced.png（1280×800）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack, commonBody, seriesPart, packSize, packKb } from '../kit/core/llm-pack.mjs';
import { filledRequest, packWithRequest } from '../kit/core/llm-request.mjs';
import { seedOf } from '../kit/core/new-deck.mjs';
import { clickUntil, clickDlg, clickMenuOpen, clickMenuItem, clickCommand } from './click-retry.mjs';

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

  // ---------------------------------------------------------------- 1. 「新規作成…」→「チャットの AI に書いてもらう」の窓：3 つのステップ・頼みたいこと（A・B）を書いて指示に入れる・指示を写す・誤り
  ok((await page.textContent('#w-new')) === 'New…' && !(await page.$('#w-paste')), 'llm: the welcome screen has “New…” (no separate AI entry)');
  await page.click('#w-new');
  // 新規作成はチャットの AI の道 1 本（白紙とテンプレートは外した。テンプレートはスライドの挿入に）：すぐに AI の窓が開く
  await page.waitForSelector('#dlg[open] #paste-text');
  ok((await page.textContent('#ai-howto')) === 'Open a chat AI (Gemini, ChatGPT, Claude, …) in another browser tab. Paste the instructions you copy here and send them; the AI writes the lesson. Then paste its reply in step 6.'
    && await page.evaluate(() => { const h = document.getElementById('ai-howto'), s1 = document.getElementById('paste-step-kind'); return !!(h.compareDocumentPosition(s1) & Node.DOCUMENT_POSITION_FOLLOWING); }),
    'llm: before step 1, the dialog explains to open a chat AI in another tab, send the instructions and paste the reply in step 6');
  ok(!(await page.$('#dlg-body input[name=paste-mode]')) && (await page.$$eval('#dlg-body input[type=radio]', (xs) => xs.map((x) => x.name))).every((n) => ['paste-kind', 'paste-cat', 'paste-sub', 'paste-plan'].includes(n)), 'llm: there is no import-mode choice (the command decides it)');
  const steps = await page.$$eval('#dlg-body section.paste-step', (xs) => xs.map((x) => [x.id, x.querySelector('h3').textContent, x.getAttribute('aria-labelledby') === x.querySelector('h3').id]));
  ok(steps.map((x) => x[0]).join() === 'paste-step-kind,paste-step-series,paste-step-theme,paste-step1,paste-step2,paste-step3' && steps.map((x) => x[1]).join('|') === '1. Choose the kind (category and subcategory) (optional)|2. Choose your chat AI and subjects (parts)|3. Choose the design (theme)|4. Write what you want|5. Copy the instructions, paste them into the chat and send|6. Paste the AI’s reply and open it' && steps.every((x) => x[2]),
    'llm: the dialog has 6 steps in order (kind, AI plan and subjects, theme, request, copy, paste), each a section labelled by its heading: ' + JSON.stringify(steps.map((x) => x[1])));
  ok((await page.textContent('#dlg-title')) === 'New: have a chat AI write it' && (await page.textContent('#dlg-import')) === 'Open', 'llm: the dialog is titled “New: have a chat AI write it” and its button is “Open”');
  const unlabelled = await page.$$eval('#dlg-body input, #dlg-body textarea', (xs) => xs.filter((x) => !x.labels?.length && !x.closest('label') && !x.getAttribute('aria-label')).map((x) => x.id));
  ok(!unlabelled.length, 'llm a11y: every field in the dialog has a label: ' + JSON.stringify(unlabelled));
  const live = await page.evaluate(() => ['paste-copied', 'paste-state', 'paste-msg'].map((id) => document.getElementById(id).getAttribute('role')));
  ok(live.join() === 'status,status,alert', 'llm a11y: the copy result and the received-block state are status regions, errors are alerts');
  // 既定は A（新しく作る）。話者は指示の既定の値。B の欄は隠れている
  ok(await page.isChecked('#paste-kind-a') && await page.isVisible('#paste-a-topic') && !(await page.isVisible('#paste-b-length')) && (await page.inputValue('#paste-a-speakers')) === 'one narrator',
    'llm: step 1 starts with A (make a new lesson); the speakers field has the default from the instructions');
  const boxes = await page.$$eval('#paste-series input[type=checkbox]', (xs) => xs.map((x) => [x.value, x.checked, x.closest('label').textContent]));
  ok(boxes.map((b) => b[0]).join() === 'academic,business,kokugo,info' && boxes.filter((b) => b[1]).length === 0 && boxes.every((b) => !/KB/.test(b[2])) && !(await page.$('#paste-budget')),
    'llm: the instructions have series checkboxes without sizes (the AI plan question replaces the size worry; no token budget line); with no deck open, no series is ticked: ' + JSON.stringify(boxes.map((b) => b[2])));
  ok(await page.isChecked('#paste-plan-free') && !(await page.isChecked('#paste-plan-paid')) && (await page.textContent('#paste-plan legend')) === 'Is your chat AI a free or a paid plan?' && await page.isVisible('#paste-series') && await page.isHidden('#paste-series-paid'),
    'llm: step 2 asks for the chat AI plan; Free plan is the default and shows the subjects');
  ok(await page.$eval('#paste-purposes-fold', (d) => d.tagName === 'DETAILS' && !d.open) && await page.isHidden('#paste-purpose-compare') && (await page.textContent('#paste-purposes-fold-h')) === 'Choose representations the AI should not use (optional) all in use now',
    'llm: the purpose tiles are in a fold, closed by default: ' + await page.textContent('#paste-purposes-fold-h'));
  ok(await page.isChecked('#paste-common') && await page.isDisabled('#paste-common') && (await page.textContent('label.paste-common')).includes(`Common body (always included)`) && (await page.textContent('label.paste-common')).includes(`${packKb(commonBody('en'))} KB`) && (await page.textContent('#paste-series legend')) === 'Subjects (parts)',
    'llm: the common body is shown as always included (ticked, cannot be removed) with its size; the series say “add only when needed”');
  ok((await page.textContent('#paste-series-hint')) === 'Using formulas, graphs or data charts? Choose “Math and statistics (formulas, functions, data)”.' && (await page.getAttribute('#paste-series', 'aria-describedby')) === 'paste-series-hint',
    'llm: under the series, a hint says to add Math and statistics for formulas, graphs or data charts (with the series’ display name)');
  // A の題材がないまま写そうとすると、① に戻す
  await page.click('#paste-copy-guide');
  await page.waitForSelector('#paste-copied:not([hidden])');
  ok((await page.textContent('#paste-copied')) === 'Write the topic in step 4.' && await page.evaluate(() => document.activeElement && document.activeElement.id === 'paste-a-topic'), 'llm: copying with no topic asks for it and moves the focus to the topic field');
  const reqA = { topic: 'How binary search works', audience: 'First-year students', length: '5 slides', examples: 'Finding a name in a phone book\nGuessing a number' };
  for (const [k, v] of Object.entries(reqA)) await page.fill('#paste-a-' + k, v);
  // 頼みたいことの最後に ② のテーマ（既定は default）
  const withThemeLine = (r, t = 'default', lang = 'en') => r.replace(/\n*$/, '\n') + (lang === 'en' ? `- Theme: ${t} (<html data-theme="${t}">)` : `- テーマ：${t}（<html data-theme="${t}">）`) + '\n';
  const wantA = withThemeLine(filledRequest({ kind: 'A', values: { ...reqA, speakers: 'one narrator', language: '' } }, 'en'));
  // 系列に何も印がないまま写す：共通の本体と頼みたいことだけ
  ok((await page.textContent('#paste-pack-size')) === `${packKb(commonBody('en') + '\n' + wantA)} KB in all`, 'llm: with no series ticked, the total is the common body plus the request');
  await page.click('#paste-copy-guide');
  await page.waitForFunction(() => /^Copied/.test(document.getElementById('paste-copied').textContent));
  const clip0 = (await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))).replace(/\r\n/g, '\n');
  ok(clip0 === commonBody('en') + '\n' + wantA && !clip0.includes('## Series pack:'), 'llm: with no series ticked, the copied instructions are the common body and the request only');
  await page.evaluate(() => { const m = document.getElementById('paste-copied'); m.hidden = true; m.textContent = ''; });
  await page.click('#paste-series-academic');
  const total0 = await page.textContent('#paste-pack-size');
  ok(total0 === `${packKb(packWithRequest({ series: ['academic'], lang: 'en', request: wantA }))} KB in all`, 'llm: the total follows what is written in step 3: ' + total0);
  // 大きさは同じ測り方：合わせては、共通の本体と選んだ分野の和より小さくならない（バイトでも、出している KB でも）
  {
    const z = await page.evaluate(() => ({ total: +document.getElementById('paste-pack-size').dataset.bytes, common: +document.querySelector('label.paste-common').dataset.bytes,
      parts: [...document.querySelectorAll('#paste-series input:checked')].map((b) => b.value),
      shown: [document.getElementById('paste-pack-size').textContent, document.querySelector('label.paste-common').textContent] }));
    const sumB = z.common + z.parts.reduce((a, s) => a + packSize(seriesPart(s, 'en')), 0);
    const kbIn = (t) => parseFloat(/([\d.]+) KB/.exec(t)[1]);
    ok(z.parts.length === 1 && z.total >= sumB && kbIn(z.shown[0]) >= kbIn(z.shown[1]), `llm sizes: the total (${z.total} B, ${z.shown[0]}) is at least the common body plus the chosen subjects (${sumB} B; ${z.shown[1].trim()})`);
  }
  await shot('ai-step1.png');
  await page.click('#paste-copy-guide');
  await page.waitForFunction(() => /^Copied/.test(document.getElementById('paste-copied').textContent));
  await page.waitForFunction((c) => navigator.clipboard.readText().then((t) => t.replace(/\r\n/g, '\n') !== c).catch(() => false), clip0);
  const clip = (await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))).replace(/\r\n/g, '\n');   // Windows のクリップボードは CRLF にする
  ok(clip.startsWith('# Instructions for the AI') && clip.includes('**R-output**') && !clip.includes('For people.') && clip.includes('## Series pack: academic') && clip.includes('`<m-sweep>`') && !clip.includes('## Series pack: business') && !clip.includes('`<m-kpi>`'),
    `llm: “Copy instructions for your AI” copies the common body from “Instructions for the AI” and the academic pack (${Math.round(clip.length / 1024)} KB)`);
  ok(clip === packWithRequest({ series: ['academic'], lang: 'en', request: wantA }) && clip.endsWith(wantA) && clip.includes('- Topic: How binary search works') && clip.includes('- Examples or figures to include: Finding a name in a phone book\n  Guessing a number') && !clip.includes('*(Fill in A or B') && !clip.includes('**B. From our discussion so far**'),
    'llm: what was written for A is at the end of the copied instructions (the blank form and B are left out)');
  const copiedMsg = await page.textContent('#paste-copied');
  ok(/with what you wrote in step 4/.test(copiedMsg) && /If it turns into an attachment, just send it\./.test(copiedMsg) && /go to step 6/.test(copiedMsg), 'llm: after copying, the dialog says to send it even if it becomes an attachment: ' + copiedMsg);
  await shot('ai-step2.png');
  // B（このチャットでここまで話し合った内容で）
  await page.click('#paste-kind-b');
  ok(await page.isVisible('#paste-b-length') && !(await page.isVisible('#paste-a-topic')), 'llm: choosing B shows its fields and hides A');
  await page.fill('#paste-b-length', '10 minutes');
  await page.click('#paste-series-academic');
  await page.click('#paste-series-business');
  await page.click('#paste-series-info');
  await page.click('#paste-copy-guide');
  await page.waitForFunction((c) => navigator.clipboard.readText().then((t) => t.replace(/\r\n/g, '\n') !== c).catch(() => false), clip);
  const clipB = (await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))).replace(/\r\n/g, '\n');
  const wantB = withThemeLine(filledRequest({ kind: 'B', values: { length: '10 minutes', audience: '' } }, 'en'));
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
  // id とシード値（新規作成のたびに新しい。format spec §8.4）は比べない
  const noIds = (t) => t.replace(/ id="s-[a-z2-7]{6}"/g, '').replace(/ \{#s-[a-z2-7]{6}\}/g, '').replace(/ data-egatari-seed="\d+"/, '');
  const whole = { deck: noIds(F['deck.html']), narration: noIds(F['narration.md']) };
  const openPaste = async () => { await clickCommand(page, '#b-new'); await page.waitForSelector('#dlg[open] #paste-text'); };
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
  await openPaste();
  ok((await page.textContent('#b-new')) === 'New…' && !(await page.$('#b-paste')) && !(await page.$('#b-fiximport')) && !(await page.$('#paste-replace')),
    'llm: the Open menu has “New…” (no “Make with AI” / “Import AI fixes” entries; no replace choice)');
  ok((await page.$$eval('#paste-series input:checked', (xs) => xs.length)) === 0, 'llm: New… starts with no subject ticked, even with a business deck open (step 1 is optional)');
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
  await openPaste();
  await page.fill('#paste-text', replyOf(bad, badN, { labels: ['html title="deck.html"', 'md'] }));
  await clickDlg(page, '#dlg-import');
  await discard();
  await page.waitForFunction((d) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.docId !== d; }, docId1, { timeout: 30000 });
  await waitPanel();
  const sum2 = await page.textContent('#panel-body .sum');
  const items = await page.$$eval('#panel-body .res', (xs) => xs.map((x) => x.textContent));
  ok(/^[1-9]\d* errors/.test(sum2) && items.some((t) => /title is .*max 26/.test(t)) && items.some((t) => /narration \[4\] has no matching step.*valid keys are \[0\]/.test(t)) && items.some((t) => /reads an expression/.test(t)),
    'llm: quality check reports the long title, the orphan [4] and the expression reading: ' + sum2);
  { const bd = await page.evaluate(() => window.__APP_TEST.badge()); ok(bd.errs > 0 && bd.bad && !bd.hidden && bd.text.startsWith(`${bd.errs} error`), `llm: with errors, the Quality check badge shows the counts in the error colour ("${bd.text}")`); }
  const note2 = await page.textContent('#panel-body .hint');
  ok(/^The browser quality checker/.test(note2) && /If there are errors, press “Copy fix request for your AI” below/.test(note2), 'llm: with errors, the quality check note points to the fix request button below: ' + note2);
  ok((await page.textContent('#panel-body #b-revise')) === 'Revise…' && (await page.textContent('#panel-body #b-fixreq')) === 'Copy fix request for your AI', 'llm: the quality check panel starts with “Revise…” next to the fix request button');
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
  ok((await page.textContent('#dlg-paste')) === 'Paste the AI’s reply…', 'llm: the fix request dialog leads to “Paste the AI’s reply…”');
  await clickDlg(page, '#dlg-paste');
  await page.waitForSelector('#dlg[open] #paste-text');
  ok((await page.textContent('#dlg-title')) === 'Revise: have a chat AI fix it' && await page.$('#paste-wish') && !(await page.$('#paste-kind')) && (await page.textContent('#dlg-import')) === 'Import' && /Paste the fix request you copy here/.test(await page.textContent('#ai-howto'))
    && await page.evaluate(() => document.activeElement && document.activeElement.id === 'paste-text'),
    'llm: “Paste the AI’s reply…” in the fix request opens Revise at step 3 (the paste box has the focus; the reply goes into the current deck)');
  // 直しの返事も、囲みを 1 つずつ：deck.html（直したスライドだけ）→ 「これだけで取り込む」も出る → narration.md で合わせて取り込む
  await page.fill('#paste-text', fixedSec);
  await clickDlg(page, '#dlg-import');
  await page.waitForSelector('#dlg[open] #paste-state:not([hidden])');
  const heldFix = await page.textContent('#paste-state-text');
  ok(/^Got deck\.html \(1 slide; 1 of 2\)/.test(heldFix) && /Import just this/.test(heldFix) && /If the reply has only this one/.test(heldFix) && (await page.textContent('#dlg-only')) === 'Import just this', 'llm fix import: one block of a fix is kept, with “Import just this” for a fix that has only one: ' + heldFix);
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
  await testReplace({ ctx, BASE, ok, watch, bdeck, bnarr, shotDir });

  // 日本語の画面：入口の名前・大きさは日本語の指示のもの（英語の大きさではない。node kit/llm-pack.mjs --list --lang ja と同じ計算）・
  // 3 つのステップと、囲みを 1 つずつ貼ったときの知らせ（画像は shotDir があれば ai-step1-ja.png・ai-step2-ja.png・ai-step3-ja.png・paste-held-ja.png）
  {
    const pj = await ctx.newPage();
    watch(pj, 'llm-ja');
    await pj.goto(BASE + '?lang=ja');
    await pj.waitForSelector('#drop');
    ok((await pj.textContent('#w-new')) === '新規作成…', 'llm ja: the welcome screen has 「新規作成…」');
    await pj.click('#w-new');
    await pj.waitForSelector('#dlg[open] #paste-text');
    ok((await pj.textContent('#ai-howto')) === 'ブラウザの別のタブで、チャットの AI（Gemini・ChatGPT・Claude など）を開きます。ここでコピーする指示を貼って送ると、AI が教材を書きます。その返事を ⑥ に貼り付けます。' && (await pj.textContent('#dlg-title')) === '新規作成：チャットの AI に書いてもらう',
      'llm ja: the explanation before step 1 and the title');
    const heads = await pj.$$eval('#dlg-body section.paste-step h3', (xs) => xs.map((x) => x.textContent));
    ok(heads.join('|') === '① 場面（大分類・小分類）を選ぶ（選ばなくてもよい）|② お使いの AI と分野（使うパーツ）を選ぶ|③ デザイン（テーマ）を選ぶ|④ 頼みたいことを書く|⑤ AI への指示をコピーして、チャットに貼って送る|⑥ AI の返事を貼り付けて開く', 'llm ja: the 6 steps: ' + heads.join(' / '));
    const common = await pj.textContent('label.paste-common'), legend = await pj.textContent('#paste-series legend'), total = await pj.textContent('#paste-pack-size');
    const ja = packKb(commonBody('ja'));
    const jaA = packKb(packWithRequest({ series: [], lang: 'ja', request: filledRequest({ kind: 'A', values: { speakers: '1 人' } }, 'ja').replace(/\n*$/, '\n') + '- テーマ：default（<html data-theme="default">）\n' }));
    ok((await pj.textContent('#paste-series-hint')) === '数式・グラフ・データの図を使うなら「数理・統計（数式・関数・データ）」を選ぶ' && (await pj.$$eval('#paste-series input:checked', (xs) => xs.length)) === 0, 'llm ja: no series ticked with no deck open, and the hint names 「数理・統計（数式・関数・データ）」');
    ok(common.includes('共通の本体（必ず入る）') && common.includes(`${ja} KB`) && legend === '分野（使うパーツ）' && total.includes(`${jaA} KB`) && packSize(commonBody('ja')) !== packSize(commonBody('en')),
      `llm ja: the Japanese UI shows the sizes of the Japanese instructions (${common} / ${total})`);
    const scrollTo = (id) => pj.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'start' }), id);
    for (const [k, v] of Object.entries({ topic: '二分探索のしくみ', audience: '高校 2 年生', length: '5 枚', language: '日本語', examples: '電話帳で名前を探す' })) await pj.fill('#paste-a-' + k, v);
    if (shotDir) await pj.screenshot({ path: path.join(shotDir, 'ai-step1-ja.png') });
    await pj.click('#paste-copy-guide');
    await pj.waitForFunction(() => /^コピーしました/.test(document.getElementById('paste-copied').textContent));
    const clipJ = (await pj.evaluate(() => navigator.clipboard.readText().catch(() => ''))).replace(/\r\n/g, '\n');
    const cm = await pj.textContent('#paste-copied');
    ok(clipJ.endsWith('# 頼みたいこと\n\n**A. 新しく作る**\n\n- 題材：二分探索のしくみ\n- 対象（だれ向け）：高校 2 年生\n- 長さ（枚数か分）：5 枚\n- 言語：日本語\n- 話者：1 人\n- 入れたい例や図：電話帳で名前を探す\n- テーマ：default（<html data-theme="default">）\n') && /添付のファイルの形になっても、そのまま送ってください/.test(cm),
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
  // ---------------------------------------------------------------- 6. 新規作成の場面（大分類・小分類）・分野（パーツの組）・言いたいことの札（backlog #99）と、教材のシード値（format spec §8.4）
  // 画像は shotDir があれば new-kind-ja.png・new-purposes-ja.png・new-copy-ja.png
  {
    const pk = await ctx.newPage();
    watch(pk, 'llm-new');
    await pk.goto(BASE + '?lang=ja');
    await pk.waitForSelector('#drop');
    await pk.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; }, readText: async () => window.__copied || '' } }); });
    await pk.click('#w-new');
    await pk.waitForSelector('#dlg[open] #paste-step-kind');
    const scrollTo = (id) => pk.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'start' }), id);
    const cats = await pk.$$eval('#paste-cat label', (xs) => xs.map((x) => x.textContent));
    ok(cats.join('|') === '授業・研修|研究発表|ビジネス|手引き|その他' && !/学術/.test(await pk.textContent('#paste-step-kind')) && await pk.isHidden('#paste-sub') && await pk.isHidden('#paste-structure'),
      'new kind: the categories are 授業・研修／研究発表／ビジネス／手引き／その他 (no 学術); nothing chosen, no subcategories yet: ' + cats.join(' / '));
    await pk.check('#paste-cat-research');
    const subs = await pk.$$eval('#paste-sub label', (xs) => xs.map((x) => x.textContent));
    ok(subs.join('|') === '学会の口頭発表|ゼミ・進捗報告|招待講演・一般向け' && await pk.isChecked('#paste-sub-conference') && /^構成の型：背景 → 目的 → 方法 → 結果 → 考察 → 結論/.test(await pk.textContent('#paste-structure')),
      'new kind: 研究発表 shows its 3 subcategories, picks the first and shows its structure: ' + subs.join(' / '));
    await pk.check('#paste-sub-seminar');
    ok(/^構成の型：学会の口頭発表と同じ流れを短く。見せ方：密度は高くてよい$/.test(await pk.textContent('#paste-structure')), 'new kind: the subcategory sets the structure template');
    await pk.check('#paste-cat-guides');
    const gsubs = await pk.$$eval('#paste-sub label', (xs) => xs.map((x) => x.textContent));
    ok(gsubs.join('|') === 'マニュアル|規程・法令の説明|案内' && await pk.isChecked('#paste-sub-manual') && /^構成の型：目的/.test(await pk.textContent('#paste-structure')), 'new kind: 手引き has マニュアル／規程・法令の説明／案内 and picks the first: ' + gsubs.join(' / '));
    await pk.check('#paste-sub-rules');
    ok(/原典の文とその日付/.test(await pk.textContent('#paste-structure')), 'new kind: 規程・法令の説明 sets its structure');
    await pk.check('#paste-cat-other');
    ok((await pk.textContent('#paste-sub')).includes('この大分類には小分類はありません') && await pk.isHidden('#paste-structure'), 'new kind: その他 has no subcategory and no structure');
    // ビジネスの大分類はビジネスのパーツを入れておく（替えたら外す）
    await pk.check('#paste-cat-business');
    const bizOn = await pk.isChecked('#paste-series-business');
    await pk.check('#paste-cat-research');
    ok(bizOn && !(await pk.isChecked('#paste-series-business')) && await pk.isChecked('#paste-sub-conference'), 'new kind: choosing ビジネス ticks the business parts; another category unticks them again');
    await scrollTo('paste-step-kind');
    if (shotDir) await pk.screenshot({ path: path.join(shotDir, 'new-kind-ja.png') });
    // 分野の名前（学術はなし）・素材（いつも使える、押せない）・言いたいこと 14 個（既定で全部入り）
    const subj = await pk.$$eval('#paste-series label > span:not(.hint)', (xs) => xs.map((x) => x.textContent));
    ok(subj[0] === '数理・統計（数式・関数・データ）' && !subj.some((x) => /学術/.test(x)), 'new subjects: part sets 数理・統計・ビジネス・国語・情報: ' + subj.join(' / '));
    const mats = await pk.$$eval('#paste-materials li', (xs) => xs.map((x) => [x.textContent, x.tagName, !!x.querySelector('button,input')]));
    ok(mats.map((m) => m[0]).join() === '表,画像,数式,図形' && mats.every((m) => !m[2]), 'new materials: 表・画像・数式・図形 are always available (not toggles)');
    ok(await pk.isHidden('#paste-purposes') && (await pk.textContent('#paste-purposes-fold-h')) === 'AI に使わせない表し方を選ぶ（選ばなくてよい） いまは全部使う', 'new purposes: the tiles start in a closed fold');
    await pk.click('#paste-purposes-fold-h');
    const tiles = await pk.$$eval('#paste-purposes button.tile', (xs) => xs.map((x) => [x.id, x.getAttribute('aria-pressed'), x.querySelector('.tile-label').textContent]));
    ok(tiles.length === 14 && tiles.every((t) => t[1] === 'true') && tiles[0][2] === '比べる（量・特徴）' && tiles[13][2] === '目次' && (await pk.textContent('#paste-purposes-sum')) === '言いたいこと：14 個のうち 14 個が入っています',
      'new purposes: 14 tiles, all on by default: ' + tiles.map((t) => t[2]).join('・'));
    await pk.fill('#paste-a-topic', '研究の進め方');
    const copy = async () => {
      await pk.evaluate(() => { window.__copied = null; });
      await pk.click('#paste-copy-guide');
      await pk.waitForFunction(() => window.__copied !== null);
      return pk.evaluate(() => window.__APP_TEST.lastCopy || window.__copied);
    };
    const c1 = await copy();
    ok(c1.includes('- 場面：研究発表／学会の口頭発表\n- 構成の型：背景 → 目的') && c1.includes('### `<m-flow>`') && c1.includes('| `<m-menu>` |') && !c1.includes('使わない言いたいこと') && c1.includes('**R-purpose**'),
      'new copy: the request has the kind, its structure and presentation; with all purposes on, every part is described');
    const size1 = +(await pk.getAttribute('#paste-pack-size', 'data-bytes'));
    // 外す：手順・目次 → 印が消えて薄く斜線、指示からその部品（m-flow・m-menu）の説明が消え、外したことを頼む文に書く
    await pk.click('#paste-purpose-process');
    await pk.click('#paste-purpose-contents');
    const offStyle = await pk.$eval('#paste-purpose-process', (b) => { const cs = getComputedStyle(b); return { o: +cs.opacity, deco: getComputedStyle(b.querySelector('.tile-label')).textDecorationLine, pressed: b.getAttribute('aria-pressed') }; });
    ok(offStyle.pressed === 'false' && offStyle.o < 1 && offStyle.deco.includes('line-through') && (await pk.textContent('#paste-purposes-sum')) === '言いたいこと：14 個のうち 12 個が入っています' && (await pk.textContent('#paste-purposes-fold-sum')) === '2 個を外した',
      'new purposes: a tile turned off is aria-pressed=false, faded and struck through (not colour alone)');
    const c2 = await copy();
    const size2 = +(await pk.getAttribute('#paste-pack-size', 'data-bytes'));
    ok(!c2.includes('### `<m-flow>`') && !c2.includes('| `<m-menu>` |') && c2.includes('### `<m-bars>`') && c2.includes('- 使わない言いたいこと（作者が外した）：手順・工程・目次。その表し方（`m-flow`・`m-menu`）は使わない') && size2 < size1 && +(await pk.getAttribute('label.paste-common', 'data-bytes')) <= size2,
      `new copy: turning purposes off removes their parts from the copied pack and says so (${size1} → ${size2} bytes; the common body's size follows)`);
    await scrollTo('paste-purposes');
    if (shotDir) await pk.screenshot({ path: path.join(shotDir, 'new-purposes-ja.png') });
    await scrollTo('paste-step2');
    if (shotDir) await pk.screenshot({ path: path.join(shotDir, 'new-copy-ja.png') });
    // 有料版：分野を隠し、すべての系列を入れる。外した札はそのまま効く
    await pk.check('#paste-plan-paid');
    ok(await pk.isHidden('#paste-series') && await pk.isHidden('#paste-series-hint') && await pk.isVisible('#paste-series-paid') && await pk.isVisible('#paste-purpose-process'),
      'new plan: the paid plan hides the subjects (everything is included) and keeps the purpose tiles');
    const c3 = await copy();
    const size3 = +(await pk.getAttribute('#paste-pack-size', 'data-bytes'));
    ok(c3.includes('`<m-sweep>`') && c3.includes('### `<m-timeline>`') && !c2.includes('m-timeline') && !c2.includes('m-venn') && c3.includes('`<m-kanbun>`') && c3.includes('`<m-codetree>`') && c3.includes('`<m-quad>`') && !c3.includes('### `<m-flow>`') && !/m-menu(?![a-z-])/.test(c3.replace(/^- 使わない言いたいこと.*$/m, '')) && size3 > size2,
      `new plan: the paid plan copies every series pack and the paid-only parts (m-timeline; the free copy names none of them), and still leaves out the parts of the purposes turned off (${size2} → ${size3} bytes)`);
    // 写した後に札を変えても、egatari.json に残すのは写したときの選び方
    await pk.click('#paste-purpose-timeline');
    // 開く：シード値を <html> に 1 回だけ書き（返事が data-egatari-seed="42" を書いていても新しい値）、選んだものを egatari.json の studio.newDeck に
    await pk.fill('#paste-text', replyOf(worked('kokugo', 'deck.html').replace('<html ', '<html data-egatari-seed="42" '), worked('kokugo', 'narration.md')));
    await clickDlg(pk, '#dlg-import');
    await pk.waitForFunction(() => { const s = window.__APP_TEST.state(); return s && s.portable; }, null, { timeout: 30000 });
    const filesOf = () => pk.evaluate(() => { const f = window.__APP_TEST.files(); const d = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, d(v)])); });
    const F1 = await filesOf();
    const seed = seedOf(F1['deck.html']);
    const nd = JSON.parse(F1['egatari.json'] || '{}').studio?.newDeck;
    ok(Number.isInteger(seed) && seed !== 42 && (F1['deck.html'].match(/data-egatari-seed/g) || []).length === 1 && /<html[^>]*\sdata-egatari-seed="\d+"/.test(F1['deck.html']) && JSON.stringify(nd) === JSON.stringify({ v: 1, plan: 'paid', category: 'research', subcategory: 'conference', subjects: [], purposesOff: ['contents', 'process'] }),
      `new open: a fresh seed is written once on <html> (${seed}; the reply's 42 is replaced) and the choices copied are kept in egatari.json studio.newDeck (not the tile changed after copying)`);
    // 修正…：返事が <html> を書き直してシード値を落としても、前のシード値のまま
    await pasteReplace(pk, replyOf(worked('kokugo', 'deck.html').replace('<title>', '<title>改 '), worked('kokugo', 'narration.md')));
    // 板の結果は前の品質チェックのものが先に出ることがあるので、置き換えた原稿が入るまで待つ
    await pk.waitForFunction(() => { const f = window.__APP_TEST.files(); return f && new TextDecoder().decode(Uint8Array.from(atob(f['deck.html']), (c) => c.charCodeAt(0))).includes('<title>改 '); }, null, { timeout: 30000 });
    const F2 = await filesOf();
    ok(seedOf(F2['deck.html']) === seed && F2['deck.html'].includes('<title>改 '), `new revise: a revised deck without the seed keeps the earlier seed (${seedOf(F2['deck.html'])}; ${(F2['deck.html'].match(/<title>[^<]*/) || [''])[0]})`);
    // 保存：1 ファイルにもシード値（組み立てた <html> と中の原稿）
    await pk.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('seed-' + Date.now() + '.ega.html', { create: true }); });
    const sv = pk.evaluate(() => window.__APP_TEST.save('save'));
    const which = await Promise.race([sv.then(() => 'saved'), pk.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 }).then(() => 'tierB')]);
    if (which === 'tierB') await clickDlg(pk, '#dlg-rebuild');
    await sv;
    const saved = await pk.evaluate(async () => (await (await window.__APP_TEST.saveHandle.getFile()).text()));
    const F3 = await filesOf();
    ok(seedOf(saved) === seed && seedOf(F3['deck.html']) === seed, 'new save: the saved single file carries the same seed');
    await pk.close();
  }
  await ctx.close();
}

// 貼り付けの窓から「今のデッキを置き換える」で取り込み、品質チェックの板の結果（.sum か、確かめられなかった言葉）を返す
// 「修正…」は道具の列の「スライド ▾」にある（品質チェックの板の先頭にもある。そちらは上の試験で確かめる）
async function openRevise(p, sel = '#paste-text') {
  await clickCommand(p, '#b-revise-cmd');
  await p.waitForSelector('#dlg[open] ' + sel, { timeout: 10000 });
}
async function pasteReplace(p, text, { only = false } = {}) {
  await openRevise(p);
  await p.evaluate(() => { document.getElementById('panel').hidden = true; });
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

    // ---------------------------------------------------------------- 5c. 修正…：① 直してほしいこと・開いているメモ（comments.json）が修正依頼に入る。直すことがなければそう言う
    await openRevise(p, '#paste-wish');
    ok((await p.textContent('#dlg-title')) === 'Revise: have a chat AI fix it' && /Paste the fix request you copy here/.test(await p.textContent('#ai-howto')) && !(await p.$('#dlg-body input[type=radio]')),
      'llm revise: “Revise…” opens “Revise: have a chat AI fix it” with the explanation first and no mode choice');
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
    ok(rev.includes('## What I want changed\n\nMake the second slide shorter') && rev.includes('## Open notes (comments)') && rev.includes('“3 か月”: Use a bar chart here') && !rev.includes('Already done') && rev.includes('````deck.html') && /1 note\(s\)/.test(await p.textContent('#paste-copied')),
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
    ok((await p.textContent('#dlg-title')) === 'Insert slide: have a chat AI write it' && (await p.textContent('#paste-insert-where')) === `Insert after slide 1, “${heads3[0]}”` && /Open a chat AI/.test(await p.textContent('#ai-howto'))
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
    ok(await p.isVisible('#paste-pack-parts'), 'llm insert: ticking “Also include the instructions” shows the common body and series');
    await p.click('#paste-copy-guide');
    await p.waitForFunction((c) => navigator.clipboard.readText().then((t) => t.replace(/\r\n/g, '\n') !== c).catch(() => false), insReq);
    const insPack = (await p.evaluate(() => navigator.clipboard.readText().catch(() => ''))).replace(/\r\n/g, '\n');
    ok(insPack.startsWith('# Instructions for the AI') && insPack.endsWith(insReq) && !insPack.includes('# What I want'), 'llm insert: with the instructions, the pack comes first and the insert request replaces “What I want” at the end');
    await p.uncheck('#paste-with-pack');
    if (shotDir) await p.screenshot({ path: path.join(shotDir, 'insert-ai.png') });
    // 返事：囲みを 1 つずつ（deck.html → narration.md）。id のないスライド 2 枚
    const newDeck = '<section class="slide">\n  <h2>Worked example</h2>\n  <div class="body"><p>Step by step.</p></div>\n  <div class="concl"><span>Done.</span></div>\n</section>\n\n<section class="slide noconcl">\n  <h2>Try it</h2>\n  <div class="body"><p>Your turn.</p></div>\n</section>';
    const newNarr = '## Worked example\n[0] Here is a worked example.\n[concl] That is all.\n\n## Try it\n[0] Now try it yourself.';
    await p.fill('#paste-text', newDeck);
    await clickDlg(p, '#dlg-import');
    await p.waitForSelector('#dlg[open] #paste-state:not([hidden])');
    ok(/^Got deck\.html \(2 slides; 1 of 2\)/.test(await p.textContent('#paste-state-text')) && await p.$('#dlg-only'), 'llm insert: the slides block pasted alone is kept (with “Import just this”)');
    await p.fill('#paste-text', newNarr);
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
