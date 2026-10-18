// 原稿のフォルダに置かれたシンボリックリンクと、テーマの extends で外へ出るものの確認（v0.2.2。SECURITY.md）
//   node tools/test-security.mjs <作業用のフォルダ>
// 1. kit/safe-fs.mjs：葉・途中・壊れたリンクへの書き込みを断り、外は変わらない。控えの掃除は控えの名前の普通のファイルだけ
// 2. 開発サーバー：コメント・口述原稿・原稿の保存と控えが、リンクを通すなら 403 で、外のフォルダは変わらず何も消えない（HTTP だけ。ブラウザは使わない）
// 3. 組み立ての読み出し：tokens.css・theme.json・ロゴ・部品の index.js・extends（リンク・絶対パス・../）で外のバイトが出力に入らず、知らせる
// 4. 組み立ての書き出し：out/・out/deck.html のリンク（壊れたものも）を通しては書かない
// 5. TTS（tts/synth.py --dry-run、uv があるときだけ）：audio/・manifest.json のリンクを通しては書かない
// シンボリックリンクを作るのに権限が要る Windows では飛ばす
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeWriteFile, pruneBackups, UnsafePathError } from '../kit/safe-fs.mjs';
import { build } from '../kit/build.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'motion-sectest'));
if (process.platform === 'win32') { console.log('skip: symbolic links need privileges on Windows'); process.exit(0); }
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const SECRET = 'OUTSIDE-SECRET-7f3a';
const outside = path.join(work, 'outside');
// 外のフォルダ：秘密のファイル・コメントの形のファイル・控えの名前の形をしたもの 40 個（掃除が外で消さないこと）
const snap = (d) => Object.fromEntries(fs.readdirSync(d).sort().map((f) => [f, fs.readFileSync(path.join(d, f), 'utf8')]));
const mkOutside = () => {
  fs.rmSync(outside, { recursive: true, force: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'secret.txt'), SECRET + '\n');
  fs.writeFileSync(path.join(outside, 'comments.json'), '[]\n');
  fs.writeFileSync(path.join(outside, 'tokens.css'), `/* ${SECRET} */ :root{--secret:1}\n`);
  fs.writeFileSync(path.join(outside, 'theme.json'), `{"name":"${SECRET}","logos":["logo.png"]}\n`);
  fs.writeFileSync(path.join(outside, 'logo.png'), SECRET);
  fs.writeFileSync(path.join(outside, 'index.js'), `/* ${SECRET} */ customElements.define('m-evil', class extends HTMLElement {});\n`);
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(outside, `2000-01-01T00-00-${String(i).padStart(2, '0')}-000Z-deck.html`), 'keep ' + i);
  return snap(outside);
};
const unchanged = (before, label) => {
  const after = snap(outside);
  ok(JSON.stringify(after) === JSON.stringify(before), `${label}: the outside folder is unchanged (nothing written, nothing deleted; ${Object.keys(after).length} files)`);
};
const noTmp = (d, label) => ok(!fs.readdirSync(d, { recursive: true }).some((f) => /\.tmp$/.test(String(f))), `${label}: no temporary file left`);
let nDeck = 0;
const mkDeck = (prep = () => {}) => {
  const d = path.join(work, 'deck-' + (nDeck++));
  fs.cpSync(path.join(ROOT, 'examples/minimal'), d, { recursive: true, filter: (x) => !x.includes(`${path.sep}out`) });
  prep(d);
  return d;
};

