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
| sample | Samples | サンプル | Example lessons shipped with the editor. | 見本 ・ 見本の教材 / examples |  | 2026-10-24 (owner) |
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
| preview-later | Show later steps faintly | 先のステップを薄く見せる | An option of Slide show (and self-study), like captions: later steps of the slide appear faintly while the current one is shown. Key l. | 授業 ・ 授業モード ・ 授業の表示 / Lecture, Lecture mode, Lecture view | preview option (spec §1.2); ?mode=lecture legacy alias | 2026-10-25 (owner) |
| video | Video | 動画 | Plays by itself along the timeline; used to record video. |  | video (spec) | 2026-10-24 (owner) |
| self-study | (to be decided) | （未定） | Learner-driven mode with playback rate (spec learn). Name to be decided in the UX validation. Backlog #108. |  | learn (spec) |  (owner) |
| presenter-view | Presenter view | 発表者ビュー | A second window with the script, next step and tools (key p). |  |  | 2026-10-24 (owner) |
| black-screen | Black screen | 黒い画面 | Blank the screen during a presentation (key b). | 暗転 / blackout |  | 2026-10-25 (owner) |
| laser-pointer | Laser pointer | レーザーポインター | A pointer dot during a presentation (key x). | レーザー / laser |  | 2026-10-25 (owner) |
| pen | Pen | ペン | Draw on the slide during a presentation (key d). |  |  |  (owner) |
| marker | Marker | マーカー | In edit mode, circle or point at a place and attach a comment (key m). Not the cue layer. | 手書きメモ ・ 印をつけてメモ / ink note | strokes (§13) | 2026-10-25 (owner) |
| comment | Comment | コメント | A note to the AI (or a collaborator) asking for a change at a place. | AI へのメモ ・ 書き込み / note for the AI | comments.json | 2026-10-25 (owner) |
| thumbnail | Thumbnail | サムネイル | A small picture of a slide. | 縮図 |  | 2026-10-25 (owner) |
| player | Player | プレーヤー | The part of an Egatari file that plays the lesson. | 再生器 / runtime (UI) | player (spec) | 2026-10-25 (owner) |

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
| subjects | Subjects | 内容の分野 | Part sets for a subject (question: Will the slides need any of these?). Chosen on both plans; up to two on the free plan. Headings use 内容の分野; running text may say 分野. | 分野（使うパーツ） ・ 系列 / series | series | 2026-10-25 (owner) |
| free-plan | Free plan (of the chat AI) | 無料のプラン（チャットの AI の） | The user's chat AI is on a free plan; instructions are kept short. Always shown as 「チャットの AI：無料のプラン」, never alone: Egatari itself is free and has no plans. | 無料版 ・ 無料のプラン（単独で） | plan: free | 2026-10-25 (owner) |
| paid-plan | Paid plan (of the chat AI) | 有料のプラン（チャットの AI の） | The user's chat AI is on a paid plan; all standard parts and the chosen subjects and tools, in full detail. Always shown with 「チャットの AI：」. | 有料版 ・ 有料のプラン（単独で） | plan: paid | 2026-10-25 (owner) |
| tools | Tools | 道具 | Parts the AI uses only when asked (e.g. Timer); chosen on both plans. |  | group: tool | 2026-10-25 (owner) |
| standard-parts | Standard parts | 標準パーツ | Parts included without choosing a subject. | 共通の部品 ・ 共通パーツ ・ 共通の図 / common parts | common | 2026-10-25 (owner) |
| parts-in-instructions | Parts in these instructions | この指示に入るパーツ | The parts whose notes are in the copied instructions. | 使える図 | loadedParts | 2026-10-25 (owner) |
| what-to-convey | What to convey | 伝えたいこと | The 16 tiles (compare, change, …, predict, place/map); turning one off tells the AI not to use it. | 言いたいこと ・ 表し方（見出しで） / purposes | purposes | 2026-10-25 (owner) |
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
