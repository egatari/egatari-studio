// npm の包み egatari の試験（#157）：npm pack した tarball をリポジトリの外の一時フォルダに入れ、egatari コマンドで作って組んで検査する
//   node tools/test-npm-pack.mjs [作業フォルダ] [--keep]
// 1. 包みの中身：bin・kit・字の写し（fonts/@fontsource、OFL の LICENSE つき）があり、試験・examples・dist・規格の試験用ファイル・node_modules はない。
//    部品の写しは index.js（と使用条件）だけで README.md・demo.html・CHANGELOG.md はない（vendor/.npmignore）。既定の声の wav もない（tts/voices.json と tts/refvoices.py が初めての tts で取り寄せる）
// 2. 入れる：npm install <tarball>（--prefer-offline・--ignore-scripts）。@fontsource は入らない（devDependencies）
// 3. npx egatari --version・doctor・new（相対パスは cwd から）・check・build・sheet・build --portable
// 3a. 字体：egatari の包みは既定の 3 つ（BIZ UDPゴシック・BIZ UDP明朝・Source Sans 3）だけ。選べる 7 つは別の包み @egatari/fonts-extra
//     （packages/fonts-extra を npm pack したもの）。既定の教材はネットワークなしで組め、選べる字体のテーマ（asagi）は、その包みがなければ
//     組み立てと品質チェックが入れ方を言い（fontsExtraMissing）、その包みを入れれば組める
// 3b. doctor：部品の写しの index.js が固定と manifest の sha256 に合う（parts）。部品庫 1.x・2.x の部品を使う教材が、入れた包みで組める
// 4. 再生器の版：出した版と同じならその版、違っても "+dev" だけで、外側の利用者のリポジトリの commit を付けない（kit/build.mjs の repoCommit）
// 包みと入れた後の大きさを出す。ブラウザが要る（check・doctor）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FONT_LIST, FONTS_EXTRA_PKG } from '../kit/core/build-core.mjs';

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
let tgz = null, packed = null, extraTgz = null;
const fontName = (f) => f.pkg.replace(/^@fontsource\//, '');
const EXTRA = FONT_LIST.filter((f) => f.extra), DEFAULTS = FONT_LIST.filter((f) => !f.extra);
// ネットワークを使わない（届かないプロキシ・npm はオフライン）
const OFFLINE = { HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', NO_PROXY: '', no_proxy: '', npm_config_offline: 'true' };

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

await t('npm pack：部品の写しは index.js と使用条件だけ（README.md・demo.html・CHANGELOG.md なし）、既定の声の wav はなく、取り寄せの固定（tts/voices.json）がある', () => {
  const files = packed.files.map((f) => f.path);
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
  const dirs = new Set(Object.values(lock.components).flatMap((c) => Object.values(c.content)));
  for (const h of dirs) assert.ok(files.includes(`vendor/components/sha256/${h}/index.js`), `missing vendor/components/sha256/${h}/index.js`);
  assert.deepEqual(files.filter((f) => /^vendor\/components(-2)?\/.*(^|\/)(README\.md|demo\.html)$/.test(f)), []);
  assert.ok(files.some((f) => /^vendor\/components\/sha256\/[0-9a-f]{64}\/(OFL\.txt|LICENSE-[^/]+)$/.test(f)), 'the parts\' own licences stay');
  for (const f of ['vendor/components/manifest.json', 'vendor/components/LICENSE', 'components2.lock.json', 'tts/voices.json', 'tts/refvoices.py', 'tts/voices/README.md']) assert.ok(files.includes(f), 'missing ' + f);
  assert.deepEqual(files.filter((f) => /\.wav$/.test(f)), []);
});

await t('npm pack：字体は既定の 3 つだけ。選べる 7 つ（FONT_LIST の extra）は入らない', () => {
  const files = packed.files.map((f) => f.path);
  assert.deepEqual(DEFAULTS.map((f) => f.family).sort(), ['BIZ UDPGothic', 'BIZ UDPMincho', 'Source Sans 3']);
  for (const f of DEFAULTS) for (const x of ['400.css', '700.css', 'LICENSE']) assert.ok(files.includes(`fonts/@fontsource/${fontName(f)}/${x}`), `missing ${fontName(f)}/${x}`);
  assert.equal(EXTRA.length, 7);
  for (const f of EXTRA) assert.deepEqual(files.filter((x) => x.includes(`/${fontName(f)}/`)), [], f.family);
  assert.deepEqual(files.filter((x) => x.startsWith('packages/')), []);
});

await t('npm pack packages/fonts-extra：@egatari/fonts-extra に選べる 7 つ（CSS・woff2・OFL）があり、既定の字体はない', () => {
  const dir = path.join(ROOT, 'packages', 'fonts-extra');
  const r = must(sh('npm', ['pack', '--json', '--pack-destination', work], dir), 'npm pack fonts-extra');
  const p = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0];
  extraTgz = path.join(work, p.filename);
  assert.equal(p.name, FONTS_EXTRA_PKG);
  const files = p.files.map((f) => f.path);
  for (const f of EXTRA) {
    for (const w of f.weights) assert.ok(files.includes(`@fontsource/${fontName(f)}/${w}.css`), `${f.family} ${w}`);
    if (f.italic) assert.ok(files.includes(`@fontsource/${fontName(f)}/400-italic.css`), `${f.family} italic`);
    assert.ok(files.includes(`@fontsource/${fontName(f)}/LICENSE`) && files.some((x) => x.startsWith(`@fontsource/${fontName(f)}/files/`) && x.endsWith('.woff2')), f.family);
  }
  for (const f of DEFAULTS) assert.deepEqual(files.filter((x) => x.includes(`/${fontName(f)}/`)), [], f.family);
  assert.deepEqual(files.filter((x) => !/^(@fontsource\/|package\.json$|README\.md$)/.test(x)), []);
  console.log(`     ${FONTS_EXTRA_PKG}: tarball ${mb(p.size)}, unpacked ${mb(p.unpackedSize)} (${p.entryCount} files)`);
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
  for (const k of ['node', 'uv', 'ffmpeg', 'browser', 'voices']) assert.match(r.stdout, new RegExp(`^(ok|NG|--)\\s+${k}\\b`, 'm'), k);
  assert.match(r.stdout, /^ok\s+parts\s+index\.js \d+ /m, 'the vendored index.js files match the lock and the manifests');
});

await t('egatari doctor：部品の index.js を 1 つ書き換えると parts が NG で 1', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(pkgDir, 'components.lock.json'), 'utf8'));
  const f = path.join(pkgDir, 'vendor', 'components', 'sha256', lock.components.sweep.content[lock.components.sweep.default], 'index.js');
  const keep = fs.readFileSync(f);
  fs.writeFileSync(f, Buffer.concat([keep, Buffer.from('\n// changed\n')]));
  try {
    const r = egatari(['doctor']);
    assert.equal(r.code, 1, r.out);
    assert.match(r.stdout, /^NG\s+parts\s+.*sweep@/m);
  } finally { fs.writeFileSync(f, keep); }
});

