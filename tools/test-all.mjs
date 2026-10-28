// すべてのテストを順に走らせ、一覧で結果を出す（npm test）
//   node tools/test-all.mjs [--only 名前,名前] [--keep] [--list]
//   --list：走らせる段の名前と引数を出して終わる（一時フォルダは <tmp>）
// 1. examples/minimal・examples/tmlr2026-calibration・examples/pitch-fictional（部品庫のビジネス向けの部品と business テーマ）を組む（部品の見本は test-components が組む）
// 2. 単体の検査：tools/test-*.mjs のうち、先頭の 40 行に「// test-all: unit」の行があるもの（名前の順。引数なし。ブラウザのいらないもの）・i18n pairs（組が古くなっていないかの知らせ。知らせだけで失敗にしない）・components（部品庫の写しと固定）・themes-lock（同梱のテーマの版の固定）・catalog・katex ranges（作ったファイルの --check）・changelog（断片の書き方）・check（3 つとも、エラー 0）・smoke・test-components・test-tools・test-controls・test-preview（先のステップを薄く見せる・部品の ctx・? のファイルの版）・test-message-sources（postMessage の送り手）・test-touch（タッチ画面の操作の帯。WebKit があれば WebKit でも）・test-bar-hint（開いたときの帯・出し方の 1 行・取っ手）・test-line-break（日本語の行頭禁則）・test-autoplay・test-blackout（暗転）・test-links（スライドへのリンク）・test-dev-server・test-edit-modes（発表の道具と編集モード）・test-comment-shots（コメントの画像）・test-ink-comments（マーカー）・test-sheet（コンタクトシート）・test-security（守り）・test-a11y・test-mount-hidden（隠れた iframe で起動して後で出す）・test-step-reset（手で変えた部品の状態を段階に入るたびに戻す）・test-capture（画面を撮る道具）・test-portable（持ち運べる 1 ファイル）・test-tier-a（段 A の編集）・test-attachments（添付）・test-ref-voice（参照音声を教材に入れない）・test-app（編集アプリ）・test-app-earlier（前の版のファイル）・test-app-player-change（保存でプレーヤーが変わる知らせ）・test-app-save-rebuild（組み直す保存の確かめとわけ）・test-input-focus（キーがスライドに届くこと）・test-presenter-exit（発表者ビューから抜けること）
// 3. npm run new の雛形（ja・en）を作って組み、check でエラー 0
// どれか 1 つでも失敗すれば終了コード 1。各テストの出力は失敗したものだけ全部見せる
// tools/test-*.mjs はどれも、単体の印（test-all: unit）があるか、下の段の引数に出てくるか、「// test-all: part of <段>」（ほかの試験が読み込む）の
// どれかでなければならない（どれでもなければ、走らせずに終了コード 1。新しい試験を忘れないように）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? new Set(args[oi + 1].split(',')) : null;
const verbose = args.includes('--verbose') || !!process.env.CI;
// 環境変数 MOTION_TEST_ARTIFACTS があれば、一時フォルダの代わりにそのフォルダを使う（CI が失敗時の画面を決まった場所から拾うため）。なければ従来どおり
const tmp = process.env.MOTION_TEST_ARTIFACTS
  ? (fs.mkdirSync(process.env.MOTION_TEST_ARTIFACTS, { recursive: true }), path.resolve(process.env.MOTION_TEST_ARTIFACTS))
  : fs.mkdtempSync(path.join(os.tmpdir(), 'motion-test-'));
const rel = (...p) => path.join(ROOT, ...p);
const MIN = rel('examples/minimal/out/deck.html');
const TMLR = rel('examples/tmlr2026-calibration/out/deck.html');

