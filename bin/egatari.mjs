#!/usr/bin/env node
// egatari コマンド（npm の包み egatari の bin。npx egatari …）：各スクリプトに振り分けるだけ
//   egatari new|ids|check|build|dev|sheet|comment-shots|portable|video|tts|doctor|skills update [引数…]、egatari --version、egatari --help
// 引数はそのままスクリプトに渡す。相対パスは呼び出した場所（cwd）から解く（INIT_CWD も cwd にそろえる）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readHead, readRegular } from '../kit/bounded-read.mjs';
import { verifyVendorIndex } from '../kit/vendor-verify.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// 名前 → [スクリプト, 説明（日本語 / English）, 引数の形]
const SCRIPTS = {
  new: ['tools/new.mjs', '新しい作業フォルダを雛形から作る / create a working folder from the template', '<folder> [--lang en|ja] [--theme name] [--title "…"]'],
  build: ['kit/build.mjs', '原稿を 1 つの HTML に組む / build deck.html into one HTML file', '<deck.html> [-o out.html] [--portable] [--play-only] [--embed-audio] [--theme name] …'],
  check: ['kit/check.mjs', '品質チェック（ブラウザが要る）/ quality check (needs a browser)', '<deck.html> [--json]'],
  dev: ['server/dev.mjs', '開発サーバー（ブラウザで編集）/ dev server (edit in the browser)', '<deck.html> [--port 8730] [--theme name]'],
  sheet: ['tools/sheet.mjs', '全スライドの最終段階を 1 枚の画像に / contact sheet of every slide\'s last step', '<folder | deck.html | .ega.html> [out.png] [--steps] [--tiles] [--cols 4]'],
  'comment-shots': ['tools/comment-shots.mjs', '開発サーバーのコメントの画面を撮る / screenshots of open dev-server comments', '<folder | deck.html> [id …] [--all]'],
  ids: ['tools/ids.mjs', 'スライドに安定した id を付ける / give slides stable ids', '<folder | deck.html> [--dry-run]'],
  portable: ['tools/portable.mjs', '1 ファイル（.ega.html）と作業フォルダの行き来 / single file (.ega.html) <-> working folder', 'unpack|pack|attach|compare …'],
  video: ['render/render.mjs', '音声の入った教材を動画に（ffmpeg が要る。音声は作らない）/ export a lesson with its audio to video (needs ffmpeg; makes no audio)', '<folder | .ega.html>  または / or  <out/deck.html> --out <dir> [--full] [--only key,…]'],
};

function help() {
  const w = Math.max(...Object.keys(SCRIPTS).map((k) => k.length), 'doctor'.length, 'skills'.length);
  const line = (name, desc, use) => `  ${name.padEnd(w)}  ${desc}\n  ${''.padEnd(w)}    egatari ${name}${use ? ' ' + use : ''}`;
  console.log(`egatari ${PKG.version} — Egatari Studio

使い方 / usage: egatari <command> [args…]

${Object.entries(SCRIPTS).map(([k, [, d, u]]) => line(k, d, u)).join('\n')}
${line('tts', '口述原稿を AI 音声にする（uv が要る）/ synthesize the script with TTS (needs uv)', '<folder> [--dry-run] [--voices expert=bob,novice=alice] …')}
${line('doctor', 'Node・uv・ffmpeg・ブラウザがあるか、部品の写しが正しいか、入れたスキルが古くないか調べる / check Node, uv, ffmpeg, a browser, the parts and the installed skills', '')}
${line('skills', 'Claude Code・Codex に入れたスキルを更新する / update the skills installed in Claude Code and Codex', 'update')}

  --version  版を出す / print the version
  --help     この説明 / this help

相対パスは今いるフォルダから / relative paths are resolved from the current folder.
詳しくは / more: ${PKG.homepage}`);
}

// 子の環境：INIT_CWD を cwd に（npm run から呼ばれても、相対パスはどのスクリプトでも cwd から）、EGATARI_CLI で次の手順の書き方を変える
const childEnv = (extra = {}) => ({ ...process.env, INIT_CWD: process.cwd(), EGATARI_CLI: 'egatari', ...extra });

// 子を動かし、その終了コードで終わる（Ctrl+C は子が受けて終わる。dev サーバー）
function run(cmd, args, env) {
  process.on('SIGINT', () => {});
  process.on('SIGTERM', () => {});
  const c = spawn(cmd, args, { stdio: 'inherit', env });
  c.on('error', (e) => {
    if (e.code === 'ENOENT') console.error(`${cmd} が見つからない / ${cmd} not found. egatari doctor`);
    else console.error(e.message);
    process.exit(127);
  });
  c.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
}

