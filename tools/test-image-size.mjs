// 埋め込み画像の大きさ（backlog #207）：境目・合計・言葉・パーツの除外
// test-all: unit
//   node tools/test-image-size.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { bundleAssets } from '../kit/build.mjs';
import { imageSizeFindings } from '../kit/core/image-size.mjs';
import { message } from '../kit/check-messages.mjs';
import { ruleOfCode } from '../kit/core/check-rules.mjs';
import { IN_EDITOR } from '../kit/core/check-parity.mjs';

let n = 0, fail = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); } };
const MiB = 1048576;
const img = (bytes) => `<img alt="test" src="data:image/png;base64,${Buffer.alloc(bytes).toString('base64')}">`;
const slide = (body) => `<section class="slide" id="s-image"><h2>Image</h2>${body}</section>`;
const warnings = (r) => r.filter((f) => f.code === 'imgTooLarge');
const total = (r) => r.find((f) => f.code === 'imgTotal');

t('1 MiB 未満・ちょうどは警告しない（Base64 の文字数ではなくバイト数）', () => {
  for (const bytes of [MiB - 1, MiB]) {
    const r = imageSizeFindings(slide(img(bytes)));
    assert.equal(warnings(r).length, 0);
    assert.deepEqual(total(r), { i: null, sev: 'info', code: 'imgTotal', a: { n: bytes, count: 1 } });
  }
});
t('1 MiB を超えた画像はスライドごとの警告。日本語と英語で直し方を伝える', () => {
  const [f] = warnings(imageSizeFindings(slide('<p>Small</p>') + slide(img(MiB + 1))));
  assert.deepEqual(f, { i: 1, sev: 'warn', code: 'imgTooLarge', a: { image: 1, n: MiB + 1, max: MiB } });
  assert.equal(message('ja', f.code, f.a), '教材に埋め込む画像 1 が 1 MiB を超えている（1.0 MiB）：必要な部分を切り抜くか、幅 1600 px ほどの JPEG・WebP で保存する');
  assert.equal(message('en', f.code, f.a), 'embedded image 1 is over 1 MiB (1.0 MiB): crop it or save it as JPEG/WebP about 1600 px wide');
  for (const code of ['imgTooLarge', 'imgTotal']) {
    assert.equal(ruleOfCode(code), 'C-images');
    assert.ok(IN_EDITOR.includes(code));
  }
});
t('画像が 2 枚なら合計を情報として伝える。同じ画像を 2 回埋め込んでも数える', () => {
  const r = imageSizeFindings(slide(img(MiB - 1) + img(MiB - 1))), f = total(r);
  assert.equal(warnings(r).length, 0);
  assert.deepEqual(f.a, { n: 2 * (MiB - 1), count: 2 });
  assert.equal(f.sev, 'info');
  assert.equal(message('ja', f.code, f.a), '教材に埋め込む画像は 2 枚、合計 2.0 MiB（パーツ自身の画像を除く）');
  assert.equal(message('en', f.code, f.a), "the lesson has 2 embedded images, totalling 2.0 MiB (excluding parts' own images)");
});
t('パーツの中の画像は警告も合計も重ねない。後のスライドの番号は保つ', () => {
  const r = imageSizeFindings(slide(`<m-callout><div>${img(MiB + 1)}</div></m-callout>`) + slide(img(MiB + 2)));
  assert.equal(warnings(r).length, 1);
  assert.equal(warnings(r)[0].i, 1);
  assert.deepEqual(total(r).a, { n: MiB + 2, count: 1 });
  assert.deepEqual(imageSizeFindings(slide(`<m-callout>${img(MiB + 1)}</m-callout>`)), []);
});
t('外部参照・見本の文字列・テンプレートは数えず、URL 符号化した画像はバイト数で数える', () => {
  const r = imageSizeFindings(slide(`<img src="https://example.org/image.png"><img src="missing.png"><!-- ${img(MiB + 1)} --><script>${img(MiB + 1)}</script><template>${img(MiB + 1)}</template><img src="data:image/svg+xml,%E3%81%82あ">`));
  assert.equal(warnings(r).length, 0);
  assert.deepEqual(total(r).a, { n: 6, count: 1 });
  assert.deepEqual(imageSizeFindings('<img src="data:image/png;base64,%zz">'), []);
});
t('組み立てがローカルの画像を data: URI にした後の大きさを測る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-image-size-'));
  try {
    fs.writeFileSync(path.join(dir, 'large.png'), Buffer.alloc(MiB + 1));
    const html = bundleAssets(slide('<img src="large.png" alt="local">'), dir);
    const r = imageSizeFindings(html);
    assert.equal(warnings(r).length, 1);
    assert.equal(warnings(r)[0].a.n, MiB + 1);
    assert.deepEqual(total(r).a, { n: MiB + 1, count: 1 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(`\n${n - fail}/${n} passed`);
if (fail) process.exit(1);
