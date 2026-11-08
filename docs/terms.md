# Egatari terms (English-first)

Generated from build_terms.py. Source language: English. `avoid` lists old or wrong words that lint:terms flags. `internal` is the spec/code name, which never changes.

## Format and files

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| egatari-file | Egatari file | Egatari ファイル | A single .ega.html file that plays and can be opened and edited in the editor. | 1 ファイル ・ 持ち運べる / portable file | portable (spec) | 2026-10-25 (owner) |
| play-only | Play-only | 再生専用 | An Egatari file without the editable source, for participants. | 再生のみ ・ 参加者に配る再生のみ版 / play only | play-only derivative (spec) | 2026-10-25 (owner) |
| lesson | Lesson | 教材 | The whole thing a user makes and shares (one Egatari file); スライド is only the slide part. | デッキ ・ 資料（教材の意味で） / deck |  | 2026-10-25 (standards) |
| slides | Slides | スライド | The slide content of a lesson (deck.html). Editing the markup itself is “Edit HTML”. 原稿 is avoided in UI strings only; the format’s “editable source” (spec, sourceSha256) keeps its name in technical docs. | 原稿 ・ デッキ / deck | deck.html | 2026-10-24 (owner) |
| script | Script | 台本 | What is spoken, step by step (narration.md). | 口述原稿 ・ ナレーション原稿 / narration | narration.md | 2026-10-24 (owner) |
| export-script | Export script | 台本を書き出す | Save the script of the steps that need audio as one file, for generating audio in the cloud. | 声の依頼ファイル ・ tts-job.json（画面で） | tts-job.json | 2026-10-24 (owner) |
| file-info | File info | ファイルの情報 | Title, license, creators and attachments of the file. | 教材の情報 / Lesson info | metadata | 2026-10-24 (owner) |
| created-by | Created by | 作成者 | The people who made the lesson (metadata.creators), shown in File info in the editor and the player. | 作り手 | creators | 2026-11-04 (owner) |
| sample | Samples | サンプル | Example lessons shipped with the editor. | 見本 ・ 見本の教材 / examples |  | 2026-10-24 (owner) |
| play-sample | Play | 再生 | Button of a sample on the first screen: plays the sample large in a window (backlog #130). | 見る（このボタンで） | playExample | 2026-11-03 (standards) |
| make-like-sample | Make one based on this sample | このサンプルを参考に作る | Main button of the sample window (and the link on egatari.org's samples page): opens New… with the sample's structure, setting, theme and parts filled in; only step 2 is empty. The line under it: 「構成・テーマ・パーツを引き継ぎます。中身はあなたの題材で新しく作ります」 / “Keeps its structure, theme and parts; the content is new, from your topic.” | このサンプルのように作る; Make one like this sample | ?from-sample=<name> | 2026-11-05 (owner) |
| from-sample | From the sample | サンプルから | Badge on an answer or a part in New… that came from the sample; it disappears once the answer is changed. |  | draft.from | 2026-11-03 (standards) |
| open-copy | Open a copy to edit | コピーを開いて編集 | Small button of the sample window: opens the sample file like any file, to edit a copy. | 写しを開いて直す | openPortable | 2026-11-03 (standards) |
| heading-and-point | Heading and point | 見出しと要点 | What the sample's structure gives for each slide, added to the instructions in New… (sample.json structure). | 言いたいこと | structure: [{heading, point}] | 2026-11-03 (standards) |
| template | Template | テンプレート | A slide layout used when inserting a slide, and the starting set of slides for a new lesson. | 雛形 |  | 2026-10-24 (owner) |
| zip-file | ZIP file | ZIP ファイル | A compressed archive (theme import, cloud audio result). | zip / zip |  | 2026-10-25 (standards) |
| offline-editor | Offline editor | オフライン版のエディタ | The editor saved as one HTML file to use without a network. | 1 つの HTML にしたエディタ ・ 1 ファイル版 |  | 2026-10-25 (standards) |
| learner | Learner | 学習者 | A person studying with a lesson (pedagogy and help text). In Live, and for play-only recipients in menus, use 参加者 / participant. | 学ぶ人 |  | 2026-10-25 (standards) |

## Structure and playback

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| slide | Slide | スライド | One screen of a lesson. |  | slide | 2026-10-24 (owner) |
| step | Step | ステップ | One click-forward within a slide; the order things appear in, matching what is said. | 段階 | step (spec) | 2026-10-22 (owner) |
| cue | Timing | タイミング | A point inside a step where an animation follows a word of the script. Shown only when a part uses it and in recording mode. | 合図 ・ キュー ・ 区切り（タイミングの意味で） | {cue} | 2026-10-24 (owner) |
| emphasis | Emphasis | 強調 | A mark drawn on the slide when the script reaches a word (underline, circle, box…). | 注目の演出 ・ 印 / attention mark | {mark} | 2026-10-25 (owner) |
| slide-show | Slide show | スライドショー | Presenting mode; the presenter moves step by step. |  | talk (spec) | 2026-10-24 (owner) |
| preview-later | Show later steps faintly | 先のステップを薄く見せる | An option of Slide show, like captions: later steps of the slide appear faintly while the current one is shown. Key l. | 授業 ・ 授業モード ・ 授業の表示 / Lecture, Lecture mode, Lecture view | preview option (spec §1.2); ?mode=lecture legacy alias | 2026-10-25 (owner) |
| video | Video | 動画 | Plays by itself along the timeline; used to record video. |  | video (spec) | 2026-10-24 (owner) |
| play-pause | Play / Pause | 再生 / 一時停止 | Playback in Slide show (Player P1): plays the lesson along the timeline with its narration; pausing resumes from the same point. The toolbar's previous / next keep playing. Self-study uses it: the former self-study mode (spec learn) was removed in Egatari Player 1.4.0. Replaces the self-study row (backlog #108): the mode was removed, so it needs no name. |  | autoplay / talk playback (Player P1) | 2026-11-07 (standards) |
| playback-speed | Playback speed | 再生速度 | Toolbar button and < / > keys in Slide show: 0.75, 1, 1.25, 1.5 or 2×, keeping the pitch of the narration. |  | rate (Player P1) | 2026-11-07 (standards) |
| stage | Slide (pane) | スライド（窓） | The 16:9 area that shows one slide at a time with its motion (spec: the stage pane, 1280×720 coordinates). In the UI it is called スライド; the spec word stage is not shown. | ステージ | stage (spec, Player P2) | 2026-10-26 (standards) |
| book | Book | 本 | The read face of a lesson (the article), shown as a scrolled text or as pages, single or as a spread; a pane beside or instead of the slides (key r). | 読む面 / read face | article / read face (spec §9C) | 2026-10-26 (owner) |
| read-with-script | Read with script | 台本で読む | For a lesson without a book: the slides shown small in a column, each followed by its steps' script, like a handout (spec: the text pane without an article). Key r. | ノート表示 / Notes view | text pane, narration (Player P2) | 2026-10-26 (standards) |
| book-scroll | Scrolling | スクロール | Book shown as one scrolled column (spec layout flow). Acrobat ja wording. | フロー表示 | flow (Player P2) | 2026-10-26 (standards) |
| book-single-page | Single page | 単一ページ | Book shown one page at a time. | 片ページ | pages=single | 2026-10-26 (standards) |
| book-spread | Two-page view | 見開きページ | Book shown two pages side by side; chosen automatically on wide screens. | スプレッド | pages=spread | 2026-10-26 (standards) |
| slides-and-book | Slides and book | スライドと本 | Layout with the slides and the book side by side (spec split). Without a book: スライドと台本 / Slides and script. | 分割表示 ・ スプリット / Split view | split (Player P2) | 2026-10-29 (standards) |
| read-in-book | Read in the book | 本で読む | Link on a slide to the section of the book that goes with it; opens Slides and book (or the book alone on narrow screens). | 続きを読む ・ 本文へ / Continue reading | stage→article link (spec §9C.5) | 2026-10-29 (standards) |
| watch-on-slides | Watch on slides | スライドで見る | Link in the book that shows the slide's step over the text with its motion; closing returns to the place being read. | この部分を見る ・ 動きを見る / See this part | article→stage link (spec §9C.5) | 2026-10-29 (standards) |
| back-to-playing | Back to the playing part | 再生中の所に戻る | Shown when the viewer scrolls the book away while narration plays; brings the book back to the current turn and resumes following. Kindle / lyrics wording. | 同期に戻る / Resync | detach sync (Player P2) | 2026-10-29 (standards) |
| book-may-not-match | Slides and book may not match | スライドと本が合っていないかもしれません | Editor notice when a linked section or step changed after the link was checked (spec §9C.7). | 古いかも ・ 不整合 / stale (in the UI) | articleLinks staleness (spec §9C.7) | 2026-10-29 (standards) |
| toolbar | Toolbar | ツールバー | The bar of playback and presentation controls at the bottom of the player; it hides and comes back when the mouse moves to the bottom or the screen is tapped. Its small faint handle is labelled ツールバーを表示 / Show toolbar. Google Slides / PowerPoint wording. | 操作の帯 ・ コントロールバー / control bar |  | 2026-10-26 (standards) |
| presentation-bar | presentation bar | 発表の帯 | Egatari Viewer v0.7: the bar of presentation controls in the Viewer (the player's bar today, unchanged). It has no visible label in the UI; the name is for docs, specs and code reviews only. Viewer v0.7 term (not in the UI yet). |  |  | 2026-11-05 (owner) |
| markup-bar | Markup | マークアップ | Egatari Viewer v0.7: the learner's bar for marking up a lesson while reading or viewing (highlight, pen, note, recall, export), and its toggle button at the right end of the presentation bar. The name iPad uses for its pen bar (Photos, PDF, Notes). Viewer v0.7 term (not in the UI yet). 書き込み stays an avoid word (of comment); 「学習モード」 is avoided because the modes were removed. Spec and docs keep “annotation” as the umbrella term (W3C Web Annotation, spec annotations.md); the learner's pen in this bar is the existing term pen (ペン), its tooltip says it is saved. | 学習モード / annotation bar ・ writing bar |  | 2026-11-06 (owner) |
| highlight | Highlight | ハイライト | Egatari Viewer v0.7: a learner's colour mark over text in the book or script (Kindle, Apple Books). Not the Studio edit tool marker (マーカー). Viewer v0.7 term (not in the UI yet). マーカー / Marker stays the Studio edit-mode tool. |  |  | 2026-11-06 (owner) |
| note | Note | メモ | Egatari Viewer v0.7: a learner's note anchored to text, a figure or a slide (Kindle, Apple Books). Not comment (コメント), which stays the note to the AI. Viewer v0.7 term (not in the UI yet). コメント / Comment stays the note to the AI. |  |  | 2026-11-06 (owner) |
| recall | Recall | 暗記 | Egatari Viewer v0.7: the switch in the markup bar that hides highlighted text; tapping reveals it one by one. Viewer v0.7 term (not in the UI yet). |  |  | 2026-11-06 (owner) |
| presenter-view | Presenter view | 発表者ビュー | A second window with the script, next step and tools (key p). |  |  | 2026-10-24 (owner) |
| black-screen | Black screen | 黒い画面 | Blank the screen during a presentation (key b). | 暗転 / blackout |  | 2026-10-25 (owner) |
| laser-pointer | Laser pointer | レーザーポインター | A pointer dot during a presentation (key x). | レーザー / laser |  | 2026-10-25 (owner) |
| pen | Pen | ペン | Draw on the slide during a presentation (key d). |  |  |  (owner) |
| marker | Marker | マーカー | In edit mode, circle or point at a place and attach a comment (key m). Not the cue layer. | 手書きメモ ・ 印をつけてメモ / ink note | strokes (§13) | 2026-10-25 (owner) |
| comment | Comment | コメント | A note to the AI (or a collaborator) asking for a change at a place. | AI へのメモ ・ 書き込み / note for the AI | comments.json | 2026-10-25 (owner) |
| thumbnail | Thumbnail | サムネイル | A small picture of a slide. | 縮図 |  | 2026-10-25 (owner) |
| player | Player | プレーヤー | The part of an Egatari file that plays the lesson. The one Egatari ships is Egatari Player; other players may exist (spec §4.1). | 再生器 / runtime (UI) | player (spec §4.1) | 2026-10-25 (owner) |
| egatari-player | Egatari Player | Egatari Player | Product name of the player bundled in files made by Egatari Studio, and used by Egatari Viewer. Never translated; has its own version. | Egatari プレーヤー ・ Studio のプレーヤー / Studio player | player.name egatari-player | 2026-10-25 (owner) |
| egatari-viewer | Egatari Viewer | Egatari Viewer | The web app that opens and plays Egatari files (viewer.egatari.org; home-screen name Ega Viewer; icon え). Never translated. | Egatari Play ・ ビューア（単独で） / Egatari Play | play-site | 2026-10-25 (owner) |
| egatari-studio | Egatari Studio | Egatari Studio | The editor (studio.egatari.org; icon す). Never translated. | エディター（製品名として） / Egatari Editor |  | 2026-10-25 (owner) |
| format-version | Format | 形式 | In the file information panel: the Egatari format version the file follows, e.g. “Format: Egatari 1.0”. | 仕様の版 ・ 規格 / spec version | version (spec) | 2026-10-25 (standards) |
| made-with | Made with | 作成 | In the file information panel: the software that wrote the file, e.g. “Made with: Egatari Studio 0.6.0”. Shown after Format and Player. Panel order: 形式 → プレーヤー → 作成. | 生成 ・ ジェネレーター / Generator | generator (spec) | 2026-10-25 (standards) |
| earlier-draft-file | File from an earlier version | 前の版のファイル | A file made before the Egatari 1.0 file shape. It plays; to edit it, open it in the earlier Studio or follow the migration guide. | 古い形式 ・ 非対応のファイル / legacy file, unsupported file | pre-1.0 draft (spec §7.1) | 2026-10-25 (standards) |

## Audio

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| ai-voice | AI voice | AI 音声 | Audio generated by speech synthesis. | TTS（画面で） / TTS | kind: tts | 2026-10-24 (owner) |
| recording | Recording | 録音 | Audio recorded with a microphone. |  | kind: recorded |  (owner) |
| recording-mode | Recording mode | 録音モード | Full-screen script with keyboard-only recording (key r). |  |  |  (owner) |
| read-aloud | Listen with read-aloud | 読み上げで聞く | The device's voice reads the script; no audio file is made. | 端末の声 | speechSynthesis | 2026-10-24 (owner) |
| audio-update | Update audio (n steps) | 音声を更新（n ステップ） | Regenerate audio for steps whose script or voice changed. | 古い音声を作り直す | stale | 2026-10-24 (owner) |
| needs-update | Audio needs updating | 音声の更新が必要 | The script changed after this audio was made. | 音声が古い ・ 印付き | stale | 2026-10-24 (owner) |
| generate-cloud | Make AI voice in the cloud (Google Colab) | AI 音声をクラウドで作る（Google Colab） | Generate audio in a Colab notebook and import the result. | Colab で音声を作る ・ WebGPU がないとき |  | 2026-10-25 (owner) |
| generate-local | Make AI voice on this computer | AI 音声をこの PC で作る | Generate audio in the browser (needs a fast GPU). | ブラウザの TTS | WebGPU | 2026-10-25 (owner) |
| explainer | Explainer | 説明する人 | The main speaker of a two-speaker script. |  | Expert (spec) | 2026-10-25 (owner) |
| questioner | Questioner | 質問する人 | The second speaker, voicing the learner's questions. |  | Novice (spec) | 2026-10-25 (owner) |
| voice-sample | Preview voice | ▶ 試聴 | Play a short sample of a voice. | 見本（声の） / Sample (voice) |  | 2026-10-25 (standards) |

## New lesson, insert, revise (chat AI)

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| new | New… | 新規作成… | Create a lesson by asking a chat AI. | 新しいデッキ |  | 2026-10-24 (owner) |
| chat-ai | Chat AI | チャットの AI | ChatGPT, Gemini, Claude and similar chat services. |  |  |  (owner) |
| instructions | Instructions | 指示 | The text copied to the chat AI (pack plus request). | 頼む文 ・ AI への指示書 / pack | pack | 2026-10-25 (owner) |
| fix-request | Fix request | 修正依頼 | Instructions asking the AI to fix findings and comments. | 是正依頼 ・ 直しの依頼 |  | 2026-10-20 (owner) |
| ai-output | The AI's output | AI の出力 | What the chat AI returns. | AI の返事 / reply |  | 2026-10-25 (owner) |
| code-block | Code block | コードブロック | A grey box in the AI's output holding one file. First mention: 灰色の枠（コードブロック）. | 囲み / fence |  | 2026-10-25 (owner) |
| create | Create | 作成 | Final button of New: build the lesson from the pasted output. | 開く / Open |  | 2026-10-25 (owner) |
| insert | Insert | 挿入 | Final button of Insert slides. |  |  | 2026-10-25 (owner) |
| replace | Replace | 置き換える | Final button of Revise. | 取り込む / Import |  | 2026-10-25 (owner) |
| setting | Setting | 使う場面 | Where the lesson will be used (question: Where will you use it?). | 場面 ・ 大分類 ・ 小分類 / kind, category | category/subcategory | 2026-10-25 (owner) |
| subjects | Subjects | 内容の分野 | Part sets for a subject, offered when inserting slides for a different chat (question: Will the slides need any of these?). New… lists parts instead (backlog #124). Headings use 内容の分野; running text may say 分野. | 系列 ・ 教科 / series | series | 2026-10-25 (owner) |
| subject-english | English (foreign language) | 英語 | The subject tile for English as a foreign language (parts series english). The en label says (foreign language) so that it is not confused with the lesson language English. | 語学 / English (subject) | series english | 2026-10-26 (owner) |
| subject-music | Music | 音楽 | The subject tile for music (parts series music: keyboard, score). |  | series music | 2026-10-26 (owner) |
| light-instructions | Light instructions | 軽量の指示 | The shorter instructions for any chat AI (New… step 4, option 「軽量（どの AI でも）」 / “Light (any AI)”, marked 「迷ったらこちら」 / “If unsure”; the default). Suggested size limit 45 KB and 31,000 UTF-16 code units plus line feeds so that a paste is not cut, whichever is reached first; depending on the parts chosen, part descriptions are shortened or some parts are left out. Shown short as 軽量 / Light in the answered line. | 無料のプラン ・ 無料版 / free plan | plan: free | 2026-11-07 (owner, replaces free-plan; the pack text is unchanged) |
| detailed-instructions | Detailed instructions | 詳細の指示 | The long instructions that describe every part in full (New… step 4, option 「詳細（有料の AI 向け）」 / “Detailed (for paid AI plans)”), for chat AIs that read long text. Suggested size limit 150 KB (a cap, not unlimited); Save the instructions as a file is the primary action. Shown short as 詳細 / Detailed in the answered line. | 有料のプラン ・ 有料版 ・ 無制限 / paid plan ・ unlimited | plan: paid | 2026-11-07 (owner, replaces paid-plan; 無制限 is false, the cap is 150 KB) |
| tools | Tools | 道具 | Parts the AI uses only when ticked (e.g. Timer); in New… they are listed under Time-boxing. |  | group: tool | 2026-10-25 (owner) |
| standard-parts | Standard parts | 標準パーツ | Parts ticked from the start in New… (the standard tier of the parts library). | 共通の部品 ・ 共通パーツ ・ 共通の図 / common parts | common | 2026-10-25 (owner) |
| parts-in-instructions | Parts in these instructions | この指示に入るパーツ | The parts whose notes are in the copied instructions. | 使える図 | loadedParts | 2026-10-25 (owner) |
| what-to-convey | What to convey | 伝えたいこと | The 15 tiles (compare, change, …, place/map); turning one off tells the AI not to use it. | 言いたいこと ・ 表し方（見出しで） / purposes | purposes | 2026-10-25 (owner) |
| title | Title (shown on the cover) | タイトル（表紙に出ます） | The lesson's title, used on the cover as written. | 題材 / topic |  | 2026-10-25 (owner) |
| leave-to-ai | Leave it to the AI | AI に任せる | The chosen state of an optional field: the AI decides. | 空のまま ・ 選ばなくてよい |  | 2026-10-25 (owner) |

## Parts and themes

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| parts-library | Parts library | パーツライブラリ | The released collection of parts (egatari/components). | 部品庫 / components library (UI) | egatari/components | 2026-10-25 (standards) |
| part | Part | パーツ | An animated figure with its own steps (m-…). | 部品 ・ 動く図 / component (UI) | component | 2026-10-22 (owner) |
| interactive-parts | Interactive parts | 操作できるパーツ | Parts the viewer can operate (counts, numbers, cards); marked with a different frame and a badge. |  | interactive: true | 2026-10-25 (owner) |
| theme | Theme | テーマ | Colours, fonts and logo of the slides. | デザインアドオン | theme | 2026-10-24 (owner) |
| change-theme | Change theme… | テーマを変更… | Switch the lesson's theme (Slide menu). | テーマを変える… |  | 2026-10-25 (standards) |
| load-theme | Load theme… | テーマを読み込む… | Add a theme from a ZIP file or a theme folder. | ほかのテーマを読み込む… |  | 2026-10-25 (standards) |
| drag-and-drop | Drag a file here | ここにファイルをドラッグ＆ドロップ | Drop zone on the start screen, e.g. “.ega.html ファイルをここにドラッグ＆ドロップ”. Follows Google Drive / Windows wording. | 落とす（ファイルを置く意味で） / Drop … here (alone) |  | 2026-10-29 (standards) |
| exported-file | File exported from a working folder | 作業フォルダから書き出したファイル | A .ega.html made from a working folder (index.exportedFrom). Say what it is and that edits here do not change the folder; most people who open it have no folder. | 写し（書き出したファイルの意味で） ・ フォルダには入りません / copy (for an exported file) | exportedFrom (spec §3.1) | 2026-10-29 (standards) |
| no-upload | Not uploaded | アップロードしません | Privacy line: the app reads and writes files on the device and uploads nothing, e.g. 「ファイルはどこにもアップロードしません」. Usual wording of browser-only tools. | 送りません（プライバシーの文で） ・ 送信しません（同） / sent (in the privacy line) |  | 2026-10-29 (standards) |
| my-themes | My themes | 自分のテーマ | Themes loaded by the user. | テーマのフォルダ…（画面で） |  | 2026-10-25 (standards) |

## Quality

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| quality-control | Quality control | 品質管理 | The whole system of standards, checks and fix requests. |  |  | 2026-10-20 (owner) |
| standards | Standards | 規格 | Rules that the AI and people follow (R-fit…). One is “a standard”. | 決まり / rules | R-* | 2026-10-20 (owner) |
| quality-check | Quality check | 品質チェック | Checking a lesson against the standards. | 検査 ・ 簡易チェック / check, lint | check.mjs | 2026-10-20 (owner) |
| finding | Finding | 指摘 | Something the quality check found. | 知らせ ・ エラーの文 / message |  | 2026-10-20 (owner) |

## Live

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| live | Live | ライブ | A time-limited session where participants send questions and answer polls. | 授業の部屋 ・ 部屋 / room (UI) | room (spec) | 2026-10-22 (owner) |
| live-time | Live time | ライブの時間 | When the live session is open. | 時間の窓 / window (UI) | window (spec) | 2026-10-22 (owner) |
| host | Host | ホスト | The person who runs the live session. | 教員 ・ 先生（ライブの側） / teacher |  | 2026-10-22 (owner) |
| participant | Participant | 参加者 | A person who joins the live session. | 学ぶ人 ・ 受講者 / learner (UI) |  | 2026-10-22 (owner) |
| join-code | Join code | 参加コード | The code to join a live session. | 参加の鍵 ・ 鍵 / key (UI) | key (spec) | 2026-10-22 (owner) |
| host-link | Host link | ホスト用リンク | The link that opens the host page. | 教員の鍵 |  | 2026-10-22 (owner) |
| waiting-room | Waiting room | 待機室 | Where participants wait for the host's approval. | 承認 |  | 2026-10-22 (owner) |
| questions-polls | Questions and polls | 質問・投票 | Activities in a live session. | 活動 ・ Q&A / activities | activities | 2026-10-22 (owner) |
| show-everyone | Show to everyone | 全員に表示 | Reveal results to all participants. | 映す |  | 2026-10-22 (owner) |

## Buttons and common words

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| cancel | Cancel | キャンセル | Close a dialog without doing anything. | 取消 |  | 2026-10-25 (standards) |
| save | Save / Save as… | 保存／名前を付けて保存… |  | 新しい教材として保存 ・ 別のファイルに保存 |  | 2026-10-24 (owner) |
| saved | Saved / Unsaved | 保存済み／未保存 | Save status label. |  |  | 2026-10-24 (owner) |
| enable-editing | Edit this file? [Enable editing] | このファイルを編集しますか ［編集を有効にする］ | Asked once before editing a file. The prompt itself is called 編集の確認 / the editing prompt. | 権利の確認 |  | 2026-10-24 (owner) |
| export | Export | エクスポート | Save the lesson in another form (menu action). Its messages use the same word: エクスポートしました. One word per action: the message repeats the word of the button or menu that triggered it. 書き出す is only the audio panel’s own 台本を書き出す (export-script). | 書き出し（メニュー名で） ・ 書き出しました（エクスポートの知らせで） |  | 2026-10-24 (owner) |
| device | Device | 端末 | The computer or tablet a person views or edits a lesson on (the school word, as in 1人1台端末). Use パソコン only when it really means a PC. 機械 stays in 機械学習 and in the 4M (人・機械・方法・材料) of the m-fishbone example; list those in docs/terms-allow.json. | 機械（端末の意味で） / machine |  | 2026-10-28 (owner) |
| viewer-person | Participant / Learner | 参加者／学習者 | The person who opens a lesson. 参加者 for a person in a session or receiving a play-only file (see participant); 学習者 when the point is learning (self-study, pedagogy). When the device is meant, say 端末 and name no person (e.g. 開く端末の明朝で表示されます). The spec keeps its English word viewer; it is not shown in the UI, where Viewer is the app name Egatari Viewer. Owner, 10/28; follows the 10/22 host/participant decision. | 見る人 / viewer (a person, UI) | viewer (spec) | 2026-10-28 (owner) |

## Reading aids

| id | English | 日本語 | definition | avoid (ja / en) | internal | decided |
|---|---|---|---|---|---|---|
| contents | Contents | 目次 | List of the book's sections (or the slide titles) at the top of the book pane. Decided 2026-10-29 (standards); copied into this file with the reading aids. | もくじ ・ アウトライン（本で） / TOC (in the UI) | reading aids (Player P2) | 2026-11-03 (standards) |
| book-background | Background: White / Sepia / Black | 背景：白・セピア・黒 | Learner's per-device choice for the book pane only; the slides keep the theme colours. Kindle / Apple Books wording. Decided 2026-10-29 (standards). 白 keeps the theme's own light ground. | テーマ（この意味で） ・ ダークモード（この意味で） ・ 生成り（本の背景で） / Theme (in this sense) | text-pane background (Player P2) | 2026-11-03 (standards) |
| search | Search | 検索 | Button at the top of the book pane that opens its own search box (also Ctrl+F / ⌘F in the book). Usual wording. | サーチ | reading aids (Player P2) | 2026-11-03 (standards) |
| search-in-book | Search in the book / Search in the script | 本の中を検索／台本の中を検索 | Name and placeholder of the search box; the second form for a lesson without a book (Read with script). |  | reading aids (Player P2) | 2026-11-03 (standards) |
| search-result | Previous result / Next result | 前の検索結果／次の検索結果 | Buttons of the search box (Shift+Enter / Enter). Chrome find-bar wording. |  | reading aids (Player P2) | 2026-11-03 (standards) |
| no-results | No results | 見つかりません | Shown in the search box when nothing matches. | 該当なし（検索で） | reading aids (Player P2) | 2026-11-03 (standards) |
| text-and-background | Text and background | 文字と背景 | The Aa button of the book pane: text size, line spacing and background, per device, never in the file. | 表示の設定（この意味で） | reading aids (Player P2) | 2026-11-03 (standards) |
| text-size | Text size | 文字サイズ | Size of the book's text in steps (Readium CSS user setting); the slides keep their size. | 字の大きさ（設定の名前で） ・ フォントサイズ（本で） / Font size (in the book) | reading aids (Player P2) | 2026-11-03 (standards) |
| text-smaller-larger | Smaller text / Larger text | 文字を小さく／文字を大きく | The two buttons of Text size. |  | reading aids (Player P2) | 2026-11-03 (standards) |
| line-spacing | Line spacing | 行間 | Space between the lines of the book, Normal or Wide. | 行の間隔 | reading aids (Player P2) | 2026-11-03 (standards) |
| line-spacing-values | Normal / Wide | 標準／広い | The two steps of Line spacing. |  | reading aids (Player P2) | 2026-11-03 (standards) |
| resumed | Resumed where you left off | 前回の続きから | One-time notice when a lesson reopens in the book at the place last read on this device. | 前の続きから / Continuing where you left off | reading aids (Player P2) | 2026-11-03 (standards) |
| start-over | Start over | 最初から | Button of the resume notice: go to the beginning. |  | reading aids (Player P2) | 2026-11-03 (standards) |
| reading-progress | Progress | 進行状況 | Accessible name of the thin bar under the top of the book pane (how far the book is scrolled). No page numbers. | 進み具合（本の窓で） | reading aids (Player P2) | 2026-11-03 (standards) |
| enlarge | Enlarge | 拡大 | Clicking a figure in the book shows it large; accessible name 拡大：<figure>. |  | reading aids (Player P2) | 2026-11-03 (standards) |
