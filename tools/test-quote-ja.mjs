// 見出し・題を「」で引用するときの入れ子の決まり（kit/core/quote-ja.mjs）の試験
// test-all: unit（引数なし）
//   node tools/test-quote-ja.mjs
// 「「春暁」を読む」にせず「『春暁』を読む」にする。check・build・編集アプリの知らせが同じ決まりを通ること
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { quoteJa, innerJa } from '../kit/core/quote-ja.mjs';
import { where, message } from '../kit/check-messages.mjs';
import { articleMessage } from '../kit/core/article-messages.mjs';
import { warnView } from '../app/build-warnings.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0, fail = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };
const H = '「春暁」を読む';
const WANT = '「『春暁』を読む」';

t('quoteJa：中の「」は『』にして囲む', () => {
  assert.equal(quoteJa(H), WANT);
  assert.equal(quoteJa('更新の式'), '「更新の式」');
  assert.equal(quoteJa('「春暁」と「春望」'), '「『春暁』と『春望』」');
  assert.equal(innerJa(H), '『春暁』を読む');
  assert.equal(quoteJa(''), '「」');
  assert.equal(quoteJa(undefined), '「」');
  assert.equal(quoteJa(quoteJa(H)), '「『『春暁』を読む』」', '二重には掛けない前提の字（呼び出しは 1 回）');
});

t('check：where（スライドの見出し）・narrHeadingDiffers', () => {
  assert.equal(where('ja', { n: 3, id: 's-abc', title: H }), `スライド 3${WANT}（s-abc）`);
  assert.equal(where('en', { n: 3, id: 's-abc', title: H }), 'Slide 3 “「春暁」を読む” (s-abc)');
  const m = message('ja', 'narrHeadingDiffers', { line: 4, heading: H, slide: '「春望」', id: 's-x' });
  assert.ok(m.includes(`見出し${WANT}`) && m.includes('スライドの見出し「『春望』」'), m);
  assert.ok(!m.includes('「「'), m);
});

t('check/build：本とスライドのつながりの古さ・節の知らせ', () => {
  const stale = articleMessage('ja', { code: 'articleLinkStale', data: { slide: 's-a', section: 'sec-aaaaaa', heading: H, changed: 'article' } });
  assert.ok(stale.includes(`節${WANT}（sec-aaaaaa）`), stale);
  assert.ok(!stale.includes('「「'));
  for (const code of ['articleSectionId', 'articleSectionUnlinked']) {
    const s = articleMessage('ja', { code, data: { heading: H, section: 'sec-aaaaaa' } });
    assert.ok(s.includes(`節${WANT}`) && !s.includes('「「'), s);
  }
});

t('build：narration の「## 見出し」と、編集アプリでの見せ方', () => {
  const w = `narration: スライドが見つからない「## ${innerJa(H)}」（鍵「s-x」、narration.md 5 行目）`;
  const v = warnView(w, [], { bwScript: '台本：' });
  assert.equal(v.text, `台本：スライドが見つからない${WANT}`);
});

t('修正依頼（llm-fix）のスライドの場所', () => {
  const src = fs.readFileSync(path.join(ROOT, 'kit/core/llm-fix.mjs'), 'utf8');
  assert.ok(/quoteJa\(p\.title\)/.test(src));
});

t('本文の描画：スライドへのリンクの字', () => {
  const src = fs.readFileSync(path.join(ROOT, 'kit/core/article-render.mjs'), 'utf8');
  assert.ok(/スライド\$\{quoteJa\(title\)\}/.test(src));
});

// 見出し・題を変数のまま「」で囲んだ書き方が、画面の言葉と知らせに残っていないこと（quoteJa を通す）
t('取りこぼし：見出し・題を直に「」で囲んだ式が残っていない', () => {
  const files = ['app/i18n.js', 'app/llm.js', 'app/audio-panel.js', 'app/build-warnings.js', 'kit/check-messages.mjs', 'kit/core/article-messages.mjs', 'kit/core/article-render.mjs', 'kit/core/llm-fix.mjs'];
  const RAW = /「\$\{(?:a\.)?(?:p\.)?(?:heading|title|h|t|slide)(?: \|\| [\w.]+)?\}」|'「' \+ (?:h|t|heading|title) \+ '」'/;
  for (const f of files) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    lines.forEach((l, i) => { if (f === 'kit/check-messages.mjs' && /^\s*(titleLong|titleColon|secHeading):/.test(l) && !/quoteJa\(a\.t\)/.test(l)) assert.fail(`${f}:${i + 1} 見出しの知らせが quoteJa を通っていない`);
      if (f !== 'kit/check-messages.mjs' && RAW.test(l) && !/linkUnknown|linkNoConcl|linkStepRange/.test(l)) assert.fail(`${f}:${i + 1} 見出しを直に「」で囲んでいる：quoteJa を使う\n${l.trim().slice(0, 160)}`); });
  }
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
