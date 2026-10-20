// 品質チェックの規格の名前（R-headings）と、ブラウザが起動できないときの終了コード・JSON の試験
//   node tools/test-check-status.mjs [作業フォルダ]
// 1. 規格の名前：見出しの重なり（slideId の「slide key: …」）・narration.md の見出しとスライドの見出しの違い（narrHeadingDiffers）・
//    スライドが見つからない節（build の「narration: スライドが見つからない」）は R-headings（JSON の rule・修正依頼の規格）。id の書式の知らせは名前なし
// 2. ブラウザが起動できない（CHROME_PATH が存在しない実行ファイル）：終了コード 2（指摘ありの 1 と別）、JSON は status: "crashed"・ok: false・指摘なし。
//    落ちた理由は stderr だけで、指摘の言葉（msg）にも JSON にも入らない
// 3. 結果を読む側（kit/core/check-result.mjs の parseCheck）が crashed・終了コード 2 を拒む
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ruleOf, message } from '../kit/check-messages.mjs';
import { rulesFor } from '../kit/core/llm-fix.mjs';
import { parseCheck, checkFinished } from '../kit/core/check-result.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-status-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = (name, fn) => {
  n++;
  try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};
const check = (deck, extra = [], env = {}) => spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), deck, '--json', ...extra], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 << 20 });

// ---- 1. 規格の名前
t('ruleOf：R-headings になる知らせと、ならない知らせ', () => {
  assert.equal(ruleOf('narrHeadingDiffers', {}), 'R-headings');
  assert.equal(ruleOf('slideId', { msg: 'slide key: スライド 2 の鍵「a」がスライド 1 と重なる' }), 'R-headings');
  assert.equal(ruleOf('slideId', { msg: 'slide id: スライド 2 の id「1」が規則に合わない' }), null);
  assert.equal(ruleOf('build', { w: 'narration: スライドが見つからない「## x」' }), 'R-headings');
  assert.equal(ruleOf('build', { w: 'missing: 「a.png」が作業フォルダにない' }), null);
  assert.equal(ruleOf('titleLong', {}), 'R-title');   // 文字列の rule はそのまま
  assert.equal(ruleOf('noSuchCode', {}), null);
});
t('message：R-headings を言葉の最後に添える（重ねて書かない）', () => {
  const m = message('en', 'narrHeadingDiffers', { line: 3, heading: 'a', slide: 'b', id: 's-x' });
  assert.ok(m.endsWith('(R-headings)'), m);
  const d = message('ja', 'slideId', { msg: 'slide key: x' });
  assert.ok(d.endsWith('（R-headings）'), d);
  const b = message('ja', 'build', { w: 'narration: スライドが見つからない「## x」' });
  assert.equal(b.match(/R-headings/g).length, 1, b);
});
t('rulesFor：規格の名前のない JSON でも narrHeadingDiffers は R-headings', () => {
  assert.deepEqual(rulesFor({ code: 'narrHeadingDiffers' }), ['R-headings']);
  assert.deepEqual(rulesFor({ rule: 'R-headings', code: 'slideId' }), ['R-headings']);
});

