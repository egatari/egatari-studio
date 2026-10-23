// チャットの AI との行き来（docs/authoring-with-llms.md）。AI は、ふつうのコマンドの中の 1 つのやり方として出す（名前に「AI で…」を付けない）：
//   「新規作成…」（チャットの AI の道 1 本。mode 'new'）：① 分野（使うパーツ。既定はなし）→ ② デザイン（テーマ。返事の教材にも付ける）→ ③ 頼みたいことを書く（kit/core/llm-request.mjs）→ ② 共通の本体と、選んだ系列
//     （既定はデッキを開いていればその部品・テーマから推したもの、開いていなければなし）と ① を組み立てて写す（kit/core/llm-pack.mjs）→
//     ③ AI の返事を貼り付けて開く：返事の全体（か、1 つずつ貼った 2 つの囲み。kit/core/llm-import.mjs の pastePart）から deck.html と narration.md を
//     取り出し、スライドに id を付け（kit/core/slide-ids.mjs。npm run ids と同じ本体）、メモリの上の原稿を Worker で 1 ファイル（.ega.html）にして
//     （app/build-worker.js の exportHtml）、ほかの 1 ファイルと同じ道（openPortable：中身からコードを探し、あれば動かす前に確かめる）で開き、品質チェックをかける
//   「スライドの挿入…」→「チャットの AI に書いてもらう」（mode 'insert'。backlog #93）：① 足すスライド（枚数・足したいこと）→ ② 短い頼む文
//     （見出しの一覧と足す場所の前のスライドだけ。kit/core/llm-insert.mjs。新しいチャットなら指示も付けられる）→ ③ 返事のスライドを、選んだスライドの
//     後ろ（選んでいなければ最後）に入れ、スライド一覧の「足す」と同じに id を付ける（app/slides-panel.js の apply：控え・元に戻す・組み直し・品質チェック）
//   「修正…」（mode 'replace'）：① 直してほしいこと → ② 修正依頼（品質チェックの指摘・組み立ての知らせ・その規格の文章・今の原稿（kit/core/llm-fix.mjs）と、
//     ① と開いているメモ（comments.json。画像は backlog #90））→ ③ 今の docId・設定・音声を残して原稿だけを入れ替える（直したスライドだけの返事は id で戻す）
//   品質チェックの板の「AI への修正依頼をコピー」も、返事は「修正…」の ③ で取り込む
// 貼り付けた文字列は信頼しない：このページでは解析と文字列の書き換えだけをし、組み立ては Worker で、表示は sandbox のプレビューで
import { buildPack, SERIES, membersOfSeries, seriesForDeck, packSize, packKb, kbOf } from '../kit/core/llm-pack.mjs';
import { pastePart, isPatch, mergeSlides, mergeNarration, sectionsOf, narrSections } from '../kit/core/llm-import.mjs';
import { requestForm, filledRequest, packWithRequest } from '../kit/core/llm-request.mjs';
import { insertRequest, insertSlides } from '../kit/core/llm-insert.mjs';
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
    method: 'チャットの AI に書いてもらう', methodFix: 'チャットの AI に直してもらう',
    title: { new: '新規作成：チャットの AI に書いてもらう', insert: 'スライドの挿入：チャットの AI に書いてもらう', replace: '修正：チャットの AI に直してもらう' },
    howTo: 'ブラウザの別のタブで、チャットの AI（Gemini・ChatGPT・Claude など）を開きます。ここでコピーする指示を貼って送ると、AI が教材を書きます。その返事を ③ に貼り付けます。',
    howToNew: 'ブラウザの別のタブで、チャットの AI（Gemini・ChatGPT・Claude など）を開きます。ここでコピーする指示を貼って送ると、AI が教材を書きます。その返事を ⑤ に貼り付けます。',
    themeLabel: 'テーマ', themeHint: 'スライドの色と書体を決めます。頼む文に入れます（返事の教材にテーマがなければ、このテーマを付けます）', themeLine: (t) => `- テーマ：${t}（<html data-theme="${t}">）`,
    seriesHintNew: '使うパーツの説明が指示に加わります。何も選ばなければ共通の本体だけです',
    howToFix: 'ブラウザの別のタブで、チャットの AI（Gemini・ChatGPT・Claude など）を開きます。ここでコピーする修正依頼を貼って送ると、AI が直したスライドを返します。その返事を ③ に貼り付けます。',
    steps: {
      new: ['③ 頼みたいことを書く', '④ AI への指示をコピーして、チャットに貼って送る', '⑤ AI の返事を貼り付けて開く', '① 分野（使うパーツ）を選ぶ（選ばなくてもよい）', '② デザイン（テーマ）を選ぶ'],
      insert: ['① 足すスライドを書く', '② 頼む文をコピーして、チャットに貼って送る', '③ AI の返事を貼り付けて挿入する'],
      replace: ['① 直してほしいことを書く', '② 修正依頼をコピーして、チャットに貼って送る', '③ AI の返事を貼り付けて取り込む'],
    },
    step1Hint: '書いた内容は、コピーする指示の最後に入ります（チャットに貼ると添付のファイルの形になり、そこでは書き直せないため、先にここで書きます）。書かない項目は空のままでかまいません',
    kindLegend: 'どちらで作りますか', kindA: 'A　新しく作る', kindB: 'B　このチャットでここまで話し合った内容で作る',
    fieldPh: { topic: '例：二分探索のしくみ', audience: '例：高校 2 年生', length: '例：5 枚・10 分', language: '例：日本語', speakers: '例：1 人', examples: '例：電話帳で名前を探す' },
    needTopic: '③ の「題材」を書いてください',
    insertWhere: (n, h) => `挿入する場所：スライド ${n}「${h}」の後ろ`, insertWhereLast: (n, h) => `挿入する場所：最後のスライド（${n}「${h}」）の後ろ`,
    insertCount: '足す枚数', insertWish: '足したいこと（なくてもよい）', insertWishPh: '例：具体例を 1 つ、練習問題を 1 つ',
    insertHint: '頼む文には、今のスライドの見出しの一覧と、足す場所の前のスライドだけを入れます（デッキの全体は入れないので、頼む文が短くて済みます）',
    withPack: 'AI への指示（共通の本体と分野）も入れる：このデッキを作ったのとは別の、新しいチャットで頼むとき',
    copyInsert: '頼む文をコピー',
    wish: '直してほしいこと（なくてもよい）', wishPh: '例：2 枚目の例を身近なものに替える',
    reviseHint: '修正依頼には、品質チェックの指摘と、① に書いたこと、開いているメモ（コメント）、今の deck.html と narration.md が入ります（長いデッキは指摘のあるスライドだけ）',
    copyRevise: '修正依頼をコピー', reviseNothing: '直すことが見つかりません。① に直してほしいことを書いてください',
    revised: (kb, n, c) => `コピーしました（${kb} KB。指摘 ${n} 件${c ? `・メモ ${c} 件` : ''}）。チャットに貼り付けて送ってください。添付のファイルの形になっても、そのまま送ってください。返事が来たら ③ へ`,
    insertCopied: (kb) => `コピーしました（${kb} KB）。チャットに貼り付けて送ってください。添付のファイルの形になっても、そのまま送ってください。返事が来たら ③ へ`,
    wishHead: '## 直してほしいこと', notesHead: '## 開いているメモ（コメント）', noteLine: (c) => `- ${c.where}${c.quote ? `「${c.quote}」` : ''}：${c.text}`,
    guide: 'コピーする指示は、共通の本体（必ず入る）と、選んだ分野のパーツの説明と、頼みたいことです。',
    common: (kb) => `共通の本体（必ず入る）　${kb} KB`,
    seriesLegend: '分野（使うパーツ）',
    seriesHint: (name) => `数式・グラフ・データの図を使うなら「${name}」を選ぶ`,
    seriesName: { academic: '学術（数式・関数・データ）', business: 'ビジネス（KPI・位置づけ・市場・お金の流れ）', kokugo: '国語（漢文・古文・現代文・縦書き）', info: '情報（符号の木）' },
    plusKb: (kb) => `+${kb} KB`, packTotal: (kb) => `合わせて ${kb} KB`,
    copyGuide: 'AI への指示をコピー',
    copied: (kb) => `コピーしました（${kb} KB、③ の頼みたいこと入り）。チャットに貼り付けて送ってください。添付のファイルの形になっても、そのまま送ってください。返事が来たら ⑤ へ`,
    step3Hint: '返事の全体（返事の下のコピーのボタン）か、deck.html と narration.md の 2 つの囲みを 1 つずつ（囲みの右上のコピーのボタン）貼り付けます。1 つずつのときは、1 つ目を貼ってボタンを押すと、次の囲みを待ちます',
    pasteLabel: 'AI の返事', placeholder: 'ここに AI の返事の全体か、囲みを 1 つ貼り付ける',
    go: { new: '開く', insert: '挿入', replace: '取り込む' }, only: 'これだけで取り込む',
    untrusted: '貼り付けたものは開いたファイルと同じに扱います。スクリプトが入っていれば、動かす前に確かめます',
    held: {
      deck: (n) => `deck.html を受け取りました（スライド ${n} 枚。2 つのうち 1 つ目）。次に narration.md の囲みを、その囲みの右上のコピーのボタンで写して、ここに貼り付けてください`,
      narration: (n) => `narration.md を受け取りました（${n} 節。2 つのうち 1 つ目）。次に deck.html の囲みを、その囲みの右上のコピーのボタンで写して、ここに貼り付けてください`,
      again: (k) => `${k} をもう一度受け取ったので、前のものと入れ替えました。`,
      onlyHint: '返事が片方だけなら「これだけで取り込む」を押します',
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
      'no-insert': '返事に足すスライド（<section class="slide">）がありません',
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
    inserted: (n, at) => `スライド ${n} 枚を ${at} 枚目に挿入しました（id を付けました）`, undoInsert: (n) => `スライド ${n} 枚の挿入`,
    idProblems: 'id を付けられないスライドがあります（品質チェックの結果を見てください）',
    unsavedNote: '保存するまでファイルには書いていません',
    fix: 'AI への修正依頼をコピー', fixTitle: 'AI への修正依頼',
    fixLead: (n, partial) => `指摘 ${n} 件と、その規格、${partial ? '問題のあるスライド' : '今の deck.html と narration.md'} をコピーしました。同じチャットに貼り付けて送り、返事は「修正…」の ③ に貼り付けます`,
    fixCopyFailed: '自動ではコピーできませんでした。下の文字を選んでコピーしてください',
    copyCutOff: 'AI に送り直しを頼む文をコピー', cutOffCopied: 'コピーしました。チャットに貼り付け、返事をここに貼り付けてください',
    fixNone: '直す問題はありません', pasteReply: 'AI の返事を貼り付ける…', close: '閉じる',
    checkMsg: {
      orphanNarration: (a) => (a && typeof a === 'object' ? message('ja', 'narrOrphan', a) : `スライドにない段階の口述原稿 [${a}]`),
      compData: (a) => message('ja', 'compData', a),
      consoleError: (a) => message('ja', 'consoleError', { e: cleanErrorText(a) }),
      readingExpr: (a) => `読みの指定 ${a} が式を読んでいる（記号か用語だけに）`,
      readingSeveral: (a) => `読みの指定 ${a} に記号が 2 つ以上（記号ごとに分ける）`,
    },
  },
  en: {
    method: 'Have a chat AI write it', methodFix: 'Have a chat AI fix it',
    title: { new: 'New: have a chat AI write it', insert: 'Insert slide: have a chat AI write it', replace: 'Revise: have a chat AI fix it' },
    howTo: 'Open a chat AI (Gemini, ChatGPT, Claude, …) in another browser tab. Paste the instructions you copy here and send them; the AI writes the lesson. Then paste its reply in step 3.',
    howToNew: 'Open a chat AI (Gemini, ChatGPT, Claude, …) in another browser tab. Paste the instructions you copy here and send them; the AI writes the lesson. Then paste its reply in step 5.',
    themeLabel: 'Theme', themeHint: 'Sets the colors and fonts of the slides. It goes into the request (and a reply without a theme gets this one)', themeLine: (t) => `- Theme: ${t} (<html data-theme="${t}">)`,
    seriesHintNew: 'Adds the notes on those parts to the instructions. With none chosen, only the common body is sent.',
    howToFix: 'Open a chat AI (Gemini, ChatGPT, Claude, …) in another browser tab. Paste the fix request you copy here and send it; the AI sends back the fixed slides. Then paste its reply in step 3.',
    steps: {
      new: ['3. Write what you want', '4. Copy the instructions, paste them into the chat and send', '5. Paste the AI’s reply and open it', '1. Choose subjects (parts) (optional)', '2. Choose the design (theme)'],
      insert: ['1. Describe the slides to add', '2. Copy the request, paste it into the chat and send', '3. Paste the AI’s reply and insert it'],
      replace: ['1. Write what to change', '2. Copy the fix request, paste it into the chat and send', '3. Paste the AI’s reply and bring it in'],
    },
    step1Hint: 'What you write goes at the end of the copied instructions (pasted into a chat they often become an attachment you cannot edit there, so write it here first). Leave out anything you do not need.',
    kindLegend: 'How do you want to make it?', kindA: 'A. Make a new lesson', kindB: 'B. From what we have discussed so far in this chat',
    fieldPh: { topic: 'e.g. how binary search works', audience: 'e.g. first-year students', length: 'e.g. 5 slides, 10 minutes', language: 'e.g. English', speakers: 'e.g. one narrator', examples: 'e.g. finding a name in a phone book' },
    needTopic: 'Write the topic in step 3.',
    insertWhere: (n, h) => `Insert after slide ${n}, “${h}”`, insertWhereLast: (n, h) => `Insert after the last slide (${n}, “${h}”)`,
    insertCount: 'Number of slides', insertWish: 'What to add (optional)', insertWishPh: 'e.g. one worked example and one exercise',
    insertHint: 'The request has only the list of slide headings and the slide before the new ones (not the whole deck), so it stays short.',
    withPack: 'Also include the instructions for the AI (common body and subjects): when you ask in a new chat, not the one that made this deck',
    copyInsert: 'Copy the request',
    wish: 'What to change (optional)', wishPh: 'e.g. use a more familiar example on slide 2',
    reviseHint: 'The fix request has the quality check findings, what you write in step 1, the open notes (comments) and the current deck.html and narration.md (for a long deck, only the slides with findings).',
    copyRevise: 'Copy the fix request', reviseNothing: 'Nothing to fix was found. Write what to change in step 1.',
    revised: (kb, n, c) => `Copied (${kb} KB; ${n} finding(s)${c ? `, ${c} note(s)` : ''}). Paste it into the chat and send. If it turns into an attachment, just send it. When the reply arrives, go to step 3.`,
    insertCopied: (kb) => `Copied (${kb} KB). Paste it into the chat and send. If it turns into an attachment, just send it. When the reply arrives, go to step 3.`,
    wishHead: '## What I want changed', notesHead: '## Open notes (comments)', noteLine: (c) => `- ${c.where}${c.quote ? ` “${c.quote}”` : ''}: ${c.text}`,
    guide: 'The copied instructions are the common body (always included), the notes on the parts of the subjects you chose, and what you want.',
    common: (kb) => `Common body (always included)   ${kb} KB`,
    seriesLegend: 'Subjects (parts)',
    seriesHint: (name) => `Using formulas, graphs or data charts? Choose “${name}”.`,
    seriesName: { academic: 'Academic (math, functions, data)', business: 'Business (KPIs, positioning, markets, money flows)', kokugo: 'Japanese language arts (kanbun, kobun, gendai, vertical)', info: 'Information science (code trees)' },
    plusKb: (kb) => `+${kb} KB`, packTotal: (kb) => `${kb} KB in all`,
    copyGuide: 'Copy instructions for your AI',
    copied: (kb) => `Copied (${kb} KB, with what you wrote in step 3). Paste it into the chat and send. If it turns into an attachment, just send it. When the reply arrives, go to step 5.`,
    step3Hint: 'Paste the whole reply (the copy button under the reply), or the two blocks deck.html and narration.md one at a time (the copy button at the top right of each block). One at a time: paste the first and press the button; the editor then waits for the other.',
    pasteLabel: 'The AI’s reply', placeholder: 'Paste the whole reply of the AI here, or one block',
    go: { new: 'Open', insert: 'Insert', replace: 'Import' }, only: 'Import just this',
    untrusted: 'Pasted content is treated like an opened file: if it contains scripts, the editor asks before running them.',
    held: {
      deck: (n) => `Got deck.html (${n} slide${n === 1 ? '' : 's'}; 1 of 2). Now copy the narration.md block with the copy button at its top right and paste it here.`,
      narration: (n) => `Got narration.md (${n} section${n === 1 ? '' : 's'}; 1 of 2). Now copy the deck.html block with the copy button at its top right and paste it here.`,
      again: (k) => `Got ${k} again; it replaces the earlier one. `,
      onlyHint: 'If the reply has only this one, press “Import just this”.',
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
      'no-insert': 'The reply has no slides to add (<section class="slide">).',
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
    inserted: (n, at) => `Inserted ${n} slide(s) at position ${at} (with new ids)`, undoInsert: (n) => `inserting ${n} slide(s)`,
    idProblems: 'Some slides could not get an id (see the quality check results).',
    unsavedNote: 'Nothing is written to a file until you save.',
    fix: 'Copy fix request for your AI', fixTitle: 'Fix request for your AI',
    fixLead: (n, partial) => `Copied ${n} finding(s), their standards and ${partial ? 'the slides with problems' : 'the current deck.html and narration.md'}. Paste it into the same chat and send, then paste the reply in step 3 of “Revise…”.`,
    fixCopyFailed: 'Could not copy automatically. Select the text below and copy it.',
    copyCutOff: 'Copy a resend request for your AI', cutOffCopied: 'Copied. Paste it into the chat, then paste the reply here.',
    fixNone: 'No problems to fix.', pasteReply: 'Paste the AI’s reply…', close: 'Close',
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

  async function copyText(text, area) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      try { if (area) { area.focus(); area.select(); } return document.execCommand('copy'); } catch { return false; }
    }
  }
  // 大きさ：UTF-8 のバイト数 / 1024（小数 1 桁）。node kit/llm-pack.mjs --list と同じ計算（kit/core/llm-pack.mjs の packKb）、言葉は UI の言語
  const kb = (s) => packKb(s);
  const step = (id, title, kids) => el('section', { id, cls: 'paste-step', 'aria-labelledby': id + '-h' }, [el('h3', { id: id + '-h', text: title }), ...kids]);
  const readDeck = async () => ({ deck: (await S.ws.readText(S.deckFile, { max: READ_LIMITS.source })) || '', narration: (await S.ws.readText('narration.md', { max: READ_LIMITS.narration })) || '' });

  // ---------------------------------------------------------------- ① 新規作成：頼みたいこと（A 新しく作る / B ここまでの議論の内容で作る）
  // 記入欄の見出しと既定の値は指示の「頼みたいこと」から（kit/core/llm-request.mjs）。書いたものは、このページを開いている間は残す
  const draft = { kind: 'A', values: {} };
  function requestStep(title) {
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
      node: step('paste-step1', title, [el('p', { cls: 'hint', text: X.step1Hint }), kinds, A, B]),
      request: () => filledRequest({ kind: draft.kind, values: values() }, LANG),
      missing: () => (draft.kind === 'A' && !String(values().topic || '').trim() ? A.querySelector('[name=topic]') : null),
    };
  }
  // ① スライドの挿入：枚数と足したいこと。足す場所は入口が決める（選んだスライドの後ろ、選んでいなければ最後）
  function insertStep(title, where) {
    const n = el('input', { type: 'number', id: 'paste-insert-n', min: '1', max: '10', value: '1', inputmode: 'numeric' });
    const wish = el('textarea', { id: 'paste-insert-wish', rows: '2', placeholder: X.insertWishPh, spellcheck: 'false' });
    return {
      node: step('paste-step1', title, [el('p', { id: 'paste-insert-where', cls: 'paste-where', text: where }), el('p', { cls: 'hint', text: X.insertHint }),
        el('div', { cls: 'paste-fields' }, [
          el('div', { cls: 'paste-field' }, [el('label', { for: 'paste-insert-n', text: X.insertCount }), n]),
          el('div', { cls: 'paste-field wide' }, [el('label', { for: 'paste-insert-wish', text: X.insertWish }), wish]),
        ])]),
      count: () => Math.max(1, Math.min(10, Math.round(Number(n.value) || 1))),
      wish: () => wish.value,
    };
  }

  // ---------------------------------------------------------------- ② 指示：共通の本体（必ず入る。外せない札）＋ 系列（必要なときだけ足す）＋ 最後の頼み
  // 系列の既定：デッキを開いていればその部品・テーマから推したもの（kit/core/llm-pack.mjs の seriesForDeck）。開いていなければ（か、推せなければ）足さない
  async function defaultSeries() {
    let deck = '';
    if (S.ws && S.deckFile) { try { deck = await S.ws.readText(S.deckFile, { max: READ_LIMITS.source }) || ''; } catch { /* 読めなければ推さない */ } }
    return seriesForDeck(deck);
  }
  // req：{request() → 最後に付ける文（Promise でもよい）, missing() → 足りない欄 | null}。optional：指示を入れるかを選べる（挿入：既定は入れない）
  // split：新規作成（① 分野 を別のステップにする。既定は何も選ばない）。seriesTitle：その見出し
  async function packStep(copyMsg, req, { title, optional = false, copyLabel = X.copyGuide, copiedMsg = X.copied, split = false, seriesTitle = '' } = {}) {
    const base = buildPack({ series: [], lang: LANG });
    const initial = split ? [] : await defaultSeries();
    const total = el('span', { id: 'paste-pack-size', cls: 'hint' });
    const boxes = SERIES.map((s) => {
      const cb = el('input', { type: 'checkbox', id: 'paste-series-' + s, value: s });
      cb.checked = initial.includes(s);
      return cb;
    });
    const withPack = optional ? el('input', { type: 'checkbox', id: 'paste-with-pack' }) : null;
    const packOn = () => !withPack || withPack.checked;
    const chosen = () => boxes.filter((b) => b.checked).map((b) => b.value);
    const textNow = async () => { const r = await req.request(); return packOn() ? packWithRequest({ series: chosen(), lang: LANG, request: r }) : r; };
    const update = async () => { total.textContent = X.packTotal(kb(await textNow())); };
    for (const b of boxes) b.addEventListener('change', update);
    const common = el('input', { type: 'checkbox', id: 'paste-common', disabled: '', 'aria-disabled': 'true' });
    common.checked = true;
    const copy = el('button', { type: 'button', id: 'paste-copy-guide', cls: 'pri', text: copyLabel, onclick: async () => {
      const miss = req.missing();
      if (miss) { copyMsg.hidden = false; copyMsg.classList.add('bad'); copyMsg.textContent = X.needTopic; miss.focus(); return; }
      const text = await textNow();
      const ok = await copyText(text);
      copyMsg.classList.remove('bad'); copyMsg.hidden = false; copyMsg.textContent = ok ? copiedMsg(kb(text)) : X.fixCopyFailed;
    } });
    const seriesSet = el('fieldset', { id: 'paste-series', cls: 'paste-series', 'aria-describedby': 'paste-series-hint' }, [
        el('legend', { text: X.seriesLegend }),
        ...SERIES.map((s, i) => el('label', { title: membersOfSeries(s).join(', ') }, [boxes[i], el('span', { text: X.seriesName[s] || s }),
          el('span', { cls: 'hint', text: X.plusKb(kbOf(packSize(buildPack({ series: [s], lang: LANG })) - packSize(base))) })])),
      ]);
    const seriesHint = el('p', { id: 'paste-series-hint', cls: 'hint', text: X.seriesHint(X.seriesName.academic) });
    const commonRow = el('label', { cls: 'paste-common', for: 'paste-common' }, [common, el('span', { text: X.common(kb(base)) })]);
    const packParts = el('div', { id: 'paste-pack-parts', cls: 'paste-guide' }, split
      ? [el('span', { cls: 'hint', text: X.guide }), commonRow]
      : [el('span', { cls: 'hint', text: X.guide }), commonRow, seriesSet, seriesHint]);
    if (withPack) {
      const show = () => { packParts.hidden = !withPack.checked; copyMsg.hidden = true; copyMsg.textContent = ''; update(); };
      withPack.addEventListener('change', show);
      packParts.hidden = true;
    }
    await update();
    const node = step('paste-step2', title, [
      ...(withPack ? [el('label', { cls: 'paste-with-pack', for: 'paste-with-pack' }, [withPack, el('span', { text: X.withPack })])] : []),
      packParts, el('div', { cls: 'paste-guide' }, [copy, total]), copyMsg]);
    const seriesNode = split ? step('paste-step-series', seriesTitle, [el('p', { cls: 'hint', text: X.seriesHintNew }), seriesSet, seriesHint]) : null;
    return { node, update, seriesNode };
  }
  // ② 修正依頼：品質チェックの指摘（今かけ直す）と ① と開いているメモと、今の原稿（kit/core/llm-fix.mjs）
  function reviseStep(copyMsg, title, results0) {
    const wish = el('textarea', { id: 'paste-wish', rows: '3', placeholder: X.wishPh, spellcheck: 'false' });
    const s1 = step('paste-step1', title[0], [el('p', { cls: 'hint', text: X.reviseHint }),
      el('div', { cls: 'paste-field' }, [el('label', { for: 'paste-wish', text: X.wish }), wish])]);
    const copy = el('button', { type: 'button', id: 'paste-copy-guide', cls: 'pri', text: X.copyRevise, onclick: async () => {
      const results = results0 || (app.checkResults ? await app.checkResults() : []) || [];
      const r = await reviseRequest(results, wish.value);
      if (!r) { copyMsg.hidden = false; copyMsg.classList.add('bad'); copyMsg.textContent = X.reviseNothing; wish.focus(); return; }
      const ok = await copyText(r.text);
      copyMsg.classList.remove('bad'); copyMsg.hidden = false; copyMsg.textContent = ok ? X.revised(kb(r.text), r.problems, r.notes) : X.fixCopyFailed;
    } });
    const s2 = step('paste-step2', title[1], [el('div', { cls: 'paste-guide' }, [copy]), copyMsg]);
    return { s1, s2 };
  }

  // ---------------------------------------------------------------- AI の窓（③ の貼り付けは 3 つとも同じ）
  // 囲みを 1 つずつ（チャットの囲みの右上のコピーで）写して貼ったとき：届いた片方を持っておき、もう片方を待つ（窓を閉じると捨てる）
  let held = null;   // {kind: 'deck' | 'narration', text}
  let newTheme = null;   // 新規作成の ② で選んだテーマ（返事の教材の <html data-theme> にも付ける）
  let insertAfter = null;   // 挿入：この番号（0 から）のスライドの後ろ。null なら最後
  const canReplace = () => !!(S.ws && S.deckFile && !(S.portable && (S.portable.readOnly || S.portable.tierAOnly)));
  // mode：'new'（新規作成）| 'insert'（スライドの挿入。opts.after）| 'replace'（修正。opts.results：品質チェックの結果があれば）。
  // 取り込み方は入口が決める（③ に選ぶ欄はない）。opts.focusPaste：③ から始める（修正依頼をもう写したとき）。戻り値：取り込んだか
  async function aiDialog(mode, opts = {}) {
    if (mode !== 'new' && !canReplace()) { toast(T.readOnlyNoEdit, true); return false; }
    held = null;
    const titles = X.steps[mode];
    const area = el('textarea', { id: 'paste-text', spellcheck: 'false', placeholder: X.placeholder, rows: '8', 'aria-describedby': 'paste-step3-hint' });
    const msg = el('p', { id: 'paste-msg', cls: 'note bad', role: 'alert', hidden: '' });
    const copyMsg = el('p', { id: 'paste-copied', cls: 'hint', role: 'status', hidden: '' });
    // 返事が切れていたとき：AI に送り直しを頼む文を写すボタン
    const cut = el('button', { type: 'button', id: 'paste-copy-cutoff', hidden: '', text: X.copyCutOff, onclick: async () => { const t = cutOffRequest(S.cutOff || {}, LANG); const ok = await copyText(t); cutMsg.hidden = false; cutMsg.textContent = ok ? X.cutOffCopied : X.fixCopyFailed; } });
    const cutMsg = el('p', { id: 'paste-cut-copied', cls: 'hint', role: 'status', hidden: '' });
    // 持っている片方の知らせ（読み上げ）と、捨てて最初からのボタン
    const stateText = el('span', { id: 'paste-state-text' });
    const reset = el('button', { type: 'button', id: 'paste-reset', text: X.held.reset, onclick: () => { held = null; showState(null, X.held.resetDone); area.value = ''; msg.hidden = true; area.focus(); } });
    const stateBox = el('div', { id: 'paste-state', cls: 'paste-state', role: 'status', hidden: '' }, [stateText, reset]);
    function showState(h, text) {
      stateBox.hidden = !text; stateBox.classList.toggle('waiting', !!h); reset.hidden = !h;
      stateText.textContent = text || '';
    }
    let s1, s2, pre = [];
    if (mode === 'new') {
      // ① 分野（使うパーツ）→ ② デザイン（テーマ）→ ③ 頼みたいこと → ④ コピー → ⑤ 貼り付け
      const req = requestStep(titles[0]);
      const themes = (app.themes && app.themes.length ? app.themes : ['default']);
      const sel = el('select', { id: 'paste-theme' }, themes.map((t) => el('option', { value: t, text: t })));
      sel.value = themes.includes(newTheme) ? newTheme : themes.includes('default') ? 'default' : themes[0];
      newTheme = sel.value;
      const reqWithTheme = { request: () => req.request().replace(/\n*$/, '\n') + X.themeLine(sel.value) + '\n', missing: () => req.missing() };
      const pack = await packStep(copyMsg, reqWithTheme, { title: titles[1], split: true, seriesTitle: titles[3] });
      sel.addEventListener('change', () => { newTheme = sel.value; pack.update(); });
      req.node.addEventListener('input', pack.update);
      const themeNode = step('paste-step-theme', titles[4], [el('p', { cls: 'hint', text: X.themeHint }),
        el('div', { cls: 'paste-field' }, [el('label', { for: 'paste-theme', text: X.themeLabel }), sel])]);
      pre = [pack.seriesNode, themeNode];
      s1 = req.node; s2 = pack.node;
    } else if (mode === 'insert') {
      const { deck, narration } = await readDeck();
      const slides = sectionsOf(deck);
      const n = slides.length;
      insertAfter = opts.after === null || opts.after === undefined || opts.after >= n - 1 ? null : Math.max(-1, opts.after);
      const at = insertAfter === null ? n - 1 : insertAfter;
      const head = (i) => ((S.slides || [])[i] && (S.slides[i].heading || S.slides[i].key)) || '';
      const where = insertAfter === null && opts.after !== n - 1 ? X.insertWhereLast(n, head(n - 1)) : X.insertWhere(at + 1, head(at));
      const ins = insertStep(titles[0], where);
      const req = { request: () => insertRequest({ deck, narration, after: at, n: ins.count(), wish: ins.wish(), lang: LANG }), missing: () => null };
      const pack = await packStep(copyMsg, req, { title: titles[1], optional: true, copyLabel: X.copyInsert, copiedMsg: X.insertCopied });
      ins.node.addEventListener('input', pack.update);
      s1 = ins.node; s2 = pack.node;
    } else {
      const r = reviseStep(copyMsg, titles, opts.results || null);
      s1 = r.s1; s2 = r.s2;
    }
    const s3 = step('paste-step3', titles[2], [
      el('p', { id: 'paste-step3-hint', cls: 'hint', text: X.step3Hint }),
      stateBox, el('label', { for: 'paste-text', cls: 'sr-only', text: X.pasteLabel }), area, msg, cut, cutMsg, el('p', { cls: 'hint', text: X.untrusted })]);
    let focusArea = !!opts.focusPaste;
    for (;;) {
      const buttons = [{ id: 'cancel', label: T.cancel }];
      if (held && (mode === 'replace' || (mode === 'insert' && held.kind === 'deck'))) buttons.push({ id: 'only', label: X.only });
      buttons.push({ id: 'import', label: X.go[mode], pri: true });
      const shown = ask({ title: X.title[mode], kind: 'paste', body: [el('p', { id: 'ai-howto', cls: 'paste-howto', text: mode === 'replace' ? X.howToFix : mode === 'new' ? X.howToNew : X.howTo }), ...pre, s1, s2, s3], buttons });
      if (focusArea) setTimeout(() => { area.focus(); s3.scrollIntoView({ block: 'nearest' }); }, 0);
      const v = await shown;
      if (v !== 'import' && v !== 'only') { held = null; return false; }
      const res = v === 'only' ? await importHeld(mode) : await importText(area.value, mode);
      focusArea = true;
      if (res === null) { held = null; return true; }
      if (res && typeof res === 'object' && res.held) {
        area.value = ''; msg.hidden = true; cut.hidden = true;
        showState(res.held, (res.again ? X.held.again(res.held === 'deck' ? 'deck.html' : 'narration.md') : '') + X.held[res.held](res.count) + (mode === 'replace' || (mode === 'insert' && res.held === 'deck') ? ' ' + X.held.onlyHint : ''));
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
    } else if (mode !== 'replace' || !p.fenced) {
      // 片方だけ：持っておき、もう片方を待つ（「修正…」に囲みの付いた片方だけの返事を貼ったときは、今までどおりその片方だけを取り込む）
      const again = !!held;
      const t = p.part === 'deck' ? p.deck : p.narration;
      held = { kind: p.part, text: t };
      return { held: p.part, again, count: p.part === 'deck' ? sectionsOf(t).length : narrSections(t).out.length };
    }
    return finish(r, mode, info);
  }
  // 「これだけで取り込む」（修正・挿入）：持っている片方だけで
  async function importHeld(mode) {
    if (!held) return X.err.empty;
    const r = { deck: held.kind === 'deck' ? held.text : null, narration: held.kind === 'narration' ? held.text : null, warnings: [] };
    held = null;
    return finish(r, mode, []);
  }
  async function finish(r, mode, info) {
    const notes = r.warnings.map((w) => (X.warn[w.code] ? (typeof X.warn[w.code] === 'function' ? X.warn[w.code](w) : X.warn[w.code]) : w.code));
    if (r.narration === null && mode === 'new') return X.err['no-narration'];
    if (r.deck === null && mode !== 'replace') return X.err['no-deck'];
    if (mode === 'insert') return insertReply(r, notes, info);
    status(X.building);
    try {
      return mode === 'replace' ? await replaceDeck(r, notes, info) : await openNew(r, notes, info);
    } finally { status(''); }
  }
  // 挿入：スライド一覧の操作と同じ道（app/slides-panel.js の apply：読んだときから変わっていないか・控え・元に戻す・組み直し・品質チェック）
  async function insertReply(r, notes, info) {
    if (!sectionsOf(r.deck).length) return X.err['no-insert'];
    let count = 0, none = false;
    await app.slides.apply(async (b, slides) => {
      const after = insertAfter === null || insertAfter >= slides.length ? slides.length - 1 : insertAfter;
      const lang = /<html\b[^>]*\slang\s*=\s*["']?ja/i.test(b.deck) ? 'ja' : (/<html\b[^>]*\slang\s*=/i.test(b.deck) ? 'en' : LANG);
      const m = insertSlides({ deck: b.deck, narration: b.narr || '', patchDeck: r.deck, patchNarration: r.narration, after, lang });
      if (!m.ids.length) { none = true; return null; }
      count = m.ids.length;
      return { deck: m.deck, narr: m.narration, man: b.man, at: m.at, undoAt: Math.max(0, after), label: X.undoInsert(count),
        done: [X.inserted(count, m.at + 1), ...info, ...notes].join(' · ') };
    });
    // 断られた・書けなかったときは、スライドの一覧が知らせる（窓は閉じる）
    return none ? X.err['no-insert'] : null;
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
  // 選んだテーマを返事の教材の <html> に付ける（AI がテーマを付けなかったとき。付けていればその返事のまま）
  function withTheme(deck) {
    if (!newTheme || !/^[\w-]+$/.test(newTheme)) return deck;
    return deck.replace(/<html\b[^>]*>/i, (tag) => (/\sdata-theme\s*=/i.test(tag) ? tag : tag.replace(/>$/, ` data-theme="${newTheme}">`)));
  }
  async function openNew(r, notes, info = []) {
    const ids = withIds(withTheme(r.deck), r.narration);
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
  // 品質チェックの結果から依頼に入れる指摘（テーマの寸法のずれ・測る字体はテーマと環境の知らせで、デッキの中にはないので入れない）
  async function problemsOf(results) {
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
    const probs = (results || []).filter((r) => (r.sev === 'error' || r.sev === 'warn') && r.code !== 'themeMetricsDrift' && r.code !== 'metricsFontLoad').map((r) => { const arg = withLines(r); return { sev: r.sev, i: r.i, title: r.title, code: r.code, data: arg, text: T.checkMsg(r.code, arg) }; });
    // 組み立ての知らせのうち、原稿の書き方に関わるもの（行き先のない口述原稿・目印・段階の番号など）
    for (const w of S.warn || []) if (/^(narration|mark|slide key):/.test(w)) probs.push({ sev: /^narration:/.test(w) ? 'error' : 'warn', i: null, title: '', msg: w, text: w });
    return probs;
  }
  // 開いているメモ（comments.json。読めなければなし）。点や手描きのメモの画像は backlog #90
  async function openNotes() {
    let list = [];
    try { const t = await S.ws.readText('comments.json', { max: READ_LIMITS.comments }); const j = t ? JSON.parse(t) : []; list = Array.isArray(j) ? j : []; } catch { list = []; }
    const slides = S.slides || [];
    return list.filter((c) => c && c.status !== 'resolved' && String(c.comment || '').trim()).map((c) => {
      const key = String(c.key || ''), i = slides.findIndex((s) => key === s.key || key.startsWith(s.key + ':'));
      return { where: i >= 0 ? T.sl.slideName(i + 1, slides[i].heading || slides[i].key) : key, quote: String(c.quote || '').replace(/\s+/g, ' ').trim().slice(0, 120), text: String(c.comment).trim() };
    });
  }
  // 「修正…」の ②：修正依頼（kit/core/llm-fix.mjs）に、直してほしいことと開いているメモを足す。直すことが何もなければ null
  async function reviseRequest(results, wish) {
    const probs = await problemsOf(results);
    const notes = await openNotes();
    const w = String(wish || '').trim();
    if (!probs.length && !notes.length && !w) return null;
    const { deck, narration } = await readDeck();
    const req = buildFixRequest({ problems: probs, deck, narration, lang: LANG });
    const extra = [];
    if (w) extra.push(X.wishHead, '', w, '');
    if (notes.length) extra.push(X.notesHead, '', ...notes.map(X.noteLine), '');
    return { text: req.text + (extra.length ? '\n' + extra.join('\n') : ''), problems: probs.length, notes: notes.length };
  }
  // 品質チェックの板の「AI への修正依頼をコピー」：指摘だけの依頼を写して見せ、返事は「修正…」の ③ へ
  async function fixRequest(results) {
    const probs = await problemsOf(results);
    if (!probs.length) { toast(X.fixNone); return; }
    const { deck, narration } = await readDeck();
    const req = buildFixRequest({ problems: probs, deck, narration, lang: LANG });
    const area = el('textarea', { id: 'fix-text', readonly: '', rows: '12', spellcheck: 'false' });
    area.value = req.text;
    const ok = await copyText(req.text, area);
    // 窓を開いた後に頭を見せる（窓が字の欄にフォーカスを移すと、終わりへ送られることがある）
    setTimeout(() => { try { area.setSelectionRange(0, 0); area.scrollTop = 0; } catch { /* 無視 */ } }, 0);
    const v = await ask({ title: X.fixTitle, kind: 'paste', body: [
      el('p', { id: 'fix-lead', text: ok ? X.fixLead(probs.length, req.partial) : X.fixCopyFailed }), area],
      buttons: [{ id: 'cancel', label: X.close }, { id: 'paste', label: X.pasteReply, pri: true }] });
    if (v === 'paste') await aiDialog('replace', { results, focusPaste: true });
  }
  function fixButton(results) {
    return el('button', { type: 'button', id: 'b-fixreq', cls: 'fixreq', text: X.fix, onclick: () => fixRequest(results) });
  }

  const run = (p) => p.catch((e) => toast(String((e && e.message) || e), true));
  // 「修正…」：品質チェックの板の先頭と、道具の列の「スライド ▾」（revise）。結果がなくても出す
  const reviseButton = () => el('button', { type: 'button', id: 'b-revise', cls: 'fixreq', text: T.reviseCmd, onclick: () => run(aiDialog('replace')) });
  return { aiDialog, reviseButton, revise: () => run(aiDialog('replace')), newWithAi: () => run(aiDialog('new')), insertWithAi: (after) => run(aiDialog('insert', { after })), importText, extraChecks, fixButton, fixRequest, texts: X };
}