// OS ごとのキャッシュの場所（TTS の仮想環境を node_modules や npx のキャッシュの中に作らない）
function cacheDir() {
  if (process.platform === 'win32') return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches');
  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
}

// ---------------------------------------------------------------- スキルの版
const INSTRUCTION_RE = /\*\*(?:指示の版|Instruction version)[：:]\s*([a-f0-9]{8})\*\*/;
const kitInstruction = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'kit', 'instruction-version.json'), 'utf8')).instruction || null; } catch { return null; } };
// 入れたスキル（Claude Code・Codex のプラグインのキャッシュと個人のスキルのフォルダ）の SKILL.md から、指示の版の行を拾う
function installedSkills() {
  const home = os.homedir();
  const roots = ['.claude/plugins', '.claude/skills', '.codex/plugins', '.codex/skills', '.agents/skills'].map((d) => path.join(home, d));
  const found = [];
  const walk = (dir, depth) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const f = path.join(dir, e.name);
      if (e.isDirectory() && depth < 9 && e.name !== 'node_modules' && e.name !== '.git') walk(f, depth + 1);
      else if (e.name === 'SKILL.md') {
        let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
        const name = t.match(/^---\n[\s\S]*?^name:\s*(\S+)/m)?.[1];
        const v = t.match(INSTRUCTION_RE)?.[1];
        if ((name === 'make' || name === 'studio') && v) found.push({ file: f, name, version: v });
      }
    }
  };
  for (const r of roots) walk(r, 0);
  return found;
}
function skillsCheck() {
  const kit = kitInstruction();
  if (!kit) return;
  const old = installedSkills().filter((s) => s.version !== kit);
  if (!old.length) return;
  const [major, minor] = PKG.version.split('.');
  console.log(`!!  skills   入れたスキルの指示の版が、この egatari（${kit}）と違う / installed skill instructions differ from this egatari (${kit}):`);
  for (const s of old) console.log(`           ${s.name} ${s.version}  ${s.file}`);
  console.log(`           更新 / update: npx egatari@${major}.${minor}.x skills update`);
}

// ---------------------------------------------------------------- skills update
const MARKET = 'egatari', PLUGINS = ['egatari', 'egatari-studio'];
const onWin = process.platform === 'win32';
function lastJson(out) {
  const lines = String(out || '').split('\n').map((l) => l.trim()).filter(Boolean);
  try { return JSON.parse(lines[lines.length - 1]); } catch { return undefined; }
}
function summarize(j) {
  if (j === null || typeof j !== 'object') return String(j);
  const pick = ['status', 'result', 'message', 'oldVersion', 'newVersion', 'previousVersion', 'version', 'updated', 'changed'].filter((k) => k in j);
  const text = JSON.stringify(pick.length ? Object.fromEntries(pick.map((k) => [k, j[k]])) : j);
  return text.length > 240 ? text.slice(0, 237) + '…' : text;
}
function skillsUpdate() {
  const tools = {
    claude: [['plugin', 'marketplace', 'update', MARKET, '--json'], ...PLUGINS.map((p) => ['plugin', 'update', `${p}@${MARKET}`, '--json'])],
    codex: [['plugin', 'marketplace', 'upgrade', MARKET, '--json'], ...PLUGINS.map((p) => ['plugin', 'add', `${p}@${MARKET}`, '--json'])],
  };
  let failed = 0, done = 0;
  for (const [tool, steps] of Object.entries(tools)) {
    const probe = spawnSync(tool, ['--version'], { encoding: 'utf8', timeout: 15000, shell: onWin });
    if (probe.error || probe.status !== 0) { console.log(`--  ${tool}  見つからない（飛ばす）/ not found on PATH (skipped)`); continue; }
    let ok = true;
    for (const args of steps) {
      const cmd = `${tool} ${args.join(' ')}`;
      const r = spawnSync(tool, args, { encoding: 'utf8', timeout: 180000, shell: onWin });
      const j = lastJson(r.stdout);
      const bad = r.error || r.status !== 0 || j === undefined || (j && typeof j === 'object' && (j.error || j.success === false || j.ok === false));
      if (bad) {
        ok = false;
        console.log(`NG  ${cmd}`);
        console.log(`    失敗。出力はそのまま / failed. raw output:\n${[r.stdout, r.stderr, r.error?.message].filter(Boolean).join('\n').trimEnd().replace(/^/gm, '    ')}`);
        console.log(`    手で行う / run by hand: ${cmd.replace(' --json', '')}`);
        break;
      }
      console.log(`ok  ${cmd.replace(' --json', '')}: ${summarize(j)}`);
    }
    if (ok) done++; else failed++;
  }
  if (!done && !failed) console.log('claude も codex も見つからない。どちらかを入れてから / neither claude nor codex was found; install one first.');
  else if (done) console.log('更新したら道具を再起動すると反映される / restart the tool to apply the update.');
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------- doctor
// engines の範囲（"^22.23.4 || ^24.22.1 || >=26.12.1" の形だけ）に v が入るか
function satisfies(v, range) {
  const n = (s) => s.replace(/^v/, '').split('.').map(Number);
  const cmp = (a, b) => { for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); return 0; };
  const x = n(v);
  return range.split('||').map((s) => s.trim()).some((r) => {
    const m = r.match(/^(\^|>=)?\s*(\d+(?:\.\d+){0,2})$/);
    if (!m) return false;
    const b = n(m[2]);
    return m[1] === '^' ? x[0] === b[0] && cmp(x, b) >= 0 : m[1] === '>=' ? cmp(x, b) >= 0 : cmp(x, b) === 0;
  });
}
const firstLine = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
  return r.status === 0 ? (r.stdout || r.stderr).split('\n')[0].replace(/\s+Copyright.*/, '').trim() : null;
};