// ---- 見出しの重なり・narration.md の見出しの違いを実際に検査して、JSON の rule を見る
{
  const d = path.join(work, 'headings');
  fs.mkdirSync(d, { recursive: true });
  const slide = (id, h) => `<section class="slide"${id ? ` id="${id}"` : ''}>\n  <h2>${h}</h2>\n  <div class="body"><p>本文</p></div>\n  <div class="concl"><span>結論</span></div>\n</section>\n`;
  fs.writeFileSync(path.join(d, 'deck.html'), `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head><meta charset="utf-8"><title>t</title></head>\n<body>\n<div id="stage">\n`
    + `<section class="slide cover noconcl static" id="s-cover"><h1>表紙</h1></section>\n${slide('', '同じ見出し')}${slide('', '同じ見出し')}${slide('s-three', '三つ目')}</div>\n</body>\n</html>\n`);
  fs.writeFileSync(path.join(d, 'narration.md'), '# 口述原稿\n\n## 表紙 {#s-cover}\n[0] はじめに。\n\n## 同じ見出し\n[0] 一つ目。\n[concl] 結論。\n\n## 同じ見出し\n[0] 二つ目。\n[concl] 結論。\n\n## 言い換えた見出し {#s-three}\n[0] 三つ目。\n[concl] 結論。\n');
  const r = check(path.join(d, 'deck.html'));
  const j = JSON.parse(r.stdout);
  t('JSON：見出しの重なり（slideId）の rule は R-headings', () => {
    const x = j.results.filter((e) => e.code === 'slideId' && /^slide key: /.test(e.data.msg));
    assert.ok(x.length >= 1, JSON.stringify(j.results.map((e) => e.code)));
    for (const e of x) assert.equal(e.rule, 'R-headings');
    assert.ok(x.every((e) => e.msg.includes('R-headings')));
  });
  t('JSON：narration.md の見出しの違い（narrHeadingDiffers）の rule は R-headings', () => {
    const x = j.results.filter((e) => e.code === 'narrHeadingDiffers');
    assert.equal(x.length, 1, JSON.stringify(j.results.map((e) => e.code)));
    assert.equal(x[0].rule, 'R-headings');
  });
  t('JSON：status は付かない（終わった検査）で、終了コードは 1（エラーあり）', () => {
    assert.ok(!('status' in j));
    assert.equal(r.status, 1);
  });
}

// ---- 2. ブラウザが起動できない
const missing = path.join(work, 'no-such-chrome');
for (const lang of ['ja', 'en']) {
  t(`ブラウザが起動できない（--lang ${lang}）：終了コード 2・status crashed・指摘なし`, () => {
    const r = check(path.join(ROOT, 'examples/minimal/deck.html'), ['--lang', lang], { CHROME_PATH: missing });
    assert.equal(r.status, 2, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.status, 'crashed');
    assert.equal(j.ok, false);
    assert.deepEqual(j.results, []);
    assert.deepEqual(j.counts, { error: 0, warn: 0, info: 0 });
    // 落ちた理由は stderr だけ（指摘にも JSON にも入らない）
    assert.ok(r.stderr.includes(missing), r.stderr);
    assert.ok(!r.stdout.includes(missing), r.stdout);
  });
}
t('ブラウザが起動できない（--json なし）：終了コード 2・標準出力は空', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), path.join(ROOT, 'examples/minimal/deck.html')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CHROME_PATH: missing } });
  assert.equal(r.status, 2);
  assert.equal(r.stdout.trim(), '');
});

// ---- 3. 結果を読む側（kit/core/check-result.mjs）：crashed・終了コード 2 は失敗で、指摘 0 ではない
t('parseCheck：終わった結果は通し、crashed と終了コード 2 は例外', () => {
  const ok0 = JSON.stringify({ ok: true, lang: 'ja', counts: { error: 0, warn: 0, info: 0 }, results: [] });
  assert.equal(parseCheck(ok0, 0).ok, true);
  assert.equal(parseCheck(ok0, 1).ok, true);
  assert.throws(() => parseCheck(ok0, 2), /did not finish/);
  assert.throws(() => parseCheck(JSON.stringify({ ok: false, status: 'crashed', counts: { error: 0, warn: 0, info: 0 }, results: [] }), 2), /invalid/);
  assert.throws(() => parseCheck(JSON.stringify({ ok: false, status: 'crashed', counts: { error: 0, warn: 0, info: 0 }, results: [] })), /did not finish/);
  assert.throws(() => parseCheck('', 1), /did not finish/);
  assert.equal(checkFinished({ results: [] }), true);
});
t('実際の crashed の出力を parseCheck が拒む', () => {
  const r = check(path.join(ROOT, 'examples/minimal/deck.html'), [], { CHROME_PATH: missing });
  assert.throws(() => parseCheck(r.stdout, r.status), /did not finish/);
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