// 一時フォルダの中に別のリポジトリ（外側の利用者のリポジトリの代わり）を作り、その中で教材を作る
const user = path.join(proj, 'lessons');
await t('egatari new deck（cwd から解く）：deck.html と narration.md と egatari.json（パーツライブラリ 2）、次の手順は egatari の形', () => {
  fs.mkdirSync(user, { recursive: true });
  const r = must(egatari(['new', 'deck', '--lang', 'en'], user), 'new');
  assert.ok(fs.existsSync(path.join(user, 'deck', 'deck.html')) && fs.existsSync(path.join(user, 'deck', 'narration.md')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(user, 'deck', 'egatari.json'), 'utf8')).componentsCatalogue, '2');
  assert.match(r.stdout, /egatari build deck\/deck\.html/);
});

await t('egatari check deck/deck.html：エラー 0', () => {
  const r = must(egatari(['check', 'deck/deck.html', '--json'], user), 'check');
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.equal(j.counts.error, 0, r.stdout.slice(0, 2000));
});

await t('egatari build：out/deck.html に写しの字（BIZ UDPGothic・Source Sans 3）が入る', () => {
  // ネットワークなし（届かないプロキシ・npm はオフライン）で組む
  const r = must(egatari(['build', 'deck/deck.html'], user, OFFLINE), 'build');
  assert.doesNotMatch(r.out, /fonts-extra/);
  const html = fs.readFileSync(path.join(user, 'deck', 'out', 'deck.html'), 'utf8');
  assert.match(html, /@font-face\{font-family:"Source Sans 3"/);
  assert.match(html, /@font-face\{font-family:"BIZ UDPGothic"/);
  assert.doesNotMatch(html, /字の包みがない|がないので埋め込まない/);
});

await t('egatari build：部品庫 1.x（minimal・pitch）と 2.x（pitch をカタログ 2 で）の部品が、README・見本のない写しから組める', () => {
  for (const [d, cat] of [['minimal', null], ['pitch-fictional', null], ['pitch-fictional', '2']]) {
    const dir = path.join(user, `ex-${d}${cat ? '-' + cat : ''}`);
    fs.cpSync(path.join(ROOT, 'examples', d), dir, { recursive: true, filter: (s) => !/[\\/](out|audio|\.cache)$/.test(s) });
    if (cat) {
      const cf = path.join(dir, 'egatari.json');
      fs.writeFileSync(cf, JSON.stringify({ ...JSON.parse(fs.readFileSync(cf, 'utf8')), componentsCatalogue: cat }, null, 2));
    }
    const r = must(egatari(['build', path.relative(user, path.join(dir, 'deck.html'))], user), `build ${d}`);
    assert.doesNotMatch(r.out, /component not found|no available index\.js|refused/, r.out.slice(-2000));
    const html = fs.readFileSync(path.join(dir, 'out', 'deck.html'), 'utf8');
    const marks = [...html.matchAll(/\/\/ ---- (\S+) \((vendor\/components\/[^)]*index\.js)\)/g)].map((m) => m[1]);
    const want = d === 'minimal' ? ['m-sweep'] : cat ? ['bars@2.0.1', 'base@1.0.0'] : ['m-bars', 'm-flow', 'm-kpi'];
    for (const w of want) assert.ok(marks.some((m) => m === w || m.startsWith(w.replace(/@.*/, '@'))), `${d}: no ${w} in ${marks.join(', ')}`);
  }
});

await t('選べる字体のテーマ（asagi、Zen Maru Gothic）：@egatari/fonts-extra がなければ build が知らせ、check は fontsExtraMissing（入れ方つき）', () => {
  must(egatari(['new', 'maru', '--lang', 'ja', '--theme', 'asagi'], user), 'new --theme asagi');
  const b = must(egatari(['build', 'maru/deck.html'], user, OFFLINE), 'build asagi');
  assert.match(b.out, /fonts-extra: .*Zen Maru Gothic.*npm i -D @egatari\/fonts-extra/);
  assert.doesNotMatch(fs.readFileSync(path.join(user, 'maru', 'out', 'deck.html'), 'utf8'), /@font-face\{font-family:"Zen Maru Gothic"/);
  const r = egatari(['check', 'maru/deck.html', '--json'], user);
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  const f = j.results.filter((x) => x.code === 'fontsExtraMissing');
  assert.equal(f.length, 1, r.stdout.slice(0, 3000));
  assert.equal(f[0].sev, 'error');
  assert.match(JSON.stringify(f[0]), /npm i -D @egatari\/fonts-extra/);
  assert.equal(j.results.filter((x) => x.code === 'fontNotEmbedded' && /Zen Maru/.test(JSON.stringify(x))).length, 0, 'not reported twice');
  assert.notEqual(r.code, 0);
});

await t('@egatari/fonts-extra をその tarball から入れると、asagi の教材が Zen Maru Gothic を埋め込んで組め、check に fontsExtraMissing がない', () => {
  assert.ok(extraTgz, 'no fonts-extra tarball');
  must(sh('npm', ['install', '-D', path.relative(proj, extraTgz).split(path.sep).join('/'), '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund'], proj), 'npm install fonts-extra');
  assert.ok(fs.existsSync(path.join(pkgDir, 'bin', 'egatari.mjs')), 'egatari is still installed');
  const b = must(egatari(['build', 'maru/deck.html'], user, OFFLINE), 'build asagi with fonts-extra');
  assert.doesNotMatch(b.out, /fonts-extra:/);
  assert.match(fs.readFileSync(path.join(user, 'maru', 'out', 'deck.html'), 'utf8'), /@font-face\{font-family:"Zen Maru Gothic"/);
  const r = egatari(['check', 'maru/deck.html', '--json'], user);
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.equal(j.results.filter((x) => x.code === 'fontsExtraMissing').length, 0);
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
