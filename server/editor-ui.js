// 信頼する編集の画面。プレビュー（デッキの iframe）の外、開発サーバーの外枠（server/shell.js）と編集アプリ（app/main.js）の
// ページで動く。デッキの中の server/hints.js からの知らせ（hint）を受けて、ここが原稿を自分で読み、範囲と hash を確かめ、
// 自分の入力欄（原稿の欄・口述原稿の引き出し・コメントの欄・コメントの一覧）を見せる。書き込みはここのボタン
// （保存・残す・解決、⌘/Ctrl+Enter）を押したときだけ。デッキからの知らせは信頼しない（開く場所を指すだけ）
//
//   const ui = createEditorUI({
//     frame: () => iframe,                       プレビューの iframe
//     api(method, url, body) → Promise<{…, _status}>   /__dev/source?range=… などの開発サーバーと同じ問い合わせ（合言葉は外で付ける）
//     lang: 'ja' | 'en',
//     drawerHost: 要素,                            口述原稿の引き出しを入れる横並びの箱（iframe の隣に並ぶ）
//     beforeEdit?: async (kind) => bool,           編集モード（'edit'）・口述原稿（'narr'）を開く前（権利の確認など）
//     enabled?: () => bool,                        デッキを開いているか
//     reload?: () => void,                         プレビューを読み込み直す（衝突のとき）
//     store?: {get(k), set(k, v)},                 画面の状態と位置を覚える（開発サーバーの外枠は sessionStorage）
//     warnings?: () => string[],                   編集モードの札に出す組み立ての警告
//     markLabel?: string,                          信頼する板の印の言葉（既定は「編集中 — アプリ」／「Editing — app」）
//     extra?: {open?(), editing?()},               ほかの信頼する欄（編集アプリの音声の板 app/audio-panel.js）：開いているか（板を出す）、
//                                                  編集している最中か（録音している間など。プレビューを inert にする）
//     volatileComments?: () => bool,               コメントが保存されない（1 ファイルで開いている）とき true：コメントの一覧に知らせを出す
//     onPos?: (pos) => void,                       デッキの位置（{i, k, key, nextKey}）が変わった（ほかの欄が段階に付いていくため）
//     modeHost?: 要素,                             今のモード（「編集中」「発表の道具：ペン」「表示」。aria-live で知らせる）を入れる画面の端の帯（プレビューの外）
//     onRecord?: () => void,                       r（このページでもデッキからでも）：録音モードを開く（編集アプリ app/rec-mode.js。開発サーバーには無い）
//   })
// 信頼する編集の道具（編集モードの札・原稿の欄・コメントの欄と一覧・口述原稿の引き出し）は、どれもプレビューの外の横の板（#dev-side、
// drawerHost の中で iframe の隣）に出す。スライドの場所に重ねる欄はない。板の上には、デッキが自分の枠の外に描けない印（色の帯）を付ける。
// スライドの場所に見えるものは、どれもデッキが描けるもの：信じてよいのはこの板の道具だけ。
// 信頼する入力の欄で編集している間（原稿の欄・コメントの欄を開いている、口述原稿の欄に入力している・未保存の変更がある）は、
// プレビューを inert にしてクリックも鍵盤も受けない（欄への入力をデッキが横取りできない）。その間もデッキの位置の知らせは受け取るが、
// デッキからの知らせで板の欄を開け閉めしたり、編集中の口述原稿の段階を替えたりはしない（頼んでいない切り替えで編集から離されない）。
// 口述原稿の引き出しは、入力していなければ（欄から離れれば）今のスライドの段階に付いていく
// コメントの点（pin）：Alt/⌥+クリックの知らせが持つ点（スライドの座標 1280×720）を確かめて comments.json に残し、一覧と、プレビューの上に
// この画面が重ねる印（#dev-pins。pointer-events なし）で見せる。印の位置は、この画面が iframe の大きさから自分で求める
// （デッキは #stage を 1280×720 のまま、窓に収まる最大の倍率で真ん中に置く：kit/deck.js の fit）。デッキからの知らせは位置を変えない
//   ui.message(e)  プレビューからの message（e.source は呼ぶ側でも確かめる）。扱ったら true
//   ui.frameLoading(keepPos)  プレビューを読み込み直す前に呼ぶ（keepPos なら読み込んだ後に同じ位置へ戻す）
//   ui.reset()  別のデッキを開いた（入力は捨てる）
//   ui.toggleEdit(on?) / ui.toggleNarr(on?) / ui.toggleComments(on?) / ui.state()
//   ui.goStep(slideKey, stepKey)  プレビューをその段階へ動かす（録音モード。読み込み直している間は、読み込んだ後の位置を替える）
//   ui.side（信頼する横の板。ほかの欄はここに入れる）・ui.h（要素を作る）・ui.pos()・ui.slide(i)（{key, heading…}）・ui.refresh()（板と鍵を出し直す）
const STR = {
  en: {
    mark: 'Editing — app', editMode: 'Edit mode', where: (n, t) => 'Slide ' + n + (t ? ': ' + t : ''), locked: 'The slides do not take clicks while this editor is open', warn: 'Warnings ', editTip: (alt) => 'Double-click to edit · ' + alt + '+click to leave a comment · e to exit',
    save: 'Save', cancel: 'Cancel', editSrc: 'Edit HTML', closeEsc: 'Close (Esc)', editHint: '⌘/Ctrl+Enter to save · Esc to cancel · write math as \\( … \\)',
    loading: 'Loading…', loadFail: 'Could not load', stale: 'The HTML has changed. Please reload (this view was built from an older version)',
    saving: 'Saving…', saved: 'Saved', conflict: 'The HTML has changed. Please reload (copy what you typed first)', saveFail: 'Could not save', offline: 'Cannot reach the editor',
    reload: 'Reload', cPlace: 'e.g. make this line shorter / match the figure colors / add one example', cSave: 'Leave', cTitle: 'Comment', cHint: '⌘/Ctrl+Enter to leave · written to comments.json',
    cFail: 'Could not leave the comment', cDone: 'Comment left (comments.json)', cList: 'Comments (open)', cVolatile: 'Comments are not saved in an Egatari file (they disappear when you close it). To keep them, use a working folder.', closeC: 'Close (c)', resolve: 'Resolve', resolveT: 'Mark as done',
    toSlide: 'Click to go to the slide', nStale: (k) => 'You are editing a different step than the one shown (' + k + '). It will switch after you save or cancel',
    nLine: (n) => 'narration.md line ' + n, nNone: 'No script yet', revertT: 'Revert to before editing', nTitle: 'Script', step: 'Step ', closeN: 'Close (n)',
    discard: 'Discard unsaved changes?', slide: (n, t) => 'Slide ' + n + ': ' + t, dirty: 'Unsaved changes', nEmpty: 'No script for this step yet. Start with “Add a turn”',
    speaker: 'Speaker', expert: 'Explainer (Expert)', novice: 'Questioner (Novice)', tPlace: 'What to say. {cue} marks a sync point, {φ|phi} sets a reading',
    up: 'Move up', del: 'Delete', delT: 'Delete this turn', add: '+ Add a turn', nConflict: 'The script has changed. Please reload (copy what you typed first)',
    noChange: 'No changes', next: (k, other) => 'Next step (' + k + (other ? ', next slide' : '') + ')', noNext: 'No next step', noNarr: '(no script)',
    busy: 'Save or cancel the open editor first', noSlideKey: 'This step is not in the slides', noOpen: (alt) => 'No open comments. ' + alt + '+click on a slide to leave one',
    pinAt: (x, y) => 'at ' + x + ', ' + y + ' on the slide', pinT: 'Where you clicked (slide coordinates, 1280×720)',
    inkMark: 'Marker line', inkMarks: (n) => n + ' marker lines', inkT: 'The lines you drew (in comments.json as strokes)', inkMore: 'Keep drawing on the slide to add lines to this comment (up to 20)', inkFull: 'A comment holds at most 20 lines', ink: 'Marker (m)', inkTip: 'Circle or point to a spot, then add a comment (draw circles or arrows on the slide, several lines for one comment, then write it; the pen button of the slide controls also opens it, and so does d)',
    nUnsaved: 'The script is not saved. Save or revert it to use the preview again', nRevert: 'Revert',
    dateLocale: 'en-US',
    modeEdit: 'Editing', modeInk: 'Editing: marker', modeView: 'Viewing', modeTool: (t) => 'Presenter tool: ' + t, tools: { laser: 'Laser pointer', pen: 'Pen', vpen: 'Fading pen' }, modeLabel: 'Current mode',
  },
  ja: {
    mark: '編集中 — アプリ', editMode: '編集モード', where: (n, t) => 'スライド ' + n + (t ? '：' + t : ''), locked: 'この欄を開いている間、スライドはクリックを受けません', warn: '警告 ', editTip: (alt) => 'ダブルクリックで編集 · ' + alt + '+クリックでコメント · e で終了',
    save: '保存', cancel: 'キャンセル', editSrc: 'HTML を編集', closeEsc: '閉じる（Esc）', editHint: '⌘/Ctrl+Enter で保存 · Esc でキャンセル · 数式は \\( … \\) のまま書けます',
    loading: '読み込み中…', loadFail: '読み込めませんでした', stale: 'HTML が変わっています。再読み込みしてください（この画面は古い版から作られています）',
    saving: '保存中…', saved: '保存しました', conflict: 'HTML が変わっています。再読み込みしてください（入力した内容はコピーしておいてください）', saveFail: '保存できませんでした', offline: 'サーバーに繋がりません',
    reload: '再読み込み', cPlace: '例：この行をもっと短く / 図の色を合わせて / 例を一つ足して', cSave: '残す', cTitle: 'コメント', cHint: '⌘/Ctrl+Enter で残す · comments.json に書きます',
    cFail: '残せませんでした', cDone: 'コメントを残しました（comments.json）', cList: 'コメント（未対応）', cVolatile: 'Egatari ファイルではコメントは保存されません（閉じると消えます）。残すなら作業フォルダで', closeC: '閉じる（c）', resolve: '解決', resolveT: '対応済みにする',
    toSlide: 'クリックでそのスライドへ', nStale: (k) => '表示中のステップ（' + k + '）とは別のステップを編集中です。保存かキャンセルのあとで切り替わります',
    nLine: (n) => 'narration.md ' + n + ' 行目', nNone: 'まだ台本がありません', revertT: '編集前に戻す', nTitle: '台本', step: 'ステップ ', closeN: '閉じる（n）',
    discard: '保存していない変更を捨てますか', slide: (n, t) => 'スライド ' + n + '：' + t, dirty: '未保存の変更があります', nEmpty: 'このステップの台本はまだありません。「発言を足す」で書き始めます',
    speaker: '話者', expert: '説明する人（Expert）', novice: '質問する人（Novice）', tPlace: '話す内容。{cue} で同期点、{φ|ファイ} で読みを指定できます',
    up: '前へ', del: '削除', delT: 'この発言を消す', add: '＋ 発言を足す', nConflict: '台本が変わっています。再読み込みしてください（入力した内容はコピーしておいてください）',
    noChange: '変更はありません', next: (k, other) => '次のステップ（' + k + (other ? '、次のスライド' : '') + '）', noNext: '次のステップはありません', noNarr: '（台本なし）',
    busy: '開いている編集の欄を、先に保存するか取り消してください', noSlideKey: 'このステップはスライドにありません', noOpen: (alt) => '未対応のコメントはありません。スライドの上で ' + alt + '+クリックすると残せます',
    pinAt: (x, y) => 'スライドの ' + x + ', ' + y, pinT: '押した所（スライドの座標、1280×720）',
    inkMark: 'マーカーの線', inkMarks: (n) => 'マーカーの線 ' + n + ' 本', inkT: '描いた線（comments.json の strokes）', inkMore: 'スライドに続けて描くと、このコメントに線を足せます（20 本まで）', inkFull: '1 つのコメントの線は 20 本まで', ink: 'マーカー（m）', inkTip: '丸や矢印で場所を示して、コメントを付ける（スライドに描いてから書きます。1 つのコメントに何本でも。スライドの操作の帯のペンのボタンでも開く。d でも開く）',
    nUnsaved: '台本が保存されていません。保存するか元に戻すと、プレビューを操作できます', nRevert: '元に戻す',
    dateLocale: 'ja-JP',
    modeEdit: '編集中', modeInk: '編集中：マーカー', modeView: '表示', modeTool: (t) => '発表の道具：' + t, tools: { laser: 'レーザーポインター', pen: 'ペン', vpen: '消えるペン' }, modeLabel: '今のモード',
  },
};

