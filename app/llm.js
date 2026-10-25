// チャットの AI との行き来（docs/authoring-with-llms.md。画面の流れと言葉は handoff/new-deck-flow-2026-10-25.md）。AI は、ふつうのコマンドの中の 1 つのやり方として出す：
//   「新規作成…」（mode 'new'）：答えると考えが 1 つ進む問いを、考える順に並べる。答えた問いは 1 行にたたみ（［変更］で開き直す）、次の問いを開く
//     ① どんな場面で使いますか（大分類・小分類。どちらも答える。あてはまらなければ「その他」「この中にない」。kit/core/new-deck.mjs）→
//     ② 何について、だれに向けて作りますか（タイトルは必須。だれ向け・長さ・内容は「AI に任せる」か書く。詳しく：言語・話す人・そのほかの希望。
//        「チャットの AI と、もう内容を話し合ってある」の切り替えで、タイトルのほかを隠す。kit/core/llm-request.mjs の記入欄）→
//     ③ どんな見た目にしますか（テーマ）→ ④ チャットの AI に指示を送ります（無料のプランか有料のプランか → 無料なら内容の分野（② から推した印）→
//        折りたたみ「AI に使わせない図」（kit/core/purposes.mjs）→［指示をコピー］。kit/core/llm-pack.mjs）→
//     ⑤ AI の出力を貼り付けます：欄 2 つ（スライド＝deck.html・台本＝narration.md。どちらに出力の全体を貼っても分け、違う欄に貼ったものは移す。kit/core/llm-import.mjs の pastePart）→
//        ［作成］：スライドに id を付け（kit/core/slide-ids.mjs）、メモリの上の原稿を Worker で 1 ファイル（.ega.html）にして（app/build-worker.js の exportHtml）、
//        ほかの 1 ファイルと同じ道（openPortable：中身からコードを探し、あれば動かす前に確かめる）で開き、品質チェックをかける。
//        作るときに 1 回だけ、原稿の <html> にシード値（data-egatari-seed。format spec §8.4）を書き、写したときの選び方（プラン・場面・分野・使わない図）を
//        egatari.json の studio.newDeck に残す（「その他」「この中にない」は subcategory: null）。「修正…」で入れ替える原稿がシード値を失っても、前のシード値に戻す（keepSeed）。
//        長さが 9 枚から（分は 1 分 ≒ 1 枚）は 2 回に分けて頼む：⑤ がはじめに構成案の欄になり、受け取ったら 1〜6 枚目を頼む指示と 2 つの欄（kit/core/llm-outline.mjs）
//   「スライドの挿入…」→「チャットの AI に書いてもらう」（mode 'insert'）：① 足すスライド → ② 短い指示（見出しの一覧と挿入する場所の前のスライドだけ。
//     kit/core/llm-insert.mjs。別のチャットなら指示の全体も付けられる）→ ③ ⑤ と同じ 2 つの欄 →［挿入］：選んだスライドの後ろ（選んでいなければ最後）に入れ、
//     スライド一覧の「足す」と同じに id を付ける（app/slides-panel.js の apply：控え・元に戻す・組み直し・品質チェック）
//   「修正…」（mode 'replace'）：① 直してほしいこと → ② 修正依頼（品質チェックの指摘・組み立ての知らせ・その規格の文章・今の原稿（kit/core/llm-fix.mjs）と、
//     ① と開いているメモ（comments.json））→ ③ 同じ 2 つの欄 →［置き換える］：今の docId・設定・音声を残して原稿だけを入れ替える（直したスライドだけの出力は id で戻す。片方だけでもよい）
//   品質チェックの板の「AI への修正依頼をコピー」も、出力は「修正…」の ③ に貼る
// 貼り付けた文字列は信頼しない：このページでは解析と文字列の書き換えだけをし、組み立ては Worker で、表示は sandbox のプレビューで
import { SERIES, membersOfSeries, seriesForDeck, packSize, packKb, kbOf, seriesPart, PURPOSES, loadedParts } from '../kit/core/llm-pack.mjs';
import { CATEGORIES, SUBJECTS, AI_PLANS, DEFAULT_PLAN, FREE_SUBJECT_MAX, freeSubjects, defaultSubjects, guessSubjects, choiceRequest, withChoice, choiceOf, newSeed, freshSeed, keepSeed } from '../kit/core/new-deck.mjs';
import { componentsOff } from '../kit/core/purposes.mjs';
import { partLabel, partIcon, partOrder, standardParts } from '../kit/core/part-labels.mjs';
import { pastePart, isPatch, mergeSlides, mergeNarration, sectionsOf, narrSections } from '../kit/core/llm-import.mjs';
import { filledRequest, packWithRequest } from '../kit/core/llm-request.mjs';
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


