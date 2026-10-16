// 画面の言葉：URL の ?lang=ja|en > 前に選んだもの（localStorage）> ブラウザの言語（日本語なら日本語、それ以外は英語）
export const LANG_KEY = 'motion-editor-lang';
function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ja' || q === 'en') return q;
  try { const s = localStorage.getItem(LANG_KEY); if (s === 'ja' || s === 'en') return s; } catch { /* 使えない環境 */ }
  return /^ja\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || 'ja') ? 'ja' : 'en';
}
export const EN = pickLang() === 'en';
document.documentElement.lang = EN ? 'en' : 'ja';
const MOD = /mac|iphone|ipad/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '') ? '⌥ option' : 'Alt';

const ja = {
  brand: 'Motion Slides エディタ', open: 'ほかのフォルダ', edit: '編集 (e)', narr: '口述原稿 (n)', comments: 'コメント (c)',
  check: '簡易チェック', export: 'HTML を書き出す', print: '印刷 / PDF', presenter: '発表者ビュー', full: '全画面', helpBtn: '使い方',
  welcomeTitle: 'デッキのフォルダを開く', welcomeLead: 'インストールは要りません。deck.html の入ったフォルダを開くと、ここで表示・編集できます（Chrome / Edge）',
  unsupported: 'このブラウザではフォルダを開けません。Google Chrome か Microsoft Edge（パソコン版）で開いてください',
  dropHere: 'ここにフォルダをドラッグ＆ドロップ', openFolder: 'フォルダを開く', newDeck: '新しいデッキ',
  newTitle: 'タイトル', newLang: '言語', newTheme: 'テーマ', newHint: '次に保存先のフォルダを選びます。空のフォルダならそこに、空でなければ中に新しいフォルダを作ります',
  newGo: 'フォルダを選んで作る', cancel: '取消', recent: '最近開いたフォルダ', reopen: '開く', forget: '一覧から消す',
  privacy: 'ファイルは選んだフォルダの中だけで読み書きし、どこにも送りません。動画・読み上げ音声（TTS）と完全な検査はコマンド（npm run …）で行います',
  buildFailed: '原稿を組み立てられませんでした', buildFailedHint: '原稿を直して保存すると、自動で組み直します（Claude Code などで直してもかまいません）', building: '組み立て中…',
  noPermission: 'フォルダを読み書きする許可がありません', cannotOpen: 'このフォルダは開けません（移動・削除された？）', dropFolder: 'ファイルではなくフォルダを選んでください',
  noDeck: 'このフォルダに .html の原稿（deck.html）がありません', popupBlocked: '新しい窓を開けませんでした（ポップアップを許可してください）', noFullscreen: '全画面にできませんでした',
  slidesN: (n) => `${n} 枚`, rebuilt: (t, why) => `${t} ${why === 'poll' ? '外での変更を読み込みました' : why === 'save' ? '保存して組み直しました' : '組み立てました'}`,
  buildFailedAt: (t) => `${t} 組み立てに失敗しました`, warnings: (n) => `警告 ${n}`, warnTitle: '組み立ての警告',
  checkTitle: '簡易チェック', checking: '確かめています…', checkFailed: '確かめられませんでした（デッキが応答しません）',
  checkSummary: (e, w) => `エラー ${e} · 警告 ${w}`, checkNote: 'ブラウザの中でできる一部の検査です（はみ出し・文字の大きさ・字数・口述原稿の抜け・コントラスト）。部品の再現性などを含む完全な検査は npm run check で',
  sevError: 'エラー', sevWarn: '警告', wholeDeck: 'デッキ全体', slideN: (n, t) => `スライド ${n}${t ? '：' + t : ''}`,
  checkMsg: (c, a) => ({
    titleLong: `タイトル ${a} 字（26 字まで）`, titleLongEn: `タイトル ${a} 文字（60 文字まで）`, conclLong: `結論の行 ${a} 字（35 字まで）`, conclLongEn: `結論の行 ${a} 文字（70 文字まで）`,
    conclOverflow: '結論の行が枠からはみ出す', overflowBottom: `本文が下にはみ出す（${a}px）`, overflowRight: `本文が右にはみ出す（${a}px）`, smallText: `文字が小さい ${a}`,
    katexError: 'KaTeX エラーが残っている', noNarration: `口述原稿が無い（段階 ${a}）`, contrast: `コントラストが低い：${a}`,
  }[c] || c),
  exporting: '書き出し中…', exportFailed: '書き出せませんでした', exported: (t, mb) => `${t} 書き出しました（${mb} MB）`, exportedToast: '1 つの HTML に書き出しました。ダブルクリックで開けます',
  exists: (f) => `${f} がすでにあります`, created: (n) => `「${n}」に新しいデッキを作りました`,
  helpTitle: '使い方',
  help: [
    ['スライドを直す', ['<kbd>e</kbd> か「編集」で編集モード。文字の上をダブルクリックすると原稿（deck.html）のその部分を直せます。⌘/Ctrl+Enter で保存',
      '保存すると、元のファイルの控えを <code>.cache/edits/</code> に残します（新しい 30 個）']],
    ['口述原稿', ['<kbd>n</kbd> か「口述原稿」で、表示中の段階の原稿（narration.md）を開きます。話者・順番も変えられます']],
    ['Claude への指示', [`スライドの上で <kbd>${MOD}</kbd>+クリックすると、指示を comments.json に残します。<kbd>c</kbd> で一覧`,
      'Claude Code に「comments.json の指示に対応して」と頼むと直してくれます。外でファイルが変わると、ここで自動で組み直します']],
    ['発表', ['→ / Space で次、← で前、<kbd>a</kbd> 自動再生、<kbd>l</kbd> 授業モード、<kbd>?</kbd> でキーの一覧',
      '「発表者ビュー」（または <kbd>p</kbd>）で、口述原稿と次の画面の出る窓を開きます。「全画面」で投影用']],
    ['できないこと', ['読み上げ音声（TTS）と動画の書き出し、完全な検査（npm run check）はコマンドで',
      '書き出す HTML は字を絞り込まない（fonttools がない）ので、コマンドで組んだものより大きくなります',
      'Chrome / Edge だけ（Safari・Firefox はフォルダを開く仕組みがありません）']],
  ],
  api: {
    notFound: '原稿が見つかりません', badRange: '範囲または本文が正しくありません', conflict: '原稿が変わっています。再読み込みしてください',
    savedButFailed: '保存しましたが、組み立てに失敗しました', badNarr: 'slideKey / stepKey / turns が正しくありません', noRev: 'rev（読み込んだときの版）がありません',
    narrConflict: '口述原稿が変わっています。再読み込みしてください', narrHead: '# 口述原稿\n', emptyComment: '指示が空です', noComment: 'コメントが見つかりません',
  },
};
const en = {
  brand: 'Motion Slides Editor', open: 'Other folder', edit: 'Edit (e)', narr: 'Narration (n)', comments: 'Notes (c)',
  check: 'Quick check', export: 'Export HTML', print: 'Print / PDF', presenter: 'Presenter view', full: 'Fullscreen', helpBtn: 'Help',
  welcomeTitle: 'Open a deck folder', welcomeLead: 'Nothing to install. Open a folder that contains deck.html to view and edit it here (Chrome / Edge).',
  unsupported: 'This browser cannot open folders. Please use Google Chrome or Microsoft Edge (desktop).',
  dropHere: 'Drop a folder here', openFolder: 'Open folder', newDeck: 'New deck',
  newTitle: 'Title', newLang: 'Language', newTheme: 'Theme', newHint: 'Next, choose where to save it. An empty folder is used as is; otherwise a new folder is made inside it.',
  newGo: 'Choose a folder and create', cancel: 'Cancel', recent: 'Recent folders', reopen: 'Open', forget: 'Remove from list',
  privacy: 'Files are read and written only inside the folder you choose, and are sent nowhere. Video, narration audio (TTS) and the full check stay on the command line (npm run …).',
  buildFailed: 'The deck could not be built', buildFailedHint: 'Fix the source and save; it rebuilds automatically (fixing it in Claude Code works too).', building: 'Building…',
  noPermission: 'No permission to read and write this folder', cannotOpen: 'This folder cannot be opened (moved or deleted?)', dropFolder: 'Please choose a folder, not a file',
  noDeck: 'No .html source (deck.html) in this folder', popupBlocked: 'Could not open a new window (allow pop-ups)', noFullscreen: 'Could not go fullscreen',
  slidesN: (n) => `${n} slides`, rebuilt: (t, why) => `${t} ${why === 'poll' ? 'reloaded outside changes' : why === 'save' ? 'saved and rebuilt' : 'built'}`,
  buildFailedAt: (t) => `${t} build failed`, warnings: (n) => `${n} warning${n === 1 ? '' : 's'}`, warnTitle: 'Build warnings',
  checkTitle: 'Quick check', checking: 'Checking…', checkFailed: 'Could not check (the deck did not answer)',
  checkSummary: (e, w) => `${e} errors · ${w} warnings`, checkNote: 'A subset of the checks that runs in the browser (overflow, font size, length, missing narration, contrast). The full check, including component determinism, is npm run check.',
  sevError: 'error', sevWarn: 'warning', wholeDeck: 'whole deck', slideN: (n, t) => `slide ${n}${t ? ': ' + t : ''}`,
  checkMsg: (c, a) => ({
    titleLong: `title is ${a} units (max 26)`, titleLongEn: `title is ${a} characters (max 60)`, conclLong: `conclusion is ${a} units (max 35)`, conclLongEn: `conclusion is ${a} characters (max 70)`,
    conclOverflow: 'conclusion overflows its box', overflowBottom: `body overflows at the bottom (${a}px)`, overflowRight: `body overflows to the right (${a}px)`, smallText: `text too small ${a}`,
    katexError: 'KaTeX error left in the slide', noNarration: `no narration (step ${a})`, contrast: `low contrast: ${a}`,
  }[c] || c),
  exporting: 'Exporting…', exportFailed: 'Could not export', exported: (t, mb) => `${t} exported (${mb} MB)`, exportedToast: 'Exported as a single HTML file. Double-click it to open.',
  exists: (f) => `${f} already exists`, created: (n) => `Created a new deck in “${n}”`,
  helpTitle: 'Help',
  help: [
    ['Edit slides', ['Press <kbd>e</kbd> or “Edit” for edit mode. Double-click text to edit that part of the source (deck.html). ⌘/Ctrl+Enter saves.',
      'Each save keeps a backup of the previous file in <code>.cache/edits/</code> (the newest 30).']],
    ['Narration', ['Press <kbd>n</kbd> or “Narration” to edit the narration (narration.md) of the step on screen, including speakers and order.']],
    ['Notes for Claude', [`<kbd>${MOD}</kbd>+click on a slide leaves a note in comments.json. <kbd>c</kbd> lists them.`,
      'Ask Claude Code to “handle the notes in comments.json”. When files change outside, the editor rebuilds automatically.']],
    ['Present', ['→ / Space next, ← previous, <kbd>a</kbd> autoplay, <kbd>l</kbd> lecture mode, <kbd>?</kbd> all keys.',
      '“Presenter view” (or <kbd>p</kbd>) opens a window with the narration and the next step. “Fullscreen” for the projector.']],
    ['Not here', ['Narration audio (TTS), video export and the full check (npm run check) stay on the command line.',
      'Exported HTML is not font-subset (no fonttools in the browser), so it is larger than a command-line build.',
      'Chrome / Edge only (Safari and Firefox cannot open folders).']],
  ],
  api: {
    notFound: 'Source not found', badRange: 'Bad range or text', conflict: 'The source has changed. Please reload',
    savedButFailed: 'Saved, but the build failed', badNarr: 'Bad slideKey / stepKey / turns', noRev: 'Missing rev (version when loaded)',
    narrConflict: 'The narration has changed. Please reload', narrHead: '# Narration\n', emptyComment: 'The note is empty', noComment: 'Note not found',
  },
};
export const T = EN ? en : ja;
// data-t="鍵" の要素に言葉を入れる
export function applyTexts() {
  document.documentElement.lang = EN ? 'en' : 'ja';
  for (const e of document.querySelectorAll('[data-t]')) { const v = T[e.getAttribute('data-t')]; if (typeof v === 'string') e.textContent = v; }
  const k = document.querySelectorAll('[data-key]');
  for (const e of k) e.title = e.textContent;
}