const CSS = [
  '.edit-ui{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Hiragino Sans","BIZ UDPGothic",sans-serif;color:#1d2330;box-sizing:border-box}',
  '.edit-ui *{box-sizing:border-box}',
  '.edit-ui button{font:inherit;font-size:13px;border:1px solid #c7ccd6;background:#fff;color:#1d2330;border-radius:6px;padding:4px 10px;cursor:pointer}',
  '.edit-ui button:hover{background:#f1f3f7}.edit-ui button:disabled{opacity:.45;cursor:default}',
  '.dev-msg button{margin-left:8px;font-size:12px;padding:1px 8px}',
  '.edit-ui button.dv-pri{background:#2563eb;border-color:#2563eb;color:#fff}.edit-ui button.dv-pri:hover{background:#1d4fd8}',
  '.edit-ui button.dv-ghost{border-color:transparent;background:transparent;color:#5b6475;padding:2px 6px}',
  '.edit-ui textarea,.edit-ui select{font:inherit;color:#1d2330;background:#fff;border:1px solid #c7ccd6;border-radius:6px}',
  '.edit-ui textarea:focus,.edit-ui select:focus{outline:2px solid #93b4f5;outline-offset:0;border-color:#2563eb}',
  // 信頼する横の板（プレビューの外）。上の色の帯は、デッキが自分の枠の外には描けない印
  '#dev-side{flex:none;width:420px;max-width:45vw;background:#f7f8fb;border-left:1px solid #d9dde6;display:flex;flex-direction:column;min-height:0;overflow:auto}',
  '#dev-side[hidden]{display:none}',
  '#dev-mark{flex:none;position:sticky;top:0;z-index:2;background:#b45309;color:#fff;font-weight:700;font-size:13px;padding:6px 14px;letter-spacing:.02em;display:flex;align-items:center;gap:8px}',
  '#dev-mark::before{content:"";width:10px;height:10px;border-radius:50%;background:#fde68a;flex:none}',
  '.dev-card{flex:none;margin:10px 10px 0;background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.08)}',
  '#dev-badge{flex:none;display:none;flex-wrap:wrap;align-items:center;gap:4px 8px;background:#2563eb;color:#fff;padding:6px 14px;font-size:13px}',
  '#dev-badge.dv-on{display:flex}#dev-badge b{font-weight:700}#dev-badge span{opacity:.9;font-size:12px}',
  '#dev-badge .dv-warn{background:#f59e0b;color:#231400;border-radius:999px;padding:0 8px;cursor:pointer;opacity:1}',
  '.dev-where{color:#4b5363;font-size:12.5px;margin:-2px 0 8px}',
  '.dev-lock{color:#7a4b00;font-size:12px;margin-top:6px}',
  '#dev-narr .dev-lock{display:none;margin:0;padding:6px 14px;background:#fff;border-top:1px solid #e3e6ee}#dev-side.dv-locked #dev-narr .dev-lock{display:block}',
  'iframe.dev-locked{opacity:.55;filter:grayscale(.3)}',
  // 未保存の口述原稿でプレビューが止まっている間に、プレビューを押した・キーを押した：わけと、保存・元に戻すのボタン
  '#dev-narr .dv-notice{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:0 0 8px;padding:8px 10px;border-radius:8px;background:#fff4cc;border:1px solid #f0c040;color:#5a3a00;font-size:13px}',
  '#dev-narr .dv-notice:empty{display:none}#dev-narr .dv-notice span{flex:1 1 100%}',
  '#dev-mark{order:0}#dev-badge{order:1}#dev-editor{order:2}#dev-comment{order:3}#dev-comments{order:4}#dev-audio{order:5}#dev-narr{order:6}',
  '#dev-editor{padding:12px 14px}',
  '.dev-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.dev-head .dv-t{font-weight:700}.dev-head .dv-m{color:#6b7385;font-size:12px;font-family:ui-monospace,Menlo,monospace}.dev-head .dv-sp{flex:1}',
  '#dev-editor textarea{width:100%;min-height:96px;max-height:50vh;padding:8px 10px;font:13.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;white-space:pre-wrap}',
  '.dev-foot{display:flex;align-items:center;gap:8px;margin-top:8px}.dev-foot .dv-hint{color:#6b7385;font-size:12px;flex:1}',
  '.dev-msg{display:none;margin-top:8px;padding:6px 10px;border-radius:6px;font-size:13px}',
  '.dev-msg.dv-err{display:block;background:#fde8e8;color:#9b1c1c;border:1px solid #f5b5b5}.dev-msg.dv-ok{display:block;background:#e7f6ec;color:#16632f}',
  '#dev-comment{padding:12px 14px}',
  '#dev-comment .dv-q{color:#4b5363;background:#f4f5f8;border-left:3px solid #f59e0b;padding:4px 8px;margin-bottom:8px;font-size:12.5px;max-height:4.6em;overflow:hidden}',
  '#dev-comment textarea{width:100%;min-height:84px;padding:8px 10px;resize:vertical}',
  '#dev-comments{display:flex;flex-direction:column;max-height:50vh}',
  '#dev-comments .dev-head{padding:10px 12px 6px;margin:0;border-bottom:1px solid #e5e7ee}',
  '#dev-comments .dv-list{overflow:auto;padding:6px 8px 10px}',
  '.dev-c{padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}.dev-c:hover{background:#f4f6fb;border-color:#e0e5f0}',
  '.dev-c .dv-k{font-size:11.5px;color:#6b7385}.dev-c .dv-q{font-size:12px;color:#6b7385;border-left:2px solid #f59e0b;padding-left:6px;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dev-c .dv-c{white-space:pre-wrap}.dev-c .dv-row{display:flex;justify-content:flex-end;margin-top:4px}',
  '#dev-comments-volatile{margin:8px 8px 0;padding:6px 10px;border-radius:6px;font-size:12.5px;line-height:1.5;background:#fef3c7;color:#78350f;border:1px solid #f5d27a}',
  '.dev-empty{color:#8a91a1;padding:14px 8px;text-align:center}',
  '#dev-narr{flex:1 0 320px;background:#f7f8fb;border-top:1px solid #d9dde6;display:flex;flex-direction:column;min-height:0;margin-top:10px}',
  '#dev-narr .dev-head{padding:10px 14px;margin:0;background:#fff;border-bottom:1px solid #e3e6ee}',
  '#dev-narr .dv-sub{padding:6px 14px 0;color:#6b7385;font-size:12px}',
  '#dev-narr .dv-body{flex:1;overflow:auto;padding:8px 14px 14px}',
  '.dev-turn{background:#fff;border:1px solid #e0e4ec;border-radius:8px;padding:8px;margin-bottom:8px}',
  '.dev-turn .dv-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}.dev-turn .dv-row .dv-sp{flex:1}',
  '.dev-turn select{padding:2px 6px;font-size:13px}',
  '.dev-turn.novice{border-left:4px solid #f59e0b}.dev-turn.expert{border-left:4px solid #2563eb}',
  '.dev-turn textarea{width:100%;min-height:70px;padding:6px 8px;font-size:14px;line-height:1.6;resize:vertical}',
  '#dev-narr .dv-tools{display:flex;gap:8px;align-items:center;margin:4px 0 12px}',
  '#dev-narr .dv-next{border-top:1px dashed #cfd4de;padding-top:8px;color:#5b6475}',
  '#dev-narr .dv-next .dv-lab{font-size:12px;color:#8a91a1;margin-bottom:4px}#dev-narr .dv-next p{margin:0 0 6px;font-size:13px}',
  '#dev-narr .dv-next .dv-role{font-size:11px;color:#b7791f;margin-right:4px}',
  '#dev-narr .dv-foot{padding:10px 14px;background:#fff;border-top:1px solid #e3e6ee;display:flex;gap:8px;align-items:center}',
  '#dev-narr .dv-foot .dv-st{flex:1;font-size:12px;color:#6b7385}#dev-narr .dv-foot .dv-st.dv-dirty{color:#b45309}',
  '#dev-narr .dv-stale{display:none;margin:8px 0 0;padding:6px 8px;background:#fff7e6;border:1px solid #f5d38a;border-radius:6px;font-size:12.5px;color:#7a4b00}',
  '.dev-c .dv-n,#dev-comment .dv-n{display:inline-block;min-width:18px;height:18px;line-height:18px;text-align:center;border-radius:9px;background:#e11d48;color:#fff;font-size:11px;font-weight:700;margin-right:6px;padding:0 4px}',
  '#dev-comment .dv-n{background:#f59e0b}',
  '.dev-c .dv-p,#dev-comment .dv-p{font-size:11.5px;color:#9f1239;margin-left:6px}',
  '.dev-c.dv-sel{background:#fff1f3;border-color:#fecdd3}',
  // プレビューの上の点の印（信頼する画面が描く。クリックは下のプレビューへ通す）
  '#dev-pins{position:fixed;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:999}',
  '.dev-pin{position:fixed;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #e11d48;box-shadow:0 0 0 2px #fff,inset 0 0 0 1.5px #fff,0 1px 6px rgba(0,0,0,.4);pointer-events:none}',
  '.dev-pin i{position:absolute;background:#e11d48;box-shadow:0 0 0 1.5px #fff}',
  '.dev-pin i:nth-child(1){left:10.5px;top:-12px;width:3px;height:8px}.dev-pin i:nth-child(2){left:10.5px;top:28px;width:3px;height:8px}',
  '.dev-pin i:nth-child(3){left:-12px;top:10.5px;width:8px;height:3px}.dev-pin i:nth-child(4){left:28px;top:10.5px;width:8px;height:3px}',
  '.dev-pin b{position:absolute;left:24px;top:-26px;min-width:18px;height:18px;line-height:18px;text-align:center;border-radius:9px;background:#e11d48;color:#fff;font:700 11px/18px -apple-system,BlinkMacSystemFont,sans-serif;padding:0 4px;box-shadow:0 0 0 2px #fff}',
  '.dev-ink{position:fixed;overflow:visible;pointer-events:none}.dev-ink path{fill:none;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}',
  '.dev-ink .dv-halo{stroke:#fff;stroke-width:7px;opacity:.9}.dev-ink .dv-line{stroke:#e11d48;stroke-width:3.5px}.dev-ink.dv-new .dv-line{stroke:#f59e0b}',
  '#dev-badge .dv-ink{font:inherit;font-size:12px;color:#fff;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.55);border-radius:999px;padding:1px 10px;cursor:pointer}',
  '#dev-badge .dv-ink[aria-pressed=true]{background:#f59e0b;border-color:#f59e0b;color:#231400}',
  '.dev-pin.dv-new{border-color:#f59e0b}.dev-pin.dv-new i,.dev-pin.dv-new b{background:#f59e0b}',
  '.dev-pin.dv-flash{animation:dv-flash .45s ease-in-out 4}',
  '@keyframes dv-flash{50%{transform:scale(1.9);box-shadow:0 0 0 6px rgba(225,29,72,.35),0 1px 6px rgba(0,0,0,.45)}}',
  '@media (prefers-reduced-motion:reduce){.dev-pin.dv-flash{animation:none;outline:4px solid #e11d48;outline-offset:4px}}',
  // 今のモード（編集中・発表の道具・表示）。画面の端の帯（modeHost：編集アプリの下の帯・開発サーバーの外枠の下の帯）に置き、舞台に重ねない
  '#dev-mode{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:1.4;color:inherit;opacity:.85;white-space:nowrap}',
  '#dev-mode::before{content:"";width:8px;height:8px;border-radius:50%;background:#9aa3b2;flex:none}',
  '#dev-mode[data-ink]::before{background:#f59e0b}#dev-mode[data-mode=edit]:not([data-ink])::before{background:#2563eb}#dev-mode[data-mode=tool]::before{background:#e11d48}',
  '#dev-toast{position:fixed;z-index:1002;right:16px;bottom:22px;max-width:388px;background:#1d2330;color:#fff;padding:8px 16px;border-radius:8px;font-size:13.5px;box-shadow:0 4px 18px rgba(0,0,0,.35);display:none}',
  '#dev-toast.dv-warn{background:#92400e}#dev-toast.dv-err{background:#9b1c1c}',
  '@media (max-width:720px){#dev-side{position:fixed;right:0;top:0;bottom:0;max-width:100vw;width:100%;z-index:1000}#dev-side.dv-inking{top:auto;height:42vh}}',
  '#dev-comment .dv-more{color:#7a4b00;font-size:12px;margin:-2px 0 8px}#dev-side.dv-inking #dev-comment .dev-lock{display:none}',
].join('\n');

