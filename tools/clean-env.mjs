// まっさらな環境で、使う人の道を一通り動かす（backlog #50。CI の clean ジョブと、版の前の確認）
//   node tools/clean-env.mjs [--skip-tts]
// 子のプロセスは、空の HOME（Windows 以外は USERPROFILE も）と、つながらない TTS のサーバー（IRODORI_URL=http://127.0.0.1:9）で動かす：
// 作った人の ~ の設定・声・テーマ・キャッシュや、動いている TTS のサーバーに頼っていれば、ここで落ちる。
// 見本（examples/*）ごとに、一時フォルダへの写しで build・check・--portable・--play-only。tts/synth.py --dry-run（uv が要る。--skip-tts で飛ばす）
// の後で組む。npm run new で作ったデッキを組んで検査する。部品庫の写しを確かめ、見本を組む。リポジトリの中には何も書かない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { vendorComponents } from './vendor-components.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const skipTts = process.argv.includes('--skip-tts');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-clean-')));
const HOME = path.join(tmp, 'home');
fs.mkdirSync(HOME);
// Windows では USERPROFILE は替えない（空のフォルダにすると Chrome が起動しない）。Node の os.homedir() は HOME ではなく USERPROFILE を見るので、
// Windows で確かめるのは HOME（Git Bash・uv など）だけ
const env = { ...process.env, HOME, ...(process.platform === 'win32' ? {} : { USERPROFILE: HOME }), IRODORI_URL: 'http://127.0.0.1:9' };
delete env.EGATARI_THEMES;   // 利用者のテーマのフォルダも使わない

let fails = 0;
function run(label, cmd, args, opts = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: opts.cwd || tmp, env, encoding: 'utf8', shell: process.platform === 'win32' && cmd !== process.execPath, timeout: 300000 });
  const good = r.status === 0;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${label} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (!good) { fails++; console.log(String((r.stdout || '') + (r.stderr || '') || r.error || '').split('\n').slice(-25).map((l) => '       ' + l).join('\n')); }
  return good;
}
const node = (label, script, args, opts) => run(label, process.execPath, [path.join(ROOT, script), ...args], opts);
const copyDeck = (src, dst) => fs.cpSync(src, dst, { recursive: true, filter: (x) => !/[\\/](out|video|bundle|\.cache)([\\/]|$)/.test(path.relative(src, x)) && path.basename(x) !== 'egatari.json' });

// 部品庫の写し（vendor/components）：components.lock.json と合っていること（ネットワークなし）と、既定の版の見本がこの環境でも組めること（出力は一時フォルダへ）
node('components: vendor/components matches components.lock.json', 'tools/components-update.mjs', ['--check']);
node('themes: themes/ and vendor/themes match themes.lock.json', 'tools/themes-lock.mjs', ['--check']);
for (const c of vendorComponents(ROOT)) {
  if (fs.existsSync(path.join(c.dir, 'demo.html'))) node(`components: build ${c.name} ${c.version} demo`, 'kit/build.mjs', [path.join(c.dir, 'demo.html'), '-o', path.join(tmp, 'demos', c.name + '.html')]);
}

for (const name of fs.readdirSync(path.join(ROOT, 'examples')).sort()) {
  const src = path.join(ROOT, 'examples', name);
  if (!fs.existsSync(path.join(src, 'deck.html'))) continue;
  const d = path.join(tmp, 'examples', name);
  copyDeck(src, d);
  const deck = path.join(d, 'deck.html');
  node(`${name}: build`, 'kit/build.mjs', [deck]);
  node(`${name}: check`, 'kit/check.mjs', [deck]);
  // 既定の書き出し先（原稿のフォルダの最上位。題名から作った名前）に、1 ファイルと再生専用ができること
  const exported = () => fs.readdirSync(d).filter((f) => f.endsWith('.ega.html'));
  node(`${name}: --portable`, 'kit/build.mjs', [deck, '--portable']);
  node(`${name}: --play-only`, 'kit/build.mjs', [deck, '--play-only']);
  const got = exported();
  const okTop = got.length === 2 && got.some((f) => f.endsWith('.play.ega.html')) && got.some((f) => !f.endsWith('.play.ega.html'));
  console.log(`${okTop ? 'ok  ' : 'FAIL'} ${name}: exports are at the top of the deck folder (${got.join(', ') || 'none'})`);
  if (!okTop) fails++;
}

// TTS の dry-run（サーバーにつながらない。無音の音声と manifest を作る）→ 音声入りで組む
if (skipTts) console.log('skip tts synth --dry-run (--skip-tts)');
else {
  const d = path.join(tmp, 'tts-deck');
  copyDeck(path.join(ROOT, 'examples', 'minimal'), d);
  fs.rmSync(path.join(d, 'audio'), { recursive: true, force: true });
  if (run('tts: synth.py --dry-run', 'uv', ['run', '--quiet', '--project', path.join(ROOT, 'tts'), 'python', path.join(ROOT, 'tts', 'synth.py'), d, '--dry-run'])) {
    const man = path.join(d, 'audio', 'manifest.json');
    if (!fs.existsSync(man)) { fails++; console.log('FAIL tts: no audio/manifest.json'); }
    node('tts: build with the audio', 'kit/build.mjs', [path.join(d, 'deck.html'), '--portable', '-o', path.join(tmp, 'tts.ega.html')]);
  }
}

// 新しいデッキ
for (const lang of ['ja', 'en']) {
  const d = path.join(tmp, `new-${lang}`);
  // ja は npm run new（package.json の script）を通す
  const made = lang === 'ja' ? run('npm run new (ja)', 'npm', ['run', '--silent', 'new', '--', d, '--lang', lang, '--title', 'Clean'], { cwd: ROOT })
    : node(`new (${lang})`, 'tools/new.mjs', [d, '--lang', lang, '--title', 'Clean environment']);
  if (made) {
    node(`new (${lang}): build`, 'kit/build.mjs', [path.join(d, 'deck.html')]);
    node(`new (${lang}): check`, 'kit/check.mjs', [path.join(d, 'deck.html')]);
  }
}

// HOME に何かが書かれたか（知らせるだけ：ブラウザや uv はキャッシュを書く）
const wrote = fs.readdirSync(HOME);
if (wrote.length) console.log(`note: written under the empty HOME: ${wrote.join(', ')}`);
if (fails) { console.log(`\n${fails} failed (work folder: ${tmp})`); process.exit(1); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nall passed');