// ---------------------------------------------------------------- 1. kit/safe-fs.mjs
{
  const before = mkOutside();
  const d = mkDeck();
  const refuses = (label, file) => {
    let e = null;
    try { safeWriteFile(d, file, 'PWNED'); } catch (x) { e = x; }
    ok(e instanceof UnsafePathError, `safe-fs: ${label} -> refused (${e && e.message})`);
  };
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(d, 'leaf.txt'));
  refuses('leaf symlink to an outside file', path.join(d, 'leaf.txt'));
  fs.symlinkSync(path.join(outside, 'nothing-here.txt'), path.join(d, 'dangling.txt'));
  refuses('dangling symlink (would create an outside file)', path.join(d, 'dangling.txt'));
  fs.symlinkSync(outside, path.join(d, 'anc'));
  refuses('ancestor folder is a symlink to an outside folder', path.join(d, 'anc', 'new.txt'));
  refuses('ancestor folder is a symlink (deeper, missing folders)', path.join(d, 'anc', 'x', 'y.txt'));
  fs.symlinkSync(path.join(outside, 'no-dir'), path.join(d, 'danc'));
  refuses('ancestor folder is a dangling symlink', path.join(d, 'danc', 'new.txt'));
  refuses('../ out of the deck folder', path.join(d, '..', 'outside', 'x.txt'));
  ok(!fs.existsSync(path.join(outside, 'nothing-here.txt')) && !fs.existsSync(path.join(outside, 'no-dir')), 'safe-fs: dangling link targets were not created');
  unchanged(before, 'safe-fs');
  // 普通の書き込み：途中のフォルダを作る・既にあるファイルを rename で入れ替える・モードを保つ
  const f = path.join(d, 'sub', 'dir', 'a.txt');
  safeWriteFile(d, f, 'one'); fs.chmodSync(f, 0o640); safeWriteFile(d, f, 'two');
  ok(fs.readFileSync(f, 'utf8') === 'two' && (fs.statSync(f).mode & 0o777) === 0o640, 'safe-fs: a normal write creates folders, replaces the file and keeps its mode');
  noTmp(d, 'safe-fs');
  // 控えの掃除：控えのフォルダがリンクなら何も消さない
  fs.mkdirSync(path.join(d, '.cache'));
  fs.symlinkSync(outside, path.join(d, '.cache', 'edits'));
  let e = null;
  try { pruneBackups(d, path.join('.cache', 'edits'), 0); } catch (x) { e = x; }
  ok(e instanceof UnsafePathError, 'safe-fs: pruning a backup folder that is a symlink -> refused');
  unchanged(before, 'safe-fs prune');
}

// ---------------------------------------------------------------- 2. 開発サーバー
function start(deck) {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/dev.mjs'), deck, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  srv.stderr.on('data', (d) => { log += d; });
  const base = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start\n' + log)), 20000);
    srv.stdout.on('data', (d) => { log += d; const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); res(m[0]); } });
    srv.on('exit', (c) => { clearTimeout(t); rej(new Error('server exited ' + c + '\n' + log)); });
  });
  return { srv, base, log: () => log };
}
const rawAt = (base, pathname, { method = 'GET', headers = {}, body } = {}) => new Promise((res, rej) => {
  const u = new URL(base);
  const r = http.request({ host: '127.0.0.1', port: u.port, method, path: pathname, headers: { host: u.host, ...headers } }, (resp) => {
    let d = ''; resp.on('data', (c) => { d += c; }); resp.on('end', () => res({ status: resp.statusCode, body: d }));
  });
  r.on('error', rej); if (body) r.write(body); r.end();
});
const short = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

