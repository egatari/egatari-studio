// 数え方の言葉（英語）の試験：1 のときは単数にする（kit/core/plural.mjs）。backlog の報告「1 errors」の直しを確かめる
// test-all: unit（引数なし）
//   node tools/test-count-wording.mjs
// 1. plural(n, one, many?) の基本の動き
// 2. kit/check-messages.mjs の message()：直した code（legacyColorClass・colorOutside・attachInjection・compOrderNoise・imgAlt・svgName・timelineTotal・
//    minItems/maxItems・articleUncited・articleLinkUnconfirmed・articleLinkUnlinked・articleSummary）が n=1 で単数、n=2 で複数になること
// 3. app/i18n.js の英語（T）：checkSummary・slidesN・outlineNotice・exampleMeta・unpackedAt・audio.deck.opened などが n=1 で単数
// 4. 軽い lint：app/i18n.js と kit/check-messages.mjs の en: の中に、複数対応していない「${…} 名詞」が残っていないか
//    （残してよいもの＝決して 1 にならない値だけを ALLOW に理由付きで挙げる。新しい一致が増えたら失敗）
// コマンド版（kit/check.mjs）の集計行が実際に「1 error, 1 warning」になることは tools/test-check-parity.mjs の末尾（ブラウザが要るので、そちらに足した）で確かめる
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { plural } from '../kit/core/plural.mjs';
import { message, MESSAGES, renderNoiseMessage } from '../kit/check-messages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// 1. plural() -----------------------------------------------------------
ok(plural(1, 'error') === 'error', 'plural(1, "error") is singular');
ok(plural(2, 'error') === 'errors', 'plural(2, "error") adds s');
ok(plural(0, 'error') === 'errors', 'plural(0, "error") is plural (0 things)');
ok(plural(1, 'box', 'boxes') === 'box', 'plural(1, "box", "boxes") is singular');
ok(plural(2, 'box', 'boxes') === 'boxes', 'plural(2, "box", "boxes") uses the given irregular plural');

// 2. kit/check-messages.mjs の message() ---------------------------------
const m1 = (code, a) => message('en', code, a), m2 = (code, a) => message('en', code, a);
ok(/\b1 place\b/.test(m1('legacyColorClass', { what: 'x', n: 1, line: 1, to: 'term' })) && !/\b1 places\b/.test(m1('legacyColorClass', { what: 'x', n: 1, line: 1, to: 'term' })),
  'legacyColorClass: n=1 reads "1 place", not "1 places": ' + m1('legacyColorClass', { what: 'x', n: 1, line: 1, to: 'term' }));
