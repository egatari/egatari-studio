// test-all: unit
// 確認問題（format spec §8.4 ctx.answer・§9.2 completion.checks、spec bindings/scorm12.md §2.1・§3。handoff #84）の純ロジック（Node だけ）
//   node tools/test-checks.mjs
// - kit/core/checks.mjs：問いの鍵（<slideKey>/<番号>/<id>、ASCII）・知らせの形・宣言した問いだけを記録・同じ問いは最後の答えで置き換え、答えた・正解したは残る（少なくとも 1 回）・
//   checks の決まり（宣言した問いに答えるまで・正解するまで止める）・点数（正解のある問い（答えていない問いを含む）のうち正解した割合、四捨五入、なければ null）・qa・qc の字と再開・再生器に入る形（classicNamespace）
// - kit/core/scorm.mjs：completionRule の checks・withChecks（deck-meta.completion.checks だけを書き換え、ほかはバイトのまま）・scormPackage の checks
// - kit/core/portable.mjs：deck-meta.completion.checks の形（"answered" か "correct"）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { checksRule, questionKey, answerValue, newAnswers, recordAnswer, checksMet, scoreOf, keysText, keysFrom, restoreAnswers } from '../kit/core/checks.mjs';
import { completionRule, withChecks, scormPackage } from '../kit/core/scorm.mjs';
import { validateDeckMeta } from '../kit/core/portable.mjs';
import { classicNamespace, RUNTIME_NAMESPACES, jsonScript } from '../kit/core/build-core.mjs';
import { readZip } from '../kit/core/zip-read.mjs';
import { FORMAT } from '../kit/core/format.mjs';

let count = 0;
async function test(name, fn) { await fn(); count++; console.log('ok   ' + name); }

await test('checksRule reads "answered" and "correct" only', () => {
  assert.equal(checksRule({ checks: 'answered' }), 'answered');
  assert.equal(checksRule({ visitedFraction: 0.9, checks: 'correct' }), 'correct');
  for (const c of [null, undefined, {}, { checks: 'all' }, { checks: true }, 'correct']) assert.equal(checksRule(c), null);
});

await test('questionKey: <slideKey>/<index>/<id>, ASCII, no commas', () => {
  assert.equal(questionKey('s-abc123', 0, 'q'), 's-abc123/0/q');
  assert.equal(questionKey('s-abc123', 2, 'a,b/c'), 's-abc123/2/a%2Cb%2Fc');
  const k = questionKey('s-x', 1, '問い');
  assert.match(k, /^[\x21-\x7e]+$/);
  assert.deepEqual(keysFrom(k), [k]);
});

await test('answerValue: correct is true, false or null; value a string or number', () => {
  assert.deepEqual(answerValue(true, '同時'), { correct: true, value: '同時' });
  assert.deepEqual(answerValue(false, 3), { correct: false, value: 3 });
  assert.deepEqual(answerValue(null), { correct: null });
  assert.deepEqual(answerValue(true, { x: 1 }), { correct: true });
  assert.deepEqual(answerValue(true, NaN), { correct: true });
  assert.equal(answerValue('yes', 'a'), null);
  assert.equal(answerValue(undefined), null);
  assert.equal(answerValue(1), null);
  assert.equal(answerValue(true, 'x'.repeat(2000)).value.length, 1000);
});

await test('recordAnswer: only declared questions; the latest answer replaces earlier ones; answered and correct stay (at least once)', () => {
  const k = 's-a/0/q', s = newAnswers([k]);
  assert.equal(recordAnswer(s, 's-a/0/other', true, 'x'), false);   // 宣言にない id は無視する（§8.4）
  assert.deepEqual(Object.keys(s.answered), []);
  assert.equal(recordAnswer(s, k, false, '重い球'), true);
  assert.deepEqual({ ...s.latest[k] }, { correct: false, value: '重い球' });
  assert.equal(scoreOf(s), 0);
  recordAnswer(s, k, true, '同時');
  assert.deepEqual({ ...s.latest[k] }, { correct: true, value: '同時' });
  recordAnswer(s, k, false, '軽い球');
  assert.deepEqual({ ...s.latest[k] }, { correct: false, value: '軽い球' });
  assert.deepEqual(Object.keys(s.answered), [k]);
  assert.deepEqual(Object.keys(s.correct), [k]);
  assert.equal(scoreOf(s), 100);
});