const devCases = [
  ['comments.json is a symlink to an outside file (leaf)', (d) => fs.symlinkSync(path.join(outside, 'comments.json'), path.join(d, 'comments.json')), 'comment'],
  ['comments.json is a dangling symlink', (d) => fs.symlinkSync(path.join(outside, 'new-comments.json'), path.join(d, 'comments.json')), 'comment'],
  ['narration.md is a symlink to an outside file (leaf)', (d) => { fs.rmSync(path.join(d, 'narration.md')); fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(d, 'narration.md')); }, 'narration'],
  ['narration.md is a dangling symlink', (d) => { fs.rmSync(path.join(d, 'narration.md')); fs.symlinkSync(path.join(outside, 'new-narration.md'), path.join(d, 'narration.md')); }, 'narration'],
  ['deck.html is a symlink to an outside file (leaf)', (d) => { fs.copyFileSync(path.join(d, 'deck.html'), path.join(outside, 'deck.html')); fs.rmSync(path.join(d, 'deck.html')); fs.symlinkSync(path.join(outside, 'deck.html'), path.join(d, 'deck.html')); }, 'edit'],
  ['deck.html is a symlink to a file inside the deck folder (leaf)', (d) => { fs.renameSync(path.join(d, 'deck.html'), path.join(d, 'real.html')); fs.symlinkSync('real.html', path.join(d, 'deck.html')); }, 'edit'],
  ['.cache (ancestor of the backups) is a symlink to an outside folder', (d) => fs.symlinkSync(outside, path.join(d, '.cache')), 'edit'],
  ['.cache/edits (the backup folder) is a symlink to an outside folder', (d) => { fs.mkdirSync(path.join(d, '.cache')); fs.symlinkSync(outside, path.join(d, '.cache', 'edits')); }, 'edit'],
  ['.cache/edits is a dangling symlink', (d) => { fs.mkdirSync(path.join(d, '.cache')); fs.symlinkSync(path.join(outside, 'new-edits'), path.join(d, '.cache', 'edits')); }, 'edit'],
  ['.cache/edits is a symlink, narration save', (d) => { fs.mkdirSync(path.join(d, '.cache')); fs.symlinkSync(outside, path.join(d, '.cache', 'edits')); }, 'narration'],
];
for (const [label, prep, what] of devCases) {
  mkOutside();
  const d = mkDeck(prep);
  const before = snap(outside);
  const real = fs.existsSync(path.join(d, 'real.html')) ? path.join(d, 'real.html') : null;
  const realBefore = real && fs.readFileSync(real, 'utf8');
  const narrBefore = fs.existsSync(path.join(d, 'narration.md')) && !fs.lstatSync(path.join(d, 'narration.md')).isSymbolicLink() ? fs.readFileSync(path.join(d, 'narration.md'), 'utf8') : null;
  const S = start(path.join(d, 'deck.html'));
  try {
    const b = await S.base;
    const page = (await rawAt(b, '/')).body;
    const T = JSON.parse(/window\.__DECK_DEV_TOKEN=("[0-9a-f]+")/.exec(page)[1]);
    const H = { 'content-type': 'application/json', 'x-deck-token': T, origin: b.replace(/\/$/, '') };
    let r;
    if (what === 'comment') {
      const g = await rawAt(b, '/__dev/comments', { headers: H });
      ok(!g.body.includes(SECRET), `dev: ${label}: GET /__dev/comments does not return outside bytes (${g.status})`);
      r = await rawAt(b, '/__dev/comment', { method: 'POST', headers: H, body: JSON.stringify({ key: 'x', comment: 'PWNED-by-symlink' }) });
    } else if (what === 'narration') {
      const g = await rawAt(b, '/__dev/narration?key=' + encodeURIComponent('タイトル:0'), { headers: H });
      ok(!g.body.includes(SECRET), `dev: ${label}: GET /__dev/narration does not return outside bytes (${g.status})`);
      const k = /data-key="([^"]+)"/.exec(page);
      const sk = k ? k[1].split(':')[0] : 'x';
      const rev = g.status === 200 ? JSON.parse(g.body).rev : '';
      const g2 = await rawAt(b, '/__dev/narration?key=' + encodeURIComponent(sk + ':0'), { headers: H });
      r = await rawAt(b, '/__dev/narration', { method: 'POST', headers: H, body: JSON.stringify({ slideKey: sk, stepKey: '0', rev: g2.status === 200 ? JSON.parse(g2.body).rev : rev, turns: [{ role: 'expert', text: 'PWNED-by-symlink' }] }) });
    } else {
      const src = fs.readFileSync(path.join(d, 'deck.html'), 'utf8');
      const m = / data-src="(\d+)-(\d+)"/.exec(page);
      const [a0, b0] = m ? [+m[1], +m[2]] : [0, 1];
      r = await rawAt(b, '/__dev/edit', { method: 'POST', headers: H, body: JSON.stringify({ range: `${a0}-${b0}`, h: short(src.slice(a0, b0)), text: 'PWNED-by-symlink' }) });
    }
    ok(r.status === 403, `dev: ${label}: the ${what} save is refused (${r.status} ${r.body.slice(0, 100)})`);
    unchanged(before, `dev: ${label}`);
    if (real) ok(fs.readFileSync(real, 'utf8') === realBefore, `dev: ${label}: the link target is unchanged`);
    if (narrBefore !== null && what === 'narration') ok(fs.readFileSync(path.join(d, 'narration.md'), 'utf8') === narrBefore, `dev: ${label}: narration.md is unchanged (backup refused first)`);
    noTmp(d, `dev: ${label}`);
  } catch (e) { fails++; console.error(e); } finally { S.srv.kill(); }
}
// 普通のフォルダでは保存でき、控えの掃除は控えの名前の普通のファイルだけを消す（ほかの名前・リンクは残す）
{
  const before = mkOutside();
  const d = mkDeck((x) => {
    const e = path.join(x, '.cache', 'edits'); fs.mkdirSync(e, { recursive: true });
    for (let i = 0; i < 35; i++) fs.writeFileSync(path.join(e, `2000-01-01T00-00-${String(i).padStart(2, '0')}-000Z-deck.html`), 'old ' + i);
    fs.writeFileSync(path.join(e, 'notes.txt'), 'mine');
    fs.writeFileSync(path.join(e, '000-important.txt'), 'mine');
    fs.symlinkSync(path.join(outside, '2000-01-01T00-00-00-000Z-deck.html'), path.join(e, '1999-01-01T00-00-00-000Z-link.html'));
  });
  const S = start(path.join(d, 'deck.html'));
  try {
    const b = await S.base;
    const page = (await rawAt(b, '/')).body;
    const T = JSON.parse(/window\.__DECK_DEV_TOKEN=("[0-9a-f]+")/.exec(page)[1]);
    const H = { 'content-type': 'application/json', 'x-deck-token': T, origin: b.replace(/\/$/, '') };
    const src = fs.readFileSync(path.join(d, 'deck.html'), 'utf8');
    const m = / data-src="(\d+)-(\d+)"/.exec(page);
    const [a0, b0] = [+m[1], +m[2]];
    const r = await rawAt(b, '/__dev/edit', { method: 'POST', headers: H, body: JSON.stringify({ range: `${a0}-${b0}`, h: short(src.slice(a0, b0)), text: src.slice(a0, b0) + '!' }) });
    const e = path.join(d, '.cache', 'edits'), names = fs.readdirSync(e);
    const backups = names.filter((n) => /^\d{4}-.*Z-deck\.html$/.test(n));
    ok(r.status === 200 && fs.readFileSync(path.join(d, 'deck.html'), 'utf8').includes(src.slice(a0, b0) + '!'), 'dev: a normal edit still saves ' + r.status);
    ok(backups.length === 30 && names.includes('notes.txt') && names.includes('000-important.txt') && names.includes('1999-01-01T00-00-00-000Z-link.html'), `dev: backup cleanup keeps 30 backups, never touches other names or links (${backups.length} backups, ${names.length} entries)`);
    unchanged(before, 'dev: normal save');
    noTmp(d, 'dev: normal save');
  } catch (e) { fails++; console.error(e); } finally { S.srv.kill(); }
}