// 旧 README のシンボリックリンク ~/.claude/skills/motion-*（motion-slides など）が、プラグインへの移行後に切れていないか。
// 切れたリンク、または移動のお知らせ（SKILL.md に下の STUB_MARK）だけの項目を返す。読むだけで、何も消さない
const STUB_MARK = 'This skill moved into the egatari plugin.';
function oldSkillLinks(home = os.homedir()) {
  const dir = path.join(home, '.claude', 'skills');
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.startsWith('motion-')).sort(); } catch { return []; }
  const out = [];
  for (const n of names) {
    const p = path.join(dir, n);
    let dead = false;
    try { fs.statSync(p); } catch { dead = true; }
    if (dead) { out.push({ path: p, why: 'dead link / 切れたリンク' }); continue; }
    try { if (readHead(path.join(p, 'SKILL.md'), 4096).toString('utf8').includes(STUB_MARK)) out.push({ path: p, why: 'moved notice / 移動のお知らせ' }); } catch { /* 他のスキルは対象外 */ }
  }
  return out;
}
// 既定の声（tts/voices.json）の在りか：tts/voices/（checkout）→ 利用者のキャッシュ（取り寄せたもの。tts/refvoices.py と同じ場所）。
// ないものは初めての egatari tts が取り寄せる。返すもの：{tag, local, cached, missing, dir}
function defaultVoices() {
  const lock = JSON.parse(readRegular(path.join(ROOT, 'tts', 'voices.json'), { max: 1 << 16 }).toString('utf8'));
  const dir = path.join(cacheDir(), 'egatari', 'voices', lock.tag);
  const out = { tag: lock.tag, local: 0, cached: 0, missing: 0, dir };
  for (const f of Object.keys(lock.files)) {
    if (fs.existsSync(path.join(ROOT, 'tts', 'voices', f))) out.local++;
    else if (fs.existsSync(path.join(dir, f))) out.cached++;
    else out.missing++;
  }
  return out;
}

const MIGRATE_STEPS = '~/.claude/skills/motion-* を消して、Claude Code で次を実行 / delete ~/.claude/skills/motion-* and run in Claude Code:\n'
  + '/plugin marketplace add egatari/egatari-studio\n/plugin install egatari@egatari\n/plugin install egatari-studio@egatari';

