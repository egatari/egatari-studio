// すべてのテストを順に走らせ、一覧で結果を出す（npm test）
//   node tools/test-all.mjs [--only 名前,名前] [--keep]
// 1. examples/minimal と examples/tmlr2026-calibration を組む（部品の見本は test-components が組む）
// 2. 単体の検査（test-narration・test-ids・test-deck-timing・test-workspace（編集アプリの作業場所）、あれば）・check（両方、エラー 0）・smoke・test-components・test-tools・test-controls・test-autoplay・test-dev-server・test-a11y・test-portable（持ち運べる 1 ファイル）・test-app（編集アプリ）
// 3. npm run new の雛形（ja・en）を作って組み、check でエラー 0
// どれか 1 つでも失敗すれば終了コード 1。各テストの出力は失敗したものだけ全部見せる
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-test-'));
const rel = (...p) => path.join(ROOT, ...p);
const MIN = rel('examples/minimal/out/deck.html');
const TMLR = rel('examples/tmlr2026-calibration/out/deck.html');

// 単体の検査（ブラウザのいらないもの）。あるものだけ走らせる
const unit = ['test-narration', 'test-ids', 'test-deck-timing', 'test-workspace'].filter((n) => fs.existsSync(rel('tools', n + '.mjs'))).map((n) => [n, ['tools/' + n + '.mjs']]);
const steps = [
  ...unit,
  ['build minimal', ['kit/build.mjs', 'examples/minimal/deck.html']],
  ['build tmlr2026', ['kit/build.mjs', 'examples/tmlr2026-calibration/deck.html']],
  ['check minimal', ['kit/check.mjs', 'examples/minimal/deck.html']],
  ['check tmlr2026', ['kit/check.mjs', 'examples/tmlr2026-calibration/deck.html']],
  ['smoke', ['tools/smoke.mjs', MIN, path.join(tmp, 'smoke')]],
  ['test-components', ['tools/test-components.mjs', '--shots', path.join(tmp, 'components')]],
  ['test-tools', ['tools/test-tools.mjs', MIN, path.join(tmp, 'tools')]],
  ['test-controls', ['tools/test-controls.mjs', MIN, path.join(tmp, 'controls')]],
  ['test-autoplay', ['tools/test-autoplay.mjs', MIN]],
  ['test-dev-server', ['tools/test-dev-server.mjs', path.join(tmp, 'dev')]],
  ['test-a11y', ['tools/test-a11y.mjs', MIN, path.join(tmp, 'a11y')]],
  // 持ち運べる 1 ファイル（format spec）：Schema・往復・文書の試験用ファイル・file:// での再生
  ['test-portable', ['tools/test-portable.mjs', path.join(tmp, 'portable')]],
  // 編集アプリ（app/）：dist/editor を組んで配り、OPFS のフォルダと持ち運べる 1 ファイルで編集・保存・書き出しなどを確かめる
  ['test-app', ['tools/test-app.mjs', path.join(tmp, 'app')]],
  // npm run new の雛形（日本語・英語）を一時フォルダに作り、組んで検査する（エラー 0）
  ...['ja', 'en'].flatMap((l) => [
    [`new ${l}`, ['tools/new.mjs', path.join(tmp, 'new-' + l), '--lang', l]],
    [`build new ${l}`, ['kit/build.mjs', path.join(tmp, 'new-' + l, 'deck.html')]],
    [`check new ${l}`, ['kit/check.mjs', path.join(tmp, 'new-' + l, 'deck.html')]],
  ]),
];
// 組めなかったデッキに依るテストは飛ばす
const needs = { 'check minimal': 'build minimal', smoke: 'build minimal', 'test-tools': 'build minimal', 'test-controls': 'build minimal', 'test-autoplay': 'build minimal', 'test-a11y': 'build minimal', 'check tmlr2026': 'build tmlr2026',
  'build new ja': 'new ja', 'check new ja': 'build new ja', 'build new en': 'new en', 'check new en': 'build new en' };

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
