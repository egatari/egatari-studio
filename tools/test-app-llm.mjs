// 編集アプリの「AI の出力を貼り付ける」と「AI への修正依頼を写す」（app/llm.js）の確認。tools/test-app.mjs が呼ぶ
// test-all: part of test-app（tools/test-app.mjs が読み込む。単独では走らせない）
//   testLlm({browser, BASE, ok, watch, shotDir})
// 1. 貼り付けの窓：開く・指示を写す（系列を選ぶ：新しいデッキなら academic、開いているデッキならその部品・テーマから推したもの）・
//    誤り（囲みなし・閉じていない囲み）を窓の中に出す
// 2. 見本の返事（tools/llm-guide/worked/business：前置きの文章・```html と ```markdown・CRLF）を取り込む → 新しい 1 ファイルとして開き、
//    スライドに id が付き、口述原稿の見出しが {#id} になり、品質チェックのエラーが 0
// 3. スクリプトの入った返事：コードの確かめが出て、取り消せば開かない（前のデッキのまま）
// 4. 規格を破った返事 → 品質チェックのエラー → 修正依頼の文章に、エラーの言葉・規格の名前と文章・今のファイルが入る →
//    直したスライドだけの返事を「今のデッキを置き換える」で取り込む → docId はそのまま、そのスライドだけが替わり、エラー 0
// 5. ほかのデッキ（見本の 1 ファイル・作業フォルダ）を開いていて、別のデッキの返事を「今のデッキを置き換える」で取り込む →
//    品質チェックが新しいプレビューに答える（前の読み込みに頼んで「応答しません」にならない）・プレビューが新しいデッキ・保存できる・
//    直したスライドだけの置き換えも同じ。結果が 0 件の品質チェックの説明の文
// 画像（shotDir があれば）：paste-dialog(-ja).png・paste-error.png・paste-cutoff.png・paste-opened.png・fix-check.png・fix-request.png・fix-replaced.png（1280×800）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack, packSize, packKb, kbOf } from '../kit/core/llm-pack.mjs';

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
  ok(boxes.map((b) => b[0]).join() === 'academic,business,kokugo,info' && boxes.filter((b) => b[1]).map((b) => b[0]).join() === 'academic' && boxes.every((b) => /\+\d+\.\d KB$/.test(b[2])) && boxes[0][2].endsWith(`+${kbOf(packSize(buildPack({ series: ['academic'], lang: 'en' })) - packSize(buildPack({ series: [], lang: 'en' })))} KB`),
    'llm: the instructions have series checkboxes with sizes; with no deck open, academic is ticked: ' + JSON.stringify(boxes.map((b) => b[2])));
  ok((await page.textContent('#paste-series legend')) === `Series (added to the common body, ${packKb(buildPack({ series: [], lang: 'en' }))} KB)` && (await page.textContent('#paste-pack-size')) === `${packKb(buildPack({ series: ['academic'], lang: 'en' }))} KB in all`,
    'llm: the legend gives the common body size and the total is shown, with the same calculation as node kit/llm-pack.mjs --list (UTF-8 bytes / 1024, English UI → English pack)');
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
  ok(/^0 errors/.test(sum1), 'llm: the quality check runs after import and reports no errors: ' + sum1);
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

  // ---------------------------------------------------------------- 4. 規格を破った返事 → 修正依頼 → 置き換え
  const bad = bdeck.replace('<h2>導入から 3 か月の結果</h2>', '<h2>新しい仕分けの手順を入れてから 3 か月がたった今の結果のまとめ</h2>');
  const badN = bnarr.replace('## 導入から 3 か月の結果', '## 新しい仕分けの手順を入れてから 3 か月がたった今の結果のまとめ')
    .replace('[concl] 件数が増えても', '[4] {1-η|いちマイナスイータ} は使わない例です。\n[concl] 件数が増えても');
  await page.click('#panel-close');   // 前の結果の板を閉じておく（新しい品質チェックの板を待つため）
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
  ok(/^0 errors/.test(sum3), 'llm: after the fix the quality check reports no errors: ' + sum3);
  await shot('fix-replaced.png');

  // ---------------------------------------------------------------- 5. ほかのデッキを開いていて、別のデッキの返事で「今のデッキを置き換える」
  // （1 ファイルの見本と作業フォルダ。置き換えの直後の品質チェックが、前の読み込みのプレビューに頼んで「デッキが応答しません」にならない）
  await testReplace({ ctx, BASE, ok, watch, bdeck, bnarr });

  // 日本語の画面：大きさは日本語の指示のもの（英語の大きさではない）。node kit/llm-pack.mjs --list --lang ja と同じ計算
  {
    const pj = await ctx.newPage();
    watch(pj, 'llm-ja-size');
    await pj.goto(BASE + '?lang=ja');
    await pj.waitForSelector('#drop');
    await pj.click('#w-paste');
    await pj.waitForSelector('#dlg[open] #paste-text');
    const legend = await pj.textContent('#paste-series legend'), total = await pj.textContent('#paste-pack-size');
    const ja = packKb(buildPack({ series: [], lang: 'ja' })), jaA = packKb(buildPack({ series: ['academic'], lang: 'ja' }));
    ok(legend.includes(`${ja} KB`) && total.includes(`${jaA} KB`) && ja !== packKb(buildPack({ series: [], lang: 'en' })),
      `llm: the Japanese UI shows the sizes of the Japanese instructions (${legend} / ${total})`);
    await pj.close();
  }
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

// 貼り付けの窓から「今のデッキを置き換える」で取り込み、品質チェックの板の結果（.sum か、確かめられなかった言葉）を返す
async function pasteReplace(p, text) {
  await p.evaluate(() => { document.getElementById('panel').hidden = true; });
  await p.click('#b-openmenu');
  await p.click('#b-paste');
  await p.waitForSelector('#dlg[open] #paste-text');
  await p.fill('#paste-text', text);
  await p.check('#paste-replace');
  const t0 = Date.now();
  await p.click('#dlg-import');
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
    // 保存：置き換えた中身が 1 ファイルに入り、保存していない印が消える
    await p.evaluate(async () => { const root = await navigator.storage.getDirectory(); window.__APP_TEST.saveHandle = await root.getFileHandle('replaced-' + Date.now() + '.ega.html', { create: true }); });
    const sv = p.evaluate(() => window.__APP_TEST.save('save'));
    const which = await Promise.race([sv.then(() => 'saved'), p.waitForSelector('#dlg[open] #dlg-rebuild', { timeout: 30000 }).then(() => 'tierB')]);
    if (which === 'tierB') await p.click('#dlg-rebuild');
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
