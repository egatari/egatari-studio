// 英語の指示が部品庫の英語の説明（README.en.md）を読むことの試験（tools/make-llm-guide.mjs。v0.6.7）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
// frontmatterEn の読み方・example の形の確かめ（16 のパーツ全部と、変えた見本）・パーツごとの長さの関所（en ≤ ja）・EN_EDITS・
// 英語の節に日本語が残らないこと（m-fishbone と m-tree の shape.note だけ）・日本語の指示が README.en.md に左右されないこと
// （README.en.md を読まない生成と同じ。v0.6.6 の最後のコミットの材料とも、版の行と partsSrc のほかは同じ）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generate, frontmatterEn, jaWords } from './make-llm-guide.mjs';
import { assemble } from '../kit/core/llm-pack-assemble.mjs';
import { PACK } from '../kit/core/llm-pack-data.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').join('\n       ')); }
};
// 部品庫 2.4.3 で README.en.md のある標準のパーツ（16）
// 部品庫 2.6.0（候補）の束 data の 6 つも README.en.md を持つ（専門のパーツ）
const DATA6 = ['m-balance', 'm-ci', 'm-code', 'm-folds', 'm-mapping', 'm-sampling'];
// 部品庫 2.9.0 の専門のパーツ（束 tools・business）も README.en.md を持つ
const SPEC3 = ['m-callout', 'm-checklist', 'm-diverge'];
const EN16 = ['m-bars', 'm-cards', 'm-compare', 'm-curves', 'm-cycle', 'm-fishbone', 'm-flow', 'm-kpi', 'm-menu', 'm-pie', 'm-predict', 'm-quad', 'm-scatter', 'm-timeline', 'm-tree', 'm-venn'];
const lock2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8'));
const content = lock2.catalogues[lock2.default].content;
const readmeEn = (tag) => fs.readFileSync(path.join(ROOT, 'vendor', 'components', 'sha256', content[tag.replace(/^m-/, '')], 'README.en.md'), 'utf8');
const throwsWith = (fn, re) => { let err = null; try { fn(); } catch (e) { err = e; } assert.ok(err, `expected an error matching ${re}`); assert.match(String(err.message), re); };
const base = generate();

ok('frontmatterEn: top-level keys, the indented props map, CRLF; no frontmatter is null', () => {
  const text = '---\nsummary: Bars by step\nprops:\n  orient: v or h\n  per-step: groups per step (0 = all)\nsteps: 1 group = 1 step\nexample: {"a": [1, 2]}\n---\n\nBody: `x`.\n';
  const want = { summary: 'Bars by step', props: { orient: 'v or h', 'per-step': 'groups per step (0 = all)' }, steps: '1 group = 1 step', example: '{"a": [1, 2]}' };
  assert.deepEqual(frontmatterEn(text), want);
  assert.deepEqual(frontmatterEn(text.replace(/\n/g, '\r\n')), want);
  // 字下げした行は、値のない見出し（props:）の下だけが表になる。値のある行の下の字下げは読まない
  assert.deepEqual(frontmatterEn('---\nsummary: S\n  stray: x\n---\n'), { summary: 'S' });
  assert.equal(frontmatterEn('summary: no fence\n'), null);
});

// 部品庫 2.12.0・2.13.0 の新しい 6 つ（algo の m-network、ml の 3 つ、受け皿のない univ の 2 つ）も README.en.md を持つ
const NEW6 = { 'm-network': 'algo', 'm-nnet': 'ml', 'm-classify2d': 'ml', 'm-contour': 'ml', 'm-ctable': 'standard', 'm-vector': 'standard', 'm-matrix': 'standard', 'm-scroll': 'tools', 'm-contrast': 'standard' };   // m-matrix：パーツ集 2.17.0（univ、受け皿なし）
ok('the 16 standard parts, the 6 data parts, the 3 parts of 2.9.0 and the 6 of 2.12.0–2.13.0 with README.en.md are the ones read for the en pack, and each has summary and steps', () => {
  assert.deepEqual([...base.enParts].sort(), [...EN16, ...DATA6, ...SPEC3, ...Object.keys(NEW6)].sort());
  for (const [t, set] of Object.entries(NEW6)) { const fm = frontmatterEn(readmeEn(t)); assert.ok(fm && fm.summary && fm.steps, `${t}: summary and steps`); assert.equal(PACK.en.components[t].set, set, `${t} is in ${set}`); }
  for (const t of SPEC3) { const fm = frontmatterEn(readmeEn(t)); assert.ok(fm && fm.summary && fm.steps, `${t}: summary and steps`); }
  for (const t of DATA6) { const fm = frontmatterEn(readmeEn(t)); assert.ok(fm && fm.summary && fm.steps, `${t}: summary and steps`); assert.equal(PACK.en.components[t].set, 'data', `${t} is a data part`); }
  for (const t of EN16) {
    const fm = frontmatterEn(readmeEn(t));
    assert.ok(fm && fm.summary && fm.steps, `${t}: summary and steps`);
    assert.equal(PACK.en.components[t].set, 'standard', `${t} is a standard part`);
  }
});

