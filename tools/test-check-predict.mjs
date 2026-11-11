// 予想（m-predict）の段階の警告（R-steps。kit/core/predict-steps.mjs・kit/check.mjs・kit/core/check-source.mjs）の試験
//   predictAnswerWithCount：答えが数の棒と同時に開く。predictAnswerNeverShown：steps が答えの段階より小さく、答えが出ない
//   node tools/test-check-predict.mjs [作業フォルダ]
// m-predict は段階 1 で数の棒と −1・＋1 の操作を出し、answer-step（既定 2）で答えを開く。答えの段階はパーツと同じ読み方
// （Math.max(1, Math.round(+値) || 2)：数でない字・空・0 は既定の 2、負の数は 1）。steps は +値（なければ答えの段階）で、プレーヤーはパーツの段階を steps で止める
// 1. 読み方（Node だけ）：predictAnswerStep の値ごとの答えの段階
// 2. predictAnswerWithCount を知らせる：answer-step="1"・"-1"・"1.4"。知らせない：属性なし（既定 2）・"0"（パーツは 0 を既定の 2 にする）・"2"・"3"・"abc"・""
//    predictAnswerNeverShown を知らせる：steps="2" と answer-step="3"、steps="0"（既定の 2 より小さい）、steps="0" と answer-step="1"（こちらだけ。同時に出るとは言わない）。
//    知らせない：steps="3" と answer-step="3"、steps="4"（既定 2）、steps が数でない（パーツのエラーになる。Node の試験だけ）
// 3. kit/check.mjs --json：警告、rule は R-steps、知らせるスライドだけ。編集アプリの道筋（sourceFindings）も同じスライド・同じ重さ・同じ値
// 4. 修正依頼（kit/core/llm-fix.mjs）に R-steps と一緒に入る
// 5. 知らせの言葉（kit/check-messages.mjs）：日本語と英語
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { predictAnswerStep, predictStepProblems, PREDICT_COUNT_STEP } from '../kit/core/predict-steps.mjs';
import { sourceFindings } from '../kit/core/check-source.mjs';
import { message, ruleOf } from '../kit/check-messages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-predict-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };

// スライドの id・answer-step・steps の属性（null は書かない）
const CASES = [['a1', '1', null], ['a0', '0', null], ['none', null, null], ['a2', '2', null], ['a3', '3', null], ['neg', '-1', null], ['abc', 'abc', null], ['empty', '', null], ['frac', '1.4', null],
  ['s2a3', '3', '2'], ['s0', null, '0'], ['s0a1', '1', '0'], ['s3a3', '3', '3'], ['s4', null, '4']];
const WITH = ['a1', 'neg', 'frac'], NEVER = ['s2a3', 's0', 's0a1'];
const CODES = ['predictAnswerWithCount', 'predictAnswerNeverShown'];
const FIRE = { predictAnswerWithCount: WITH, predictAnswerNeverShown: NEVER };
const DATA = '{"question": "重い球と軽い球、どちらが先に落ちる？", "choices": [{"label": "重い球"}, {"label": "軽い球"}, {"label": "同時"}], "answer": 2, "counts": [14, 3, 9]}';
const at = (k, v) => (v === null ? '' : ` ${k}="${v}"`);
const slide = ([id, v, st]) => `<section class="slide noconcl" id="s-${id}"><h2>予想 ${id}</h2><div class="body">\n  <m-predict unit="人" style="height:400px"${at('answer-step', v)}${at('steps', st)}><script type="application/json">${DATA}</script></m-predict>\n</div></section>\n`;
const deck = `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head><meta charset="utf-8"><title>予想の答えの段階</title></head>\n<body><div id="stage">\n${CASES.map(slide).join('')}</div></body></html>\n`;
const narration = CASES.map(([id, v, st]) => { const m = st === null ? predictAnswerStep(v) : +st; return `## 予想 ${id} {#s-${id}}\n\n` + Array.from({ length: m + 1 }, (_, k) => `[${k}] 試験の口述原稿の ${k} です。\n`).join('\n'); }).join('\n');
const idxOf = (ids) => ids.map((id) => CASES.findIndex(([c]) => c === id));
const byCode = (xs, code, key) => xs.filter((x) => x.code === code).map(key);

await t('読み方：パーツと同じ（属性なし・0・空・数でない字は 2、負の数と 0.5・1.4 は 1、1.5 は 2、3 は 3）', () => {
  assert.equal(PREDICT_COUNT_STEP, 1);
  const want = [[null, 2], ['1', 1], [' 1 ', 1], ['0', 2], ['', 2], ['abc', 2], ['2', 2], ['3', 3], ['-1', 1], ['1.4', 1], ['1.5', 2], ['0.4', 2], ['0.5', 1], ['-0.4', 2]];
  for (const [v, s] of want) assert.equal(predictAnswerStep(v), s, JSON.stringify(v));
});
await t('原稿から：答えが同時は answer-step="1"・"-1"・"1.4"、答えが出ないは steps が答えの段階より小さいもの（両方に当たれば答えが出ないだけ）', () => {
  const got = predictStepProblems(deck);
  assert.deepEqual(byCode(got, 'predictAnswerWithCount', (x) => x.slide), idxOf(WITH));
  assert.deepEqual(byCode(got, 'predictAnswerWithCount', (x) => x.value), ['1', '-1', '1.4']);
  assert.deepEqual(byCode(got, 'predictAnswerNeverShown', (x) => x.slide), idxOf(NEVER));
  assert.deepEqual(byCode(got, 'predictAnswerNeverShown', (x) => [x.steps, x.step]), [['2', 3], ['0', 2], ['0', 1]]);
  assert.ok(got.every((x) => x.count === 1 && Number.isInteger(x.line)));
  // スライドの外の m-predict はスライドの番号なし。steps が数でないものはパーツのエラー（compData）なので、ここでは知らせない
  assert.deepEqual(predictStepProblems('<div><m-predict answer-step="1"></m-predict></div>').map((x) => [x.code, x.slide]), [['predictAnswerWithCount', null]]);
  assert.deepEqual(predictStepProblems('<section class="slide"><m-predict steps="abc"></m-predict></section>'), []);
});

