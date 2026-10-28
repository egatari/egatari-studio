// tools/step-reset-known.mjs（test-step-reset の既知の揺れ）の試験
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
// 期限（その部品の既定の版が until 以上なら失敗）、使われない項目（その場所を比べなかったら失敗）、通す形（DOM がバイトまで同じ・縁から遠い画素 2 個まで・64/255 以下）
import assert from 'node:assert/strict';
import { KNOWN, versionAtLeast, lockedVersion, expired, entryFor, knownAccepts, unused } from './step-reset-known.mjs';

let n = 0, fail = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };
const E = { platform: 'darwin', part: 'cycle', slide: 1, step: 5, until: '1.11.0', maxOff: 2, maxCh: 64, label: 'KNOWN (macOS, cycle s1k5, until components 1.11.0)' };

t('the entry is exactly macOS, cycle, slide 1, step 5, until components 1.13.1 (the earlier one expired at 1.11.0; the flake came back, fix planned in components 1.13.1)', () => {
  assert.deepEqual(KNOWN, [{ ...E, until: '1.13.1', label: 'KNOWN (macOS, cycle s1k5, until components 1.13.1)' }]);
});
t('versionAtLeast compares numerically (v prefix allowed)', () => {
  assert.equal(versionAtLeast('v1.11.0', '1.11.0'), true);
  assert.equal(versionAtLeast('v1.10.9', '1.11.0'), false);
  assert.equal(versionAtLeast('v1.12.0', '1.11.0'), true);
  assert.equal(versionAtLeast('v2.0.0', '1.11.0'), true);
  assert.equal(versionAtLeast('v1.9.0', '1.11.0'), false);
});
t('self-expiring: an entry fails once the vendored part reaches its version, with a message to remove it', () => {
  assert.deepEqual(expired([E], () => '1.10.0'), []);
  const x = expired([E], () => '1.11.0');
  assert.equal(x.length, 1);
  assert.match(x[0].msg, /the vendored cycle is 1\.11\.0 \(>= 1\.11\.0\); remove this KNOWN entry/);
  assert.equal(expired([E], () => '1.12.3').length, 1);
  assert.match(expired([E], () => null)[0].msg, /not vendored any more/);
});
t('the vendored version today (components.lock.json) has not expired the entry', () => {
  assert.deepEqual(expired(KNOWN), [], `cycle ${lockedVersion('cycle')}`);
  assert.ok(versionAtLeast(lockedVersion('cycle'), '1.11.0'), `cycle ${lockedVersion('cycle')}`);
  assert.equal(expired([E]).length, 1, 'the removed entry would have expired at the vendored version (1.11.0 or later)');
});
t('entryFor: only that platform, part, slide and step', () => {
  assert.equal(entryFor([E], 'darwin', 'cycle', 1, 5), E);
  assert.equal(entryFor([E], 'linux', 'cycle', 1, 5), null);
  assert.equal(entryFor([E], 'win32', 'cycle', 1, 5), null);
  assert.equal(entryFor([E], 'darwin', 'cycle', 1, 4), null);
  assert.equal(entryFor([E], 'darwin', 'cycle', 2, 5), null);
  assert.equal(entryFor([E], 'darwin', 'tree', 1, 5), null);
});
t('knownAccepts: byte-identical DOM, ≤ 2 off-edge pixels ≤ 64/255, otherwise within the bounds', () => {
  const D = { dom: '<m-cycle>' };
  const cmp = (o) => ({ same: false, kind: 'pixels', n: 2, cap: 200, out: 0, off: 2, offPts: [[324, 294, 54], [324, 379, 54]], ...o });
  assert.equal(knownAccepts(E, cmp({}), D, D), true, 'the macOS case (2 px, 54/255)');
  assert.equal(knownAccepts(E, cmp({ off: 3, offPts: [[1, 1, 54], [5, 5, 54], [9, 9, 54]] }), D, D), false, '3 off-edge pixels');
  assert.equal(knownAccepts(E, cmp({ offPts: [[324, 294, 65], [324, 379, 54]] }), D, D), false, '65/255');
  assert.equal(knownAccepts(E, cmp({}), D, { dom: '<m-cycle >' }), false, 'DOM not byte-identical');
  assert.equal(knownAccepts(E, cmp({}), { dom: null }, { dom: null }), false, 'no DOM to compare');
  assert.equal(knownAccepts(E, cmp({ out: 1 }), D, D), false, 'outside the component');
  assert.equal(knownAccepts(E, cmp({ n: 201 }), D, D), false, 'over the cap');
  assert.equal(knownAccepts(E, cmp({ kind: 'dom' }), D, D), false, 'not a pixels verdict');
  assert.equal(knownAccepts(null, cmp({}), D, D), false, 'no entry for this place');
});
t('unused: an entry for this platform and a tested part whose place was never compared fails; otherwise not', () => {
  const seen = new Set();
  const u = unused([E], 'darwin', ['cycle', 'tree'], seen);
  assert.equal(u.length, 1);
  assert.match(u[0].msg, /matched nothing \(part cycle, slide 1, step 5 was never compared on darwin\)/);
  assert.deepEqual(unused([E], 'darwin', ['tree'], seen), [], 'cycle not tested in this run (--only)');
  assert.deepEqual(unused([E], 'linux', ['cycle'], seen), [], 'another platform');
  seen.add(E);
  assert.deepEqual(unused([E], 'darwin', ['cycle'], seen), [], 'compared (even if it did not need the entry)');
});

console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