await test('checksMet: declared questions hold back completion until answered / answered correctly; null answers have no right answer', () => {
  const s = newAnswers(['s-a/0/q', 's-b/0/q']);
  assert.equal(checksMet(null, s), true);
  assert.equal(checksMet('answered', s), false);   // 答えていない問いがある
  assert.equal(checksMet('correct', s), false);
  recordAnswer(s, 's-a/0/q', false, 'x');
  assert.equal(checksMet('answered', s), false);
  recordAnswer(s, 's-b/0/q', null, 'opinion');
  assert.equal(checksMet('answered', s), true);
  assert.equal(checksMet('correct', s), false);   // s-b は正解のない問い、s-a はまだ外したまま
  recordAnswer(s, 's-a/0/q', true, 'y');
  assert.equal(checksMet('correct', s), true);
  // 宣言した問いがなければ、どちらの決まりも止めない
  assert.equal(checksMet('answered', newAnswers()), true);
  assert.equal(checksMet('correct', newAnswers([])), true);
});

await test('scoreOf: correct / declared questions with a right answer (unanswered ones count), rounded; null without such questions', () => {
  assert.equal(scoreOf(newAnswers()), null);
  const s = newAnswers(['s-n/0/q', 's-a/0/q', 's-b/0/q', 's-c/0/q']);
  assert.equal(scoreOf(s), 0);   // 答えていない問いも正解のある問いに数える
  recordAnswer(s, 's-n/0/q', null);
  assert.equal(scoreOf(s), 0);
  recordAnswer(s, 's-a/0/q', true);
  assert.equal(scoreOf(s), 33);   // 1 / 3（s-n は正解がない）
  recordAnswer(s, 's-b/0/q', false); recordAnswer(s, 's-b/0/q', true);
  assert.equal(scoreOf(s), 67);
  const only = newAnswers(['s-n/0/q']); recordAnswer(only, 's-n/0/q', null);
  assert.equal(scoreOf(only), null);
});

await test('keysText / keysFrom / restoreAnswers: qa and qc of the suspend data (undeclared keys dropped)', () => {
  const s = newAnswers(['s-a/0/q', 's-b/1/q']);
  recordAnswer(s, 's-b/1/q', false); recordAnswer(s, 's-a/0/q', true);
  assert.equal(keysText(s.answered), 's-a/0/q,s-b/1/q');
  assert.equal(keysText(s.correct), 's-a/0/q');
  assert.deepEqual(keysFrom('s-a/0/q,bad key,s-b/x/q,,s-c/3/q'), ['s-a/0/q', 's-c/3/q']);
  assert.deepEqual(keysFrom(undefined), []);
  const r = restoreAnswers(newAnswers(['s-a/0/q', 's-b/1/q']), 's-a/0/q,s-b/1/q,s-z/9/q', 's-a/0/q,s-y/0/q');
  assert.deepEqual(Object.keys(r.answered).sort(), ['s-a/0/q', 's-b/1/q']);
  assert.deepEqual(Object.keys(r.correct), ['s-a/0/q']);
  // qa にだけある問いは true か false で答えたとみなす（点数を上げない）
  assert.equal(scoreOf(r), 50);
  assert.equal(checksMet('correct', r), false);
  assert.equal(checksMet('answered', r), true);
  // qc だけ（qa がない）でも答えたことにする
  assert.deepEqual(Object.keys(restoreAnswers(newAnswers(['s-z/0/q']), undefined, 's-z/0/q').answered), ['s-z/0/q']);
});

await test('the player gets it as DECK.Checks (classicNamespace)', () => {
  assert.equal(RUNTIME_NAMESPACES['core/checks.mjs'], 'Checks');
  const ctx = { DECK: {} };
  vm.runInNewContext(classicNamespace(fs.readFileSync(new URL('../kit/core/checks.mjs', import.meta.url), 'utf8'), 'Checks'), ctx);
  const C = ctx.DECK.Checks, k = C.questionKey('s-a', 0, 'q'), s = C.newAnswers([k]);
  assert.equal(C.scoreOf(s), 0);
  C.recordAnswer(s, k, true, 'v');
  assert.equal(C.scoreOf(s), 100);
  assert.equal(C.checksRule({ checks: 'correct' }), 'correct');
});