ok('example validation: all 16 pass as vendored; a changed number or an added key throws, naming the part', () => {
  const withEx = EN16.filter((t) => typeof frontmatterEn(readmeEn(t)).example === 'string');
  assert.ok(withEx.length >= 10 && withEx.includes('m-menu') && withEx.includes('m-pie'), `parts with example: ${withEx.join(', ')}`);
  // 生成が通る（上の base）= 16 の example がどれも static shape.example と同じ形。英語の見本は英語の指示に入る
  assert.match(PACK.en.components['m-pie'].entry + PACK.en.components['m-pie'].row, /"Housing"/);
  const pie = readmeEn('m-pie');
  assert.ok(pie.includes('"value": 7.2'));
  throwsWith(() => generate({ readmeEn: { 'm-pie': pie.replace('"value": 7.2', '"value": 7.3') } }), /m-pie: README\.en\.md example: its keys or structure differ/);
  throwsWith(() => generate({ readmeEn: { 'm-pie': pie.replace('{"label": "Food",', '{"label": "Food", "extra": "x",') } }), /m-pie: README\.en\.md example: its keys or structure differ/);
  throwsWith(() => generate({ readmeEn: { 'm-pie': pie.replace(/^example: .*$/m, 'example: {"slices": [') } }), /m-pie: README\.en\.md example is not JSON/);
  // m-menu の見本は字（<a href> の HTML）：example: は JSON の字でなければならない
  const menu = readmeEn('m-menu');
  assert.match(menu, /^example: "<a href=/m);
  throwsWith(() => generate({ readmeEn: { 'm-menu': menu.replace(/^example: .*$/m, 'example: {"a": 1}') } }), /m-menu: README\.en\.md example: static shape\.example is text \(not JSON\), so example: must be a JSON string/);
});

ok('the per-part gate: an en entry made longer than ja fails (summary+steps+entry, paste units)', () => {
  const kpi = readmeEn('m-kpi');
  const long = kpi.trimEnd() + '\n\n' + 'This sentence makes the English entry longer than the Japanese one. '.repeat(60) + '\n';
  throwsWith(() => generate({ readmeEn: { 'm-kpi': long } }), /README\.en\.md is longer than README\.md in the pack \(paste units, UTF-16 \+ LF\):\n {2}m-kpi: en \d+ > ja \d+ \(summary\+steps\+entry\)/);
  // 長い summary も数える
  throwsWith(() => generate({ readmeEn: { 'm-kpi': kpi.replace(/^summary: .*$/m, 'summary: ' + 'long summary words '.repeat(200)) } }), /m-kpi: en \d+ > ja \d+/);
});

ok('EN_EDITS: the m-menu import note and the m-predict no-live-counts lines are in the en pack; a stale find fails', () => {
  const menu = PACK.en.components['m-menu'].entry, predict = PACK.en.components['m-predict'].entry;
  assert.ok(menu.includes('Add the menu after import; in the first draft use a plain list.'), 'm-menu: the import note');
  assert.ok(menu.includes('ids are added on import') && !menu.includes('npm run ids'), 'm-menu: ids are added on import');
  assert.ok(!menu.includes('lesson2.ega.html'), 'm-menu: the link to another lesson is cut');
  assert.ok(predict.includes('poll id (no live counts yet)'), 'm-predict: the poll prop');
  assert.ok(predict.includes('reserved; no live reveals yet (`ctx.live.poll(id)` is null), so viewer/author counts are used'), 'm-predict: no live counts');
  assert.ok(!predict.includes('live poll totals'), 'm-predict: the README.en.md wording is replaced');
  // EN_EDITS の find が README.en.md になくなれば失敗する
  throwsWith(() => generate({ readmeEn: { 'm-predict': readmeEn('m-predict').replace('  poll: live poll id', '  poll: poll id') } }), /EN_EDITS m-predict: "\| live poll id \|" is not in the README\.en\.md entry any more/);
  // m-bars は PACK_EDITS があり、EN_EDITS は空（英語の字はもう短く、言い換えが要らない。パーツ集 2.16.0 で確かめた）：知らせは出ない
  assert.deepEqual(base.warnings.filter((w) => /README\.en\.md is used for the en pack/.test(w)), []);
});

ok('no Japanese in the 16 standard and 6 data parts\' en sections (components 2.5.0: the shape.note of m-fishbone and m-tree is {en, ja} now)', () => {
  const J = /[　-ヿ㐀-鿿＀-￯]+/g;
  const hits = [];
  for (const t of [...EN16, ...DATA6]) {
    const c = PACK.en.components[t];
    for (const [k, v] of [['row', c.row], ['entry', c.entry], ...Object.entries(c.ext || {}).map(([s, x]) => ['ext ' + s, x])]) for (const m of (v || '').match(J) || []) hits.push(`${t} ${k}: ${m}`);
  }
  assert.deepEqual(hits, []);
});

// 日本語の指示を、言いたいことの束の組み合わせ（9 つの束のすべての部分集合）× 無料（短くする・しない）・有料で組み立てる。版の行と partsSrc は揃える
const jaDump = (data) => {
  const out = [];
  for (let m = 0; m < 1 << data.sets.length; m++) {
    const sets = data.sets.filter((_, i) => m & (1 << i));
    for (const [plan, short] of [['free', false], ['free', true], ['paid', false]]) out.push(assemble(data, { sets, lang: 'ja', plan, short }).split(data.version).join('<version>').split(data.partsSrc).join('<partsSrc>'));
  }
  return out;
};
const firstDiff = (a, b) => { const i = a.findIndex((x, k) => x !== b[k]); return i < 0 ? '' : `#${i}: ${[...a[i]].findIndex((ch, k) => ch !== b[i][k])}`; };

ok('ja is not touched by README.en.md: the ja packs are byte-identical to a generation that reads no README.en.md (apart from the version line)', () => {
  const none = generate({ readmeEn: false });
  assert.deepEqual(none.enParts, []);
  const a = jaDump(base.data), b = jaDump(none.data);
  assert.equal(a.length, 3 << base.data.sets.length);
  assert.ok(a.every((x, i) => x === b[i]), `ja packs differ (${firstDiff(a, b)})`);
  assert.ok(none.data.version !== base.data.version, 'the en text changes the version');
});

// v0.6.6 の最後のコミット（部品庫 2.4.2、README.en.md を読まない make-llm-guide）の材料と比べる。浅い clone で無ければ飛ばす
const V066 = '4f7ccebcb35f5e9e0fdbca26c6226dc03c17a305';
ok(`ja packs byte-identical to v0.6.6 (${V066.slice(0, 8)}) apart from the version line and partsSrc: every set combination, free (short or not) and paid`, () => {
  let old;
  try { old = execFileSync('git', ['show', `${V066}:kit/core/llm-pack-data.mjs`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }); } catch { console.log('       (skipped: v0.6.6 is not in this clone)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-llm-guide-en-'));
  try {
    fs.writeFileSync(path.join(dir, 'data.mjs'), old);
    // 読み込みは同期で済ませたいので、子のプロセスで JSON にする
    const json = execFileSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(pathToFileURL(path.join(dir, 'data.mjs')).href)}).then((m) => process.stdout.write(JSON.stringify(m.PACK)))`], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const oldData = JSON.parse(json);
    assert.match(oldData.partsSrc, /\/v2\.4\.2\//);
    // 部品庫 2.7.0 から部品の説明の言葉が用語集にそろった（45 の部品）。この比べは指示を組む側の変化を見るので、部品庫は 2.6.2 のまま組んで比べる
    const P262 = generate({ catalogue: '2.6.2' }).data;
    assert.match(P262.partsSrc, /\/v2\.6\.2\//);
    assert.match(PACK.partsSrc, /\/v2\.20\.0\//);
    // 部品庫 2.5.0（候補）で m-cards の README（日本語）が変わった（箇条書きの代わりにカードを使う手引き）。その部品の日本語の指示だけは v0.6.6 のものに揃えて比べる
    const cur = structuredClone(P262);
    cur.ja.components['m-cards'] = oldData.ja.components['m-cards'];
    // v0.6.8 で science の束の指示に光 --lit の 1 行を足した（format spec §8.4）。その 1 行だけは除いて比べる（共通の本体はそのまま）
    const LIT_JA = '\n\n色は R-colors のものに加えて `--lit` も使える：光と、光が照らすもの。輪郭線を付けた塗りに使う。';
    assert.ok(cur.ja.sets.science.includes(LIT_JA), 'the --lit line of the ja science set');
    cur.ja.sets.science = cur.ja.sets.science.replace(LIT_JA, '');
    // 部品庫 2.5.1 で m-map-japan の README（日本語）に階級の決まりが加わった。同じく v0.6.6 のものに揃えて比べる
    cur.ja.components['m-map-japan'] = oldData.ja.components['m-map-japan'];
    // 部品庫 2.6.0（候補）で m-curves 2.2.0 に area が加わった。その部品の日本語の指示も v0.6.6 のものに揃えて比べる
    cur.ja.components['m-curves'] = oldData.ja.components['m-curves'];
    // 部品庫 2.6.2 で m-predict 2.0.5 の README（日本語）が変わった（answer-step は 2 以上）。同じく v0.6.6 のものに揃えて比べる
    cur.ja.components['m-predict'] = oldData.ja.components['m-predict'];
    // 部品庫 2.6.0（候補）で新しい束 data（情報・データサイエンス）が加わった。その束とそのパーツを除いて比べる（ほかの束の組み合わせはそのまま）
    const DATA = cur.parts.filter((p) => p.set === 'data').map((p) => p.tag);
    assert.deepEqual(DATA, ['m-balance', 'm-ci', 'm-code', 'm-folds', 'm-mapping', 'm-sampling']);
    cur.sets = cur.sets.filter((x) => x !== 'data');
    cur.parts = cur.parts.filter((p) => p.set !== 'data');
    for (const L of ['en', 'ja']) { delete cur[L].sets.data; for (const t of DATA) delete cur[L].components[t]; }
    // v0.6.10 で指示の材料の言葉を用語集にそろえた（部品→パーツ・口述原稿→台本・デッキ→教材・注目の演出→強調）。パーツ庫から来る説明は元の言葉のままなので、両方を同じ言葉に直してから比べる
    const TERMS = [['部品', 'パーツ'], ['口述原稿', '台本'], ['デッキ', 'スライド'], ['注目の演出', '強調'], ['段階', 'ステップ']];
    const norm = (x) => TERMS.reduce((t, [from, to]) => t.replaceAll(from, to), x);
    // v0.6.10 の続き：コードの囲み → コードブロック（初出は灰色の枠（コードブロック））、段階の印 → ステップの指定。古い側の文を新しい文に直してから比べる
    const FOLLOW = [
      ['**2 つの囲みはどちらも最後まで書いて閉じる。**囲みの途中で終わらない', '**2 つの灰色の枠（コードブロック）はどちらも最後まで書いて閉じる。**コードブロックの途中で終わらない'],
      ['**ちょうど 2 つのコードの囲み**にし', '**ちょうど 2 つのコードブロック**にし'],
      ['1 つのファイルを囲みに分けない', '1 つのファイルを複数のコードブロックに分けない'],
      ['囲みの途中で終わらない（長すぎるなら', 'コードブロックの途中で終わらない（長すぎるなら'],
      ['`outline` という名前の囲み 1 つ', '`outline` という名前のコードブロック 1 つ'],
      ['また 2 つの囲みで返す（R-output）', 'また 2 つのコードブロックで返す（R-output）'],
      ['その節だけを 2 つの囲みで返す', 'その節だけを 2 つのコードブロックで返す'],
      ['ステップの印は `[0]`', 'ステップの指定は `[0]`'],
      ['**ないステップの印は書かない**', '**ないステップの指定は書かない**'],
      ['1 枚のステップは 5 前後まで', '1 枚のステップの数は 5 前後まで'],
      // v0.6.11：読みは書いた所にだけ当たる（backlog #203）
      // v0.6.12：版の行の名前（backlog #205）
      ['指示の版：', '指示のバージョン：'],
      ['記号ごとに読みを付け、関係は言葉で言う）', '記号ごとに読みを付け、関係は言葉で言う）。読みは読みなしで読み違える語にだけ付ける（かなの読みは抑揚を崩しやすい）。読みは書いた所にだけ当たるので、付けた語がまた出てくるなら、出てくる所ごとに付ける'],
      // v0.6.12：R-fit の「図の中の字は 24 px 以上」は 1280×720 の大きさの行（すべての字は 24 px 以上）と重なるので除いた
      ['字を縮めず、字の大きさを書かない。図の中の字は 24 px 以上', '字を縮めず、字の大きさを書かない'],
      // v0.6.12：肩見出し（kicker、backlog #195）の 1 行
      ['（結論の行。短い 1 文）\n', '（結論の行。短い 1 文）\n- 肩見出し（見出しの上の短い言葉）を添えるなら、`<h2>` の直前に `<p class="kicker">` を 1 つ置く（普通のスライドだけ。`layout-tate` には置かない）。見出しには含めず、ステップ 0 で見せる。英語はテーマが大文字で表示するので、大文字で書かない。\n'],
      // v0.6.13：注意・警告の枠（R-caution）の 1 行。.body の中の行のすぐ後
      ['`<ol>` `<table>`\n', '`<ol>` `<table>`\n- **R-caution** `.body` に注意は `<div class="caution">…</div>`、警告は `class="caution warn"`。ラベルは自動で付く。\n'],
      // v0.6.14：作った言葉を王道の言葉に（#223）。指示の側の言葉（部品庫の字は下の jaWords）
      ['データ（子の `<script type="application/json">`）の見本', 'データ（子の `<script type="application/json">`）の例'], ['書き方の見本', '書き方の例'],
      ['§6 の見本と同じ', '§6 の例と同じ'], ['この束の拡張', 'このセットの拡張'], ['### 見本：', '### 例：'], ['## 6. 見本', '## 6. 例'], ['§4 の見本の', '§4 の例の'],
      ['小さな教材の見本（架空。形を見るためで、中身は写さない）', '小さな教材の例（架空。形を見るためで、中身はコピーしない）'], ['最後にも見本がある', '最後にも例がある'],
      ['**図やパーツの中も含め、字はすべて 24 px 以上**', '**図やパーツの中もテキストはすべて 24 px 以上**'], ['パーツは大きさによらず字を', 'パーツは大きさによらずテキストを'],
      ['**R-output** 返事は', '**R-output** 出力は'], ['添付にせず、返事の本文に書く', '添付にせず、本文に書く'], ['**R-components** 動く図は', '**R-components** パーツは'],
      ['数字の札・円グラフ', '数字のカード・円グラフ'], ['各パーツの説明（版を固定）', '各パーツの説明（バージョンを固定）'],
      ['## パーツの束：', '## パーツのセット：'], ['この束のパーツ', 'このセットのパーツ'], ['kokugo の束があるとき', 'kokugo のセットがあるとき'], ['入っている束）', '入っているセット）'],
      ['§6 の後に束の指示', '§6 の後にセットの指示'], ['いくつかの束の指示', 'いくつかのセットの指示'], ['ステップの数え方：札が 3 枚の', 'ステップの数え方：カードが 3 枚の'],
      ['tools（道具）', 'tools（ツール）'], ['進めるための道具', '進めるためのツール'],
      // v0.6.14：数式の項の説明（\underbrace・\overbrace、backlog #225 (a)）の 1 行。R-math の記号の定義の前
      ['。記号は最初に使う所で定義する（', '。項の説明は `\\underbrace{…}_{\\text{…}}`・`\\overbrace{…}^{…}`。`$$$$` は使わない。記号は最初に使う所で定義する（'],   // $$$$：replaceAll の置き換えの字で $$ を書く
      // v0.6.16：#36（教材 → スライドと台本・ファイル、チャットの AI → 対話型 AI）と表示の言葉の点検（頼む → 依頼 など。ui-ja-audit-2026-11-19）。行ごとの置き換え
      ["短い **Egatari の教材**を 1 つ書いてください。ステップごとに出る HTML のスライド（`deck.html`）と台本（`narration.md`）で、どちらも自動で組まれ、品質チェックを受けます。ここにないものは使えません。教材は頼まれた言語で書きます（スライドと台本は同じ言語）。規格には **R-fit** のような名前があり、修正依頼は破った規格を名前で示します。依頼は最後の **頼みたいこと**（かその前の会話）にあります。空の項目やない項目はほどよく決め、A と B が両方残っていれば書き込みのある方に従います。", "短い **Egatari のスライドと台本**を 1 つ書いてください。ステップごとに出る HTML のスライド（`deck.html`）と台本（`narration.md`）で、どちらも自動で組まれ、品質チェックを受けます。ここにないものは使えません。スライドと台本は依頼された言語で書きます（どちらも同じ言語）。規格には **R-fit** のような名前があり、修正依頼は破った規格を名前で示します。依頼は最後の **頼みたいこと**（かその前の会話）にあります。空の項目やない項目はほどよく決め、A と B が両方残っていれば書き込みのある方に従います。"],
      ["- **2 つの灰色の枠（コードブロック）はどちらも最後まで書いて閉じる。**コードブロックの途中で終わらない（R-output）。構成案がなければ、教材は短くする（5〜8 枚）。頼む文に構成案とその範囲があれば、その範囲のスライドをちょうどその枚数だけ書く（エディタは 1 回に 6 枚までしか頼まないので、収まる）", "- **2 つの灰色の枠（コードブロック）はどちらも最後まで書いて閉じる。**コードブロックの途中で終わらない（R-output）。構成案がなければ、スライドは短くする（5〜8 枚）。指示に構成案とその範囲があれば、その範囲のスライドをちょうどその枚数だけ書く（エディタは 1 回に 6 枚までしか依頼しないので、収まる）"],
      ["- **R-outline** **構成案だけ**を頼まれたら（長い教材を 2 回に分けて作るとき）、`outline` という名前のコードブロック 1 つ（始まりの行は ```` ```outline ````）だけで返し、`deck.html` と `narration.md` は書かない：列が「番号」「見出し」「要点（1 行）」の Markdown の表で、スライドごとに 1 行、全スライドを順に。その後の頼む文は範囲を示す（「構成案の 7〜12 枚目」）ので、その見出しと要点のとおりに、ちょうどそのスライドを書く\n- **R-noids** スライドの id を**書かない**。`<section class=\"slide\">` に `id` を付けず、台本の見出しにも `{#…}` を付けない。id は取り込みでエディタが付ける。id のあるスライドを渡されたとき（修正依頼）は、今ある `id=\"…\"` と `{#…}` をそのまま残す", "- **R-outline** **構成案だけ**を依頼されたら（長いものを 2 回に分けて作るとき）、`outline` という名前のコードブロック 1 つ（始まりの行は ```` ```outline ````）だけで返し、`deck.html` と `narration.md` は書かない：列が「番号」「見出し」「要点（1 行）」の Markdown の表で、スライドごとに 1 行、全スライドを順に。その後の指示は範囲を示す（「構成案の 7〜12 枚目」）ので、その見出しと要点のとおりに、ちょうどそのスライドを書く\n- **R-noids** スライドの id を**書かない**。`<section class=\"slide\">` に `id` を付けず、台本の見出しにも `{#…}` を付けない。id は取り込みでエディタが付ける。id のあるスライドを渡されたとき（修正依頼）は、今ある `id=\"…\"` と `{#…}` を変えない"],
      ["<title>教材の題名</title>", "<title>題名</title>"],
      ["- `lang`：`ja`・`en` など（教材の言語）。`data-theme`：ビジネス・ピッチは `sumi`、国語は `kokugo`、ほかは `default`", "- `lang`：`ja`・`en` など（スライドと台本の言語）。`data-theme`：ビジネス・ピッチは `sumi`、国語は `kokugo`、ほかは `default`"],
      ["- **R-headings** スライドの見出し（表紙と扉は `h1`、ほかは `h2`）は**すべて違う**ものにする（同じなら語を足す）。そのスライドの台本の節は `## ` に続けて**見出しとまったく同じ文字列**で始める（`<br>` などのタグは除く）", "- **R-headings** スライドの見出し（表紙と扉は `h1`、ほかは `h2`）は**すべて違う**ものにする（同じなら語を追加する）。そのスライドの台本の節は `## ` に続けて**見出しとまったく同じ文字列**で始める（`<br>` などのタグは除く）"],
      ["- パーツは自分のステップを足す（§3）。`data-from`（既定 1）から始まる", "- パーツは自分のステップを追加する（§3）。`data-from`（既定 1）から始まる"],
      ["- **R-style** 日本語のスライドは常体（だ・である、体言止め）で、です・ます を使わない。句読点はスライド全体で 1 つの組（`、。` か `，．`）。英語のスライドは短い句で", "- **R-style** 日本語のスライドは常体（だ・である、体言止め）で、です・ます を使わない。句読点はファイル全体で 1 つの組（`、。` か `，．`）。英語のスライドは短い句で"],
      ["どの教材でも使える標準のパーツ。§6 の後にセットの指示があれば、その種類の材料のパーツが加わる。「steps」はパーツが使うスライドのステップの数（`data-from` から。既定 1）。秒で測る属性（動きの長さ・ずれ）は載せない（既定で台本に合う）。型が json の属性は、値に JSON を書く（`values=\"[0.1,0.5]\"`）。「データの形」の `?` は省略できる欄。型を書いていない label・tex・note・tone は str、step は int、at は num。名前やラベルの `*…*` は斜体、`_` `^` は次の 1 字だけ下付き・上付き。記号のまま出すなら全角の ＿ ＾ ＊。", "どのファイルでも使える標準のパーツ。§6 の後にセットの指示があれば、その種類の材料のパーツが追加される。「steps」はパーツが使うスライドのステップの数（`data-from` から。既定 1）。秒で測る属性（動きの長さ・ずれ）は載せない（既定で台本に合う）。型が json の属性は、値に JSON を書く（`values=\"[0.1,0.5]\"`）。「データの形」の `?` は省略できる欄。型を書いていない label・tex・note・tone は str、step は int、at は num。名前やラベルの `*…*` は斜体、`_` `^` は次の 1 字だけ下付き・上付き。記号のまま出すなら全角の ＿ ＾ ＊。"],
      ["# 台本：<教材の題名>", "# 台本：<題名>"],
      ["- **R-dialogue** **既定は話者 1 人**で、話者名を書かない。掛け合いは頼まれたときだけ（3 人以上を頼まれても 2 役にし、最初にそう書く）：行を `Expert:` か `Novice:` で始め（続きの行は字下げ。話者なしは Expert）、認知的徒弟制の形にする：", "- **R-dialogue** **既定は話者 1 人**で、話者名を書かない。掛け合いは依頼されたときだけ（3 人以上を依頼されても 2 役にし、最初にそう書く）：行を `Expert:` か `Novice:` で始め（続きの行は字下げ。話者なしは Expert）、認知的徒弟制の形にする："],
      ["  - Expert は答えて具体例か比喩を 1 つ足すか、言い換えを確かめて（違えば直して）1 歩進める", "  - Expert は答えて具体例か比喩を 1 つ追加するか、言い換えを確認して（違えば修正して）1 歩進める"],
      ["利用者が**修正依頼**（規格の名前の付いた指摘の一覧と、今のファイル）を貼り付けたら、その指摘だけを直し、ほかは変えず、`id=\"…\"` と `{#…}` をすべてそのまま残し（R-noids）、また 2 つのコードブロックで返す（R-output）。依頼に一部のスライドしかなければ、そのスライドの `<section>` だけ（`<html>` なし）とその節だけを 2 つのコードブロックで返す（エディタが id で元の場所に戻す）。", "利用者が**修正依頼**（規格の名前の付いた指摘の一覧と、今のファイル）を貼り付けたら、その指摘だけを修正し、ほかは変えず、`id=\"…\"` と `{#…}` をすべて変えず（R-noids）、また 2 つのコードブロックで返す（R-output）。依頼に一部のスライドしかなければ、そのスライドの `<section>` だけ（`<html>` なし）とその節だけを 2 つのコードブロックで返す（エディタが id で元の場所に戻す）。"],
      ["小さな教材の例（架空。形を見るためで、中身はコピーしない）。ステップの数え方：2 項目の箇条書きはステップ 1〜2 と `[concl]`、箱が 4 つの `m-flow` はステップ 1〜4。いくつかのセットの指示の最後にも例がある。", "小さな例（架空。形を見るためで、中身はコピーしない）。ステップの数え方：2 項目の箇条書きはステップ 1〜2 と `[concl]`、箱が 4 つの `m-flow` はステップ 1〜4。いくつかのセットの指示の最後にも例がある。"],
      ["*（A か B を埋め、もう一方は消します。書かない項目は消してかまいません）*", "*（A か B を埋め、もう一方は削除します。書かない項目は削除してかまいません）*"],
      ["このチャットで渡した資料と、ここまでの話し合いの内容で、教材を作ってください。", "このチャットで渡した資料と、ここまでの話し合いの内容で、スライドと台本を作ってください。"],
      ["データを見せる教材・発表向け。分布、箱ひげ図、ヒートマップ、観測が 1 つずつ加わって変わる分布を見せる。テーマは `default`。データの出どころと数（何人・何件）をスライドか台本に書き、本物らしく見えるデータを作らない（R-components）。", "データを見せる授業・発表向け。分布、箱ひげ図、ヒートマップ、観測が 1 つずつ加わって変わる分布を見せる。テーマは `default`。データの出どころと数（何人・何件）をスライドか台本に書き、本物らしく見えるデータを作らない（R-components）。"],
      ["地図を使う教材・案内向け（地理・歴史・地域の案内）。日本地図か世界地図を使う。テーマは `default`。数字（人口・面積・生産量など）には、何年の・どこの数字かをスライドか台本に書く。", "地図を使う授業・案内向け（地理・歴史・地域の案内）。日本地図か世界地図を使う。テーマは `default`。数字（人口・面積・生産量など）には、何年の・どこの数字かをスライドか台本に書く。"],
      // v0.6.18：R-steps に表の見せ方（#65、パーツの名前は書かない）
      ["1 枚のステップの数は 5 前後まで\n", "1 枚のステップの数は 5 前後まで。表は、比べ方で見せ方を選ぶ。項目を 1 つずつ説明するなら行を話す順に出す。行列（縦に比べるもの、横に評価基準）や 2 本の軸の交差の表は、全体を見せてから注目する列・マスに印を付けるか、軸の列ごとに埋める。研究の位置づけの表では、本研究のマスに字で「本研究」と書く（色や太字だけで区別しない）。\n"],
      // v0.6.18：国語のセットに「縦と横をそろえる」（#70、作者 11/21）と縦の本文の量（#83、規格化 11/22）
      ["`m-kanbun` はいつも縦書き）\n", "`m-kanbun` はいつも縦書き）。縦のスライドの本文は 15 列まで（1 列およそ 18 字、合わせて 270 字ほど）。18 字を超える項目は 2 列になる。収まらなければスライドを分ける。\n- **縦と横をそろえる：**1 つの教材では縦か横にそろえる。古文・漢文・現代文の本文を読む教材は、説明のスライドも縦にそろえる。横書きでしか置けない図や表（流れ図など）のスライドだけを横にし、なるべくまとめて置き、縦と横を交互にしない\n"],
      // v0.6.19：出典の行（handoff #86）の 1 行。普通のスライドの行のすぐ後
      ['（結論の行。短い 1 文）\n- 肩見出し', '（結論の行。短い 1 文）\n- 数字・図・引用を使ったスライドには、結論の行の上に出典の行（`<p class="source">出典：…</p>`）を書く\n- 肩見出し'],
      ["授業・研修を進めるためのツール（演習やグループワークのタイマーなど）。頼みに演習の時間やワークショップがあるときだけ、その活動をするスライドに使う。", "授業・研修を進めるためのツール（演習やグループワークのタイマーなど）。依頼に演習の時間やワークショップがあるときだけ、その活動をするスライドに使う。"],
    ];
    const follow = (x) => FOLLOW.reduce((t, [from, to]) => t.replaceAll(from, to), x);
    // 部品庫から来る字の言い換え（make-llm-guide の JA_WORDS。#223）は、古い側にも掛けて比べる（新しい側に掛け直しても変わらない）
    for (const D of [cur, oldData]) for (const [tag, c] of Object.entries(D.ja.components)) for (const k of ['row', 'entry', 'free']) if (typeof c[k] === 'string') c[k] = jaWords(tag, c[k]).replace('）の見本: ', '）の例: ').replace('書き方の見本: ', '書き方の例: ');
    // v0.6.19：写真が要る所は図の枠と説明（handoff #85）。R-components の次の 1 行で、有料のプランだけ（jaDump の並びの 3 つ目ごと）
    const PAID_ONLY = ['動きが説明になる所だけに使う（たいていのスライドには要らない）\n', '動きが説明になる所だけに使う（たいていのスライドには要らない）\n- 写真が要る所は、図の枠（テンプレートの「図」）と内容の説明を書き、画像は作成者が後で入れる\n'];
    const a = jaDump(cur).map(norm), b = jaDump(oldData).map(norm).map(follow).map((x, i) => (i % 3 === 2 ? x.replaceAll(...PAID_ONLY) : x));
    assert.equal(a.length, b.length);
    assert.ok(a.every((x, i) => x === b[i]), `ja packs differ from v0.6.6 (${firstDiff(a, b)})`);
    assert.ok(a.some((x) => x.includes('<version>')) && a.some((x) => x.includes('<partsSrc>')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

if (failed) { console.log(`test-llm-guide-en: ${failed} failed`); process.exit(1); }
console.log('test-llm-guide-en: ok');