// 単体の検査（ブラウザのいらないもの）：先頭に「// test-all: unit」の行がある tools/test-*.mjs を見つける
const MARK = /^\/\/ test-all: (unit|part of [\w-]+)/m;
const markOf = (f) => { const m = fs.readFileSync(rel('tools', f), 'utf8').split('\n').slice(0, 40).join('\n').match(MARK); return m ? m[1] : null; };
const testFiles = fs.readdirSync(rel('tools')).filter((f) => /^test-.+\.mjs$/.test(f) && f !== 'test-all.mjs').sort();
const unit = testFiles.filter((f) => markOf(f) === 'unit').map((f) => [f.replace(/\.mjs$/, ''), ['tools/' + f]]);
const steps = [
  ...unit,
  // 英語と日本語の文書の組（X.md と X.ja.md）：古い訳を知らせるだけ（--strict を付けないので終了コードは 0）。CI の注記は test.yml の専用の段で出す
  // 写した仕様が日付の付いた版（wd-* のタグ）か：違っても知らせるだけ（終了コードは 0。ブランチでは普通）
  ['spec snapshot', ['tools/spec-snapshot.mjs', '--check']],
  ['i18n pairs', ['tools/i18n-pairs.mjs', '--check', '--plain']],
  // 画面の言葉（docs/terms.json の avoid の言葉が、画面の文字列・使い方の文書・skills に残っていないか）：残っていれば失敗（直すか、正当な使い方なら docs/terms-allow.json に理由と書く）
  ['lint terms', ['tools/lint-terms.mjs']],
  // 作ったファイル（リポジトリに入れておくもの）が材料と同じか：違えば失敗（直すのは npm run gen）。AI への指示（llm guide）は後ろの段
  // 部品庫の写し（vendor/components）が components.lock.json と合っているか（ネットワークなし）
  ['components', ['tools/components-update.mjs', '--check']],
  // 同梱のテーマの版の固定（themes.lock.json）が themes/・vendor/themes/ と合っているか
  ['themes-lock', ['tools/themes-lock.mjs', '--check']],
  ['catalog', ['tools/catalog.mjs', '--check']],
  ['katex ranges', ['tools/katex-ranges.mjs', '--check']],
  // CHANGELOG の断片（changes/*.md）の書き方
  ['changelog', ['tools/changelog.mjs', '--check']],
  ['build minimal', ['kit/build.mjs', 'examples/minimal/deck.html']],
  ['build tmlr2026', ['kit/build.mjs', 'examples/tmlr2026-calibration/deck.html']],
  ['check minimal', ['kit/check.mjs', 'examples/minimal/deck.html']],
  ['check tmlr2026', ['kit/check.mjs', 'examples/tmlr2026-calibration/deck.html']],
  ['build pitch', ['kit/build.mjs', 'examples/pitch-fictional/deck.html']],
  ['check pitch', ['kit/check.mjs', 'examples/pitch-fictional/deck.html']],
  ['smoke', ['tools/smoke.mjs', MIN, path.join(tmp, 'smoke')]],
  // 部品の見本（部品庫の部品が増えるたびに長くなる。遅い macOS の CI で 1 段の上限 1200 秒に届いた）は、名前の順に 2 組に分けて別々の段にする（--only test-components で両方）
  ...[1, 2].map((i) => [`test-components ${i}/2`, ['tools/test-components.mjs', '--shard', `${i}/2`, '--shots', path.join(tmp, 'components')]]),
  ['test-tools', ['tools/test-tools.mjs', MIN, path.join(tmp, 'tools')]],
  ['test-controls', ['tools/test-controls.mjs', MIN, path.join(tmp, 'controls')]],
  ['test-preview', ['tools/test-preview.mjs', path.join(tmp, 'preview')]],
  ['test-message-sources', ['tools/test-message-sources.mjs', MIN, path.join(tmp, 'message-sources')]],
  ['test-touch', ['tools/test-touch.mjs', MIN, path.join(tmp, 'touch')]],
  ['test-bar-hint', ['tools/test-bar-hint.mjs', MIN, path.join(tmp, 'bar-hint')]],
  ['test-line-break', ['tools/test-line-break.mjs', MIN]],
  ['test-autoplay', ['tools/test-autoplay.mjs', MIN]],
  // 暗転（b）：窓全体が #000・戻すと同じ画面・クリックと Esc・キーの一覧より上・発表者ビューの札・印刷と動画は変わらない
  ['test-blackout', ['tools/test-blackout.mjs', MIN]],
  // スライドへのリンク（format spec §9.1A）と m-menu：開いたときの #・クリック・戻る・自動再生・埋め込み・発表者ビュー・品質チェック
  ['test-links', ['tools/test-links.mjs', path.join(tmp, 'links')]],
  // 授業の外へ出るリンク（format spec §11）：決まり（kit/core/link-policy.mjs）の単体と、確認の箱・開かない scheme・動画・sandbox の枠
  ['test-extlinks', ['tools/test-extlinks.mjs', path.join(tmp, 'extlinks')]],
  ['test-dev-server', ['tools/test-dev-server.mjs', path.join(tmp, 'dev')]],
  // 発表の道具と編集モード（#69）：どの状態（ペン・自動再生・暗転・一覧・発表者ビューなど）から編集に入っても編集が勝つことを表で確かめる
  ['test-edit-modes', ['tools/test-edit-modes.mjs', path.join(tmp, 'edit-modes')]],
  ['test-comment-shots', ['tools/test-comment-shots.mjs', path.join(tmp, 'comment-shots')]],
  // マーカー（#70）：編集モードのコメントのペン → comments.json の stroke → 重ね → comment-shots、書き出しにコメントが入らないこと
  ['test-ink-comments', ['tools/test-ink-comments.mjs', path.join(tmp, 'ink-comments')]],
  ['test-sheet', ['tools/test-sheet.mjs', path.join(tmp, 'sheet')]],
  // 守り：プレビューの決まり（CSP）が、デッキの文書のどの細工よりも先に効くこと（編集アプリと同じ決まりのページで）
  ['test-security', ['tools/test-security.mjs']],
  // 部品庫が取り下げた版（format spec §6）：警告（CLI）・編集アプリのページに eval の許可がないこと・取り下げた版を記録した文書の知らせと「組み直す」・sandbox の枠
  ['test-yanked', ['tools/test-yanked.mjs', path.join(tmp, 'yanked')]],
  ['test-theme-version', ['tools/test-theme-version.mjs', path.join(tmp, 'theme-version')]],
  // テーマを変更…（スライド ▾）：data-theme だけを替え（ほかの属性・スライドは変えない）、egatari.json の themes の固定（ほかの項目はバイトのまま）、プレビューの色、元に戻す、段 B の保存、作業フォルダ、組み直せないファイル
  ['test-theme-switch', ['tools/test-theme-switch.mjs', path.join(tmp, 'theme-switch')]],
  ['test-a11y', ['tools/test-a11y.mjs', MIN, path.join(tmp, 'a11y')]],
  // 並んでいないうちに起動したデッキ（display:none の iframe）を後で出しても、ふつうの起動と画素まで同じ（contract §3：mount は舞台が並んでから）
  ['test-mount-hidden', ['tools/test-mount-hidden.mjs', path.join(tmp, 'mount-hidden')]],
  // 見ている人が手で変えた部品の状態（m-kobun の札など）は段階に入るたびに消え、宣言どおりの画面に戻る（format spec §8.4、contract §3）。発表者ビュー・印刷も
  ['test-step-reset', ['tools/test-step-reset.mjs', path.join(tmp, 'step-reset')]],
  // 画面を撮る共通の道具（stableCapture）：talk の操作の帯が写り込まず、読み込みの 0.5 秒後と 3 秒後で同じ絵
  ['test-capture', ['tools/test-capture.mjs', path.join(tmp, 'capture')]],
  // 持ち運べる 1 ファイル（format spec）：Schema・往復・文書の試験用ファイル・file:// での再生
  ['test-portable', ['tools/test-portable.mjs', path.join(tmp, 'portable')]],
  // 段 A の編集（組み直さずに決まった場所だけを書き換える）：場所を見分ける差分・再生・展開とまとめ直し・ほかの書き手の文書・知らない項目
  ['test-tier-a', ['tools/test-tier-a.mjs', path.join(tmp, 'tier-a')]],
  // 1.0 のファイルの形（書く側）：player と generator・版の決め方と player:check・段 A は player を残す・ファイルの決まり（CSP）・旧来の鍵を書かない・記事だけの教材・プレビュー
  ['test-file-shape', ['tools/test-file-shape.mjs', path.join(tmp, 'file-shape')]],
  // 参照音声（AI 音声が声をまねる元の録音）を教材に入れない（format spec §5 の recipe）：エクスポートの外す・断る、品質チェックの refVoice
  ['test-ref-voice', ['tools/test-ref-voice.mjs', path.join(tmp, 'ref-voice')]],
  ['test-attachments', ['tools/test-attachments.mjs', path.join(tmp, 'attachments'), '--shots', path.join(tmp, 'attachments-shots')]],
  // 授業の部屋（拡張 live）：決まりごと・部屋を付けた派生だけの CSP・通信なしの場面・file:// から試験の部屋へ・つなぎ直し・舞台の描画が変わらない
  ['test-live', ['tools/test-live.mjs', path.join(tmp, 'live')]],
  // 授業の部屋の結果（拡張 live §3）：形・添付の項目・コマンドの attach と --without-live-results・再生専用に入らない・編集アプリの取り込みと書き出しの知らせ
  ['test-live-results', ['tools/test-live-results.mjs', path.join(tmp, 'live-results')]],
  // 編集アプリ（app/）：dist/ を組んで配り、OPFS のフォルダと持ち運べる 1 ファイルで編集・保存・書き出しなどを確かめる
  ['test-app', ['tools/test-app.mjs', path.join(tmp, 'app')]],
  // 前の版のファイル・作業フォルダ（format spec §7.1）：知らせと 2 つのボタン（前の版の Studio の URL・移し替えの手引き）、ファイルそのものの再生、編集・保存を断る、1.0 のファイルは知らせなし
  ['test-app-earlier', ['tools/test-app-earlier.mjs', path.join(tmp, 'earlier')]],
  // 保存の前にプレーヤーが変わることを知らせる（format spec §4.1。exportPortable の playerChange）
  ['test-app-player-change', ['tools/test-app-player-change.mjs', path.join(tmp, 'player-change')]],
  // 組み直す保存の確かめ：まだ保存していない文書は聞かない・テーマを変えただけならそのわけだけ（日本語と英語）
  ['test-app-save-rebuild', ['tools/test-app-save-rebuild.mjs', path.join(tmp, 'save-rebuild')]],
  // キーがスライドに届くこと（入力のフォーカス）：暗転・ペンとレーザー・外へのリンクの箱・編集アプリの枠からのキー・未保存の口述原稿・発表者ビューの「次」（組んだデッキと編集アプリ）
  ['test-input-focus', ['tools/test-input-focus.mjs', path.join(tmp, 'input-focus')]],
  // 発表者ビューから抜けること：本体の p・発表者ビューの Esc と p・閉じるのボタン・全画面のときは全画面をやめるだけ・「今の画面」からの Esc と p・フォーカスがないときの覆い（組んだデッキと編集アプリ）
  ['test-presenter-exit', ['tools/test-presenter-exit.mjs', path.join(tmp, 'presenter-exit')]],
  // npm run new の雛形（日本語・英語）を一時フォルダに作り、組んで検査する（エラー 0）
  ...['ja', 'en'].flatMap((l) => [
    [`new ${l}`, ['tools/new.mjs', path.join(tmp, 'new-' + l), '--lang', l]],
    [`build new ${l}`, ['kit/build.mjs', path.join(tmp, 'new-' + l, 'deck.html')]],
    [`check new ${l}`, ['kit/check.mjs', path.join(tmp, 'new-' + l, 'deck.html')]],
  ]),
];
// 組めなかったデッキに依るテストは飛ばす
const needs = { 'check minimal': 'build minimal', smoke: 'build minimal', 'test-tools': 'build minimal', 'test-controls': 'build minimal', 'test-autoplay': 'build minimal', 'test-blackout': 'build minimal', 'test-a11y': 'build minimal', 'check tmlr2026': 'build tmlr2026', 'check pitch': 'build pitch',
  'build new ja': 'new ja', 'check new ja': 'build new ja', 'build new en': 'new en', 'check new en': 'build new en' };
