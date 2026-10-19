// tools/changelog.mjs の試験（一時フォルダの中で）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-changelog.mjs
// 断片の検め（節の名前・項目の前の見出し・名前）・--preview・--release（節の順・比べるリンク・版・断片を消す・Unreleased に項目があれば断る・同じ版は断る）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'changelog.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'));
const run = (root, ...a) => { const r = spawnSync(process.execPath, [TOOL, ...a, '--root', root], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } }); return { code: r.status, out: r.stdout + r.stderr }; };
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`ok   ${name}`); };

const LOG = `# Changelog

## [Unreleased]

<!-- fragments live in changes/ -->

## [0.4.1] - 2026-10-19

### Added

- old

[Unreleased]: https://github.com/o/r/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/o/r/compare/v0.4.0...v0.4.1
`;
function repo(name, frags, log = LOG) {
  const root = path.join(tmp, name);
  fs.mkdirSync(path.join(root, 'changes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'changes', '.gitkeep'), '');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), log);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', version: '0.4.1' }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'x', version: '0.4.1', lockfileVersion: 3, packages: { '': { name: 'x', version: '0.4.1' } } }, null, 2) + '\n');
  for (const [f, t] of Object.entries(frags)) fs.writeFileSync(path.join(root, 'changes', f), t);
  return root;
}

ok('good fragments pass --check', () => {
  const root = repo('good', { 'b-fix.md': '### Fixed\n\n- **b** fixed\n  over two lines\n', 'a-new.md': '### Added\n- a\n\n### Changed (API)\n- api\n' });
  const r = run(root, '--check');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /2 fragment\(s\) ok/);
});

ok('bad fragments fail --check with the file and line', () => {
  const root = repo('bad', { 'x.md': '### Improved\n- a\n', 'y.md': '- no header\n', 'z.md': '### Added\nsome prose\n', 'Bad Name.md': '### Added\n- a\n', 'e.md': '### Added\n' });
  const r = run(root, '--check');
  assert.equal(r.code, 1);
  assert.match(r.out, /changes\/x\.md:1: unknown section "Improved"/);
  assert.match(r.out, /changes\/y\.md:1: entry before a section header/);
  assert.match(r.out, /changes\/z\.md:2: expected/);
  assert.match(r.out, /Bad Name\.md: name must be/);
  assert.match(r.out, /changes\/e\.md: no entries/);
});

ok('--preview prints sections in the fixed order and writes nothing', () => {
  const root = repo('preview', { 'b.md': '### Fixed\n- f\n', 'a.md': '### Changed\n- c\n\n### Added\n- a\n' });
  const before = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const r = run(root, '--preview', '0.5.0', '--date', '2026-11-01');
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '## [0.5.0] - 2026-11-01\n\n### Added\n\n- a\n\n### Changed\n\n- c\n\n### Fixed\n\n- f\n\n');
  assert.equal(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), before);
  assert.equal(fs.readdirSync(path.join(root, 'changes')).length, 3);
});

ok('--release assembles, fixes links and versions, removes fragments', () => {
  const root = repo('release', { 'api.md': '### Changed (API)\n- shape\n', 'b.md': '### Added\n- new thing\n  continued\n' });
  const r = run(root, '--release', '0.5.0', '--date', '2026-11-01');
  assert.equal(r.code, 0, r.out);
  const log = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.equal(log, `# Changelog

## [Unreleased]

<!-- fragments live in changes/ -->

## [0.5.0] - 2026-11-01

### Added

- new thing
  continued

### Changed (API)

- shape

## [0.4.1] - 2026-10-19

### Added

- old

[Unreleased]: https://github.com/o/r/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/o/r/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/o/r/compare/v0.4.0...v0.4.1
`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, '0.5.0');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, '0.5.0'); assert.equal(lock.packages[''].version, '0.5.0');
  assert.deepEqual(fs.readdirSync(path.join(root, 'changes')), ['.gitkeep']);
  // 2 回目：同じ版は断る（断片もない）
  assert.equal(run(root, '--release', '0.5.0').code, 1);
});

ok('--release refuses entries under Unreleased, rc versions, and no fragments', () => {
  const root = repo('refuse', { 'a.md': '### Added\n- a\n' }, LOG.replace('<!-- fragments live in changes/ -->', '- hand-written'));
  const r = run(root, '--release', '0.5.0');
  assert.equal(r.code, 1);
  assert.match(r.out, /move them into changes/);
  assert.equal(run(root, '--release', '0.5.0-rc.1').code, 1);
  assert.equal(run(repo('empty', {}), '--release', '0.5.0').code, 1);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n} passed`);
