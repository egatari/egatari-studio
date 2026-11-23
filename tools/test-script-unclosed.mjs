// 閉じていない <script>（kit/core/script-unclosed.mjs、handoff #96）の試験
//   node tools/test-script-unclosed.mjs [作業フォルダ]   （コマンド版の品質チェック（kit/check.mjs --json）も動かすので、ブラウザがいる）
// v0.6.19-rc.1 の評価：AI の返事の 4 枚目の <m-contrast> のデータに </script> がなく、5・6 枚目が <script> の中の文字になった。
// 5 枚目の見出し「なぜ POS だけを使うのか」（英字と空白を含む）の台本の節が「スライドが見つからない」になり、見出しの正規化の違いに見えたが、
// 正規化は両方の側で同じ。原因の 1 か所（閉じていない <script>）を指摘する。
// v0.6.20：飲み込まれたスライドの節の「スライドが見つからない」は、コマンド版・編集アプリ・修正依頼のどれにも出さない（ほかの節には出す）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withoutSwallowed } from '../kit/core/script-unclosed.mjs';
import { build } from '../kit/build.mjs';
import { buildFixRequest } from '../kit/core/llm-fix.mjs';
import { scriptUnclosedFindings } from '../kit/core/script-unclosed.mjs';
import { analyzeSlideIds } from '../kit/core/build-core.mjs';
import { assignIds } from '../kit/core/slide-ids.mjs';
import { normalizeKey } from '../kit/core/narration-parse.mjs';
import { sourceFindings } from '../kit/core/check-source.mjs';
import { message } from '../kit/check-messages.mjs';
import { RULES } from '../kit/core/check-rules.mjs';
import { IN_EDITOR } from '../kit/core/check-parity.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok  ', name); };

const json = '{"kind":"answers","rows":[{"q":"使うデータは","before":{"text":"棚の画像","by":"[3]"},"after":"POS だけ","basis":"架空の設定"}]}';
const deck = (close) => `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><script src="x.js"></script></head><body><div class="deck">
<section class="slide" id="s-aaaaaa">
  <h2>欠品は売り逃しを生む</h2>
</section>

<section class="slide" id="s-bbbbbb">
  <h2>本研究の答えを並べる</h2>
  <div class="body">
    <m-contrast style="height:340px" aria-label="比較">
      <script type="application/json">
${json}
${close ? '      </script>\n' : ''}    </m-contrast>
  </div>
</section>

<section class="slide">
  <h2>なぜ POS だけを使うのか</h2>
</section>

<section class="slide">
  <h2>序論のまとめ</h2>
</section>

</div></body></html>
`;
const narration = `# 台本

## 欠品は売り逃しを生む {#s-aaaaaa}
[0] 欠品の話です。

## 本研究の答えを並べる {#s-bbbbbb}
[0] 答えを並べます。

## なぜ POS だけを使うのか
[0] POS の話です。

## 序論のまとめ
[0] まとめます。
`;

ok('the heading with ASCII words and spaces gives the same key on both sides (not the cause)', () => {
  const s = analyzeSlideIds(deck(true)).slides;
  assert.equal(s[2].key, normalizeKey('なぜ POS だけを使うのか'));
});

