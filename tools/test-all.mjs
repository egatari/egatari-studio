// すべてのテストを順に走らせ、一覧で結果を出す（npm test）
//   node tools/test-all.mjs [--only 名前,名前] [--keep] [--list]
//   --list：走らせる段の名前と引数を出して終わる（一時フォルダは <tmp>）
// 1. examples/minimal・examples/tmlr2026-calibration・examples/pitch-fictional（部品庫のビジネス向けの部品と business テーマ）を組む（部品の見本は test-components が組む）
// 2. 単体の検査：tools/test-*.mjs のうち、先頭の 40 行に「// test-all: unit」の行があるもの（名前の順。引数なし。ブラウザのいらないもの）・i18n pairs（組が古くなっていないかの知らせ。知らせだけで失敗にしない）・components（部品庫の写しと固定）・catalog・katex ranges（作ったファイルの --check）・changelog（断片の書き方）・check（3 つとも、エラー 0）・smoke・test-components・test-tools・test-controls・test-autoplay・test-links（スライドへのリンク）・test-dev-server・test-comment-shots（コメントの画像）・test-sheet（コンタクトシート）・test-security（守り）・test-a11y・test-mount-hidden（隠れた iframe で起動して後で出す）・test-step-reset（手で変えた部品の状態を段階に入るたびに戻す）・test-portable（持ち運べる 1 ファイル）・test-tier-a（段 A の編集）・test-attachments（添付）・test-app（編集アプリ）
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
  ['i18n pairs', ['tools/i18n-pairs.mjs', '--check', '--plain']],
  // 作ったファイル（リポジトリに入れておくもの）が材料と同じか：違えば失敗（直すのは npm run gen）。AI への指示（llm guide）は後ろの段
  // 部品庫の写し（vendor/components）が components.lock.json と合っているか（ネットワークなし）
  ['components', ['tools/components-update.mjs', '--check']],
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
  ['test-components', ['tools/test-components.mjs', '--shots', path.join(tmp, 'components')]],
  ['test-tools', ['tools/test-tools.mjs', MIN, path.join(tmp, 'tools')]],
  ['test-controls', ['tools/test-controls.mjs', MIN, path.join(tmp, 'controls')]],
  ['test-autoplay', ['tools/test-autoplay.mjs', MIN]],
  // スライドへのリンク（format spec §9.1A）と m-menu：開いたときの #・クリック・戻る・自動再生・埋め込み・発表者ビュー・品質チェック
  ['test-links', ['tools/test-links.mjs', path.join(tmp, 'links')]],
  // 授業の外へ出るリンク（format spec §11）：決まり（kit/core/link-policy.mjs）の単体と、確認の箱・開かない scheme・動画・sandbox の枠
  ['test-extlinks', ['tools/test-extlinks.mjs', path.join(tmp, 'extlinks')]],
  ['test-dev-server', ['tools/test-dev-server.mjs', path.join(tmp, 'dev')]],
  ['test-comment-shots', ['tools/test-comment-shots.mjs', path.join(tmp, 'comment-shots')]],
  ['test-sheet', ['tools/test-sheet.mjs', path.join(tmp, 'sheet')]],
  // 守り：プレビューの決まり（CSP）が、デッキの文書のどの細工よりも先に効くこと（編集アプリと同じ決まりのページで）
  ['test-security', ['tools/test-security.mjs']],
  // 部品庫が取り下げた版（format spec §6）：警告（CLI）・編集アプリのページに eval の許可がないこと・取り下げた版を記録した文書の知らせと「組み直す」・sandbox の枠
  ['test-yanked', ['tools/test-yanked.mjs', path.join(tmp, 'yanked')]],
  ['test-a11y', ['tools/test-a11y.mjs', MIN, path.join(tmp, 'a11y')]],
  // 並んでいないうちに起動したデッキ（display:none の iframe）を後で出しても、ふつうの起動と画素まで同じ（contract §3：mount は舞台が並んでから）
  ['test-mount-hidden', ['tools/test-mount-hidden.mjs', path.join(tmp, 'mount-hidden')]],
  // 見ている人が手で変えた部品の状態（m-kobun の札など）は段階に入るたびに消え、宣言どおりの画面に戻る（format spec §8.4、contract §3）。発表者ビュー・印刷も
  ['test-step-reset', ['tools/test-step-reset.mjs', path.join(tmp, 'step-reset')]],
  // 持ち運べる 1 ファイル（format spec）：Schema・往復・文書の試験用ファイル・file:// での再生
  ['test-portable', ['tools/test-portable.mjs', path.join(tmp, 'portable')]],
  // 段 A の編集（組み直さずに決まった場所だけを書き換える）：場所を見分ける差分・再生・展開とまとめ直し・ほかの書き手の文書・知らない項目
  ['test-tier-a', ['tools/test-tier-a.mjs', path.join(tmp, 'tier-a')]],
  ['test-attachments', ['tools/test-attachments.mjs', path.join(tmp, 'attachments'), '--shots', path.join(tmp, 'attachments-shots')]],
  // 授業の部屋（拡張 live）：決まりごと・部屋を付けた派生だけの CSP・通信なしの場面・file:// から試験の部屋へ・つなぎ直し・舞台の描画が変わらない
  ['test-live', ['tools/test-live.mjs', path.join(tmp, 'live')]],
  // 授業の部屋の結果（拡張 live §3）：形・添付の項目・コマンドの attach と --without-live-results・再生専用に入らない・編集アプリの取り込みと書き出しの知らせ
  ['test-live-results', ['tools/test-live-results.mjs', path.join(tmp, 'live-results')]],
  // 再生ページ Egatari Play（play/、tools/build-play.mjs）：再生のみと編集可の 1 ファイル・sandbox の隔て・枠の中を断る・service worker のキャッシュと版・
  // 最近のファイル（OPFS と IndexedDB）・share_target・リンクの箱・ライブのない教材は通信 0・ライブの参加（試験の部屋）・電話の幅
  ['test-play', ['tools/test-play.mjs', path.join(tmp, 'play')]],
  // 編集アプリ（app/）：dist/ を組んで配り、OPFS のフォルダと持ち運べる 1 ファイルで編集・保存・書き出しなどを確かめる
  ['test-app', ['tools/test-app.mjs', path.join(tmp, 'app')]],
  // npm run new の雛形（日本語・英語）を一時フォルダに作り、組んで検査する（エラー 0）
  ...['ja', 'en'].flatMap((l) => [
    [`new ${l}`, ['tools/new.mjs', path.join(tmp, 'new-' + l), '--lang', l]],
    [`build new ${l}`, ['kit/build.mjs', path.join(tmp, 'new-' + l, 'deck.html')]],
    [`check new ${l}`, ['kit/check.mjs', path.join(tmp, 'new-' + l, 'deck.html')]],
  ]),
];
// 組めなかったデッキに依るテストは飛ばす
const needs = { 'check minimal': 'build minimal', smoke: 'build minimal', 'test-tools': 'build minimal', 'test-controls': 'build minimal', 'test-autoplay': 'build minimal', 'test-a11y': 'build minimal', 'check tmlr2026': 'build tmlr2026', 'check pitch': 'build pitch',
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
  // 切れる字・外に出る字（backlog #52）と、ブラウザ版の品質チェックがコマンド版と同じ体裁の検査を使うこと（#51）
  ['test-check-overflow', ['tools/test-check-overflow.mjs', path.join(tmp, 'check-overflow')]],
  ['test-check-status', ['tools/test-check-status.mjs', path.join(tmp, 'check-status')]],
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

function run(name, argv) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; if (verbose) process.stdout.write(d); });
    ch.stderr.on('data', (d) => { out += d; if (verbose) process.stderr.write(d); });
    // 1 つのテストが 10 分を超えたら止める（ブラウザが固まったとき）
    const timer = setTimeout(() => { out += '\n[test-all] timeout: killed after 600 s\n'; ch.kill('SIGKILL'); }, 600_000);
    ch.on('close', (code, sig) => { clearTimeout(timer); resolve({ name, code: code ?? (sig ? 128 : 1), out, sec: (Date.now() - t0) / 1000 }); });
  });
}

const results = [];
const byName = new Map();
for (const [name, argv] of steps) {
  if (only && !only.has(name) && !(name.startsWith('build') && [...only].some((n) => needs[n] === name))) continue;
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
console.log(`\n${results.length - bad.length}/${results.length} passed` + (bad.length ? `; failed: ${bad.map((r) => r.name).join(', ')}` : ''));
console.log(`artifacts: ${tmp}`);
process.exit(bad.length ? 1 : 0);