// 見張りは原稿のフォルダの実体の中のフォルダだけ：外を指すリンクの audio/・data/ は見張らず（一度ずつ知らせる）、外での変更で組み直さない
{
  mkOutside();
  const oa = path.join(work, 'outside-audio'), od = path.join(work, 'outside-data');
  for (const x of [oa, od]) { fs.rmSync(x, { recursive: true, force: true }); fs.mkdirSync(x, { recursive: true }); }
  fs.writeFileSync(path.join(oa, 'manifest.json'), '{"segments":{}}\n'); fs.writeFileSync(path.join(od, 'v.json'), '{}\n');
  // 組み立てのたびに出る知らせ（外部の画像）で、組み直しを数える（外の中身は組み立てが読まないので、出力は変わらない）
  const d = mkDeck((x) => { fs.rmSync(path.join(x, 'audio'), { recursive: true, force: true }); fs.symlinkSync(oa, path.join(x, 'audio')); fs.symlinkSync(od, path.join(x, 'data'));
    const f = path.join(x, 'deck.html'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', '<img alt="" src="https://example.invalid/watch-probe.png"></section>')); });
  const builds = (t) => t.split('watch-probe.png').length - 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = start(path.join(d, 'deck.html'));
  try {
    await S.base;
    await wait(800);
    ok(/not watching audio: it is a symbolic link/.test(S.log()) && /not watching data: it is a symbolic link/.test(S.log()) && S.log().split('not watching audio').length === 2, 'dev watch: symlinked audio/ and data/ are not watched (warned once each)');
    const at = S.log().length;
    for (let i = 0; i < 3; i++) { fs.writeFileSync(path.join(oa, 'manifest.json'), `{"segments":{},"n":${i}}\n`); fs.writeFileSync(path.join(od, 'v.json'), `{"n":${i}}\n`); fs.writeFileSync(path.join(oa, `x${i}.wav`), 'x'); await wait(300); }
    await wait(1200);
    ok(builds(S.log().slice(0, at)) >= 1 && builds(S.log().slice(at)) === 0 && !/rebuilt/.test(S.log().slice(at)), `dev watch: changes in the outside folders behind the links cause no rebuild (${builds(S.log().slice(at))} builds after the changes)`);
    // 対照：原稿のフォルダの中の変更では組み直す
    fs.appendFileSync(path.join(d, 'narration.md'), '\n## 追加の節\n[0] 見張りの対照。\n');
    const t0 = Date.now(); while (!/rebuilt/.test(S.log().slice(at)) && Date.now() - t0 < 8000) await wait(100);
    ok(/rebuilt/.test(S.log().slice(at)) && builds(S.log().slice(at)) >= 1, 'dev watch: a change inside the deck folder still rebuilds');
  } catch (e) { fails++; console.error(e); } finally { S.srv.kill(); }
}

// ---------------------------------------------------------------- 3. 組み立ての読み出し
const withTheme = (d, theme) => fs.writeFileSync(path.join(d, 'deck.html'), fs.readFileSync(path.join(d, 'deck.html'), 'utf8').replace('data-theme="default"', `data-theme="${theme}"`));
const mkTheme = (d, name, cfg) => {
  const t = path.join(d, 'themes', name); fs.mkdirSync(t, { recursive: true });
  fs.writeFileSync(path.join(t, 'tokens.css'), `/* theme ${name} */ :root{--x:1}\n`);
  if (cfg) fs.writeFileSync(path.join(t, 'theme.json'), JSON.stringify(cfg));
  return t;
};
const buildCases = [
  ['tokens.css is a symlink to an outside file', (d) => { const t = mkTheme(d, 't1'); fs.rmSync(path.join(t, 'tokens.css')); fs.symlinkSync(path.join(outside, 'tokens.css'), path.join(t, 'tokens.css')); withTheme(d, 't1'); }],
  ['theme.json is a symlink to an outside file', (d) => { const t = mkTheme(d, 't1'); fs.symlinkSync(path.join(outside, 'theme.json'), path.join(t, 'theme.json')); withTheme(d, 't1'); }],
  ['the theme folder is a symlink to an outside folder', (d) => { fs.mkdirSync(path.join(d, 'themes')); fs.symlinkSync(outside, path.join(d, 'themes', 't1')); withTheme(d, 't1'); }],
  ['a logo is a symlink to an outside file', (d) => { const t = mkTheme(d, 't1', { logos: ['logo.png'] }); fs.symlinkSync(path.join(outside, 'logo.png'), path.join(t, 'logo.png')); withTheme(d, 't1'); }],
  ['extends names a theme folder that is a symlink', (d) => { mkTheme(d, 't1', { extends: 't2' }); fs.symlinkSync(outside, path.join(d, 'themes', 't2')); withTheme(d, 't1'); }],
  ['extends is an absolute path', (d) => { mkTheme(d, 't1', { extends: outside }); withTheme(d, 't1'); }],
  ['extends uses ../', (d) => { mkTheme(d, 't1', { extends: path.relative(path.join(d, 'themes'), outside) }); withTheme(d, 't1'); }],
  ['extends three levels down reaches outside', (d) => { mkTheme(d, 't1', { extends: 't2' }); mkTheme(d, 't2', { extends: 't3' }); mkTheme(d, 't3', { extends: outside }); withTheme(d, 't1'); }],
  ['a deck component index.js is a symlink to an outside file', (d) => {
    fs.mkdirSync(path.join(d, 'components', 'evil'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'index.js'), path.join(d, 'components', 'evil', 'index.js'));
    fs.writeFileSync(path.join(d, 'deck.html'), fs.readFileSync(path.join(d, 'deck.html'), 'utf8').replace('</section>', '<m-evil></m-evil></section>'));
  }],
  ['a deck component folder is a symlink to an outside folder', (d) => {
    fs.mkdirSync(path.join(d, 'components'));
    fs.symlinkSync(outside, path.join(d, 'components', 'evil'));
    fs.writeFileSync(path.join(d, 'deck.html'), fs.readFileSync(path.join(d, 'deck.html'), 'utf8').replace('</section>', '<m-evil></m-evil></section>'));
  }],
];
for (const [label, prep] of buildCases) {
  const before = mkOutside();
  const d = mkDeck(prep);
  try {
    const r = build(path.join(d, 'deck.html'), { out: path.join(d, 'out', 'deck.html') });
    ok(!r.html.includes(SECRET) && !r.html.includes(Buffer.from(SECRET).toString('base64')), `build: ${label}: no outside bytes in the output`);
    ok(r.stats.warn.some((w) => /^refused:/.test(w)), `build: ${label}: warns (${r.stats.warn.filter((w) => /^refused:/.test(w)).join(' / ').slice(0, 120)})`);
  } catch (e) { fails++; console.error(label, e); }
  unchanged(before, `build: ${label}`);
}
// 中を指すリンク・default の継承・部品庫の部品はそのまま使える
{
  mkOutside();
  const d = mkDeck((x) => {
    const t = mkTheme(x, 't1', { extends: 'default' });
    fs.writeFileSync(path.join(t, 'real.css'), '/* INSIDE-OK */ :root{--y:1}\n');
    fs.rmSync(path.join(t, 'tokens.css')); fs.symlinkSync('real.css', path.join(t, 'tokens.css'));
    withTheme(x, 't1');
  });
  const r = build(path.join(d, 'deck.html'), { out: path.join(d, 'out', 'deck.html') });
  ok(r.html.includes('INSIDE-OK') && !r.stats.warn.some((w) => /^refused:/.test(w)), 'build: a tokens.css linking inside its theme folder and extends "default" still work');
  const d2 = mkDeck((x) => { mkTheme(x, 'self', { extends: '../themes/self' }); withTheme(x, 'self'); });
  let e = null;
  try { build(path.join(d2, 'deck.html'), { out: path.join(d2, 'out', 'deck.html') }); } catch (x) { e = x; }
  ok(e && /nested too deeply/.test(e.message), 'build: a theme that extends itself stops with an error (' + (e && e.message) + ')');
}
// 通常のファイルだけを読む。FIFO は開けば止まる：CLI を子の process で、期限付きで（止まれば失敗）
if (process.platform !== 'win32' && spawnSync('mkfifo', ['--help']).error?.code !== 'ENOENT') {
  const fifo = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); spawnSync('mkfifo', [f]); return fs.lstatSync(f).isFIFO(); };
  const cli = (d) => { const t0 = Date.now(); const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(d, 'deck.html')], { encoding: 'utf8', timeout: 20000 });
    return { r, ms: Date.now() - t0, m: r.error && r.error.code === 'ETIMEDOUT' ? 'hung (timeout)' : r.stderr.trim().split('\n')[0] }; };
  const fifoCases = [
    ['an include', (d) => { fs.writeFileSync(path.join(d, 'deck.html'), fs.readFileSync(path.join(d, 'deck.html'), 'utf8').replace('</section>', '<style>/*INCLUDE:pipe.css*/</style></section>')); return path.join(d, 'pipe.css'); }],
    ["the theme's tokens.css", (d) => { const t = mkTheme(d, 'ft'); fs.rmSync(path.join(t, 'tokens.css')); withTheme(d, 'ft'); return path.join(t, 'tokens.css'); }],
  ];
  for (const [label, prep] of fifoCases) {
    let made = false;
    const d = mkDeck((x) => { made = fifo(prep(x)); });
    const o = cli(d);
    ok(made && o.r.status === 1 && /is not a regular file/.test(o.m) && o.ms < 10000, `build: a FIFO as ${label} -> refused at once, no hang (exit ${o.r.status}: …${o.m.slice(-80)}; ${o.ms} ms)`);
  }
} else console.log('  skip FIFO cases (no mkfifo)');

