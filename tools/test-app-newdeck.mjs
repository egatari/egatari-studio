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
// S8 高校の先生（ja・無料のプラン）：④ のラベル（handoff #43）。② の言葉から 2 つの題材を推して理由を出す、伝えたいことの札をキーボードで選ぶ、学校を選ぶ、
//    写す指示は順位で組んだもの（説明つき・名前だけの数の 1 行）、自分で外した題材は推し直しで戻さない、有料の AI は説明つきが増えるだけ
// S9 前に選んだ教材を開いたまま新規作成：前の選び方は読まず、いつも初めの選び方から（egatari.json は書き換えない）
// S10 研修（en）：学校は聞かない（読み手は社会人）。手順を選ぶと画面の手順・確かめる一覧が説明つきで入る
// S11 チャットの AI のスキルで作った出力を持っている先生（ja）：「AI の出力を貼り付ける」→ 貼り付けだけの画面（① 〜 ④ は要らない）・戻る・
//     ファイルから読む（種類の違うファイル・大きすぎるファイルは断る）→［作成］：名前は教材の <title>、テーマは教材のまま、studio.newDeck は書かない
// S12 前に作った出力に誤りがある（ja）：貼り付けだけの画面から作成 → 品質チェックのエラーと「AI への修正依頼をコピー」（⑤ と同じ）
// S13 ふつうの流れの ⑤（en）：「Read from a file」で .md の出力を選ぶ → 分ける →［Create］（選び方は今までどおり studio.newDeck に）
// S14 貼り付けだけの画面（en）：<title> も data-theme もない出力の .txt を台本の欄に落とす → 名前は最初の h1、テーマは足さない
// どの場面も：押せない［作成］［挿入］［置き換える］の横に、欠けているもののうち最初の 1 つ（「① に答えてください」など）。押せるときの添え書きもボタンの横
// 画像（shotDir があれば）：flow-s11-offer.png・flow-s11-only.png・flow-s1-kind.png・flow-s1-answered.png・flow-s1-paste.png・flow-s2-moved.png・flow-s3-outline.png・flow-s4-more.png・flow-s5.png・flow-s6-insert.png・flow-s7-revise.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, purposeTiles, subjectChoices, rankParts } from '../kit/core/new-deck.mjs';
import { newDeckPack } from '../kit/core/new-deck-pack.mjs';
import { TIERS } from '../kit/core/llm-pack.mjs';
import { replyOf, answerNew } from './test-app-llm.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { exportName } from '../kit/core/export-name.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { slidesOf } from './test-app-outline.mjs';
import { clickDlg, clickCommand, clickUntil } from './click-retry.mjs';
import { generate, makeSkillZip } from './make-llm-guide.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const worked = (n, f) => fs.readFileSync(path.join(ROOT, 'tools', 'llm-guide', 'worked', n, f), 'utf8').replace(/\r\n/g, '\n');
const sub = (c, s) => CATEGORIES.find((x) => x.id === c).subs.find((x) => x.id === s);
// 順位で組む指示（kit/core/new-deck-pack.mjs の newDeckPack）：写した指示の頼みたいこと（tail）で組み直したもの
const ranked = (choice, plan, lang, tail) => newDeckPack({ order: rankParts(choice), plan, lang, request: tail });
const audLabel = (id, lang) => TIERS.audiences.find((x) => x.id === id).label[lang];

