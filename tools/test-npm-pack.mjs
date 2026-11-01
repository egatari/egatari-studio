// npm の包み egatari の試験（#157）：npm pack した tarball をリポジトリの外の一時フォルダに入れ、egatari コマンドで作って組んで検査する
//   node tools/test-npm-pack.mjs [作業フォルダ] [--keep]
// 1. 包みの中身：bin・kit・字の写し（fonts/@fontsource、OFL の LICENSE つき）があり、試験・examples・dist・規格の試験用ファイル・node_modules はない
// 2. 入れる：npm install <tarball>（--prefer-offline・--ignore-scripts）。@fontsource は入らない（devDependencies）
// 3. npx egatari --version・doctor・new（相対パスは cwd から）・check・build・sheet・build --portable
// 4. 再生器の版：出した版と同じならその版、違っても "+dev" だけで、外側の利用者のリポジトリの commit を付けない（kit/build.mjs の repoCommit）
// 包みと入れた後の大きさを出す。ブラウザが要る（check・doctor）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const keep = args.includes('--keep');
let work = args.find((a) => !a.startsWith('--'));
// リポジトリの中では node_modules を上にたどって見つけてしまう（入れたものだけで動くかを試せない）ので、外に作る
if (!work || path.resolve(work).startsWith(ROOT + path.sep)) work = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-pack-'));
work = path.resolve(work);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };
// npm・npx は Windows では .cmd なので shell で（空白のある引数は "" で囲む）
const WIN = process.platform === 'win32';
const sh = (cmd, argv, cwd, env = {}) => {
  if (WIN) argv = argv.map((a) => (/[\s&()^|<>]/.test(a) ? `"${a}"` : a));
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', shell: WIN, env: { ...process.env, ...env }, maxBuffer: 64 << 20, timeout: 600000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', error: r.error };
};
const must = (r, what) => { assert.equal(r.code, 0, `${what} failed (${r.code})${r.error ? ' ' + r.error.message : ''}\n${r.out.slice(-3000)}`); return r; };
const du = (d) => { let s = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); s += e.isDirectory() ? du(p) : e.isFile() ? fs.statSync(p).size : 0; } return s; };
const mb = (b) => (b / 1048576).toFixed(1) + ' MiB';

const proj = path.join(work, 'proj');
const pkgDir = path.join(proj, 'node_modules', 'egatari');
const egatari = (argv, cwd = proj, env) => sh('npx', ['--no', '--', 'egatari', ...argv], cwd, env);
let tgz = null, packed = null;

await t('npm pack：bin・kit・字の写し（OFL つき）は入り、試験・examples・dist・規格の試験用ファイルは入らない', () => {
  const r = must(sh('npm', ['pack', '--json', '--pack-destination', work], ROOT), 'npm pack');
  packed = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0];
  tgz = path.join(work, packed.filename);
  assert.ok(fs.existsSync(tgz), tgz);
  const files = new Set(packed.files.map((f) => f.path));
  for (const f of ['bin/egatari.mjs', 'kit/build.mjs', 'kit/check.mjs', 'server/dev.mjs', 'render/render.mjs', 'tts/synth.py', 'tools/new.mjs', 'tools/ids.mjs', 'tools/portable.mjs', 'tools/sheet.mjs', 'tools/comment-shots.mjs', 'tools/video.mjs',
    'components.lock.json', 'themes.lock.json', 'kit/player.lock.json', 'LICENSE', 'NOTICE', 'fonts/OFL.txt',
    'fonts/@fontsource/biz-udpgothic/400.css', 'fonts/@fontsource/biz-udpgothic/LICENSE', 'fonts/@fontsource/source-sans-3/700-italic.css']) assert.ok(files.has(f), 'missing ' + f);
  const bad = [...files].filter((f) => /^(tools\/(?!(new|ids|portable|sheet|comment-shots|video)\.mjs$)|examples\/|dist\/|app\/|colab\/|docs\/|node_modules\/|vendor\/egatari-spec\/fixtures\/|\.github\/)|__pycache__|\.ttf$|\.woff$|(^|\/)out\//.test(f));
  assert.deepEqual(bad, []);
});

await t('npm install <tarball>：入れたものに @fontsource はなく、字は写しから', () => {
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'egatari-pack-test', version: '0.0.0', private: true }, null, 2));
  must(sh('npm', ['install', path.relative(proj, tgz).split(path.sep).join('/'), '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund'], proj), 'npm install');
  assert.ok(fs.existsSync(path.join(pkgDir, 'bin', 'egatari.mjs')));
  assert.ok(!fs.existsSync(path.join(proj, 'node_modules', '@fontsource')), 'node_modules/@fontsource should not be installed');
  assert.ok(!fs.existsSync(path.join(pkgDir, '.git')));
});

