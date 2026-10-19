// 口述原稿の言語と式の読み上げらしさ（R-formula）の単体の検査（kit/core/narration-lint.mjs の narrationLang・textLang・formulaLike）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-narr-lang.mjs
import assert from 'node:assert/strict';
import { narrationLang, textLang, formulaLike } from '../kit/core/narration-lint.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log(`  ok ${name}`); };

const EN = [
  'Let me introduce Egatari, a new slide format made for working with AI.',
  'Markdown and HTML are the ones an AI writes easily.',
  'For visuals and motion, HTML is strong, while Markdown is weak at figures.',
  'One lecture of ninety-nine slides in pptx comes to two point seven six million tokens.',
];
const JA = ['今回は、勾配降下法の基本を説明します。', 'AI が書きやすいのは、Markdown と HTML です。', '学習とは、損失を小さくするパラメータ θ を探すことです。'];

// ---------------------------------------------------------------- 口述原稿の言語（#37）
ok('voice.json の lang が最優先', () => {
  assert.deepEqual(narrationLang({ voiceLang: 'en', deckLang: 'ja', texts: JA }), { lang: 'en', source: 'voice.json' });
  assert.deepEqual(narrationLang({ voiceLang: 'ja', deckLang: 'en', texts: EN }), { lang: 'ja', source: 'voice.json' });
  assert.equal(narrationLang({ voiceLang: 'EN-us', deckLang: 'ja' }).lang, 'en-us');
});
ok('voice.json の lang がおかしければ使わない', () => {
  assert.equal(narrationLang({ voiceLang: 42, deckLang: 'ja', texts: JA }).source, 'deck');
  assert.equal(narrationLang({ voiceLang: '../x', deckLang: 'ja', texts: JA }).source, 'deck');
});
ok('日本語のスライドに英語の口述原稿：文字から英語と分かる', () => {
  assert.deepEqual(narrationLang({ deckLang: 'ja', texts: EN }), { lang: 'en', source: 'text' });
  assert.deepEqual(narrationLang({ deckLang: '', texts: EN }), { lang: 'en', source: 'text' });
});
ok('英語のスライドに日本語の口述原稿：文字から日本語と分かる', () => {
  assert.deepEqual(narrationLang({ deckLang: 'en', texts: JA }), { lang: 'ja', source: 'text' });
});
ok('同じ言語・発言が少ない・混ざっているときはデッキの言語', () => {
  assert.deepEqual(narrationLang({ deckLang: 'ja', texts: JA }), { lang: 'ja', source: 'deck' });
  assert.deepEqual(narrationLang({ deckLang: 'en', texts: EN }), { lang: 'en', source: 'deck' });
  assert.equal(narrationLang({ deckLang: 'ja', texts: EN.slice(0, 2) }).source, 'deck');
  assert.equal(narrationLang({ deckLang: 'ja', texts: [...JA, ...EN] }).lang, 'ja');
});
ok('発言ごとの言語：日本語の字があれば日本語、英語の文なら英語、式の英字は口述原稿の言語のまま', () => {
  assert.equal(textLang('Markdown と HTML です。', 'en'), 'ja');
  assert.equal(textLang(EN[1], 'ja'), 'en');
  assert.equal(textLang(EN[1], 'en'), 'en');
  assert.equal(textLang('sin x cos y', 'ja'), 'ja');
  assert.equal(textLang('ax by c d', 'ja'), 'ja');
  assert.equal(textLang('sin x cos y', 'en'), 'en');
});

// ---------------------------------------------------------------- 式らしさ（#37 の英語の文・#38 の英字の名前）
ok('日本語のスライドの英語の口述原稿は警告しない（#37 の再現）', () => {
  for (const t of EN) assert.equal(formulaLike(t, textLang(t, narrationLang({ deckLang: 'ja', texts: EN }).lang)), false, t);
  for (const t of EN) assert.equal(formulaLike(t, textLang(t, 'ja')), false, t);
});
ok('英字の名前が並ぶだけの日本語の文は式ではない（#38）', () => {
  for (const t of ['AI が書きやすいのは、Markdown と HTML です。', 'Python と PyTorch で GPU を使います。', 'HTML、CSS、JS の 3 つ。', 'Marp は Markdown で書きます。', 'LLM は API で呼びます。']) {
    assert.equal(formulaLike(t, 'ja'), false, t);
  }
});
ok('日本語の発言の式は今までどおり警告する', () => {
  for (const t of ['ax + by = c', 'sin x cos y', 'f x g x h y', 'x の二乗は x^2', '\\frac{a}{b}', 'a=b+c=d+e', 'dx dy dz の積', 'AI で x y z w']) {
    assert.equal(formulaLike(t, 'ja'), true, t);
  }
});
ok('英語の発言の式は今までどおり警告する', () => {
  for (const t of ['the loss is L = a + b * c', 'take x^2 here', 'use \\theta', 'p < q <= r']) assert.equal(formulaLike(t, 'en'), true, t);
  for (const t of ['the loss goes down', 'two point seven six million tokens', 'and/or']) assert.equal(formulaLike(t, 'en'), false, t);
});
ok('名前を除いても前の規則より警告が増えない（全角・半角の混じる文）', () => {
  // 前の規則：英字すべてを数えて 4 つ以上かつ空白以外の字の半分を超える
  const old = (s) => { const l = (s.match(/[A-Za-z]/g) || []).length, t = s.replace(/\s/g, '').length; return /\\|\^|_/.test(s) || (t > 0 && l >= 4 && l / t > 0.5); };
  for (const t of [...JA, 'AI で x y z w', 'Python で a b c d を足します', 'ab cd ef gh', 'GPU と CPU と TPU', 'x と y と z と w']) {
    if (formulaLike(t, 'ja')) assert.equal(old(t) || /[=+−×*]/.test(t), true, t);
  }
});

console.log(`${n} ok`);
