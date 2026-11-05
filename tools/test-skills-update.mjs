// test-all: unit
// egatari skills update と、doctor の「入れたスキルが古い」知らせ（backlog #172）。claude・codex は本物を使わず、一時フォルダの偽物（stub）を PATH に置く。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BIN = path.join(ROOT, 'bin', 'egatari.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-skills-'));
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const win = process.platform === 'win32';

// 偽物：引数を STUB_LOG に書き、STUB_FAIL_<TOOL> があるとその出力で失敗し、なければ最後の行に JSON を出す
function stub(dir, tool) {
  fs.mkdirSync(dir, { recursive: true });
  const js = path.join(dir, `${tool}-stub.mjs`);
  fs.writeFileSync(js, `import fs from 'node:fs';
const a = process.argv.slice(2);
if (process.env.STUB_LOG) fs.appendFileSync(process.env.STUB_LOG, '${tool} ' + a.join(' ') + '\\n');
if (a[0] === '--version') { console.log('${tool} 0.0.0-stub'); process.exit(0); }
if (process.env.STUB_FAIL_${tool.toUpperCase()}) { console.error('boom from ${tool}'); process.exit(3); }
console.log('some progress text');
console.log(JSON.stringify({ status: 'ok', args: a.slice(0, 3), version: '0.6.3' }));
`);
  if (win) fs.writeFileSync(path.join(dir, `${tool}.cmd`), `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`);
  else { const f = path.join(dir, tool); fs.writeFileSync(f, `#!${process.execPath}\nimport ${JSON.stringify(js)};\n`); fs.chmodSync(f, 0o755); }
}
const mk = (name, tools) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); for (const t of tools) stub(d, t); return d; };
const run = (args, bin, env = {}) => {
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8', timeout: scaled(120000),
    env: { PATH: bin + (win ? path.delimiter + path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : ''), HOME: home, USERPROFILE: home, SystemRoot: process.env.SystemRoot, CHROME_PATH: path.join(tmp, 'no-browser'), ...env },
  });
};
const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n') : []);

// 1. 両方ある：それぞれ 3 つの命令を決まった順で
{
  const log = path.join(tmp, 'both.log');
  const r = run(['skills', 'update'], mk('both', ['claude', 'codex']), { STUB_LOG: log });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const l = lines(log).filter((x) => !x.includes('--version'));
  assert.deepEqual(l, [
    'claude plugin marketplace update egatari --json',
    'claude plugin update egatari@egatari --json',
    'claude plugin update egatari-studio@egatari --json',
    'codex plugin marketplace upgrade egatari --json',
    'codex plugin add egatari@egatari --json',
    'codex plugin add egatari-studio@egatari --json',
  ]);
  assert.match(r.stdout, /ok {2}claude plugin update egatari@egatari: .*"version":"[0-9.]+"/);
  assert.match(r.stdout, /restart the tool/);
}
// 2. claude だけ：codex は知らせて飛ばす
{
  const r = run(['skills', 'update'], mk('claude-only', ['claude']));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /codex .*not found on PATH/);
  assert.match(r.stdout, /ok {2}claude plugin marketplace update egatari/);
}
// 3. 失敗：生の出力と手で行う命令。ほかの道具は続ける。終了コード 1
{
  const log = path.join(tmp, 'fail.log');
  const r = run(['skills', 'update'], mk('fail', ['claude', 'codex']), { STUB_LOG: log, STUB_FAIL_CLAUDE: '1' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NG {2}claude plugin marketplace update egatari --json/);
  assert.match(r.stdout, /boom from claude/);
  assert.match(r.stdout, /run by hand: claude plugin marketplace update egatari$/m);
  assert.ok(lines(log).some((x) => x.startsWith('codex plugin add egatari@egatari')));
  assert.ok(!lines(log).some((x) => x.startsWith('claude plugin update')));
}
// 4. どちらもない
{
  const r = run(['skills', 'update'], mk('none', []));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /neither claude nor codex/);
}
// 5. doctor：入れたスキルの指示の版が違えば知らせ、同じなら黙る
{
  const kit = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit', 'instruction-version.json'), 'utf8')).instruction;
  assert.match(kit, /^[a-f0-9]{8}$/);
  const skill = (v) => `---\nname: make\ndescription: x\n---\n\n**指示の版：${v}**\n`;
  const dir = path.join(tmp, 'home', '.codex', 'plugins', 'cache', 'egatari', 'egatari', '0.6.3', 'skills', 'make');
  fs.mkdirSync(dir, { recursive: true });
  const bin = mk('doctor', []);
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skill('00000000'));
  const old = run(['doctor'], bin);
  assert.match(old.stdout, /skills .*differ/);
  assert.match(old.stdout, /make 00000000/);
  assert.match(old.stdout, new RegExp(`npx egatari@${PKG_VERSION.split('.').slice(0, 2).join('\\.')}\\.x skills update`));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skill(kit));
  assert.doesNotMatch(run(['doctor'], bin).stdout, /differ/);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok skills update (stub claude/codex) and doctor skill-version check');
