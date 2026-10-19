// 外から使われる口の形（字の中身ではなく構造）を写し（tools/fixtures/api-shapes.json）と比べる
//   node tools/test-api-shapes.mjs [作業用のフォルダ] [--update]
// 写すもの：
//   check-json            node kit/check.mjs --json の出力（examples/minimal の写しに、id のあるスライドと、どのスライドにも合わない口述原稿の節を足したもの）
//   buildFixRequest       kit/core/llm-fix.mjs の引数（関数の引数の並びの字）と返り値
//   buildPack             kit/core/llm-pack.mjs の buildPack と、それが呼ぶ assemble（kit/core/llm-pack-assemble.mjs）の引数と返り値
//   llm-import.*          kit/core/llm-import.mjs の extractBlocks（取り出せた・閉じていない・囲みがない）・mergeSlides・mergeNarration の引数と返り値
// 形の決まり：葉は型の名前（string・number・boolean・null）を | でつないだもの、配列は [要素の形]、object は {鍵: 形}（鍵は名前の順）、
// "*" は中身を見ない（check の data は知らせの種類ごとに違う）。比べ方：object の鍵は過不足なく同じ、葉の型は写しの型のどれか
// （写しの方が広くてよい：今の入力で null が出なくても、null を許すことを写しに書いておける）、空の配列は要素を比べない、引数の並びは字が同じ。
// 形を変えるとき：--update で写しを書き直し（今の形を写しの型に足す。狭めるのは手で）、changes/ に「### Changed (API)」の断片を足す（CONTRIBUTING.md）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFixRequest } from '../kit/core/llm-fix.mjs';
import { buildPack } from '../kit/core/llm-pack.mjs';
import { assemble } from '../kit/core/llm-pack-assemble.mjs';
import { extractBlocks, mergeSlides, mergeNarration } from '../kit/core/llm-import.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SNAP = path.join(ROOT, 'tools', 'fixtures', 'api-shapes.json');
const args = process.argv.slice(2);
const update = args.includes('--update');
const work = args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'api-shapes-'));
const OPAQUE = new Set(['check-json.results[].data']);