ok(/\b2 places\b/.test(m2('legacyColorClass', { what: 'x', n: 2, line: 1, to: 'term' })), 'legacyColorClass: n=2 reads "2 places"');
ok(/\b1 place\b/.test(m1('legacyStepAttr', { what: 'data-steps', n: 1, line: 1 })) && !/\b1 places\b/.test(m1('legacyStepAttr', { what: 'data-steps', n: 1, line: 1 })), 'legacyStepAttr: n=1 is singular');
ok(/\b1 place\b/.test(m1('colorOutside', { kind: 'literal', n: 1, line: 1, list: 'red' })) && !/\b1 places\b/.test(m1('colorOutside', { kind: 'literal', n: 1, line: 1, list: 'red' })), 'colorOutside (literal): n=1 is singular');
ok(/\b1 place\b/.test(m1('colorOutside', { kind: 'hue', n: 1, line: 1, list: 'red' })) && !/\b1 places\b/.test(m1('colorOutside', { kind: 'hue', n: 1, line: 1, list: 'red' })), 'colorOutside (hue): n=1 is singular');
{
  const t1 = m1('attachInjection', { path: 'a.csv', n: 1 }), t2 = m2('attachInjection', { path: 'a.csv', n: 2 });
  ok(/^1 value in the attachment/.test(t1) && / starts with /.test(t1) && !/\b1 values\b/.test(t1), 'attachInjection: n=1 reads "1 value … starts with": ' + t1);
  ok(/^2 values in the attachment/.test(t2) && / start with /.test(t2), 'attachInjection: n=2 reads "2 values … start with": ' + t2);
}
{
  const t1 = renderNoiseMessage('en', { k: 0, n: 1, cap: 5, compArea: 100 }), t2 = renderNoiseMessage('en', { k: 0, n: 2, cap: 5, compArea: 100 });
  ok(/\b1 differing pixel\b/.test(t1) && !/\b1 differing pixels\b/.test(t1), 'compOrderNoise: n=1 reads "1 differing pixel": ' + t1);
  ok(/\b2 differing pixels\b/.test(t2), 'compOrderNoise: n=2 reads "2 differing pixels": ' + t2);
  const f1 = renderNoiseMessage('en', { k: 0, n: 2, faint: 1, cap: 5, compArea: 100 });
  ok(/\b1 isolated faint pixel\b/.test(f1) && !/\b1 isolated faint pixels\b/.test(f1), 'compOrderNoise: faint=1 reads "1 isolated faint pixel": ' + f1);
}
{
  const t1 = m1('imgAlt', { n: 1, list: 'a.png' }), t2 = m2('imgAlt', { n: 2, list: 'a.png, b.png' });
  ok(/\b1 image\b/.test(t1) && !/\b1 images\b/.test(t1) && / it /.test(t1), 'imgAlt: n=1 reads "1 image … it": ' + t1);
  ok(/\b2 images\b/.test(t2) && / them /.test(t2), 'imgAlt: n=2 reads "2 images … them": ' + t2);
}
{
  const t1 = m1('svgName', { n: 1 }), t2 = m2('svgName', { n: 2 });
  ok(/\b1 SVG figure\b/.test(t1) && !/\b1 SVG figures\b/.test(t1), 'svgName: n=1 is singular: ' + t1);
  ok(/\b2 SVG figures\b/.test(t2), 'svgName: n=2 is plural: ' + t2);
}
{
  const t1 = m1('timelineTotal', { s: 1, n: 1 }), t2 = m2('timelineTotal', { s: 2, n: 2 });
  ok(/\(1 step\)/.test(t1), 'timelineTotal: n=1 reads "(1 step)": ' + t1);
  ok(/\(2 steps\)/.test(t2), 'timelineTotal: n=2 reads "(2 steps)": ' + t2);
}
{
  // compWhat の minItems/maxItems（kit/core/check-source.mjs の shape エラー経由。ここでは compData の中身を直に組み立てる）
  const min1 = message('en', 'compData', { tag: 'm-x', kind: 'shape', why: 'minItems', path: 'series', n: 1, got: 0, expected: 'array' });
  const max1 = message('en', 'compData', { tag: 'm-x', kind: 'shape', why: 'maxItems', path: 'series', n: 1, got: 2, expected: 'array' });
  ok(/\bat least 1 item\b/.test(min1) && !/\b1 items\b/.test(min1), 'compData minItems: n=1 reads "at least 1 item": ' + min1);
  ok(/\bat most 1 item\b/.test(max1) && !/\b1 items\b/.test(max1), 'compData maxItems: n=1 reads "at most 1 item": ' + max1);
}
ok(/\b1 reference never cited\b/.test(message('en', 'articleUncited', { count: 1, keys: ['a'] })), 'articleUncited: count=1 is singular');
ok(/\b2 references never cited\b/.test(message('en', 'articleUncited', { count: 2, keys: ['a', 'b'] })), 'articleUncited: count=2 is plural');
ok(/\b1 slide–section link is not recorded\b/.test(message('en', 'articleLinkUnconfirmed', { count: 1, pairs: ['x'] })), 'articleLinkUnconfirmed: count=1 is singular');
ok(/\b1 pair that is no longer linked\b/.test(message('en', 'articleLinkUnlinked', { count: 1, pairs: ['x'] })), 'articleLinkUnlinked: count=1 is singular');
{
  const s1 = message('en', 'articleSummary', { files: 1, sections: 1, labels: 1 });
  ok(s1 === 'article: 1 file, 1 section, 1 label', 'articleSummary: all-1 reads singular throughout: ' + s1);
}

