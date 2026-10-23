// チャットの AI との行き来（docs/authoring-with-llms.md）：
//   「AI で新しく作る」：① 頼みたいことを書く（kit/core/llm-request.mjs）→ ② 共通の本体と、選んだ系列（既定は今のデッキの部品・テーマから推したもの。
//   なければ academic）と ① を組み立てて写す（kit/core/llm-pack.mjs）→ ③ 返事を貼り付けて開く：返事の全体（か、1 つずつ貼った 2 つの囲み。
//   kit/core/llm-import.mjs の pastePart）から deck.html と narration.md を取り出し（kit/core/llm-import.mjs）、スライドに id を付け
//   （kit/core/slide-ids.mjs。npm run ids と同じ本体）、メモリの上の原稿を Worker で1 ファイル（.ega.html）にして（app/build-worker.js の
//   exportHtml）、ほかの 1 ファイルと同じ道（openPortable：中身からコードを探し、あれば動かす前に確かめる）で開き、品質チェックをかける。
//   「AI の直しを取り込む」では、今の docId・設定・音声を残して原稿だけを入れ替える（直したスライドだけの返事は id で元の場所に戻す）
//   「AI への修正依頼を写す」：品質チェックの結果・組み立ての知らせ・その規格の文章（作った指示から）・今の原稿で依頼の文章を作る（kit/core/llm-fix.mjs）
// 貼り付けた文字列は信頼しない：このページでは解析と文字列の書き換えだけをし、組み立ては Worker で、表示は sandbox のプレビューで
import { buildPack, SERIES, membersOfSeries, seriesForDeck, packSize, packKb, kbOf } from '../kit/core/llm-pack.mjs';
import { pastePart, isPatch, mergeSlides, mergeNarration, sectionsOf, narrSections } from '../kit/core/llm-import.mjs';
import { requestForm, filledRequest, packWithRequest } from '../kit/core/llm-request.mjs';
import { assignIds } from '../kit/core/slide-ids.mjs';
import { buildFixRequest, cutOffRequest } from '../kit/core/llm-fix.mjs';
import { readingProblems, orphanDetail } from '../kit/core/narration-lint.mjs';
import { message, MESSAGES } from '../kit/check-messages.mjs';
import { cleanErrorText } from '../kit/core/error-text.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { exportName, titleOf } from '../kit/core/export-name.mjs';
import { memoryWorkspace } from './workspace.js';