// ---------------------------------------------------------------- 4. 組み立ての書き出し（kit/build.mjs の CLI）
const outCases = [
  ['out/ is a symlink to an outside folder', (d) => fs.symlinkSync(outside, path.join(d, 'out'))],
  ['out/deck.html is a symlink to an outside file', (d) => { fs.mkdirSync(path.join(d, 'out')); fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(d, 'out', 'deck.html')); }],
  ['out/deck.html is a dangling symlink', (d) => { fs.mkdirSync(path.join(d, 'out')); fs.symlinkSync(path.join(outside, 'new.html'), path.join(d, 'out', 'deck.html')); }],
];
for (const [label, prep] of outCases) {
  const before = mkOutside();
  const d = mkDeck(prep);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(d, 'deck.html')], { encoding: 'utf8' });
  ok(r.status !== 0 && /symbolic link/.test(r.stderr), `build out: ${label}: refused (exit ${r.status}: ${r.stderr.trim().split('\n')[0].slice(0, 100)})`);
  unchanged(before, `build out: ${label}`);
}
{
  const d = mkDeck();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(d, 'deck.html')], { encoding: 'utf8' });
  ok(r.status === 0 && fs.statSync(path.join(d, 'out', 'deck.html')).size > 1000, 'build out: a normal build still writes out/deck.html');
}

