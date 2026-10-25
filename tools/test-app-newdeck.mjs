// test-all: part of test-app
// 新規作成・スライドの挿入・修正の流れ（app/llm.js。handoff/new-deck-flow-2026-10-25.md の S1〜S7）を、使う人として本物の画面で通して歩く。tools/test-app.mjs が呼ぶ
//   testNewDeckFlow({browser, BASE, ok, watch, shotDir})
// S1 小学校の先生（ja・無料のプラン）：① は答える問い（既定の印なし・小分類も答える・［次へ］は答えるまで押せない）→ 答えた問いは 1 行にたたむ →
//    ② タイトルと長さ（6 枚）→ ③ → ④ 写した指示（AI に任せた項目は書かない）→ ⑤ どちらかの欄に出力の全体 → 2 つに分ける →［作成］→ studio.newDeck・シード値
// S6 S1 の先生がスライドを 1 枚挿入（別のチャット：指示の全体も付ける）。出力の全体を台本の欄に貼る →［挿入］
// S2 大学の事務職員（en）：① その他（小分類なし・構成の行なし）→［変更］で 手引き／この中にない（場面の行だけ。subcategory: null）→
//    ⑤ 違う欄に貼ったものを移す・スライドだけなら「台本なしで作成します」
// S7 S2 のデッキを修正：直したスライドだけの出力 → そのスライドだけを置き換える（台本は今のまま）
// S3 会社員（en・有料のプラン）：長さを 20 分 → 2 回に分けて頼む（1 分 ≒ 1 枚）・① の場面から推した分野・⑤ は構成案の欄から → 1〜6 枚目 →［作成］
// S4 国語の先生（ja）：② のタイトルと内容から国語に印・詳しくの要約（言語・話す人・そのほかの希望）・［変更］で直す・自分で替えた印は上書きしない・コードブロックを 1 つずつ
// S5 大学の教員（ja・有料のプラン）：内容は「チャットの AI に渡してある」→ B の頼み方。詳しくも出し、A と同じ形でタイトル・だれ向け・長さ・言語・話者・希望
// S8 高校の先生（ja・無料のプラン）：分野は 2 つまで。推した印も 2 つまで、2 つでほかは押せずわけを出す、外すとまた押せる、有料のプランは限りなし
// S9 前に分野を選んだ教材を開いたまま新規作成：前の選び方は読まず、いつも印なしから（egatari.json は書き換えない）
// どの場面も：押せない［作成］［挿入］［置き換える］の横に、欠けているもののうち最初の 1 つ（「① に答えてください」など）。押せるときの添え書きもボタンの横
// 画像（shotDir があれば）：flow-s1-kind.png・flow-s1-answered.png・flow-s1-paste.png・flow-s2-moved.png・flow-s3-outline.png・flow-s4-more.png・flow-s5.png・flow-s6-insert.png・flow-s7-revise.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packWithRequest } from '../kit/core/llm-request.mjs';
import { CATEGORIES, seedOf } from '../kit/core/new-deck.mjs';
import { SERIES, FREE_CORE, buildPack } from '../kit/core/llm-pack.mjs';
import { PART_LABELS } from '../kit/core/part-labels.mjs';
import { replyOf } from './test-app-llm.mjs';
import { slidesOf } from './test-app-outline.mjs';
import { clickDlg, clickCommand } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const worked = (n, f) => fs.readFileSync(path.join(ROOT, 'tools', 'llm-guide', 'worked', n, f), 'utf8').replace(/\r\n/g, '\n');
const sub = (c, s) => CATEGORIES.find((x) => x.id === c).subs.find((x) => x.id === s);