const TX = {
  ja: {
    paste: 'AI で新しく作る…', pasteWelcome: 'AI で新しく作る', fixImport: 'AI の直しを取り込む…',
    title: 'AI で新しく作る',
    lead: 'チャットの AI（claude.ai・Gemini・ChatGPT など）に、3 つのステップで教材を作ってもらいます。',
    step1: '① 頼みたいことを書く', step2: '② AI への指示をコピーして、チャットに貼って送る', step3: '③ 返事を貼り付けて開く',
    step1Hint: '書いた内容は、コピーする指示の最後に入ります（チャットに貼ると添付のファイルの形になり、そこでは書き直せないため、先にここで書きます）。書かない項目は空のままでかまいません',
    kindLegend: 'どちらで作りますか', kindA: 'A　新しく作る', kindB: 'B　このチャットでここまで話し合った内容で作る',
    fieldPh: { topic: '例：二分探索のしくみ', audience: '例：高校 2 年生', length: '例：5 枚・10 分', language: '例：日本語', speakers: '例：1 人', examples: '例：電話帳で名前を探す' },
    needTopic: '① の「題材」を書いてください',
    guide: 'コピーする指示は、共通の本体（必ず入る）と、選んだ系列（必要なときだけ足す）と、① の頼みたいことです。系列を足すと、その教材に向くパーツの説明が加わります。',
    common: (kb) => `共通の本体（必ず入る）　${kb} KB`,
    seriesLegend: '系列（必要なときだけ足す）',
    seriesName: { academic: '学術（数式・関数・データ）', business: 'ビジネス（KPI・位置づけ・市場・お金の流れ）', kokugo: '国語（漢文・古文・現代文・縦書き）', info: '情報（符号の木）' },
    plusKb: (kb) => `+${kb} KB`, packTotal: (kb) => `合わせて ${kb} KB`,
    copyGuide: 'AI への指示をコピー',
    copied: (kb) => `コピーしました（${kb} KB、① の頼みたいこと入り）。チャットに貼り付けて送ってください。添付のファイルの形になっても、そのまま送ってください。返事が来たら ③ へ`,
    step3Hint: '返事の全体（返事の下のコピーのボタン）か、deck.html と narration.md の 2 つの囲みを 1 つずつ（囲みの右上のコピーのボタン）貼り付けます。1 つずつのときは、1 つ目を貼って「開く」を押すと、次の囲みを待ちます',
    pasteLabel: 'AI の返事', placeholder: 'ここに AI の返事の全体か、囲みを 1 つ貼り付ける',
    fixTitleImport: 'AI の直しを取り込む',
    fixImportLead: '修正依頼への AI の返事を貼り付けて、今のデッキに取り込みます。docId・音声はそのままです。直したスライドだけの返事なら、その id のスライドだけを置き換えます',
    fixImportHint: '返事の全体（返事の下のコピーのボタン）か、2 つの囲みを 1 つずつ（囲みの右上のコピーのボタン）貼り付けます',
    go: '開く', goFix: '取り込む', only: 'これだけで取り込む',
    untrusted: '貼り付けたものは開いたファイルと同じに扱います。スクリプトが入っていれば、動かす前に確かめます',
    held: {
      deck: (n) => `deck.html を受け取りました（スライド ${n} 枚。2 つのうち 1 つ目）。次に narration.md の囲みを、その囲みの右上のコピーのボタンで写して、ここに貼り付けてください`,
      narration: (n) => `narration.md を受け取りました（${n} 節。2 つのうち 1 つ目）。次に deck.html の囲みを、その囲みの右上のコピーのボタンで写して、ここに貼り付けてください`,
      again: (k) => `${k} をもう一度受け取ったので、前のものと入れ替えました。`,
      onlyHint: '直しが片方だけなら「これだけで取り込む」を押します',
      reset: '受け取ったものを捨てて最初から', resetDone: '受け取ったものを捨てました。返事の全体か、囲みを 1 つ貼り付けてください',
      joined: '2 回に分けて貼った deck.html と narration.md を合わせました',
    },
    err: {
      'no-blocks': 'コードの囲み（``` の行）も、deck.html・narration.md の中身も見つかりません。返事の全体（返事の下のコピーのボタン）か、2 つの囲みを 1 つずつ（囲みの右上のコピーのボタン）写して貼り付けてください',
      ambiguous: 'スライド（<section class="slide">）と口述原稿（## 見出しと [0] の行）の両方が入っていますが、囲みの行（```）がないので分けられません。返事の全体を返事の下のコピーのボタンで写すか、2 つの囲みを 1 つずつ写して貼り付けてください',
      'cut-deck': 'deck.html が </html> で終わっていません。途中までしか写せていないようです。囲みの右上のコピーのボタンで写し直してください',
      'no-deck': 'deck.html の囲みが見つかりません（```deck.html で始まる囲み）',
      'no-slides': 'deck.html の囲みに <section class="slide"> がありません',
      unclosed: (e) => `${e.line} 行目から始まる囲み${e.kind ? `（${e.kind === 'deck' ? 'deck.html' : 'narration.md'}）` : ''}が閉じていません。返事が途中で切れたようです。AI に「続きを」と頼むか、2 つの囲みで返し直してもらってください`,
      'no-narration': 'narration.md の囲みが見つかりません（```narration.md で始まる囲み）',
      empty: '何も貼り付けられていません',
      'no-match': '直したスライドの id が今のデッキにありません',
    },
    warn: {
      several: (w) => `${w.kind === 'deck' ? 'deck.html' : 'narration.md'} の囲みが ${w.n} 個あったので、最後のものを使いました`,
      ignored: (w) => `どちらのファイルでもない囲み ${w.n} 個は使いませんでした`,
      unfenced: '囲みがなかったので、<!DOCTYPE html> から </html> までと、その後ろの口述原稿を取り出しました',
      autoclosed: (w) => `${w.line} 行目からの囲みが閉じていなかったので、次の囲みの手前で閉じました`,
      unclosedAccepted: (w) => `${w.line} 行目からの narration.md の囲みに閉じる行（\`\`\`）がありませんでしたが、口述原稿は最後まであるので受け取りました`,
    },
    building: '取り込んでいます…', buildFailed: '取り込んだ原稿を組み立てられませんでした',
    imported: (n, ids) => `取り込みました：${n} 枚${ids ? `、id を ${ids} 枚に付けました` : ''}`,
    replaced: (n) => `置き換えました（${n}）`, replacedSlides: (ids) => `スライド ${ids.length} 枚を置き換えました`, replacedNarr: (n) => `口述原稿を置き換えました（${n} 節）`,
    idProblems: 'id を付けられないスライドがあります（品質チェックの結果を見てください）',
    unsavedNote: '保存するまでファイルには書いていません',
    fix: 'AI への修正依頼をコピー', fixTitle: 'AI への修正依頼',
    fixLead: (n, partial) => `指摘 ${n} 件と、その規格、${partial ? '問題のあるスライド' : '今の deck.html と narration.md'} をコピーしました。同じチャットに貼り付け、返事を「AI の直しを取り込む」で取り込みます`,
    fixCopyFailed: '自動ではコピーできませんでした。下の文字を選んでコピーしてください',
    copyCutOff: 'AI に送り直しを頼む文をコピー', cutOffCopied: 'コピーしました。チャットに貼り付け、返事をここに貼り付けてください',
    fixNone: '直す問題はありません', pasteReply: 'AI の直しを取り込む…', close: '閉じる',
    checkMsg: {
      orphanNarration: (a) => (a && typeof a === 'object' ? message('ja', 'narrOrphan', a) : `スライドにない段階の口述原稿 [${a}]`),
      compData: (a) => message('ja', 'compData', a),
      consoleError: (a) => message('ja', 'consoleError', { e: cleanErrorText(a) }),
      readingExpr: (a) => `読みの指定 ${a} が式を読んでいる（記号か用語だけに）`,
      readingSeveral: (a) => `読みの指定 ${a} に記号が 2 つ以上（記号ごとに分ける）`,
    },
  },
  en: {
    paste: 'Make with AI…', pasteWelcome: 'Make with AI', fixImport: 'Import AI fixes…',
    title: 'Make with AI',
    lead: 'A chat AI (claude.ai, Gemini, ChatGPT, …) makes the lesson for you in 3 steps.',
    step1: '1. Write what you want', step2: '2. Copy the instructions, paste them into the chat and send', step3: '3. Paste the reply and open it',
    step1Hint: 'What you write goes at the end of the copied instructions (pasted into a chat they often become an attachment you cannot edit there, so write it here first). Leave out anything you do not need.',
    kindLegend: 'How do you want to make it?', kindA: 'A. Make a new lesson', kindB: 'B. From what we have discussed so far in this chat',
    fieldPh: { topic: 'e.g. how binary search works', audience: 'e.g. first-year students', length: 'e.g. 5 slides, 10 minutes', language: 'e.g. English', speakers: 'e.g. one narrator', examples: 'e.g. finding a name in a phone book' },
    needTopic: 'Write the topic in step 1.',
    guide: 'The copied instructions are the common body (always included), the series you add (only when needed) and what you wrote in step 1. A series adds the notes on parts that suit that kind of lesson.',
    common: (kb) => `Common body (always included)   ${kb} KB`,
    seriesLegend: 'Series (add only when needed)',
    seriesName: { academic: 'Academic (math, functions, data)', business: 'Business (KPIs, positioning, markets, money flows)', kokugo: 'Japanese language arts (kanbun, kobun, gendai, vertical)', info: 'Information science (code trees)' },
    plusKb: (kb) => `+${kb} KB`, packTotal: (kb) => `${kb} KB in all`,
    copyGuide: 'Copy instructions for your AI',
    copied: (kb) => `Copied (${kb} KB, with what you wrote in step 1). Paste it into the chat and send. If it turns into an attachment, just send it. When the reply arrives, go to step 3.`,
    step3Hint: 'Paste the whole reply (the copy button under the reply), or the two blocks deck.html and narration.md one at a time (the copy button at the top right of each block). One at a time: paste the first and press Open; the editor then waits for the other.',
    pasteLabel: 'The AI’s reply', placeholder: 'Paste the whole reply of the AI here, or one block',
    fixTitleImport: 'Import AI fixes',
    fixImportLead: 'Paste the AI’s reply to your fix request to bring it into the current deck. The docId and audio stay. A reply with only some slides replaces just those, by id.',
    fixImportHint: 'Paste the whole reply (the copy button under the reply), or the two blocks one at a time (the copy button at the top right of each block).',
    go: 'Open', goFix: 'Import', only: 'Import just this',
    untrusted: 'Pasted content is treated like an opened file: if it contains scripts, the editor asks before running them.',
    held: {
      deck: (n) => `Got deck.html (${n} slide${n === 1 ? '' : 's'}; 1 of 2). Now copy the narration.md block with the copy button at its top right and paste it here.`,
      narration: (n) => `Got narration.md (${n} section${n === 1 ? '' : 's'}; 1 of 2). Now copy the deck.html block with the copy button at its top right and paste it here.`,
      again: (k) => `Got ${k} again; it replaces the earlier one. `,
      onlyHint: 'If the fix has only this one, press “Import just this”.',
      reset: 'Discard and start over', resetDone: 'Discarded. Paste the whole reply, or one block.',
      joined: 'Joined deck.html and narration.md pasted separately',
    },
    err: {
      'no-blocks': 'No code blocks (``` lines), and no deck.html or narration.md content found. Paste the whole reply (the copy button under the reply), or the two blocks one at a time (the copy button at the top right of each block).',
      ambiguous: 'This has both slides (<section class="slide">) and narration (## headings and [0] lines) but no ``` lines, so they cannot be told apart. Copy the whole reply with the copy button under it, or the two blocks one at a time.',
      'cut-deck': 'The deck.html does not end with </html>: only part of it was copied. Copy it again with the copy button at the top right of the block.',
      'no-deck': 'No deck.html block found (a block starting with ```deck.html).',
      'no-slides': 'The deck.html block has no <section class="slide">.',
      unclosed: (e) => `The block starting on line ${e.line}${e.kind ? ` (${e.kind === 'deck' ? 'deck.html' : 'narration.md'})` : ''} is not closed: the reply was probably cut off. Ask the AI to continue, or to send the two blocks again.`,
      'no-narration': 'No narration.md block found (a block starting with ```narration.md).',
      empty: 'Nothing was pasted.',
      'no-match': 'None of the fixed slides’ ids is in the current deck.',
    },
    warn: {
      several: (w) => `There were ${w.n} ${w.kind === 'deck' ? 'deck.html' : 'narration.md'} blocks; the last one was used.`,
      ignored: (w) => `${w.n} block(s) that are neither file were ignored.`,
      unfenced: 'No code blocks: took <!DOCTYPE html> … </html> and the narration after it.',
      autoclosed: (w) => `The block from line ${w.line} was not closed; it was closed before the next block.`,
      unclosedAccepted: (w) => `The narration.md block from line ${w.line} has no closing \`\`\`; it was accepted because the narration looks complete.`,
    },
    building: 'Importing…', buildFailed: 'Could not build the imported deck',
    imported: (n, ids) => `Imported ${n} slides${ids ? `; added ids to ${ids}` : ''}`,
    replaced: (n) => `Replaced (${n})`, replacedSlides: (ids) => `Replaced ${ids.length} slide(s)`, replacedNarr: (n) => `Replaced the narration (${n} section(s))`,
    idProblems: 'Some slides could not get an id (see the quality check results).',
    unsavedNote: 'Nothing is written to a file until you save.',
    fix: 'Copy fix request for your AI', fixTitle: 'Fix request for your AI',
    fixLead: (n, partial) => `Copied ${n} finding(s), their standards and ${partial ? 'the slides with problems' : 'the current deck.html and narration.md'}. Paste it into the same chat, then bring the reply in with “Import AI fixes”.`,
    fixCopyFailed: 'Could not copy automatically. Select the text below and copy it.',
    copyCutOff: 'Copy a resend request for your AI', cutOffCopied: 'Copied. Paste it into the chat, then paste the reply here.',
    fixNone: 'No problems to fix.', pasteReply: 'Import AI fixes…', close: 'Close',
    checkMsg: {
      orphanNarration: (a) => (a && typeof a === 'object' ? message('en', 'narrOrphan', a) : `Narration for a step the slide does not have [${a}]`),
      compData: (a) => message('en', 'compData', a),
      consoleError: (a) => message('en', 'consoleError', { e: cleanErrorText(a) }),
      readingExpr: (a) => `The reading ${a} reads an expression (one symbol or term only)`,
      readingSeveral: (a) => `The reading ${a} has several symbols (one reading each)`,
    },
  },
};