// 3. app/i18n.js の英語（T） ----------------------------------------------
globalThis.location = { search: '?lang=en' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
// Node 自身の navigator（読み取り専用の getter）を、app/i18n.js の言語判定に合わせて上書きする
Object.defineProperty(globalThis, 'navigator', { value: { languages: ['en-US'], language: 'en-US' }, configurable: true });
globalThis.document = { documentElement: {} };
const { T, EN } = await import('../app/i18n.js');
ok(EN === true, 'app/i18n.js: the stubbed environment picks English');
ok(T.checkSummary(1, 1) === '1 error · 1 warning', `checkSummary(1, 1): ${T.checkSummary(1, 1)}`);
ok(T.checkSummary(2, 0) === '2 errors · 0 warnings', `checkSummary(2, 0): ${T.checkSummary(2, 0)}`);
ok(T.checkSummary(0, 1) === '0 errors · 1 warning', `checkSummary(0, 1): ${T.checkSummary(0, 1)}`);
ok(T.slidesN(1) === '1 slide', `slidesN(1): ${T.slidesN(1)}`);
ok(T.slidesN(2) === '2 slides', `slidesN(2): ${T.slidesN(2)}`);
ok(T.outlineNotice(1, 6) === 'Outline: 1 slide left (of 6).', `outlineNotice(1, 6): ${T.outlineNotice(1, 6)}`);
ok(T.exampleMeta(1, '0.1', false) === '1 slide · 0.1 MB', `exampleMeta(1, …): ${T.exampleMeta(1, '0.1', false)}`);
ok(T.unpackedAt('t', 1, 'd') === 't exported 1 file to d', `unpackedAt(…, 1, …): ${T.unpackedAt('t', 1, 'd')}`);
ok(T.unpackedToast(1, 'd').startsWith('Exported 1 file to'), `unpackedToast(1, …): ${T.unpackedToast(1, 'd')}`);
ok(/^Recording mode\. 1 step\. /.test(T.rec.opened(1)), `rec.opened(1): ${T.rec.opened(1)}`);
ok(/^Recording mode\. 2 steps\. /.test(T.rec.opened(2)), `rec.opened(2): ${T.rec.opened(2)}`);
{
  const hourMsg = T.liveProblem({ code: 'windowTooLong', hours: 1, days: 0 });
  ok(/\bat most 1 hour\b/.test(hourMsg) && !/\b1 hours\b/.test(hourMsg), `liveProblem windowTooLong hours=1: ${hourMsg}`);
  const dayMsg = T.liveProblem({ code: 'windowTooLong', hours: 0, days: 1 });
  ok(/\bat most 1 day\b/.test(dayMsg) && !/\b1 days\b/.test(dayMsg), `liveProblem windowTooLong days=1: ${dayMsg}`);
}

// 4. 軽い lint：app/i18n.js・kit/check-messages.mjs の英語の文字列に「数詞のすぐ後ろの名詞」が複数対応していないものがないか -------
// 決して 1 にならない値（固定の上限・既に検証済みの条件）だけを理由付きで許す
const ALLOW = [
  { file: 'app/i18n.js', text: '${a} characters', reason: 'titleLongEn/conclLongEn: a はつねに上限（60・70）を超えるので 1 にならない' },
  { file: 'app/i18n.js', text: '${p.n} characters', reason: 'ライブの設問・選択肢・表示名などの文字数上限（LIMITS.prompt=300 等）で、つねに 1 より大きい固定値' },
  { file: 'app/i18n.js', text: '${t} slides', reason: 'savedAtB: t は時刻の文字列で、数ではない（誤検出）' },
  { file: 'kit/check-messages.mjs', text: '${a.max} characters', reason: 'attachBadTitle/attachBadDescription: ATTACH_LIMITS の固定の上限（titleChars・descriptionChars）でつねに 1 より大きい' },
  { file: 'kit/check-messages.mjs', text: '${a.n} characters', reason: 'titleLongEn/conclLongEn: a.n はつねに上限（60・70）を超えるので 1 にならない' },
  { file: 'kit/check-messages.mjs', text: '${a.lines} lines', reason: 'cellWordBreak: 語が複数行に割れたときだけ出るので a.lines は 1 にならない' },
];
const NOUN = '(errors|warnings|slides|steps|files|parts|items|lines|characters|bytes)';
const RE = new RegExp('\\$\\{[^}]+\\} ' + NOUN + '\\b', 'g');
for (const rel of ['app/i18n.js', 'kit/check-messages.mjs']) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const found = [...text.matchAll(RE)].map((m) => m[0]);
  const allowed = ALLOW.filter((a) => a.file === rel);
  const unexpected = found.filter((f) => !allowed.some((a) => a.text === f));
  ok(unexpected.length === 0, `${rel}: no un-pluralized "\${…} noun" left outside the allowlist${unexpected.length ? ': ' + unexpected.join(', ') : ''}`);
  // 許した型のうち、実際にファイルにもう出てこなくなったものは台帳を軽くする（削除忘れの逆）
  for (const a of allowed) if (!found.includes(a.text)) ok(false, `${rel}: allowlisted pattern ${JSON.stringify(a.text)} no longer appears — remove it from ALLOW (${a.reason})`);
}

assert.equal(fails, 0, `${fails} check(s) failed`);
console.log('all passed');