await t('npx egatari --version・--help・知らないコマンド', () => {
  assert.equal(must(egatari(['--version']), '--version').stdout.trim(), PKG.version);
  const help = must(egatari(['--help']), '--help').stdout;
  assert.match(help, /usage: egatari <command>/);
  for (const sub of ['sheet', 'comment-shots', 'video']) assert.match(help, new RegExp(`egatari ${sub} `), sub);   // egatari-studio のスキルが呼ぶもの
  assert.notEqual(egatari(['nope']).code, 0);
});

await t('egatari doctor：Node・uv・ffmpeg・ブラウザを出し、要るものがそろえば 0', () => {
  const r = must(egatari(['doctor']), 'doctor');
  for (const k of ['node', 'uv', 'ffmpeg', 'browser']) assert.match(r.stdout, new RegExp(`^(ok|NG|--)\\s+${k}\\b`, 'm'), k);
});

// 一時フォルダの中に別のリポジトリ（外側の利用者のリポジトリの代わり）を作り、その中で教材を作る
const user = path.join(proj, 'lessons');
await t('egatari new deck（cwd から解く）：deck.html と narration.md、次の手順は egatari の形', () => {
  fs.mkdirSync(user, { recursive: true });
  const r = must(egatari(['new', 'deck', '--lang', 'en'], user), 'new');
  assert.ok(fs.existsSync(path.join(user, 'deck', 'deck.html')) && fs.existsSync(path.join(user, 'deck', 'narration.md')));
  assert.match(r.stdout, /egatari build deck\/deck\.html/);
});

await t('egatari check deck/deck.html：エラー 0', () => {
  const r = must(egatari(['check', 'deck/deck.html', '--json'], user), 'check');
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.equal(j.counts.error, 0, r.stdout.slice(0, 2000));
});

await t('egatari build：out/deck.html に写しの字（BIZ UDPGothic・Source Sans 3）が入る', () => {
  must(egatari(['build', 'deck/deck.html'], user), 'build');
  const html = fs.readFileSync(path.join(user, 'deck', 'out', 'deck.html'), 'utf8');
  assert.match(html, /@font-face\{font-family:"Source Sans 3"/);
  assert.match(html, /@font-face\{font-family:"BIZ UDPGothic"/);
  assert.doesNotMatch(html, /字の包みがない|がないので埋め込まない/);
});

await t('egatari sheet deck：全スライドの 1 枚の画像（egatari-studio のスキルが呼ぶ）', () => {
  must(egatari(['sheet', 'deck'], user), 'sheet');
  assert.ok(fs.statSync(path.join(user, 'deck', 'out', 'sheet.png')).size > 1000);
});

const playerOf = (dir) => {
  const f = fs.readdirSync(dir).find((x) => x.endsWith('.ega.html'));
  assert.ok(f, 'no .ega.html in ' + dir);
  const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/"player":\{"name":"egatari-player","version":"([^"]+)"/);
  assert.ok(m, 'no player in ' + f);
  fs.rmSync(path.join(dir, f));
  return m[1];
};
const playerJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit', 'player.json'), 'utf8'));
await t('egatari build --portable：再生器の版は出した版か "+dev" だけ（外側のリポジトリの commit を付けない）', () => {
  // 外側の利用者のリポジトリ（commit がある）。git がなければこの部分は飛ばす
  const g = (a) => sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], proj);
  const hasGit = g(['init', '-q']).code === 0 && g(['add', 'package.json']).code === 0 && g(['commit', '-q', '-m', 'outer']).code === 0;
  must(egatari(['build', 'deck/deck.html', '--portable'], user), 'build --portable');
  assert.match(playerOf(path.join(user, 'deck')), new RegExp(`^${playerJson.version.replace(/\./g, '\\.')}(\\+dev)?$`));
  // 出した版と違う再生器（lock の sha256 を変える）：版は "+dev" で、commit は付かない
  const lockFile = path.join(pkgDir, 'kit', 'player.lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  fs.writeFileSync(lockFile, JSON.stringify({ ...lock, sha256: '0'.repeat(64) }, null, 2) + '\n');
  try {
    must(egatari(['build', 'deck/deck.html', '--portable'], user), 'build --portable (dev player)');
    assert.equal(playerOf(path.join(user, 'deck')), playerJson.version + '+dev', hasGit ? 'outer repo commit leaked' : '');
  } finally { fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n'); }
  if (!hasGit) console.log('     (git がないので外側のリポジトリは作らなかった / no git: outer repository not created)');
});

if (packed) {
  console.log(`size: tarball ${mb(packed.size)}, unpacked ${mb(packed.unpackedSize)} (${packed.entryCount} files)`);
  if (fs.existsSync(pkgDir)) console.log(`size: installed node_modules/egatari ${mb(du(pkgDir))}, all node_modules ${mb(du(path.join(proj, 'node_modules')))}`);
}
if (!keep && !fail) fs.rmSync(work, { recursive: true, force: true });
else console.log('work: ' + work);
console.log(fail ? `${fail} / ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