// 知らせの中身を確かめる（形が違えば捨てる）
const RANGE = /^\d{1,9}-\d{1,9}$/, HASH = /^[0-9a-f]{8}$/;
const str = (v, n) => (typeof v === 'string' && v.length <= n ? v : null);
const num = (v) => (Number.isFinite(+v) ? Math.max(-1e5, Math.min(1e5, +v)) : 0);
const rectOf = (r) => (r && typeof r === 'object' ? { l: num(r.l), t: num(r.t), r: num(r.r), b: num(r.b) } : { l: 0, t: 0, r: 0, b: 0 });
// 点（スライドの座標）：数でなければ捨て、スライドの外は端に寄せ、0.1 に丸める（kit/core/comment-core.mjs の normPin と同じ規則。
// 開発サーバーはこのファイルを 1 つのまま配るので、ここに写しを持つ）
const W = 1280, H = 720;
const pinOf = (p) => {
  if (!p || typeof p !== 'object' || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const c = (v, hi) => Math.round(Math.max(0, Math.min(hi, v)) * 10) / 10;
  return { x: c(p.x, W), y: c(p.y, H) };
};
// マーカーの線（strokes：線の並び、線は [[x, y], …]、スライドの座標）：kit/core/comment-core.mjs の normStrokes・entryStrokes・strokesCentroid と
// 同じ規則の写し（tools/test-ink-comments.mjs が同じ答えか確かめる）。線ごとに 2 点に満たなければ捨て、端に寄せて 0.1 に丸め、続けて同じ点は 1 つ、
// 500 点を超えれば Ramer–Douglas–Peucker で間引く。初めの 20 本を使い、点の合計が 2000 を超えれば全部を同じ誤差でさらに間引く。前の形の stroke は 1 本として読む
const STROKE_MAX = 500, STROKE_IN = 5000, STROKES_MAX = 20, STROKES_POINTS = 2000, STROKES_IN = 200, STROKES_IN_POINTS = 20000;
function strokeRdp(P, eps) {
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    const [ax, ay] = P[a], [bx, by] = P[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let best = -1, bd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = L ? Math.abs(dy * (P[i][0] - ax) - dx * (P[i][1] - ay)) / L : Math.hypot(P[i][0] - ax, P[i][1] - ay);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  return P.filter((_, i) => keep[i]);
}
const strokeC = (v, hi) => Math.round(Math.max(0, Math.min(hi, v)) * 10) / 10;
function strokeClean(s) {
  if (!Array.isArray(s) || s.length > STROKE_IN) return null;
  const out = [];
  for (const q of s) {
    if (!Array.isArray(q) || q.length < 2 || typeof q[0] !== 'number' || typeof q[1] !== 'number' || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
    const p = [strokeC(q[0], W), strokeC(q[1], H)], l = out[out.length - 1];
    if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p);
  }
  return out.length < 2 ? null : out;
}
function strokeSimplify(P, max) {
  let r = P;
  for (let eps = 0.25; r.length > max; eps *= 2) r = strokeRdp(P, eps);
  return r;
}
export function strokesOf(v) {
  if (!Array.isArray(v) || v.length > STROKES_IN) return null;
  let seen = 0;
  for (const s of v) if (Array.isArray(s)) seen += s.length;
  if (seen > STROKES_IN_POINTS) return null;
  const raw = [];
  for (const s of v) {
    const c = strokeClean(s);
    if (c) raw.push(strokeSimplify(c, STROKE_MAX));
    if (raw.length === STROKES_MAX) break;
  }
  if (!raw.length) return null;
  let r = raw;
  const total = (a) => a.reduce((n, P) => n + P.length, 0);
  for (let eps = 0.25; total(r) > STROKES_POINTS; eps *= 2) r = raw.map((P) => (P.length > 2 ? strokeRdp(P, eps) : P));
  return r;
}
export function entryStrokesOf(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.strokes !== undefined) return strokesOf(c.strokes);
  if (c.stroke !== undefined) return strokesOf([c.stroke]);
  return null;
}
export function strokesCentroidOf(S) {
  let sx = 0, sy = 0, sl = 0;
  for (const s of S) {
    for (let i = 1; i < s.length; i++) {
      const l = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      sx += l * (s[i][0] + s[i - 1][0]) / 2; sy += l * (s[i][1] + s[i - 1][1]) / 2; sl += l;
    }
  }
  return sl > 0 ? { x: strokeC(sx / sl, W), y: strokeC(sy / sl, H) } : { x: S[0][0][0], y: S[0][0][1] };
}
const splitKey = (key) => { const p = key.lastIndexOf(':'); return [key.slice(0, p), key.slice(p + 1)]; };
// 口述原稿の書き方（{cue}・{φ|ファイ}・{mark:…}）を外して読める文にする（次の段階の見せ方だけ）
const plain = (s) => String(s || '').replace(/\{([^{}|]*)\|[^{}]*\}/g, '$1').replace(/\{[^{}]*\}/g, '');

export function createEditorUI(o) {
  const doc = o.document || document;
  const win = doc.defaultView || window;
  const EN = o.lang === 'en';
  const L = EN ? STR.en : STR.ja;
  const ALT = /mac|iphone|ipad/i.test((win.navigator.userAgentData && win.navigator.userAgentData.platform) || win.navigator.platform || win.navigator.userAgent) ? '⌥ option' : 'Alt';
  const api = (m, u, b) => Promise.resolve(o.api(m, u, b)).then((j) => (j && typeof j === 'object' ? j : { _status: 0 }), () => ({ _status: 0, _offline: true }));
  const enabled = () => !o.enabled || o.enabled();
  const store = { get: (k) => { try { return o.store ? o.store.get(k) : null; } catch { return null; } }, set: (k, v) => { try { if (o.store) o.store.set(k, v); } catch { /* 使えない */ } } };
  const frameEl = () => o.frame();
  const frameWin = () => { const f = frameEl(); return f && f.contentWindow; };
  const post = (m) => { const w = frameWin(); if (w) w.postMessage(m, '*'); };
  const focusFrame = () => { const f = frameEl(); try { if (f) f.focus(); } catch { /* 無視 */ } };

  if (!doc.getElementById('dev-ui-style')) {
    const st = doc.createElement('style'); st.id = 'dev-ui-style'; st.textContent = CSS; doc.head.appendChild(st);
  }
  function h(tag, props, kids) {
    const e = doc.createElement(tag);
    for (const k in props || {}) {
      if (k === 'text') e.textContent = props[k];
      else if (k === 'on') for (const ev in props.on) e.addEventListener(ev, props.on[ev]);
      else if (k === 'cls') e.className = props[k];
      else e.setAttribute(k, props[k]);
    }
    for (const c of kids || []) if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    return e;
  }
  let toastTimer = 0;
  function toast(msg, kind) {
    let t = doc.getElementById('dev-toast');
    if (!t) { t = h('div', { id: 'dev-toast', cls: 'edit-ui', role: 'status' }); doc.body.appendChild(t); }
    t.textContent = msg; t.className = 'edit-ui ' + (kind ? 'dv-' + kind : ''); t.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.display = 'none'; }, kind === 'warn' ? 6000 : 2600);
  }
  // 信頼する横の板（プレビューの外）。編集の道具はどれもここに入れる
  const side = h('aside', { id: 'dev-side', cls: 'edit-ui', 'aria-label': o.markLabel || L.mark, hidden: '' }, [h('div', { id: 'dev-mark', text: o.markLabel || L.mark })]);
  o.drawerHost.appendChild(side);
  function showErr(msg, text, reload) {
    msg.className = 'dev-msg dv-err'; msg.textContent = text;
    // 再読み込み：入力は捨てて（衝突の知らせで「コピーしておいて」と伝えてある）、今の原稿から読み直す
    if (reload) msg.appendChild(h('button', { text: L.reload, on: { click: () => { closeEditor(true); if (narr) narr.dirty = false; if (o.reload) o.reload(); else narrFollow(true); } } }));
  }

  // ---------------------------------------------------------------- 状態
  let frameReloading = false;
  let editOn = false, pos = null, restorePos = null, info = null, target = null, ignored = 0;
  let editor = null, cbox = null, cpanel = null, commentsOpen = false, narrOpen = false, drawer = null, narr = null, narrFocus = false;
  // 点の印：一覧の未対応のコメントのうち点のあるもの（{id, n, key, pin}）、書いている途中の指示の点（{key, pin}）、光らせる印
  let pinList = [], pending = null, flash = null;
  // 信頼する入力の欄で編集しているか：原稿の欄・コメントの欄を開いている、口述原稿の欄に入力している（focus）・未保存の変更がある
  const extra = o.extra || {};
  // マーカーの欄が開いていて、マーカーの道具が入っている間は、プレビューに続けて線を描ける（欄は横の板にあり、描く所に重ならない）
  const inkDrawing = () => !!(cbox && cbox.ink && editOn && toolMode === 'ink');
  const editing = () => !!(editor || (cbox && !inkDrawing()) || (narr && (narr.dirty || narrFocus)) || (extra.editing && extra.editing()));
  // 板を出すか（何か開いているとき）と、編集している間のプレビューの鍵（inert：クリックも入力も受けない）
  function updateSide() {
    side.hidden = !(editOn || editor || cbox || cpanel || drawer || (extra.open && extra.open()));
    const lock = editing(), f = frameEl();
    if (f) { f.inert = lock; f.classList.toggle('dev-locked', lock); }
    side.classList.toggle('dv-locked', lock);
    side.classList.toggle('dv-inking', inkDrawing());
    if (!(narr && narr.dirty)) narrNotice(false);
    drawPins();
  }
  // ---------------------------------------------------------------- 点の印（プレビューの上に重ねる。クリックは通す）
  const pinLayer = h('div', { id: 'dev-pins', cls: 'edit-ui', 'aria-hidden': 'true' });
  doc.body.appendChild(pinLayer);
  const watched = new WeakSet();
  const ro = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => drawPins()) : null;
  win.addEventListener('resize', () => drawPins());
  // スライド（1280×720）が iframe の中でどこに見えるか：デッキの fit と同じく、収まる最大の倍率で真ん中（この画面が自分で求める）
  function slideBox() {
    const f = frameEl();
    if (!f || !f.isConnected) return null;
    if (ro && !watched.has(f)) { watched.add(f); ro.observe(f); }
    const w = f.clientWidth, hh = f.clientHeight;
    if (!(w > 0 && hh > 0)) return null;
    const r = f.getBoundingClientRect(), k = Math.min(w / W, hh / H);
    return { l: r.left + f.clientLeft + (w - W * k) / 2, t: r.top + f.clientTop + (hh - H * k) / 2, k };
  }
  function drawPins() {
    pinLayer.textContent = '';
    if (!pos || !enabled()) return;
    const show = commentsOpen ? pinList.filter((c) => c.key === pos.key) : [];
    if (pending && pending.key === pos.key) show.push({ ...pending, isNew: true });
    if (!show.length) return;
    const b = slideBox();
    if (!b) return;
    for (const c of show) {
      // 手書きの印：スライドの大きさの svg（viewBox 1280×720）を同じ位置と倍率で重ねる。プレビューの中（舞台の DOM）には描かない
      if (c.strokes) {
        // 線ごとに M から（線どうしを繋がない）
        const NS = 'http://www.w3.org/2000/svg', d = c.strokes.map((s) => 'M' + s.map((q) => q[0] + ' ' + q[1]).join('L')).join('');
        const svg = doc.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'dev-ink' + (c.isNew ? ' dv-new' : '')); svg.setAttribute('data-id', c.id || 'new');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', (W * b.k).toFixed(1)); svg.setAttribute('height', (H * b.k).toFixed(1));
        svg.style.left = b.l.toFixed(1) + 'px'; svg.style.top = b.t.toFixed(1) + 'px';
        for (const cls of ['dv-halo', 'dv-line']) { const pa = doc.createElementNS(NS, 'path'); pa.setAttribute('class', cls); pa.setAttribute('d', d); svg.appendChild(pa); }
        pinLayer.appendChild(svg);
      }
      const el = h('div', { cls: 'dev-pin' + (c.isNew ? ' dv-new' : ''), 'data-id': c.id || 'new' }, [h('i'), h('i'), h('i'), h('i'), c.n ? h('b', { text: String(c.n) }) : null]);
      el.style.left = (b.l + c.pin.x * b.k).toFixed(1) + 'px';
      el.style.top = (b.t + c.pin.y * b.k).toFixed(1) + 'px';
      if (flash && c.id === flash.id && Date.now() < flash.until) el.classList.add('dv-flash');
      pinLayer.appendChild(el);
    }
  }
  const busy = () => !!((editor && editor.ta.value !== editor.orig) || (cbox && cbox.ta.value.trim()));
  function sendState() { post({ type: 'edit-state', edit: editOn, target }); }
  function setTarget(t) { target = t; sendState(); }
  function saveUi() { store.set('dev-ui', { edit: editOn, narr: narrOpen, comments: commentsOpen }); }
  async function loadInfo() {
    const j = await api('GET', '/__dev/info');
    if (j._status === 200) info = { slides: Array.isArray(j.slides) ? j.slides : [], warn: Array.isArray(j.warn) ? j.warn : [] };
    return info;
  }
  const slideOf = (key) => (info ? info.slides.find((s) => s.key === key) : null);

  // ---------------------------------------------------------------- 今のモード（画面の端。編集モードと発表の道具は同時には使わない：#69）
  // 道具はデッキからの知らせ（tool）で知るだけ。編集モードに入ると、デッキ（kit/tools.js）が自分で道具を切って null を知らせてくる
  let toolMode = null;
  const modeEl = h('span', { id: 'dev-mode', cls: 'edit-ui', role: 'status', 'aria-live': 'polite', 'aria-label': L.modeLabel });
  if (o.modeHost) o.modeHost.appendChild(modeEl);
  function drawMode() {
    const kind = editOn ? 'edit' : toolMode && toolMode !== 'ink' ? 'tool' : 'view', ink = editOn && toolMode === 'ink';
    const text = kind === 'edit' ? (ink ? L.modeInk : L.modeEdit) : kind === 'tool' ? L.modeTool(L.tools[toolMode]) : L.modeView;
    if (ink) modeEl.setAttribute('data-ink', ''); else modeEl.removeAttribute('data-ink');
    inkBtn.setAttribute('aria-pressed', String(ink));
    modeEl.hidden = !enabled() && kind === 'view';
    if (modeEl.textContent !== text) modeEl.textContent = text;
    modeEl.setAttribute('data-mode', kind);
  }
  // ---------------------------------------------------------------- 編集モードの札
  // マーカー（コメントのペン）：編集モードの間だけ。押すと（m でも）デッキ（kit/tools.js の道具 ink）に頼み、描き終えた線がコメントの欄を開く
  const inkBtn = h('button', { cls: 'dv-ink', type: 'button', 'aria-pressed': 'false', text: L.ink, title: L.inkTip, on: { click: () => toggleInk() } });
  const badge = h('div', { id: 'dev-badge', cls: 'edit-ui' }, [h('b', { text: L.editMode }), h('span', { text: L.editTip(ALT) }), inkBtn]);
  side.appendChild(badge);
  function drawBadge() {
    badge.classList.toggle('dv-on', editOn);
    const old = badge.querySelector('.dv-warn'); if (old) old.remove();
    const warns = o.warnings ? o.warnings() : [];
    if (warns.length) badge.appendChild(h('span', { cls: 'dv-warn', text: L.warn + warns.length, title: warns.join('\n'), on: { click: () => win.alert(warns.join('\n')) } }));
    updateSide();
  }
  drawMode();
  function toggleInk(on) {
    on = on === undefined ? toolMode !== 'ink' : !!on;
    if (on && (!editOn || !enabled())) return false;
    post({ type: 'edit-ink', on });
    return true;
  }
  async function toggleEdit(on) {
    on = on === undefined ? !editOn : !!on;
    if (on && !enabled()) return false;
    if (on && o.beforeEdit && !(await o.beforeEdit('edit'))) return false;
    editOn = on;
    if (!on) closeEditor();
    // 全画面（編集アプリの「全画面」はプレビューの枠を全画面にする）のままだと、横の板が見えない：編集に入るときは全画面をやめる
    if (on && doc.fullscreenElement && doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
    drawBadge(); sendState(); saveUi(); drawMode();
    return true;
  }

  // 欄の中に、何を直しているか（今の位置のスライド）を信頼する板の側で見せる
  function whereLine() {
    if (!pos) return null;
    const sl = info && info.slides[pos.i];
    const t = sl ? String(sl.heading || sl.title || sl.key || '').replace(/\s+/g, ' ').trim() : '';
    return h('div', { cls: 'dev-where', text: L.where(pos.i + 1, t) });
  }
  // ---------------------------------------------------------------- 原稿の編集（デッキの edit の知らせ → ここで読む・確かめる・見せる・保存）
  function closeEditor(force) {
    if (!editor) return;
    if (!force && editor.ta.value !== editor.orig) return;
    editor.card.remove(); editor = null;
    if (target && !cbox) setTarget(null);
    updateSide();
    focusFrame();
  }
  function openEditor(hint) {
    const range = str(hint.src, 40), hh = str(hint.h, 8);
    if (!editOn || !range || !RANGE.test(range) || !hh || !HASH.test(hh)) return;
    if (busy()) { toast(L.busy, 'warn'); return; }
    closeEditor(true); closeComment(true);
    const tag = /^[a-z][a-z0-9-]{0,20}$/.test(String(hint.tag || '')) ? hint.tag : 'element';
    const ta = h('textarea', { spellcheck: 'false' });
    const msg = h('div', { cls: 'dev-msg' });
    const save = h('button', { cls: 'dv-pri', text: L.save });
    const cancel = h('button', { text: L.cancel });
    const card = h('div', { id: 'dev-editor', cls: 'edit-ui dev-card', role: 'dialog', 'aria-label': L.editSrc }, [
      h('div', { cls: 'dev-head' }, [h('span', { cls: 'dv-t', text: L.editSrc }), h('span', { cls: 'dv-m', text: '<' + tag + '> ' + range }), h('span', { cls: 'dv-sp' }),
        h('button', { cls: 'dv-ghost', text: '✕', title: L.closeEsc, on: { click: () => closeEditor(true) } })]),
      whereLine(),
      ta, msg,
      h('div', { cls: 'dev-foot' }, [h('span', { cls: 'dv-hint', text: L.editHint }), cancel, save]),
      h('div', { cls: 'dev-lock', text: L.locked }),
    ]);
    side.appendChild(card);
    const ed = editor = { card, ta, orig: '', h: null, range };
    updateSide();
    setTarget(range);
    ta.value = L.loading; ta.disabled = true; save.disabled = true;
    api('GET', '/__dev/source?range=' + encodeURIComponent(range)).then((j) => {
      if (editor !== ed) return;
      ta.disabled = false;
      if (j._status !== 200 || typeof j.text !== 'string') { ta.value = ''; showErr(msg, j._offline ? L.offline : (j.error || L.loadFail), j._status === 409); return; }
      ta.value = j.text; ed.orig = j.text; ed.h = j.h;
      // 知らせの hash（プレビューの組み立てのとき）と、今の原稿の hash が違えば保存しない
      if (j.h !== hh) showErr(msg, L.stale, true); else save.disabled = false;
      ta.rows = Math.min(16, Math.max(4, j.text.split('\n').length + 1));
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    ta.focus();
    function doSave() {
      if (save.disabled || editor !== ed) return;
      if (ta.value === ed.orig) { closeEditor(true); return; }
      save.disabled = true; save.textContent = L.saving;
      api('POST', '/__dev/edit', { range, h: ed.h, text: ta.value }).then((j) => {
        save.textContent = L.save;
        if (j._status === 200) {
          ed.orig = ta.value;
          closeEditor(true);
          toast(j.error || L.saved, j.error ? 'warn' : '');
        } else if (j._offline) { save.disabled = false; showErr(msg, L.offline); }
        else {
          save.disabled = j._status === 409;
          showErr(msg, j._status === 409 ? L.conflict : (j.error || L.saveFail), j._status === 409);
        }
      });
    }
    save.onclick = doSave;
    cancel.onclick = () => closeEditor(true);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeEditor(true); }
      e.stopPropagation();
    });
  }

  // ---------------------------------------------------------------- AI へのメモ（デッキの comment の知らせ）
  function closeComment(force) {
    if (!cbox) return;
    if (!force && cbox.ta.value.trim()) return;
    cbox.card.remove(); cbox = null; pending = null;
    post({ type: 'edit-ink-reset' });   // 書きかけのマーカーの線を捨てる（server/hints.js）
    if (target && !editor) setTarget(null);
    updateSide();
    focusFrame();
  }
  // 知らせ（Alt+クリックかマーカー）から、メモの場所：段階の鍵・要素の範囲・引用・点・線（マーカーは何本でも。点は全部の線の重心）
  function placeOf(hint) {
    const key = str(hint.key, 400), range = hint.src == null ? null : str(hint.src, 40);
    if (!key || (range !== null && !RANGE.test(range))) return null;
    // 引用：要素の字の頭（80 字）。押した所の近くの字（部品の中の札・語など）があれば前に付ける
    const q80 = (str(hint.quote, 400) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const near = (str(hint.near, 400) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const quote = (near && near !== q80 ? near + ' ｜ ' + q80 : q80).slice(0, 160);
    let pin = pinOf(hint.pin);
    const strokes = pin ? entryStrokesOf(hint) : null;
    if (strokes) pin = strokesCentroidOf(strokes);
    return { key, range, quote, pin, strokes };
  }
  function openComment(hint) {
    const at0 = placeOf(hint);
    if (!enabled() || !at0) return;
    if (busy()) { toast(L.busy, 'warn'); if (at0.strokes) post({ type: 'edit-ink-reset' }); return; }
    closeEditor(true); closeComment(true);
    let at = at0;
    const ta = h('textarea', { placeholder: L.cPlace });
    const msg = h('div', { cls: 'dev-msg' });
    const save = h('button', { cls: 'dv-pri', text: L.cSave });
    const pinRow = h('div', { cls: 'dev-where' });
    const qEl = h('div', { cls: 'dv-q' });
    const more = at.strokes ? h('div', { cls: 'dv-more', text: L.inkMore }) : null;
    function drawPlace() {
      pinRow.textContent = '';
      pinRow.hidden = !at.pin;
      if (at.pin) {
        pinRow.appendChild(h('span', { cls: 'dv-n', text: '●' }));
        if (at.strokes) pinRow.appendChild(h('span', { cls: 'dv-p dv-s', text: at.strokes.length > 1 ? L.inkMarks(at.strokes.length) : L.inkMark, title: L.inkT }));
        pinRow.appendChild(h('span', { cls: 'dv-p', text: L.pinAt(Math.round(at.pin.x), Math.round(at.pin.y)), title: L.pinT }));
      }
      qEl.textContent = at.quote; qEl.hidden = !at.quote;
      if (more) more.textContent = at.strokes && at.strokes.length >= 20 ? L.inkFull : L.inkMore;
      pending = at.pin ? { key: at.key, pin: at.pin, strokes: at.strokes } : null;
    }
    const card = h('div', { id: 'dev-comment', cls: 'edit-ui dev-card', role: 'dialog', 'aria-label': L.cTitle }, [
      h('div', { cls: 'dev-head' }, [h('span', { cls: 'dv-t', text: L.cTitle }), h('span', { cls: 'dv-m', text: at.key }), h('span', { cls: 'dv-sp' }),
        h('button', { cls: 'dv-ghost', text: '✕', title: L.closeEsc, on: { click: () => closeComment(true) } })]),
      whereLine(),
      pinRow, more, qEl,
      ta, msg,
      h('div', { cls: 'dev-foot' }, [h('span', { cls: 'dv-hint', text: L.cHint }), h('button', { text: L.cancel, on: { click: () => closeComment(true) } }), save]),
      h('div', { cls: 'dev-lock', text: L.locked }),
    ]);
    side.appendChild(card);
    // マーカー：欄が開いている間も描いた線は、同じメモに足す（同じ段階の知らせだけ。引用・範囲・点は全部の線の重心の下から取り直す）
    const box = cbox = { card, ta, ink: !!at.strokes, addInk(h2) {
      if (cbox !== box) return false;
      const a2 = placeOf(h2);
      if (!a2 || !a2.strokes || a2.key !== at.key) return false;
      at = a2; drawPlace(); drawPins();
      return true;
    } };
    drawPlace();
    updateSide();
    setTarget('#comment');
    ta.focus();
    function doSave() {
      if (!ta.value.trim() || cbox !== box) return;
      save.disabled = true;
      const { key, range, quote, pin, strokes } = at;
      api('POST', '/__dev/comment', { key, range, quote, ...(pin ? { pin } : {}), ...(strokes ? { strokes } : {}), comment: ta.value }).then((j) => {
        if (j._status !== 200) { save.disabled = false; showErr(msg, j._offline ? L.offline : (j.error || L.cFail)); return; }
        ta.value = ''; closeComment(true); toast(L.cDone);
        if (commentsOpen) loadComments();
      });
    }
    save.onclick = doSave;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeComment(true); }
      e.stopPropagation();
    });
  }

  // ---------------------------------------------------------------- コメントの一覧（c）
  function toggleComments(on) {
    on = on === undefined ? !commentsOpen : !!on;
    if (on && !enabled()) return;
    commentsOpen = on; mark('comments', on);
    if (cpanel) { cpanel.remove(); cpanel = null; }
    if (commentsOpen) {
      cpanel = h('div', { id: 'dev-comments', cls: 'edit-ui dev-card', role: 'dialog', 'aria-label': L.cList }, [
        h('div', { cls: 'dev-head' }, [h('span', { cls: 'dv-t', text: L.cList }), h('span', { cls: 'dv-sp' }),
          h('button', { cls: 'dv-ghost', text: '✕', title: L.closeC, on: { click: () => toggleComments(false) } })]),
        o.volatileComments && o.volatileComments() ? h('div', { id: 'dev-comments-volatile', role: 'note', text: L.cVolatile }) : null,
        h('div', { cls: 'dv-list' }, [h('div', { cls: 'dev-empty', text: L.loading })]),
      ]);
      side.appendChild(cpanel);
      loadComments();
    } else { pinList = []; focusFrame(); }
    updateSide();
    saveUi();
  }
  function loadComments() {
    api('GET', '/__dev/comments').then((list) => {
      if (!cpanel) return;
      const box = cpanel.querySelector('.dv-list'); box.innerHTML = '';
      const open = (Array.isArray(list) ? list : []).filter((c) => c && c.status === 'open');
      // comments.json は手でも直せるので、読んだ点もここで確かめ直す
      pinList = [];
      open.forEach((c, i) => { const p = pinOf(c.pin); if (p) pinList.push({ id: String(c.id), n: i + 1, key: String(c.key), pin: p, strokes: entryStrokesOf(c) }); });
      drawPins();
      if (!open.length) { box.appendChild(h('div', { cls: 'dev-empty', text: L.noOpen(ALT) })); return; }
      open.forEach((c, i) => {
        const when = new Date(c.created), p = pinOf(c.pin);
        const item = h('div', { cls: 'dev-c', title: L.toSlide, 'data-id': String(c.id) }, [
          h('div', { cls: 'dv-k' }, [p ? h('span', { cls: 'dv-n', text: String(i + 1) }) : null,
            String(c.key) + (isNaN(when) ? '' : ' · ' + when.toLocaleString(L.dateLocale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
            p && entryStrokesOf(c) ? h('span', { cls: 'dv-p dv-s', text: entryStrokesOf(c).length > 1 ? L.inkMarks(entryStrokesOf(c).length) : L.inkMark, title: L.inkT }) : null,
            p ? h('span', { cls: 'dv-p', text: L.pinAt(Math.round(p.x), Math.round(p.y)), title: L.pinT }) : null]),
          c.quote ? h('div', { cls: 'dv-q', text: String(c.quote) }) : null,
          h('div', { cls: 'dv-c', text: String(c.comment) }),
          h('div', { cls: 'dv-row' }, [h('button', { text: L.resolve, title: L.resolveT, on: { click: (e) => {
            e.stopPropagation();
            api('POST', '/__dev/comment/resolve', { id: c.id }).then(() => loadComments());
          } } })]),
        ]);
        // その段階へ移り、点の印を光らせる（移った後の deck-pos でも描き直す）
        item.addEventListener('click', () => {
          for (const x of box.querySelectorAll('.dev-c.dv-sel')) x.classList.remove('dv-sel');
          item.classList.add('dv-sel');
          flash = p ? { id: String(c.id), until: Date.now() + 2000 } : null;
          post({ type: 'edit-go-key', key: String(c.key) });
          drawPins();
        });
        box.appendChild(item);
      });
    });
  }

  // ---------------------------------------------------------------- 口述原稿の引き出し（n）
  async function toggleNarr(on) {
    on = on === undefined ? !narrOpen : !!on;
    if (on === narrOpen) return true;
    if (!on && narr && narr.dirty && !win.confirm(L.discard)) return false;
    if (on && !enabled()) return false;
    if (on && o.beforeEdit && !(await o.beforeEdit('narr'))) return false;
    narrOpen = on; mark('narr', on);
    if (drawer) { drawer.remove(); drawer = null; narr = null; narrFocus = false; }
    if (narrOpen) {
      drawer = h('aside', { id: 'dev-narr', cls: 'edit-ui', 'aria-label': L.nTitle });
      // 口述原稿の欄（文字と話者）に入っている間は「編集している」。欄から離れたら、その間に動いた位置に付いていく
      const field = (t) => !!(t && t.matches && t.matches('textarea, select'));
      drawer.addEventListener('focusin', (e) => { if (field(e.target)) { narrFocus = true; updateSide(); } });
      drawer.addEventListener('focusout', (e) => {
        if (field(e.relatedTarget) && drawer && drawer.contains(e.relatedTarget)) return;
        narrFocus = false; updateSide();
        if (narr && !narr.dirty) setTimeout(() => { if (!narrFocus && narr && !narr.dirty) narrFollow(); }, 0);
      });
      side.appendChild(drawer);
      narrFollow(true);
    } else focusFrame();
    updateSide();
    saveUi();
    return true;
  }
  function narrFollow(force) {
    if (!drawer || !pos) { if (drawer && !narr) drawer.textContent = ''; return; }
    const key = pos.key;
    if (!force && narr && narr.key === key) { renderNext(); return; }
    if (!force && narrFocus && narr && !narr.dirty) return;   // 入力している間は段階を替えない（欄から離れたら付いていく）
    if (narr && narr.dirty) {
      if (narr.key === key) return;
      const stale = drawer.querySelector('.dv-stale');
      if (stale) { stale.style.display = 'block'; stale.textContent = L.nStale(key); }
      return;
    }
    const sk = splitKey(key);
    // edit：入力のたびに増える版。保存の応答は、送った版が今も同じときだけ「保存した」にする（保存の途中の入力を未保存のまま残す）
    const cur = narr = { key, slideKey: sk[0], stepKey: sk[1], turns: [], dirty: false, edit: 0, i: pos.i };
    renderDrawer(true);
    Promise.all([info ? info : loadInfo(), api('GET', '/__dev/narration?key=' + encodeURIComponent(key))]).then(([, j]) => {
      if (narr !== cur) return;
      if (j._status !== 200) { cur.error = j._offline ? L.offline : (j.error || L.loadFail); renderDrawer(false); return; }
      cur.turns = (Array.isArray(j.turns) ? j.turns : []).map((t) => ({ role: t.role === 'novice' ? 'novice' : 'expert', text: String(t.text ?? '') }));
      cur.line = j.line; cur.rev = j.rev;
      if (!slideOf(cur.slideKey)) cur.error = L.noSlideKey;
      renderDrawer(false);
    });
  }
  function renderDrawer(loading) {
    drawer.innerHTML = '';
    const s = slideOf(narr.slideKey);
    const title = (s && (s.heading || s.title)) || narr.slideKey;
    const status = h('span', { cls: 'dv-st', text: narr.line ? L.nLine(narr.line) : L.nNone });
    const saveBtn = h('button', { cls: 'dv-pri', text: L.save });
    const revert = h('button', { text: L.cancel, title: L.revertT });
    const body = h('div', { cls: 'dv-body' });
    drawer.appendChild(h('div', { cls: 'dev-head' }, [h('span', { cls: 'dv-t', text: L.nTitle }), h('span', { cls: 'dv-m', text: L.step + narr.stepKey }), h('span', { cls: 'dv-sp' }),
      h('button', { cls: 'dv-ghost', text: '✕', title: L.closeN, on: { click: () => toggleNarr(false) } })]));
    drawer.appendChild(h('div', { cls: 'dv-sub', text: L.slide(narr.i + 1, String(title).replace(/\s+/g, ' ').trim()) }));
    drawer.appendChild(body);
    // 未保存のわけを知らせる所（live region。中身は narrNotice が入れる）
    body.appendChild(h('div', { cls: 'dv-notice', role: 'status', 'aria-live': 'polite' }));
    drawer.appendChild(h('div', { cls: 'dv-foot' }, [status, revert, saveBtn]));
    drawer.appendChild(h('div', { cls: 'dev-lock', text: L.locked }));
    const stale = h('div', { cls: 'dv-stale' }); body.appendChild(stale);
    const nmsg = h('div', { cls: 'dev-msg' }); body.appendChild(nmsg);
    if (loading) { saveBtn.disabled = true; body.appendChild(h('div', { cls: 'dev-empty', text: L.loading })); return; }
    if (narr.error) { saveBtn.disabled = true; showErr(nmsg, narr.error); return; }
    const markDirty = () => { narr.edit++; narr.dirty = true; status.textContent = L.dirty; status.className = 'dv-st dv-dirty'; updateSide(); };
    const list = h('div', { cls: 'dv-turns' }); body.appendChild(list);
    function drawTurns() {
      list.innerHTML = '';
      if (!narr.turns.length) list.appendChild(h('div', { cls: 'dev-empty', text: L.nEmpty }));
      narr.turns.forEach((t, j) => {
        const sel = h('select', { 'aria-label': L.speaker }, [h('option', { value: 'expert', text: L.expert }), h('option', { value: 'novice', text: L.novice })]);
        sel.value = t.role;
        const ta = h('textarea', { placeholder: L.tPlace });
        ta.value = t.text;
        const card = h('div', { cls: 'dev-turn ' + t.role }, [
          h('div', { cls: 'dv-row' }, [sel, h('span', { cls: 'dv-sp' }),
            j > 0 ? h('button', { cls: 'dv-ghost', text: '↑', title: L.up, on: { click: () => { const x = narr.turns.splice(j, 1)[0]; narr.turns.splice(j - 1, 0, x); markDirty(); drawTurns(); } } }) : null,
            h('button', { cls: 'dv-ghost', text: L.del, title: L.delT, on: { click: () => { narr.turns.splice(j, 1); markDirty(); drawTurns(); } } })]),
          ta]);
        sel.addEventListener('change', () => { t.role = sel.value; card.className = 'dev-turn ' + t.role; markDirty(); });
        ta.addEventListener('input', () => { t.text = ta.value; markDirty(); });
        ta.addEventListener('keydown', keys);
        list.appendChild(card);
      });
    }
    drawTurns();
    const last = () => (narr.turns.length ? narr.turns[narr.turns.length - 1].role : 'novice');
    body.appendChild(h('div', { cls: 'dv-tools' }, [h('button', { text: L.add, on: { click: () => {
      narr.turns.push({ role: last() === 'expert' ? 'novice' : 'expert', text: '' }); markDirty(); drawTurns();
      const tas = list.querySelectorAll('textarea'); if (tas.length) tas[tas.length - 1].focus();
    } } })]));
    const next = h('div', { cls: 'dv-next' }); body.appendChild(next);
    renderNext(next);
    const cur = narr;
    function doSave() {
      if (saveBtn.disabled || narr !== cur) return;
      saveBtn.disabled = true; saveBtn.textContent = L.saving;
      const sent = cur.edit;
      api('POST', '/__dev/narration', { slideKey: cur.slideKey, stepKey: cur.stepKey, turns: cur.turns.map((t) => ({ ...t })), rev: cur.rev }).then((j) => {
        saveBtn.textContent = L.save;
        if (j._status === 409) { showErr(nmsg, L.nConflict, true); return; }
        saveBtn.disabled = false;
        if (j._status !== 200) { status.textContent = j._offline ? L.offline : (j.error || L.saveFail); status.className = 'dv-st dv-dirty'; return; }
        if (j.rev) cur.rev = j.rev;
        // 送った後に入力があれば（版が進んだ）、未保存のまま：欄の中身を替えず、デッキに付いていかず、プレビューは inert のまま
        if (cur.edit !== sent) { status.textContent = L.dirty; status.className = 'dv-st dv-dirty'; updateSide(); return; }
        cur.dirty = false; status.textContent = j.changed ? L.saved : L.noChange; status.className = 'dv-st'; updateSide();
        if (narr === cur && pos && pos.key !== cur.key) narrFollow(true);
      });
    }
    function keys(e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); focusFrame(); }
      e.stopPropagation();
    }
    saveBtn.onclick = doSave;
    revert.onclick = () => { cur.dirty = false; narrFocus = false; updateSide(); narrFollow(true); };
    cur.actions = { save: doSave, revert: () => revert.onclick() };
  }
  function renderNext(box) {
    box = box || (drawer && drawer.querySelector('.dv-next'));
    if (!box || !pos || !narr) return;
    const nk = typeof pos.nextKey === 'string' ? pos.nextKey : null;
    box.innerHTML = '';
    box.appendChild(h('div', { cls: 'dv-lab', text: nk ? L.next(splitKey(nk)[1], splitKey(nk)[0] !== narr.slideKey) : L.noNext }));
    if (!nk) return;
    const want = nk;
    api('GET', '/__dev/narration?key=' + encodeURIComponent(nk)).then((j) => {
      if (!box.isConnected || !pos || pos.nextKey !== want) return;
      const turns = Array.isArray(j.turns) ? j.turns : [];
      if (!turns.length) box.appendChild(h('p', { text: L.noNarr }));
      for (const t of turns) box.appendChild(h('p', {}, [t.role === 'novice' ? h('span', { cls: 'dv-role', text: 'Novice' }) : null, plain(t.text)]));
    });
  }

  // ---------------------------------------------------------------- 止まっているプレビューを押した・キーを押した（#3・#8）
  // 未保存の口述原稿でプレビューが inert のとき：わけ（と保存・元に戻すのボタン）を引き出しに出す。
  // 口述原稿の欄に入っているだけ（未保存の変更なし）のとき：欄から離れれば inert が解けるので、押した点ではプレビューにフォーカスを渡す
  // （inert の枠は押しても受けないので、そのままでは最初のクリックが失われる）
  function narrNotice(on) {
    const box = drawer && drawer.querySelector('.dv-notice');
    if (!box) return;
    if (!on) { if (box.firstChild) box.textContent = ''; return; }
    const cur = narr;
    box.textContent = '';
    box.appendChild(h('span', { text: L.nUnsaved }));
    box.appendChild(h('button', { cls: 'dv-pri', text: L.save, on: { click: () => { if (cur.actions) cur.actions.save(); } } }));
    box.appendChild(h('button', { text: L.nRevert, title: L.revertT, on: { click: () => { if (cur.actions) cur.actions.revert(); focusFrame(); } } }));
    try { box.scrollIntoView({ block: 'nearest' }); } catch { /* 無視 */ }
  }
  // 口述原稿のほかに止めているもの（原稿の欄・コメントの欄・音声の板の録音・録音モード）があるか
  const otherLock = () => !!(editor || cbox || (extra.editing && extra.editing()));
  function inFrameBox(x, y) {
    const f = frameEl();
    if (!f || !f.isConnected) return false;
    const r = f.getBoundingClientRect();
    return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  }
  doc.addEventListener('pointerdown', (e) => {
    const f = frameEl();
    if (!f || !f.inert || !narr || otherLock() || side.contains(e.target) || !inFrameBox(e.clientX, e.clientY)) return;
    if (narr.dirty) { narrNotice(true); return; }
    if (narrFocus) {
      // 欄から離れる（focusout で inert が解ける）→ プレビューにフォーカス。押したことでフォーカスが body に移らないように既定の動きは止める
      e.preventDefault();
      const a = doc.activeElement; if (a && drawer && drawer.contains(a)) a.blur();
      if (!editing()) focusFrame();
    }
  }, true);

  // ---------------------------------------------------------------- Esc：開いている窓を閉じる（#48）
  // 上のもの（後に開いたもの）から 1 つずつ。all（Shift+Esc）なら全部。書いている途中の原稿の欄・コメントの欄がいちばん上。
  // o.panels：この板の外の窓（音声・横の板など）[{name, isOpen(), close()}]。開いた順は mark(name, on) で覚える（知らなければいちばん下）
  const opened = new Map();
  let openSeq = 0;
  function mark(name, on) { if (on) opened.set(name, ++openSeq); else opened.delete(name); }
  function escape(all, fromDeck) {
    const list = [
      { name: 'editor', isOpen: () => !!editor, close: () => closeEditor(!fromDeck), top: true },
      { name: 'comment', isOpen: () => !!cbox, close: () => closeComment(!fromDeck), top: true },
      { name: 'narr', isOpen: () => narrOpen, close: () => toggleNarr(false) },
      { name: 'comments', isOpen: () => commentsOpen, close: () => toggleComments(false) },
      ...(typeof o.panels === 'function' ? o.panels() : o.panels || []),
    ].filter((p) => p.isOpen());
    const rank = (p) => (p.top ? Infinity : opened.get(p.name) || 0);
    list.sort((a, b) => rank(b) - rank(a));
    for (const p of all ? list : list.slice(0, 1)) { p.close(); if (!p.top) mark(p.name, false); }
    return list.length > 0;
  }
  // 段階（スライドの鍵・段階の鍵）へプレビューを動かす（録音モード）。読み込み直している間は、読み込み後に戻す位置を替える。
  // concl は k に大きな数を送る（実行系が段階の最大に収める）
  async function goStep(slideKey, stepKey) {
    if (!info) await loadInfo();
    const i = info ? info.slides.findIndex((s) => s.key === slideKey) : -1;
    if (i < 0) return false;
    const k = stepKey === 'concl' ? 9999 : /^\d+$/.test(String(stepKey)) ? +stepKey : 0;
    if (restorePos) restorePos = { i, k }; else post({ type: 'deck-cmd', cmd: 'goto', i, k });
    return true;
  }
  // 番号でその枚へ（スライド一覧の足す・削除・並べ替えの後）。読み込み直している間（frameLoading の後、ready の前）は、読み込んだ後の位置にする
  function goIndex(i, k = 0) {
    if (frameReloading) restorePos = { i, k }; else post({ type: 'deck-cmd', cmd: 'goto', i, k });
  }
  // ---------------------------------------------------------------- 鍵盤（このページで押したものと、デッキから知らされたもの）
  function key(k, fromDeck, shift = false) {
    if (!enabled()) return;
    if (k === 'e') toggleEdit();
    else if (k === 'n') { if (fromDeck && narr && narr.dirty) toast(L.busy, 'warn'); else toggleNarr(); }
    else if (k === 'c') toggleComments();
    else if (k === 'm') { if (editOn) toggleInk(); }
    else if (k === 'r') { if (o.onRecord) o.onRecord(); }   // 録音モードを開く（開くだけ。録音はこのページのキーでしか始まらない）
    else if (k === 'Escape') { if (!escape(shift, fromDeck) && editOn && toolMode === 'ink') toggleInk(false); }   // 閉じる窓がなければマーカーを切る
  }
  // 編集の画面の枠（見出し・状態の行・ボタン）にフォーカスがあるときの送りのキー：プレビューに送る（deck-cmd の key。プレビューは親の窓から
  // 届いたものだけを受ける：kit/deck.js）。キーの出来事は作らない。f はプレビューの枠を全画面にする（中のデッキは押されていないので全画面にできない）。
  // 送らないもの：Space・Enter（フォーカスのあるボタンを押すキー）、入力の欄・口述原稿の引き出し・開いた窓・メニューや一覧の中、
  // プレビューが止まっているとき（編集している間・録音モード。未保存の口述原稿なら、わけを出す）、編集モードの間の b・a・f（#69）
  const FWD = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'b', 'a', 'f'];
  const WIDGET = '[role=menu],[role=menuitem],[role=menubar],[role=listbox],[role=option],[role=tablist],[role=tab],[role=radiogroup],[role=slider],[role=tree],[role=grid],[role=dialog],[role=alertdialog],dialog';
  function forwardKey(e) {
    const t = e.target;
    if (!enabled() || (t && t.closest && (t.closest('#dev-narr') || t.closest(WIDGET)))) return;
    // 一覧（role=menu）か窓が開いている間は送らない（編集アプリの道具の列の「ファイル ▾」など。focus が一覧の外にあっても）
    if (doc.querySelector('[role=menu]:not([hidden]), dialog[open]')) return;
    const f = frameEl();
    if (!f || !f.isConnected) return;
    if (f.inert || editing()) { if (narr && narr.dirty && !otherLock()) narrNotice(true); return; }
    if (editOn && (e.key === 'a' || e.key === 'b' || e.key === 'f')) return;   // 編集モードの間は発表の道具（自動再生・暗転・全画面）を使わない（#69。デッキの側でも受けない）
    e.preventDefault();
    if (e.key === 'f') {
      if (doc.fullscreenElement) { if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {}); }
      else if (f.requestFullscreen) f.requestFullscreen().then(() => focusFrame(), () => {});
      return;
    }
    post({ type: 'deck-cmd', cmd: 'key', key: e.key });
  }
  doc.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (doc.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { key('Escape', false, e.shiftKey); return; }
    if (e.shiftKey) return;
    if (["e", "n", "c", "r", "m"].includes(e.key)) key(e.key, false);
    else if (FWD.includes(e.key)) forwardKey(e);
  });

  // ---------------------------------------------------------------- プレビューからの知らせ
  function message(e) {
    const w = frameWin();
    if (!w || e.source !== w) return false;
    const m = e.data;
    if (!m || typeof m !== 'object') return false;
    if (m.type === 'deck-pos') {
      if (typeof m.key !== 'string' || m.key.length > 400 || !m.key.includes(':')) return true;
      if (restorePos) return true;     // 読み込み直した直後の最初の位置（1 枚目）では、覚えている位置を上書きしない
      pos = { i: Math.max(0, Math.floor(num(m.i))), k: Math.max(0, Math.floor(num(m.k))), key: m.key, nextKey: typeof m.nextKey === 'string' ? m.nextKey : null };
      store.set('dev-pos', { i: pos.i, k: pos.k });
      if (narrOpen) narrFollow();
      drawPins();
      if (o.onPos) o.onPos({ ...pos });
      return true;
    }
    if (m.type !== 'edit-hint') return false;
    if (m.kind === 'tool') {
      toolMode = ['laser', 'pen', 'vpen'].includes(m.mode) || (m.mode === 'ink' && editOn) ? m.mode : null;
      drawMode(); updateSide();
      return true;
    }
    if (m.kind === 'ready') {
      const r = restorePos; restorePos = null; frameReloading = false;
      if (r) post({ type: 'deck-cmd', cmd: 'goto', i: r.i, k: r.k });
      sendState(); drawBadge(); drawMode();
      loadInfo().then(() => { if (narrOpen && (!narr || !(narr.dirty || narrFocus))) narrFollow(true); });
      if (commentsOpen) loadComments();
      return true;
    }
    // 信頼する欄で編集している間は、デッキからの知らせで板の欄を開け閉め・切り替えしない（頼んでいない切り替えで編集から離されない。
    // 本当にキーを押したのなら、プレビューは inert なのでデッキには届かない：知らせはデッキが自分で送ったもの）
    // マーカーの欄が開いている間に描いた線は、そのメモに足す。ほかの欄を開く知らせ（Alt+クリック・ダブルクリック）は受けない
    if (m.kind === 'comment' && cbox && cbox.ink && cbox.addInk(m)) return true;
    if (cbox && (m.kind === 'comment' || m.kind === 'edit')) { ignored++; if (m.strokes) post({ type: 'edit-ink-reset' }); return true; }
    if (editing() && (m.kind === 'key' || m.kind === 'edit' || m.kind === 'comment')) { ignored++; if (m.kind === 'comment' && m.strokes) post({ type: 'edit-ink-reset' }); return true; }
    if (m.kind === 'key' && typeof m.key === 'string') key(m.key, true);
    else if (m.kind === 'edit') openEditor(m);
    else if (m.kind === 'comment') openComment(m);
    return true;
  }
  // 読み込み直す前に：位置を覚えておき、読み込んだ後の ready で戻す。開いたままの欄で未保存でないものは閉じる（場所が変わるので）
  function frameLoading(keepPos) {
    restorePos = keepPos && pos ? { i: pos.i, k: pos.k } : null;
    frameReloading = true;
    closeEditor(false);
  }
  function reset() {
    closeEditor(true); closeComment(true);
    if (narr) narr.dirty = false;
    pos = null; restorePos = null; frameReloading = false; info = null; target = null; pinList = []; pending = null; flash = null;
    if (drawer) { drawer.remove(); drawer = null; narr = null; }
    narrOpen = false; editOn = false; toolMode = null;
    if (cpanel) { cpanel.remove(); cpanel = null; } commentsOpen = false;
    drawBadge(); drawMode();
    updateSide();
  }
  // 外枠のページを読み込み直したとき（開発サーバー）：覚えていた状態と位置に戻す
  function restoreSaved(hashSlide) {
    const ui = store.get('dev-ui') || {}, p = store.get('dev-pos');
    if (p && Number.isFinite(p.i) && (hashSlide === null || hashSlide === p.i)) restorePos = { i: p.i, k: p.k };
    if (ui.edit) toggleEdit(true);
    if (ui.narr) toggleNarr(true);
    if (ui.comments) toggleComments(true);
  }
  return {
    message, frameLoading, reset, restoreSaved, toggleEdit, toggleInk, toggleNarr, toggleComments, toast, mark, escape, goStep, goIndex, busy: () => editing(),
    side, h, pos: () => (pos ? { ...pos } : null), slide: (i) => (info && info.slides[i]) || null, loadInfo, refresh: () => updateSide(),
    state: () => ({ edit: editOn, narr: narrOpen, comments: commentsOpen, editor: editor ? { range: editor.range, dirty: editor.ta.value !== editor.orig } : null,
      mode: modeEl.getAttribute('data-mode'), modeText: modeEl.textContent, tool: toolMode,
      comment: !!cbox, pins: pinLayer.querySelectorAll('.dev-pin').length, strokes: pinLayer.querySelectorAll('.dev-ink').length, pos: pos && { ...pos }, narrKey: narr ? narr.key : null, narrDirty: !!(narr && narr.dirty), editing: editing(), ignored }),
  };
}