async function doctor() {
  let bad = 0;
  const show = (ok, name, what, hint, required) => {
    if (!ok && required) bad++;
    console.log(`${ok ? 'ok  ' : required ? 'NG  ' : '--  '} ${name.padEnd(8)} ${what}`);
    if (!ok && hint) console.log('           ' + hint.split('\n').join('\n           '));
  };
  console.log(`egatari ${PKG.version} (${ROOT})`);
  const range = PKG.engines?.node || '';
  show(satisfies(process.versions.node, range), 'node', `${process.versions.node}（要るもの / required: ${range}）`,
    'Node.js を入れ直す / install a supported Node.js: https://nodejs.org/', true);
  const uv = firstLine('uv', ['--version']);
  show(!!uv, 'uv', uv || 'なし / not found（tts に使う / used by tts）',
    '入れ方 / install: https://docs.astral.sh/uv/getting-started/installation/', false);
  const ff = firstLine('ffmpeg', ['-version']), fp = firstLine('ffprobe', ['-version']);
  show(!!(ff && fp), 'ffmpeg', ff ? (fp ? ff : ff + '（ffprobe がない / ffprobe not found）') : 'なし / not found（video と音声の圧縮に使う / used by video and audio compression）',
    '入れ方 / install: macOS `brew install ffmpeg`, Windows `winget install Gyan.FFmpeg`, Linux `sudo apt install ffmpeg` (https://ffmpeg.org/download.html)', false);
  // ブラウザ：kit/browser.mjs と同じ順（CHROME_PATH → Chrome → Edge → Playwright の Chromium）で起動してみる
  try {
    const { launchWhich } = await import('../kit/browser.mjs');
    const { browser, via } = await launchWhich({ headless: true });
    const ver = browser.version();
    await browser.close();
    show(true, 'browser', `${via} ${ver}`, '', true);
  } catch (e) {
    show(false, 'browser', 'なし / not found（check・video・PDF に使う / used by check, video and PDF）',
      'Google Chrome か Microsoft Edge を入れる、`npx playwright-core install chromium`、または CHROME_PATH=/path/to/chrome\n'
      + 'install Google Chrome or Microsoft Edge, run `npx playwright-core install chromium`, or set CHROME_PATH=/path/to/chrome', true);
  }
  // 部品の写し：組み立てが読む index.js を、固定（components.lock.json）と manifest のファイルごとの sha256 で（kit/vendor-verify.mjs）
  const vv = verifyVendorIndex(ROOT);
  show(!vv.problems.length, 'parts', vv.problems.length ? `部品の写しが固定と合わない / the vendored parts do not match their pins: ${vv.problems.slice(0, 3).join('; ')}${vv.problems.length > 3 ? ` (+${vv.problems.length - 3})` : ''}`
    : `index.js ${vv.versions} 版、固定と manifest の sha256 に合う / ${vv.versions} versions match the lock and the manifests`, '包みを入れ直す / reinstall the package (`npm install egatari`)', true);
  try {
    const dv = defaultVoices();
    show(!dv.missing, 'voices', dv.missing ? `既定の声 ${dv.missing} 本は初めての egatari tts で取り寄せる / ${dv.missing} default voices are downloaded on the first egatari tts (to ${dv.dir})`
      : dv.local ? '既定の声は tts/voices/ に / the default voices are in tts/voices/' : `既定の声は取り寄せ済み / the default voices are downloaded (${dv.dir})`, '', false);
  } catch (e) { show(false, 'voices', `tts/voices.json: ${e.message}`, '', false); }
  const old = oldSkillLinks();
  show(!old.length, 'skills', old.length ? `古いスキルの置き場が残っている / old skill entries left: ${old.map((o) => `${o.path} (${o.why})`).join(', ')}` : '古いスキルの置き場なし / no old skill entries', MIGRATE_STEPS, false);
  skillsCheck();
  console.log(bad ? `足りないもの ${bad} / ${bad} required missing` : 'ok');
  process.exit(bad ? 1 : 0);
}

// ---------------------------------------------------------------- 振り分け
// video の引数 1 つが作業フォルダか 1 ファイル（.ega.html）か
function isLesson(arg) {
  try { return fs.statSync(path.resolve(arg)).isDirectory() || /\.ega\.html$/i.test(arg); } catch { return false; }
}
const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') { help(); process.exit(cmd ? 0 : 1); }
if (cmd === '-v' || cmd === '--version' || cmd === 'version') { console.log(PKG.version); process.exit(0); }
if (cmd === 'doctor') await doctor();
else if (cmd === 'skills') { if (rest[0] === 'update') skillsUpdate(); else { console.error('使い方 / usage: egatari skills update'); process.exit(1); } }
else if (cmd === 'tts') {
  // uv run --frozen：包みの中の uv.lock を書き換えない。仮想環境は利用者のキャッシュに（UV_PROJECT_ENVIRONMENT があればそれ）。.pyc も包みに書かない
  const tts = path.join(ROOT, 'tts');
  const extra = {};
  if (!process.env.UV_PROJECT_ENVIRONMENT) extra.UV_PROJECT_ENVIRONMENT = path.join(cacheDir(), 'egatari', `tts-venv-${PKG.version}`);
  if (!process.env.PYTHONDONTWRITEBYTECODE) extra.PYTHONDONTWRITEBYTECODE = '1';
  run('uv', ['run', '--frozen', '--project', tts, 'python', path.join(tts, 'synth.py'), ...rest], childEnv(extra));
} else if (cmd === 'video' && rest.length === 1 && !rest[0].startsWith('-') && isLesson(rest[0])) {
  // 作業フォルダか 1 ファイル（.ega.html）だけなら tools/video.mjs（組んでから --full で書き出す。Colab のノートと同じ入口）
  run(process.execPath, [path.join(ROOT, 'tools/video.mjs'), ...rest], childEnv());
} else if (Object.hasOwn(SCRIPTS, cmd)) run(process.execPath, [path.join(ROOT, SCRIPTS[cmd][0]), ...rest], childEnv());
else { console.error(`知らないコマンド / unknown command: ${cmd}\n`); help(); process.exit(1); }