// 国語の部品（m-kanbun・m-kobun・m-gendai）の見本のデッキ（examples/kokugo-kanbun）を普通と持ち運べる 1 ファイルに組み、検査でエラー 0。
// 部品の読み取りの試験は egatari/components、漢文が知らせなしに読めることは test-kokugo-example（単体）、部品の描画と決定性は test-components（各部品の demo.html）
steps.push(
  ['build kokugo', ['kit/build.mjs', 'examples/kokugo-kanbun/deck.html']],
  ['build kokugo portable', ['kit/build.mjs', 'examples/kokugo-kanbun/deck.html', '--portable', '-o', path.join(tmp, 'kokugo.html')]],
  ['check kokugo', ['kit/check.mjs', 'examples/kokugo-kanbun/deck.html']],
  // 縦組みのスライド（layout-tate）：見出しの列・本文・結論の列・ページ番号の位置と重なり、決定性、品質チェック、鍵と読める層
  ['test-layout-tate', ['tools/test-layout-tate.mjs', path.join(tmp, 'layout-tate')]],
  // テーマの CSS を体裁（layouts.css）の後に読む（backlog #75）：組み立ての口ごとの順と、html を付けないテーマの規則が体裁に勝つこと・--marker・--bar・--bar-h
  ['test-theme-order', ['tools/test-theme-order.mjs', path.join(tmp, 'theme-order')]],
  // テーマの寸法の宣言（theme.json の metrics、backlog #76）：検証と継承、同一性の hash、同梱のテーマの描いた箱が宣言どおり（厳しく）、
  // 宣言した限りで本文の場所を見ること、themeMetricsDrift・themeMetricsInvalid（コマンド版とブラウザ版）、tools/theme-metrics.mjs measure
  ['test-theme-metrics', ['tools/test-theme-metrics.mjs', path.join(tmp, 'theme-metrics')]],
  // 印刷でも章の扉（sec）の背景が落ちない（backlog #57）：print の媒体の print-color-adjust・背景色、背景のグラフィックなしの pdf の画素
  ['test-print-backgrounds', ['tools/test-print-backgrounds.mjs', path.join(tmp, 'print-backgrounds')]],
  // 切れる字・外に出る字（backlog #52）と、ブラウザ版の品質チェックがコマンド版と同じ体裁の検査を使うこと（#51）
  ['test-check-overflow', ['tools/test-check-overflow.mjs', path.join(tmp, 'check-overflow')]],
  // 章の扉の h2（#128）と、字と地のコントラストの警告
  ['test-check-contrast', ['tools/test-check-contrast.mjs', path.join(tmp, 'check-contrast')]],
  ['test-check-status', ['tools/test-check-status.mjs', path.join(tmp, 'check-status')]],
  // 同じ状態を 2 回描いた画面の比べ方（kit/render-compare.mjs）：部品の DOM が同じなら縁の少しの揺れは許し、DOM の違い・大きな違いは失敗。品質チェックの D も
  ['test-render-compare', ['tools/test-render-compare.mjs', path.join(tmp, 'render-compare')]],
);
Object.assign(needs, { 'check kokugo': 'build kokugo' });
// チャットの AI との行き来：指示（docs/authoring-with-llms*.md・docs/llm-parts/・kit/core/llm-pack-data.mjs）が材料と同じか・大きさ、取り出し・id・修正依頼・読みの検査・見本の取り込みと品質チェックの穴
// （編集アプリの貼り付けと修正依頼は test-app の中の tools/test-app-llm.mjs）
steps.push(
  ['llm guide', ['tools/make-llm-guide.mjs', '--check']],
  ['test-llm', ['tools/test-llm.mjs', path.join(tmp, 'llm')]],
  // 外から使われる口の形（check --json・buildFixRequest・buildPack・llm-import）を写し（tools/fixtures/api-shapes.json）と比べる
  ['test-api-shapes', ['tools/test-api-shapes.mjs', path.join(tmp, 'api-shapes')]],
  ['test-shape', ['tools/test-shape.mjs', path.join(tmp, 'shape')]],
);
// 段階の音声（編集アプリの音声の板）：後処理を tts/core.py と比べる・MP3・読み辞書・記録と古さ・段 A（ブラウザなし）と、
// 偽のマイクと差し替えの TTS で音声の板（録音・使う・古い・作り直し・段 A の保存・TTS の窓）
steps.push(
  ['test-audio-core', ['tools/test-audio-core.mjs', path.join(tmp, 'audio-core')]],
  ['test-audio', ['tools/test-audio.mjs', path.join(tmp, 'audio')]],
  // Colab 往復 TTS（WebGPU のない PC）：tts-job.json の書き出し・zip の取り込み（一致・印付き・別の教材・敵対の zip）・段 A の保存（単体の検査は test-colab）
  ['test-colab-app', ['tools/test-colab-app.mjs', path.join(tmp, 'colab-app')]],
  // 録音モード（app/rec-mode.js）：偽のマイクで、キーボードだけの録音・C の cue・取り直し・読み上げの知らせ（cue の計算は単体の test-rec-core）
  ['test-recording', ['tools/test-recording.mjs', path.join(tmp, 'recording')]],
  // 読み上げで聞く（端末の声。format spec §5.6）：読む文（読み・読み辞書・join-num-counter）・端末の中の声だけ・再生器の帯と札・進むと止める・
  // 動画のモードとタイムラインと (i, k, t) が変わらない・ファイルに何も書かない（再生器と編集アプリの音声の板。speechSynthesis は差し替え）
  ['test-read-aloud', ['tools/test-read-aloud.mjs', path.join(tmp, 'read-aloud')]],
  // egatari.json のほかの作り手の項目（format spec §3.3）：Studio のどの書き込み（書き出し・展開・段 A の保存・新しい教材・添付と授業の部屋の板・
  // テーマを更新・--update-themes・portable attach）でもバイトのまま残る（kit/core/config-file.mjs の updateConfig）
  ['test-config-preserve', ['tools/test-config-preserve.mjs', path.join(tmp, 'config-preserve')]],
);