// New と Help は同じ ZIP を渡す。キーでも押せて、同じサイトの現在のパス（凍結版を含む）から取る。
export async function checkSkillDownload(p, { lang, selector, ok, base }) {
  const label = lang === 'ja' ? 'AI のスキルをダウンロード' : 'Download the AI skill';
  const hint = lang === 'ja' ? 'Claude などの対話型 AI に追加すると、指示を貼り付けずに作成できます。Studio を更新したら追加し直してください（スキルの指示と品質チェックはバージョンごとに変わります）' : 'Add it to an AI chatbot such as Claude to create files without pasting the instructions. Add it again when Studio is updated (the skill’s instructions and quality checks change with each version)';
  const b = p.locator(selector);
  ok(await b.isVisible() && await b.textContent() === label && await p.getByRole('button', { name: label, exact: true }).count() === 1, `skill (${lang}, ${selector}): accessible button with the exact label`);
  if (selector === '#paste-download-skill') {
    ok(await b.getAttribute('aria-describedby') === 'paste-download-skill-hint' && await p.textContent('#paste-download-skill-hint') === hint
      && await b.evaluate((b) => b.previousElementSibling.id === 'paste-copy-guide'), `skill (${lang}): hint describes the button beside Copy the instructions`);
  }
  // Help も同じ添え書き（入れ直しの案内を含む。v0.6.10）
  if (selector === '#help-download-skill') ok(await b.getAttribute('aria-describedby') === 'help-download-skill-hint' && await p.textContent('#help-download-skill-hint') === hint, `skill (${lang}): Help has the same hint, with adding it again after an update`);
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const name = `egatari-make-${version}-${lang}.zip`;
  // Enter が届かないことがある（macOS の CI で、30 秒待っても download がなかった）：10 秒たって来なければ押し直す（3 回まで）
  let dl = null;
  for (let i = 0; i < 3 && !dl; i++) {
    await b.focus();
    [dl] = await Promise.all([p.waitForEvent('download', { timeout: scaled(10000) }).catch(() => null), b.press('Enter')]);
    if (dl && i > 0) console.log(`key-retry: ${selector} Enter needed ${i + 1} presses`);
  }
  if (!dl) { ok(false, `skill (${lang}, ${selector}): no download after 3 presses of Enter`); return; }
  ok(dl.suggestedFilename() === name && (base ? dl.url() === new URL(name, base).href : dl.url().startsWith('blob:')), `skill (${lang}, ${selector}): downloads ${name} from ${base || 'the offline editor'}`);
  const file = await dl.path();
  ok(file && fs.readFileSync(file).equals(makeSkillZip(generate({ skillLang: lang }).files)), `skill (${lang}, ${selector}): downloaded ZIP has the generated bytes`);
}

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
    // 段は、ボタンの「✓ コピーしました」を約 1 秒見せてからたたむ（handoff #110）：たたみ終わるまで待つ
    await p.waitForFunction(() => document.getElementById('paste-copy-guide').closest('section.paste-step').querySelector('.paste-step-h').getAttribute('aria-current') !== 'step', null, { timeout: scaled(5000) }).catch(() => {});
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
    if (dirty) { await p.waitForSelector('#dlg[open] #dlg-discard', { timeout: scaled(30000) }); await clickDlg(p, '#dlg-discard'); }
    await p.waitForFunction((d) => { const s = window.__APP_TEST.state(); return s.portable && s.portable.docId !== d && s.loads > 0 && s.frameLoaded === s.loads; }, before, { timeout: scaled(30000) });
    await p.waitForSelector('#panel:not([hidden]) #panel-body .sum', { timeout: scaled(30000) });
    return files(p);
  };
  const newDeckOf = (F) => (JSON.parse(F['egatari.json'] || '{}').studio || {}).newDeck;
  // ④ のラベル：選んだ伝えたいこと・題材・学校、推した理由、畳める 1 行（指示に入るパーツの数）
  const labels = (p) => p.evaluate(() => ({
    purposes: [...document.querySelectorAll('#paste-purposes input:checked')].map((x) => x.value).join(),
    subjects: [...document.querySelectorAll('#paste-subjects input:checked')].map((x) => x.value).join(),
    school: (document.querySelector('#paste-school input:checked') || {}).value || '', schoolShown: !document.getElementById('paste-school').hidden,
    why: document.getElementById('paste-subjects-why').hidden ? '' : document.getElementById('paste-subjects-why').textContent,
    sum: document.getElementById('paste-parts-sum-text').textContent }));
  const sumOf = (r, lang) => (lang === 'ja' ? `指示に入るパーツ：説明つき ${r.described.length} 種類、名前だけ ${r.named.length} 種類` : `Parts in the instructions: ${r.described.length} described, ${r.named.length} by name only`);
  // 大きさ・上限・パーツの印の一覧はもう出さない
  const noOldParts = (p) => p.evaluate(() => ['paste-pack-size', 'paste-meter', 'paste-over', 'paste-trim', 'paste-shortened', 'paste-parts-count', 'paste-plan-hint', 'paste-pgroups', 'paste-parts-why', 'paste-parts-hint'].every((id) => !document.getElementById(id))
    && !document.querySelector('#paste-step-send .pick') && !/KB|目安|suggested limit/.test(document.querySelector('#paste-step-send .paste-step-body').innerText));

  try {
    // ================================================================ S1 小学校の先生：明日の理科「てこのはたらき」を 6 枚で（無料の ChatGPT、出力の全体を貼る）
    const p1 = await open('ja', 's1');
    await startNew(p1);
    ok((await text(p1, '#dlg-title')) === '新規作成' && (await text(p1, '#ai-howto')) === '4 つの問いに答えると、対話型の生成 AI（ChatGPT・Gemini・Claude など）に送信する指示ができます。AI の出力をここに貼り付けると、スライドができます。',
      'S1: the page is 「新規作成」 and says: answer four questions, paste the output');
    const heads = await p1.$$eval('#dlg-body section.paste-step h3', (xs) => xs.map((x) => x.textContent));
    ok(heads.join('|') === '① どんな場面で使いますか|② 何について、だれに向けて作りますか|③ どんな見た目にしますか|④ 対話型 AI に指示を送信します|⑤ AI の出力を貼り付けます', 'S1: five questions in thinking order: ' + heads.join(' / '));
    ok(JSON.stringify(await visible(p1, ['paste-step-kind', 'paste-step-content', 'paste-step-theme', 'paste-step-send', 'paste-step-paste'])) === '[true,true,true,true,true]'
      && (await flowState(p1)) === 'kind:open:step:-:body:- content:shut:-:pending:nobody:- theme:shut:-:pending:nobody:- send:shut:-:pending:nobody:- paste:shut:-:pending:nobody:-'
      && (await p1.$$eval('#dlg-body .paste-step-h', (xs) => xs.every((x) => x.tagName === 'BUTTON' && x.closest('h3') && x.getAttribute('aria-controls')))),
      'S1: all five headings are shown (buttons with aria-expanded); only ① is open (aria-current="step"); the later ones are headings only, greyed: ' + await flowState(p1));
    await shot(p1, 'flow-s1-one-open.png');
    let st0 = await status(p1);
    ok(st0.go === '作成' && st0.goOff && st0.note === '① に答えてください' && st0.beside, 'S1: 「作成」 stays in place, disabled, with 「① に答えてください」 right beside it: ' + JSON.stringify(st0));
    ok((await p1.$$eval('#paste-cat input:checked', (xs) => xs.length)) === 0 && await p1.isDisabled('#paste-next-kind') && await p1.isHidden('#paste-sub')
      && (await text(p1, '#paste-step-kind .hint')) === '使う場面に合った構成（授業なら導入・展開・まとめ）を AI に伝えます。あてはまるものがなければ「その他」を選びます' && !(await p1.$('#paste-step-kind button:has-text("飛ばす")')),
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
    ok((await text(p1, '#paste-structure')) === `構成：${sub('teaching', 'class').structure.ja}。見せ方：${sub('teaching', 'class').show.ja}` && !(await p1.isDisabled('#paste-next-kind')), 'S1 ①: the subcategory shows its structure; 「次へ」 is enabled');
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
    ok((await answer(p1, 'theme')) === 'テーマ：藍' && (await flowState(p1)) === 'kind:shut:-:-:body:answer content:shut:-:-:body:answer theme:shut:-:-:body:answer send:open:step:-:body:- paste:shut:-:pending:nobody:-'
      && await p1.isHidden('#paste-deck') && await p1.evaluate(() => document.activeElement && document.activeElement.id === 'paste-purpose-' + document.querySelector('#paste-purposes input').value),
      'S1 ③: collapses to 「テーマ：藍」; ④ opens with the focus on its first control, and ⑤ is only a heading (no paste fields yet): ' + await flowState(p1));
    await shot(p1, 'flow-s1-answered.png', 'paste-step-kind');
    // ④ どの AI に貼るか（無料の AI・わからないが既定。handoff #43、作者の決定 2026-11-19）：選択肢ごとに名前・札・説明。上限の大きさは出さない
    const PLAN_JA = {
      free: ['無料の AI・わからない迷ったらこちら', '短い指示です。無料の ChatGPT や Gemini にも、そのまま貼り付けられます'],
      paid: ['有料の AI・ファイルで渡す', 'パーツの説明を省かない、長い指示です。長い文章を読める有料の AI 向けです。ファイルに保存して添付できます'],
    };
    const planOpts = (p) => p.$$eval('#paste-plan label.plan-opt', (ls) => ls.map((l) => { const r = l.querySelector('input'); const d = document.getElementById(r.getAttribute('aria-describedby'));
      return [r.value, l.querySelector('.plan-name').textContent, d && d.textContent, !!d && l.contains(d), (l.querySelector('.plan-badge') || {}).textContent || ''];
    }));
    const opts1 = await planOpts(p1);
    ok(JSON.stringify(opts1) === JSON.stringify([['free', PLAN_JA.free[0], PLAN_JA.free[1], true, '迷ったらこちら'], ['paid', PLAN_JA.paid[0], PLAN_JA.paid[1], true, '']])
      && await p1.isChecked('#paste-plan-free') && (await text(p1, '#paste-plan legend')) === 'どの AI に貼りますか' && await noOldParts(p1),
      'S1 ④: 「どの AI に貼りますか」 with its two choices (name, 「迷ったらこちら」 on the free one, the note under each); no size, limit, meter or parts list: ' + JSON.stringify(opts1));
    // ④ のラベル：伝えたいこと（manifest の札。初めは何も選ばない）→ 題材（任意。てこからは推さない）→ 学校（授業（小・中・高）だけ）
    const tiles1 = await p1.$$eval('#paste-purposes label', (xs) => xs.map((x) => x.textContent));
    const subj1 = await p1.$$eval('#paste-subjects label', (xs) => xs.map((x) => x.textContent));
    const school1 = await p1.$$eval('#paste-school label', (xs) => xs.map((x) => x.textContent));
    let l1 = await labels(p1);
    ok((await text(p1, '#paste-purposes legend')) === '何を伝えたいですか（いくつでも選べます。選ばなくてもかまいません）' && (await text(p1, '#paste-purposes-note')) === '選んだものに合うパーツを、指示の先に詳しく載せます'
      && JSON.stringify(tiles1) === JSON.stringify(purposeTiles().map((x) => x.label.ja)) && (await text(p1, '#paste-subjects legend')) === '題材（任意）'
      && JSON.stringify(subj1) === JSON.stringify(subjectChoices().map((x) => x.label.ja)) && !subj1.includes('医療') && !subj1.includes('防災')
      && (await text(p1, '#paste-school legend')) === 'どの学校向けですか' && JSON.stringify(school1) === JSON.stringify([audLabel('primary-junior', 'ja'), audLabel('high-school', 'ja')])
      && l1.purposes === '' && l1.subjects === '' && l1.school === '' && l1.schoolShown && l1.why === '' && /^指示に入るパーツ：説明つき \d+ 種類、名前だけ \d+ 種類$/.test(l1.sum)
      && (await text(p1, '#paste-parts-gallery')) === 'すべてのパーツのサンプルを見る',
      'S1 ④: the labels come from the parts catalogue (tiles, subjects without the reserved ones, the school levels for a school lesson); nothing is chosen at first; the line counts the parts: ' + l1.sum);
    // 3 つの問いは畳める：初めは開いていて、1 行を押すと畳み、［変更］が出る
    ok(await p1.$eval('#paste-parts-fold', (d) => d.open) && await p1.isHidden('#paste-parts-summary .parts-fold-act'), 'S1 ④: the label questions start open, without 「変更」');
    await p1.click('#paste-parts-summary');
    ok(!(await p1.$eval('#paste-parts-fold', (d) => d.open)) && (await text(p1, '#paste-parts-summary')) === l1.sum + '変更' && await p1.isVisible('#paste-parts-summary .parts-fold-act') && await p1.isHidden('#paste-purposes'),
      'S1 ④: pressing the line folds them to 「指示に入るパーツ：説明つき N 種類、名前だけ M 種類　変更」');
    await p1.click('#paste-parts-summary');
    ok(await p1.$eval('#paste-parts-fold', (d) => d.open) && await p1.isVisible('#paste-purposes'), 'S1 ④: pressing it again opens them');
    // 理科の授業：原因と結果・理科・小中を選ぶ
    await p1.check('#paste-purpose-cause-effect');
    await p1.check('#paste-subject-science');
    await p1.check('#paste-school-primary-junior');
    l1 = await labels(p1);
    ok(l1.purposes === 'cause-effect' && l1.subjects === 'science' && l1.school === 'primary-junior', 'S1 ④: a purpose, a subject and the school level are chosen: ' + JSON.stringify(l1));
    await checkSkillDownload(p1, { lang: 'ja', selector: '#paste-download-skill', ok, base: BASE });
    const c1 = await copy(p1);
    const t1 = tailOf(c1, 'ja'), cls = sub('teaching', 'class');
    const r1 = ranked({ category: 'teaching', purposes: ['cause-effect'], subjects: ['science'], audience: 'primary-junior' }, 'free', 'ja', t1);
    ok(t1 === `# 頼みたいこと\n\n**A. 新しく作る**\n\n- タイトル（表紙にそのまま使う）：てこのはたらき\n- 長さ（枚数か分）：6 枚\n- 言語：日本語\n- 話者：1 人\n- テーマ：default（<html data-theme="default">）\n- 場面：授業・研修／授業（小・中・高）\n- 構成の型：${cls.structure.ja}\n- 見せ方：${cls.show.ja}\n`
      && c1 === r1.text && r1.described[0] === 'm-predict' && r1.described.slice(1, 4).includes('m-fishbone') && r1.described.includes('m-orbit') && (await labels(p1)).sum === sumOf(r1, 'ja'),
      `S1 ④: the copied instructions are ranked by the labels (${r1.described.join(', ')} described, ${r1.named.length} by name only), with the request at the end; the fields left to the AI are not written; the line counts them`);
    ok((await flowState(p1)) === 'kind:shut:-:-:body:answer content:shut:-:-:body:answer theme:shut:-:-:body:answer send:shut:-:-:nobody:answer paste:open:step:-:body:-'
      && (await answer(p1, 'send')) === '指示：軽量・コピーしました' && await p1.evaluate(() => document.activeElement && document.activeElement.id === 'paste-deck'),
      'S1 ④: 「指示をコピー」 opens ⑤ (focus in the slides field) and folds ④ to 「指示：軽量・コピーしました」: ' + await flowState(p1));
    ok(/^コピーしました（[\d.]+ KB）。対話型 AI のタブに貼り付けて送信してください。長いので、貼り付けるとファイルの添付の形になることがありますが、そのまま送信できます。AI が書き終えたら ⑤ へ$/.test(await text(p1, '#paste-copied')), 'S1 ④: the copied message says to send it even as an attachment, then go to ⑤');
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
    ok(JSON.stringify(nd1) === JSON.stringify({ v: 1, plan: 'free', category: 'teaching', subcategory: 'class', purposes: ['cause-effect'], subjects: ['science'], audience: 'primary-junior' }) && !F1['deck.html'].includes('data-egatari-seed') && F1['narration.md'].includes('{#s-'),
      'S1: 「作成」 opens the new deck (no seed written) and keeps the choices in studio.newDeck: ' + JSON.stringify(nd1));
    ok(/^作成しました：スライド 3 枚 · 保存するまでファイルには書いていません/.test(await text(p1, '#toast')), 'S1: the toast says 「作成しました：スライド 3 枚」');

    // ================================================================ S6 S1 の先生：練習問題を 1 枚足す（別のチャットで頼む：指示の全体も付ける）
    await p1.evaluate(() => { window.__APP_TEST.insertAi(null); });
    await p1.waitForSelector('#dlg[open] #paste-insert-n');
    const ih = await p1.$$eval('#dlg-body section.paste-step h3', (xs) => xs.map((x) => x.textContent));
    ok((await text(p1, '#dlg-title')) === 'スライドの挿入' && ih.join('|') === '① どんなスライドを挿入しますか|② 対話型 AI に指示を送信します|③ AI の出力を貼り付けます'
      && (await text(p1, '#ai-howto')) === '挿入したいスライドを書くと、対話型の生成 AI（ChatGPT・Gemini・Claude など）に送信する指示ができます。AI の出力をここに貼り付けると、スライドを挿入します。' && (await text(p1, 'label[for=paste-with-pack]')) === 'このファイルを作ったのとは別のチャットに送信する（指示の全体も付けます）',
      'S6: 「スライドの挿入」 with three questions, and the choice to send to a different chat: ' + ih.join(' / '));
    ok((await flowState(p1)) === '1:open:step:-:body:- 2:shut:-:pending:nobody:- paste:shut:-:pending:nobody:-', 'S6: insert follows the same one-open flow (① open, ② ③ headings): ' + await flowState(p1));
    await p1.fill('#paste-insert-wish', '練習問題を 1 つ');
    // macOS の CI では、プレビューの上の窓のボタンを押しても下の iframe に届くことがある（click-retry.mjs）：② が開くまで押し直す
    await clickUntil(p1, '#paste-next-1', () => p1.waitForSelector('#paste-step1-answer .paste-answer-text', { timeout: scaled(2500) }));
    ok((await flowState(p1)) === '1:shut:-:-:nobody:answer 2:open:step:-:body:- paste:shut:-:pending:nobody:-' && (await text(p1, '#paste-step1-answer .paste-answer-text')) === '挿入する枚数：1 枚・練習問題を 1 つ',
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
    await p1.waitForFunction(() => /挿入しました/.test(document.getElementById('toast').textContent), null, { timeout: scaled(30000) });
    await p1.waitForFunction(() => { const f = window.__APP_TEST.files(); return f && new TextDecoder().decode(Uint8Array.from(atob(f['deck.html']), (c) => c.charCodeAt(0))).includes('練習問題'); }, null, { timeout: scaled(30000) });
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
    await checkSkillDownload(p2, { lang: 'en', selector: '#paste-download-skill', ok, base: BASE });
    let c2 = await copy(p2);
    ok(tailOf(c2, 'en') === '# What I want\n\n**A. Make a new file**\n\n- Title (used as is on the cover): Course registration\n- Audience: New students\n- Language: English\n- Speakers: one narrator\n- Theme: default (<html data-theme="default">)\n',
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
    ok(JSON.stringify(newDeckOf(F2)) === JSON.stringify({ v: 1, plan: 'free', category: 'guides', subcategory: null, purposes: [], subjects: [], audience: 'general' }), 'S2: “None of these” is stored as subcategory: null in studio.newDeck, with the audience of guides (general): ' + JSON.stringify(newDeckOf(F2)));

    // ================================================================ S7 S2 のデッキを修正：直したスライドだけが返る
    await clickCommand(p2, '#b-revise-cmd');
    await p2.waitForSelector('#dlg[open] #paste-wish');
    const rh = await p2.$$eval('#dlg-body section.paste-step h3', (xs) => xs.map((x) => x.textContent));
    ok((await text(p2, '#dlg-title')) === 'Revise' && rh.join('|') === '1. What should be changed?|2. Send the fix request to your AI chatbot|3. Paste the AI’s output' && (await status(p2)).go === 'Replace' && (await status(p2)).goOff && (await status(p2)).note === 'Paste the slides or the script in step 3' && (await status(p2)).beside
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
    await p2.waitForFunction(() => { const f = window.__APP_TEST.files(); return f && new TextDecoder().decode(Uint8Array.from(atob(f['deck.html']), (c) => c.charCodeAt(0))).includes('<h2>3 か月の結果'); }, null, { timeout: scaled(30000) });
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
    // ビジネス：学校は聞かない（読み手は社会人）。報告の題名からは題材を推さない
    const l3 = await labels(p3);
    ok(!l3.schoolShown && l3.subjects === '' && l3.why === '' && (await text(p3, '#paste-purposes legend')) === 'What do you want to show? (Any number, or none)' && (await text(p3, '#paste-subjects legend')) === 'Subject (optional)'
      && (await text(p3, '#paste-purposes-note')) === 'Parts that fit your choice come first in the instructions, with full descriptions' && /^Parts in the instructions: \d+ described, \d+ by name only$/.test(l3.sum),
      'S3 ④: Business asks no school level; the English labels and the counting line: ' + l3.sum);
    // 英語の画面の 2 つの選択肢
    const opts3 = await planOpts(p3);
    ok(JSON.stringify(opts3) === JSON.stringify([
      ['free', 'A free AI, or not sureIf unsure', 'Short instructions. You can paste them into free ChatGPT or Gemini as they are', true, 'If unsure'],
      ['paid', 'A paid AI, or as a file', 'Long instructions with every part described, for a paid AI that reads long text. You can save them as a file and attach it.', true, '']])
      && (await text(p3, '#paste-plan legend')) === 'Which AI will you paste it into?' && await noOldParts(p3),
      'S3 ④: both options show the English wording (name, “If unsure” on the free one, and the note under each); no size or limit: ' + JSON.stringify(opts3));
    await p3.check('#paste-purpose-key-number');
    await p3.check('#paste-purpose-change');
    const free3 = (await labels(p3)).sum;
    await p3.check('#paste-plan-paid');
    const c3 = await copy(p3);
    const r3 = ranked({ category: 'business', purposes: ['change', 'key-number'], audience: 'working-adult' }, 'paid', 'en', tailOf(c3, 'en'));
    ok(c3.includes('# First, send only the outline') && c3.includes('- Length (slides or minutes): 20 minutes') && c3 === r3.text && r3.described.slice(0, 3).sort().join() === 'm-bars,m-curves,m-kpi' && c3.includes('### `<m-curves>`')
      && /When the outline is out, go to step 5\.$/.test(await text(p3, '#paste-copied')),
      `S3 ④: the paid instructions are ranked by the labels (key number and change first: ${r3.described.slice(0, 4).join(', ')}…) with the outline request; the message says to go to step 5 when the outline is out`);
    ok(free3 !== (await labels(p3)).sum && (await labels(p3)).sum === sumOf(r3, 'en'), `S3 ④: the paid AI describes more parts in the same order (${free3} → ${(await labels(p3)).sum})`);
    // 有料のプラン（en）、長い教材（構成案から）：「Save the instructions as a file」が主、「Copy the instructions」が従
    await p3.click('#paste-change-send');
    await p3.waitForSelector('#paste-copy-guide:visible');
    ok(await p3.$eval('#paste-save-guide', (b) => !b.hidden && b.classList.contains('pri')) && !(await p3.$eval('#paste-copy-guide', (b) => b.classList.contains('pri')))
      && await p3.isVisible('#paste-attach-hint') && (await text(p3, '#paste-attach-hint')) === 'Attach long instructions to the chat as a file. Gemini may cut a copy-and-paste at about 30,000 characters. ChatGPT turns a long paste into an attachment by itself.',
      'S3 ④: paid plan: “Save the instructions as a file” is primary and “Copy the instructions” secondary, with the attachment-guidance line');
    const [dl3] = await Promise.all([p3.waitForEvent('download', { timeout: scaled(10000) }), p3.click('#paste-save-guide')]);
    ok(dl3.suggestedFilename() === 'egatari-instructions-en.txt', `S3 ④: “Save the instructions as a file” downloads egatari-instructions-en.txt (got ${dl3.suggestedFilename()})`);
    const file3 = await dl3.path();
    ok(!!file3 && fs.readFileSync(file3, 'utf8') === c3, 'S3 ④: the saved file has exactly the bytes “Copy the instructions” would put on the clipboard (UTF-8, no BOM)');
    ok(/^Saved \([\d.]+ KB\)\. Attach the downloaded file to your AI chatbot and send it\. When the outline is out, go to step 5\.$/.test(await text(p3, '#paste-copied')), 'S3 ④: saving a long lesson’s pack says “Saved (N KB)…” and still says to go to step 5 once the outline is out');
    ok((await answer(p3, 'send')) === 'Instructions: Detailed · copied', 'S3 ④: the answered line names the instructions (Detailed): ' + await answer(p3, 'send'));
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
    ok(o3 && o3.next === 7 && o3.rows.length === 20 && JSON.stringify(newDeckOf(F3)) === JSON.stringify({ v: 1, plan: 'paid', category: 'business', subcategory: 'report', purposes: ['change', 'key-number'], subjects: [], audience: 'working-adult' }),
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
    const l4 = await labels(p4);
    ok(l4.subjects === 'japanese' && l4.why === '②に「漢文」とあるので、国語を選びました' && l4.purposes === '',
      'S4 ④: 漢文 in step 2 ticks the subject 国語, and says why: ' + l4.why);
    // ［変更］で ② を直す：④ ⑤ は出たまま。答えの 1 行も新しくなる
    await p4.click('#paste-change-content');
    ok(await p4.isVisible('#paste-title') && (await flowState(p4)) === 'kind:shut:-:-:body:answer content:open:step:-:body:- theme:shut:-:-:body:answer send:shut:-:-:nobody:- paste:shut:-:pending:nobody:-'
      && await p4.evaluate(() => document.activeElement && document.activeElement.id === 'paste-title'),
      'S4: 「変更」 reopens ② alone (focus on the title); ① ③ keep their summaries and ④ ⑤ are headings: ' + await flowState(p4));
    await p4.fill('#paste-title', '臥薪嘗胆（十八史略）');
    await p4.click('#paste-next-content');
    ok((await answer(p4, 'content')) === 'タイトル：臥薪嘗胆（十八史略）', 'S4 ②: the answered line follows the change');
    // 自分で外した題材は、推し直しで戻さない
    await p4.uncheck('#paste-subject-japanese');
    await p4.click('#paste-change-content');
    await p4.fill('#paste-title', '臥薪嘗胆（漢文）');
    await p4.click('#paste-next-content');
    ok(!(await p4.isChecked('#paste-subject-japanese')) && (await labels(p4)).why === '', 'S4 ④: a subject the author unticked is not ticked again by the guess, and the reason line is gone');
    await p4.check('#paste-subject-japanese');
    await p4.check('#paste-school-high-school');
    const c4 = await copy(p4);
    const t4 = tailOf(c4, 'ja');
    const r4 = ranked({ category: 'teaching', subjects: ['japanese'], audience: 'high-school' }, 'free', 'ja', t4);
    ok(t4.startsWith('# 頼みたいこと\n\n**A. 新しく作る**\n\n- タイトル（表紙にそのまま使う）：臥薪嘗胆（漢文）\n- 言語：日本語\n- 話者：2 人（Expert と Novice の掛け合い）\n- そのほかの希望：書き下し文を先に\n- テーマ：default') && t4.includes('\n## 内容（要点・メモ・元の資料）\n\n漢文「臥薪嘗胆」の書き下し文と現代語訳\n')
      && c4 === r4.text && c4.includes('### `<m-kanbun>`') && r4.described[0] === 'm-predict' && r4.described.slice(1, 4).sort().join() === 'm-gendai,m-kanbun,m-kobun',
      'S4 ④: the request has the title, language, two speakers and the wishes; the content goes after it; with no purpose, the Japanese parts come first and are described');
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
    ok(JSON.stringify(newDeckOf(F4)) === JSON.stringify({ v: 1, plan: 'free', category: 'teaching', subcategory: 'class', purposes: [], subjects: ['japanese'], audience: 'high-school' }), 'S4: studio.newDeck has the subject and the school level: ' + JSON.stringify(newDeckOf(F4)));

    // ================================================================ S5 大学の教員（ja・有料の ChatGPT）：前にチャットの AI と話し合った内容（と添付した資料）でゼミ資料
    const p5 = await open('ja', 's5');
    await startNew(p5);
    await p5.check('#paste-cat-research');
    await p5.check('#paste-sub-seminar');
    await p5.click('#paste-next-kind');
    ok((await p5.$$eval('#paste-content-mode label', (xs) => xs.map((x) => x.textContent))).join('|') === 'AI に任せる（タイトルだけで考えます）|ここに書く・貼る（授業のメモや教科書の文をそのまま貼れます）|対話型 AI に渡してある（PDF などの資料を添付した、または内容を話し合った）'
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
    ok((await answer(p5, 'content')) === 'タイトル：ゼミの進め方・研究室の学部 4 年生・内容は対話型 AI に渡してある', 'S5 ②: the answered line says the content is already with the AI chatbot');
    await p5.click('#paste-next-theme');
    await p5.check('#paste-plan-paid');
    const c5 = await copy(p5);
    const sem = sub('research', 'seminar');
    ok(tailOf(c5, 'ja') === `# 頼みたいこと\n\n**B. 渡した資料と話し合いの内容で作る**\n\nこのチャットで渡した資料と、ここまでの話し合いの内容で、スライドと台本を作ってください。\n\n- タイトル（表紙にそのまま使う）：ゼミの進め方\n- 対象（だれ向け）：研究室の学部 4 年生\n- 言語：日本語\n- 話者：1 人\n- そのほかの希望：最後に議論する問いを 1 つ\n- テーマ：default（<html data-theme="default">）\n- 場面：研究発表／ゼミ・進捗報告\n- 構成の型：${sem.structure.ja}\n- 見せ方：${sem.show.ja}\n`,
      'S5 ④: the request (B. 渡した資料と話し合いの内容で作る) has the title, audience and the 詳しく lines in the same form as A (the length left to the AI is not written)');
    // 有料のプラン：指示をファイルに保存するのが主、コピーは従（長い指示は Gemini の貼り付けで約 3 万字で切れる。backlog 2026-11-05）
    await p5.click('#paste-change-send');
    await p5.waitForSelector('#paste-copy-guide:visible');
    ok(await p5.$eval('#paste-save-guide', (b) => !b.hidden && b.classList.contains('pri')) && !(await p5.$eval('#paste-copy-guide', (b) => b.classList.contains('pri')))
      && await p5.isVisible('#paste-attach-hint') && (await text(p5, '#paste-attach-hint')) === '長い指示は、ファイルにしてチャットに添付してください。Gemini は、コピーして貼り付けると約 3 万字で切れることがあります。ChatGPT は貼り付けると自動で添付に変わります。',
      'S5 ④: paid plan: 「指示をファイルに保存」 is primary and 「指示をコピー」 secondary, with the attachment-guidance line under them');
    const [dl5] = await Promise.all([p5.waitForEvent('download', { timeout: scaled(10000) }), p5.click('#paste-save-guide')]);
    ok(dl5.suggestedFilename() === 'egatari-instructions-ja.txt', `S5 ④: 「指示をファイルに保存」 downloads egatari-instructions-ja.txt (got ${dl5.suggestedFilename()})`);
    const file5 = await dl5.path();
    ok(!!file5 && fs.readFileSync(file5, 'utf8') === c5, 'S5 ④: the saved file has exactly the bytes 「指示をコピー」 would put on the clipboard (UTF-8, no BOM)');
    ok(/^保存しました（[\d.]+ KB）。ダウンロードしたファイルを対話型 AI に添付して送信してください。AI が書き終えたら ⑤ へ$/.test(await text(p5, '#paste-copied')), 'S5 ④: saving shows 「保存しました（N KB）…」, following the copy note’s wording without the “turns into an attachment” caveat');
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

    // ================================================================ S8 高校の先生（ja・無料のプラン）：パーツの一覧・推した束と理由・メーターと外す候補・キーボード
    const p8 = await open('ja', 's8');
    await startNew(p8);
    await p8.check('#paste-cat-teaching');
    await p8.check('#paste-sub-class');
    await p8.click('#paste-next-kind');
    await p8.fill('#paste-title', 'わり算の筆算とデータの分布');
    await p8.click('#paste-next-content');
    await p8.click('#paste-next-theme');
    const subjName = (id) => subjectChoices().find((x) => x.id === id).label.ja;
    let l8 = await labels(p8);
    ok(l8.subjects === 'statistics,mathematics' && l8.why === `②に「分布」とあるので、${subjName('statistics')}を選びました。②に「筆算」とあるので、${subjName('mathematics')}を選びました`,
      'S8 ④: two subjects from the words of step 2, one reason each: ' + l8.why);
    ok((await p8.getAttribute('#paste-purposes', 'aria-describedby')) === 'paste-purposes-note' && (await p8.$$eval('#paste-purposes input', (xs) => xs.every((x) => x.type === 'checkbox' && x.closest('label'))))
      && (await p8.$$eval('#paste-school input', (xs) => xs.every((x) => x.type === 'radio'))),
      'S8 ④: the purposes are checkboxes in their labels (the note describes the group); the school level is a radio group');
    // キーボード：札にフォーカスしてスペースで選ぶ・外す
    await p8.focus('#paste-purpose-spread');
    await p8.keyboard.press('Space');
    ok(await p8.isChecked('#paste-purpose-spread'), 'S8 ④: Space on a focused tile chooses it');
    await p8.focus('#paste-purpose-compare');
    await p8.keyboard.press('Space'); await p8.keyboard.press('Space');
    ok(!(await p8.isChecked('#paste-purpose-compare')), 'S8 ④: Space twice leaves it off');
    await p8.check('#paste-school-high-school');
    const c8 = await copy(p8);
    const r8 = ranked({ category: 'teaching', purposes: ['spread'], subjects: ['statistics', 'mathematics'], audience: 'high-school' }, 'free', 'ja', tailOf(c8, 'ja'));
    l8 = await labels(p8);
    ok(c8 === r8.text && r8.described[0] === 'm-predict' && r8.described[1] === 'm-boxplot' && r8.described.includes('m-hist') && l8.sum === sumOf(r8, 'ja') && r8.named.every((t) => c8.includes('`' + t + '`') && !c8.includes('### `<' + t + '>`'))
      && c8.includes('この表には、名前だけで説明のないパーツもある。使わない。'),
      `S8 ④: the copied instructions describe the top of the ranking (${r8.described.join(', ')}); the rest are only named in the purposes table, with the rule not to use them: ${l8.sum}`);
    // 自分で外した題材は、推し直しで戻さない
    await p8.click('#paste-change-send');
    await p8.uncheck('#paste-subject-statistics');
    await p8.click('#paste-change-content');
    await p8.fill('#paste-title', 'わり算の筆算とデータの分布（2）');
    await p8.click('#paste-next-content');
    l8 = await labels(p8);
    ok(l8.subjects === 'mathematics' && l8.why === `②に「筆算」とあるので、${subjName('mathematics')}を選びました`, 'S8 ④: a new guess does not tick again the subject the author unticked: ' + JSON.stringify(l8));
    // 有料の AI：同じ順で、説明つきが増える（受け皿のない束の m-ctable も、順位が来れば説明つき）
    const free8 = l8.sum;
    await p8.check('#paste-plan-paid');
    const c8p = await copy(p8);
    const r8p = ranked({ category: 'teaching', purposes: ['spread'], subjects: ['mathematics'], audience: 'high-school' }, 'paid', 'ja', tailOf(c8p, 'ja'));
    ok(c8p === r8p.text && (await labels(p8)).sum === sumOf(r8p, 'ja') && free8 !== sumOf(r8p, 'ja') && r8p.described.length > r8.described.length,
      `S8 ④: the paid AI keeps the order and describes more parts (${free8} → ${sumOf(r8p, 'ja')})`);
    await p8.click('#paste-change-send');
    await shot(p8, 'flow-s8-parts.png', 'paste-step-send');

    // ================================================================ S9 前に分野を選んだ教材（egatari.json の studio.newDeck）を開いたまま新規作成：前の選び方は読まず、いつも初めの選び方から。記録は書き換えない
    const p9 = await open('ja', 's9');
    const cfg9 = '{\n  "studio": {\n    "newDeck": {"v": 1, "plan": "free", "category": "teaching", "subcategory": "class", "subjects": ["math", "kokugo", "info"], "purposesOff": []}\n  }\n}\n';
    await p9.evaluate(async ([d, n, c]) => {
      const root = await navigator.storage.getDirectory();
      const top = await root.getDirectoryHandle('newdeck-stored-' + Date.now(), { create: true });
      for (const [k, v] of [['deck.html', d], ['narration.md', n], ['egatari.json', c]]) { const w = await (await top.getFileHandle(k, { create: true })).createWritable(); await w.write(v); await w.close(); }
      window.__sdir = top;
      window.__APP_TEST.open(top);
    }, [fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'deck.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'examples', 'minimal', 'narration.md'), 'utf8'), cfg9]);
    await p9.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.open && s.allowed && s.frameLoaded === s.loads && s.pos; }, null, { timeout: scaled(30000) });
    const cfgNow = () => p9.evaluate(async () => (await (await window.__sdir.getFileHandle('egatari.json')).getFile()).text());
    await clickCommand(p9, '#b-new');
    await p9.waitForSelector('#dlg[open] #paste-step-kind');
    await p9.check('#paste-cat-teaching');
    await p9.check('#paste-sub-class');
    await p9.click('#paste-next-kind');
    await p9.fill('#paste-title', 'てこのはたらき');
    await p9.click('#paste-next-content');
    await p9.click('#paste-next-theme');
    const l9 = await labels(p9);
    ok(l9.purposes === '' && l9.subjects === '' && l9.school === '' && (await cfgNow()) === cfg9,
      'S9 ④: New… starts with nothing chosen even when the open lesson recorded three subjects; the record is not touched');
    await p9.click('#dlg-cancel');
    ok((await cfgNow()) === cfg9, 'S9: the record is still unchanged after closing');

    // ================================================================ S10 研修の講師（en）：小分類「研修・使い方の説明」でタイマーを推す。外せば指示に入らない
    const p10 = await open('en', 's10');
    await startNew(p10);
    await p10.check('#paste-cat-teaching');
    await p10.check('#paste-sub-training');
    await p10.click('#paste-next-kind');
    await p10.fill('#paste-title', 'Using the new booking system');
    await p10.click('#paste-next-content');
    await p10.click('#paste-next-theme');
    // 研修：学校は聞かない（読み手は社会人）。手順を選ぶと、社会人向けの手順のパーツ（画面の手順・確かめる一覧）が先に説明つきで入る
    ok(!(await labels(p10)).schoolShown, 'S10 ④: Training and how-to asks no school level');
    await p10.check('#paste-purpose-process');
    const c10 = await copy(p10);
    const r10 = ranked({ category: 'teaching', purposes: ['process'], audience: 'working-adult' }, 'free', 'en', tailOf(c10, 'en'));
    ok(c10 === r10.text && r10.described[0] === 'm-predict' && r10.described.slice(1, 3).sort().join() === 'm-callout,m-checklist' && c10.includes('### `<m-callout>`') && c10.includes('### `<m-flow>`'),
      'S10 ④: the process parts for working adults come first and are described: ' + r10.described.join(', '));
    ok((await answer(p10, 'send')) === 'Instructions: Light · copied', 'S10 ④: the answered line');

    // ================================================================ S11 スキル（チャットの AI の egatari:make）の出力を持っている先生（ja）：問いに答えずに貼る
    const cdeck11 = worked('common', 'deck.html'), cnarr11 = worked('common', 'narration.md');
    const p11 = await open('ja', 's11');
    await startNew(p11);
    const flow0 = await flowState(p11);
    ok((await text(p11, '#paste-direct')) === 'AI の出力を貼り付ける' && (await text(p11, '#paste-direct-hint')) === 'スキルで作った出力や、前に作った出力を、そのまま貼り付けます'
      && (await p11.getAttribute('#paste-direct', 'aria-describedby')) === 'paste-direct-hint' && await p11.isVisible('#ai-howto') && await p11.isHidden('#paste-only')
      && await p11.evaluate(() => document.getElementById('ai-howto').nextElementSibling.id === 'paste-direct-offer'),
      'S11: under the how-to, New… offers 「AI の出力を貼り付ける」 with 「スキルで作った出力や、前に作った出力を、そのまま貼り付けます」 under it');
    await shot(p11, 'flow-s11-offer.png');
    await p11.click('#paste-direct');
    await p11.waitForSelector('#paste-only:not([hidden]) #paste-deck');
    await p11.waitForFunction(() => document.activeElement && document.activeElement.id === 'paste-deck');
    let st11 = await status(p11);
    ok((await text(p11, '#paste-only-h')) === 'AI の出力を貼り付けます' && JSON.stringify(await visible(p11, ['paste-step-kind', 'paste-step-content', 'paste-step-theme', 'paste-step-send', 'paste-step-paste', 'ai-howto', 'paste-direct'])) === JSON.stringify([false, false, false, false, false, false, false])
      && await p11.isVisible('#paste-narr') && await p11.isVisible('#paste-file') && (await text(p11, '#paste-file')) === 'ファイルから読む' && (await text(p11, '#paste-only-back')) === '問いに答えて作る'
      && st11.go === '作成' && st11.goOff && st11.note === 'スライドを貼り付けてください' && st11.beside,
      'S11: the paste-only form shows only the two fields of ⑤, 「ファイルから読む」 and 「問いに答えて作る」; ① 〜 ④ are not asked; 「作成」 says 「スライドを貼り付けてください」 (no step number): ' + JSON.stringify(st11));
    await shot(p11, 'flow-s11-only.png');
    // 戻る：ふつうの流れはそのまま（① が開いている）。もう一度開くと、貼った字は残っている
    await p11.fill('#paste-narr', cnarr11);
    await p11.click('#paste-only-back');
    await p11.waitForSelector('#paste-only', { state: 'hidden' });
    ok((await flowState(p11)) === flow0 && await p11.isVisible('#ai-howto') && await p11.evaluate(() => document.activeElement && document.activeElement.id === 'paste-direct')
      && (await status(p11)).note === '① に答えてください', 'S11: 「問いに答えて作る」 goes back to the questions as they were (① open): ' + await flowState(p11) + ' focus=' + await p11.evaluate(() => document.activeElement && document.activeElement.id) + ' note=' + (await status(p11)).note);
    await p11.click('#paste-direct');
    await p11.waitForSelector('#paste-only:not([hidden]) #paste-deck');
    ok((await p11.inputValue('#paste-narr')) === cnarr11.trim() || (await p11.inputValue('#paste-narr')) === cnarr11, 'S11: what was pasted stays when going back and forth');
    // ファイルから読む：種類の違うファイルと大きすぎるファイルは読まずに断る（上限つきの読み取り。欄はそのまま）
    const pickFile = (p, name, size, body) => p.evaluate(([name, size, body]) => {
      const inp = document.getElementById('paste-file-input'), dt = new DataTransfer();
      dt.items.add(new File([body !== null ? body : new Uint8Array(size)], name, { type: 'text/plain' }));
      inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    }, [name, size, body]);
    await pickFile(p11, 'reply.pdf', 0, 'x');
    await p11.waitForSelector('#paste-file-msg:not([hidden])');
    ok((await text(p11, '#paste-file-msg')) === 'テキストのファイル（.txt・.md）を選んでください' && (await p11.inputValue('#paste-deck')) === '', 'S11: a file that is not .txt or .md is refused');
    await pickFile(p11, 'huge.md', READ_LIMITS.source + 1, null);
    await p11.waitForFunction(() => /大きすぎます/.test(document.getElementById('paste-file-msg').textContent));
    ok((await text(p11, '#paste-file-msg')) === `このファイルは大きすぎます（${Math.round(READ_LIMITS.source / 1048576)} MB まで）。AI の出力のファイルを選び直してください`
      && (await p11.inputValue('#paste-deck')) === '' && (await status(p11)).goOff, `S11: a file over the limit (${READ_LIMITS.source + 1} bytes) is refused by the bounded reader without reading it; the fields stay as they were`);
    await p11.fill('#paste-deck', replyOf(cdeck11, cnarr11));
    st11 = await status(p11);
    ok(st11.deck === '✓ スライド 3 枚' && st11.narr === '✓ 台本 3 節' && st11.info === '出力の全体だったので、スライドと台本に分けました' && !st11.goOff && st11.note === '' && await p11.isHidden('#paste-file-msg'),
      'S11: the whole output is split as in ⑤ and 「作成」 is enabled: ' + JSON.stringify(st11));
    const F11 = await create(p11);
    const s11 = await p11.evaluate(() => window.__APP_TEST.state().portable);
    ok(s11.name === exportName('How a web page arrives', 'ai-draft', FORMAT.FILE_EXT) && newDeckOf(F11) === undefined && /<html lang="en" data-theme="default">/.test(F11['deck.html']) && F11['narration.md'].includes('{#s-')
      && /^作成しました：スライド 3 枚/.test(await text(p11, '#toast')),
      `S11: 「作成」 makes the lesson named from its <title> (${s11.name}), keeps the deck's theme and writes no studio.newDeck (no setting was asked)`);

    // ================================================================ S12 前に作った出力に誤り（台本に行き先のないステップ）：⑤ と同じに品質チェックと修正依頼
    const p12 = await open('ja', 's12');
    await startNew(p12);
    await p12.click('#paste-direct');
    await p12.waitForSelector('#paste-only:not([hidden]) #paste-deck');
    const badN12 = cnarr11.replace('[0] Today we follow', '[9] This step is not on the slide.\n[0] Today we follow');
    ok(badN12 !== cnarr11, 'S12: the narration has an orphan step [9]');
    await p12.fill('#paste-narr', replyOf(cdeck11, badN12));
    await create(p12);
    const sum12 = await text(p12, '#panel-body .sum');
    ok(/エラー/.test(sum12) && await p12.isVisible('#panel-body #b-fixreq') && (await text(p12, '#panel-body #b-fixreq')) === 'AI への修正依頼をコピー', 'S12: the quality check reports the error and offers 「AI への修正依頼をコピー」, as after ⑤: ' + sum12);
    await p12.click('#panel-body #b-fixreq');
    await p12.waitForSelector('#dlg[open] #fix-text');
    ok((await p12.inputValue('#fix-text')).includes('[9]'), 'S12: the fix request quotes the orphan step');
    await p12.click('#dlg-cancel');

    // ================================================================ S13 ふつうの流れ（en）：⑤ で「Read from a file」から .md の出力を選ぶ
    const p13 = await open('en', 's13');
    await startNew(p13);
    await answerNew(p13, { cat: 'other', sub: null, title: 'How a web page arrives', paste: true });
    ok((await text(p13, '#paste-file')) === 'Read from a file' && (await text(p13, '#paste-file-hint')) === 'Choose the output file (.txt, .md), or drag it onto a field.' && await p13.isVisible('#paste-file'),
      'S13 ⑤: the normal step 5 has “Read from a file” by the fields');
    const [chooser] = await Promise.all([p13.waitForEvent('filechooser'), p13.click('#paste-file')]);
    await chooser.setFiles({ name: 'reply.md', mimeType: 'text/markdown', buffer: Buffer.from(replyOf(cdeck11, cnarr11)) });
    await p13.waitForFunction(() => document.getElementById('paste-deck-st').textContent.startsWith('✓'));
    const st13 = await status(p13);
    ok(st13.deck === '✓ 3 slides' && st13.narr === '✓ Script, 3 sections' && st13.info === 'That was the whole output; it was split into slides and script.' && !st13.goOff,
      'S13 ⑤: the chosen .md goes through the same split as pasted text: ' + JSON.stringify(st13));
    const F13 = await create(p13);
    ok(JSON.stringify(newDeckOf(F13)) === JSON.stringify({ v: 1, plan: 'free', category: 'other', subcategory: null, purposes: [], subjects: [], audience: null }), 'S13: the normal flow still records its choices in studio.newDeck: ' + JSON.stringify(newDeckOf(F13)));

    // ================================================================ S14 貼り付けだけの画面（en）：<title> も data-theme もない出力の .txt を台本の欄に落とす
    const p14 = await open('en', 's14');
    await startNew(p14);
    ok((await text(p14, '#paste-direct')) === 'Paste the AI’s output' && (await text(p14, '#paste-direct-hint')) === 'For output you already have, from a skill or from before.', 'S14: the action is “Paste the AI’s output”, with its line under it');
    await p14.click('#paste-direct');
    await p14.waitForSelector('#paste-only:not([hidden]) #paste-deck');
    ok((await status(p14)).note === 'Paste the slides' && (await text(p14, '#paste-only-back')) === 'Answer the questions instead', 'S14: “Create” says “Paste the slides” (no step number)');
    const deck14 = cdeck11.replace(/<title>[^<]*<\/title>\n?/, '').replace(' data-theme="default"', '');
    ok(!/<title>|data-theme/.test(deck14), 'S14: the deck has no <title> and no data-theme');
    await p14.evaluate((t) => {
      const box = document.getElementById('paste-narr').closest('.paste-field'), dt = new DataTransfer();
      dt.items.add(new File([t], 'reply.txt', { type: 'text/plain' }));
      box.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      box.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, replyOf(deck14, cnarr11));
    await p14.waitForFunction(() => document.getElementById('paste-deck-st').textContent.startsWith('✓'));
    const st14 = await status(p14);
    ok(st14.deck === '✓ 3 slides' && st14.narr === '✓ Script, 3 sections' && !st14.goOff, 'S14: the dropped .txt is split into both fields: ' + JSON.stringify(st14));
    const F14 = await create(p14);
    const s14 = await p14.evaluate(() => window.__APP_TEST.state().portable);
    ok(s14.name === exportName('How a web page arrives', 'ai-draft', FORMAT.FILE_EXT) && !/data-theme/.test(F14['deck.html'].match(/<html\b[^>]*>/i)[0]) && newDeckOf(F14) === undefined,
      `S14: with no <title>, the name comes from the first h1 (${s14.name}); no theme is added`);
  } finally {
    for (const c of contexts) await c.close();
  }
}
