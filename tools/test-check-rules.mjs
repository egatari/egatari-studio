// 品質チェックの決まりの台帳（kit/core/check-rules.mjs、backlog #202）の試験。ブラウザなし
//   - kit/check-messages.mjs のどの code も、ちょうど 1 つの決まりに入る（台帳にない code・2 つに入る code・台帳だけの code を落とす）
//   - 決まりの phase は kit/check.mjs の検査の段の名前（phase = '…'）
//   - excused の理由は EXCUSES の語だけ。excused か skipped の決まりに code が出たら、その回は incomplete（台帳の誤り）
//   - 通らなかった段の決まりは incomplete。編集アプリはコマンド版だけの決まりを skipped/notInEditor にし、決まりの一覧は同じ
//   - 描いた図の形（R-geometry、#201）：パーツも印もなければ excused/noParts、中身のスライドがみな縦書きなら skipped/tate（まだ測らない）、縦横が混ざれば checked
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../kit/check-messages.mjs';
import { RULES, EXCUSES, SKIPS, account, ruleOfCode, ruleSetText, cliOnlyRule, factsFromSource } from '../kit/core/check-rules.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const ok = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); } };

const all = RULES.flatMap((r) => r.codes);
ok(`every message code is in exactly one rule (${RULES.length} rules, ${all.length} codes)`, () => {
  const dup = all.filter((c, i) => all.indexOf(c) !== i);
  const missing = Object.keys(MESSAGES).filter((c) => !all.includes(c));
  const extra = all.filter((c) => !(c in MESSAGES));
  assert.deepEqual({ dup, missing, extra }, { dup: [], missing: [], extra: [] });
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length, 'rule ids are unique');
  assert.ok(RULES.every((r) => /^R-[a-z][a-z-]*$/.test(r.id) ? r.kind === 'authoring' : /^C-[a-z][a-z0-9-]*$/.test(r.id) && r.kind === 'checker'), 'R-* are authoring rules, C-* checker families');
});
ok('a code with a rule in kit/check-messages.mjs is in the ledger rule of the same name', () => {
  const bad = Object.entries(MESSAGES).filter(([, m]) => typeof m.rule === 'string').filter(([c, m]) => ruleOfCode(c) !== m.rule).map(([c, m]) => `${c}: ${m.rule} vs ${ruleOfCode(c)}`);
  assert.deepEqual(bad, []);
});
ok('every rule\'s phase is a phase of kit/check.mjs', () => {
  const src = fs.readFileSync(path.join(ROOT, 'kit', 'check.mjs'), 'utf8');
  const phases = new Set([...src.matchAll(/\bphase = '([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual(RULES.filter((r) => !phases.has(r.phase)).map((r) => r.id + ': ' + r.phase), []);
});
const FULL = { narration: true, audio: true, attachments: true, parts: ['m-predict', 'm-bars'], marks: true, morphs: true, links: true, book: true, tate: false, lang: 'ja' };
const NONE = { narration: false, audio: false, attachments: false, parts: [], marks: false, morphs: false, links: false, book: false, tate: false, lang: 'en' };
const phasesAll = new Set(RULES.map((r) => r.phase));
ok('excuses come only from EXCUSES, and a lesson with everything excuses nothing', () => {
  const a = account({ results: [], visited: phasesAll, facts: NONE });
  assert.ok(a.rules.filter((r) => r.state === 'excused').every((r) => EXCUSES.includes(r.reason)), JSON.stringify(a.rules.filter((r) => r.state === 'excused')));
  const b = account({ results: [], visited: phasesAll, facts: FULL });
  assert.equal(b.summary.excused, 0);
  assert.equal(b.status, 'ok');
  assert.equal(b.summary.checked, RULES.length);
});
ok('states: an error fails its rule; warnings and info keep it checked; summary adds up', () => {
  const a = account({ results: [{ sev: 'error', code: 'titleLong' }, { sev: 'warn', code: 'bodyBottom' }, { sev: 'info', code: 'timelineTotal' }], visited: phasesAll, facts: FULL });
  const by = Object.fromEntries(a.rules.map((r) => [r.id, r]));
  assert.equal(by['R-title'].state, 'failed');
  assert.deepEqual(by['R-title'].codes, ['titleLong']);
  assert.equal(by['R-fit'].state, 'checked');
  assert.deepEqual(by['R-fit'].counts, { error: 0, warning: 1, info: 0 });
  const S = a.summary;
  assert.equal(S.checked + S.excused + S.skipped + S.failed, S.total);
});
ok('a code reported in an excused rule makes the run incomplete (a ledger bug)', () => {
  const a = account({ results: [{ sev: 'warn', code: 'turnLong' }], visited: phasesAll, facts: NONE });
  assert.equal(a.status, 'incomplete');
  assert.match(a.problems.join(), /R-dialogue: excused \(noNarration\) but reported turnLong/);
});
ok('a code outside the ledger makes the run incomplete', () => {
  const a = account({ results: [{ sev: 'warn', code: 'noSuchCode' }], visited: phasesAll, facts: FULL });
  assert.equal(a.status, 'incomplete');
});
ok('a phase that did not run leaves its rules unset: incomplete, and those rules are named', () => {
  const visited = new Set([...phasesAll].filter((p) => p !== 'G モーフ'));
  const a = account({ results: [], visited, facts: FULL });
  assert.equal(a.status, 'incomplete');
  assert.deepEqual(a.unset, ['C-morph']);
});
ok('the editor reports the same rules; the command-line-only ones are skipped (notInEditor)', () => {
  const a = account({ results: [], facts: FULL, inEditor: true });
  assert.equal(a.rules.length, RULES.length);
  const skipped = a.rules.filter((r) => r.state === 'skipped');
  assert.ok(skipped.length > 0 && skipped.every((r) => r.reason === 'notInEditor' && SKIPS.includes(r.reason)));
  assert.deepEqual(skipped.map((r) => r.id), RULES.filter(cliOnlyRule).map((r) => r.id));
  assert.equal(a.status, 'ok');
});
ok('R-geometry: noParts without parts or data-part marks; marks alone make it apply', () => {
  const g = (f) => account({ results: [], visited: phasesAll, facts: f }).rules.find((r) => r.id === 'R-geometry');
  assert.deepEqual([g(NONE).state, g(NONE).reason], ['excused', 'noParts']);
  assert.equal(g({ ...NONE, partMarks: true }).state, 'checked');
  assert.equal(g(FULL).state, 'checked');
});
ok('R-geometry: a lesson whose content slides are all vertical is skipped (tate), not excused; tate is in SKIPS and EXCUSES', () => {
  assert.ok(SKIPS.includes('tate') && EXCUSES.includes('tate'));
  const a = account({ results: [], visited: phasesAll, facts: { ...FULL, tate: true, allTate: true } });
  const g = a.rules.find((r) => r.id === 'R-geometry');
  assert.deepEqual([g.state, g.reason], ['skipped', 'tate']);
  assert.equal(a.status, 'ok');
  assert.equal(a.summary.skipped, 1);
  const e = account({ results: [], facts: { ...FULL, tate: true, allTate: true }, inEditor: true }).rules.find((r) => r.id === 'R-geometry');
  assert.deepEqual([e.state, e.reason], ['skipped', 'tate'], 'the editor skips it for the same reason');
  const b = account({ results: [{ sev: 'info', code: 'geoTateSlides' }], visited: phasesAll, facts: { ...FULL, tate: true, allTate: true } });
  assert.equal(b.status, 'incomplete');
  assert.match(b.problems.join(), /R-geometry: skipped \(tate\) but reported geoTateSlides/);
  const m = account({ results: [{ sev: 'info', code: 'geoTateSlides' }, { sev: 'warn', code: 'geoLabelOverlap' }], visited: phasesAll, facts: { ...FULL, tate: true, allTate: false } });
  const mg = m.rules.find((r) => r.id === 'R-geometry');
  assert.deepEqual([mg.state, mg.codes, m.status], ['checked', ['geoLabelOverlap', 'geoTateSlides'], 'ok']);
});
ok('factsFromSource: partMarks and allTate (content slides only: cover and sec are left out)', () => {
  const deck = (secs) => `<html lang="ja"><body>${secs.map((c) => `<section class="${c}" id="x"></section>`).join('')}</body></html>`;
  assert.equal(factsFromSource({ deck: deck(['slide cover', 'slide layout-tate', 'slide noconcl layout-tate', 'slide sec']) }).allTate, true);
  assert.equal(factsFromSource({ deck: deck(['slide cover', 'slide layout-tate', 'slide']) }).allTate, false);
  assert.equal(factsFromSource({ deck: deck(['slide cover']) }).allTate, false);
  assert.equal(factsFromSource({ deck: '<svg><rect data-part="box" data-part-id="a"/></svg>' }).partMarks, true);
  assert.equal(factsFromSource({ deck: '<div data-part-failure="define"></div>' }).partMarks, false);
});
ok('ruleSet text depends only on ids and codes', () => {
  const t = ruleSetText();
  assert.ok(RULES.every((r) => t.includes(r.id + ':' + r.codes.join(','))));
  assert.ok(!/A 体裁|notInEditor/.test(t));
});

if (failed) { console.log(`test-check-rules: ${failed} failed`); process.exit(1); }
console.log('test-check-rules: ok');