// 印もなく、どの段の引数にも出てこない試験のファイルがあれば、走らせずに失敗する
const listed = new Set(steps.flatMap(([, argv]) => argv).filter((a) => /^tools\/test-.+\.mjs$/.test(a)).map((a) => a.slice('tools/'.length)));
const orphans = testFiles.filter((f) => !markOf(f) && !listed.has(f));
if (orphans.length) {
  console.error(`test-all: these tests are not run: ${orphans.join(', ')}\n  add "// test-all: unit" near the top (no arguments, no browser), a step in tools/test-all.mjs, or "// test-all: part of <step>" when another test imports it`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
if (args.includes('--list')) {
  for (const [name, argv] of steps) console.log(`${name}\tnode ${argv.map((a) => a.split(tmp).join('<tmp>')).join(' ')}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

const STEP_TIMEOUT_S = Number(process.env.TEST_STEP_TIMEOUT_S) > 0 ? Number(process.env.TEST_STEP_TIMEOUT_S) : 600;
function run(name, argv) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; if (verbose) process.stdout.write(d); });
    ch.stderr.on('data', (d) => { out += d; if (verbose) process.stderr.write(d); });
    // 1 つのテストが 10 分（遅い macOS の CI では TEST_STEP_TIMEOUT_S で延ばす）を超えたら止める（ブラウザが固まったとき）
    const timer = setTimeout(() => { out += `\n[test-all] timeout: killed after ${STEP_TIMEOUT_S} s\n`; ch.kill('SIGKILL'); }, STEP_TIMEOUT_S * 1000);
    ch.on('close', (code, sig) => { clearTimeout(timer); resolve({ name, code: code ?? (sig ? 128 : 1), out, sec: (Date.now() - t0) / 1000 }); });
  });
}

const results = [];
const byName = new Map();
for (const [name, argv] of steps) {
  if (only && !only.has(name) && !only.has(name.replace(/ \d+\/\d+$/, '')) && !(name.startsWith('build') && [...only].some((n) => needs[n] === name))) continue;
  const dep = needs[name];
  if (dep && byName.has(dep) && byName.get(dep).code !== 0) {
    const r = { name, code: -1, out: `skipped: ${dep} failed`, sec: 0 };
    results.push(r); byName.set(name, r); console.log(`SKIP ${name} (${dep} failed)`);
    continue;
  }
  const tty = !verbose && process.stdout.isTTY;
  if (tty) process.stdout.write(`.... ${name}`);
  else console.log(`\n==== ${name}: node ${argv.join(' ')}`);
  const r = await run(name, argv);
  results.push(r); byName.set(name, r);
  const tag = r.code === 0 ? 'PASS' : 'FAIL';
  if (tty) process.stdout.write(`\r${tag} ${name} (${r.sec.toFixed(1)} s)\n`);
  else if (!verbose) console.log(`${tag} ${name} (${r.sec.toFixed(1)} s)`);
  else console.log(`==== ${tag} ${name} (${r.sec.toFixed(1)} s)`);
  if (r.code !== 0 && !verbose) {
    // 失敗したテストの出力を見せる（check は長いので、エラーの行と最後の行だけ）
    const lines = r.out.trimEnd().split('\n');
    const shown = name.startsWith('check ') ? lines.filter((l) => /\[エラー\]|^■|^エラー|Error|error/.test(l)) : lines;
    console.log(shown.slice(-80).map((l) => '    | ' + l).join('\n'));
  }
}

const w = Math.max(...results.map((r) => r.name.length));
console.log('\n' + 'test'.padEnd(w) + '  result  time');
console.log('-'.repeat(w) + '  ------  ------');
for (const r of results) console.log(r.name.padEnd(w) + '  ' + (r.code === 0 ? 'PASS  ' : r.code === -1 ? 'SKIP  ' : 'FAIL  ') + '  ' + (r.sec.toFixed(1) + ' s').padStart(6));
const bad = results.filter((r) => r.code !== 0);
// 時間の一覧（遅い順と合計）。失敗していても出す。GITHUB_STEP_SUMMARY があれば markdown の表も足す
const timed = results.filter((r) => r.code !== -1).sort((a, b) => b.sec - a.sec);
const total = results.reduce((s, r) => s + r.sec, 0);
console.log('\nduration summary (slowest first)');
const tw = Math.max(5, ...timed.map((r) => r.name.length));
for (const r of timed) console.log(`  ${r.name.padEnd(tw)}  ${(r.sec.toFixed(1) + ' s').padStart(8)}${r.code === 0 ? '' : '  FAIL'}`);
console.log(`  ${'total'.padEnd(tw)}  ${(total.toFixed(1) + ' s').padStart(8)}  (${(total / 60).toFixed(1)} min)`);
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    const md = [`### test-all durations (${process.platform}, node ${process.versions.node})`, '', '| test | result | seconds |', '|---|---|---:|',
      ...timed.map((r) => `| ${r.name} | ${r.code === 0 ? 'PASS' : 'FAIL'} | ${r.sec.toFixed(1)} |`), `| **total** | | **${total.toFixed(1)}** |`, ''].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  } catch (e) { console.log(`(could not write GITHUB_STEP_SUMMARY: ${e.message})`); }
}
console.log(`\n${results.length - bad.length}/${results.length} passed` + (bad.length ? `; failed: ${bad.map((r) => r.name).join(', ')}` : ''));
console.log(`artifacts: ${tmp}`);
process.exit(bad.length ? 1 : 0);
