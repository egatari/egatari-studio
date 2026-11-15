// check --no-browser（backlog #215 (c)）の試験：ブラウザを起動せず、原稿で見られる決まりだけを見て、ほかを skipped（noBrowser）にする
// test-all: unit
//   node tools/test-check-no-browser.mjs
// 1. examples/minimal：終了コード 0、status ok、C-build・C-ids・C-vocab は checked、R-fit などは skipped（noBrowser）、JSON に noBrowser: true
// 2. 原稿のエラー（重なる id）は --no-browser でも出て、その決まりは failed、終了コード 1
// 3. 文字の出力は、見た目の検査を飛ばしたと言う。ブラウザを起動しない（PLAYWRIGHT_BROWSERS_PATH を空のフォルダにしても動く）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'nobrowser-'));
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: empty, CHROME_PATH: path.join(empty, 'none') };
const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), ...a], { encoding: 'utf8', env, timeout: 120000 });
let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok  ', name); };
try {
  ok('minimal: exit 0, source rules checked, the others skipped (noBrowser)', () => {
    const r = run(path.join(ROOT, 'examples/minimal'), '--no-browser', '--json');
    assert.equal(r.status, 0, r.stderr);
    const d = JSON.parse(r.stdout);
    assert.equal(d.status, 'ok'); assert.equal(d.noBrowser, true);
    const st = Object.fromEntries(d.rules.map((x) => [x.id, [x.state, x.reason]]));
    for (const id of ['C-build', 'C-ids', 'C-vocab']) assert.equal(st[id][0], 'checked', id);
    assert.deepEqual(st['R-fit'], ['skipped', 'noBrowser']);
    assert.ok(d.summary.skipped > 10);
  });
  ok('a source error still shows: duplicate slide ids → failed, exit 1', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nobrowser-deck-'));
    fs.cpSync(path.join(ROOT, 'examples/minimal'), dir, { recursive: true });
    const p = path.join(dir, 'deck.html');
    const s = fs.readFileSync(p, 'utf8');
    let k = 0;
    const t = s.replace(/<section class="slide">/g, (m) => (k++ < 2 ? '<section class="slide" id="same">' : m));
    assert.equal(k >= 2, true, 'minimal has two plain slides');
    fs.writeFileSync(p, t);
    const r = run(dir, '--no-browser', '--json');
    const d = JSON.parse(r.stdout);
    assert.equal(r.status, 1, r.stderr);
    assert.ok(d.counts.error >= 1);
    assert.equal(d.rules.find((x) => x.id === 'C-ids').state, 'failed');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  ok('text output says the look-and-motion checks were skipped (ja and en)', () => {
    assert.match(run(path.join(ROOT, 'examples/minimal'), '--no-browser').stdout, /ブラウザなしで動かした（--no-browser）/);
    assert.match(run(path.join(ROOT, 'examples/minimal'), '--no-browser', '--lang', 'en').stdout, /run without a browser \(--no-browser\)/);
  });
} finally { fs.rmSync(empty, { recursive: true, force: true }); }
console.log(`check-no-browser: ${n} ok`);