// ---------------------------------------------------------------- 5. TTS（tts/synth.py --dry-run）
const uv = spawnSync('uv', ['--version'], { encoding: 'utf8' });
if (uv.error || uv.status !== 0) console.log('  skip TTS cases (uv not found)');
else {
  const synth = (d) => spawnSync('uv', ['run', '--quiet', '--project', path.join(ROOT, 'tts'), 'python', path.join(ROOT, 'tts', 'synth.py'), d, '--dry-run'], { encoding: 'utf8', cwd: ROOT });
  const ttsCases = [
    ['audio/ is a symlink to an outside folder', (d) => fs.symlinkSync(outside, path.join(d, 'audio'))],
    ['audio/manifest.json is a symlink to an outside file', (d) => { fs.mkdirSync(path.join(d, 'audio')); fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(d, 'audio', 'manifest.json')); }],
    ['audio/manifest.json is a dangling symlink', (d) => { fs.mkdirSync(path.join(d, 'audio')); fs.symlinkSync(path.join(outside, 'new.json'), path.join(d, 'audio', 'manifest.json')); }],
  ];
  for (const [label, prep] of ttsCases) {
    const before = mkOutside();
    const d = mkDeck(prep);
    const r = synth(d);
    ok(r.status !== 0 && /symbolic link/.test(r.stdout + r.stderr), `tts: ${label}: refused (exit ${r.status})`);
    unchanged(before, `tts: ${label}`);
  }
  const d = mkDeck();
  const r = synth(d);
  ok(r.status === 0 && fs.existsSync(path.join(d, 'audio', 'manifest.json')), 'tts: a normal dry run still writes audio/ ' + (r.status === 0 ? '' : r.stderr.slice(-200)));
  noTmp(d, 'tts: normal dry run');
}

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