await test('completionRule reports checks', () => {
  assert.equal(completionRule(null).checks, null);
  assert.equal(completionRule({ checks: 'answered' }).checks, 'answered');
  assert.deepEqual(completionRule({ visitedFraction: 0.9, played: true, checks: 'correct' }), { kind: 'fraction', percent: 90, played: true, checks: 'correct' });
  assert.equal(completionRule({ checks: 'other' }).checks, null);
});

// 再生専用の写しの形だけを持つ最小の文書（deck-meta だけ）
const DOC_ID = '5e2a9c41-7b3d-4f8e-a1c6-2d9b0e4f7a13';
const doc = (meta) => `<!DOCTYPE html>\n<html lang="ja"><head><meta charset="utf-8"><title>T</title>\n${jsonScript('deck-meta', meta)}\n</head><body><p>本文</p></body></html>\n`;
const META = { format: FORMAT.FORMAT_ID, version: { major: 1, minor: 0 }, docId: DOC_ID, title: 'T', lang: 'ja', portable: false, tracking: ['scorm12', 'postmessage', 'local'] };
const metaOf = (h) => JSON.parse(/<script type="application\/json" id="deck-meta">([\s\S]*?)<\/script>/.exec(h)[1]);

await test('withChecks rewrites only deck-meta.completion.checks', () => {
  const h = doc({ ...META, completion: { visitedFraction: 0.9, played: true } });
  const a = withChecks(h, 'correct');
  assert.deepEqual(metaOf(a).completion, { visitedFraction: 0.9, played: true, checks: 'correct' });
  const at = a.indexOf('<script type="application/json" id="deck-meta">'), end = a.indexOf('</script>', at) + 9;
  assert.equal(a.slice(0, at), h.slice(0, at));
  assert.equal(a.slice(end), h.slice(h.indexOf('</script>', at) + 9));
  assert.deepEqual(metaOf(withChecks(a, null)).completion, { visitedFraction: 0.9, played: true });
  assert.equal(withChecks(h, null), h);   // 変わらなければバイトのまま
  assert.equal(withChecks(a, 'correct'), a);
  // checks だけの completion を消すと completion ごと消す（{} は規則のない completion）
  const b = withChecks(doc(META), 'answered');
  assert.deepEqual(metaOf(b).completion, { checks: 'answered' });
  assert.ok(!('completion' in metaOf(withChecks(b, null))));
  assert.throws(() => withChecks(h, 'all'), TypeError);
  assert.throws(() => withChecks('<html></html>', 'correct'), (e) => e.code === 'scorm-not-egatari');
});

await test('scormPackage applies checks to the copy it packages; without the option the file is unchanged', async () => {
  const h = doc({ ...META });
  const files = async (zip) => (await readZip(zip, { maxMembers: 10, maxMemberBytes: () => 1048576, maxTotalBytes: 4194304, accept: () => true })).files;
  const p0 = scormPackage(h);
  assert.equal(p0.completion, null);
  assert.equal(new TextDecoder().decode((await files(p0.zip)).get('index.html')), h);
  const p1 = scormPackage(h, { checks: 'correct' });
  assert.deepEqual({ ...p1.completion }, { checks: 'correct' });
  assert.equal(new TextDecoder().decode((await files(p1.zip)).get('index.html')), withChecks(h, 'correct'));
});

await test('validateDeckMeta: completion.checks is "answered" or "correct"', () => {
  const base = { ...META, contracts: {}, player: { name: 'egatari-player', version: '1.11.0' }, generator: { name: 'egatari-studio', version: '0.6.19' } };
  const errs = (c) => validateDeckMeta({ ...base, completion: c }).filter((e) => e.includes('completion'));
  assert.deepEqual(errs({ checks: 'answered' }), []);
  assert.deepEqual(errs({ reachedEnd: true, checks: 'correct' }), []);
  assert.deepEqual(errs({ checks: 'all' }), ['deck-meta.completion.checks: not "answered" or "correct"']);
});

console.log(`${count} tests ok`);