// ---------------------------------------------------------------- 形
function shape(v, at) {
  if (OPAQUE.has(at)) return '*';
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? [v.map((x) => shape(x, at + '[]')).reduce(merge)] : [];
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k], `${at}.${k}`)]));
  return typeof v;
}
const isLeaf = (s) => typeof s === 'string';
const union = (a, b) => [...new Set([...a.split('|'), ...b.split('|')])].sort().join('|');
function merge(a, b) {
  if (isLeaf(a) && isLeaf(b)) return a === '*' || b === '*' ? '*' : union(a, b);
  if (Array.isArray(a) && Array.isArray(b)) return !a.length ? b : !b.length ? a : [merge(a[0], b[0])];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a).sort().join(','), kb = Object.keys(b).sort().join(',');
    if (ka !== kb) throw new Error(`objects with different keys in one array: {${ka}} vs {${kb}}`);
    return Object.fromEntries(Object.keys(a).sort().map((k) => [k, merge(a[k], b[k])]));
  }
  throw new Error(`cannot merge ${JSON.stringify(a)} with ${JSON.stringify(b)}`);
}
// got が want に収まるか。違いの場所の一覧を返す
function fits(got, want, at, out) {
  if (want === '*') return out;
  if (isLeaf(got) && isLeaf(want)) {
    const allow = new Set(want.split('|'));
    const extra = got.split('|').filter((t) => !allow.has(t));
    if (extra.length) out.push(`${at}: ${extra.join('|')} is not one of ${want}`);
  } else if (Array.isArray(got) && Array.isArray(want)) {
    if (got.length && want.length) fits(got[0], want[0], at + '[]', out);
    else if (got.length && !want.length) out.push(`${at}: the snapshot has no element shape (run --update)`);
  } else if (got && want && typeof got === 'object' && typeof want === 'object' && !Array.isArray(got) && !Array.isArray(want)) {
    for (const k of Object.keys(want)) if (!(k in got)) out.push(`${at}.${k}: missing`);
    for (const k of Object.keys(got)) if (!(k in want)) out.push(`${at}.${k}: new key`);
    for (const k of Object.keys(got)) if (k in want) fits(got[k], want[k], `${at}.${k}`, out);
  } else out.push(`${at}: ${JSON.stringify(got)} instead of ${JSON.stringify(want)}`);
  return out;
}
// 関数の引数の並び（字）：最初の ( から対応する ) まで。空白は 1 つにまとめる
function params(fn) {
  const src = fn.toString();
  const a = src.indexOf('(');
  let d = 0, i = a;
  for (; i < src.length; i++) { if (src[i] === '(') d++; else if (src[i] === ')' && --d === 0) break; }
  return src.slice(a + 1, i).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- 今の形を集める
const got = {};

// check --json
const deck = path.join(work, 'check-deck');
fs.rmSync(deck, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), deck, { recursive: true, filter: (s) => !s.split(path.sep).includes('out') });
const dh = path.join(deck, 'deck.html');
fs.writeFileSync(dh, fs.readFileSync(dh, 'utf8').replace('<section class="slide">', '<section class="slide" id="api-shapes">'));
fs.appendFileSync(path.join(deck, 'narration.md'), '\n## 存在しないスライド {#nope}\n\n[0] これは試しです。\n');
let json;
try { json = execFileSync(process.execPath, [path.join(ROOT, 'kit', 'check.mjs'), dh, '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); }
catch (e) { json = e.stdout; }   // エラーのあるデッキなので終了コードは 1
const cj = JSON.parse(json);
assert.ok(cj.results.some((r) => r.slide === null) && cj.results.some((r) => r.id), 'the check fixture should give a whole-deck result and one for a slide with an id');
got['check-json'] = shape(cj, 'check-json');

// buildFixRequest
const problems = [
  { i: 0, sev: 'error', code: 'overflow', text: 'overflow by 12px', a: { px: 12 } },
  { i: null, sev: 'warn', code: 'build', text: 'narration: no slide' },
];
const fdeck = '<!DOCTYPE html><html lang="en"><body>\n<section class="slide" id="a"><h2>A</h2><m-flow></m-flow></section>\n<section class="slide" id="b"><h2>B</h2></section>\n</body></html>\n';
const fnarr = '## A {#a}\n\n[0] Hello.\n\n## B {#b}\n\n[0] Bye.\n';
got.buildFixRequest = {
  params: params(buildFixRequest),
  returns: [buildFixRequest({ problems, deck: fdeck, narration: fnarr, lang: 'en' }), buildFixRequest({ problems, deck: fdeck, narration: fnarr, lang: 'ja', limit: 10 })].map((r) => shape(r, 'buildFixRequest')).reduce(merge),
};

// buildPack
got.buildPack = { params: params(buildPack), assembleParams: params(assemble), returns: shape(buildPack({ series: ['academic'], lang: 'en' }), 'buildPack') };

// llm-import
const reply = (d, n) => `Here you go.\n\n\`\`\`deck.html\n${d}\`\`\`\n\n\`\`\`narration.md\n${n}\`\`\`\n`;
got['llm-import.extractBlocks'] = {
  params: params(extractBlocks),
  ok: shape(extractBlocks(reply(fdeck, fnarr) + '\n```js\nx\n```\n'), 'x'),
  unclosed: shape(extractBlocks('```deck.html\n' + fdeck), 'x'),
  noBlocks: shape(extractBlocks('no code here'), 'x'),
};
got['llm-import.mergeSlides'] = { params: params(mergeSlides), returns: shape(mergeSlides(fdeck, '<section class="slide" id="a"><h2>A2</h2></section>\n<section class="slide" id="zz"><h2>Z</h2></section>'), 'x') };
got['llm-import.mergeNarration'] = { params: params(mergeNarration), returns: shape(mergeNarration(fnarr, '## A {#a}\n\n[0] Hi.\n\n## C {#c}\n\n[0] New.\n'), 'x') };

// ---------------------------------------------------------------- 比べる
const snap = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : {};
if (update) {
  const widen = (g, w) => { try { return w === undefined ? g : fits(g, w, '', []).length ? merge(g, w) : w; } catch { return g; } };
  const out = Object.fromEntries(Object.keys(got).map((k) => [k, widen(got[k], snap[k])]));
  fs.mkdirSync(path.dirname(SNAP), { recursive: true });
  fs.writeFileSync(SNAP, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${path.relative(ROOT, SNAP)}: add a "### Changed (API)" fragment in changes/ when a shape changed`);
  process.exit(0);
}
let bad = 0;
for (const k of new Set([...Object.keys(got), ...Object.keys(snap)])) {
  const diffs = !(k in snap) ? ['not in the snapshot'] : !(k in got) ? ['in the snapshot but not measured'] : fits(got[k], snap[k], k, []);
  if (diffs.length) { bad++; console.log(`FAIL ${k}\n${diffs.map((d) => '     ' + d).join('\n')}`); } else console.log(`ok   ${k}`);
}
if (bad) console.log('\nan interface shape changed: if that is intended, run node tools/test-api-shapes.mjs --update and add a "### Changed (API)" fragment in changes/ (CONTRIBUTING.md "Changelog")');
process.exit(bad ? 1 : 0);
