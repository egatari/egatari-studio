// 種をまいた教材（tools/fixtures/seeded-defects/ja、backlog #202）の試験：品質チェックが、言っている決まりの誤りを本当に見つけるか。
// 教材には台帳（kit/core/check-rules.mjs の RULES）の決まりの 1 つずつに、わかっている誤りを 1 つずつ入れてある。期待は同じフォルダの expected.json：
//   rules：{決まりの id: [必ず出る code …] | {excused|skipped: 理由, note}}、alsoAllowed：{決まりの id: [種に付いて出てよい code …]}
//   - 点検が終わる（status が ok。incomplete でない）
//   - RULES のどの決まりも expected.json にあり、expected.json の決まりはどれも RULES にある
//   - code の期待がある決まりは failed か checked で、期待の code がどれもその決まりの codes に出る
//   - excused・skipped の期待がある決まりは、ちょうどその状態と理由で終わる
//   - 期待にも alsoAllowed にもない code は出ない（種のほかに誤りが紛れていない）
// node tools/test-seeded-defects.mjs [教材のフォルダ]（既定は tools/fixtures/seeded-defects/ja）。ヘッドレス Chrome を使う
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RULES } from '../kit/core/check-rules.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIX = path.resolve(process.argv[2] || path.join(ROOT, 'tools', 'fixtures', 'seeded-defects', 'ja'));
let failed = 0;
const ok = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); } };

const expected = JSON.parse(fs.readFileSync(path.join(FIX, 'expected.json'), 'utf8'));
const exp = expected.rules || {};
const also = expected.alsoAllowed || {};

const r = spawnSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), FIX, '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let out = null;
try { out = JSON.parse(r.stdout); } catch (e) { console.log(`  FAIL check.mjs did not print JSON (exit ${r.status})\n${r.stderr}`); process.exit(1); }

ok(`the check finished (status ok, exit ${r.status})`, () => {
  assert.equal(out.status, 'ok', `status ${out.status}; unset ${JSON.stringify(out.unset)}; problems ${JSON.stringify(out.problems)}`);
  assert.ok(r.status === 0 || r.status === 1, `exit code ${r.status}`);
});
ok('every rule in RULES is in expected.json, and vice versa', () => {
  const ids = RULES.map((x) => x.id);
  assert.deepEqual({ missing: ids.filter((id) => !(id in exp)), extra: Object.keys(exp).filter((id) => !ids.includes(id)) }, { missing: [], extra: [] });
  assert.deepEqual(Object.keys(also).filter((id) => !ids.includes(id)), [], 'alsoAllowed names only rules of RULES');
});

const byId = new Map((out.rules || []).map((x) => [x.id, x]));
let caught = 0, seeded = 0;
for (const rule of RULES) {
  const e = exp[rule.id], got = byId.get(rule.id);
  if (e === undefined) continue;
  ok(`${rule.id}: ${Array.isArray(e) ? 'reports ' + e.join(', ') : JSON.stringify(e)}`, () => {
    assert.ok(got, `${rule.id} is not in the check's rules`);
    const allowed = new Set([...(Array.isArray(e) ? e : []), ...(also[rule.id] || [])]);
    if (Array.isArray(e)) {
      seeded++;
      assert.ok(e.length, 'at least one expected code');
      assert.ok(e.every((c) => rule.codes.includes(c)), `expected codes ${e.join(', ')} are not all codes of ${rule.id}`);
      assert.ok(got.state === 'failed' || got.state === 'checked', `state ${got.state}${got.reason ? ' (' + got.reason + ')' : ''}`);
      const missing = e.filter((c) => !got.codes.includes(c));
      assert.deepEqual(missing, [], `not reported: ${missing.join(', ')} (reported: ${got.codes.join(', ') || 'none'})`);
      caught++;
    } else {
      const want = 'excused' in e ? 'excused' : 'skipped' in e ? 'skipped' : null;
      assert.ok(want, 'an expectation is an array of codes or {excused|skipped: reason}');
      assert.equal(`${got.state}/${got.reason || ''}`, `${want}/${e[want]}`);
    }
    const unexpected = got.codes.filter((c) => !allowed.has(c));
    assert.deepEqual(unexpected, [], `unexpected codes for ${rule.id}: ${unexpected.join(', ')}`);
  });
}

console.log(`test-seeded-defects: caught ${caught}/${RULES.length} rules` + (seeded !== RULES.length ? ` (${RULES.length - seeded} excused or skipped by design)` : ''));
if (failed) { console.log(`test-seeded-defects: ${failed} failed`); process.exit(1); }
