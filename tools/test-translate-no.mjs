// test-all: unit
// spec §8.0 Browser translation（backlog #194）：組み立ては、組んだ数式・コード（code・pre）・パーツの要素に translate="no" を付ける。
// 見出し・結論の行は訳せるまま。本（article-render）の数式とコードも同じ
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../kit/build.mjs';
import { renderArticle } from '../kit/core/article-render.mjs';
import { readArticle } from '../kit/core/article.mjs';
import { nodeEnv } from '../kit/build.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'translate-no-'));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('  ok ' + m); n++; };
try {
  fs.cpSync(path.join(ROOT, 'examples', 'minimal'), dir, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(ROOT, x)) });
  const deck = path.join(dir, 'deck.html');
  // 2 枚目の本文にコードを足す（作者が translate を書いたものはそのまま）
  fs.writeFileSync(deck, fs.readFileSync(deck, 'utf8').replace('<h2>何を最小化するか</h2>', '<h2>何を最小化するか</h2>\n  <p>関数 <code>loss(x)</code> と <code translate="yes">keep</code></p>\n  <pre>for t in range(10):\n  step()</pre>'));
  const { html } = build(deck, {});
  const stage = html.slice(html.indexOf('id="stage"'));
  ok(/<code translate="no">loss\(x\)<\/code>/.test(stage) && /<pre translate="no">/.test(stage), 'code and pre get translate="no"');
  ok(/<code translate="yes">keep<\/code>/.test(stage), 'an author\'s own translate attribute is kept');
  const wraps = [...stage.matchAll(/<span([^>]*)class="katex(-display)?"/g)];
  const outer = wraps.filter((m, i) => m[2] || !(i > 0 && wraps[i - 1][2] && stage.slice(wraps[i - 1].index, m.index).length < 60));
  ok(outer.length > 0 && outer.every((m) => /translate="no"/.test(m[1])), `every formula's wrapper has translate="no" (${outer.length})`);
  ok(/<m-sweep translate="no"/.test(stage), 'the part element (m-sweep) has translate="no"');
  ok(!/<h2[^>]*translate=/.test(stage) && !/class="concl"[^>]*translate=|translate="no"[^>]*class="concl"/.test(stage), 'headings and conclusion lines stay translatable');
  // 本
  const a = renderArticle(readArticle({ path: 'article.md' }, () => '## 本\n\n式 $x^2$ と `code` と\n\n```js\nf()\n```\n'), { lang: 'ja', title: '本', katex: nodeEnv.katex }).html;
  ok(/<span translate="no" class="katex/.test(a) && /<code translate="no">code<\/code>/.test(a) && /<pre translate="no">/.test(a) && !/<h2[^>]*translate=/.test(a), 'the article: math, inline code and code blocks are translate="no", headings are not');
  console.log(`translate-no: ${n} ok`);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