ok('an unclosed data <script> swallows the later slides: they are not slides, and get no id', () => {
  const broken = analyzeSlideIds(deck(false)).slides;
  assert.deepEqual(broken.map((s) => s.heading), ['欠品は売り逃しを生む', '本研究の答えを並べる']);
  const r = assignIds(deck(false), narration);
  assert.equal(r.added.length, 0);
  assert.match(r.narration, /^## なぜ POS だけを使うのか$/m);
});

ok('the finding points at the slide with the <script>, with its line and the swallowed headings', () => {
  const f = scriptUnclosedFindings(deck(false));
  assert.deepEqual(f, [{ i: 1, sev: 'error', code: 'scriptUnclosed', a: { line: 10, n: 2, headings: ['なぜ POS だけを使うのか', '序論のまとめ'] }, keys: ['なぜPOSだけを使うのか', '序論のまとめ'] }]);
});

ok('closed, every slide gets an id and every heading its {#id}, whatever comes before', () => {
  assert.deepEqual(scriptUnclosedFindings(deck(true)), []);
  const r = assignIds(deck(true), narration);
  assert.deepEqual(r.problems, []);
  assert.equal(r.added.length, 2);
  assert.equal(analyzeSlideIds(r.deck).slides.filter((s) => s.id === null).length, 0);
  for (const a of r.added) assert.ok(r.narration.includes(` {#${a.id}}`), a.id);
  assert.match(r.narration, new RegExp(`^## なぜ POS だけを使うのか \\{#${r.added[0].id}\\}$`, 'm'));
});

ok('closed only after the next slide, or with the part\'s end tag inside the JSON: still found', () => {
  const later = deck(false).replace('<h2>序論のまとめ</h2>', '<h2>序論のまとめ</h2><script type="application/json">{}</script>');
  const f = scriptUnclosedFindings(later);
  assert.equal(f.length, 1);
  assert.equal(f[0].i, 1);
  assert.deepEqual(f[0].a.headings, ['なぜ POS だけを使うのか', '序論のまとめ']);
  const tagInside = `<section class="slide"><h2>a</h2><m-x><script type="application/json">{}
</m-x></section><section class="slide"><h2>b</h2></section><script>var a = 1;</script>`;
  assert.deepEqual(scriptUnclosedFindings(tagInside).map((x) => [x.i, x.a.n]), [[0, 1]]);
  assert.deepEqual(scriptUnclosedFindings('<section class="slide"><h2>a</h2><m-x><script type="application/json">{}\n</m-x>\n</script></section>').map((x) => [x.i, x.a.n]), [[0, 0]]);
  // ふつうの <script>（頭・スライドの中・HTML を文字列で持つもの）は知らせない
  assert.deepEqual(scriptUnclosedFindings('<html><head><script>const t = "</m-x>";</script></head><body><section class="slide"><h2>a</h2><script>1</script></section></body></html>'), []);
  assert.deepEqual(scriptUnclosedFindings(''), []);
});

ok('the editor gets the same finding (check-source), under R-components', () => {
  assert.ok(sourceFindings({ deck: deck(false), narration }).some((x) => x.code === 'scriptUnclosed' && x.i === 1 && x.sev === 'error'));
  assert.ok(!sourceFindings({ deck: deck(true), narration }).some((x) => x.code === 'scriptUnclosed'));
  assert.ok(IN_EDITOR.includes('scriptUnclosed'));
  assert.ok(RULES.find((r) => r.id === 'R-components').codes.includes('scriptUnclosed'));
});

ok('the message (ja, en): two sentences', () => {
  const a = scriptUnclosedFindings(deck(false))[0].a;
  assert.equal(message('ja', 'scriptUnclosed', a), '10 行目の <script> に </script> がない。そのため後ろのスライド 2 枚（「なぜ POS だけを使うのか」「序論のまとめ」）が <script> の中の文字になり、スライドとして読めない（台本の節も結べない）。<script> の中身（JSON など）のすぐ後ろに </script> を書く（R-components）');
  assert.equal(message('en', 'scriptUnclosed', a), 'the <script> on line 10 has no </script>. So the 2 slides after it (“なぜ POS だけを使うのか”, “序論のまとめ”) are read as script text, not as slides (and their sections in narration.md match no slide). Write </script> right after the script\'s content (the JSON) (R-components)');
  assert.match(message('ja', 'scriptUnclosed', { line: 3, n: 0, headings: [] }), /^3 行目の <script> に <\/script> がない。そのため後ろのすべてが/);
  assert.match(message('en', 'scriptUnclosed', { line: 3, n: 1, headings: [''] }), /^the <script> on line 3 has no <\/script>\. So the slide after it \(“no heading”\) is read as script text, not as a slide \(and its section in narration\.md matches no slide\)\./);
  assert.match(message('en', 'scriptUnclosed', { line: 3, n: 0, headings: [] }), /^the <script> on line 3 has no <\/script>\. So everything after it is read as script text/);
});

// 「スライドが見つからない」：飲み込まれた 2 枚の節には出さない。どのスライドにもない見出しの節には出す（{#id} の節も同じ）
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-script-unclosed-')));
const narr2 = narration + '\n## どこにもない見出し\n[0] 合わない節です。\n';
const NO_SLIDE = /スライドが見つからない「## ([^」]*)」/;
const dirOf = (name, close, n2 = narr2, d = deck(close)) => {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  // 組んで開ける形に（頭の x.js はない。舞台は #stage）。行は変わらない
  fs.writeFileSync(path.join(dir, 'deck.html'), d.replace('<script src="x.js"></script>', '').replace('<div class="deck">', '<div id="stage">'));
  fs.writeFileSync(path.join(dir, 'narration.md'), n2);
  fs.writeFileSync(path.join(dir, 'egatari.json'), JSON.stringify({ componentsCatalogue: '2' }) + '\n');   // m-contrast は部品庫 2.x
  return dir;
};
const noSlide = (warns) => warns.map((w) => NO_SLIDE.exec(w)?.[1]).filter(Boolean);

ok('the build itself still warns for every section (unchanged); the filter drops only the swallowed ones', () => {
  const warns = build(path.join(dirOf('build', false), 'deck.html'), {}).stats.warn;
  assert.deepEqual(noSlide(warns), ['なぜ POS だけを使うのか', '序論のまとめ', 'どこにもない見出し']);
  assert.deepEqual(noSlide(withoutSwallowed(warns, scriptUnclosedFindings(deck(false)))), ['どこにもない見出し']);
  // 閉じていれば何も除かない
  const ok2 = build(path.join(dirOf('build-closed', true), 'deck.html'), {}).stats.warn;
  assert.deepEqual(noSlide(withoutSwallowed(ok2, scriptUnclosedFindings(deck(true)))), ['どこにもない見出し']);
  // 飲み込まれたスライドの id で結んだ節（{#id}）も除く
  const withIds = deck(false).replace('<section class="slide">\n  <h2>なぜ', '<section class="slide" id="s-cccccc">\n  <h2>なぜ');
  const n3 = narr2.replace('## なぜ POS だけを使うのか', '## POS の話 {#s-cccccc}');
  const w3 = build(path.join(dirOf('build-id', false, n3, withIds), 'deck.html'), {}).stats.warn;
  assert.deepEqual(noSlide(w3), ['POS の話', '序論のまとめ', 'どこにもない見出し']);
  assert.deepEqual(noSlide(withoutSwallowed(w3, scriptUnclosedFindings(withIds))), ['どこにもない見出し']);
});

ok('the command line (check --json): scriptUnclosed, and "slide not found" only for the unrelated heading', () => {
  const r = spawnSync(process.execPath, ['kit/check.mjs', dirOf('cli', false), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = JSON.parse(r.stdout), res = out.results || out;
  assert.ok(res.some((x) => x.code === 'scriptUnclosed' && x.sev === 'error' && x.slide === 2), JSON.stringify(res.map((x) => x.code)));
  const builds = res.filter((x) => x.code === 'build').map((x) => x.msg);
  assert.deepEqual(builds.map((m) => NO_SLIDE.exec(m)?.[1]).filter(Boolean), ['どこにもない見出し'], JSON.stringify(builds));
});

ok('the editor: the same finding (sourceFindings) and the same build warnings left (app/main.js swallowFree)', () => {
  const src = sourceFindings({ deck: deck(false), narration: narr2 });
  assert.equal(src.filter((x) => x.code === 'scriptUnclosed').length, 1);
  assert.ok(!src.some((x) => /スライドが見つからない/.test(JSON.stringify(x.a))));
  const app = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
  assert.match(app, /withoutSwallowed\(warns, scriptUnclosedFindings\(/);
  assert.match(app, /S\.warn = warn0;/);
});

ok('the AI fix request asks only to close the <script>, not to match the swallowed headings', () => {
  const warns = withoutSwallowed(build(path.join(dirOf('fix', false), 'deck.html'), {}).stats.warn, scriptUnclosedFindings(deck(false)));
  for (const lang of ['ja', 'en']) {
    const f = scriptUnclosedFindings(deck(false))[0];
    const probs = [{ sev: 'error', i: f.i, title: '', code: 'scriptUnclosed', data: f.a, text: message(lang, 'scriptUnclosed', f.a) },
      // app/llm.js と同じ：組み立ての知らせのうち narration: のもの
      ...warns.filter((w) => /^(narration|mark|slide key):/.test(w) && !/^mark: 目印/.test(w)).map((w) => ({ sev: 'error', i: null, title: '', msg: w, text: w }))];
    const one = buildFixRequest({ problems: probs.filter((p) => !/どこにもない見出し/.test(p.text)), deck: deck(false), narration: narr2, lang });
    assert.ok(one.text.includes(lang === 'ja' ? '</script> を書く' : 'Write </script> right after'), lang);
    assert.ok(!/なぜ POS だけを使うのか」（スライドの id/.test(one.text), lang);
    assert.deepEqual(one.rules, ['R-components'], lang);
    // ほかの節の「スライドが見つからない」は残り、R-headings も付く
    const all = buildFixRequest({ problems: probs, deck: deck(false), narration: narr2, lang });
    assert.ok(all.text.includes('スライドが見つからない「## どこにもない見出し」'), lang);
    assert.ok(!all.text.includes('スライドが見つからない「## 序論のまとめ」'), lang);
    assert.deepEqual(all.rules.sort(), ['R-components', 'R-headings'], lang);
  }
});

console.log(`test-script-unclosed: ${n} ok`);