export async function testNewDeckFlow({ browser, BASE, ok, watch, shotDir }) {
  const contexts = [];
  const open = async (lang, tag) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
    contexts.push(ctx);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin }).catch(() => {});
    const p = await ctx.newPage();
    watch(p, tag);
    await p.goto(BASE + '?lang=' + lang);
    await p.waitForSelector('#drop');
    return p;
  };
  const shot = async (p, name, id) => { if (!shotDir) return; if (id) await p.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'start' }), id); await p.screenshot({ path: path.join(shotDir, name) }); };
  const startNew = async (p) => { await p.click('#w-new'); await p.waitForSelector('#dlg[open] #paste-step-kind'); };
  const text = (p, sel) => p.textContent(sel);
  const visible = (p, ids) => Promise.all(ids.map((id) => p.isVisible('#' + id)));
  const answer = (p, k) => p.textContent(`#paste-step-${k}-answer .paste-answer-text`);
  // 1 つだけ開く流れ：段の状態（id: expanded・current・pending・本体が見えるか・答えの 1 行が見えるか）
  const flowState = (p) => p.$$eval('#dlg-body section.paste-step', (xs) => xs.map((x) => {
    const b = x.querySelector('.paste-step-h'), body = x.querySelector('.paste-step-body'), ans = x.querySelector('.paste-answered');
    return [x.id.replace(/^paste-step-?/, ''), b.getAttribute('aria-expanded') === 'true' ? 'open' : 'shut', b.getAttribute('aria-current') || '-', x.classList.contains('pending') ? 'pending' : '-',
      body.hidden || !body.getClientRects().length ? 'nobody' : 'body', ans && !ans.hidden && ans.getClientRects().length ? 'answer' : '-'].join(':');
  }).join(' '));
  const copy = async (p) => {
    // コピーのボタンが閉じた段にあれば、その段を見出しから開く（コピーすると次の段が開く）
    if (!(await p.isVisible('#paste-copy-guide'))) await p.evaluate(() => document.getElementById('paste-copy-guide').closest('section.paste-step').querySelector('.paste-step-h').click());
    await p.evaluate(() => { window.__APP_TEST.lastCopy = null; const m = document.getElementById('paste-copied'); m.hidden = true; m.textContent = ''; });
    await p.click('#paste-copy-guide');
    await p.waitForFunction(() => window.__APP_TEST.lastCopy !== null && !document.getElementById('paste-copied').hidden && document.getElementById('paste-copied').textContent);
    return p.evaluate(() => window.__APP_TEST.lastCopy.replace(/\r\n/g, '\n'));
  };
  const tailOf = (c, lang) => c.slice(c.indexOf(lang === 'ja' ? '# 頼みたいこと' : '# What I want'));
  const files = (p) => p.evaluate(() => { const f = window.__APP_TEST.files(); if (!f) return null; const d = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, d(v)])); });
  const status = (p) => p.evaluate(() => ({ deck: document.getElementById('paste-deck-st').textContent, narr: document.getElementById('paste-narr-st').textContent, info: document.getElementById('paste-info').hidden ? '' : document.getElementById('paste-info').textContent,
    go: document.getElementById('dlg-import').textContent, goOff: document.getElementById('dlg-import').disabled, note: (document.getElementById('paste-go-note') || {}).textContent || '',
    beside: !!document.getElementById('paste-go-note') && document.getElementById('dlg-import').previousElementSibling === document.getElementById('paste-go-note') }));
  // ［作成］：新しい 1 ファイルとして開き、品質チェックの板が出るまで
  const create = async (p, dirty = false) => {
    const before = await p.evaluate(() => (window.__APP_TEST.state().portable || {}).docId || null);
    await clickDlg(p, '#dlg-import');
    if (dirty) { await p.waitForSelector('#dlg[open] #dlg-discard', { timeout: 30000 }); await clickDlg(p, '#dlg-discard'); }
    await p.waitForFunction((d) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.docId !== d && s.loads > 0 && s.frameLoaded === s.loads; }, before, { timeout: 30000 });
    await p.waitForSelector('#panel:not([hidden]) #panel-body .sum', { timeout: 30000 });
    return files(p);
  };
  const newDeckOf = (F) => (JSON.parse(F['egatari.json'] || '{}').studio || {}).newDeck;

  try {
    // ================================================================ S1 小学校の先生：明日の理科「てこのはたらき」を 6 枚で（無料の ChatGPT、出力の全体を貼る）
    const p1 = await open('ja', 's1');
    await startNew(p1);
    ok((await text(p1, '#dlg-title')) === '新規作成' && (await text(p1, '#ai-howto')) === '4 つの問いに答えると、チャットの AI（ChatGPT・Gemini・Claude など）に送る指示ができます。AI の出力をここに貼り付けると、スライドができます。',
      'S1: the page is 「新規作成」 and says: answer four questions, paste the output');
    const heads = await p1.$$eval('#dlg-body section.paste-step h3', (xs) => xs.map((x) => x.textContent));
    ok(heads.join('|') === '① どんな場面で使いますか|② 何について、だれに向けて作りますか|③ どんな見た目にしますか|④ チャットの AI に指示を送ります|⑤ AI の出力を貼り付けます', 'S1: five questions in thinking order: ' + heads.join(' / '));
    ok(JSON.stringify(await visible(p1, ['paste-step-kind', 'paste-step-content', 'paste-step-theme', 'paste-step-send', 'paste-step-paste'])) === '[true,true,true,true,true]'
      && (await flowState(p1)) === 'kind:open:step:-:body:- content:shut:-:pending:nobody:- theme:shut:-:pending:nobody:- send:shut:-:pending:nobody:- paste:shut:-:pending:nobody:-'
      && (await p1.$$eval('#dlg-body .paste-step-h', (xs) => xs.every((x) => x.tagName === 'BUTTON' && x.closest('h3') && x.getAttribute('aria-controls')))),
      'S1: all five headings are shown (buttons with aria-expanded); only ① is open (aria-current="step"); the later ones are headings only, greyed: ' + await flowState(p1));
    await shot(p1, 'flow-s1-one-open.png');
    let st0 = await status(p1);
    ok(st0.go === '作成' && st0.goOff && st0.note === '① に答えてください' && st0.beside, 'S1: 「作成」 stays in place, disabled, with 「① に答えてください」 right beside it: ' + JSON.stringify(st0));
    ok((await p1.$$eval('#paste-cat input:checked', (xs) => xs.length)) === 0 && await p1.isDisabled('#paste-next-kind') && await p1.isHidden('#paste-sub')
      && (await text(p1, '#paste-step-kind .hint')) === '使う場面に合った組み立て（授業なら導入・展開・まとめ）を AI に伝えます。あてはまるものがなければ「その他」を選びます' && !(await p1.$('#paste-step-kind button:has-text("飛ばす")')),
      'S1 ①: nothing is pre-selected, 「次へ」 is disabled until there is an answer, the hint names 「その他」, no skip button');
    ok((await p1.$$eval('#paste-cat label', (xs) => xs.map((x) => x.textContent))).join('|') === '授業・研修|研究発表|ビジネス|手引き|その他', 'S1 ①: the settings keep 「その他」');
    // その他：小分類はなく、すぐ答えになる。授業・研修に替えると小分類も答える問い（印なし・最後は「この中にない」）
    await p1.check('#paste-cat-other');
    ok(await p1.isHidden('#paste-sub') && !(await p1.isDisabled('#paste-next-kind')), 'S1 ①: 「その他」 has no subcategory and is an answer');
    await p1.check('#paste-cat-teaching');
    const subs1 = await p1.$$eval('#paste-sub label', (xs) => xs.map((x) => x.textContent));
    ok(subs1.join('|') === '授業（小・中・高）|大学の講義|研修・使い方の説明|この中にない' && (await p1.textContent('#paste-sub legend')) === 'もう少し詳しく言うと' && (await p1.$$eval('#paste-sub input:checked', (xs) => xs.length)) === 0 && await p1.isDisabled('#paste-next-kind'),
      'S1 ①: 「もう少し詳しく言うと」 lists the subcategories and ends with 「この中にない」; none is ticked and 「次へ」 waits for it: ' + subs1.join(' / '));
    await p1.check('#paste-sub-class');
    ok((await text(p1, '#paste-structure')) === `組み立て：${sub('teaching', 'class').structure.ja}。見せ方：${sub('teaching', 'class').show.ja}` && !(await p1.isDisabled('#paste-next-kind')), 'S1 ①: the subcategory shows its structure; 「次へ」 is enabled');
    await shot(p1, 'flow-s1-kind.png', 'paste-step-kind');
    await p1.click('#paste-next-kind');
    ok((await answer(p1, 'kind')) === '使う場面：授業・研修／授業（小・中・高）' && await p1.isHidden('#paste-step-kind .paste-q-body') && (await text(p1, '#paste-change-kind')) === '変更'
      && await p1.isVisible('#paste-step-content') && await p1.evaluate(() => document.activeElement && document.activeElement.id === 'paste-title'),
      'S1 ①: the answered question collapses to 「使う場面：授業・研修／授業（小・中・高）［変更］」 and ② opens with the focus on the title');
    ok((await flowState(p1)) === 'kind:shut:-:-:body:answer content:open:step:-:body:- theme:shut:-:pending:nobody:- send:shut:-:pending:nobody:- paste:shut:-:pending:nobody:-', 'S1: ② is the one open step, ① is its summary: ' + await flowState(p1));
    // ② タイトル（必須）・だれ向け・長さ・内容は「AI に任せる」が既定で欄は閉じている。例の文は ① の答えに合わせる
    ok(await p1.isDisabled('#paste-next-content') && (await p1.getAttribute('#paste-title', 'placeholder')) === '例：てこのはたらき' && (await text(p1, 'label[for=paste-title]')) === 'タイトル（表紙に出ます）'
      && await p1.isChecked('#paste-audience-mode-ai') && await p1.isHidden('#paste-audience') && await p1.isChecked('#paste-length-mode-ai') && await p1.isHidden('#paste-length-n') && await p1.isChecked('#paste-content-mode-ai') && await p1.isHidden('#paste-content')
      && (await text(p1, '#paste-audience-mode')).includes('AI に任せる（① の使う場面から考えます）') && (await text(p1, '#paste-length-mode')).includes('AI に任せる（5〜8 枚くらいにします）') && (await text(p1, '#paste-content-mode')).includes('AI に任せる（タイトルだけで考えます）')
      && (await text(p1, '#paste-more-h')) === '詳しく：日本語・1 人で説明' && !(await p1.$('#dlg-body [name=examples]')),
      'S1 ②: the title is required (「次へ」 disabled), audience, length and content default to 「AI に任せる」 with their fields closed, the 詳しく fold says 「日本語・1 人で説明」; no 「入れたい例や図」');
    st0 = await status(p1);
    ok(st0.goOff && st0.note === '② のタイトルを書いてください' && st0.beside, 'S1 ②: with ① answered, the reason beside 「作成」 moves on to 「② のタイトルを書いてください」');
    await p1.check('#paste-audience-mode-write');
    ok(await p1.isVisible('#paste-audience') && (await p1.getAttribute('#paste-audience', 'placeholder')) === '例：小学 6 年生', 'S1 ②: choosing 「書く」 opens the field, with a placeholder for the setting');
    await p1.check('#paste-audience-mode-ai');
    await p1.fill('#paste-title', 'てこのはたらき');
    await p1.check('#paste-length-mode-write');
    await p1.fill('#paste-length-n', '6');
    ok(!(await p1.isDisabled('#paste-next-content')) && (await p1.inputValue('#paste-length-unit')) === 'slides', 'S1 ②: with a title, 「次へ」 is enabled; the length unit defaults to 枚');
    await p1.click('#paste-next-content');
    ok((await answer(p1, 'content')) === 'タイトル：てこのはたらき・6 枚' && await p1.isVisible('#paste-step-theme'), 'S1 ②: collapses to 「タイトル：てこのはたらき・6 枚」');
    ok((await p1.inputValue('#paste-theme')) === 'default' && (await text(p1, '#paste-step-theme .hint')) === 'スライドの色と書体です。あとで「テーマを変更…」で変えられます', 'S1 ③: the default theme and the hint about 「テーマを変更…」');
    await p1.click('#paste-next-theme');
    ok((await answer(p1, 'theme')) === 'テーマ：標準' && (await flowState(p1)) === 'kind:shut:-:-:body:answer content:shut:-:-:body:answer theme:shut:-:-:body:answer send:open:step:-:body:- paste:shut:-:pending:nobody:-'
      && await p1.isHidden('#paste-deck') && await p1.evaluate(() => document.activeElement && document.activeElement.id === 'paste-plan-free'),
      'S1 ③: collapses to 「テーマ：標準」; ④ opens with the focus on its first control, and ⑤ is only a heading (no paste fields yet): ' + await flowState(p1));
    await shot(p1, 'flow-s1-answered.png', 'paste-step-kind');
    // ④ プランの問い（無料が既定）→ 分野（てこからは推せない：印なし）→ 図の折りたたみ（閉じている）→ コピー
    ok(await p1.isChecked('#paste-plan-free') && (await text(p1, '#paste-plan legend')) === 'お使いのチャットの AI は、無料のプランですか、有料のプランですか' && (await text(p1, 'label:has(#paste-plan-free)')) === '無料のプラン（わからなければこちら）'
      && (await p1.$$eval('#paste-series .tile[aria-pressed=true]', (xs) => xs.length)) === 0 && await p1.isHidden('#paste-series-guess') && (await text(p1, '#paste-series legend')) === 'スライドに出てくるものはありますか（内容の分野）'
      && await p1.$eval('#paste-purposes-fold', (d) => !d.open) && (await text(p1, '#paste-purposes-fold-h')) === 'パーツを見る・伝えたいことを外す（ふつうは開かなくて大丈夫） パーツ：3 種類（外したもの 0）' && /^指示の大きさ：[\d.]+ KB$/.test(await text(p1, '#paste-pack-size')),
      'S1 ④: the plan question (free by default), the subjects question with nothing ticked, the closed figures fold and the size');
    const c1 = await copy(p1);
    const t1 = tailOf(c1, 'ja'), cls = sub('teaching', 'class');
    ok(t1 === `# 頼みたいこと\n\n**A. 新しく作る**\n\n- タイトル（表紙にそのまま使う）：てこのはたらき\n- 長さ（枚数か分）：6 枚\n- 言語：日本語\n- 話者：1 人\n- テーマ：default（<html data-theme="default">）\n- 場面：授業・研修／授業（小・中・高）\n- 構成の型：${cls.structure.ja}\n- 見せ方：${cls.show.ja}\n`
      && c1 === packWithRequest({ series: [], lang: 'ja', request: t1, plan: 'free' }),
      'S1 ④: the copied instructions are the free common body with the request at the end; the fields left to the AI (だれ向け, 内容, そのほかの希望) are not written');
    ok((await flowState(p1)) === 'kind:shut:-:-:body:answer content:shut:-:-:body:answer theme:shut:-:-:body:answer send:shut:-:-:nobody:answer paste:open:step:-:body:-'
      && (await answer(p1, 'send')) === '指示：チャットの AI：無料のプラン・コピーしました' && await p1.evaluate(() => document.activeElement && document.activeElement.id === 'paste-deck'),
      'S1 ④: 「指示をコピー」 opens ⑤ (focus in the slides field) and folds ④ to 「指示：チャットの AI：無料のプラン・コピーしました」: ' + await flowState(p1));
    ok(/^コピーしました（[\d.]+ KB）。チャットの AI のタブに貼り付けて送ってください。長いので、貼るとファイルの添付の形になることがありますが、そのまま送ってかまいません。AI が書き終えたら ⑤ へ$/.test(await text(p1, '#paste-copied')), 'S1 ④: the copied message says to send it even as an attachment, then go to ⑤');
    // ⑤ 欄 2 つ。出力の全体をスライドの欄に貼る → 分ける
    ok((await text(p1, '#paste-step3-hint')).startsWith('AI の出力には、灰色の枠（コードブロック）が 2 つあります。') && (await text(p1, 'label[for=paste-deck]')) === 'スライド（deck.html）' && (await text(p1, 'label[for=paste-narr]')) === '台本（narration.md）'
      && (await p1.getAttribute('#paste-deck', 'placeholder')) === 'deck.html のコードブロックを貼り付け', 'S1 ⑤: two fields, スライド（deck.html） and 台本（narration.md）; the hint introduces the code blocks as grey boxes');
    let st = await status(p1);
    ok(st.deck === 'まだ貼っていません' && st.narr === 'まだ貼っていません' && st.go === '作成' && st.goOff && st.note === '⑤ にスライドを貼り付けてください' && st.beside && !(await p1.$('#dlg-only')) && !(await p1.$('#paste-reset')) && !(await p1.$('#paste-text')), 'S1 ⑤: both say 「まだ貼っていません」; 「作成」 waits for the slides and says 「⑤ にスライドを貼り付けてください」 beside it; no hidden waiting state, no 「これだけで取り込む」 or reset');
    const cdeck = worked('common', 'deck.html'), cnarr = worked('common', 'narration.md');
    await p1.fill('#paste-deck', replyOf(cdeck, cnarr));
    st = await status(p1);
    ok(st.deck === '✓ スライド 3 枚' && st.narr === '✓ 台本 3 節' && st.info === '出力の全体だったので、スライドと台本に分けました' && !st.goOff && st.note === '' && (await p1.inputValue('#paste-narr')).startsWith('#') && (await p1.inputValue('#paste-deck')).startsWith('<!DOCTYPE html>'),
      'S1 ⑤: the whole output pasted into the slides field is split into both fields (「✓ スライド 3 枚」「✓ 台本 3 節」) and 「作成」 is enabled: ' + JSON.stringify(st));
    await shot(p1, 'flow-s1-paste.png', 'paste-step-paste');
    const F1 = await create(p1);
    const nd1 = newDeckOf(F1);
    ok(JSON.stringify(nd1) === JSON.stringify({ v: 1, plan: 'free', category: 'teaching', subcategory: 'class', subjects: [], purposesOff: [] }) && Number.isInteger(seedOf(F1['deck.html'])) && F1['narration.md'].includes('{#s-'),
      'S1: 「作成」 opens the new deck with a seed and keeps the choices in studio.newDeck: ' + JSON.stringify(nd1));
    ok(/^作成しました：スライド 3 枚 · 保存するまでファイルには書いていません/.test(await text(p1, '#toast')), 'S1: the toast says 「作成しました：スライド 3 枚」');

    // ================================================================ S6 S1 の先生：練習問題を 1 枚足す（別のチャットで頼む：指示の全体も付ける）
    await p1.evaluate(() => { window.__APP_TEST.insertAi(null); });
    await p1.waitForSelector('#dlg[open] #paste-insert-n');
    const ih = await p1.$$eval('#dlg-body section.paste-step h3', (xs) => xs.map((x) => x.textContent));
    ok((await text(p1, '#dlg-title')) === 'スライドの挿入' && ih.join('|') === '① どんなスライドを足しますか|② チャットの AI に指示を送ります|③ AI の出力を貼り付けます'
      && (await text(p1, '#ai-howto')) === '足したいスライドを書くと、チャットの AI に送る指示ができます。AI の出力をここに貼り付けると、スライドを挿入します。' && (await text(p1, 'label[for=paste-with-pack]')) === 'この教材を作ったのとは別のチャットに送る（指示の全体も付けます）',
      'S6: 「スライドの挿入」 with three questions, and the choice to send to a different chat: ' + ih.join(' / '));
    ok((await flowState(p1)) === '1:open:step:-:body:- 2:shut:-:pending:nobody:- paste:shut:-:pending:nobody:-', 'S6: insert follows the same one-open flow (① open, ② ③ headings): ' + await flowState(p1));
    await p1.fill('#paste-insert-wish', '練習問題を 1 つ');
    await p1.click('#paste-next-1');
    ok((await flowState(p1)) === '1:shut:-:-:nobody:answer 2:open:step:-:body:- paste:shut:-:pending:nobody:-' && (await text(p1, '#paste-step1-answer .paste-answer-text')) === '足す枚数：1 枚・練習問題を 1 つ',
      'S6: 「次へ」 folds ① to 「足す枚数：1 枚・練習問題を 1 つ」 and opens ②');
    const i1 = await copy(p1);
    ok((await flowState(p1)) === '1:shut:-:-:nobody:answer 2:shut:-:-:nobody:answer paste:open:step:-:body:-', 'S6: copying opens ③: ' + await flowState(p1));
    await p1.click('#paste-change2');
    await p1.check('#paste-with-pack');
    const i2 = await copy(p1);
    ok(!i1.includes('# AI への指示') && i1.includes('練習問題を 1 つ') && i2.startsWith('# AI への指示') && i2.endsWith(i1) && /AI が書き終えたら ③ へ$/.test(await text(p1, '#paste-copied')), 'S6: the short instructions, and with 「別のチャット」 the full instructions first');
    st = await status(p1);
    ok(st.go === '挿入' && st.goOff && st.note === '③ にスライドを貼り付けてください' && st.beside, 'S6 ③: the same two fields; 「挿入」 waits for the slides and says 「③ にスライドを貼り付けてください」 beside it');
    const insDeck = '<section class="slide">\n  <h2>練習問題</h2>\n  <div class="body"><p>はさみの支点はどこ？</p></div>\n  <div class="concl"><span>支点は真ん中</span></div>\n</section>';
    const insNarr = '## 練習問題\n[0] はさみの支点はどこでしょう。\n[concl] 支点は真ん中にあります。';
    await p1.fill('#paste-narr', 'できました。\n\n```deck.html\n' + insDeck + '\n```\n\n```narration.md\n' + insNarr + '\n```\n');
    st = await status(p1);
    ok(st.deck === '✓ スライド 1 枚' && st.narr === '✓ 台本 1 節' && st.info === '出力の全体だったので、スライドと台本に分けました' && !st.goOff, 'S6 ③: the whole output pasted into the script field is split too');
    await shot(p1, 'flow-s6-insert.png', 'paste-step-paste');
    await p1.evaluate(() => { document.getElementById('panel').hidden = true; });
    await clickDlg(p1, '#dlg-import');
    await p1.waitForFunction(() => /挿入しました/.test(document.getElementById('toast').textContent), null, { timeout: 30000 });
    await p1.waitForFunction(() => { const f = window.__APP_TEST.files(); return f && new TextDecoder().decode(Uint8Array.from(atob(f['deck.html']), (c) => c.charCodeAt(0))).includes('練習問題'); }, null, { timeout: 30000 });
    const F6 = await files(p1);
    ok((F6['deck.html'].match(/<section class="slide/g) || []).length === 4 && /## 練習問題 \{#s-[a-z2-7]{6}\}/.test(F6['narration.md']) && /^スライド 1 枚を 4 枚目に挿入しました/.test(await text(p1, '#toast')),
      'S6: 「挿入」 adds the slide after the last one with its script: ' + await text(p1, '#toast'));

    // ================================================================ S2 大学の事務職員（en）：新入生向け「履修登録の案内」。職場の Copilot（プランを知らない → 無料のまま）
    const p2 = await open('en', 's2');
    await startNew(p2);
    ok((await text(p2, '#dlg-title')) === 'New' && (await text(p2, '#paste-step-kind h3')) === '1. Where will you use it?' && await p2.isDisabled('#paste-next-kind'), 'S2: “New”, “1. Where will you use it?”, Next disabled');
    await p2.check('#paste-cat-other');
    await p2.click('#paste-next-kind');
    ok((await answer(p2, 'kind')) === 'Setting: Other', 'S2 ①: “Other” answers the question (no subcategory)');
    ok((await p2.getAttribute('#paste-title', 'placeholder')) === 'e.g. Neighbourhood summer festival', 'S2 ②: the placeholders follow step 1 (Other)');
    await p2.fill('#paste-title', 'Course registration');
    await p2.check('#paste-audience-mode-write');
    await p2.fill('#paste-audience', 'New students');
    await p2.click('#paste-next-content');
    ok((await answer(p2, 'content')) === 'Title: Course registration · New students', 'S2 ②: “Title: Course registration · New students”');
    await p2.click('#paste-next-theme');
    let c2 = await copy(p2);
    ok(tailOf(c2, 'en') === '# What I want\n\n**A. Make a new lesson**\n\n- Title (used as is on the cover): Course registration\n- Audience: New students\n- Language: English\n- Speakers: one narrator\n- Theme: default (<html data-theme="default">)\n',
      'S2 ④: with “Other”, no setting or structure lines; the length left to the AI is not written');
    // ［変更］で ① を開き直す：④ ⑤ はそのまま。手引きは小分類も答える（印なし）。「この中にない」→ 場面の行だけ
    await p2.click('#paste-change-kind');
    ok(await p2.isVisible('#paste-cat') && await p2.isVisible('#paste-step-send') && await p2.isVisible('#paste-step-paste') && await p2.isHidden('#paste-step-kind-answer'), 'S2: “Change” reopens step 1; steps 4 and 5 stay');
    await p2.check('#paste-cat-guides');
    const subs2 = await p2.$$eval('#paste-sub label', (xs) => xs.map((x) => x.textContent));
    ok(await p2.isDisabled('#paste-next-kind') && subs2.join('|') === 'Manual|Rules and regulations|Information (waste sorting, library, evacuation, course registration…)|None of these' && (await p2.$$eval('#paste-sub input:checked', (xs) => xs.length)) === 0,
      'S2 ①: Guides asks “More precisely” (Information lists course registration; “None of these” last), nothing pre-ticked: ' + subs2.join(' / '));
    await p2.check('#paste-sub-none');
    ok(await p2.isHidden('#paste-structure') && !(await p2.isDisabled('#paste-next-kind')), 'S2 ①: “None of these” answers it, with no structure');
    await p2.click('#paste-next-kind');
    ok((await answer(p2, 'kind')) === 'Setting: Guides / None of these', 'S2 ①: “Setting: Guides / None of these”');
    c2 = await copy(p2);
    ok(tailOf(c2, 'en').endsWith('- Theme: default (<html data-theme="default">)\n- Kind: Guides\n') && !c2.includes('- Structure:'), 'S2 ④: “None of these” writes only the setting line, no structure or presentation');
    // ⑤ 違う欄に貼る：スライドを台本の欄に → スライドの欄へ移す。スライドだけなら「台本なしで作成します」。台本をスライドの欄に → 台本の欄へ
    const bdeck = worked('business', 'deck.html'), bnarr = worked('business', 'narration.md');
    await p2.fill('#paste-narr', bdeck.trim());
    st = await status(p2);
    ok(st.deck === '✓ 3 slides' && st.narr === 'Not pasted yet' && st.info === 'Moved the slides from the script field to the slides field.' && (await p2.inputValue('#paste-narr')) === '' && !st.goOff && st.note === 'It will be created without a script (you can write one later).' && st.beside,
      'S2 ⑤: slides pasted into the script field move to the slides field; with no script, “Create” is enabled and says it is made without a script: ' + JSON.stringify(st));
    await shot(p2, 'flow-s2-moved.png', 'paste-step-paste');
    await p2.fill('#paste-deck', bnarr.trim());
    st = await status(p2);
    ok(st.deck === 'Not pasted yet' && st.narr === '✓ Script, 3 sections' && st.info === 'Moved the script from the slides field to the script field.' && st.goOff && st.note === 'Paste the slides in step 5' && st.beside
      && (await p2.inputValue('#paste-narr')) === bnarr.trim() && (await p2.inputValue('#paste-deck')) === '', 'S2 ⑤: the script pasted into the slides field moves to the script field, which keeps it (the slides field is now empty); “Create” says “Paste the slides in step 5”');
    await p2.fill('#paste-deck', bdeck.trim());
    st = await status(p2);
    ok(st.deck === '✓ 3 slides' && st.narr === '✓ Script, 3 sections' && st.note === '' && !st.goOff, 'S2 ⑤: both fields are filled; no note beside “Create”');
    const F2 = await create(p2);
    ok(JSON.stringify(newDeckOf(F2)) === JSON.stringify({ v: 1, plan: 'free', category: 'guides', subcategory: null, subjects: [], purposesOff: [] }), 'S2: “None of these” is stored as subcategory: null in studio.newDeck: ' + JSON.stringify(newDeckOf(F2)));

    // ================================================================ S7 S2 のデッキを修正：直したスライドだけが返る
    await clickCommand(p2, '#b-revise-cmd');
    await p2.waitForSelector('#dlg[open] #paste-wish');
    const rh = await p2.$$eval('#dlg-body section.paste-step h3', (xs) => xs.map((x) => x.textContent));
    ok((await text(p2, '#dlg-title')) === 'Revise' && rh.join('|') === '1. What should be changed?|2. Send the fix request to your chat AI|3. Paste the AI’s output' && (await status(p2)).go === 'Replace' && (await status(p2)).goOff && (await status(p2)).note === 'Paste the slides or the script in step 3' && (await status(p2)).beside
      && (await p2.$$eval('#paste-step-paste .hint', (xs) => xs.map((x) => x.textContent))).includes('If only the fixed slides are in the output, only those slides are replaced.'),
      'S7: “Revise” with three questions; “Replace” waits for the output; the hint says only fixed slides are replaced');
    const docId7 = (await p2.evaluate(() => window.__APP_TEST.state().portable.docId));
    const sid = F2['deck.html'].match(/<section class="slide[^"]*" id="(s-[a-z2-7]{6})">\s*<h2>導入から 3 か月の結果/)[1];
    const sec = F2['deck.html'].match(new RegExp(`<section class="slide[^"]*" id="${sid}">[\\s\\S]*?</section>`))[0].replace('導入から 3 か月の結果', '3 か月の結果');
    // もう出力を持っている：③ の見出しを押して開く（① ② はそのまま）
    await p2.click('#paste-step-paste-btn');
    ok((await flowState(p2)) === '1:shut:-:-:nobody:- 2:shut:-:pending:nobody:- paste:open:step:-:body:-' && await p2.evaluate(() => document.activeElement && document.activeElement.id === 'paste-deck'),
      'S7: pressing the heading of step 3 opens it alone, with the focus in the slides field: ' + await flowState(p2));
    await p2.fill('#paste-deck', 'Here is the fixed slide.\n\n```deck.html\n' + sec + '\n```\n');
    st = await status(p2);
    ok(st.deck === '✓ 1 slide' && st.narr === 'Not pasted yet' && st.note === 'The script stays as it is.' && st.beside && !st.goOff
      && st.info === 'Took the slides code block out of the output.' && (await p2.inputValue('#paste-deck')) === sec,
      'S7 ③: one fixed slide; the field keeps just the extracted code block and says so; “Replace” is enabled and says the script stays');
    await shot(p2, 'flow-s7-revise.png', 'paste-step-paste');
    await p2.evaluate(() => { document.getElementById('panel').hidden = true; });
    await clickDlg(p2, '#dlg-import');
    await p2.waitForFunction(() => { const f = window.__APP_TEST.files(); return f && new TextDecoder().decode(Uint8Array.from(atob(f['deck.html']), (c) => c.charCodeAt(0))).includes('<h2>3 か月の結果'); }, null, { timeout: 30000 });
    const F7 = await files(p2);
    ok((await p2.evaluate(() => window.__APP_TEST.state().portable.docId)) === docId7 && (F7['deck.html'].match(/<section class="slide/g) || []).length === 3 && F7['narration.md'] === F2['narration.md'],
      'S7: only that slide is replaced (same docId, 3 slides, the script unchanged)');

    // ================================================================ S3 会社員（en・有料の Claude）：月次の報告を 20 分 → 2 回に分けて頼む
    const p3 = await open('en', 's3');
    await startNew(p3);
    await p3.check('#paste-cat-business');
    await p3.check('#paste-sub-report');
    await p3.click('#paste-next-kind');
    await p3.fill('#paste-title', 'Monthly report for October');
    await p3.check('#paste-length-mode-write');
    await p3.fill('#paste-length-n', '20');
    await p3.selectOption('#paste-length-unit', 'min');
    await p3.click('#paste-next-content');
    ok((await answer(p3, 'content')) === 'Title: Monthly report for October · 20 minutes', 'S3 ②: “20 minutes”');
    await p3.click('#paste-next-theme');
    ok((await text(p3, '#paste-phase')) === '20 slides, so you ask in two rounds: first an outline (a list of headings), then 6 slides at a time.' && await p3.isVisible('#paste-phase'),
      'S3 ④: 20 minutes counts as 20 slides (1 min ≈ 1 slide), so it is asked in two rounds');
    ok((await p3.getAttribute('#paste-series-business', 'aria-pressed')) === 'true' && (await text(p3, '#paste-series-guess')) === 'Ticked “Business” from the setting in step 1.', 'S3 ④: Business ticks the business subject, and says so');
    await p3.check('#paste-plan-paid');
    ok(await p3.isVisible('#paste-series') && await p3.isVisible('#paste-series-paid') && (await text(p3, '#paste-series-paid')) === 'Chat AI: paid plan, so all of them are included.'
      && (await p3.$$eval('#paste-series .tile', (xs) => xs.every((x) => x.getAttribute('aria-pressed') === 'true' && x.disabled))), 'S3 ④: the paid plan shows every subject tile as on and not pressable, with “The paid plan includes all of them.”');
    const c3 = await copy(p3);
    ok(c3.includes('# First, send only the outline') && c3.includes('- Length (slides or minutes): 20 minutes') && c3.includes('## Series pack: kokugo') && /When the outline is out, go to step 5\.$/.test(await text(p3, '#paste-copied')),
      'S3 ④: the paid pack with the outline request; the message says to go to step 5 when the outline is out');
    ok((await text(p3, '#paste-step-paste-h')) === '5. Paste the AI’s outline' && (await status(p3).catch(() => ({ goOff: true }))).goOff !== false && await p3.isDisabled('#dlg-import') && /press Next/.test(await text(p3, '#paste-step-paste .hint')) && (await text(p3, '#paste-go-note')) === 'Paste the outline in step 5',
      'S3 ⑤: step 5 first asks for the outline; “Create” is disabled meanwhile and says “Paste the outline in step 5”');
    await p3.fill('#paste-outline-text', '```outline\n| 1 | A | x |\n');
    await p3.click('#paste-outline-next');
    ok(/is not closed/.test(await text(p3, '#paste-outline-msg')), 'S3 ⑤: an unclosed outline is refused with a reason');
    await p3.fill('#paste-outline-text', 'Here it is.\n\n```outline\n| # | Heading | Point |\n|---|---|---|\n' + Array.from({ length: 20 }, (_, i) => `| ${i + 1} | 見出し ${i + 1} | point ${i + 1} |`).join('\n') + '\n```\n');
    await p3.click('#paste-outline-next');
    await p3.waitForSelector('#paste-outline-answer');
    ok((await text(p3, '#paste-outline-answer .paste-answer-text')) === 'Outline: 20 slides' && (await p3.$$eval('#paste-outline-list li', (x) => x.length)) === 20 && (await text(p3, '#paste-step-paste-h')) === '5. Paste the AI’s output' && await p3.isDisabled('#dlg-import'),
      'S3 ⑤: the outline collapses to “Outline: 20 slides”, then the two fields (Create still waits for slides)');
    await p3.evaluate(() => { window.__APP_TEST.lastCopy = null; });
    await p3.click('#paste-outline-copy');
    await p3.waitForFunction(() => (window.__APP_TEST.lastCopy || '').includes('slides 1–6'));
    await shot(p3, 'flow-s3-outline.png', 'paste-step-paste');
    const b1 = slidesOf(1, 6, true);
    await p3.fill('#paste-deck', replyOf(b1.deck, b1.narr));
    const F3 = await create(p3);
    const o3 = (JSON.parse(F3['egatari.json']).studio || {}).outline;
    ok(o3 && o3.next === 7 && o3.rows.length === 20 && JSON.stringify(newDeckOf(F3)) === JSON.stringify({ v: 1, plan: 'paid', category: 'business', subcategory: 'report', subjects: ['business'], purposesOff: [] }),
      'S3: “Create” opens slides 1–6 with the outline (next: 7) and the paid plan in studio.newDeck');

    // ================================================================ S4 高校の国語の先生（ja・無料の Gemini）：漢文「臥薪嘗胆」
    const p4 = await open('ja', 's4');
    await startNew(p4);
    await p4.check('#paste-cat-teaching');
    await p4.check('#paste-sub-class');
    await p4.click('#paste-next-kind');
    await p4.fill('#paste-title', '臥薪嘗胆');
    await p4.check('#paste-content-mode-write');
    ok(await p4.isVisible('#paste-content') && (await p4.getAttribute('#paste-content', 'placeholder')).includes('てこには支点・力点・作用点がある'), 'S4 ②: 「ここに書く・貼る」 opens the content field with a real-size example');
    await p4.fill('#paste-content', '漢文「臥薪嘗胆」の書き下し文と現代語訳');
    // 詳しく：今の答えを見出しに
    await p4.click('#paste-more-h');
    await p4.check('#paste-speakers-2');
    ok((await text(p4, '#paste-more-h')) === '詳しく：日本語・2 人で説明と質問' && (await text(p4, '#paste-wishes-note')) === '話す人は 2 人まで' && (await text(p4, '#paste-speakers')).includes('2 人（説明する人と、質問する人）'), 'S4 ②: the 詳しく summary follows the speakers; the wishes field notes 「話す人は 2 人まで」');
    await p4.check('#paste-language-other');
    await p4.fill('#paste-language-name', '中国語');
    ok((await text(p4, '#paste-more-h')) === '詳しく：中国語・2 人で説明と質問', 'S4 ②: 「その他」 opens a language field and the summary shows it');
    await p4.check('#paste-language-ja');
    ok(await p4.isHidden('#paste-language-name'), 'S4 ②: back to 日本語 hides the field');
    await p4.fill('#paste-wishes', '書き下し文を先に');
    ok((await text(p4, '#paste-more-h')) === '詳しく：日本語・2 人で説明と質問・そのほかの希望あり', 'S4 ②: the summary says there are other wishes');
    await shot(p4, 'flow-s4-more.png', 'paste-step-content');
    await p4.click('#paste-next-content');
    await p4.click('#paste-next-theme');
    ok((await p4.getAttribute('#paste-series-kokugo', 'aria-pressed')) === 'true' && (await p4.$$eval('#paste-series .tile[aria-pressed=true]', (xs) => xs.length)) === 1 && (await text(p4, '#paste-series-guess')) === '② のタイトルと内容から「国語」を選びました',
      'S4 ④: 漢文 in the content ticks 国語, and says so');
    // ［変更］で ② を直す：④ ⑤ は出たまま。答えの 1 行も新しくなる
    await p4.click('#paste-change-content');
    ok(await p4.isVisible('#paste-title') && (await flowState(p4)) === 'kind:shut:-:-:body:answer content:open:step:-:body:- theme:shut:-:-:body:answer send:shut:-:-:nobody:- paste:shut:-:pending:nobody:-'
      && await p4.evaluate(() => document.activeElement && document.activeElement.id === 'paste-title'),
      'S4: 「変更」 reopens ② alone (focus on the title); ① ③ keep their summaries and ④ ⑤ are headings: ' + await flowState(p4));
    await p4.fill('#paste-title', '臥薪嘗胆（十八史略）');
    await p4.click('#paste-next-content');
    ok((await answer(p4, 'content')) === 'タイトル：臥薪嘗胆（十八史略）', 'S4 ②: the answered line follows the change');
    // 自分で外した印は、推し直しで戻さない
    await p4.click('#paste-series-kokugo');
    await p4.click('#paste-change-content');
    await p4.fill('#paste-title', '臥薪嘗胆（漢文）');
    await p4.click('#paste-next-content');
    ok((await p4.getAttribute('#paste-series-kokugo', 'aria-pressed')) === 'false', 'S4 ④: a subject the author unticked is not ticked again by the guess');
    await p4.click('#paste-series-kokugo');
    const c4 = await copy(p4);
    const t4 = tailOf(c4, 'ja');
    ok(t4.startsWith('# 頼みたいこと\n\n**A. 新しく作る**\n\n- タイトル（表紙にそのまま使う）：臥薪嘗胆（漢文）\n- 言語：日本語\n- 話者：2 人（Expert と Novice の掛け合い）\n- そのほかの希望：書き下し文を先に\n- テーマ：default') && t4.includes('\n## 内容（要点・メモ・元の資料）\n\n漢文「臥薪嘗胆」の書き下し文と現代語訳\n') && c4.includes('`<m-kanbun>`'),
      'S4 ④: the request has the title, language, two speakers and the wishes; the content goes after it; the kokugo parts are in');
    // ⑤ コードブロックを 1 つずつ（それぞれ正しい欄へ）
    const kdeck = worked('kokugo', 'deck.html'), knarr = worked('kokugo', 'narration.md');
    await p4.fill('#paste-deck', '```deck.html\n' + kdeck.trim() + '\n```');
    st = await status(p4);
    ok(st.deck === '✓ スライド 2 枚' && st.narr === 'まだ貼っていません' && st.note === '台本なしで作成します（台本はあとで書けます）' && st.beside && !st.goOff
      && st.info === '出力からスライドのコードブロックを取り出しました' && (await p4.inputValue('#paste-deck')) === kdeck.trim(), 'S4 ⑤: the slides code block alone: the field keeps the block without its fence and says so; 「台本なしで作成します」 right beside 「作成」');
    await p4.fill('#paste-narr', '```narration.md\n' + knarr.trim() + '\n```');
    st = await status(p4);
    ok(st.narr === '✓ 台本 2 節' && st.note === '', 'S4 ⑤: then the script code block');
    const F4 = await create(p4);
    ok(newDeckOf(F4).subjects.join() === 'kokugo' && newDeckOf(F4).plan === 'free', 'S4: studio.newDeck has the kokugo subject');

    // ================================================================ S5 大学の教員（ja・有料の ChatGPT）：前にチャットの AI と話し合った内容（と添付した資料）でゼミ資料
    const p5 = await open('ja', 's5');
    await startNew(p5);
    await p5.check('#paste-cat-research');
    await p5.check('#paste-sub-seminar');
    await p5.click('#paste-next-kind');
    ok((await p5.$$eval('#paste-content-mode label', (xs) => xs.map((x) => x.textContent))).join('|') === 'AI に任せる（タイトルだけで考えます）|ここに書く・貼る（授業のメモや教科書の文をそのまま貼れます）|チャットの AI に渡してある（PDF などの資料を添付した、または内容を話し合った）'
      && await p5.isChecked('#paste-content-mode-ai') && await p5.isHidden('#paste-content-given-note') && !(await p5.$('#paste-discussed')),
      'S5 ②: 内容 has three answers (AI に任せる, ここに書く・貼る, チャットの AI に渡してある); no separate “already discussed” switch');
    await p5.fill('#paste-title', 'ゼミの進め方');
    await p5.check('#paste-content-mode-given');
    ok(await p5.isVisible('#paste-content-given-note') && (await text(p5, '#paste-content-given-note')) === '指示は、その資料を渡したチャットに貼り付けてください' && await p5.isHidden('#paste-content') && await p5.isVisible('#paste-more')
      && await p5.isVisible('#paste-audience-mode') && await p5.isVisible('#paste-length-mode'),
      'S5 ②: 「チャットの AI に渡してある」 says to paste into that chat; the title, audience, length and the 詳しく fold are still asked');
    await p5.click('#paste-more-h');
    await p5.fill('#paste-wishes', '最後に議論する問いを 1 つ');
    await p5.check('#paste-audience-mode-write');
    await p5.fill('#paste-audience', '研究室の学部 4 年生');
    await shot(p5, 'flow-s5.png', 'paste-step-content');
    await p5.click('#paste-next-content');
    ok((await answer(p5, 'content')) === 'タイトル：ゼミの進め方・研究室の学部 4 年生・内容はチャットの AI に渡してある', 'S5 ②: the answered line says the content is already with the chat AI');
    await p5.click('#paste-next-theme');
    await p5.check('#paste-plan-paid');
    const c5 = await copy(p5);
    const sem = sub('research', 'seminar');
    ok(tailOf(c5, 'ja') === `# 頼みたいこと\n\n**B. 渡した資料と話し合いの内容で作る**\n\nこのチャットで渡した資料と、ここまでの話し合いの内容で、教材を作ってください。\n\n- タイトル（表紙にそのまま使う）：ゼミの進め方\n- 対象（だれ向け）：研究室の学部 4 年生\n- 言語：日本語\n- 話者：1 人\n- そのほかの希望：最後に議論する問いを 1 つ\n- テーマ：default（<html data-theme="default">）\n- 場面：研究発表／ゼミ・進捗報告\n- 構成の型：${sem.structure.ja}\n- 見せ方：${sem.show.ja}\n`,
      'S5 ④: the request (B. 渡した資料と話し合いの内容で作る) has the title, audience and the 詳しく lines in the same form as A (the length left to the AI is not written)');
    // 長さを指定すると B にも書く
    await p5.click('#paste-change-content');
    await p5.check('#paste-length-mode-write');
    await p5.fill('#paste-length-n', '7');
    await p5.click('#paste-next-content');
    ok(tailOf(await copy(p5), 'ja').includes('- 対象（だれ向け）：研究室の学部 4 年生\n- 長さ（枚数か分）：7 枚\n- 言語：日本語'), 'S5 ④: a length set on this path is written too');
    await p5.fill('#paste-narr', replyOf(worked('academic', 'deck.html'), worked('academic', 'narration.md')));
    st = await status(p5);
    ok(st.deck === '✓ スライド 3 枚' && st.narr === '✓ 台本 3 節' && st.info === '出力の全体だったので、スライドと台本に分けました', 'S5 ⑤: the whole output pasted into the script field is split');
    ok((await text(p5, '#dlg-cancel')) === 'キャンセル', 'S5: the cancel button is 「キャンセル」');
    const F5 = await create(p5);
    ok(newDeckOf(F5).plan === 'paid' && newDeckOf(F5).subcategory === 'seminar', 'S5: created with the paid plan');

    // ================================================================ S8 高校の先生（ja・無料のプラン）：分野は 2 つまで（推した印も 2 つまで。2 つで、ほかは押せない。外すとまた押せる。有料のプランは限りなし）
    const p8 = await open('ja', 's8');
    const checked = (p) => p.$$eval('#paste-series .tile[aria-pressed=true]', (xs) => xs.map((x) => x.id.replace('paste-series-', '')).join());
    // この指示に入るパーツの並び（折りたたみの中）と、指示の一覧（§3 の表の行と ### の説明）の部品
    const strip = (p) => p.$$eval('#paste-parts li', (xs) => xs.map((x) => x.dataset.part + (x.classList.contains('off') ? ':off' : '')).sort().join());
    const catalog = (series, plan) => [...new Set([...buildPack({ series, lang: 'ja', plan }).matchAll(/^(?:\| `<|### `<)(m-[a-z]+(?:-[a-z]+)*)>`/gm)].map((m) => m[1]))].sort().join();
    const disabledBoxes = (p) => p.$$eval('#paste-series .tile:disabled', (xs) => xs.map((x) => x.id.replace('paste-series-', '')).join());
    await startNew(p8);
    await p8.check('#paste-cat-business');
    await p8.check('#paste-sub-report');
    await p8.click('#paste-next-kind');
    await p8.fill('#paste-title', '売上の統計と漢文の故事');
    await p8.click('#paste-next-content');
    await p8.click('#paste-next-theme');
    ok((await checked(p8)) === 'academic,business' && (await disabledBoxes(p8)) === 'kokugo,info,social'
      && (await text(p8, '#paste-series-guess')) === '② のタイトルと内容から「数理・統計」「ビジネス」を選びました',
      'S8 ④: the guess (math, business, kokugo) ticks only the first two in order and names only those: ' + await text(p8, '#paste-series-guess'));
    ok(await p8.isVisible('#paste-series-max') && (await text(p8, '#paste-series-max')) === 'チャットの AI：無料のプランでは 2 つまで選べます' && await p8.$eval('#paste-series-max', (e) => !!e.closest('#paste-series')),
      'S8 ④: with two ticked, the others are disabled and the reason 「チャットの AI：無料のプランでは 2 つまで選べます」 is shown in the list');
    ok((await strip(p8)) === catalog(['academic', 'business'], 'free'), 'S8 ④: the figures strip lists exactly the parts in the copied pack (pair): ' + await strip(p8));
    ok((await text(p8, '#paste-series-new-hint')) === `選んだものの図の作り方を指示に入れます。選ばなければ、標準パーツ（${FREE_CORE.map((t) => PART_LABELS[t].ja).join('・')}など）だけです`
      && (await text(p8, '#paste-series-new-hint')).includes('標準パーツ（棒グラフ・流れ図・目次など）'), 'S8 ④: the hint names the standard parts from FREE_CORE’s labels: ' + await text(p8, '#paste-series-new-hint'));
    ok(JSON.stringify(await p8.$$eval('#paste-series .tile', (xs) => xs.map((x) => [x.querySelector('.tile-label').textContent, x.querySelector('small').textContent, !!x.querySelector('svg').innerHTML]))) === JSON.stringify([['数理・統計', '数式・関数・グラフ', true], ['ビジネス', 'KPI・位置づけ・市場・お金の流れ', true], ['国語', '漢文・古文・現代文・縦書き', true], ['情報', '符号の木', true], ['地図（社会：地理・歴史）', '日本地図', true]]),
      'S8 ④: the subject tiles: an icon, the label and a small line of what is inside');
    await p8.click('#paste-series-business');
    ok((await checked(p8)) === 'academic' && (await disabledBoxes(p8)) === '' && await p8.isHidden('#paste-series-max'), 'S8 ④: unticking one enables the others again and hides the reason');
    ok((await strip(p8)) === catalog(['academic'], 'free') && (await text(p8, '#paste-parts-count')) === `パーツ：${catalog(['academic'], 'free').split(',').length} 種類（外したもの 0）` && (await p8.getAttribute('#paste-parts-count', 'aria-live')) === 'polite',
      'S8 ④: the strip follows a single subject, and the fold summary counts them (aria-live polite): ' + await text(p8, '#paste-parts-count'));
    await p8.click('#paste-series-kokugo');
    ok((await checked(p8)) === 'academic,kokugo' && (await disabledBoxes(p8)) === 'business,info,social', 'S8 ④: a different second subject disables the rest');
    const c8 = await copy(p8);
    ok(c8 === packWithRequest({ series: ['academic', 'kokugo'], lang: 'ja', request: tailOf(c8, 'ja'), plan: 'free' }), 'S8 ④: the copied instructions have the two subjects ticked');
    // 推し直しでも 2 つを越えない（自分で付けた 2 つはそのまま）
    await p8.click('#paste-change-content');
    await p8.fill('#paste-title', '売上の統計と漢文の故事、ハフマン符号');
    await p8.click('#paste-next-content');
    ok((await checked(p8)) === 'academic,kokugo', 'S8 ④: a new guess never adds a third subject');
    await p8.check('#paste-plan-paid');
    ok(await p8.isVisible('#paste-series') && (await checked(p8)) === 'academic,business,kokugo,info,social' && (await disabledBoxes(p8)) === 'academic,business,kokugo,info,social' && await p8.isHidden('#paste-series-max') && (await text(p8, '#paste-series-paid')) === 'チャットの AI：有料のプランでは全部入ります',
      'S8 ④: the paid plan has no limit: every tile is on and not pressable, with 「チャットの AI：有料のプランでは全部入ります」');
    ok((await strip(p8)) === catalog([], 'paid'), 'S8 ④: under the paid plan the strip lists every part');
    const c8p = await copy(p8);
    ok(c8p === packWithRequest({ series: [...SERIES], lang: 'ja', request: tailOf(c8p, 'ja'), plan: 'paid' }), 'S8 ④: the paid plan copies every series');
    await p8.click('#paste-change-send');
    await p8.check('#paste-plan-free');
    ok((await checked(p8)) === 'academic,kokugo' && (await disabledBoxes(p8)) === 'business,info,social' && await p8.isVisible('#paste-series-max'), 'S8 ④: back to free, the limit applies again');
    await p8.click('#paste-series-academic');
    await p8.click('#paste-series-kokugo');
    ok((await checked(p8)) === '' && (await strip(p8)) === catalog([], 'free') && (await strip(p8)) === [...FREE_CORE].sort().join(), 'S8 ④: with no subject, the strip is the standard parts: ' + await strip(p8));
    await p8.click('#paste-series-kokugo');
    ok((await strip(p8)) === catalog(['kokugo'], 'free'), 'S8 ④: 国語 alone: ' + await strip(p8));
    await p8.click('#paste-purposes-fold-h');
    await p8.click('#paste-purpose-process');
    const offTile = await p8.$eval('#paste-parts li[data-part="m-flow"]', (x) => ({ o: +getComputedStyle(x).opacity, deco: getComputedStyle(x.querySelector('.tile-label')).textDecorationLine, b: getComputedStyle(x).borderTopStyle }));
    const n8 = catalog(['kokugo'], 'free').split(',').length;
    ok((await strip(p8)) === catalog(['kokugo'], 'free').replace('m-flow', 'm-flow:off') && offTile.o < 1 && offTile.deco.includes('line-through') && offTile.b === 'dashed' && (await text(p8, '#paste-parts-count')) === `パーツ：${n8 - 1} 種類（外したもの 1）`,
      'S8 ④: a figure turned off in the fold stays in the strip, faded, dashed and struck through, and the summary counts it: ' + await text(p8, '#paste-parts-count'));
    await p8.click('#paste-purpose-process');
    ok((await text(p8, '#paste-parts-count')) === `パーツ：${n8} 種類（外したもの 0）`, 'S8 ④: turning it back on updates the count');

    // ================================================================ S9 前に分野を選んだ教材（egatari.json の studio.newDeck）を開いたまま新規作成：前の選び方は読まず、いつも印なしから。記録は書き換えない
    const p9 = await open('ja', 's9');
    const cfg9 = '{\n  "studio": {\n    "newDeck": {"v": 1, "plan": "free", "category": "teaching", "subcategory": "class", "subjects": ["math", "kokugo", "info"], "purposesOff": []}\n  }\n}\n';
    await p9.evaluate(async ([d, n, c]) => {
      const root = await navigator.storage.getDirectory();
      const top = await root.getDirectoryHandle('newdeck-stored-' + Date.now(), { create: true });
      for (const [k, v] of [['deck.html', d], ['narration.md', n], ['egatari.json', c]]) { const w = await (await top.getFileHandle(k, { create: true })).createWritable(); await w.write(v); await w.close(); }
      window.__sdir = top;
      window.__APP_TEST.open(top);
    }, [fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'narration.md'), 'utf8'), cfg9]);
    await p9.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.open && s.allowed && s.frameLoaded === s.loads && s.pos; }, null, { timeout: 30000 });
    const cfgNow = () => p9.evaluate(async () => (await (await window.__sdir.getFileHandle('egatari.json')).getFile()).text());
    await clickCommand(p9, '#b-new');
    await p9.waitForSelector('#dlg[open] #paste-step-kind');
    await p9.check('#paste-cat-teaching');
    await p9.check('#paste-sub-class');
    await p9.click('#paste-next-kind');
    await p9.fill('#paste-title', 'てこのはたらき');
    await p9.click('#paste-next-content');
    await p9.click('#paste-next-theme');
    ok((await checked(p9)) === '' && (await disabledBoxes(p9)) === '' && !(await p9.$('#paste-series-stored')) && (await cfgNow()) === cfg9,
      'S9 ④: New… starts with no subject ticked even when the open lesson recorded three; the record is not touched');
    await p9.click('#dlg-cancel');
    ok((await cfgNow()) === cfg9, 'S9: the record is still unchanged after closing');
  } finally {
    for (const c of contexts) await c.close();
  }
}