let cli = null;
await t('品質チェック（kit/check.mjs --json）：知らせるスライドに警告 1 つずつ（rule R-steps、2 つの code とも）。ほかのスライドには出ない', () => {
  const dir = path.join(work, 'deck');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), deck);
  fs.writeFileSync(path.join(dir, 'narration.md'), narration);
  const b = spawnSync(process.execPath, ['kit/build.mjs', path.join(dir, 'deck.html')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const c = spawnSync(process.execPath, ['kit/check.mjs', path.join(dir, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  cli = JSON.parse(c.stdout);
  for (const code of CODES) {
    const hits = cli.results.filter((x) => x.code === code);
    assert.deepEqual(hits.map((x) => x.id), FIRE[code].map((id) => 's-' + id), code + ' ' + JSON.stringify(hits));
    assert.ok(hits.every((x) => x.sev === 'warn' && x.rule === 'R-steps' && x.msg.endsWith(message('ja', code, x.data))), JSON.stringify(hits));
  }
  // パーツは描けている（データの間違いやコンソールのエラーがない）
  assert.ok(!cli.results.some((x) => x.code === 'compData' || x.code === 'consoleError'), JSON.stringify(cli.results.filter((x) => x.sev === 'error')));
});
await t('編集アプリの道筋（kit/core/check-source.mjs の sourceFindings）：同じスライド・同じ重さ・同じ値', () => {
  const all = sourceFindings({ deck, narration });
  for (const code of CODES) {
    const ed = all.filter((x) => x.code === code), c = cli.results.filter((x) => x.code === code);
    assert.deepEqual(ed.map((x) => x.i), idxOf(FIRE[code]), code);
    assert.ok(ed.every((x) => x.sev === 'warn'));
    assert.deepEqual(ed.map((x) => x.a), c.map((x) => x.data), code);
  }
});
await t('修正依頼（kit/core/llm-fix.mjs の buildFixRequest）：警告として R-steps の規格と一緒に入る（編集アプリの形と、コマンド版の --json の形）', async () => {
  const { buildFixRequest } = await import('../kit/core/llm-fix.mjs');
  const probs = sourceFindings({ deck, narration }).filter((x) => CODES.includes(x.code))
    .map((x) => ({ sev: x.sev, i: x.i, title: '', code: x.code, data: x.a, rule: ruleOf(x.code, x.a), text: message('en', x.code, x.a) }));   // 編集アプリ（app/llm.js の problemsOf）と同じ形
  const fr = buildFixRequest({ problems: probs, deck, narration, lang: 'en' });
  assert.equal((fr.text.match(/^\d+\. \[[^\]]+\] [^\n]*The prediction \(m-predict\) shows its answer/gm) || []).length, 3, fr.text.slice(0, 1200));
  assert.equal((fr.text.match(/^\d+\. \[[^\]]+\] [^\n]*The prediction \(m-predict\) never shows its answer/gm) || []).length, 3, fr.text.slice(0, 1200));
  assert.ok(fr.rules.includes('R-steps') && /^- \*\*R-steps\*\* /m.test(fr.text));
  const cl = cli.results.filter((x) => CODES.includes(x.code)).map((x) => ({ sev: x.sev, i: x.slide - 1, title: '', code: x.code, rule: x.rule, data: x.data, msg: x.msg, text: x.msg }));
  const fr2 = buildFixRequest({ problems: cl, deck, narration, lang: 'ja' });
  assert.equal((fr2.text.match(/予想（m-predict）の答えが、人数を数える段階と同時に出ます/g) || []).length, 3);
  assert.equal((fr2.text.match(/予想（m-predict）の答えが出ません/g) || []).length, 3);
  assert.ok(fr2.rules.includes('R-steps'));
});
await t('言葉：日本語と英語。answer-step を 2 以上に・steps を answer-step 以上にと言う', () => {
  assert.equal(ruleOf('predictAnswerWithCount'), 'R-steps');
  assert.equal(ruleOf('predictAnswerNeverShown'), 'R-steps');
  assert.equal(message('ja', 'predictAnswerNeverShown', {}), '予想（m-predict）の答えが出ません。steps が answer-step より小さくなっています。steps を answer-step 以上にしてください。（R-steps）');
  assert.equal(message('en', 'predictAnswerNeverShown', {}), 'The prediction (m-predict) never shows its answer: steps is smaller than answer-step. Set steps to answer-step or more. (R-steps)');
  assert.equal(message('ja', 'predictAnswerWithCount', {}), '予想（m-predict）の答えが、人数を数える段階と同時に出ます。answer-step を 2 以上にして、数えてから答えを開いてください。（R-steps）');
  assert.equal(message('en', 'predictAnswerWithCount', {}), 'The prediction (m-predict) shows its answer at the same step as the vote count. Set answer-step to 2 or more so the class counts first, then sees the answer. (R-steps)');
});

console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