// 画面の言葉（handoff/new-deck-flow-2026-10-25.md の文言の表。表にないものは handoff/ux-wording-principles.md の決まりで決めた）
const CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥'];
const TX = {
  ja: {
    method: 'チャットの AI に書いてもらう', methodFix: 'チャットの AI に直してもらう',
    title: { new: '新規作成', insert: 'スライドの挿入', replace: '修正' },
    howTo: '足したいスライドを書くと、チャットの AI に送る指示ができます。AI の出力をここに貼り付けると、スライドを挿入します。',
    howToNew: '4 つの問いに答えると、チャットの AI（ChatGPT・Gemini・Claude など）に送る指示ができます。AI の出力をここに貼り付けると、スライドができます。',
    howToFix: '直してほしいことを書くと、チャットの AI に送る修正依頼ができます。AI の出力をここに貼り付けると、スライドを置き換えます。',
    answered: (q, a) => `${q}：${a}`, change: '変更', next: '次へ', cancel: 'キャンセル',
    // 1 つだけ開く流れの、答えた段の 1 行（④ 指示・挿入と修正の ① ②）
    sendQ: '指示', planShort: { free: '無料のプラン', paid: '有料のプラン' }, copiedShort: 'コピーしました', listSep: '・',
    insertAnswer: (n, wish) => `${n} 枚${wish ? '・' + wish : ''}`, wishNone: 'なし',
    back: '← 戻る',
    steps: {
      new: ['① どんな場面で使いますか', '② 何について、だれに向けて作りますか', '③ どんな見た目にしますか', '④ チャットの AI に指示を送ります', '⑤ AI の出力を貼り付けます'],
      outline: '⑤ AI の構成案を貼り付けます',
      insert: ['① どんなスライドを足しますか', '② チャットの AI に指示を送ります', '③ AI の出力を貼り付けます'],
      replace: ['① どこを直してほしいですか', '② チャットの AI に修正依頼を送ります', '③ AI の出力を貼り付けます'],
      batch: ['① 頼む範囲', '② チャットの AI に指示を送ります', '③ AI の出力を貼り付けます'],
    },
    // ① 場面
    kindHint: '場面に合った組み立て（授業なら導入・展開・まとめ）を AI に伝えます。あてはまるものがなければ「その他」を選びます',
    catLegend: '使う場面', subLegend: 'もう少し詳しく言うと', subNoneFit: 'この中にない',
    structure: (st, sh) => `組み立て：${st}。見せ方：${sh}`,
    needKind: '① の「どんな場面で使いますか」に答えてください',
    // ② 内容
    step1Hint: '書いたことは、AI への指示の最後に入ります',
    titleLabel: 'タイトル（表紙に出ます）', titleQ: 'タイトル',
    discussedShort: '内容はチャットの AI に渡してある',
    audienceLegend: 'だれ向け', audienceAi: 'AI に任せる（① の場面から考えます）', audienceWrite: '書く', audienceLabel: 'だれ向けか',
    lengthLegend: '長さ', lengthAi: 'AI に任せる（5〜8 枚くらいにします）', lengthSet: '指定する', lengthNLabel: '長さの数', lengthUnitLabel: '長さの単位',
    unit: { slides: '枚', min: '分' }, lengthReq: (n, u) => (u === 'min' ? `${n} 分` : `${n} 枚`),
    contentLegend: '内容', contentAi: 'AI に任せる（タイトルだけで考えます）', contentGive: 'ここに書く・貼る（授業のメモや教科書の文をそのまま貼れます）', contentGiven: 'チャットの AI に渡してある（PDF などの資料を添付した、または内容を話し合った）',
    contentGivenNote: '指示は、その資料を渡したチャットに貼り付けてください', contentLabel: '内容',
    contentHead: '## 内容（要点・メモ・元の資料）',
    more: (l, s, w) => `詳しく：${l}・${s}${w ? '・そのほかの希望あり' : ''}`,
    langLegend: '言語', langOpt: { ja: '日本語', en: 'English', other: 'その他' }, langOtherLabel: '言語の名前', langOtherPh: '例：中国語',
    langReq: { ja: '日本語', en: '英語' },
    speakersLegend: '話す人', speakers: { 1: '1 人で説明する', 2: '2 人（説明する人と、質問する人）' }, speakersShort: { 1: '1 人で説明', 2: '2 人で説明と質問' },
    speakersReq: { 1: '1 人', 2: '2 人（Expert と Novice の掛け合い）' },
    wishesLabel: 'そのほかの希望（なくてもよい）', wishesNote: '話す人は 2 人まで',
    needTopic: '② の「タイトル」を書いてください',
    ph: {
      teaching: { title: '例：てこのはたらき', audience: '例：小学 6 年生', content: '例：\n・てこには支点・力点・作用点がある\n・支点から力点が遠いほど、小さな力で持ち上がる\n・身の回りのてこ（はさみ、くぎ抜き）', wishes: '例：小学生にわかる言葉で、問いかけを多めに' },
      research: { title: '例：衛星画像による水田の水位の推定', audience: '例：学会の参加者（分野外の人もいる）', content: '例：論文の要旨やまとめを貼る', wishes: '例：結論を先に' },
      business: { title: '例：10 月の営業報告', audience: '例：部長会議の出席者', content: '例：数字と、言いたい結論', wishes: '例：部長向けに丁寧な言葉で' },
      guides: { title: '例：ごみの出し方', audience: '例：新しく越してきた人', content: '例：曜日と分け方の決まりの文', wishes: '例：短い文で' },
      other: { title: '例：町内会の夏祭りのお知らせ', audience: '例：町内の家族', content: '例：日時・場所・持ち物', wishes: '例：明るい調子で' },
    },
    // ③ 見た目
    themeHint: 'スライドの色と書体です。あとで「テーマを変更…」で変えられます', themeLabel: 'テーマ', themeLoad: 'テーマを読み込む…', themeMine: '自分のテーマ',
    themeLine: (t) => `- テーマ：${t}（<html data-theme="${t}">）`,
    // ④ AI に送る
    planLegend: 'お使いのチャットの AI は、無料のプランですか、有料のプランですか',
    plan: { free: '無料のプラン（わからなければこちら）', paid: '有料のプラン' },
    planHint: '無料のプランは長い指示を読み切れないことがあるので、指示を短くします',
    seriesLegend: 'スライドに出てくるものはありますか（内容の分野）',
    // 標準パーツの例は FREE_CORE の名前から作る（kit/core/part-labels.mjs の standardParts）
    seriesHintNew: (ex) => `選んだものの図の作り方を指示に入れます。選ばなければ、標準パーツ（${ex.join('・')}など）だけです`,
    seriesPaid: '有料のプランでは全部入ります',
    seriesGuess: (name) => `② のタイトルと内容から${name}に印を付けました`,
    seriesGuessKind: (name) => `① の場面から${name}に印を付けました`,
    seriesMax: '無料のプランでは 2 つまで選べます',
    seriesStored: (a, b) => `無料のプランでは 2 つまでなので、「${a}」と「${b}」を使います。替えるときは印を外してください`,
    seriesHint: (name) => `数式・グラフ・データの図を使うなら「${name}」を選ぶ`,
    purposesFold: '使える図を見る・外す（ふつうは開かなくて大丈夫）',
    partsCount: (n, off) => `使える図：${n} 種類（外したもの ${off}）`,
    partsLegend: 'この指示で使える図', partOff: '外した',
    purposesHint: '今は全部使えます。押した図は、AI が使いません',
    purposesSum: (on, n) => `言いたいこと：${n} 個のうち ${on} 個を使う`,
    purposesLegend: '言いたいこと', materialsLegend: '素材（いつも使える）', materials: { table: '表', image: '画像', math: '数式', shape: '図形' },
    purposeOn: '使う', purposeOff: '使わない',
    packTotal: (kb) => `指示の大きさ：${kb} KB`, plusKb: (kb) => `+${kb} KB`,
    copyGuide: '指示をコピー',
    copied: (kb) => `コピーしました（${kb} KB）。チャットの AI のタブに貼り付けて送ってください。長いので、貼るとファイルの添付の形になることがありますが、そのまま送ってかまいません。AI が書き終えたら ⑤ へ`,
    phase: (n) => `${n} 枚なので、2 回に分けて頼みます。まず構成案（見出しの一覧）を頼み、次に ${BATCH} 枚ずつ頼みます`,
    outlineCopied: (kb) => `コピーしました（${kb} KB）。チャットの AI に貼り付けて送ってください。構成案が出たら ⑤ へ`,
    // ⑤ 貼り付け（挿入・修正の ③ も同じ）
    step3Hint: 'AI の出力には、灰色の枠（コードブロック）が 2 つあります。スライド（deck.html）と台本（narration.md）です。それぞれ枠の右上のコピーのボタンで写して、下の欄に貼り付けます。出力をまとめてコピーしたときは、どちらかの欄に貼れば 2 つに分けて入れます',
    pasteDeck: 'スライド（deck.html）', pasteNarr: '台本（narration.md）',
    phDeck: 'deck.html のコードブロックを貼り付け', phNarr: 'narration.md のコードブロックを貼り付け',
    stEmpty: 'まだ貼っていません', stDeck: (n) => `✓ スライド ${n} 枚`, stNarr: (n) => `✓ 台本 ${n} 節`,
    split: '出力の全体だったので、スライドと台本に分けました',
    moved: { deck: '台本の欄に入っていたスライドを、スライドの欄へ移しました', narr: 'スライドの欄に入っていた台本を、台本の欄へ移しました' },
    noNarr: { new: '台本なしで作成します（台本はあとで書けます）', insert: '台本なしで挿入します（台本はあとで書けます）', replace: '台本は今のままにします' },
    keepDeck: 'スライドは今のままにします',
    extracted: { deck: '出力からスライドのコードブロックを取り出しました', narr: '出力から台本のコードブロックを取り出しました' },
    // 押せない［作成］［挿入］［置き換える］の横：欠けているもののうち最初の 1 つ（n は問いの番号）
    why: { kind: '① に答えてください', title: '② のタイトルを書いてください', deck: (n) => `${CIRCLED[n]} にスライドを貼り付けてください`, either: (n) => `${CIRCLED[n]} にスライドか台本を貼り付けてください`,
      outline: (n) => `${CIRCLED[n]} に構成案を貼り付けてください`, fix: (n) => `${CIRCLED[n]} の欄の下の知らせを見てください` },
    go: { new: '作成', insert: '挿入', replace: '置き換える' },
    replaceHint: '直したスライドだけが出力されたときは、そのスライドだけを置き換えます',
    untrusted: '貼り付けたものは、開いたファイルと同じに扱います。スクリプトが入っていれば、動かす前に確かめます',
    // 構成案（長い教材）
    outlineLabel: '構成案（outline のコードブロック）', outlinePh: 'outline のコードブロックを貼り付け',
    outlineHint: (a, b) => `構成案（outline のコードブロック）を貼り付けて［次へ］。そのあと ${a}〜${b} 枚目を頼む指示をコピーします。残りは作成の後、上の知らせの「次の ${BATCH} 枚を頼む」から`,
    outlineQ: '構成案', outlineAnswer: (n) => `${n} 枚`,
    outlineGot: (n) => `構成案を受け取りました（${n} 枚）。${BATCH} 枚ずつ作ります`,
    outlineCopy: (a, b) => `${a}〜${b} 枚目を頼む指示をコピー`,
    batchCopied: (kb) => `コピーしました（${kb} KB）。同じチャットに貼り付けて送ってください。AI が書き終えたら、出力を下の欄に貼り付けます`,
    outlineErr: { 'no-outline': 'outline のコードブロックが見つかりません', unclosed: (e) => `${e.line} 行目からの outline のコードブロックが閉じていません。AI に「続きを」と頼んでください`, 'no-table': '構成案の表の行が見つかりません（| 番号 | 見出し | 要点 | の形）', 'empty-heading': (e) => `${e.line} 行目に見出しのない行があります`, 'too-many': (e) => `構成案が ${e.n} 枚あります（60 枚まで）`, 'too-few': '構成案が 2 枚より少ないので、② の長さを短くして 1 回で頼んでください' },
    batchTitle: '構成案の続き', batchWhere: (a, b, n, left) => `構成案の ${a}〜${b} 枚目（全 ${n} 枚。残り ${left} 枚）を、最後のスライドの後ろに入れます`,
    batchDone: (left) => (left ? `構成案：残り ${left} 枚` : '構成案のスライドをすべて作りました'),
    // 挿入
    insertWhere: (n, h) => `挿入する場所：スライド ${n}「${h}」の後ろ`, insertWhereLast: (n, h) => `挿入する場所：最後のスライド（${n}「${h}」）の後ろ`,
    insertCount: '足す枚数', insertWish: '足したいこと（なくてもよい）', insertWishPh: '例：練習問題を 1 つ',
    insertHint: '指示には、今のスライドの見出しの一覧と、挿入する場所の前のスライドだけを入れます（短く済みます）',
    withPack: 'このデッキを作ったのとは別のチャットに送る（指示の全体も付けます）',
    copyInsert: '指示をコピー',
    insertCopied: (kb) => `コピーしました（${kb} KB）。チャットの AI に貼り付けて送ってください。AI が書き終えたら ③ へ`,
    // 修正
    wish: '直してほしいこと（なくてもよい）', wishPh: '例：2 枚目の例を身近なものに替える',
    reviseHint: '修正依頼には、品質チェックの指摘、① に書いたこと、開いているコメント、今のスライドと台本が入ります（長いデッキは指摘のあるスライドだけ）',
    copyRevise: '修正依頼をコピー', reviseNothing: '直すことが見つかりません。① に直してほしいことを書いてください',
    revised: (kb, n, c) => `コピーしました（${kb} KB。指摘 ${n} 件${c ? `・コメント ${c} 件` : ''}）。チャットの AI に貼り付けて送ってください。AI が書き終えたら ③ へ`,
    wishHead: '## 直してほしいこと', notesHead: '## 開いているメモ（コメント）', noteLine: (c) => `- ${c.where}${c.quote ? `「${c.quote}」` : ''}：${c.text}`,
    err: {
      'no-blocks': 'スライドも台本も見つかりません。AI の出力のコードブロックを、枠の右上のコピーのボタンで写して貼り付けてください',
      ambiguous: 'スライドと台本の両方が入っていますが、コードブロックの区切り（```）がないので分けられません。2 つのコードブロックを 1 つずつ写して、それぞれの欄に貼り付けてください',
      'cut-deck': 'スライドが途中で切れています（</html> で終わっていません）。コードブロックの右上のコピーのボタンで写し直してください',
      'no-deck': 'スライドの欄に deck.html がありません',
      'no-slides': 'deck.html にスライド（<section class="slide">）がありません',
      unclosed: (e) => `${e.line} 行目からのコードブロックが閉じていません。AI の出力が途中で切れたようです。AI に「続きを」と頼んでください`,
      empty: 'スライドの欄が空です',
      'no-match': '直したスライドが今のデッキに見つかりません（id が合いません）',
      'no-insert': '出力に足すスライド（<section class="slide">）がありません',
    },
    warn: {
      several: (w) => `${w.kind === 'deck' ? 'deck.html' : 'narration.md'} のコードブロックが ${w.n} 個あったので、最後のものを使いました`,
      ignored: (w) => `スライドでも台本でもないコードブロック ${w.n} 個は使いませんでした`,
      unfenced: 'コードブロックの区切りがなかったので、<!DOCTYPE html> から </html> までをスライド、その後ろを台本として取り出しました',
      autoclosed: (w) => `${w.line} 行目からのコードブロックが閉じていなかったので、次のコードブロックの手前で閉じました`,
      unclosedAccepted: () => '台本のコードブロックに閉じる行（```）がありませんでしたが、台本は最後まであるので受け取りました',
    },
    building: { new: '作成しています…', insert: '挿入しています…', replace: '置き換えています…' }, buildFailed: 'スライドを組み立てられませんでした',
    imported: (n) => `作成しました：スライド ${n} 枚`,
    replaced: (n) => `置き換えました（${n}）`, replacedSlides: (ids) => `スライド ${ids.length} 枚を置き換えました`, replacedNarr: (n) => `台本を置き換えました（${n} 節）`,
    inserted: (n, at) => `スライド ${n} 枚を ${at} 枚目に挿入しました`, undoInsert: (n) => `スライド ${n} 枚の挿入`,
    idProblems: 'id を付けられないスライドがあります（品質チェックの結果を見てください）',
    unsavedNote: '保存するまでファイルには書いていません',
    fix: 'AI への修正依頼をコピー', fixTitle: 'AI への修正依頼',
    fixLead: (n, partial) => `指摘 ${n} 件と、その決まり、${partial ? '問題のあるスライド' : '今のスライドと台本'} をコピーしました。同じチャットに貼り付けて送り、AI の出力は「修正…」の ③ に貼り付けます`,
    fixCopyFailed: '自動ではコピーできませんでした。下の文字を選んでコピーしてください',
    copyCutOff: 'AI に送り直しを頼む文をコピー', cutOffCopied: 'コピーしました。チャットに貼り付けて送り、AI の出力をここに貼り付けてください',
    fixNone: '直す問題はありません', pasteReply: 'AI の出力を貼り付ける…', close: '閉じる',
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
    title: { new: 'New', insert: 'Insert slides', replace: 'Revise' },
    howTo: 'Describe the slides to add to make instructions for a chat AI. Paste the AI’s output here and the slides are inserted.',
    howToNew: 'Answer four questions to make instructions for a chat AI (ChatGPT, Gemini, Claude, …). Paste the AI’s output here and your slides are made.',
    howToFix: 'Write what to change to make a fix request for a chat AI. Paste the AI’s output here and the slides are replaced.',
    answered: (q, a) => `${q}: ${a}`, change: 'Change', next: 'Next', cancel: 'Cancel',
    sendQ: 'Instructions', planShort: { free: 'Free plan', paid: 'Paid plan' }, copiedShort: 'copied', listSep: ' · ',
    insertAnswer: (n, wish) => `${n} slide${n === 1 ? '' : 's'}${wish ? ' · ' + wish : ''}`, wishNone: 'none',
    back: '← Back',
    steps: {
      new: ['1. Where will you use it?', '2. What is it about, and who is it for?', '3. How should it look?', '4. Send the instructions to your chat AI', '5. Paste the AI’s output'],
      outline: '5. Paste the AI’s outline',
      insert: ['1. What slides do you want to add?', '2. Send the instructions to your chat AI', '3. Paste the AI’s output'],
      replace: ['1. What should be changed?', '2. Send the fix request to your chat AI', '3. Paste the AI’s output'],
      batch: ['1. The range to ask for', '2. Send the instructions to your chat AI', '3. Paste the AI’s output'],
    },
    kindHint: 'Tells the AI the structure that suits it (for a lesson: introduction, development, summary). If none fits, choose Other.',
    catLegend: 'Setting', subLegend: 'More precisely', subNoneFit: 'None of these',
    structure: (st, sh) => `Structure: ${st}. Presentation: ${sh}`,
    needKind: 'Answer “Where will you use it?” in step 1.',
    step1Hint: 'What you write goes at the end of the instructions.',
    titleLabel: 'Title (shown on the cover)', titleQ: 'Title',
    discussedShort: 'content already given to the chat AI',
    audienceLegend: 'Audience', audienceAi: 'Leave it to the AI (it works from your answer to step 1)', audienceWrite: 'Write it', audienceLabel: 'Who it is for',
    lengthLegend: 'Length', lengthAi: 'Leave it to the AI (about 5–8 slides)', lengthSet: 'Set it', lengthNLabel: 'Length', lengthUnitLabel: 'Unit',
    unit: { slides: 'slides', min: 'minutes' }, lengthReq: (n, u) => (u === 'min' ? `${n} minutes` : `${n} slides`),
    contentLegend: 'Content', contentAi: 'Leave it to the AI (from the title alone)', contentGive: 'Write or paste it here (your notes or source text as it is)', contentGiven: 'Already given to the chat AI (you attached a PDF or other material, or discussed it)',
    contentGivenNote: 'Paste the instructions into the chat where you gave the material.', contentLabel: 'Content',
    contentHead: '## Content (key points, notes, source material)',
    more: (l, s, w) => `More: ${l}, ${s}${w ? ', other wishes' : ''}`,
    langLegend: 'Language', langOpt: { ja: '日本語', en: 'English', other: 'Other' }, langOtherLabel: 'Which language', langOtherPh: 'e.g. French',
    langReq: { ja: 'Japanese', en: 'English' },
    speakersLegend: 'Speakers', speakers: { 1: 'One person explains', 2: 'Two (one explains, one asks)' }, speakersShort: { 1: 'one speaker', 2: 'two speakers' },
    speakersReq: { 1: 'one narrator', 2: 'two (an Expert and Novice dialogue)' },
    wishesLabel: 'Other wishes (optional)', wishesNote: 'At most two speakers',
    needTopic: 'Write the title in step 2.',
    ph: {
      teaching: { title: 'e.g. How levers work', audience: 'e.g. Year 6 pupils', content: 'e.g.\n• A lever has a fulcrum, an effort and a load\n• The farther the effort is from the fulcrum, the less force it takes\n• Levers around us (scissors, a claw hammer)', wishes: 'e.g. Words a child understands, with plenty of questions' },
      research: { title: 'e.g. Estimating paddy water levels from satellite images', audience: 'e.g. Conference attendees (some from other fields)', content: 'e.g. Paste the abstract or summary of your paper', wishes: 'e.g. Conclusion first' },
      business: { title: 'e.g. October sales report', audience: 'e.g. Attendees of the managers’ meeting', content: 'e.g. The figures and the conclusion you want to make', wishes: 'e.g. Polite wording for managers' },
      guides: { title: 'e.g. How to put out the rubbish', audience: 'e.g. People who have just moved in', content: 'e.g. The collection days and the sorting rules', wishes: 'e.g. Short sentences' },
      other: { title: 'e.g. Neighbourhood summer festival', audience: 'e.g. Families in the neighbourhood', content: 'e.g. Date, time, place, what to bring', wishes: 'e.g. A cheerful tone' },
    },
    themeHint: 'The colours and fonts of the slides. You can change it later with “Change theme…”.', themeLabel: 'Theme', themeLoad: 'Load theme…', themeMine: 'My themes',
    themeLine: (t) => `- Theme: ${t} (<html data-theme="${t}">)`,
    planLegend: 'Is your chat AI on a free plan or a paid plan?',
    plan: { free: 'Free plan (choose this if unsure)', paid: 'Paid plan' },
    planHint: 'A free plan may not read long instructions to the end, so they are kept short.',
    seriesLegend: 'Will the slides need any of these? (subjects)',
    seriesHintNew: (ex) => `Adds how to draw these to the instructions. With none, only the standard parts (${ex.join(', ')}, …).`,
    seriesPaid: 'The paid plan includes all of them.',
    seriesGuess: (name) => `Ticked ${name} from the title and content in step 2.`,
    seriesGuessKind: (name) => `Ticked ${name} from your answer to step 1.`,
    seriesMax: 'Up to two on the free plan.',
    seriesStored: (a, b) => `Up to two on the free plan, so “${a}” and “${b}” are used. To change this, untick one.`,
    seriesHint: (name) => `Using formulas, graphs or data charts? Choose “${name}”.`,
    purposesFold: 'See or turn off figures (usually not needed)',
    partsCount: (n, off) => `Figures available: ${n} (${off} turned off)`,
    partsLegend: 'Figures these instructions can use', partOff: 'turned off',
    purposesHint: 'All are in use. Press one and the AI will not use it.',
    purposesSum: (on, n) => `Purposes: ${on} of ${n} in use`,
    purposesLegend: 'What it shows', materialsLegend: 'Materials (always available)', materials: { table: 'Table', image: 'Image', math: 'Equation', shape: 'Shape' },
    purposeOn: 'in use', purposeOff: 'not used',
    packTotal: (kb) => `Instructions: ${kb} KB`, plusKb: (kb) => `+${kb} KB`,
    copyGuide: 'Copy the instructions',
    copied: (kb) => `Copied (${kb} KB). Paste it into your chat AI’s tab and send. It is long, so it may turn into an attached file; just send it. When the AI has finished, go to step 5.`,
    phase: (n) => `${n} slides, so you ask in two rounds: first an outline (a list of headings), then ${BATCH} slides at a time.`,
    outlineCopied: (kb) => `Copied (${kb} KB). Paste it into your chat AI and send. When the outline is out, go to step 5.`,
    step3Hint: 'The AI’s output has two grey boxes (code blocks): the slides (deck.html) and the script (narration.md). Copy each with the copy button at its top right and paste it below. If you copied the whole output, paste it into either field and it is split in two.',
    pasteDeck: 'Slides (deck.html)', pasteNarr: 'Script (narration.md)',
    phDeck: 'Paste the deck.html code block', phNarr: 'Paste the narration.md code block',
    stEmpty: 'Not pasted yet', stDeck: (n) => `✓ ${n} slide${n === 1 ? '' : 's'}`, stNarr: (n) => `✓ Script, ${n} section${n === 1 ? '' : 's'}`,
    split: 'That was the whole output; it was split into slides and script.',
    moved: { deck: 'Moved the slides from the script field to the slides field.', narr: 'Moved the script from the slides field to the script field.' },
    noNarr: { new: 'It will be made without a script (you can write one later).', insert: 'They will be inserted without a script (you can write one later).', replace: 'The script stays as it is.' },
    keepDeck: 'The slides stay as they are.',
    extracted: { deck: 'Took the slides code block out of the output.', narr: 'Took the script code block out of the output.' },
    why: { kind: 'Answer step 1', title: 'Write the title in step 2', deck: (n) => `Paste the slides in step ${n}`, either: (n) => `Paste the slides or the script in step ${n}`,
      outline: (n) => `Paste the outline in step ${n}`, fix: (n) => `See the message under the fields in step ${n}` },
    go: { new: 'Create', insert: 'Insert', replace: 'Replace' },
    replaceHint: 'If only the fixed slides are in the output, only those slides are replaced.',
    untrusted: 'Pasted content is treated like an opened file: if it contains scripts, you are asked before they run.',
    outlineLabel: 'Outline (the outline code block)', outlinePh: 'Paste the outline code block',
    outlineHint: (a, b) => `Paste the outline (the outline code block) and press Next. Then copy the instructions for slides ${a}–${b}. Ask for the rest after creating, with “Ask for the next ${BATCH}” in the notice above.`,
    outlineQ: 'Outline', outlineAnswer: (n) => `${n} slides`,
    outlineGot: (n) => `Got the outline (${n} slides). The slides are made ${BATCH} at a time.`,
    outlineCopy: (a, b) => `Copy the instructions for slides ${a}–${b}`,
    batchCopied: (kb) => `Copied (${kb} KB). Paste it into the same chat and send. When the AI has finished, paste its output below.`,
    outlineErr: { 'no-outline': 'No outline code block found.', unclosed: (e) => `The outline code block from line ${e.line} is not closed. Ask the AI to continue.`, 'no-table': 'No outline table rows found (| # | Heading | Point |).', 'empty-heading': (e) => `Line ${e.line} has a row without a heading.`, 'too-many': (e) => `The outline has ${e.n} slides (at most 60).`, 'too-few': 'The outline has fewer than 2 slides; set a shorter length in step 2 and ask in one go.' },
    batchTitle: 'The rest of the outline', batchWhere: (a, b, n, left) => `Slides ${a}–${b} of the outline (${n} in all; ${left} left) go after the last slide`,
    batchDone: (left) => (left ? `Outline: ${left} slides left` : 'All slides of the outline are made'),
    insertWhere: (n, h) => `Insert after slide ${n}, “${h}”`, insertWhereLast: (n, h) => `Insert after the last slide (${n}, “${h}”)`,
    insertCount: 'Number of slides', insertWish: 'What to add (optional)', insertWishPh: 'e.g. one exercise',
    insertHint: 'The instructions include only the list of slide headings and the slide before the new ones, so they stay short.',
    withPack: 'Send to a different chat from the one that made this deck (adds the full instructions)',
    copyInsert: 'Copy the instructions',
    insertCopied: (kb) => `Copied (${kb} KB). Paste it into your chat AI and send. When the AI has finished, go to step 3.`,
    wish: 'What to change (optional)', wishPh: 'e.g. use a more familiar example on slide 2',
    reviseHint: 'The fix request includes the quality check findings, what you wrote in step 1, open comments and the current slides and script (for a long deck, only the slides with findings).',
    copyRevise: 'Copy the fix request', reviseNothing: 'Nothing to fix was found. Write what to change in step 1.',
    revised: (kb, n, c) => `Copied (${kb} KB; ${n} finding(s)${c ? `, ${c} comment(s)` : ''}). Paste it into your chat AI and send. When the AI has finished, go to step 3.`,
    wishHead: '## What I want changed', notesHead: '## Open notes (comments)', noteLine: (c) => `- ${c.where}${c.quote ? ` “${c.quote}”` : ''}: ${c.text}`,
    err: {
      'no-blocks': 'No slides or script found. Copy the code blocks of the AI’s output with the copy button at the top right of each box, and paste them.',
      ambiguous: 'This has both slides and script but no code block lines (```), so they cannot be separated. Copy the two code blocks one at a time into their fields.',
      'cut-deck': 'The slides are cut off (they do not end with </html>). Copy them again with the copy button at the top right of the code block.',
      'no-deck': 'The slides field has no deck.html.',
      'no-slides': 'The deck.html has no slides (<section class="slide">).',
      unclosed: (e) => `The code block from line ${e.line} is not closed: the AI’s output was probably cut off. Ask the AI to continue.`,
      empty: 'The slides field is empty.',
      'no-match': 'The fixed slides are not in the current deck (their ids do not match).',
      'no-insert': 'The output has no slides to add (<section class="slide">).',
    },
    warn: {
      several: (w) => `There were ${w.n} ${w.kind === 'deck' ? 'deck.html' : 'narration.md'} code blocks; the last one was used.`,
      ignored: (w) => `${w.n} code block(s) that are neither slides nor script were not used.`,
      unfenced: 'No code block lines: took <!DOCTYPE html> … </html> as the slides and the rest as the script.',
      autoclosed: (w) => `The code block from line ${w.line} was not closed; it was closed before the next one.`,
      unclosedAccepted: () => 'The script code block has no closing ```, but the script looks complete, so it was accepted.',
    },
    building: { new: 'Creating…', insert: 'Inserting…', replace: 'Replacing…' }, buildFailed: 'Could not build the slides',
    imported: (n) => `Created ${n} slides`,
    replaced: (n) => `Replaced (${n})`, replacedSlides: (ids) => `Replaced ${ids.length} slide(s)`, replacedNarr: (n) => `Replaced the script (${n} section(s))`,
    inserted: (n, at) => `Inserted ${n} slide(s) at position ${at}`, undoInsert: (n) => `inserting ${n} slide(s)`,
    idProblems: 'Some slides could not get an id (see the quality check results).',
    unsavedNote: 'Nothing is written to a file until you save.',
    fix: 'Copy a fix request for your AI', fixTitle: 'Fix request for your AI',
    fixLead: (n, partial) => `Copied ${n} finding(s), their rules and ${partial ? 'the slides with problems' : 'the current slides and script'}. Paste it into the same chat and send, then paste the AI’s output in step 3 of “Revise…”.`,
    fixCopyFailed: 'Could not copy automatically. Select the text below and copy it.',
    copyCutOff: 'Copy a request to resend', cutOffCopied: 'Copied. Paste it into the chat and send, then paste the AI’s output here.',
    fixNone: 'No problems to fix.', pasteReply: 'Paste the AI’s output…', close: 'Close',
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
  // 分野の名前（挿入の分野の一覧）：中の図と分野の名前（kit/core/new-deck.mjs の SUBJECTS の inside・label）
  const seriesName = Object.fromEntries(SUBJECTS.map((x) => [x.series, LANG === 'ja' ? `${x.inside.ja}（${x.label.ja}）` : `${x.inside.en} (${x.label.en})`]));
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
  // 段：見出しは押せるボタン（aria-expanded・aria-controls）、中身は本体（flow が開け閉めする）。after は本体の外（答えの 1 行・コピーの知らせ）
  const step = (id, title, kids, after = []) => {
    const btn = el('button', { type: 'button', id: id + '-btn', cls: 'paste-step-h', 'aria-expanded': 'true', 'aria-controls': id + '-body', text: title });
    const body = el('div', { id: id + '-body', cls: 'paste-step-body' }, kids);
    const node = el('section', { id, cls: 'paste-step', 'aria-labelledby': id + '-h' }, [el('h3', { id: id + '-h' }, [btn]), body, ...after]);
    node.acc = { btn, body };
    return node;
  };
  // 答えた段の 1 行（［変更］で開き直す）。text()：答えの言葉
  const summaryLine = (id, q, text, onChange) => {
    const t = el('span', { cls: 'paste-answer-text' });
    const line = el('p', { id: id + '-answer', cls: 'paste-answered', hidden: '' }, [t, el('button', { type: 'button', id: id.replace('paste-step', 'paste-change'), cls: 'ghost', text: X.change, onclick: () => onChange() })]);
    line.refresh = () => { t.textContent = X.answered(q, text()); };
    return line;
  };
  // 1 つだけ開く流れ（買い物の手続きのように）：いまの段だけ開き、答えた段は 1 行（［変更］）、まだの段は見出しだけ（薄く）。5 つ（3 つ）の見出しはいつも見える。
  // 見出しはボタン（aria-expanded）、いまの段は aria-current="step"。見出しを押すと、開いたことのある段（と can() の段）を開く
  //   items：[{node（step() の section）, q?（question() の Q：答えた 1 行と本体を Q が切り替える）, summary?（summaryLine）, can?(), focus?()}]
  //   open(i, {focus})：その段だけ開き、見えるところへ動かし、最初の操作に印。done(i)：答えた（1 行にたたむ）
  function flow(items, { onOpen } = {}) {
    let cur = -1;
    const seen = items.map(() => false), done = items.map(() => false);
    const canOpen = (i) => seen[i] || !!(items[i].can && items[i].can());
    const render = () => items.forEach((it, i) => {
      const { btn, body } = it.node.acc;
      const open = i === cur, folded = done[i] && !open;
      if (it.q) { body.hidden = !(open || folded); it.q.setDone(folded); }
      else { body.hidden = !open; if (it.summary) { it.summary.refresh(); it.summary.hidden = !folded; } }
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
      btn.setAttribute('aria-disabled', open || canOpen(i) ? 'false' : 'true');
      it.node.classList.toggle('current', open);
      it.node.classList.toggle('pending', !open && !seen[i]);
    });
    const firstControl = (it) => [...it.node.acc.body.querySelectorAll('input:not([type=hidden]), select, textarea, button')].find((x) => !x.disabled && x.getClientRects().length);
    const F = {
      get current() { return cur; },
      isDone: (i) => done[i],
      open(i, { focus = true } = {}) {
        cur = i; seen[i] = true; render();
        if (onOpen) onOpen(i);
        if (!focus) return;
        const it = items[i];
        it.node.scrollIntoView({ block: 'start' });
        if (it.focus) it.focus(); else if (it.q) it.q.focus(); else { const f = firstControl(it); if (f) f.focus(); }
      },
      done(i, d = true) { done[i] = d; render(); },
      render,
    };
    items.forEach((it, i) => it.node.acc.btn.addEventListener('click', () => { if (i !== cur && canOpen(i)) F.open(i); }));
    return F;
  }
  const readDeck = async () => ({ deck: (await S.ws.readText(S.deckFile, { max: READ_LIMITS.source })) || '', narration: (await S.ws.readText('narration.md', { max: READ_LIMITS.narration })) || '' });

  // ---------------------------------------------------------------- 新規作成の問い（① 場面 → ② 内容 → ③ 見た目）。答えた問いは 1 行にたたみ、［変更］で開き直す
  // 書いたもの・選んだものは、このページを開いている間は残す（次に開いたときも同じ答えから。問いは ① から順に開く）
  const draft = {
    category: null, sub: undefined,   // sub：undefined まだ答えていない | null この中にない | 小分類の id
    title: '', audMode: 'ai', audience: '', lenMode: 'ai', lenN: '', lenUnit: 'slides', conMode: 'ai', content: '',   // conMode：'ai' | 'give'（ここに書く・貼る）| 'given'（チャットの AI に渡してある）
    language: LANG, languageOther: '', speakers: 1, wishes: '', plan: DEFAULT_PLAN, purposesOff: [],
  };
  const catOf = (id) => CATEGORIES.find((c) => c.id === id) || null;
  const kindOk = () => { const c = catOf(draft.category); return !!c && (!c.subs.length || draft.sub !== undefined); };
  const titleOk = () => !!draft.title.trim();
  const lengthN = () => { if (draft.lenMode !== 'set') return null; const n = Math.round(Number(draft.lenN)); return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : null; };
  // 頼みたいこと（kit/core/llm-request.mjs の記入欄）。AI に任せた項目は書かない。話し合い済み（B）はタイトルだけ
  function requestValues() {
    const n = lengthN();
    // 内容は「チャットの AI に渡してある」：B の頼み方（渡した資料と話し合いの内容で）。項目は A と同じ形（タイトル・だれ向け・長さ・詳しくの言語・話す人・希望）
    return { kind: draft.conMode === 'given' ? 'B' : 'A', values: {
      title: draft.title,
      audience: draft.audMode === 'write' ? draft.audience : '',
      length: n ? X.lengthReq(n, draft.lenUnit) : '',
      language: draft.language === 'other' ? draft.languageOther : X.langReq[draft.language] || '',
      speakers: X.speakersReq[draft.speakers] || X.speakersReq[1],
      wishes: draft.wishes,
    } };
  }
  const givenContent = () => (draft.conMode === 'give' ? draft.content.trim() : '');
  // 2 回に分けて頼むか（9 枚から）：長さの数（分は 1 分 ≒ 1 枚。kit/core/llm-outline.mjs の slideCountOf）
  const longN = () => { const v = requestValues().values.length; const n = v ? slideCountOf(v) : null; return n && n > OUTLINE_OVER ? n : null; };

  const radio = (name, value, label, checked) => el('label', {}, [el('input', { type: 'radio', name, value, id: `${name}-${value}`, ...(checked ? { checked: '' } : {}) }), el('span', { text: label })]);
  const setRadios = (box, name, v) => { for (const r of box.querySelectorAll(`input[name="${name}"]`)) r.checked = r.value === String(v); };
  // 問い 1 つ：見出し・中身・［次へ］と、答えた後の 1 行（「使う場面：授業・研修／授業（小・中・高）［変更］」）
  function question(id, title, kids, { q, answer, valid, onNext, onChange }) {
    const nextBtn = el('button', { type: 'button', id: id.replace('paste-step-', 'paste-next-'), cls: 'pri', text: X.next });
    const body = el('div', { cls: 'paste-q-body' }, [...kids, el('div', { cls: 'paste-guide' }, [nextBtn])]);
    const ansText = el('span', { cls: 'paste-answer-text' });
    const changeBtn = el('button', { type: 'button', id: id.replace('paste-step-', 'paste-change-'), cls: 'ghost', text: X.change });
    const ans = el('p', { id: id + '-answer', cls: 'paste-answered', hidden: '' }, [ansText, changeBtn]);
    const node = step(id, title, [body, ans]);
    const Q = { node, done: false, nextBtn,
      refresh() { nextBtn.disabled = !valid(); ansText.textContent = X.answered(q(), answer()); },
      setDone(d) { Q.done = d; body.hidden = d; ans.hidden = !d; Q.refresh(); },
      focus() { const f = node.querySelector('.paste-q-body input:not([type=hidden]):not([hidden]), .paste-q-body select, .paste-q-body textarea'); if (f) f.focus(); },
    };
    node.addEventListener('input', () => Q.refresh());
    node.addEventListener('change', () => Q.refresh());
    nextBtn.addEventListener('click', () => { if (valid()) onNext(); });
    changeBtn.addEventListener('click', () => onChange());
    return Q;
  }

  // ① 場面（大分類 → 小分類と「この中にない」。kit/core/new-deck.mjs）。どちらも答える問い（既定の印は付けない）。その他は小分類なし
  function kindQuestion(title, ctl) {
    const cat = el('fieldset', { id: 'paste-cat', cls: 'paste-kind paste-cat' }, [el('legend', { text: X.catLegend }), ...CATEGORIES.map((c) => radio('paste-cat', c.id, c.label[LANG], c.id === draft.category))]);
    const sub = el('fieldset', { id: 'paste-sub', cls: 'paste-kind paste-sub' });
    const note = el('p', { id: 'paste-structure', cls: 'hint paste-structure', role: 'status' });
    const render = () => {
      const c = catOf(draft.category);
      setRadios(cat, 'paste-cat', draft.category);
      sub.replaceChildren(el('legend', { text: X.subLegend }), ...(c ? [...c.subs.map((x) => radio('paste-sub', x.id, x.label[LANG], x.id === draft.sub)), radio('paste-sub', 'none', X.subNoneFit, draft.sub === null)] : []));
      sub.hidden = !c || !c.subs.length;
      const s = c && c.subs.find((x) => x.id === draft.sub);
      note.textContent = s ? X.structure(s.structure[LANG], s.show[LANG]) : '';
      note.hidden = !s;
    };
    cat.addEventListener('change', (e) => {
      if (e.target.name !== 'paste-cat') return;
      if (draft.category !== e.target.value) { draft.category = e.target.value; draft.sub = undefined; }
      render(); ctl.changed();
    });
    sub.addEventListener('change', (e) => { if (e.target.name === 'paste-sub') { draft.sub = e.target.value === 'none' ? null : e.target.value; render(); ctl.changed(); } });
    render();
    return question('paste-step-kind', title, [el('p', { cls: 'hint', text: X.kindHint }), cat, sub, note], {
      q: () => X.catLegend,
      answer: () => { const c = catOf(draft.category); if (!c) return ''; const s = c.subs.find((x) => x.id === draft.sub); return c.label[LANG] + (c.subs.length ? (LANG === 'ja' ? '／' : ' / ') + (s ? s.label[LANG] : X.subNoneFit) : ''); },
      valid: kindOk, onNext: () => ctl.next(0), onChange: () => ctl.reopen(0),
    });
  }

  // ② 内容：タイトル（必須）・話し合い済みの切り替え・だれ向け／長さ／内容（「AI に任せる」か書くか）・詳しく（言語・話す人・そのほかの希望）
  function contentQuestion(title, ctl) {
    const ph = () => X.ph[draft.category] || X.ph.teaching;
    const input = (id, value, set, extra = {}) => { const i = el('input', { type: 'text', id, autocomplete: 'off', spellcheck: 'false', ...extra }); i.value = value; i.addEventListener('input', () => { set(i.value); ctl.changed(); }); return i; };
    const area = (id, value, set, rows) => { const t = el('textarea', { id, rows, spellcheck: 'false' }); t.value = value; t.addEventListener('input', () => { set(t.value); ctl.changed(); }); return t; };
    const titleIn = input('paste-title', draft.title, (v) => { draft.title = v; }, { required: '', 'aria-required': 'true' });
    // 「AI に任せる」か書くか（既定は AI に任せる。書く方を選ぶと欄が開く）
    const pair = (name, legend, aiLabel, writeLabel, mode, setMode, field) => {
      const fs = el('fieldset', { id: name, cls: 'paste-kind paste-pair' }, [el('legend', { text: legend }), radio(name, 'ai', aiLabel, mode() === 'ai'), radio(name, 'write', writeLabel, mode() !== 'ai'), field]);
      const show = () => { field.hidden = mode() === 'ai'; };
      fs.addEventListener('change', (e) => { if (e.target.name === name) { setMode(e.target.value); show(); ctl.changed(); if (e.target.value === 'write') { const f = field.querySelector('input,textarea'); if (f) f.focus(); } } });
      show();
      return fs;
    };
    const audIn = input('paste-audience', draft.audience, (v) => { draft.audience = v; }, { 'aria-label': X.audienceLabel });
    const aud = pair('paste-audience-mode', X.audienceLegend, X.audienceAi, X.audienceWrite, () => draft.audMode, (v) => { draft.audMode = v; }, el('div', { cls: 'paste-pair-field' }, [audIn]));
    const lenIn = el('input', { type: 'number', id: 'paste-length-n', min: '1', max: '999', inputmode: 'numeric', 'aria-label': X.lengthNLabel });
    lenIn.value = draft.lenN;
    lenIn.addEventListener('input', () => { draft.lenN = lenIn.value; ctl.changed(); });
    const unit = el('select', { id: 'paste-length-unit', 'aria-label': X.lengthUnitLabel }, ['slides', 'min'].map((u) => el('option', { value: u, text: X.unit[u] })));
    unit.value = draft.lenUnit;
    unit.addEventListener('change', () => { draft.lenUnit = unit.value; ctl.changed(); });
    const len = pair('paste-length-mode', X.lengthLegend, X.lengthAi, X.lengthSet, () => (draft.lenMode === 'set' ? 'write' : 'ai'), (v) => { draft.lenMode = v === 'write' ? 'set' : 'ai'; }, el('div', { cls: 'paste-pair-field paste-length' }, [lenIn, unit]));
    const conIn = area('paste-content', draft.content, (v) => { draft.content = v; }, '8');
    conIn.setAttribute('aria-label', X.contentLabel);
    // 内容は 3 つの答え：AI に任せる（既定）・ここに書く・貼る（大きな欄が開く）・チャットの AI に渡してある（その資料を渡したチャットに貼る、と添える）
    const conField = el('div', { cls: 'paste-pair-field paste-content' }, [conIn]);
    const givenNote = el('p', { id: 'paste-content-given-note', cls: 'hint paste-pair-field', text: X.contentGivenNote });
    const conMode = () => (draft.conMode === 'give' ? 'write' : draft.conMode === 'given' ? 'given' : 'ai');
    const con = el('fieldset', { id: 'paste-content-mode', cls: 'paste-kind paste-pair' }, [el('legend', { text: X.contentLegend }),
      radio('paste-content-mode', 'ai', X.contentAi, conMode() === 'ai'), radio('paste-content-mode', 'write', X.contentGive, conMode() === 'write'), conField,
      radio('paste-content-mode', 'given', X.contentGiven, conMode() === 'given'), givenNote]);
    con.addEventListener('change', (e) => {
      if (e.target.name !== 'paste-content-mode') return;
      draft.conMode = e.target.value === 'write' ? 'give' : e.target.value === 'given' ? 'given' : 'ai';
      ctl.changed();
      if (draft.conMode === 'give') conIn.focus();
    });
    // 詳しく（たたむ。今の答えを見出しに出す）
    const langOther = input('paste-language-name', draft.languageOther, (v) => { draft.languageOther = v; }, { 'aria-label': X.langOtherLabel, placeholder: X.langOtherPh });
    const langSet = el('fieldset', { id: 'paste-language', cls: 'paste-kind' }, [el('legend', { text: X.langLegend }), ...['ja', 'en', 'other'].map((k) => radio('paste-language', k, X.langOpt[k], draft.language === k)), langOther]);
    const showLang = () => { langOther.hidden = draft.language !== 'other'; };
    langSet.addEventListener('change', (e) => { if (e.target.name === 'paste-language') { draft.language = e.target.value; showLang(); ctl.changed(); if (draft.language === 'other') langOther.focus(); } });
    showLang();
    const spSet = el('fieldset', { id: 'paste-speakers', cls: 'paste-kind' }, [el('legend', { text: X.speakersLegend }), radio('paste-speakers', '1', X.speakers[1], draft.speakers === 1), radio('paste-speakers', '2', X.speakers[2], draft.speakers === 2)]);
    spSet.addEventListener('change', (e) => { if (e.target.name === 'paste-speakers') { draft.speakers = e.target.value === '2' ? 2 : 1; ctl.changed(); } });
    const wishes = area('paste-wishes', draft.wishes, (v) => { draft.wishes = v; }, '2');
    wishes.setAttribute('aria-describedby', 'paste-wishes-note');
    const moreSum = el('summary', { id: 'paste-more-h' });
    const more = el('details', { id: 'paste-more', cls: 'paste-fold' }, [moreSum, langSet, spSet,
      el('div', { cls: 'paste-field wide' }, [el('label', { for: 'paste-wishes', text: X.wishesLabel }), wishes, el('small', { id: 'paste-wishes-note', cls: 'hint', text: X.wishesNote })])]);
    const langName = () => (draft.language === 'other' ? draft.languageOther.trim() || X.langOpt.other : X.langOpt[draft.language]);
    const rest = [aud, len, con, more];
    const fillPh = () => { const p = ph(); titleIn.placeholder = p.title; audIn.placeholder = p.audience; conIn.placeholder = p.content; wishes.placeholder = p.wishes; };
    const show = () => { conField.hidden = draft.conMode !== 'give'; givenNote.hidden = draft.conMode !== 'given'; moreSum.textContent = X.more(langName(), X.speakersShort[draft.speakers], !!draft.wishes.trim()); fillPh(); };
    show();
    const Q = question('paste-step-content', title, [el('p', { cls: 'hint', text: X.step1Hint }),
      el('div', { cls: 'paste-field wide' }, [el('label', { for: 'paste-title', text: X.titleLabel }), titleIn]),
      ...rest], {
      q: () => X.titleQ,
      answer: () => {
        const v = requestValues().values, sep = LANG === 'ja' ? '・' : ' · ';
        return [draft.title.trim(), v.audience ? v.audience.trim() : '', v.length || '', draft.conMode === 'given' ? X.discussedShort : ''].filter(Boolean).join(sep);
      },
      valid: titleOk, onNext: () => ctl.next(1), onChange: () => ctl.reopen(1),
    });
    Q.show = show;
    Q.titleIn = titleIn;
    return Q;
  }

  // ③ 見た目（テーマ）。選択肢は見せる名前（標準・ビジネス・国語と、自分のテーマ）。自分のテーマ（フォルダ・このブラウザ）は「自分のテーマ」の見出しの下。
  // 最後の「テーマを読み込む…」で読み込みの窓（ZIP ファイル・テーマのフォルダ）。一覧は「テーマを変更…」と同じ（app.themeOptions）
  async function themeQuestion(title, ctl) {
    const sel = el('select', { id: 'paste-theme' });
    const LOAD = '\u0000load';
    const fill = async () => {
      const opts = app.themeOptions ? await app.themeOptions() : (app.themes || ['default']).map((t) => ({ value: t, label: t }));
      const opt = (o) => el('option', { value: o.value, text: o.label, ...(o.user ? { 'data-user': '' } : {}) }), mine = opts.filter((o) => o.user);
      sel.replaceChildren(...opts.filter((o) => !o.user).map(opt), ...(mine.length ? [el('optgroup', { label: X.themeMine }, mine.map(opt))] : []),
        ...(app.loadOtherTheme ? [el('option', { value: LOAD, text: X.themeLoad })] : []));
      const vals = opts.map((o) => o.value);
      sel.value = vals.includes(newTheme) ? newTheme : vals.includes('default') ? 'default' : vals[0];
      newTheme = sel.value;
    };
    await fill();
    sel.addEventListener('change', async () => {
      if (sel.value === LOAD) { sel.value = newTheme; if (await app.loadOtherTheme()) await fill(); ctl.changed(); return; }
      newTheme = sel.value; ctl.changed();
    });
    return question('paste-step-theme', title, [el('p', { cls: 'hint', text: X.themeHint }), el('div', { cls: 'paste-field' }, [el('label', { for: 'paste-theme', text: X.themeLabel }), sel])], {
      q: () => X.themeLabel, answer: () => (sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : sel.value),
      valid: () => !!sel.value, onNext: () => ctl.next(2), onChange: () => ctl.reopen(2),
    });
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
    market: '<circle cx="16" cy="16" r="12"/><circle cx="16" cy="19" r="8"/><circle cx="16" cy="22" r="4"/>',
    kanbun: '<path d="M21 4v24M12 4v24"/><path d="M15 9l3 2M15 18l3 2M24 13h3"/>',
    kobun: '<rect x="6" y="4" width="20" height="24" rx="2"/><path d="M21 8v16M16 8v16M11 8v10"/>',
    codetree: '<circle cx="16" cy="6" r="2.2"/><circle cx="9" cy="16" r="2.2"/><circle cx="23" cy="16" r="2.2"/><circle cx="5" cy="26" r="2.2"/><circle cx="13" cy="26" r="2.2"/><path d="M14.7 7.8L10.3 14.2M17.3 7.8l4.4 6.4M8 18l-2 6M10 18l2 6"/>',
    'subj-math': '<path d="M5 27h22M5 5v22"/><path d="M8 9c3 16 13 16 16 0"/>',
    'subj-business': '<rect x="4" y="10" width="24" height="16" rx="2"/><path d="M12 10V7h8v3M4 17h24"/>',
    'subj-kokugo': '<path d="M16 9c-4-3-9-3-12-2v19c3-1 8-1 12 2 4-3 9-3 12-2V7c-3-1-8-1-12 2zM16 9v19"/>',
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
  // 折りたたみ「使える図を見る・外す」：見出しの横（閉じていても見える）に使える図の数と外した数。中の上に、この指示で使える図の並び（読むだけ）、
  // その下に素材と言いたいことの札（外すのはこちらだけ）。並びは組み立てと同じ部品の一覧（kit/core/llm-pack.mjs の loadedParts）から作り、
  // 外した言いたいことだけに使う部品は薄く破線で斜線。parts()：{loaded: [タグ], off: Set(タグ)}。refresh() でプラン・分野・札に合わせて作り直す
  function partsTiles(update, parts) {
    const count = el('span', { id: 'paste-parts-count', cls: 'hint', 'aria-live': 'polite' });
    const strip = el('ul', { id: 'paste-parts', cls: 'tiles parts', 'aria-labelledby': 'paste-parts-h' });
    const partsGroup = el('div', { id: 'paste-parts-group', cls: 'paste-tiles-group' }, [el('h4', { id: 'paste-parts-h', text: X.partsLegend }), strip]);
    const refresh = () => {
      const { loaded, off } = parts();
      strip.replaceChildren(...loaded.map((t) => {
        const isOff = off.has(t);
        return el('li', { cls: 'tile part' + (isOff ? ' off' : ''), 'data-part': t, title: '<' + t + '>' },
          [icon(partIcon(t)), el('span', { cls: 'tile-label', text: partLabel(t, LANG) }), isOff ? el('span', { cls: 'sr-only', text: X.partOff }) : null]);
      }));
      const nOff = loaded.filter((t) => off.has(t)).length;
      count.textContent = X.partsCount(loaded.length - nOff, nOff);
    };
    const materials = el('div', { id: 'paste-materials', cls: 'paste-tiles-group' }, [
      el('h4', { id: 'paste-materials-h', text: X.materialsLegend }),
      el('ul', { cls: 'tiles', 'aria-labelledby': 'paste-materials-h' }, Object.keys(X.materials).map((k) => el('li', { cls: 'tile fixed', id: 'paste-material-' + k }, [icon(k), el('span', { cls: 'tile-label', text: X.materials[k] })]))),
    ]);
    const sum = el('p', { id: 'paste-purposes-sum', cls: 'hint', role: 'status' });
    const showSum = () => {
      const on = PURPOSES.list.length - draft.purposesOff.length;
      sum.textContent = X.purposesSum(on, PURPOSES.list.length);
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
    // 既定で閉じる。札のはたらきは同じ（外すだけ。無料版・有料版のどちらでも）
    const node = el('details', { id: 'paste-purposes-fold', cls: 'paste-fold' }, [
      el('summary', { id: 'paste-purposes-fold-h' }, [el('span', { text: X.purposesFold }), ' ', count]), partsGroup, materials, purposes]);
    return { node, refresh };
  }
  // ① スライドの挿入：枚数と足したいこと。足す場所は入口が決める（選んだスライドの後ろ、選んでいなければ最後）
  function insertStep(title, where, { onNext, onChange }) {
    const n = el('input', { type: 'number', id: 'paste-insert-n', min: '1', max: '10', value: '1', inputmode: 'numeric' });
    const wish = el('textarea', { id: 'paste-insert-wish', rows: '2', placeholder: X.insertWishPh, spellcheck: 'false' });
    const count = () => Math.max(1, Math.min(10, Math.round(Number(n.value) || 1)));
    const summary = summaryLine('paste-step1', X.insertCount, () => X.insertAnswer(count(), wish.value.trim()), onChange);
    return {
      node: step('paste-step1', title, [el('p', { id: 'paste-insert-where', cls: 'paste-where', text: where }), el('p', { cls: 'hint', text: X.insertHint }),
        el('div', { cls: 'paste-fields' }, [
          el('div', { cls: 'paste-field' }, [el('label', { for: 'paste-insert-n', text: X.insertCount }), n]),
          el('div', { cls: 'paste-field wide' }, [el('label', { for: 'paste-insert-wish', text: X.insertWish }), wish]),
        ]), el('div', { cls: 'paste-guide' }, [el('button', { type: 'button', id: 'paste-next-1', cls: 'pri', text: X.next, onclick: () => onNext() })])], [summary]),
      summary, count,
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

  // ---------------------------------------------------------------- ④ 新規作成：チャットの AI に指示を送る
  // 問い「無料のプランですか、有料のプランですか」→ 無料なら「スライドに出てくるものはありますか」（内容の分野。② のタイトルと内容・① の場面から推したものに印）
  // → 折りたたみ「AI に使わせない図を選ぶ」→［指示をコピー］。有料のプランはすべての分野を入れるので、分野の問いを隠す（印は無料に戻したときのために残る）
  // 無料のプランで選べる分野は 2 つまで（kit/core/new-deck.mjs の FREE_SUBJECT_MAX）：2 つに印があれば、ほかの印は押せなくし、わけを一覧の中に出す。
  // 推した印も 2 つまで（SUBJECTS の順で初めの 2 つ）。stored：開いている教材の egatari.json の studio.newDeck（前に選んだもの）。その印から始め、
  // 3 つ以上あれば印はそのまま（記録も書き換えない）、使うのは初めの 2 つ（freeSubjects）で、そう知らせる
  function sendStep(title, copyMsg, { request, missing, stored, onCopied, onChange }) {
    const touched = new Set();   // 自分で印を替えた分野（推した印で上書きしない）。前に選んだもの（stored）の印も
    const ticked = new Set();    // 印のある分野（系列の名前）。有料のプランでは札は全部入りに見せるが、印は無料に戻したときのために残す
    const seriesOf = (id) => (SUBJECTS.find((x) => x.id === id) || {}).series;
    // 分野の札（押すと入る・外れる。aria-pressed。入っている札は印と枠：色だけで分けない）
    const tiles = SUBJECTS.map((x) => {
      const b = el('button', { type: 'button', id: 'paste-series-' + x.series, cls: 'tile', 'data-subject': x.id, 'aria-pressed': 'false', title: membersOfSeries(x.series).join(', ') },
        [icon(x.icon), el('span', { cls: 'tile-label', text: x.label[LANG] }), el('small', { text: x.inside[LANG] })]);
      b.addEventListener('click', () => { if (draft.plan === 'paid') return; if (ticked.has(x.series)) ticked.delete(x.series); else ticked.add(x.series); touched.add(x.series); update(); });
      return b;
    });
    const subjectsTicked = () => SUBJECTS.filter((x) => ticked.has(x.series)).map((x) => x.id);
    const chosen = () => (draft.plan === 'paid' ? [...SERIES] : freeSubjects(subjectsTicked()).map(seriesOf));
    for (const id of (stored && Array.isArray(stored.subjects) ? stored.subjects : [])) {
      const sr = seriesOf(id);
      if (sr) { ticked.add(sr); touched.add(sr); }
    }
    const subjectName = (id) => { const x = SUBJECTS.find((y) => y.id === id); return x ? x.label[LANG] : id; };
    const maxNote = el('p', { id: 'paste-series-max', cls: 'hint', role: 'status', hidden: '', text: X.seriesMax });
    const storedNote = el('p', { id: 'paste-series-stored', cls: 'note', role: 'status', hidden: '' });
    const paidNote = el('p', { id: 'paste-series-paid', cls: 'hint', role: 'status', hidden: '', text: X.seriesPaid });
    // 札の状態：有料のプランは全部入りで押せない。無料のプランは 2 つに印があれば、ほかを押せなくする（印を外せばまた押せる）。
    // 3 つ以上（前の記録）なら使う 2 つを知らせる
    const limit = () => {
      const paid = draft.plan === 'paid', n = ticked.size;
      seriesSet.classList.toggle('paid', paid);
      for (const b of tiles) {
        const sr = b.id.slice('paste-series-'.length), on = paid || ticked.has(sr);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.disabled = paid || (n >= FREE_SUBJECT_MAX && !on);
      }
      const used = freeSubjects(subjectsTicked());
      storedNote.hidden = paid || n <= FREE_SUBJECT_MAX;
      storedNote.textContent = storedNote.hidden ? '' : X.seriesStored(subjectName(used[0]), subjectName(used[1]));
      maxNote.hidden = paid || n !== FREE_SUBJECT_MAX;
      paidNote.hidden = !paid;
    };
    const planSet = el('fieldset', { id: 'paste-plan', cls: 'paste-kind paste-plan', 'aria-describedby': 'paste-plan-hint' }, [el('legend', { text: X.planLegend }), ...AI_PLANS.map((p) => radio('paste-plan', p, X.plan[p], draft.plan === p))]);
    const planHint = el('p', { id: 'paste-plan-hint', cls: 'hint', text: X.planHint });
    const seriesSet = el('fieldset', { id: 'paste-series', cls: 'paste-series', 'aria-describedby': 'paste-series-new-hint paste-series-max paste-series-stored paste-series-paid' }, [el('legend', { text: X.seriesLegend }),
      el('div', { cls: 'tiles' }, tiles), maxNote, storedNote, paidNote]);
    const seriesHint = el('p', { id: 'paste-series-new-hint', cls: 'hint', text: X.seriesHintNew(standardParts(LANG)) });
    const guess = el('p', { id: 'paste-series-guess', cls: 'hint', role: 'status', hidden: '' });
    const phase = el('p', { id: 'paste-phase', cls: 'note paste-phase', role: 'status', hidden: '' });
    const total = el('span', { id: 'paste-pack-size', cls: 'hint' });
    const exclude = () => componentsOff(draft.purposesOff, PURPOSES);
    // 使える図：組み立てに入る部品（loadedParts。指示の一覧と同じ）と、外した言いたいことだけに使う部品
    const parts = partsTiles(() => update(), () => ({ loaded: partOrder(loadedParts(chosen(), draft.plan)), off: new Set(exclude()) }));
    const textNow = () => packWithRequest({ series: chosen(), lang: LANG, request: request(), exclude: exclude(), off: draft.purposesOff, plan: draft.plan });
    // 推した印：② のタイトルと内容の字（kit/core/new-deck.mjs の guessSubjects）と ① の場面（ビジネス → ビジネス）。自分で替えた分野はそのまま
    const guessNow = () => {
      const fromText = guessSubjects(draft.title + '\n' + givenContent()), fromKind = defaultSubjects(draft.category).filter((x) => !fromText.includes(x));
      const want = new Set([...fromText, ...fromKind].map(seriesOf));
      // 推した印は、自分で付けた印と合わせて 2 つまで（SERIES は SUBJECTS と同じ順：初めの 2 つ）
      let room = FREE_SUBJECT_MAX - SERIES.filter((sr) => touched.has(sr) && ticked.has(sr)).length;
      for (const sr of SERIES) if (!touched.has(sr)) { const on = want.has(sr) && room > 0; if (on) { ticked.add(sr); room--; } else ticked.delete(sr); }
      const names = (ids) => ids.filter((id) => { const sr = seriesOf(id); return sr && !touched.has(sr) && ticked.has(sr); }).map((id) => (LANG === 'ja' ? `「${subjectName(id)}」` : `“${subjectName(id)}”`));
      const a = names(fromText), k = names(fromKind);
      guess.textContent = [a.length ? X.seriesGuess(a.join(LANG === 'ja' ? '' : ', ')) : '', k.length ? X.seriesGuessKind(k.join(LANG === 'ja' ? '' : ', ')) : ''].filter(Boolean).join(LANG === 'ja' ? '' : ' ');
      guess.hidden = !guess.textContent;
    };
    const showPlan = () => {
      setRadios(planSet, 'paste-plan', draft.plan);
      seriesHint.hidden = draft.plan === 'paid';
      guess.hidden = draft.plan === 'paid' || !guess.textContent;
      limit();
      parts.refresh();
    };
    const update = () => {
      showPlan();
      const n = longN();
      phase.hidden = !n; phase.textContent = n ? X.phase(n) : '';
      const t = textNow();
      total.textContent = X.packTotal(kb(t)); total.dataset.bytes = String(packSize(t));
    };
    planSet.addEventListener('change', (e) => { if (e.target.name === 'paste-plan') { draft.plan = e.target.value === 'paid' ? 'paid' : 'free'; update(); } });
    let copied = null;   // egatari.json に残すのは、最後に写したときの選び方（写した後に変えたものは、AI に送っていない）
    const choiceNow = () => ({ plan: draft.plan, category: draft.category, subcategory: draft.sub || null, purposesOff: draft.purposesOff, subjects: subjectsTicked() });
    const copy = el('button', { type: 'button', id: 'paste-copy-guide', cls: 'pri', text: X.copyGuide, onclick: async () => {
      const miss = missing();
      if (miss) { copyMsg.hidden = false; copyMsg.classList.add('bad'); copyMsg.textContent = miss.text; miss.focus(); return; }
      const text = textNow();
      copied = choiceNow();
      const ok = await copyText(text);
      copyMsg.classList.remove('bad'); copyMsg.hidden = false; copyMsg.textContent = ok ? (longN() ? X.outlineCopied(kb(text)) : X.copied(kb(text))) : X.fixCopyFailed;
      if (ok && onCopied) onCopied();   // ⑤ を開く（チャットのタブから戻ったら、貼る欄がある）
    } });
    // 答えた 1 行：プランと使う分野と、コピーしたこと。コピーの知らせは本体の外（たたんでも見える）
    const summary = summaryLine('paste-step-send', X.sendQ, () => [X.planShort[draft.plan], ...(draft.plan === 'paid' ? [] : freeSubjects(subjectsTicked()).map(subjectName)), X.copiedShort].join(X.listSep), onChange);
    const node = step('paste-step-send', title, [planSet, planHint, seriesSet, seriesHint, guess, parts.node, phase, el('div', { cls: 'paste-guide' }, [copy, total])], [summary, copyMsg]);
    return { node, summary, update, guessNow, choice: () => copied || choiceNow() };
  }

  // ② 指示（挿入）：短い頼む文。チェック「このデッキを作ったのとは別のチャットに送る」で指示の全体（共通の本体と、選んだ分野）も付ける
  // 分野の既定：開いているデッキの部品・テーマから推したもの（kit/core/llm-pack.mjs の seriesForDeck）
  async function packStep(copyMsg, req, { title, copyLabel, copiedMsg, onCopied, onChange }) {
    const initial = await defaultSeries();
    const total = el('span', { id: 'paste-pack-size', cls: 'hint' });
    const boxes = SERIES.map((s) => { const cb = el('input', { type: 'checkbox', id: 'paste-series-' + s, value: s }); cb.checked = initial.includes(s); return cb; });
    const withPack = el('input', { type: 'checkbox', id: 'paste-with-pack' });
    const chosen = () => boxes.filter((b) => b.checked).map((b) => b.value);
    const textNow = async () => { const r = await req.request(); return withPack.checked ? packWithRequest({ series: chosen(), lang: LANG, request: r }) : r; };
    const partBytes = (s) => packSize(seriesPart(s, LANG));
    const update = async () => { const t = await textNow(); total.textContent = X.packTotal(kb(t)); total.dataset.bytes = String(packSize(t)); };
    for (const b of boxes) b.addEventListener('change', update);
    const copy = el('button', { type: 'button', id: 'paste-copy-guide', cls: 'pri', text: copyLabel, onclick: async () => {
      const text = await textNow();
      const ok = await copyText(text);
      copyMsg.classList.remove('bad'); copyMsg.hidden = false; copyMsg.textContent = ok ? copiedMsg(kb(text)) : X.fixCopyFailed;
      if (ok && onCopied) onCopied();
    } });
    const seriesSet = el('fieldset', { id: 'paste-series', cls: 'paste-series', 'aria-describedby': 'paste-series-hint' }, [el('legend', { text: X.seriesLegend }),
      ...SERIES.map((s, i) => el('label', { title: membersOfSeries(s).join(', ') }, [boxes[i], el('span', { text: seriesName[s] || s }), el('span', { cls: 'hint', 'data-bytes': String(partBytes(s)), text: X.plusKb(kbOf(partBytes(s))) })]))]);
    const packParts = el('div', { id: 'paste-pack-parts', cls: 'paste-guide', hidden: '' }, [seriesSet, el('p', { id: 'paste-series-hint', cls: 'hint', text: X.seriesHint(seriesName.academic) })]);
    withPack.addEventListener('change', () => { packParts.hidden = !withPack.checked; copyMsg.hidden = true; copyMsg.textContent = ''; update(); });
    await update();
    const summary = summaryLine('paste-step2', X.sendQ, () => X.copiedShort, onChange);
    const node = step('paste-step2', title, [el('label', { cls: 'paste-with-pack', for: 'paste-with-pack' }, [withPack, el('span', { text: X.withPack })]),
      packParts, el('div', { cls: 'paste-guide' }, [copy, total])], [summary, copyMsg]);
    return { node, summary, update };
  }
  // ② 修正依頼：品質チェックの指摘（今かけ直す）と ① と開いているメモと、今の原稿（kit/core/llm-fix.mjs）
  function reviseStep(copyMsg, title, results0, { onNext, onCopied, onChange }) {
    const wish = el('textarea', { id: 'paste-wish', rows: '3', placeholder: X.wishPh, spellcheck: 'false' });
    const sum1 = summaryLine('paste-step1', X.wish, () => wish.value.trim() || X.wishNone, () => onChange(0));
    const s1 = step('paste-step1', title[0], [el('p', { cls: 'hint', text: X.reviseHint }),
      el('div', { cls: 'paste-field' }, [el('label', { for: 'paste-wish', text: X.wish }), wish]),
      el('div', { cls: 'paste-guide' }, [el('button', { type: 'button', id: 'paste-next-1', cls: 'pri', text: X.next, onclick: () => onNext() })])], [sum1]);
    const copy = el('button', { type: 'button', id: 'paste-copy-guide', cls: 'pri', text: X.copyRevise, onclick: async () => {
      const results = results0 || (app.checkResults ? await app.checkResults() : []) || [];
      const r = await reviseRequest(results, wish.value);
      if (!r) { copyMsg.hidden = false; copyMsg.classList.add('bad'); copyMsg.textContent = X.reviseNothing; onChange(0); return; }
      const ok = await copyText(r.text);
      copyMsg.classList.remove('bad'); copyMsg.hidden = false; copyMsg.textContent = ok ? X.revised(kb(r.text), r.problems, r.notes) : X.fixCopyFailed;
      if (ok && onCopied) onCopied();
    } });
    const sum2 = summaryLine('paste-step2', X.sendQ, () => X.copiedShort, () => onChange(1));
    const s2 = step('paste-step2', title[1], [el('div', { cls: 'paste-guide' }, [copy])], [sum2, copyMsg]);
    return { s1, s2, sum1, sum2, wish };
  }

  // ---------------------------------------------------------------- AI の出力を貼る 2 つの欄（スライド＝deck.html・台本＝narration.md。新規作成の ⑤、挿入・修正の ③）
  // 隠れた状態はない：欄ごとに受け取ったものを見せる。どちらの欄に出力の全体を貼っても 2 つに分け、違う欄に貼ったものは正しい欄へ移す
  function pasteFields(mode, onChange) {
    const info = el('p', { id: 'paste-info', cls: 'hint paste-info', role: 'status', hidden: '' });
    const mk = (k) => {
      const id = k === 'deck' ? 'paste-deck' : 'paste-narr';
      const ta = el('textarea', { id, rows: '5', spellcheck: 'false', placeholder: k === 'deck' ? X.phDeck : X.phNarr, 'aria-describedby': id + '-st' });
      const st = el('p', { id: id + '-st', cls: 'paste-st', role: 'status' });
      const box = el('div', { cls: 'paste-field wide' }, [el('label', { for: id, text: k === 'deck' ? X.pasteDeck : X.pasteNarr }), ta, st]);
      return { k, ta, st, box, val: null, err: null, warn: [], last: '' };
    };
    const F = { deck: mk('deck'), narr: mk('narr') };
    let notes = [];
    const errText = (e) => (typeof X.err[e.code] === 'function' ? X.err[e.code](e) : X.err[e.code] || e.message);
    const set = (f, val, warn = []) => { f.val = val; f.err = null; f.warn = warn; };
    function take(k) {
      const f = F[k], other = F[k === 'deck' ? 'narr' : 'deck'];
      const text = f.ta.value;
      if (!text.trim()) { set(f, null); S.cutOff = null; notes = []; return; }
      notes = [];
      const p = pastePart(text);
      // コードブロックの中身だけ（枠の右上のコピーで写したもの）：区切りがないのはふつうなので、そのことは知らせない
      if (p.part === 'deck' || p.part === 'narration') p.warnings = p.warnings.filter((w) => w.code !== 'unfenced');
      // コードブロックが閉じていない（出力が切れた）・コードブロックがない（ファイル・キャンバス・添付で出した）：送り直しを頼む文を写せる
      S.cutOff = p.error && (p.error.code === 'unclosed' || p.error.code === 'no-blocks') ? p.error : null;
      if (p.error && p.error.code === 'unclosed' && p.error.kind === 'narration' && p.deck) {
        // 台本の途中で切れた出力：スライドは受け取り、台本の欄に切れたことを出す（送り直してもらった台本だけを、台本の欄に貼る）
        set(F.deck, p.deck, p.warnings); F.deck.ta.value = p.deck.replace(/\n$/, '');
        F.narr.ta.value = ''; set(F.narr, null); F.narr.err = errText(p.error);
        notes = [X.split];
        return;
      }
      if (p.error) { set(f, null); f.err = errText(p.error); return; }
      if (p.part === 'both') {
        set(F.deck, p.deck, p.warnings); set(F.narr, p.narration);
        F.deck.ta.value = p.deck.replace(/\n$/, ''); F.narr.ta.value = p.narration.replace(/\n$/, '');
        notes = [X.split];
        return;
      }
      const to = p.part === 'deck' ? 'deck' : 'narr', val = p.part === 'deck' ? p.deck : p.narration;
      if (to !== k) {
        F[to].ta.value = val.replace(/\n$/, ''); set(F[to], val, p.warnings);
        f.ta.value = ''; set(f, null);
        notes = [X.moved[to]];
        return;
      }
      // 出力の一部（コードブロックの外の文があった）：取り出したコードブロックだけを欄に残し、そう言う
      if (val.trim() !== text.trim()) { f.ta.value = val.replace(/\n$/, ''); notes = [X.extracted[to]]; }
      set(f, val, p.warnings);
      void other;
    }
    function render() {
      for (const f of [F.deck, F.narr]) {
        let t = X.stEmpty, cls = '';
        if (f.err) { t = f.err; cls = 'bad'; }
        else if (f.val !== null) {
          if (f.k === 'deck') { const n = sectionsOf(f.val).length; if (n) { t = X.stDeck(n); cls = 'ok'; } else { t = X.err['no-slides']; cls = 'bad'; f.err = t; } }
          else { t = X.stNarr(narrSections(f.val.replace(/\r\n?/g, '\n')).out.length); cls = 'ok'; }
        }
        f.st.textContent = t; f.st.className = 'paste-st' + (cls ? ' ' + cls : '');
      }
      const w = [...F.deck.warn, ...F.narr.warn].map((x) => (typeof X.warn[x.code] === 'function' ? X.warn[x.code](x) : X.warn[x.code] || x.code));
      info.textContent = [...notes, ...w].join(' ');
      info.hidden = !info.textContent;
      onChange();
    }
    // 欄に書き戻した字（分けた・移した中身）は、もう読んだもの：同じ字の input では読み直さない（知らせが消えないように）
    for (const f of [F.deck, F.narr]) f.ta.addEventListener('input', () => { if (f.ta.value === f.last) return; take(f.k); F.deck.last = F.deck.ta.value; F.narr.last = F.narr.ta.value; render(); });
    render();
    return {
      nodes: [info, F.deck.box, F.narr.box],
      focus: () => F.deck.ta.focus(),
      // 押してよいか（新規作成・挿入はスライドが要る。修正はどちらか 1 つでよい）と、ボタンの横に出す言葉
      ready: () => {
        if (F.deck.err || F.narr.err) return false;
        return mode === 'replace' ? F.deck.val !== null || F.narr.val !== null : F.deck.val !== null;
      },
      // 押せないわけ（n：貼り付けの問いの番号）
      why: (n) => (F.deck.err || F.narr.err ? X.why.fix(n) : mode === 'replace' ? X.why.either(n) : X.why.deck(n)),
      note: () => {
        if (F.deck.err || F.narr.err) return '';
        if (F.deck.val !== null && F.narr.val === null) return X.noNarr[mode];
        if (mode === 'replace' && F.deck.val === null && F.narr.val !== null) return X.keepDeck;
        return '';
      },
      data: () => ({ deck: F.deck.val, narration: F.narr.val, warnings: [...F.deck.warn, ...F.narr.warn] }),
    };
  }

  // ---------------------------------------------------------------- AI の窓
  let newTheme = null;
  let outlineRows = null;   // 新規作成で受け取った構成案（[{heading, point}]）。最初の分を作るときに egatari.json の studio.outline にする
  let batchNow = null;      // 構成案の続きの挿入（{rows, from, to}）
  let insertAfter = null;   // 挿入：この番号（0 から）のスライドの後ろ。null なら最後
  let newChoice = null;     // 新規作成：写したときの選び方（作成するときに egatari.json の studio.newDeck へ）
  const canReplace = () => !!(S.ws && S.deckFile && !(S.portable && (S.portable.readOnly || S.portable.tierAOnly)));
  // mode：'new'（新規作成）| 'insert'（スライドの挿入。opts.after）| 'replace'（修正。opts.results：品質チェックの結果があれば）。
  // opts.focusPaste：貼り付けの欄から始める（修正依頼をもう写したとき）。戻り値：作成・挿入・置き換えをしたか
  async function aiDialog(mode, opts = {}) {
    if (mode !== 'new' && !canReplace()) { toast(T.readOnlyNoEdit, true); return false; }
    const titles = opts.batch ? X.steps.batch : X.steps[mode];
    outlineRows = null; batchNow = null; newChoice = null;
    const msg = el('p', { id: 'paste-msg', cls: 'note bad', role: 'alert', hidden: '' });
    const copyMsg = el('p', { id: 'paste-copied', cls: 'hint', role: 'status', hidden: '' });
    // 出力が切れていた・コードブロックがなかったとき：AI に送り直しを頼む文を写すボタン
    const cutMsg = el('p', { id: 'paste-cut-copied', cls: 'hint', role: 'status', hidden: '' });
    const cut = el('button', { type: 'button', id: 'paste-copy-cutoff', hidden: '', text: X.copyCutOff, onclick: async () => { const t = cutOffRequest(S.cutOff || {}, LANG); const ok = await copyText(t); cutMsg.hidden = false; cutMsg.textContent = ok ? X.cutOffCopied : X.fixCopyFailed; } });
    S.cutOff = null;
    const goNote = el('span', { id: 'paste-go-note', cls: 'hint paste-go-note', role: 'status' });
    let outlinePhase = () => false;   // 新規作成で構成案を待っているとき（作成は押せない）
    let unanswered = () => null;      // 新規作成：① ② の答えで欠けているもの（押せないわけ）
    const pasteN = mode === 'new' ? 5 : 3;
    let fields = null;
    const syncGo = () => {
      const b = document.getElementById('dlg-import');
      cut.hidden = !S.cutOff;
      if (!b || !fields || !b.closest('#dlg[open]')) return;
      // ボタンは同じ場所のまま。押せないときは、すぐ左に欠けているもののうち最初の 1 つを、押せるときは添え書き（台本なしで作成します など）を出す
      const pre = unanswered(), waiting = outlinePhase(), ready = fields.ready();
      b.disabled = !!pre || waiting || !ready;
      goNote.textContent = pre || (waiting ? X.why.outline(pasteN) : !ready ? fields.why(pasteN) : fields.note());
      if (b.previousSibling !== goNote) b.before(goNote);
      b.setAttribute('aria-describedby', 'paste-go-note');
    };
    fields = pasteFields(mode, () => syncGo());
    const pasteKids = () => [el('p', { id: 'paste-step3-hint', cls: 'hint', text: X.step3Hint }), ...(mode === 'replace' ? [el('p', { cls: 'hint', text: X.replaceHint })] : []),
      ...fields.nodes, msg, cut, cutMsg, el('p', { cls: 'hint', text: X.untrusted })];
    let body, openPaste = () => {};
    if (mode === 'new') {
      // ① 場面 → ② 内容 → ③ 見た目 → ④ 指示を送る → ⑤ 出力を貼る。1 つだけ開く流れ（flow）：答えた問いは 1 行にたたみ、次の問いを開く。
      // ③ まで答えると ④、指示をコピーすると ⑤ が開く。⑤ は ④ を開いたら見出しから開ける（もう出力を持っている人）
      let Qs = [], send = null, five = null, F = null;
      const ctl = {
        changed() { for (const q of Qs) q.refresh(); if (Qs[1]) Qs[1].show(); if (send) { send.guessNow(); send.update(); } if (five) five.render(); if (F) F.render(); },
        next(k) {
          F.done(k);
          // 次の答えていない問い（なければ ④）
          const j = [0, 1, 2].find((i) => i > k && !F.isDone(i));
          F.open(j === undefined ? 3 : j);
        },
        reopen(k) { F.open(k); },
      };
      Qs = [kindQuestion(titles[0], ctl), contentQuestion(titles[1], ctl), await themeQuestion(titles[2], ctl)];
      const request = () => {
        let t = filledRequest(requestValues(), LANG).replace(/\n*$/, '\n') + X.themeLine(newTheme) + '\n';
        const cr = choiceRequest({ plan: draft.plan, category: draft.category, subcategory: draft.sub || null, subjects: [], purposesOff: draft.purposesOff }, PURPOSES, LANG);
        if (cr) t += cr + '\n';
        const c = givenContent();
        if (c) t += '\n' + X.contentHead + '\n\n' + c + '\n';
        const n = longN();
        if (n) t += '\n' + outlineRequest({ n, lang: LANG });
        return t;
      };
      const missing = () => {
        if (!kindOk()) { return { text: X.needKind, focus: () => F.open(0) }; }
        if (!titleOk()) { return { text: X.needTopic, focus: () => { F.open(1, { focus: false }); Qs[1].node.scrollIntoView({ block: 'start' }); Qs[1].titleIn.focus(); } }; }
        return null;
      };
      // 前に選んだもの：開いている教材の egatari.json の studio.newDeck（読むだけ。書き換えない）
      let stored = null;
      if (S.ws) { try { stored = choiceOf(await S.ws.readText(FORMAT.CONFIG_FILE, { max: READ_LIMITS.json })); } catch { stored = null; } }
      send = sendStep(titles[3], copyMsg, { request, missing, stored, onCopied: () => { F.done(3); F.open(4); }, onChange: () => F.open(3) });
      newChoice = send.choice;
      five = fiveStep(titles, fields, pasteKids, () => syncGo());
      outlinePhase = () => five.waiting();
      unanswered = () => (!kindOk() ? X.why.kind : !titleOk() ? X.why.title : null);
      F = flow([...Qs.map((q) => ({ node: q.node, q })), { node: send.node, summary: send.summary }, { node: five.node, can: () => F.current >= 3 || F.isDone(3), focus: () => { const o = document.getElementById('paste-outline-text'); if (o && o.getClientRects().length) o.focus(); else fields.focus(); } }],
        { onOpen: (i) => { if (i === 3) { send.guessNow(); send.update(); } if (i === 4) five.render(); } });
      openPaste = () => F.open(4, { focus: false });
      F.open(0, { focus: false });
      send.update(); five.render();
      body = [...Qs.map((q) => q.node), send.node, five.node];
    } else if (mode === 'insert') {
      const { deck, narration } = await readDeck();
      const slides = sectionsOf(deck);
      const n = slides.length;
      insertAfter = opts.after === null || opts.after === undefined || opts.after >= n - 1 ? null : Math.max(-1, opts.after);
      const at = insertAfter === null ? n - 1 : insertAfter;
      const head = (i) => ((S.slides || [])[i] && (S.slides[i].heading || S.slides[i].key)) || '';
      const where = insertAfter === null && opts.after !== n - 1 ? X.insertWhereLast(n, head(n - 1)) : X.insertWhere(at + 1, head(at));
      const B = opts.batch || null;   // 構成案の続き（{rows, from, to}）：範囲は決まっているので、枚数と足したいことの欄は出さない
      let F = null;
      const nav = { onNext: () => { F.done(0); F.open(1); }, onChange: () => F.open(0) };
      // 構成案の続き：範囲は決まっているので、① は範囲の 1 行だけ（本体はなく、いつも見える）
      const ins = B ? { node: step('paste-step1', X.steps.batch[0], [], [el('p', { id: 'paste-batch-where', cls: 'paste-where', text: X.batchWhere(B.from, B.to, B.rows.length, remaining(B)) })]), summary: null, count: () => B.to - B.from + 1, wish: () => '' }
        : insertStep(titles[0], where, nav);
      const req = { request: () => (B ? batchRequest({ rows: B.rows, from: B.from, to: B.to, deck, narration, lang: LANG })
        : insertRequest({ deck, narration, after: at, n: ins.count(), wish: ins.wish(), lang: LANG })) };
      batchNow = B;
      const pack = await packStep(copyMsg, req, { title: titles[1], copyLabel: X.copyInsert, copiedMsg: X.insertCopied, onCopied: () => { F.done(0); F.done(1); F.open(2); }, onChange: () => F.open(1) });
      ins.node.addEventListener('input', pack.update);
      const three = step('paste-step-paste', titles[2], pasteKids());
      // 挿入も 1 つだけ開く流れ（① ② に必ず答えるものはないので、どの見出しからも開ける）
      F = flow([{ node: ins.node, summary: ins.summary, can: () => !B }, { node: pack.node, summary: pack.summary, can: () => true }, { node: three, can: () => true, focus: () => fields.focus() }]);
      openPaste = () => F.open(2, { focus: false });
      // 構成案の続きは範囲が決まっている：① は答えた 1 行にして、② から始める
      if (B) { F.done(0); F.open(1, { focus: false }); } else F.open(0, { focus: false });
      body = [ins.node, pack.node, three];
    } else {
      let F = null;
      const r = reviseStep(copyMsg, titles, opts.results || null, { onNext: () => { F.done(0); F.open(1); }, onCopied: () => { F.done(0); F.done(1); F.open(2); }, onChange: (k) => F.open(k) });
      const three = step('paste-step-paste', titles[2], pasteKids());
      F = flow([{ node: r.s1, summary: r.sum1, can: () => true }, { node: r.s2, summary: r.sum2, can: () => true }, { node: three, can: () => true, focus: () => fields.focus() }]);
      openPaste = () => F.open(2, { focus: false });
      F.open(0, { focus: false });
      body = [r.s1, r.s2, three];
    }
    let focusPaste = !!opts.focusPaste;
    if (focusPaste) openPaste();
    for (;;) {
      // 新規作成は画面いっぱいのページ（問いを縦に並べる）。「← 戻る」と Esc で閉じる
      const back = mode === 'new' ? el('button', { type: 'button', id: 'page-back', cls: 'ghost page-back', text: X.back, onclick: () => { const d = document.getElementById('dlg'); if (d.open) d.close('cancel'); } }) : null;
      const shown = ask({ title: opts.batch ? X.batchTitle : X.title[mode], kind: mode === 'new' ? 'paste page' : 'paste',
        body: [back, el('p', { id: 'ai-howto', cls: 'paste-howto', text: mode === 'replace' ? X.howToFix : mode === 'new' ? X.howToNew : X.howTo }), ...body],
        buttons: [{ id: 'cancel', label: X.cancel }, { id: 'import', label: X.go[mode], pri: true }] });
      syncGo();
      if (focusPaste) setTimeout(() => { fields.focus(); }, 0);
      const v = await shown;
      if (v !== 'import') return false;
      if (unanswered() || outlinePhase() || !fields.ready()) { focusPaste = true; if (!unanswered()) openPaste(); continue; }
      status(X.building[mode]);
      let res;
      try { res = await finish(fields.data(), mode); } finally { status(''); }
      focusPaste = true; openPaste();
      if (res === null) return true;
      msg.hidden = false; msg.textContent = res;
    }
  }

  // ⑤（新規作成）：ふつうは 2 つの欄。長い教材（9 枚から）は、はじめに構成案の欄と［次へ］、受け取ったら構成案の一覧・1〜6 枚目の指示のコピー・2 つの欄
  function fiveStep(titles, fields, pasteKids, onChange) {
    const box = el('div', { cls: 'paste-five' });
    const node = step('paste-step-paste', titles[4], [box]);
    const h = node.acc.btn;
    const oText = el('textarea', { id: 'paste-outline-text', rows: '6', spellcheck: 'false', placeholder: X.outlinePh });
    const oMsg = el('p', { id: 'paste-outline-msg', cls: 'note bad', role: 'alert', hidden: '' });
    const kids = pasteKids();
    const waiting = () => !!longN() && !outlineRows;
    let shownAs = null;
    const accept = () => {
      const o = parseOutline(oText.value);
      if (o.error) { const f = X.outlineErr[o.error.code]; oMsg.hidden = false; oMsg.textContent = typeof f === 'function' ? f(o.error) : (f || o.error.code); oText.focus(); return; }
      oMsg.hidden = true; outlineRows = o.rows; render(true);
    };
    const next = el('button', { type: 'button', id: 'paste-outline-next', cls: 'pri', text: X.next, onclick: accept });
    function render(force = false) {
      const long = longN();
      if (!long) outlineRows = null;   // ② で短くした：構成案は使わない
      const as = !long ? 'fields' : outlineRows ? 'got' : 'outline';
      if (as === shownAs && !force) { onChange(); return; }
      shownAs = as;
      if (as === 'outline') {
        const b = nextBatch({ rows: Array.from({ length: long }, () => ({})), next: 1 });
        h.textContent = titles[4] === X.steps.new[4] ? X.steps.outline : titles[4];
        box.replaceChildren(el('p', { cls: 'hint', text: X.outlineHint(b.from, b.to) }),
          el('div', { cls: 'paste-field wide' }, [el('label', { for: 'paste-outline-text', text: X.outlineLabel }), oText]), oMsg, el('div', { cls: 'paste-guide' }, [next]));
      } else if (as === 'got') {
        const rows = outlineRows, b = nextBatch({ rows, next: 1 });
        const msgO = el('p', { id: 'paste-outline-copied', cls: 'hint', role: 'status', hidden: '' });
        const change = el('button', { type: 'button', id: 'paste-change-outline', cls: 'ghost', text: X.change, onclick: () => { outlineRows = null; render(true); oText.focus(); } });
        h.textContent = titles[4];
        box.replaceChildren(
          el('p', { id: 'paste-outline-answer', cls: 'paste-answered' }, [el('span', { cls: 'paste-answer-text', text: X.answered(X.outlineQ, X.outlineAnswer(rows.length)) }), change]),
          el('p', { id: 'paste-outline-got', cls: 'note', role: 'status', text: X.outlineGot(rows.length) }),
          el('ol', { id: 'paste-outline-list', cls: 'paste-outline' }, rows.map((r) => el('li', { text: r.point ? `${r.heading} — ${r.point}` : r.heading }))),
          el('div', { cls: 'paste-guide' }, [el('button', { type: 'button', id: 'paste-outline-copy', cls: 'pri', text: X.outlineCopy(b.from, b.to), onclick: async () => {
            const t = batchRequest({ rows, from: b.from, to: b.to, first: true, lang: LANG });
            const ok = await copyText(t); msgO.hidden = false; msgO.textContent = ok ? X.batchCopied(kb(t)) : X.fixCopyFailed;
          } })]), msgO, ...kids);
      } else {
        h.textContent = titles[4];
        box.replaceChildren(...kids);
      }
      onChange();
    }
    return { node, render, waiting };
  }


  // 取り込む（__APP_TEST.paste：出力の全体を 1 回で）。戻り値：窓に出す誤りの言葉（できたら null）
  async function importText(text, mode) {
    const p = pastePart(text);
    if (p.error) return typeof X.err[p.error.code] === 'function' ? X.err[p.error.code](p.error) : (X.err[p.error.code] || p.error.message);
    return finish({ deck: p.deck, narration: p.narration, warnings: p.warnings }, mode);
  }
  async function finish(r, mode) {
    const notes = r.warnings.map((w) => (X.warn[w.code] ? (typeof X.warn[w.code] === 'function' ? X.warn[w.code](w) : X.warn[w.code]) : w.code));
    if (r.deck === null && mode !== 'replace') return X.err['no-deck'];
    if (mode === 'insert') return insertReply(r, notes, []);
    return mode === 'replace' ? replaceDeck(r, notes, []) : openNew(r, notes, []);
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
