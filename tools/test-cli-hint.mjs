// 知らせの中のコマンドを今の呼ばれ方で打てる形にする（kit/cli-hint.mjs）：egatari コマンド・リポジトリの中・外から node で
// test-all: unit
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cliHints, cliCommand } from '../kit/cli-hint.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const msg = 'run npm run ids -- --confirm-links; add ids with npm run ids';
assert.equal(cliHints(msg, {}, ROOT), msg, 'inside the repository: unchanged');
assert.equal(cliHints(msg, {}, path.join(ROOT, 'examples')), msg, 'below the repository: unchanged');
assert.equal(cliHints(msg, { EGATARI_CLI: 'egatari' }, os.tmpdir()), 'run npx egatari ids --confirm-links; add ids with npx egatari ids');
const side = path.join(path.dirname(ROOT), 'books');
assert.equal(cliCommand('ids', {}, side), `node ../${path.basename(ROOT)}/tools/ids.mjs`, 'a neighbouring folder: a relative path to the script');
assert.equal(cliHints(msg, {}, side), `run node ../${path.basename(ROOT)}/tools/ids.mjs --confirm-links; add ids with node ../${path.basename(ROOT)}/tools/ids.mjs`);
const far = path.join(path.dirname(ROOT), 'x', 'y', 'z');
assert.equal(cliCommand('check', {}, far), `node ${path.join(ROOT, 'kit', 'check.mjs')}`, 'far away (three folders up or more): an absolute path');
// check.mjs run from outside the repository says how to run ids from there
const deck = path.join(ROOT, 'tools', 'fixtures', 'article-book', 'deck.html');
const r = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), deck, '--json'], { cwd: path.dirname(ROOT), encoding: 'utf8', env: { ...process.env, INIT_CWD: '' } });
const out = JSON.parse(r.stdout);
const hinted = out.results.filter((x) => /ids/.test(x.msg || ''));
assert.ok(hinted.every((x) => !/npm run ids/.test(x.msg)), 'check --json from outside: no npm run ids');
console.log(`test-cli-hint: ok (${hinted.length} hint(s) in the fixture's check)`);