export function setupLlm(app) {
  const { S, $, el, ask, toast, status, T, EN } = app;
  const X = EN ? TX.en : TX.ja;
  const LANG = EN ? 'en' : 'ja';
  // 品質チェックの新しい知らせの言葉（app/i18n.js の checkMsg に足す）
  const base = T.checkMsg;
  // ほかのコマンド版の code（体裁の検査が kit/core/layout-scan.mjs になって増えたもの：縦組みの限り・図の中の字・切れる字など）はコマンド版の言葉
  T.checkMsg = (c, a) => (X.checkMsg[c] ? X.checkMsg[c](a) : a && typeof a === 'object' && MESSAGES[c] ? message(LANG, c, a) : base(c, a));
  for (const [id, t] of [['b-paste', X.paste], ['w-paste', X.pasteWelcome], ['b-fiximport', X.fixImport]]) { const b = $(id); if (b) b.textContent = t; }

  async function copyText(text, area) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      try { if (area) { area.focus(); area.select(); } return document.execCommand('copy'); } catch { return false; }
    }
  }
  // 大きさ：UTF-8 のバイト数 / 1024（小数 1 桁）。node kit/llm-pack.mjs --list と同じ計算（kit/core/llm-pack.mjs の packKb）、言葉は UI の言語
  const kb = (s) => packKb(s);

  // ---------------------------------------------------------------- 「AI で新しく作る」の窓：① 頼みたいことを書く → ② 指示をコピーして送る → ③ 返事を貼り付けて開く
  const step = (id, title, kids) => el('section', { id, cls: 'paste-step', 'aria-labelledby': id + '-h' }, [el('h3', { id: id + '-h', text: title }), ...kids]);

  // ① 頼みたいこと（A 新しく作る / B ここまでの議論の内容で作る）。記入欄の見出しと既定の値は指示の「頼みたいこと」から（kit/core/llm-request.mjs）。
  // 書いたものは、このページを開いている間は残す（窓を閉じて開き直しても）
  const draft = { kind: 'A', values: {} };
  function requestStep() {
    const F = requestForm(LANG);
    const field = (sec, f) => {
      const id = `paste-${sec.toLowerCase()}-${f.key}`, key = sec + ':' + f.key, multi = f.key === 'examples';
      const inp = el(multi ? 'textarea' : 'input', { id, name: f.key, ...(multi ? { rows: '2' } : { type: 'text' }), placeholder: X.fieldPh[f.key] || '', autocomplete: 'off', spellcheck: 'false' });
      inp.value = key in draft.values ? draft.values[key] : f.value;
      inp.addEventListener('input', () => { draft.values[key] = inp.value; });
      return el('div', { cls: 'paste-field' }, [el('label', { for: id, text: f.label }), inp]);
    };
    const radio = (k, label) => el('label', {}, [el('input', { type: 'radio', name: 'paste-kind', value: k, id: 'paste-kind-' + k.toLowerCase() }), el('span', { text: label })]);
    const kinds = el('fieldset', { id: 'paste-kind', cls: 'paste-kind' }, [el('legend', { text: X.kindLegend }), radio('A', X.kindA), radio('B', X.kindB)]);
    const A = el('div', { id: 'paste-req-a', cls: 'paste-fields' }, F.A.fields.map((f) => field('A', f)));
    const B = el('div', { id: 'paste-req-b', cls: 'paste-fields' }, [F.B.text ? el('p', { cls: 'hint quote', text: F.B.text }) : null, ...F.B.fields.map((f) => field('B', f))]);
    const show = () => { A.hidden = draft.kind !== 'A'; B.hidden = draft.kind !== 'B'; };
    kinds.querySelector('#paste-kind-' + draft.kind.toLowerCase()).checked = true;
    kinds.addEventListener('change', (e) => { if (e.target.name === 'paste-kind') { draft.kind = e.target.value; show(); } });
    show();
    const values = () => Object.fromEntries([...(draft.kind === 'B' ? B : A).querySelectorAll('input,textarea')].map((x) => [x.name, x.value]));
    return {
      node: step('paste-step1', X.step1, [el('p', { cls: 'hint', text: X.step1Hint }), kinds, A, B]),
      request: () => filledRequest({ kind: draft.kind, values: values() }, LANG),
      missing: () => (draft.kind === 'A' && !String(values().topic || '').trim() ? A.querySelector('[name=topic]') : null),
    };
  }

  // ② 指示：共通の本体（必ず入る。外せない札）＋ 系列（必要なときだけ足す。既定は今のデッキの部品・テーマから推したもの、なければ academic）＋ ① の頼みたいこと
  async function defaultSeries() {
    let deck = '';
    if (S.ws && S.deckFile) { try { deck = await S.ws.readText(S.deckFile, { max: READ_LIMITS.source }) || ''; } catch { /* 読めなければ推さない */ } }
    const s = seriesForDeck(deck);
    return s.length ? s : ['academic'];
  }
  async function packStep(copyMsg, req) {
    const base = buildPack({ series: [], lang: LANG });
    const initial = await defaultSeries();
    const total = el('span', { id: 'paste-pack-size', cls: 'hint' });
    const boxes = SERIES.map((s) => {
      const cb = el('input', { type: 'checkbox', id: 'paste-series-' + s, value: s });
      cb.checked = initial.includes(s);
      return cb;
    });
    const chosen = () => boxes.filter((b) => b.checked).map((b) => b.value);
    const update = () => { total.textContent = X.packTotal(kb(packWithRequest({ series: chosen(), lang: LANG, request: req.request() }))); };
    for (const b of boxes) b.addEventListener('change', update);
    update();
    const common = el('input', { type: 'checkbox', id: 'paste-common', disabled: '', 'aria-disabled': 'true' });
    common.checked = true;
    const copy = el('button', { type: 'button', id: 'paste-copy-guide', cls: 'pri', text: X.copyGuide, onclick: async () => {
      const miss = req.missing();
      if (miss) { copyMsg.hidden = false; copyMsg.classList.add('bad'); copyMsg.textContent = X.needTopic; miss.focus(); return; }
      const text = packWithRequest({ series: chosen(), lang: LANG, request: req.request() });
      const ok = await copyText(text);
      copyMsg.classList.remove('bad'); copyMsg.hidden = false; copyMsg.textContent = ok ? X.copied(kb(text)) : X.fixCopyFailed;
    } });
    const node = step('paste-step2', X.step2, [el('div', { cls: 'paste-guide' }, [
      el('span', { cls: 'hint', text: X.guide }),
      el('label', { cls: 'paste-common', for: 'paste-common' }, [common, el('span', { text: X.common(kb(base)) })]),
      el('fieldset', { id: 'paste-series', cls: 'paste-series' }, [
        el('legend', { text: X.seriesLegend }),
        ...SERIES.map((s, i) => el('label', { title: membersOfSeries(s).join(', ') }, [boxes[i], el('span', { text: X.seriesName[s] || s }),
          el('span', { cls: 'hint', text: X.plusKb(kbOf(packSize(buildPack({ series: [s], lang: LANG })) - packSize(base))) })])),
      ]),
      copy, total,
    ]), copyMsg]);
    return { node, update };
  }

  // ---------------------------------------------------------------- 貼り付け（「AI で新しく作る」の ③ と「AI の直しを取り込む」）
  // 囲みを 1 つずつ（チャットの囲みの右上のコピーで）写して貼ったとき：届いた片方を持っておき、もう片方を待つ（窓を閉じると捨てる）
  let held = null;   // {kind: 'deck' | 'narration', text}
  const canReplace = () => !!(S.ws && S.deckFile && !(S.portable && (S.portable.readOnly || S.portable.tierAOnly)));
  // mode：'new'（AI で新しく作る）| 'replace'（AI の直しを取り込む：今のデッキに）。戻り値：開いたか
  async function pasteDialog(mode0) {
    const fix = mode0 === 'replace';
    if (fix && !canReplace()) { toast(T.readOnlyNoEdit, true); return false; }
    held = null;
    const area = el('textarea', { id: 'paste-text', spellcheck: 'false', placeholder: X.placeholder, rows: fix ? '12' : '8', 'aria-describedby': 'paste-step3-hint' });
    const msg = el('p', { id: 'paste-msg', cls: 'note bad', role: 'alert', hidden: '' });
    const copyMsg = el('p', { id: 'paste-copied', cls: 'hint', role: 'status', hidden: '' });
    // 返事が切れていたとき：AI に送り直しを頼む文を写すボタン
    const cut = el('button', { type: 'button', id: 'paste-copy-cutoff', hidden: '', text: X.copyCutOff, onclick: async () => { const t = cutOffRequest(S.cutOff || {}, EN ? 'en' : 'ja'); const ok = await copyText(t); cutMsg.hidden = false; cutMsg.textContent = ok ? X.cutOffCopied : X.fixCopyFailed; } });
    const cutMsg = el('p', { id: 'paste-cut-copied', cls: 'hint', role: 'status', hidden: '' });
    // 持っている片方の知らせ（読み上げ）と、捨てて最初からのボタン
    const stateText = el('span', { id: 'paste-state-text' });
    const reset = el('button', { type: 'button', id: 'paste-reset', text: X.held.reset, onclick: () => { held = null; showState(null, X.held.resetDone); area.value = ''; msg.hidden = true; area.focus(); } });
    const stateBox = el('div', { id: 'paste-state', cls: 'paste-state', role: 'status', hidden: '' }, [stateText, reset]);
    function showState(h, text) {
      stateBox.hidden = !text; stateBox.classList.toggle('waiting', !!h); reset.hidden = !h;
      stateText.textContent = text || '';
    }
    const req = fix ? null : requestStep();
    const pack = fix ? null : await packStep(copyMsg, req);
    if (pack) req.node.addEventListener('input', pack.update);
    const s3 = step('paste-step3', fix ? X.fixTitleImport : X.step3, [
      el('p', { id: 'paste-step3-hint', cls: 'hint', text: fix ? X.fixImportHint : X.step3Hint }),
      stateBox, el('label', { for: 'paste-text', cls: 'sr-only', text: X.pasteLabel }), area, msg, cut, cutMsg, el('p', { cls: 'hint', text: X.untrusted })]);
    if (fix) s3.querySelector('h3').classList.add('sr-only');
    let focusArea = fix;
    for (;;) {
      const buttons = [{ id: 'cancel', label: T.cancel }];
      if (fix && held) buttons.push({ id: 'only', label: X.only });
      buttons.push({ id: 'import', label: fix ? X.goFix : X.go, pri: true });
      const shown = ask({ title: fix ? X.fixTitleImport : X.title, kind: 'paste', body: fix ? [el('p', { text: X.fixImportLead }), s3] : [el('p', { text: X.lead }), req.node, pack.node, s3], buttons });
      if (focusArea) setTimeout(() => area.focus(), 0);
      const v = await shown;
      if (v !== 'import' && v !== 'only') { held = null; return false; }
      const res = v === 'only' ? await importHeld() : await importText(area.value, fix ? 'replace' : 'new');
      focusArea = true;
      if (res === null) { held = null; return true; }
      if (res && typeof res === 'object' && res.held) {
        area.value = ''; msg.hidden = true; cut.hidden = true;
        showState(res.held, (res.again ? X.held.again(res.held === 'deck' ? 'deck.html' : 'narration.md') : '') + X.held[res.held](res.count) + (fix ? ' ' + X.held.onlyHint : ''));
        continue;
      }
      msg.hidden = false; msg.textContent = res;
      cut.hidden = !S.cutOff;
    }
  }

  // 取り込む。戻り値：窓に出す誤りの言葉か、片方を持って次を待つとき {held, again, count}（どちらもなければ null）
  async function importText(text, mode) {
    if (!String(text).trim()) return X.err.empty;
    const p = pastePart(text);
    // 前の返事が narration.md の途中で切れ、今度はその囲みだけが届いた：前の deck.html と合わせる
    if (p.part === 'narration' && !held && S.pendingDeck) { p.deck = S.pendingDeck; p.part = 'both'; }
    // 囲みが切れていた（unclosed）か、囲みがなかった（no-blocks：ファイル・キャンバス・添付で返した）：送り直しを頼む文を写せる
    S.cutOff = p.error && (p.error.code === 'unclosed' || p.error.code === 'no-blocks') ? p.error : null;
    S.pendingDeck = S.cutOff && S.cutOff.code === 'unclosed' && p.deck ? p.deck : (p.error ? S.pendingDeck : null);
    if (p.error) return typeof X.err[p.error.code] === 'function' ? X.err[p.error.code](p.error) : (X.err[p.error.code] || p.error.message);
    let r = p;
    const info = [];
    if (p.part === 'both') held = null;
    else if (held && held.kind !== p.part) {
      // 2 回に分けて貼った片方ずつを合わせる（返事の全体を貼ったときと同じものになる。囲みの中身だけを写したので、囲みなしの知らせは出さない）
      r = { deck: held.kind === 'deck' ? held.text : p.deck, narration: held.kind === 'narration' ? held.text : p.narration, warnings: [] };
      held = null;
      info.push(X.held.joined);
    } else if (mode === 'new' || !p.fenced) {
      // 片方だけ：持っておき、もう片方を待つ（「AI の直しを取り込む」に囲みの付いた片方だけの返事を貼ったときは、今までどおりその片方だけを取り込む）
      const again = !!held;
      const t = p.part === 'deck' ? p.deck : p.narration;
      held = { kind: p.part, text: t };
      return { held: p.part, again, count: p.part === 'deck' ? sectionsOf(t).length : narrSections(t).out.length };
    }
    return finish(r, mode, info);
  }
  // 「これだけで取り込む」（AI の直しを取り込む）：持っている片方だけで
  async function importHeld() {
    if (!held) return X.err.empty;
    const r = { deck: held.kind === 'deck' ? held.text : null, narration: held.kind === 'narration' ? held.text : null, warnings: [] };
    held = null;
    return finish(r, 'replace', []);
  }
  async function finish(r, mode, info) {
    const notes = r.warnings.map((w) => (X.warn[w.code] ? (typeof X.warn[w.code] === 'function' ? X.warn[w.code](w) : X.warn[w.code]) : w.code));
    if (r.narration === null && mode === 'new') return X.err['no-narration'];
    if (r.deck === null && mode === 'new') return X.err['no-deck'];
    status(X.building);
    try {
      return mode === 'replace' ? await replaceDeck(r, notes, info) : await openNew(r, notes, info);
    } finally { status(''); }
  }

  // id を付ける（同じ見出しのスライドは narration.md の節に出てきた順で対応させる）
  function withIds(deck, narration) {
    const a = assignIds(deck, narration || '', { byOrder: true });
    return { deck: a.deck, narration: a.narration, added: a.added.length, problems: a.problems };
  }
  const nameOf = (deck) => exportName(titleOf(deck), 'ai-draft', FORMAT.FILE_EXT);   // 題名から（kit/core/export-name.mjs）
  // メモリの上の原稿 → Worker で1 ファイル（.ega.html）（組み立てと同じ期限）→ 開く（中身からコードを探し、あれば確かめる）
  async function openFiles(files, name, extra) {
    const ws = memoryWorkspace('pasted', files);
    let html;
    try { html = (await app.builder.exportHtml(ws, 'deck.html', {}, { timeout: app.buildTimeout() })).html; }
    catch (e) { return `${X.buildFailed}: ${String((e && e.message) || e).slice(0, 300)}`; }
    const ok = await app.openPortable({ bytes: new TextEncoder().encode(html), name, fresh: true, ...extra });
    if (!ok) return null;   // 取り消した（コードの確かめ・未保存の変更）：窓は閉じる
    // 保存するまでファイルには書いていない（閉じる前に知らせる）
    try { const t = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }); await S.ws.writeText('narration.md', t || ''); } catch { /* 無視 */ }
    app.updateName();
    await afterOpen();
    return null;
  }
  async function openNew(r, notes, info = []) {
    const ids = withIds(r.deck, r.narration);
    const files = { 'deck.html': ids.deck, 'narration.md': ids.narration || '' };
    const name = nameOf(ids.deck);
    const err = await openFiles(files, name, {});
    if (err) return err;
    if (S.portable && S.portable.name === name) toast([X.imported((S.slides || []).length, ids.added), ...info, ...notes, ids.problems.length ? X.idProblems : '', X.unsavedNote].filter(Boolean).join(' · '), notes.length > 0 || ids.problems.length > 0);
    return null;
  }
  async function replaceDeck(r, notes, info = []) {
    const file = S.deckFile;
    const cur = await S.ws.readText(file, { max: READ_LIMITS.source }) || '';
    const curN = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }) || '';
    let deck = r.deck === null ? cur : r.deck, narration = r.narration === null ? curN : r.narration, what;
    if (r.deck === null) {
      // 口述原稿だけの直し：節がどれも id 付きなら、その id の節だけを置き換える（ほかは全体を置き換える）
      const N = narrSections(String(r.narration).replace(/\r\n?/g, '\n')).out;
      if (N.length && N.every((x) => x.id)) narration = mergeNarration(curN, r.narration).narration;
      what = X.replacedNarr(N.length);
    } else if (isPatch(deck)) {
      const m = mergeSlides(cur, deck);
      if (!m.replaced.length) return X.err['no-match'];
      deck = m.deck;
      narration = r.narration === null ? curN : mergeNarration(curN, r.narration).narration;
      what = X.replacedSlides(m.replaced);
    }
    const ids = withIds(deck, narration);
    what = what || X.replaced(file);
    if (S.portable) {
      // 1 ファイル（.ega.html）：今の作業場所のファイル（設定の docId・音声・部品）を残し、原稿だけを入れ替えて開き直す
      const files = new Map(S.ws.snapshot());
      for (const k of [...files.keys()]) if (k.startsWith('.cache/')) files.delete(k);
      files.set(file, new TextEncoder().encode(ids.deck)); files.set('narration.md', new TextEncoder().encode(ids.narration));
      const P = S.portable;
      const ws = memoryWorkspace('pasted', files);
      let html;
      try { html = (await app.builder.exportHtml(ws, file, { carry: P.index }, { timeout: app.buildTimeout() })).html; }
      catch (e) { return `${X.buildFailed}: ${String((e && e.message) || e).slice(0, 300)}`; }
      const ok = await app.openPortable({ bytes: new TextEncoder().encode(html), name: P.name, handle: P.handle, fresh: P.rightsOk, replacing: true });
      if (!ok) return null;
      try { await S.ws.writeText('narration.md', ids.narration); } catch { /* 無視 */ }
      app.updateName();
    } else {
      // フォルダ：控え（.cache/edits/）を残して書き、コードの確かめをやり直してから組み直す
      for (const [rel, text] of [[file, ids.deck], ['narration.md', ids.narration]]) {
        try { await S.ws.backup(rel, { max: rel === file ? READ_LIMITS.source : READ_LIMITS.narration }); } catch { /* なければ控えはない */ }
        await S.ws.writeText(rel, text);
      }
      S.codeOk = null;
      await app.rebuild('paste');
      if (S.codeOk === false) return null;
    }
    toast([what, ...info, ...notes, ids.problems.length ? X.idProblems : '', S.portable ? X.unsavedNote : ''].filter(Boolean).join(' · '), notes.length > 0);
    await afterOpen();
    return null;
  }
  // 組み直しが終わり、プレビューの今の読み込みが表示し終わるのを待って品質チェック。S.pos では待たない（フォルダの置き換えでは、
  // 前の読み込みの位置が残っていて、読み込み中のプレビューに頼みを送ってしまう。頼みは app.quickCheck が今の読み込みに結び付ける）
  async function afterOpen() {
    const t0 = Date.now(), ready = () => S.allowed && !S.building && S.loads > 0 && S.frameLoaded === S.loads;
    while (Date.now() - t0 < 20000 && !ready()) await new Promise((r) => setTimeout(r, 100));
    if (ready()) await app.quickCheck();
  }

  // ---------------------------------------------------------------- 品質チェックに足すもの（このページで、narration.md の元の文字列から）
  async function extraChecks() {
    if (!S.ws) return [];
    let text;
    try { text = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }); } catch { return []; }
    if (!text) return [];
    const idx = new Map((S.slides || []).map((s, i) => [s.key, i]));
    const out = [];
    for (const seg of parseNarration(text)) {
      const i = idx.has(seg.slideKey) ? idx.get(seg.slideKey) : null;
      for (const t of seg.turns) for (const p of readingProblems(t.raw)) {
        out.push({ i, title: i === null ? '' : String((S.slides[i] && (S.slides[i].heading || S.slides[i].key)) || ''), sev: 'warn', code: p.why === 'operator' ? 'readingExpr' : 'readingSeveral', arg: p.text });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- 修正依頼
  async function fixRequest(results) {
    // スライドにない段階の口述原稿：narration.md の行（そのまま）と、合わせる先の段階を足す（kit/core/narration-lint.mjs の orphanDetail）
    let narrText = '';
    try { narrText = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }) || ''; } catch { /* なければ行は出さない */ }
    const segs = narrText ? parseNarration(narrText) : [];
    const withLines = (r) => {
      if (r.code !== 'orphanNarration' || !r.arg || typeof r.arg !== 'object') return r.arg;
      const key = S.slides && S.slides[r.i] && S.slides[r.i].key;
      const seg = segs.find((x) => x.slideKey === key && x.stepKey === r.arg.step);
      if (!seg) return r.arg;
      const o = { stepKey: seg.stepKey, line: seg.line, end: seg.end };
      return { ...r.arg, line: seg.line, end: seg.end, ...orphanDetail(o, r.arg, narrText) };
    };
    // テーマの寸法のずれ（themeMetricsDrift）と測る字体（metricsFontLoad）はテーマと環境の知らせで、デッキ（AI が直すもの）の中にはないので依頼に入れない
    const probs = results.filter((r) => (r.sev === 'error' || r.sev === 'warn') && r.code !== 'themeMetricsDrift' && r.code !== 'metricsFontLoad').map((r) => { const arg = withLines(r); return { sev: r.sev, i: r.i, title: r.title, code: r.code, data: arg, text: T.checkMsg(r.code, arg) }; });
    // 組み立ての知らせのうち、原稿の書き方に関わるもの（行き先のない口述原稿・目印・段階の番号など）
    for (const w of S.warn || []) if (/^(narration|mark|slide key):/.test(w)) probs.push({ sev: /^narration:/.test(w) ? 'error' : 'warn', i: null, title: '', msg: w, text: w });
    if (!probs.length) { toast(X.fixNone); return; }
    const deck = await S.ws.readText(S.deckFile, { max: READ_LIMITS.source }) || '';
    const narration = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }) || '';
    const req = buildFixRequest({ problems: probs, deck, narration, lang: LANG });
    const area = el('textarea', { id: 'fix-text', readonly: '', rows: '12', spellcheck: 'false' });
    area.value = req.text;
    const ok = await copyText(req.text, area);
    // 窓を開いた後に頭を見せる（窓が字の欄にフォーカスを移すと、終わりへ送られることがある）
    setTimeout(() => { try { area.setSelectionRange(0, 0); area.scrollTop = 0; } catch { /* 無視 */ } }, 0);
    const v = await ask({ title: X.fixTitle, kind: 'paste', body: [
      el('p', { id: 'fix-lead', text: ok ? X.fixLead(probs.length, req.partial) : X.fixCopyFailed }), area],
      buttons: [{ id: 'cancel', label: X.close }, { id: 'paste', label: X.pasteReply, pri: true }] });
    if (v === 'paste') await pasteDialog('replace');
  }
  function fixButton(results) {
    return el('button', { type: 'button', id: 'b-fixreq', cls: 'fixreq', text: X.fix, onclick: () => fixRequest(results) });
  }

  $('b-paste').onclick = () => pasteDialog('new').catch((e) => toast(String(e.message || e), true));
  $('w-paste').onclick = () => pasteDialog('new').catch((e) => toast(String(e.message || e), true));
  $('b-fiximport').onclick = () => pasteDialog('replace').catch((e) => toast(String(e.message || e), true));
  return { pasteDialog, importText, extraChecks, fixButton, fixRequest, texts: X };
}
