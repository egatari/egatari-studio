// チャットの AI との行き来（docs/authoring-with-llms.md）。AI は、ふつうのコマンドの中の 1 つのやり方として出す（名前に「AI で…」を付けない）：
//   「新規作成…」（チャットの AI の道 1 本。mode 'new'）：① 場面（大分類・小分類。kit/core/new-deck.mjs）→ ② お使いの AI（無料版・有料版。既定は無料版）、
//     無料版なら分野（使うパーツの組。既定はなし。ビジネスの大分類ならビジネス。有料版はすべての系列を入れるので出さない）、
//     折りたたみ（既定で閉じる）の中に素材（いつも使える）と言いたいこと（14 の札。既定で全部入り、外したものは AI に使わせない。kit/core/purposes.mjs）→ ③ デザイン（テーマ。返事の教材にも付ける）→
//     ④ 頼みたいことを書く（kit/core/llm-request.mjs。場面の構成の型と外した言いたいことも足す）→ ⑤ 共通の本体と、選んだ系列
//     （既定はデッキを開いていればその部品・テーマから推したもの、開いていなければなし）と ① を組み立てて写す（kit/core/llm-pack.mjs）→
//     ③ AI の返事を貼り付けて開く：返事の全体（か、1 つずつ貼った 2 つの囲み。kit/core/llm-import.mjs の pastePart）から deck.html と narration.md を
//     取り出し、スライドに id を付け（kit/core/slide-ids.mjs。npm run ids と同じ本体）、メモリの上の原稿を Worker で 1 ファイル（.ega.html）にして
//     （app/build-worker.js の exportHtml）、ほかの 1 ファイルと同じ道（openPortable：中身からコードを探し、あれば動かす前に確かめる）で開き、品質チェックをかける。
//     開くときに 1 回だけ、原稿の <html> にシード値（data-egatari-seed。format spec §8.4）を書き、選んだもの（お使いの AI・場面・分野・外した言いたいこと）を
//     egatari.json の studio.newDeck に残す。「修正…」で入れ替える原稿がシード値を失っても、前のシード値に戻す（keepSeed）
//   「スライドの挿入…」→「チャットの AI に書いてもらう」（mode 'insert'。backlog #93）：① 足すスライド（枚数・足したいこと）→ ② 短い頼む文
//     （見出しの一覧と足す場所の前のスライドだけ。kit/core/llm-insert.mjs。新しいチャットなら指示も付けられる）→ ③ 返事のスライドを、選んだスライドの
//     後ろ（選んでいなければ最後）に入れ、スライド一覧の「足す」と同じに id を付ける（app/slides-panel.js の apply：控え・元に戻す・組み直し・品質チェック）
//   「修正…」（mode 'replace'）：① 直してほしいこと → ② 修正依頼（品質チェックの指摘・組み立ての知らせ・その規格の文章・今の原稿（kit/core/llm-fix.mjs）と、
//     ① と開いているメモ（comments.json。画像は backlog #90））→ ③ 今の docId・設定・音声を残して原稿だけを入れ替える（直したスライドだけの返事は id で戻す）
//   品質チェックの板の「AI への修正依頼をコピー」も、返事は「修正…」の ③ で取り込む
// 貼り付けた文字列は信頼しない：このページでは解析と文字列の書き換えだけをし、組み立ては Worker で、表示は sandbox のプレビューで
import { buildPack, SERIES, membersOfSeries, seriesForDeck, packSize, packKb, kbOf, commonBody, seriesPart, PURPOSES } from '../kit/core/llm-pack.mjs';
import { CATEGORIES, SUBJECTS, AI_PLANS, DEFAULT_PLAN, defaultSubjects, choiceRequest, withChoice, newSeed, freshSeed, keepSeed } from '../kit/core/new-deck.mjs';
import { componentsOff } from '../kit/core/purposes.mjs';
import { pastePart, isPatch, mergeSlides, mergeNarration, sectionsOf, narrSections } from '../kit/core/llm-import.mjs';
import { requestForm, filledRequest, packWithRequest } from '../kit/core/llm-request.mjs';
import { insertRequest, insertSlides } from '../kit/core/llm-insert.mjs';
import { slideCountOf, outlineRequest, parseOutline, withOutline, outlineOf, nextBatch, remaining, batchRequest, OUTLINE_OVER, BATCH } from '../kit/core/llm-outline.mjs';
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
    howToNew: 'ブラウザの別のタブで、チャットの AI（Gemini・ChatGPT・Claude など）を開きます。ここでコピーする指示を貼って送ると、AI が教材を書きます。その返事を ⑥ に貼り付けます。',
    themeLoad: 'ほかのテーマを読み込む…', themeLabel: 'テーマ',
    back: '← 戻る', contentLabel: '内容（要点・メモ・元の資料の文を貼る）', contentPh: '例：教えたい要点の箇条書き、授業のメモ、教科書や論文の一節など（そのまま貼ってかまいません）',
    contentHead: '## 内容（要点・メモ・元の資料）',
    phase: (n) => `${n} 枚なので、2 回に分けて作ります：まず構成案（見出しと要点の表）を頼み、次に ${BATCH} 枚ずつ頼みます`,
    outlineGot: (n) => `構成案を受け取りました（${n} 枚）。${BATCH} 枚ずつ作ります`,
    outlineCopied: (kb) => `コピーしました（${kb} KB）。同じチャットに貼り付けて送ってください。返事が来たら ⑥ へ`,
    outlineStep: '構成案', outlineCopy: (a, b) => `${a}〜${b} 枚目を頼む文をコピー`,
    outlineHint: (a, b) => `コピーした文を同じチャットに貼って送り、返事（${a}〜${b} 枚目の deck.html と narration.md）を下に貼り付けて開きます。残りは開いた後に、上の知らせの「次の ${BATCH} 枚を頼む」から頼みます`,
    outlineErr: { 'no-outline': '```outline の囲みが見つかりません', unclosed: (e) => `${e.line} 行目からの \`\`\`outline の囲みが閉じていません。返事の続きを頼んでください`, 'no-table': '構成案の表の行が見つかりません（| 番号 | 見出し | 要点 | の形）', 'empty-heading': (e) => `${e.line} 行目に見出しのない行があります`, 'too-many': (e) => `構成案が ${e.n} 枚あります（60 枚まで）`, 'too-few': '構成案が 2 枚より少ないので、ふつうに 1 回で頼んでください' },
    batchTitle: '構成案の続き', batchWhere: (a, b, n, left) => `構成案の ${a}〜${b} 枚目（全 ${n} 枚。残り ${left} 枚）を、最後のスライドの後ろに入れます`,
    batchDone: (left) => (left ? `構成案：残り ${left} 枚` : '構成案のスライドをすべて作りました'),
    themeHint: 'スライドの色と書体を決めます。頼む文に入れます（返事の教材にテーマがなければ、このテーマを付けます）', themeLine: (t) => `- テーマ：${t}（<html data-theme="${t}">）`,
    seriesHintNew: '使うパーツの説明が指示に加わります。何も選ばなければ共通の本体だけです',
    planLegend: 'お使いのチャットの AI は無料版ですか、有料版ですか',
    plan: { free: '無料版（指示を軽くして、使う分野だけを入れる）', paid: '有料版（すべての分野のパーツの説明を入れる）' },
    planHint: '無料版のチャットは長い指示を読み切れないことがあるので、指示を軽くします。わからなければ無料版のままで',
    seriesPaid: '有料版では、すべての分野のパーツの説明が指示に入ります（分野は選びません）',
    kindHint: '場面を選ぶと、その構成の型と見せ方を頼みたいことに入れます。選ばなくてもかまいません',
    catLegend: '大分類', subLegend: '小分類', subNone: 'この大分類には小分類はありません',
    structure: (st, sh) => `構成の型：${st}。見せ方：${sh}`,
    materialsLegend: '素材（いつも使える）', materials: { table: '表', image: '画像', math: '数式', shape: '図形' },
    purposesLegend: '言いたいこと', purposesFold: 'AI に使わせない表し方を選ぶ（選ばなくてよい）',
    purposesHint: '既定で全部入っています。押すと外れ、AI はその表し方を使いません。小さな字は中の表し方で、AI が言いたいこととデータから選びます（まだパーツがないものは、近いパーツか HTML で描きます）',
    purposesSum: (on, n) => `言いたいこと：${n} 個のうち ${on} 個が入っています`,
    purposesFoldSum: (on, n) => (on === n ? 'いまは全部使う' : `${n - on} 個を外した`),
    purposeOn: '入っている', purposeOff: '外した',
    howToFix: 'ブラウザの別のタブで、チャットの AI（Gemini・ChatGPT・Claude など）を開きます。ここでコピーする修正依頼を貼って送ると、AI が直したスライドを返します。その返事を ③ に貼り付けます。',
    steps: {
      batch: ['① 頼む範囲', '② 頼む文をコピーして、チャットに貼って送る', '③ AI の返事を貼り付けて挿入する'],
      new: ['④ 頼みたいことを書く', '⑤ AI への指示をコピーして、チャットに貼って送る', '⑥ AI の返事を貼り付けて開く', '② お使いの AI と分野（使うパーツ）を選ぶ', '③ デザイン（テーマ）を選ぶ', '① 場面（大分類・小分類）を選ぶ（選ばなくてもよい）'],
      insert: ['① 足すスライドを書く', '② 頼む文をコピーして、チャットに貼って送る', '③ AI の返事を貼り付けて挿入する'],
      replace: ['① 直してほしいことを書く', '② 修正依頼をコピーして、チャットに貼って送る', '③ AI の返事を貼り付けて取り込む'],
    },
    step1Hint: '書いた内容は、コピーする指示の最後に入ります（チャットに貼ると添付のファイルの形になり、そこでは書き直せないため、先にここで書きます）。書かない項目は空のままでかまいません',
    kindLegend: 'どちらで作りますか', kindA: 'A　新しく作る', kindB: 'B　このチャットでここまで話し合った内容で作る',
    fieldPh: { topic: '例：二分探索のしくみ', audience: '例：高校 2 年生', length: '例：5 枚・10 分', language: '例：日本語', speakers: '例：1 人', examples: '例：電話帳で名前を探す' },
    needTopic: '④ の「題材」を書いてください',
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
    seriesName: { academic: '数理・統計（数式・関数・データ）', business: 'ビジネス（KPI・位置づけ・市場・お金の流れ）', kokugo: '国語（漢文・古文・現代文・縦書き）', info: '情報（符号の木）' },
    plusKb: (kb) => `+${kb} KB`, packTotal: (kb) => `合わせて ${kb} KB`,
    copyGuide: 'AI への指示をコピー',
    copied: (kb) => `コピーしました（${kb} KB、④ の頼みたいこと入り）。チャットに貼り付けて送ってください。添付のファイルの形になっても、そのまま送ってください。返事が来たら ⑥ へ`,
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
    howToNew: 'Open a chat AI (Gemini, ChatGPT, Claude, …) in another browser tab. Paste the instructions you copy here and send them; the AI writes the lesson. Then paste its reply in step 6.',
    themeLoad: 'Load another theme…', themeLabel: 'Theme',
    back: '← Back', contentLabel: 'Content (key points, notes, or text from your source material)', contentPh: 'e.g. the points to teach as a list, your lesson notes, a passage from a textbook or paper (paste it as it is)',
    contentHead: '## Content (key points, notes, source material)',
    phase: (n) => `${n} slides, so it is made in two passes: first an outline (a table of headings and points), then ${BATCH} slides at a time`,
    outlineGot: (n) => `Got the outline (${n} slides). The slides are made ${BATCH} at a time`,
    outlineCopied: (kb) => `Copied (${kb} KB). Paste it into the same chat and send. When the reply arrives, go to step 6.`,
    outlineStep: 'Outline', outlineCopy: (a, b) => `Copy the request for slides ${a}–${b}`,
    outlineHint: (a, b) => `Paste the copied text into the same chat and send it, then paste the reply (deck.html and narration.md of slides ${a}–${b}) below and open it. Ask for the rest after it opens, with “Ask for the next ${BATCH}” in the notice above.`,
    outlineErr: { 'no-outline': 'No ```outline block found.', unclosed: (e) => `The \`\`\`outline block from line ${e.line} is not closed. Ask the AI to continue.`, 'no-table': 'No outline table rows found (| # | Heading | Point |).', 'empty-heading': (e) => `Line ${e.line} has a row without a heading.`, 'too-many': (e) => `The outline has ${e.n} slides (at most 60).`, 'too-few': 'The outline has fewer than 2 slides; ask for the lesson in one go instead.' },
    batchTitle: 'The rest of the outline', batchWhere: (a, b, n, left) => `Slides ${a}–${b} of the outline (${n} in all; ${left} left) go after the last slide`,
    batchDone: (left) => (left ? `Outline: ${left} slides left` : 'All slides of the outline are made'),
    themeHint: 'Sets the colors and fonts of the slides. It goes into the request (and a reply without a theme gets this one)', themeLine: (t) => `- Theme: ${t} (<html data-theme="${t}">)`,
    seriesHintNew: 'Adds the notes on those parts to the instructions. With none chosen, only the common body is sent.',
    planLegend: 'Is your chat AI a free or a paid plan?',
    plan: { free: 'Free plan (lighter instructions with only the subjects you choose)', paid: 'Paid plan (notes on the parts of every subject)' },
    planHint: 'A free chat may not take in long instructions, so they are kept light. If you are not sure, keep Free plan.',
    seriesPaid: 'With a paid plan, the notes on the parts of every subject are in the instructions (no subjects to choose).',
    kindHint: 'The structure and presentation of the kind you choose go into the request. You can leave it unchosen.',
    catLegend: 'Category', subLegend: 'Subcategory', subNone: 'This category has no subcategories',
    structure: (st, sh) => `Structure: ${st}. Presentation: ${sh}`,
    materialsLegend: 'Materials (always available)', materials: { table: 'Table', image: 'Image', math: 'Equation', shape: 'Shape' },
    purposesLegend: 'Purposes', purposesFold: 'Choose representations the AI should not use (optional)',
    purposesHint: 'All are on by default. Press one to turn it off: the AI will not use that representation. The small text is what is inside; the AI chooses from the purpose and the data (where no part exists yet, it uses the nearest part or HTML).',
    purposesSum: (on, n) => `Purposes: ${on} of ${n} on`,
    purposesFoldSum: (on, n) => (on === n ? 'all in use now' : `${n - on} turned off`),
    purposeOn: 'on', purposeOff: 'off',
    howToFix: 'Open a chat AI (Gemini, ChatGPT, Claude, …) in another browser tab. Paste the fix request you copy here and send it; the AI sends back the fixed slides. Then paste its reply in step 3.',
    steps: {
      batch: ['1. The range to ask for', '2. Copy the request, paste it into the chat and send', '3. Paste the AI’s reply and insert it'],
      new: ['4. Write what you want', '5. Copy the instructions, paste them into the chat and send', '6. Paste the AI’s reply and open it', '2. Choose your chat AI and subjects (parts)', '3. Choose the design (theme)', '1. Choose the kind (category and subcategory) (optional)'],
      insert: ['1. Describe the slides to add', '2. Copy the request, paste it into the chat and send', '3. Paste the AI’s reply and insert it'],
      replace: ['1. Write what to change', '2. Copy the fix request, paste it into the chat and send', '3. Paste the AI’s reply and bring it in'],
    },
    step1Hint: 'What you write goes at the end of the copied instructions (pasted into a chat they often become an attachment you cannot edit there, so write it here first). Leave out anything you do not need.',
    kindLegend: 'How do you want to make it?', kindA: 'A. Make a new lesson', kindB: 'B. From what we have discussed so far in this chat',
    fieldPh: { topic: 'e.g. how binary search works', audience: 'e.g. first-year students', length: 'e.g. 5 slides, 10 minutes', language: 'e.g. English', speakers: 'e.g. one narrator', examples: 'e.g. finding a name in a phone book' },
    needTopic: 'Write the topic in step 4.',
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
    seriesName: { academic: 'Math and statistics (formulas, functions, data)', business: 'Business (KPIs, positioning, markets, money flows)', kokugo: 'Japanese language arts (kanbun, kobun, gendai, vertical)', info: 'Information science (code trees)' },
    plusKb: (kb) => `+${kb} KB`, packTotal: (kb) => `${kb} KB in all`,
    copyGuide: 'Copy instructions for your AI',
    copied: (kb) => `Copied (${kb} KB, with what you wrote in step 4). Paste it into the chat and send. If it turns into an attachment, just send it. When the reply arrives, go to step 6.`,
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
    if (window.__APP_TEST) window.__APP_TEST.lastCopy = text;   // 試験：写した文（クリップボードを読まずに確かめる）
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
  const draft = { kind: 'A', values: {}, plan: DEFAULT_PLAN, category: null, subcategory: null, purposesOff: [] };
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
    // 内容（要点・メモ・元の資料の文）：大きな欄。頼みたいことの後ろに、そのまま入れる（大きさの心配は ② のお使いの AI が引き受ける）
    const content = el('textarea', { id: 'paste-content', rows: '9', placeholder: X.contentPh, spellcheck: 'false' });
    content.value = draft.content || '';
    content.addEventListener('input', () => { draft.content = content.value; });
    const phase = el('p', { id: 'paste-phase', cls: 'note paste-phase', role: 'status', hidden: '' });
    const contentBox = el('div', { cls: 'paste-field wide paste-content' }, [el('label', { for: 'paste-content', text: X.contentLabel }), content]);
    return {
      node: step('paste-step1', title, [el('p', { cls: 'hint', text: X.step1Hint }), kinds, A, B, contentBox, phase]),
      request: () => filledRequest({ kind: draft.kind, values: values() }, LANG),
      content: () => content.value.trim(),
      count: () => (draft.kind === 'A' || draft.kind === 'B' ? slideCountOf(values().length) : null),
      phase,
      missing: () => (draft.kind === 'A' && !String(values().topic || '').trim() ? A.querySelector('[name=topic]') : null),
    };
  }
  // ① 新規作成：場面（大分類 → 小分類。kit/core/new-deck.mjs）。小分類が構成の型を決め、その型と見せ方を頼みたいことに入れる。選ばなくてもよい。
  // 大分類を選ぶと最初の小分類を選んでおく（小分類のない手引き・その他は大分類だけ）
  function kindStep(title, onChange) {
    const radio = (name, id, label) => el('label', {}, [el('input', { type: 'radio', name, value: id, id: `${name}-${id}` }), el('span', { text: label })]);
    const cat = el('fieldset', { id: 'paste-cat', cls: 'paste-kind paste-cat' }, [el('legend', { text: X.catLegend }), ...CATEGORIES.map((c) => radio('paste-cat', c.id, c.label[LANG]))]);
    const sub = el('fieldset', { id: 'paste-sub', cls: 'paste-kind paste-sub' });
    const note = el('p', { id: 'paste-structure', cls: 'hint paste-structure', role: 'status' });
    const render = () => {
      const c = CATEGORIES.find((x) => x.id === draft.category) || null;
      for (const r of cat.querySelectorAll('input')) r.checked = r.value === draft.category;
      sub.replaceChildren(el('legend', { text: X.subLegend }), ...(c && c.subs.length ? c.subs.map((x) => radio('paste-sub', x.id, x.label[LANG])) : [el('span', { cls: 'hint', text: X.subNone })]));
      sub.hidden = !c;
      for (const r of sub.querySelectorAll('input')) r.checked = r.value === draft.subcategory;
      const t = (c && c.subs.find((x) => x.id === draft.subcategory)) || (c && c.structure ? c : null);
      note.textContent = t ? X.structure(t.structure[LANG], t.show[LANG]) : '';
      note.hidden = !t;
    };
    cat.addEventListener('change', (e) => {
      if (e.target.name !== 'paste-cat') return;
      draft.category = e.target.value;
      const c = CATEGORIES.find((x) => x.id === draft.category);
      draft.subcategory = c && c.subs.length ? c.subs[0].id : null;
      render(); onChange();
    });
    sub.addEventListener('change', (e) => { if (e.target.name === 'paste-sub') { draft.subcategory = e.target.value; render(); onChange(); } });
    render();
    return step('paste-step-kind', title, [el('p', { cls: 'hint', text: X.kindHint }), cat, sub, note]);
  }
  // ② の素材（いつも使える。押せない札）と言いたいこと（14 の札。既定で全部入り。押すと外れ、外したものだけに使う部品は指示の一覧からも除く）。
  // 入っている札は印と枠、外した札は薄くして斜線（色だけで分けない。app/app.css の .tile）。絵は parts-map の下書きの線画（仮。部品の見本から撮る絵に替える）
  const ICONS = {
    table: '<rect x="4" y="6" width="24" height="20" rx="2"/><path d="M4 12h24M4 19h24M12 6v20M20 6v20"/>',
    image: '<rect x="4" y="6" width="24" height="20" rx="2"/><circle cx="11" cy="12" r="2.5"/><path d="M4 23l7-7 5 5 4-4 8 8"/>',
    math: '<path d="M6 8h9l-6 8 6 8H6"/><path d="M19 13l7 7M26 13l-7 7"/>',
    shape: '<rect x="4" y="5" width="12" height="12" rx="1"/><circle cx="21" cy="21" r="7"/>',
    compare: '<rect x="3" y="7" width="11" height="18" rx="1"/><rect x="18" y="7" width="11" height="18" rx="1"/><path d="M6 12h5M6 16h5M21 12h5M21 16h5"/>',
    line: '<path d="M5 27h22M5 5v22"/><path d="M7 22l6-7 5 4 8-11"/>',
    part: '<circle cx="16" cy="16" r="11"/><path d="M16 5v11l9 6"/>',
    kpi: '<rect x="3" y="6" width="26" height="20" rx="2"/><path d="M8 19h3M13 13v6M17 13h4v6h-4M24 16l2-3 2 3"/>',
    flow: '<rect x="3" y="12" width="7" height="8" rx="1"/><rect x="22" y="12" width="7" height="8" rx="1"/><path d="M10 16h10M17 13l3 3-3 3"/>',
    timeline: '<path d="M3 16h26"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><circle cx="24" cy="16" r="2"/><path d="M8 9v4M16 19v4M24 9v4"/>',
    cause: '<path d="M4 16h22M26 16l-3-3M26 16l-3 3"/><path d="M8 8l5 8M16 8l5 8M8 24l5-8M16 24l5-8"/>',
    cycle: '<path d="M16 5a11 11 0 0 1 10 7"/><path d="M27 20a11 11 0 0 1-9 7"/><path d="M10 26a11 11 0 0 1-5-12"/><path d="M26 7v5h-5M18 30l-2-3 3-2M3 17l2-3 3 2"/>',
    tree: '<rect x="12" y="3" width="8" height="6" rx="1"/><rect x="3" y="22" width="8" height="6" rx="1"/><rect x="21" y="22" width="8" height="6" rx="1"/><path d="M16 9v6M7 15h18M7 15v7M25 15v7"/>',
    matrix: '<path d="M16 4v24M4 16h24"/><circle cx="10" cy="10" r="1.6"/><circle cx="22" cy="21" r="1.6"/><circle cx="21" cy="9" r="1.6"/>',
    venn: '<circle cx="12" cy="16" r="8"/><circle cx="20" cy="16" r="8"/>',
    scatter: '<path d="M5 27h22M5 5v22"/><circle cx="10" cy="21" r="1.4"/><circle cx="14" cy="18" r="1.4"/><circle cx="18" cy="14" r="1.4"/><circle cx="22" cy="11" r="1.4"/><circle cx="15" cy="22" r="1.4"/>',
    dist: '<path d="M5 27h22"/><rect x="6" y="21" width="4" height="6"/><rect x="10" y="13" width="4" height="14"/><rect x="14" y="8" width="4" height="19"/><rect x="18" y="15" width="4" height="12"/><rect x="22" y="22" width="4" height="5"/>',
    menu: '<rect x="4" y="5" width="10" height="9" rx="1"/><rect x="18" y="5" width="10" height="9" rx="1"/><rect x="4" y="18" width="10" height="9" rx="1"/><rect x="18" y="18" width="10" height="9" rx="1"/>',
    bars: '<path d="M5 27h22"/><rect x="7" y="16" width="4" height="11"/><rect x="14" y="10" width="4" height="17"/><rect x="21" y="5" width="4" height="22"/>',
    collect: '<rect x="3" y="5" width="5" height="4"/><rect x="10" y="5" width="5" height="4"/><rect x="17" y="5" width="5" height="4"/><rect x="24" y="5" width="5" height="4"/><path d="M16 12v6M13 15l3 3 3-3"/><rect x="10" y="21" width="12" height="7" rx="1"/>',
    gendai: '<path d="M5 9h22M5 16h22M5 23h14"/><path d="M5 11h10" stroke-width="2.6"/><path d="M22 11c4 2 4 8 0 10"/>',
    sweep: '<path d="M4 24c6 0 8-16 12-16s6 16 12 16"/><path d="M4 24c8 0 10-10 12-10s4 10 12 10" opacity=".5"/>',
    other: '<rect x="6" y="6" width="20" height="20" rx="3"/>',
  };
  // 言いたいことの id（部品庫の purposes.json と同じ）→ 札の絵
  const PURPOSE_ICON = { compare: 'compare', ranking: 'bars', change: 'line', 'part-whole': 'part', 'key-number': 'kpi', process: 'flow', timeline: 'timeline',
    'cause-effect': 'cause', cycle: 'cycle', hierarchy: 'tree', position: 'matrix', overlap: 'venn', correlation: 'scatter', spread: 'dist', grouping: 'collect',
    'text-structure': 'gendai', contents: 'menu', parameter: 'sweep' };
  function icon(k) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    svg.innerHTML = ICONS[k] || '';   // 決まった線画だけ（外から来た字は入れない）
    return svg;
  }
  function partsTiles(update) {
    const materials = el('div', { id: 'paste-materials', cls: 'paste-tiles-group' }, [
      el('h4', { id: 'paste-materials-h', text: X.materialsLegend }),
      el('ul', { cls: 'tiles', 'aria-labelledby': 'paste-materials-h' }, Object.keys(X.materials).map((k) => el('li', { cls: 'tile fixed', id: 'paste-material-' + k }, [icon(k), el('span', { cls: 'tile-label', text: X.materials[k] })]))),
    ]);
    const sum = el('p', { id: 'paste-purposes-sum', cls: 'hint', role: 'status' });
    const foldSum = el('span', { id: 'paste-purposes-fold-sum', cls: 'hint' });
    const showSum = () => {
      const on = PURPOSES.list.length - draft.purposesOff.length;
      sum.textContent = X.purposesSum(on, PURPOSES.list.length); foldSum.textContent = X.purposesFoldSum(on, PURPOSES.list.length);
    };
    const tiles = PURPOSES.list.map((p) => {
      const b = el('button', { type: 'button', id: 'paste-purpose-' + p.id, cls: 'tile', 'data-purpose': p.id, 'aria-pressed': draft.purposesOff.includes(p.id) ? 'false' : 'true' },
        [icon(PURPOSE_ICON[p.id] || 'other'), el('span', { cls: 'tile-label', text: p.label[LANG] }), p.sub[LANG] ? el('small', { text: p.sub[LANG] }) : null]);
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        draft.purposesOff = on ? draft.purposesOff.filter((x) => x !== p.id) : [...draft.purposesOff, p.id];
        showSum(); update();
      });
      return b;
    });
    showSum();
    const purposes = el('div', { id: 'paste-purposes', cls: 'paste-tiles-group', role: 'group', 'aria-labelledby': 'paste-purposes-h', 'aria-describedby': 'paste-purposes-hint' }, [
      el('h4', { id: 'paste-purposes-h', text: X.purposesLegend }),
      el('p', { id: 'paste-purposes-hint', cls: 'hint', text: X.purposesHint }),
      el('div', { cls: 'tiles' }, tiles), sum,
    ]);
    // 札は折りたたみの中（既定で閉じる）。札のはたらきは同じ（外すだけ。無料版・有料版のどちらでも）。閉じていても、外した数を見出しの横に出す
    return el('details', { id: 'paste-purposes-fold', cls: 'paste-fold' }, [
      el('summary', { id: 'paste-purposes-fold-h' }, [el('span', { text: X.purposesFold }), ' ', foldSum]), materials, purposes]);
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
  // split：新規作成（② 分野 を別のステップにする。既定は何も選ばない）。seriesTitle：その見出し。req.exclude：使わせない部品（外した言いたいこと）
  async function packStep(copyMsg, req, { title, optional = false, copyLabel = X.copyGuide, copiedMsg = X.copied, split = false, seriesTitle = '', onSize = null } = {}) {
    // 大きさはどれも同じ測り方（UTF-8 のバイト数 / 1024、小数 1 桁。kit/core/llm-pack.mjs の packSize・kbOf）。共通の本体と分野は、写す文に入るその部分そのもの
    // （共通の本体は空の記入欄を含まない。含めると、記入欄を埋めた合わせての大きさより大きく見えた）。合わせては部分の和より小さくならない
    // 外した言いたいこと（新規作成の ②）だけに使う部品は、共通の本体と分野の説明からも除く：大きさもその分を引いたもの（update で出し直す）
    const ex = () => (req.exclude ? req.exclude() : []);
    const offNow = () => (req.off ? req.off() : []);
    // 共通の本体の表は、入っている分野と外した言いたいことで変わる（kit/core/llm-pack-assemble.mjs）
    // お使いの AI（新規作成。ほかの入口は無料版の組み立て）：有料版はすべての系列とすべての部品
    const planNow = () => (req.allSeries && req.allSeries() ? 'paid' : 'free');
    const commonNow = () => commonBody(LANG, ex(), chosen(), offNow(), planNow());
    const partBytes = (s) => packSize(seriesPart(s, LANG, ex(), planNow()));
    const initial = split ? [] : await defaultSeries();
    const commonBytes = packSize(commonBody(LANG, ex(), initial, offNow(), planNow()));
    const total = el('span', { id: 'paste-pack-size', cls: 'hint' });
    const boxes = SERIES.map((s) => {
      const cb = el('input', { type: 'checkbox', id: 'paste-series-' + s, value: s });
      cb.checked = initial.includes(s);
      return cb;
    });
    const withPack = optional ? el('input', { type: 'checkbox', id: 'paste-with-pack' }) : null;
    const packOn = () => !withPack || withPack.checked;
    // req.allSeries()：すべての系列を入れる（新規作成の有料版。分野の印は残すが使わない）
    const chosen = () => (req.allSeries && req.allSeries() ? [...SERIES] : boxes.filter((b) => b.checked).map((b) => b.value));
    const textNow = async () => { const r = await req.request(); return packOn() ? packWithRequest({ series: chosen(), lang: LANG, request: r, exclude: ex(), off: offNow(), plan: planNow() }) : r; };
    const update = async () => {
      const t = await textNow(); total.textContent = X.packTotal(kb(t)); total.dataset.bytes = String(packSize(t)); if (onSize) onSize(packSize(t));
      const cb = packSize(commonNow());
      commonRow.dataset.bytes = String(cb); commonRow.lastChild.textContent = X.common(kbOf(cb));
      for (const s of SERIES) { const h = seriesSet.querySelector(`#paste-series-${s}`).closest('label').querySelector('[data-bytes]'); if (!h) continue; const b = partBytes(s); h.dataset.bytes = String(b); h.textContent = X.plusKb(kbOf(b)); }
    };
    for (const b of boxes) b.addEventListener('change', update);
    const common = el('input', { type: 'checkbox', id: 'paste-common', disabled: '', 'aria-disabled': 'true' });
    common.checked = true;
    const copy = el('button', { type: 'button', id: 'paste-copy-guide', cls: 'pri', text: copyLabel, onclick: async () => {
      const miss = req.missing();
      if (miss) { copyMsg.hidden = false; copyMsg.classList.add('bad'); copyMsg.textContent = X.needTopic; miss.focus(); return; }
      const text = await textNow();
      if (req.onCopy) req.onCopy();
      const ok = await copyText(text);
      copyMsg.classList.remove('bad'); copyMsg.hidden = false; copyMsg.textContent = ok ? copiedMsg(kb(text)) : X.fixCopyFailed;
    } });
    const seriesSet = el('fieldset', { id: 'paste-series', cls: 'paste-series', 'aria-describedby': 'paste-series-hint' }, [
        el('legend', { text: X.seriesLegend }),
        // 新規作成（split）では分野ごとの大きさを出さない（大きさの心配は ② のお使いの AI が引き受ける）
        ...SERIES.map((s, i) => el('label', { title: membersOfSeries(s).join(', ') }, [boxes[i], el('span', { text: X.seriesName[s] || s }),
          split ? null : el('span', { cls: 'hint', 'data-bytes': String(partBytes(s)), text: X.plusKb(kbOf(partBytes(s))) })])),
      ]);
    const seriesHint = el('p', { id: 'paste-series-hint', cls: 'hint', text: X.seriesHint(X.seriesName.academic) });
    const commonRow = el('label', { cls: 'paste-common', for: 'paste-common', 'data-bytes': String(commonBytes) }, [common, el('span', { text: X.common(kbOf(commonBytes)) })]);
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
    const seriesNewHint = el('p', { id: 'paste-series-new-hint', cls: 'hint', text: X.seriesHintNew });
    const seriesNode = split ? step('paste-step-series', seriesTitle, [seriesNewHint, seriesSet, seriesHint]) : null;
    return { node, update, seriesNode, chosen, boxes, seriesParts: [seriesNewHint, seriesSet, seriesHint] };
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
  let newTheme = null;
  let outlineRows = null;   // 新規作成で受け取った構成案（[{heading, point}]）。次の返事（1〜6 枚目）で教材を開くときに outline.md にする
  let batchNow = null;      // 構成案の続きの挿入（{rows, from, to}）   // 新規作成の ② で選んだテーマ（返事の教材の <html data-theme> にも付ける）
  let insertAfter = null;   // 挿入：この番号（0 から）のスライドの後ろ。null なら最後
  let newChoice = null;     // 新規作成：選んだ場面・分野・外した言いたいこと（開くときに egatari.json の studio.newDeck へ）
  const canReplace = () => !!(S.ws && S.deckFile && !(S.portable && (S.portable.readOnly || S.portable.tierAOnly)));
  // mode：'new'（新規作成）| 'insert'（スライドの挿入。opts.after）| 'replace'（修正。opts.results：品質チェックの結果があれば）。
  // 取り込み方は入口が決める（③ に選ぶ欄はない）。opts.focusPaste：③ から始める（修正依頼をもう写したとき）。戻り値：取り込んだか
  async function aiDialog(mode, opts = {}) {
    if (mode !== 'new' && !canReplace()) { toast(T.readOnlyNoEdit, true); return false; }
    held = null;
    const titles = opts.batch ? X.steps.batch : X.steps[mode];
    outlineRows = null; batchNow = null; newChoice = null;
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
      // ① 場面（大分類・小分類）→ ② お使いの AI・分野（無料版だけ）・言いたいこと（折りたたみ）→ ③ デザイン（テーマ）→ ④ 頼みたいこと → ⑤ コピー → ⑥ 貼り付け
      const req = requestStep(titles[0]);
      // 選択肢は見せる名前（標準・ビジネス・国語と、自分のテーマのフォルダのテーマ）。最後の「ほかのテーマを読み込む…」でテーマのフォルダを選ぶ
      const sel = el('select', { id: 'paste-theme' });
      const LOAD = '\u0000load';
      const fill = async () => {
        const opts = app.themeOptions ? await app.themeOptions() : (app.themes || ['default']).map((t) => ({ value: t, label: t }));
        sel.replaceChildren(...opts.map((o) => el('option', { value: o.value, text: o.label, ...(o.user ? { 'data-user': '' } : {}) })),
          ...(app.loadOtherTheme ? [el('option', { value: LOAD, text: X.themeLoad })] : []));
        const vals = opts.map((o) => o.value);
        sel.value = vals.includes(newTheme) ? newTheme : vals.includes('default') ? 'default' : vals[0];
        newTheme = sel.value;
      };
      await fill();
      // 頼みたいこと（＋テーマの行）・内容・（9 枚から）構成案だけを返す、の順に最後へ
      const longN = () => { const n = req.count(); return n && n > OUTLINE_OVER ? n : null; };
      // subjects は分野の印（有料版でも印は残す：無料版に戻したときの選び方。指示に入る系列は kit/core/new-deck.mjs の seriesForChoice）
      const choiceNow = () => ({ plan: draft.plan, category: draft.category, subcategory: draft.subcategory, purposesOff: draft.purposesOff,
        subjects: pack ? SUBJECTS.filter((x) => pack.boxes.some((b) => b.checked && b.value === x.series)).map((x) => x.id) : [] });
      // egatari.json に残すのは、最後に写したときの選び方（写した後に変えたものは、AI に送っていない）。写していなければ今の選び方
      let copiedChoice = null;
      newChoice = () => copiedChoice || choiceNow();
      const reqWithTheme = { request: () => {
        let t = req.request().replace(/\n*$/, '\n') + X.themeLine(sel.value) + '\n';
        const cr = choiceRequest(choiceNow(), PURPOSES, LANG);
        if (cr) t += cr + '\n';
        const c = req.content();
        if (c) t += '\n' + X.contentHead + '\n\n' + c + '\n';
        if (longN()) t += '\n' + outlineRequest({ n: longN(), lang: LANG });
        return t;
      }, missing: () => req.missing(), exclude: () => componentsOff(draft.purposesOff, PURPOSES), off: () => draft.purposesOff, allSeries: () => draft.plan === 'paid',
      onCopy: () => { copiedChoice = choiceNow(); } };
      // 長い教材（9 枚から）は 2 回に分けて作ると知らせる。大きさの目安と警告は出さない（お使いの AI の問いが引き受ける）
      const onSize = () => { const n = longN(); req.phase.hidden = !n; req.phase.textContent = n ? X.phase(n) : ''; };
      let pack = null;
      // 大分類がビジネスなら、ビジネスのパーツを入れておく（ほかの大分類に替えたら、自分で入れたのでなければ外す。kit/core/new-deck.mjs の defaultSubjects）
      let autoSubjects = [];
      const onKind = () => {
        if (!pack) return;
        const want = defaultSubjects(draft.category);
        for (const b of pack.boxes) {
          const id = (SUBJECTS.find((x) => x.series === b.value) || {}).id;
          if (want.includes(id) && !b.checked) { b.checked = true; autoSubjects.push(id); }
          else if (!want.includes(id) && autoSubjects.includes(id) && b.checked) { b.checked = false; autoSubjects = autoSubjects.filter((x) => x !== id); }
        }
        pack.update();
      };
      const kindNode = kindStep(titles[5], onKind);
      pack = await packStep(copyMsg, reqWithTheme, { title: titles[1], split: true, seriesTitle: titles[3], onSize });
      for (const b of pack.boxes) b.addEventListener('change', () => { autoSubjects = autoSubjects.filter((x) => (SUBJECTS.find((y) => y.id === x) || {}).series !== b.value); });
      // お使いの AI：無料版（既定。選んだ分野だけの軽い指示）か有料版（すべての系列）。有料版では分野の選び方を隠す
      const planRadio = (p) => el('label', {}, [el('input', { type: 'radio', name: 'paste-plan', value: p, id: 'paste-plan-' + p }), el('span', { text: X.plan[p] })]);
      const planSet = el('fieldset', { id: 'paste-plan', cls: 'paste-kind paste-plan', 'aria-describedby': 'paste-plan-hint' }, [el('legend', { text: X.planLegend }), ...AI_PLANS.map(planRadio)]);
      const planHint = el('p', { id: 'paste-plan-hint', cls: 'hint', text: X.planHint });
      const paidNote = el('p', { id: 'paste-series-paid', cls: 'hint', role: 'status', hidden: '', text: X.seriesPaid });
      const showPlan = () => {
        for (const r of planSet.querySelectorAll('input')) r.checked = r.value === draft.plan;
        for (const x of pack.seriesParts) x.hidden = draft.plan === 'paid';
        paidNote.hidden = draft.plan !== 'paid';
      };
      planSet.addEventListener('change', (e) => { if (e.target.name === 'paste-plan') { draft.plan = e.target.value === 'paid' ? 'paid' : 'free'; showPlan(); pack.update(); } });
      pack.seriesNode.querySelector('h3').after(planSet, planHint);
      pack.seriesNode.append(paidNote, partsTiles(pack.update));
      showPlan();
      onKind();
      sel.addEventListener('change', async () => {
        if (sel.value === LOAD) { sel.value = newTheme; if (await app.loadOtherTheme()) await fill(); pack.update(); return; }
        newTheme = sel.value; pack.update();
      });
      req.node.addEventListener('input', pack.update);
      const themeNode = step('paste-step-theme', titles[4], [el('p', { cls: 'hint', text: X.themeHint }),
        el('div', { cls: 'paste-field' }, [el('label', { for: 'paste-theme', text: X.themeLabel }), sel])]);
      pre = [kindNode, pack.seriesNode, themeNode];
      s1 = req.node; s2 = pack.node;
    } else if (mode === 'insert') {
      const { deck, narration } = await readDeck();
      const slides = sectionsOf(deck);
      const n = slides.length;
      insertAfter = opts.after === null || opts.after === undefined || opts.after >= n - 1 ? null : Math.max(-1, opts.after);
      const at = insertAfter === null ? n - 1 : insertAfter;
      const head = (i) => ((S.slides || [])[i] && (S.slides[i].heading || S.slides[i].key)) || '';
      const where = insertAfter === null && opts.after !== n - 1 ? X.insertWhereLast(n, head(n - 1)) : X.insertWhere(at + 1, head(at));
      const B = opts.batch || null;   // 構成案の続き（{rows, from, to}）：範囲は決まっているので、枚数と足したいことの欄は出さない
      const ins = B ? { node: step('paste-step1', X.steps.batch[0], [el('p', { id: 'paste-batch-where', cls: 'paste-where', text: X.batchWhere(B.from, B.to, B.rows.length, remaining(B)) })]), count: () => B.to - B.from + 1, wish: () => '' }
        : insertStep(titles[0], where);
      const req = { request: () => (B ? batchRequest({ rows: B.rows, from: B.from, to: B.to, deck, narration, lang: LANG })
        : insertRequest({ deck, narration, after: at, n: ins.count(), wish: ins.wish(), lang: LANG })), missing: () => null };
      batchNow = B;
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
    // 構成案を受け取ったら（新規作成）：その一覧と、1〜6 枚目を頼む文のコピーを ⑤ の前に出す
    let outlineNode = null;
    const showOutline = (rows) => {
      const b = nextBatch({ rows, next: 1 });
      const msgO = el('p', { id: 'paste-outline-copied', cls: 'hint', role: 'status', hidden: '' });
      outlineNode = step('paste-step-outline', X.outlineStep, [
        el('p', { id: 'paste-outline-got', cls: 'note', role: 'status', text: X.outlineGot(rows.length) }),
        el('ol', { id: 'paste-outline-list', cls: 'paste-outline' }, rows.map((r) => el('li', { text: r.point ? `${r.heading} — ${r.point}` : r.heading }))),
        el('div', { cls: 'paste-guide' }, [el('button', { type: 'button', id: 'paste-outline-copy', cls: 'pri', text: X.outlineCopy(b.from, b.to), onclick: async () => {
          const t = batchRequest({ rows, from: b.from, to: b.to, first: true, lang: LANG });
          const ok = await copyText(t); msgO.hidden = false; msgO.textContent = ok ? X.outlineCopied(kb(t)) : X.fixCopyFailed;
        } })]),
        el('p', { cls: 'hint', text: X.outlineHint(b.from, b.to) }), msgO]);
    };
    for (;;) {
      const buttons = [{ id: 'cancel', label: T.cancel }];
      if (held && (mode === 'replace' || (mode === 'insert' && held.kind === 'deck'))) buttons.push({ id: 'only', label: X.only });
      buttons.push({ id: 'import', label: X.go[mode], pri: true });
      // 新規作成は画面いっぱいのページ（ステップを縦に並べる）。「← 戻る」と Esc で閉じる
      const back = mode === 'new' ? el('button', { type: 'button', id: 'page-back', cls: 'ghost page-back', text: X.back, onclick: () => { const d = document.getElementById('dlg'); if (d.open) d.close('cancel'); } }) : null;
      const shown = ask({ title: opts.batch ? X.batchTitle : X.title[mode], kind: mode === 'new' ? 'paste page' : 'paste', body: [back, el('p', { id: 'ai-howto', cls: 'paste-howto', text: mode === 'replace' ? X.howToFix : mode === 'new' ? X.howToNew : X.howTo }), ...pre, s1, s2, outlineNode, s3], buttons });
      if (focusArea) setTimeout(() => { area.focus(); s3.scrollIntoView({ block: 'nearest' }); }, 0);
      const v = await shown;
      if (v !== 'import' && v !== 'only') { held = null; return false; }
      const res = v === 'only' ? await importHeld(mode) : await importText(area.value, mode);
      focusArea = true;
      if (res === null) { held = null; return true; }
      if (res && typeof res === 'object' && res.outline) { outlineRows = res.outline; showOutline(res.outline); area.value = ''; msg.hidden = true; continue; }
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
    // 新規作成：構成案（```outline）が届いた（2 回に分けて作る長い教材の 1 回目）
    if (mode === 'new' && /^\s*(`{3,}|~{3,})\s*outline\b/im.test(String(text))) {
      const o = parseOutline(text);
      if (o.error) { const f = X.outlineErr[o.error.code]; return typeof f === 'function' ? f(o.error) : (f || o.error.code); }
      return { outline: o.rows };
    }
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
    // 構成案の続き：次に頼む番号を進める（egatari.json の studio.outline）。組み直して知らせ（残りの枚数）を出し直す
    if (!none && count && batchNow) {
      const B = batchNow, next = B.from + count;
      try { const CF = FORMAT.CONFIG_FILE; const t = await S.ws.readText(CF, { max: READ_LIMITS.json }); await S.ws.writeText(CF, withOutline(t, { rows: B.rows, next })); await app.rebuild('save'); } catch (e) { toast(String((e && e.message) || e), true); }
      toast(X.batchDone(remaining({ rows: B.rows, next })));
    }
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
    // シード値（format spec §8.4）：教材を作るこのときに 1 回だけ、原稿の根の要素（<html>）に書く
    ids.deck = freshSeed(ids.deck, newSeed());   // 返事が data-egatari-seed を書いていても新しい値にする
    const files = { 'deck.html': ids.deck, 'narration.md': ids.narration || '' };
    // 構成案から作った最初の分：構成案と、次に頼む番号を設定のファイル（egatari.json の studio.outline）に（kit/core/llm-outline.mjs）。
    // 新規作成で選んだもの（場面・分野・外した言いたいこと）を studio.newDeck に。どちらも updateConfig を通る（kit/core/config-file.mjs）
    let cfg = null;
    if (outlineRows) cfg = withOutline(cfg, { rows: outlineRows, next: 1 + sectionsOf(ids.deck).length });
    if (newChoice) cfg = withChoice(cfg, newChoice());
    if (cfg) files[FORMAT.CONFIG_FILE] = cfg;
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
    // シード値は保存で必ず残す（§8.4）：直した返事が <html> ごと書き直してシード値を落としても、前のものに戻す
    const ids = withIds(keepSeed(cur, deck), narration);
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
  // 構成案の続きを頼む（main.js の知らせのボタン）：outline.md の次の番号から BATCH 枚。最後のスライドの後ろに
  async function nextBatchDialog() {
    let o = null;
    try { o = outlineOf(await S.ws.readText(FORMAT.CONFIG_FILE, { max: READ_LIMITS.json })); } catch { o = null; }
    const b = o && nextBatch(o);
    if (!b) return false;
    return aiDialog('insert', { after: (S.slides || []).length - 1, batch: { rows: o.rows, from: b.from, to: b.to, next: o.next } });
  }
  return { aiDialog, reviseButton, revise: () => run(aiDialog('replace')), nextBatch: () => run(nextBatchDialog()), newWithAi: () => run(aiDialog('new')), insertWithAi: (after) => run(aiDialog('insert', { after })), importText, extraChecks, fixButton, fixRequest, texts: X };
}
