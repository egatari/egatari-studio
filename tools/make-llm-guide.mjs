// チャットの AI に教材を書かせる指示（AI instruction pack）の材料と docs を作る。手で直さない
//   node tools/make-llm-guide.mjs            書く：kit/core/llm-pack-data.mjs（組み立ての材料）と、
//                                            plugins/egatari/ と skills/studio/SKILL.md の版の行と、
//                                            docs/authoring-with-llms(.ja).md（共通の本体）・docs/llm-parts/<束>(.ja).md（束ごとの部分）
//   node tools/make-llm-guide.mjs --zip <out-dir> [--lang ja|en]  egatari-make-skill.zip（make/ 以下。Node の組み込みだけ）
//   node tools/make-llm-guide.mjs --check    今のファイルが作り直したものと同じか・大きさ（npm test。違えば・大きすぎれば終了コード 1）
// 組み立ては kit/core/llm-pack-assemble.mjs の assemble（編集アプリ・kit/llm-pack.mjs・修正依頼と同じ関数）。docs はその出力そのもの
//
// パーツの段と束（handoff/parts-tiers-2026-10-27.md §1、backlog #125）：パーツライブラリ 2.0 の既定のカタログ（components2.lock.json の default）の
// manifest（vendor/components-2/manifest-<版>.json）の tier・set で決める。標準（standard）は共通の本体にいつも入り、専門（specialized）は
// その束（set）を選んだときだけ束の指示に入る。特殊（extra）は指示に入れない（make スキルの extra.md に README への道だけ）
//
// 材料（どれかを直したら作り直す）：
//   tools/llm-guide/template.md・template.ja.md   共通の本体（英語が正本）。{{…}} を下の中身で置き換える
//   docs/llm-book.md・llm-book.ja.md              make の「本と配置」（手書きの正本）。スキルの頭にそのまま差し込む
//   docs/llm-book-ref.md・llm-book-ref.ja.md      make の references/book.md（本を頼まれたときだけ読む。en は references/en/book.md）
//   tools/llm-guide/sets/<束>.md・.ja.md          束ごとの部分。{{CATALOG}}（その束の部品）・{{EXTENSIONS}}（標準の部品のその束向けの節）・{{WORKED …}}
//   docs/contract.md・contract.ja.md              {{contract §N "頭の字"}}：その節の箇条書きのうち、その字で始まる 1 つ（見つからなければ失敗）
//   vendor/components/sha256/<hash>/README.md・index.js  既定のカタログの部品の写し（components.lock.json の content 表で引く）。frontmatter の name・summary・steps・props と、
//                                                 props の型・既定値・説明（static props）・データの形（static shape）・README の本文。
//                                                 本文の <!-- llm: <束> --> … <!-- llm: end --> はその束の部分に「拡張」として（標準の部品だけ。前の系列の名前
//                                                 （business など）は LEGACY_SERIES で束に読み替える）、<!-- llm: omit --> … <!-- llm: end --> は指示に入れない
//   vendor/components-2/manifest-<版>.json         部品の tier・set と {{PURPOSES}}：言いたいこと → パーツ → ステップの表（版を固定した URL 付き）。
//                                                 manifest に purposes がなければ kit/core/purposes.mjs の FALLBACK。どちらを使ったかは材料の purposes.source
//   tools/llm-guide/worked/<名前>/                {{WORKED 名前 "見出し"}}：見本の deck.html と narration.md（npm test が組んで検査する）
// 大きさ（--check。sizeReport）：無料のプランの標準すべて（束なし）は 35 KB を超えれば警告・45 KB か貼り付けの長さ 31,000（UTF-16 の単位の数＋改行の数。
// FREE_PASTE_UNITS）を超えれば失敗。標準と 1 つの束は、越えるなら中核の 4 つも短くし、専門のパーツも外して収めた大きさで、それでも越えれば知らせるだけ。有料のプランは標準と 2 つの束のどの組も 150 KB まで（越えれば失敗）、すべての束は越えれば知らせるだけ（PACK_CAP_KB）
// 1 行目の i18n の印（tools/i18n-pairs.mjs）は残す。作り直して中身が変わったら、両方を見比べて npm run i18n -- --stamp で印を付け直す
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStamp } from './i18n-pairs.mjs';
import { parseLock, resolveCatalogueContent, LOCK_FILE } from '../kit/core/components-lock.mjs';
import { renderedFieldNames } from '../kit/core/parts2.mjs';
import { assemble, commonOf, partOf, membersOf, requestOf, PACK_CAP_KB, FREE_PASTE_UNITS, pasteUnits, fitSize, partSpans, STANDARD, FREE_CORE, fitPack, packOptsOf } from '../kit/core/llm-pack-assemble.mjs';
import { purposesFrom } from '../kit/core/purposes.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (...p) => path.join(ROOT, ...p);
const read = (...p) => fs.readFileSync(rel(...p), 'utf8').replace(/\r\n/g, '\n');
// 束の並び（parts-tiers §1.1 の順。manifest にあってここにない束は、後ろに名前の順で足す）
export const SET_ORDER = ['stats', 'math', 'maps', 'kokugo', 'english', 'music', 'business', 'tools'];
// 前の系列（部品庫 1.x の series）の名前 → 束。README の <!-- llm: 系列 --> の拡張の節を束に読み替える（部品庫が束の名前に直したら要らない）
export const LEGACY_SERIES = Object.freeze({ academic: ['stats', 'math', 'science'], business: ['business'], kokugo: ['kokugo'], english: ['english'], music: ['music'], social: ['maps'], info: [] });
export const DATA_FILE = 'kit/core/llm-pack-data.mjs';
export const commonFile = (lang) => (lang === 'ja' ? 'docs/authoring-with-llms.ja.md' : 'docs/authoring-with-llms.md');
export const partFile = (s, lang) => `docs/llm-parts/${s}${lang === 'ja' ? '.ja' : ''}.md`;
// KB（1024 バイト）。fail：無料のプランの標準すべて。free：無料のプランの上限（標準と束。越えたら知らせるだけ）。paid：有料のプラン。
// paste：無料のプランのもう 1 つの上限（貼り付けの長さ = UTF-16 の単位の数＋改行の数。FREE_PASTE_UNITS。KB ではない）
export const LIMITS = { warn: 35, fail: PACK_CAP_KB.free, free: PACK_CAP_KB.free, paid: PACK_CAP_KB.paid, paste: FREE_PASTE_UNITS };
// 2 つの束の組。'a+b' の名前で大きさを持つ
export const pairsOf = (sets) => sets.flatMap((a, i) => sets.slice(i + 1).map((b) => [a, b]));
// いちばん大きい組：[名前, KB]
export const largestPair = (pairs) => Object.entries(pairs).reduce((m, x) => (!m || x[1] > m[1] ? x : m), null);

// ---------------------------------------------------------------- 既定のカタログ（パーツライブラリ 2.0）
// → {version, tag, source, manifest, parts: {名前: 版}}
export function catalogue() {
  const lock2 = JSON.parse(read('components2.lock.json'));
  const v = lock2.default, cat = lock2.catalogues[v];
  if (!cat) throw new Error(`components2.lock.json: default ${v} is not a catalogue`);
  return { version: v, tag: cat.tag, source: lock2.source, manifest: JSON.parse(read('vendor', 'components-2', `manifest-${v}.json`)), parts: cat.parts, lock2 };
}
// 束の並び：manifest の専門の部品の set を SET_ORDER の順に
export function setsOf(manifest) {
  const have = new Set(Object.values(manifest.components).filter((c) => c.kind === 'element' && c.tier === 'specialized' && c.set).map((c) => c.set));
  return [...SET_ORDER.filter((s) => have.has(s)), ...[...have].filter((s) => !SET_ORDER.includes(s)).sort()];
}

// ---------------------------------------------------------------- 段と束（パーツライブラリ 2.0 の manifest）
// パーツの画面の名前（manifest の display。components 2.2.0 から）→ {ja, en} | null。display は「日本語 / English」の 1 つの文字列か {ja, en}。
// kit/core/part-labels.mjs が新規作成 ④ の名前にこれを使い、表の名前（PART_LABELS の ja・en）はこれのないパーツだけに使う
export function displayOf(c, version = '') {
  const d = c.display;
  if (d == null) return null;
  const where = `manifest-${version}.json: ${c.tag} display ${JSON.stringify(d)}`;
  if (typeof d === 'object' && typeof d.ja === 'string' && typeof d.en === 'string' && d.ja.trim() && d.en.trim()) return { ja: d.ja.trim(), en: d.en.trim() };
  if (typeof d !== 'string') throw new Error(`${where} is neither "ja / en" nor {ja, en}`);
  const xs = d.split(' / ');
  if (xs.length !== 2 || !xs[0].trim() || !xs[1].trim()) throw new Error(`${where} is not "ja / en"`);
  return { ja: xs[0].trim(), en: xs[1].trim() };
}
// → {catalogue, parts: {タグ: {tier, set?, purposes, display?: {ja, en}}}, purposes: [{id, label: {ja, en}, into?}]}。manifest の要素のパーツすべて（特殊も。一覧が特殊を除く）
export function tiersFrom(cat = catalogue()) {
  const m = cat.manifest;
  const parts = {};
  const els = Object.values(m.components).filter((c) => c.kind === 'element' && c.tag).sort((a, b) => (a.tag < b.tag ? -1 : 1));
  for (const c of els) {
    if (!['standard', 'specialized', 'extra'].includes(c.tier)) throw new Error(`manifest-${cat.version}.json: ${c.tag} has tier ${JSON.stringify(c.tier)}`);
    if (c.tier === 'specialized' && !c.set) throw new Error(`manifest-${cat.version}.json: ${c.tag} is specialized without a set`);
    const display = displayOf(c, cat.version);
    parts[c.tag] = { tier: c.tier, ...(c.set ? { set: c.set } : {}), purposes: [...(c.purposes || [])], ...(display ? { display } : {}) };
  }
  const purposes = (m.purposes || []).map((p) => ({ id: p.id, label: p.label || { ja: p.ja, en: p.en }, ...(p.tile && p.tile.into ? { into: p.tile.into } : {}) }));
  return { catalogue: cat.version, parts, purposes };
}

// ---------------------------------------------------------------- 部品
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return [{}, text];
  const fm = {};
  for (const line of m[1].split('\n')) { const x = line.match(/^([\w-]+):\s*(.*)$/); if (x) fm[x[1]] = x[2].trim(); }
  return [fm, m[2].trim()];
}
// static props = { name: {type: "…", default: …, doc: "…"}, … }（1 行に 2 つ以上あってもよい）
// 値の宣言の中の入れ子（shape: {…}・example: […]）は除いてから読む（{…} が入れ子になると下の正規表現が切れる）
function dropNested(js) {
  let out = '', i = 0;
  const re = /,\s*(?:shape|example):\s*[[{]/g;
  let m;
  while ((m = re.exec(js))) {
    let j = m.index + m[0].length, depth = 1;
    while (j < js.length && depth) { const c = js[j]; if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') depth--; else if (c === '"' || c === "'") { const q = c; j++; while (j < js.length && js[j] !== q) j += js[j] === '\\' ? 2 : 1; } j++; }
    out += js.slice(i, m.index); i = j; re.lastIndex = j;
  }
  return out + js.slice(i);
}
// static shape = {…};（データの形。props ではない）を除く
function dropShape(js) {
  const m = /static shape\s*=\s*\{/.exec(js);
  if (!m) return js;
  let j = m.index + m[0].length, depth = 1;
  while (j < js.length && depth) { const c = js[j]; if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') depth--; else if (c === '"' || c === "'") { const q = c; j++; while (j < js.length && js[j] !== q) j += js[j] === '\\' ? 2 : 1; } j++; }
  return js.slice(0, m.index) + js.slice(j);
}
function propDocs(js0) {
  const js = dropNested(dropShape(js0));
  const m = js.match(/static props\s*=\s*\{([\s\S]*?)\n\s*\};/);
  const out = new Map();
  if (!m) return out;
  for (const x of m[1].matchAll(/"?([\w-]+)"?\s*:\s*\{([^{}]*)\}/g)) {
    const body = x[2];
    const type = body.match(/type:\s*"(\w+)"/)?.[1] || '';
    const dflt = body.match(/default:\s*((?:\[[^\]]*\]|"[^"]*"|[^,}]+))/)?.[1]?.trim() ?? '';
    const doc = body.match(/doc:\s*"([^"]*)"/)?.[1] || '';
    out.set(x[1], { type, dflt, doc });
  }
  return out;
}
// 軸の値は説明のない部品がある（* を付けて補う）
const AXIS = {
  en: { xr: 'x range [min, max]', yr: 'y range [min, max]', xt: 'x tick values', yt: 'y tick values', xf: 'x tick decimals', yf: 'y tick decimals', xl: 'x axis name (`*italic*` `_sub` `^sup`)', yl: 'y axis name' },
  ja: { xr: '横軸の範囲 [min, max]', yr: '縦軸の範囲 [min, max]', xt: '横軸の目盛りの値', yt: '縦軸の目盛りの値', xf: '横軸の目盛りの小数桁', yf: '縦軸の目盛りの小数桁', xl: '横軸の名前（`*斜体*` `_下付き` `^上付き`）', yl: '縦軸の名前' },
};
// 見本のファイル・リポジトリの中の場所・スキルへの参照は、チャットの AI には開けないので除く
function stripRepoRefs(body) {
  return cleanReadme(body).split('\n').filter((ln) => !/demo\.html|examples\/|tools\/|(?:motion-components|egatari:parts) スキル/.test(ln)).join('\n')
    .replace(/\n?（(?:motion-slides|egatari:make) スキル §\d+「[^」]*」）/g, '').replace(/\n{3,}/g, '\n\n').trim()
    // 中身を除いて空になった「注意」の見出しも除く
    .replace(/\n+(?:#{1,6} )?注意\s*$/, '').replace(/\n(?:#{1,6} )?注意\n+(?=#{1,6} )/g, '\n');
}
// 部品庫の README の本文を、チャットの AI に渡す形にする（どの部品にも同じ規則。vendor/ は書き換えない）
//  - 相対リンク [字](../../SECURITY.md) は字だけにする（AI には開けない。http(s):・mailto:・# で始まるものは残す）。括弧の中に残ったファイル名だけの言及
//    （「（…。SECURITY.md）」）と、中が空になった括弧は除く
//  - 版の経緯（「v1.0.2 から」「since v1.0.2」）は除く（AI に要るのは今の決まりだけ）
//  - 見せ方（variant）の行は名前の並びだけにする：見せ方はシード値で選ばれ、AI が書くものではない（動きの説明は要らない。大きさを抑える。format spec §8.4）
const VARIANT_LINE = /^- 見せ方（`variant`[^）\n]*）：(.*)$/gm;
function shortVariants(body) {
  return body.replace(VARIANT_LINE, (_, rest) => {
    const names = [...rest.split('書かなければ')[0].matchAll(/`([a-z][a-z0-9-]*)`(?=（)/g)].map((m) => '`' + m[1] + '`');
    return `- 見せ方（\`variant\`）：${names.join('・')}。書かなければ資料のシード値で選ばれる（書かなくてよい）`;
  });
}
function cleanReadme(body) {
  return shortVariants(body)
    .replace(/\[([^\]]+)\]\((?![a-z][a-z0-9+.-]*:|#)[^)\s]*\)/gi, '$1')
    .replace(/[（(]\s*(?:since\s+)?v\d+(?:\.\d+)+\s*(?:から|onwards?)?[。.、,]?\s*/gi, (m) => m.slice(0, 1))
    .replace(/\b(?:since|from)\s+v\d+(?:\.\d+)+[,;]?\s*/gi, '')
    .replace(/v\d+(?:\.\d+)+\s*から[。、]?/g, '')
    .replace(/[。.、,]\s*[\w./-]+\.md(?=[）)])/g, '')
    .replace(/[（(]\s*[\w./-]+\.md\s*[）)]/g, '')
    .replace(/[（(]\s*[）)]/g, '');
}
// 部品の README・props の言い方が、この指示のほかの決まりとぶつかるとき、指示の側で言い換える（部品庫は変えない）。
// find が部品の節にないときは失敗させる（部品庫が直ったら、この言い換えも要らないか見直す）
const PACK_EDITS = {
  // v0.6.3: ctx.live is dormant until the service sends reveals (#112).
  'm-predict': [
    { find: 'live の投票の id（live 拡張のある再生で、見せてよいと決まった集計を棒に出す）',
      ja: '投票の id（今は見る人・作者の数を使う）', en: 'Live poll ID (v0.6.3 receives no live counts; viewer/author counts are used)' },
    { find: '- `poll="p1"`：live の投票の集計を出す',
      ja: '- `poll="p1"`：v0.6.3 は結果公開の送信元がなく、`ctx.live.poll(id)` は null。見る人・作者の数を使う',
      en: '- `poll="p1"`: reserved for future reveals. No live source sends reveals yet; `ctx.live.poll(id)` returns null, so viewer/author counts are used' },
  ],
  // 積み上げ棒の描き方（色の満ち方・名前の置き場所）は AI の書き方に関わらないので短く（大きさを抑える）
  'm-bars': [
    { find: '下の系列から順に色が満ちながら棒が合計まで伸び、合計を棒の端に（`unit` 付き）、それぞれの値を区切りの中に単位なしで書く（区切りが字より小さければ書かない）。系列の名前は、縦棒なら最後の組の棒の右、横棒なら最初の組の棒の上に、区切りの真ん中にそろえて書く。軸の上限は合計から決める。組の `tone` は合計の数字の色になる（区切りの色は系列の色のまま）。',
      ja: '合計を棒の端に、それぞれの値を区切りの中に書く。軸の上限は合計から決まる。組の `tone` は合計の数字の色。', en: '合計を棒の端に、それぞれの値を区切りの中に書く。軸の上限は合計から決まる。組の `tone` は合計の数字の色。' },
  ],
  // m-flow の前の色の経緯の言い換えは、部品庫 v1.13.0 が README から消したので要らなくなった
  // m-gendai の描き方（測り方）の言い換えは、部品庫 2.2.0（trimmed candidate, c2-base）が <!-- llm: omit --> に
  // 移したので要らなくなった（m-kobun の札の説明と同じ経緯。部品庫が直ったら見直す、のとおり）
  // range：鍵盤に入らない鍵を書く誤りが多いので、使う鍵を全部含めることを先に言う（規格の求め。0.6.0）
  'm-keyboard': [
    { find: '- `range`：両端は白鍵、1〜3 オクターブ', ja: '- `range`：使う鍵を全部含め、1 オクターブ以上（例 C4-C5）。両端は白鍵、3 オクターブまで', en: '- `range`：使う鍵を全部含め、1 オクターブ以上（例 C4-C5）。両端は白鍵、3 オクターブまで（Include every key you use, at least one octave (e.g. C4-C5). Both ends on white keys, up to 3 octaves.）' },
  ],
  'm-menu': [
    // 初稿には id を書かない（R-noids）：目次は取り込みの後に足す
    { find: '目次、授業の単元の選び方、「どこから見るか」を選ばせる 1 枚に使う。', ja: '目次、授業の単元の選び方、「どこから見るか」を選ばせる 1 枚に使う。目次は取り込んだ後に足す。初稿では普通の箇条書き。', en: '目次、授業の単元の選び方、「どこから見るか」を選ばせる 1 枚に使う。目次は取り込んだ後に足す。初稿では普通の箇条書き。（Add the menu after import; in the first draft use a plain list.）' },
    { find: 'id は `npm run ids` が付けたもの。', ja: 'id は取り込みのときに付く。', en: 'id は取り込みのときに付く。' },
    // 初稿に外部のファイルを参照しない
    { find: '  <a href="lesson2.ega.html" data-sub="次の課">返り点の練習</a>\n', ja: '', en: '' },
  ],
};
// 一覧の行（内容・データの形の欄）の言い換え。PACK_EDITS と同じ決まり（find が行になければ失敗）。lang があればその言語の行だけ（データの形の注記は言語ごと）
const ROW_EDITS = {
  'm-keyboard': [
    // 0.6.0 のプレーヤーは events(k) を呼ばないので、部品は音を鳴らさない。音は #114（0.6.3）で入る：そのとき「光らせて音も鳴らす」に戻す
    { find: '音階・和音・半音と全音を光らせて音も鳴らす', to: '音階・和音・半音と全音を光らせる' },
    { lang: 'ja', find: '（両端は白鍵、1〜3 オクターブ）', to: '（使う鍵を全部含め、1 オクターブ以上（例 C4-C5）。両端は白鍵、3 オクターブまで）' },
    { lang: 'en', find: '(white keys at both ends, 1–3 octaves)', to: '(include every key you use, at least one octave (e.g. C4-C5); white keys at both ends, up to 3 octaves)' },
  ],
};
function applyRowEdits(name, row, lang) {
  let out = row;
  for (const e of (ROW_EDITS[name] || []).filter((x) => !x.lang || x.lang === lang)) {
    if (!out.includes(e.find)) throw new Error(`ROW_EDITS ${name}: ${JSON.stringify(e.find)} is not in the ${lang} catalog row any more (review tools/make-llm-guide.mjs)`);
    out = out.replace(e.find, () => e.to);
  }
  return out;
}
function applyPackEdits(name, body, lang) {
  let out = body;
  for (const e of PACK_EDITS[name] || []) {
    if (!out.includes(e.find)) throw new Error(`PACK_EDITS ${name}: ${JSON.stringify(e.find)} is not in the component entry any more (review tools/make-llm-guide.mjs)`);
    out = out.replace(e.find, () => e[lang]);
  }
  return out;
}
// 部品のデータの形（static shape。kit/shape.js）：index.js を vm で読み、DECK.define に渡されたクラスから取る
function shapeApi() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('kit', 'shape.js'), ctx, { filename: 'kit/shape.js' });
  return ctx.DECK.shape;
}
// 2.0 の部品は egatariParts.define(meta, factory)：factory に依存のライブラリ（deps）を渡すとクラスを返す。データの形と props はクラスの static だけなので、
// deps は何を読んでも代わりのもの（継いでクラスにもできる関数）を返すもので足りる。1.x の DECK.define も読む
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (typeof k === 'symbol' ? (k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? [][Symbol.iterator] : undefined) : k === 'prototype' ? {} : stub()),
  apply: () => stub(), construct: () => stub(),
});
function classOf(js, name) {
  let cls = null;
  const D = { define: (n, c) => { if (n === name) cls = c; }, MotionElement: class {} };
  const deps = stub();
  const P = { define: (meta, factory) => { if (meta && meta.element === name) cls = factory(deps); } };
  const ctx = { DECK: D, egatariParts: P, window: { DECK: D, egatariParts: P } };
  vm.createContext(ctx);
  try { vm.runInContext(js, ctx, { filename: name + '/index.js' }); } catch (e) { throw new Error(`components: ${name}/index.js could not be read for its shape: ${e.message}`); }
  return cls;
}
// README の本文を、部品の場所の文章と <!-- llm: 束 --> の節（拡張）に分ける。<!-- llm: omit --> の節は捨てる。前の系列の名前は束に読み替える
function splitBlocks(body, file, sets) {
  const own = [], ext = {};
  let cur = null;
  for (const ln of body.split('\n')) {
    const m = ln.match(/^<!--\s*llm:\s*([\w-]+)\s*-->\s*$/);
    if (m) {
      if (m[1] === 'end') { if (cur === null) throw new Error(`${file}: <!-- llm: end --> without a block`); cur = null; continue; }
      if (cur !== null) throw new Error(`${file}: <!-- llm: ${m[1]} --> inside another block (close it with <!-- llm: end -->)`);
      if (m[1] !== 'omit' && !sets.includes(m[1]) && !LEGACY_SERIES[m[1]]) throw new Error(`${file}: <!-- llm: ${m[1]} --> names an unknown part set (known: ${sets.join(', ')}, or omit)`);
      cur = m[1];
      continue;
    }
    if (/<!--\s*llm:/.test(ln)) throw new Error(`${file}: malformed llm marker: ${ln}`);
    if (cur === null) own.push(ln); else if (cur !== 'omit') for (const k of sets.includes(cur) ? [cur] : LEGACY_SERIES[cur].filter((x) => sets.includes(x))) (ext[k] = ext[k] || []).push(ln);
  }
  // omit の節だけは、閉じずにファイルの終わりまで続いてよい（部品庫 2.1.0 の m-orbit の README は終わりの印がない。指示に入れないので害がない）
  if (cur !== null && cur !== 'omit') throw new Error(`${file}: <!-- llm: ${cur} --> is not closed (<!-- llm: end -->)`);
  return { own: own.join('\n'), ext: Object.fromEntries(Object.entries(ext).map(([k, v]) => [k, v.join('\n').trim()])) };
}
// 既定のカタログの要素のパーツ（特殊を含む）：[{fm, tier, set, body, ext, props, shape, rawProps}]。set は 'standard'・束の名前・'extra'
function components(cat, sets) {
  const lock = parseLock(read(LOCK_FILE));
  const out = [];
  for (const [name, c] of Object.entries(cat.manifest.components).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (c.kind !== 'element' || !c.tag) continue;
    const v = cat.parts[name];
    if (!v) throw new Error(`components2.lock.json: catalogue ${cat.version} has no version of ${name}`);
    const dir = resolveCatalogueContent(path, ROOT, lock, cat.lock2, cat.version, name, v);
    const file = `${name}@${v} (${path.relative(ROOT, dir).split(path.sep).join('/')}/README.md)`;
    if (!fs.existsSync(path.join(dir, 'README.md'))) throw new Error(`${file} is missing (npm run components:update)`);
    const [fm, body] = frontmatter(read(path.relative(ROOT, path.join(dir, 'README.md'))));
    const js = fs.existsSync(path.join(dir, 'index.js')) ? read(path.relative(ROOT, path.join(dir, 'index.js'))) : '';
    if (fm.name !== c.tag) throw new Error(`${file}: frontmatter name ${fm.name} is not ${c.tag}`);
    const set = c.tier === 'extra' ? 'extra' : c.tier === 'standard' ? STANDARD : c.set;
    const blocks = splitBlocks(body, file, sets);
    if (Object.keys(blocks.ext).length && set !== STANDARD) throw new Error(`${file}: <!-- llm: … --> extension blocks are only for standard parts (this one is ${c.tier})`);
    const cls = js ? classOf(js, fm.name) : null;
    out.push({ fm, set, build: c.build, body: blocks.own, ext: blocks.ext, props: propDocs(js), shape: cls && cls.shape, rawProps: (cls && cls.props) || {} });
  }
  return out;
}
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
// データの形の短い書き方（一覧の欄）と見本（詳しい節）
const SH = shapeApi();
// データの形の決まりの型（kit/shape.js の brief の conv）：どの部品でもこの型の欄は、一覧に名前だけ書く（指示の大きさ。無料のプランの 45 KB）。
// 決まりは tools/llm-guide/template(.ja).md の §3 の初めに書く（変えたらそこも）。違う型の欄（m-hist の label など）は今までどおり型を書く
const SHAPE_CONV = { label: 'str', tex: 'str', note: 'str', tone: 'str', step: 'int', at: 'num' };
// 組み立てが足す欄（形式 §6.2：build.fields の欄の描いた結果 texHtml・abcSvg など、と renderers）は AI が書かないので、データの形から除く
function withoutBuilt(schema, build) {
  if (!build || !build.fields || !schema) return schema;
  const s = JSON.parse(JSON.stringify(schema));
  const drop = (o, names) => {
    if (!o || !o.properties) return;
    for (const n of names) delete o.properties[n];
    if (Array.isArray(o.required)) o.required = o.required.filter((n) => !names.includes(n));
  };
  drop(s, ['renderers']);
  for (const [field, renderer] of Object.entries(build.fields)) {
    const segs = field.split('.');
    let o = s;
    for (const seg of segs.slice(0, -1)) {
      const name = seg.replace(/\[\]$/, '');
      o = o && o.properties && o.properties[name];
      if (o && seg.endsWith('[]')) o = o.items;
    }
    drop(o, renderedFieldNames(renderer, segs[segs.length - 1].replace(/\[\]$/, '')));
  }
  return s;
}
function shapeBrief(c, lang) {
  const sh = c.shape;
  if (!sh) return '';
  const ja = lang === 'ja';
  if (sh.text) return ja ? '要素の中の字（JSON ではない）' : 'text inside the element (not JSON)';
  if (sh.links) return ja ? '子の `<a href>`（JSON ではない）' : 'child `<a href>` links (not JSON)';
  if (!sh.schema) {
    const attrs = Object.entries(c.rawProps).filter(([, d]) => d && d.shape).map(([n, d]) => `${n}="${JSON.stringify(d.example ?? d.default)}"`);
    return (ja ? '属性だけ（JSON の子なし）' : 'attributes only (no JSON child)') + (attrs.length ? ': `' + attrs.join(' ') + '`' : '');
  }
  // note は {en, ja} か、1 つの言語の字（部品庫 v1.2.0 の m-tree など）
  const note = !sh.note ? '' : typeof sh.note === 'string' ? sh.note : sh.note[lang] || sh.note.en || sh.note.ja || '';
  return '`' + SH.brief(withoutBuilt(sh.schema, c.build), SHAPE_CONV) + '`' + (note ? ' — ' + note : '');
}
function shapeExample(c, lang) {
  const sh = c.shape;
  if (!sh || sh.example === undefined) return '';
  const ja = lang === 'ja';
  const ex = typeof sh.example === 'string' ? sh.example : JSON.stringify(sh.example);
  const where = sh.schema ? (ja ? 'データ（子の `<script type="application/json">`）の見本' : 'Data example (child `<script type="application/json">`)') : (ja ? '書き方の見本' : 'Example');
  return `${where}: \`${ex.replace(/\n/g, '⏎')}\``;
}
const TIMING = /秒数|（秒）/;
const TABLE_HEAD = { ja: '| 部品 | 内容 | steps | データの形 |\n|---|---|---|---|', en: '| component | what it shows | steps | data shape |\n|---|---|---|---|' };
const rowOf = (c, lang) => applyRowEdits(c.fm.name, `| \`<${c.fm.name}>\` | ${cell(c.fm.summary)} | ${cell(c.fm.steps)} | ${cell(shapeBrief(c, lang))} |`, lang);
// README の見出し（## 書き方 など）は、この部品の節（###）の下に下げる
const demote = (s) => s.replace(/^(#{1,4}) /gm, (_, h) => '#'.repeat(Math.min(6, h.length + 2)) + ' ');
function entryOf(c, lang, shown = new Set()) {
  const H = lang === 'ja' ? ['値', '型', '既定', '意味'] : ['prop', 'type', 'default', 'meaning'];
  let sup = false;
  // 秒で測る値（動きの速さ・ずれ）は表に載せない：既定のままで口述原稿に合う（§3 の前書きに書いてある）
  const rows = (c.fm.props || '').split(',').map((p) => p.trim()).filter(Boolean).filter((p) => !TIMING.test((c.props.get(p) || {}).doc || '')).map((p) => {
    const d = c.props.get(p) || { type: '', dflt: '', doc: '' };
    let doc = d.doc;
    if (!doc && AXIS[lang][p]) { doc = AXIS[lang][p] + ' *'; sup = true; }
    return `| \`${p}\` | ${d.type} | ${d.dflt && d.dflt !== 'undefined' ? '`' + cell(d.dflt) + '`' : ''} | ${cell(doc)} |`;
  });
  // README に書き方の囲み（```）があれば、データの形の見本の行は同じことなので出さない
  // 系列の見本（抜き出し）がその部品を使っていれば、それが見本になる（#99：大きさを抑える）
  const ex = /^```/m.test(c.body) || shown.has(c.fm.name) ? '' : shapeExample(c, lang);
  // README の「子の JSON：`{…}`。」の行は、一覧の「データの形」の欄と同じことなので、データの形があるときはコードを外し、後ろの文（あれば）だけ残す
  const body = c.shape && c.shape.schema ? c.body.replace(/^子の JSON：`[^`\n]*`[。.]?(?:（([^）\n]*)）。?)?[ \t]*(.*)$/gm, (_, paren, rest) => [paren ? `子の JSON の並び：${paren}。` : '', rest].filter(Boolean).join('')) : c.body;
  const details = (rows.length ? `| ${H.join(' | ')} |\n|---|---|---|---|\n${rows.join('\n')}\n\n` : '') + body;
  const entry = `### \`<${c.fm.name}>\`\n\n` + (ex ? ex + '\n\n' : '') + demote(stripRepoRefs(applyPackEdits(c.fm.name, details, lang)));
  return { entry: entry.trim(), sup };
}

// 部品の説明の中で、ほかの部品の名前を出す所（「比べるなら `m-compare`」など）を <!--part:m-x--> で囲む：その部品が組み立てに入らない
// （外した言いたいこと・選んでいない分野・無料版で読み込まない部品）とき、組み立て（kit/core/llm-pack-assemble.mjs の partSpans）が除く。
// 名前が括弧（…）の中なら括弧ごと、そうでなければその文（。まで。箇条書きの印は残す）を囲む
export function markRefs(text, self, known) {
  return text.split('\n').map((line) => {
    const spans = [];
    for (const m of line.matchAll(/(?<![\w<-])`?(m-[a-z0-9]+(?:-[a-z0-9]+)*)`?(?![\w-])/g)) {
      const t = m[1];
      if (t === self || !known.has(t)) continue;
      let a = -1, depth = 0;
      for (let i = m.index - 1; i >= 0; i--) { if (line[i] === '）') depth++; else if (line[i] === '（') { if (depth === 0) { a = i; break; } depth--; } }
      let b = -1; depth = 0;
      if (a >= 0) for (let i = m.index; i < line.length; i++) { if (line[i] === '（') depth++; else if (line[i] === '）') { if (depth === 0) { b = i + 1; break; } depth--; } }
      if (a >= 0 && b > 0) {
        // 括弧の中に、名前より前の文（。で終わる）があれば、それは残し、名前のある文から括弧の終わりの手前までを囲む
        const dot = line.lastIndexOf('。', m.index);
        const nx = line.indexOf('。', m.index), inner = nx > 0 && nx < b - 1;
        if (dot > a) spans.push([dot + 1, inner ? nx + 1 : b - 1, t]);
        else if (inner) spans.push([a + 1, nx + 1, t]);   // （`m-bars` と同じ。3 桁ごとにカンマ）→（3 桁ごとにカンマ）
        else spans.push([a, b, t]);
        continue;
      }
      const lead = (line.match(/^\s*(?:[-*] |\d+\. )?/) || [''])[0].length;
      // 表の行なら、その桁の中だけ（桁の区切り | を越えない）
      const cellA = line.startsWith('|') ? line.lastIndexOf(' | ', m.index) + 3 : lead;
      const cellB = line.startsWith('|') ? line.indexOf(' |', m.index) : line.length;
      let s0 = line.lastIndexOf('。', m.index); s0 = s0 < cellA ? cellA : s0 + 1;
      let e0 = line.indexOf('。', m.index); e0 = e0 < 0 || e0 >= cellB ? cellB : e0 + 1;
      spans.push([s0, e0, t]);
    }
    if (!spans.length) return line;
    // 重なる囲みは 1 つにまとめる（名前を合わせる）
    spans.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const [a, b, t] of spans) {
      const last = merged[merged.length - 1];
      if (last && a < last[1]) { last[1] = Math.max(last[1], b); if (!last[2].includes(t)) last[2].push(t); } else merged.push([a, b, [t]]);
    }
    let out = line;
    for (const [a, b, ts] of merged.reverse()) out = out.slice(0, a) + `<!--part:${ts.join(',')}-->` + out.slice(a, b) + '<!--/part-->' + out.slice(b);
    return out;
  }).join('\n');
}

// ---------------------------------------------------------------- 約束事（docs/contract.md）の箇条書き
function contractBullet(text, sec, prefix, file) {
  const m = text.match(new RegExp(`^## ${sec}\\. [^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  if (!m) throw new Error(`${file}: section §${sec} not found`);
  const bullet = m[1].split('\n').find((ln) => ln.startsWith('- ' + prefix));
  if (!bullet) throw new Error(`${file} §${sec}: no bullet starting with ${JSON.stringify(prefix)} (update tools/llm-guide/template)`);
  return bullet.slice(2).trim();
}

// ---------------------------------------------------------------- 組み立て
const GENERATED = (contract) => `<!-- generated by tools/make-llm-guide.mjs from tools/llm-guide/, docs/${contract} and vendor/components/*/README.md; do not edit by hand -->`;
const AI_HEAD = /^# (Instructions for the AI|AI への指示)\s*$/m;
// 最後の「頼みたいこと」（記入欄の付いた頼み方）。組み立てでは束の指示の後ろ、いちばん最後に付く
const REQ_HEAD = /^# (What I want|頼みたいこと)\s*$/m;
const KB = (s) => Buffer.byteLength(s, 'utf8') / 1024;
const PLACEHOLDER = /\{\{(?:SIZE|CATALOG|EXTENSIONS|WORKED|contract|GENERATED|SETS_LIST|PACK_VERSION|PURPOSES)/;
// 指示の版：材料（版の行を除く。英語と日本語の両方）の SHA-256 の先頭 8 字。指示の文章が変われば変わり、変わらなければ同じ（手で上げない）
const PACK_VERSION = '{{PACK_VERSION}}';

// スキルには貼り付け用の大きさの上限を掛けない。パーツの説明は同じ材料から束（セット）ごとに分ける：標準・束ごと（専門）と、特殊は README への道だけ
const skillTerms = (text) => Object.entries({ '部品': 'パーツ', '口述原稿': '台本', '段階': 'ステップ', 'デッキ': '教材', '頼む文': '指示', '注目の演出': '強調', '動く図': 'パーツ', '言いたいこと': '伝えたいこと', '学ぶ人': '学習者' }).reduce((s, [from, to]) => s.replaceAll(from, to), text);

const CLI_MINOR = JSON.parse(read('package.json')).version.split('.').slice(0, 2).join('.');
export const MAKE_SKILL_DIR = 'plugins/egatari/skills/make';

// Docs links pinned to the release tag (package.json version; the release step sets it, then re-runs gen).
export const docUrl = (name, anchor = '') => `https://github.com/egatari/egatari-studio/blob/v${JSON.parse(read('package.json')).version}/docs/${name}${anchor ? '#' + anchor : ''}`;
// {{DOC name#anchor}} in a source text becomes the pinned URL
const docLinks = (text) => text.replace(/\{\{DOC ([\w.-]+)(?:#(\S+?))?\}\}/g, (_, n, a) => docUrl(n, a));
// Hand-written skill text: <!-- generated: doc name#anchor -->…<!-- /generated: doc --> gets the pinned URL
export function studioDocs(text) {
  return text.replace(/(<!-- generated: doc ([\w.-]+)(?:#(\S+?))? -->)[^<]*(<!-- \/generated: doc -->)/g, (_, o, n, a, c) => o + docUrl(n, a) + c);
}

// Studio is hand-written. Only this marked version line belongs to the generator.
export function studioVersion(text, version) {
  const marker = /(?<=<!-- generated: instruction-version -->\n)\*\*指示の版：[a-f0-9]{8}\*\*(?=\n<!-- \/generated: instruction-version -->)/g;
  if ([...text.matchAll(marker)].length !== 1) throw new Error('studio needs exactly one marked instruction-version line');
  return text.replace(marker, `**指示の版：${version}**`);
}

export function skillFiles(data, lang = 'ja') {
  if (!['ja', 'en'].includes(lang)) throw new Error(`invalid skill language: ${lang}`);
  const files = {}, head = '<!-- generated; do not edit by hand -->\n';
  const sets = new Map([[STANDARD, membersOf(data.ja, STANDARD)], ...data.sets.map((s) => [s, membersOf(data.ja, s)]), ['extra', [...(data.extra || [])]]]);
  for (const set of sets.keys()) if (!/^[a-z][a-z0-9-]*$/.test(set)) throw new Error(`invalid skill part set: ${set}`);
  for (const language of ['ja', 'en']) {
    const ja = language === 'ja', D = data[language];
    const refDir = `references/parts/${ja ? '' : 'en/'}`;
    const pointer = (tag) => `### \`<${tag}>\`\n\n[README](${data.partsSrc}${tag.replace(/^m-/, '')}/README.md)`;
    for (const [set, tags] of sets) {
      const extra = set === 'extra';
      const entries = tags.sort().map((tag) => extra ? pointer(tag) : partSpans(D.components[tag].entry));
      const ext = extra ? [] : Object.values(D.components).filter((c) => c.ext?.[set]).map((c) => partSpans(c.ext[set]));
      const table = extra || !tags.length ? '' : D.tableHead + '\n' + tags.map((tag) => partSpans(D.components[tag].row)).join('\n') + '\n\n';
      files[`${MAKE_SKILL_DIR}/${refDir}${set}.md`] = skillTerms(head + `# ${ja ? set + ' のパーツ' : set + ' parts'}\n\n${ja ? '指示の版：' : 'Instruction version: '}${data.version}\n\n` + table + [...entries, ...ext].join('\n\n') + '\n').replace(/\bnode /g, '`node` ');
    }
    const links = [...sets.keys()].map((set) => `- [${set}](${refDir}${set}.md)`).join('\n');
    const common = partSpans(D.common
      .replace('{{CATALOG}}', ja ? 'パーツは上のセットごとの参照ファイルから、必要なものだけ読む。' : 'Read only the parts you need from the set references above.')
      .replace('{{PURPOSES}}', ja ? 'パーツの候補はセットごとの参照ファイルで選ぶ。' : 'Choose candidate parts from the set references.'));
    const book = splitStamp(read('docs', ja ? 'llm-book.ja.md' : 'llm-book.md')).body.trim();
    files[`${MAKE_SKILL_DIR}/references/${ja ? '' : 'en/'}book.md`] = skillTerms(head + docLinks(splitStamp(read('docs', ja ? 'llm-book-ref.ja.md' : 'llm-book-ref.md')).body.trim()) + '\n');
    const text = ja ? `---
name: make
description: Egatari Studio で、構成案から HTML の教材・ステップ・パーツ・台本を作る。「動きのあるスライドを作って」「Egatari にして」「教材を作って」で使う。Use for making HTML lessons, animated slides and scripts.
---

${head}
Always reply in the language the user writes in. Write slides and narration in the lesson's language.

# egatari:make：教材を作る

Egatari はオープンな教材の形式（[仕様](https://github.com/egatari/egatari-spec)）。Egatari Studio はその編集アプリ <https://studio.egatari.org/>。[English](SKILL.en.md)

**指示の版：${data.version}**

Studio でコピーした指示書の版と違えば、利用者に「新しいパーツがあります」（new parts are available）と知らせる。
Claude Code では \`/plugin update egatari@egatari\`。Codex では \`npx egatari@${CLI_MINOR}.x skills update\`。更新の道がない道具では案内を省き、\`egatari --version\` の版を利用者に伝える。
チャットでは Studio の『AI のスキルをダウンロード』で入れ直す。

## 進め方

まず材料・対象・長さ・言語・テーマを確かめ、構成案を見せる。各項目は見出し・伝えたいこと・おすすめのパーツと理由・結論の行・材料。数値を作らない。利用者が構成案とパーツを承認したら書く。話者は既定で 1 人、掛け合いは頼まれたときだけ。

構成案を見せたら、承認を得るまで止まる（ファイルを書かない）。続きは利用者の返事を受けてから（\`codex exec\` なら resume で）。

下の共通の書き方に従う。書き終えたら、ファイルを書けるかどうかに応じて「書き終えたら」の手順で渡す。修正依頼を受けたら、その指摘を直して返す。

## パーツを選ぶ

構成案のパーツは標準（standard）と専門（束ごと）から選ぶ。標準はいつも、専門は教材に合う束だけを読む。特殊（extra）は README への道だけを載せる：材料にその形がはっきり要るときだけ、その README を読んで使う。大きさの上限や無料・有料の絞り込みは貼り付ける指示書だけのもので、このスキルには掛けない。

${links}

${book}

## 音声を付ける

Studio の音声の板で付けてもらう（この PC で AI 音声を作る・録音・Google Colab）。egatari-studio が入っていれば、その studio スキルの手順で手元で付けられる。

## 書き終えたら

ファイルを書けるなら、新しいフォルダに \`deck.html\` と \`narration.md\` と、\`{"componentsCatalogue": "2"}\` だけの \`egatari.json\` を書く（新しい教材はパーツライブラリ 2 で組む。ここに出てくるパーツは 2 のもの。\`egatari.json\` がないと前の 1 のまま組まれ、2 だけのパーツが組み立てのエラーになる）。この場合は、下の R-output の囲みの代わりにファイルで渡す。\`egatari-studio:studio\` が使えれば、そのスキルへ進み、品質チェック・id の付与・組み立てを行い、Egatari ファイル（\`.ega.html\`）で仕上げる。使えなければ、Chrome か Edge で <https://studio.egatari.org/> を開き、開始画面か「ファイル」メニューの「フォルダで作業する…」（Work in a folder…）でそのフォルダを選んでもらう。Safari・Firefox では、2 つのファイルの内容を「新規作成…」→「AI の出力を貼り付ける」（New… → “Paste the AI’s output”）に貼り付けてもらう。

ファイルを書けなければ、Studio の「新規作成…」→「AI の出力を貼り付ける」に貼り付けられるように、下の R-output に従い、\`deck.html\` と \`narration.md\` の 2 つのコードの囲みを返す。

どちらの場合も、初稿にスライドの id を書かない（R-noids）。Studio か id を付ける道具が後で付ける。修正では今ある id を保つ。

頼まれていないファイル（README・説明の文書・補助のフォルダ）は作らない。作るのは deck.html・narration.md・egatari.json と、数値や図に要るときだけ scripts/・data/・figs/。

${common}
` : `---
name: make
description: Make HTML lessons, animated slides, steps, parts and scripts for Egatari Studio, starting from an outline. Use for “make animated slides”, “make this into Egatari” or “make a lesson”.
---

${head}
Always reply in the language the user writes in. Write slides and narration in the lesson's language.

# egatari:make: Make a lesson

Egatari is an open lesson format ([specification](https://github.com/egatari/egatari-spec)). Egatari Studio is its editor: <https://studio.egatari.org/>.

**Instruction version: ${data.version}**

If this differs from the version of the instructions copied in Studio, tell the user “new parts are available”.
In Claude Code, use \`/plugin update egatari@egatari\`. In Codex, use \`npx egatari@${CLI_MINOR}.x skills update\`. If a tool has no update path, leave out the instruction and tell the user the version from \`egatari --version\`.
In a chat AI, add it again with "Download the AI skill" in Studio.

## Workflow

First confirm the materials, audience, length, language and theme, and show an outline. Each item has a heading, what to convey, a recommended part and why, a conclusion line and materials. Never invent numbers. Write after the user approves the outline and parts. Use one speaker by default; write a dialogue only when asked.

After showing the outline, stop until the user approves it (write no files). Continue after the user's reply (with \`codex exec\`, by resuming the session).

Follow the shared writing rules below. When finished, use “When you finish” to deliver files or code blocks, according to your capabilities. For a fix request, fix the findings and return the result.

## Choose parts

Choose the parts for the outline from the standard parts and the specialized sets. Always read standard; read only the specialized sets that fit the lesson. Extra parts have README pointers only: read an extra part's README and use it only when the material clearly needs it. Size caps and free/paid filtering apply only to pasted instruction packs, not to this skill.

${links}

${book}

## Add audio

Ask the user to add audio in Studio's audio panel (make AI voice on this computer, record, or Google Colab). If egatari-studio is installed, follow its studio skill to add audio locally.

## When you finish

If you can write files, write \`deck.html\`, \`narration.md\` and an \`egatari.json\` containing only \`{"componentsCatalogue": "2"}\` into a new folder (new lessons are built with parts library 2, which the parts described here belong to; without \`egatari.json\` the folder builds with the older library 1, and parts only library 2 has stop the build). Deliver these files instead of the fenced blocks required by R-output below. If \`egatari-studio:studio\` is available, continue with that skill for quality checks, ids and building; it finishes with an Egatari file (\`.ega.html\`). Otherwise ask the user to open <https://studio.egatari.org/> in Chrome or Edge and select the folder using “Work in a folder…” (フォルダで作業する…) on the start screen or in the File menu. In Safari or Firefox, paste the contents of the two files into New… → “Paste the AI’s output” (新規作成… →「AI の出力を貼り付ける」).

If you cannot write files, return the two fenced blocks \`deck.html\` and \`narration.md\` following R-output below, ready to paste into Studio's New… → “Paste the AI’s output”.

In both cases, do not write slide ids in a first draft (R-noids). Studio or the ids tool adds them later. Preserve existing ids when fixing a lesson.

Do not create files that were not asked for (a README, explanatory documents, helper folders). Create only deck.html, narration.md and egatari.json, and scripts/, data/ and figs/ only when numbers or figures need them.

${common}
`;
    files[`${MAKE_SKILL_DIR}/${ja ? 'SKILL.md' : 'SKILL.en.md'}`] = skillTerms(text);
  }
  if (lang === 'en') files[`${MAKE_SKILL_DIR}/SKILL.md`] = files[`${MAKE_SKILL_DIR}/SKILL.en.md`];
  files['plugins/egatari/.claude-plugin/plugin.json'] = JSON.stringify({ name: 'egatari', version: JSON.parse(read('package.json')).version, description: 'Make Egatari lessons with the make skill.', skills: './skills/' }, null, 2) + '\n';
  return files;
}

// 戻り値：{files: {相対パス: 中身（i18n の印の行なし）}, sizes: {en|ja: {free, freeSets, paid, paidSets, paidPairs, paidAll}}（KB）, data, warnings}
//   opts.manifest：言いたいことの表だけを、この manifest から作る（試験用）。opts.tiers：段と束の一覧（新規作成 ④）を差し替える
export function generate(opts = {}) {
  const warnings = [];
  const cat = catalogue();
  const SETS = setsOf(cat.manifest);
  for (const s of SETS) if (!fs.existsSync(rel('tools', 'llm-guide', 'sets', s + '.md'))) throw new Error(`tools/llm-guide/sets/${s}.md is missing (the part set ${s} is in manifest-${cat.version}.json)`);
  const all = components(cat, SETS);
  const comps = all.filter((c) => c.set !== 'extra');
  // 言いたいこと：既定のカタログの manifest（あれば）か、決めた表（kit/core/purposes.mjs）。札に写らない id・形の合わない項目は知らせる
  const allParts = comps.map((c) => ({ tag: c.fm.name, set: c.set }));
  const manifest = opts.manifest !== undefined ? opts.manifest : cat.manifest;
  const { warnings: pw, unmapped, ...P } = purposesFrom(manifest, { vendored: allParts.map((c) => c.tag) });
  warnings.push(...pw);
  const src = `${cat.source}/blob/${cat.tag}/components/`;
  // 表（{{PURPOSES}}）は組み立てのときに作る（入っている束・外した言いたいことに合わせる。kit/core/llm-pack-assemble.mjs）
  const data = { sets: SETS, purposes: P, parts: allParts, extra: all.filter((c) => c.set === 'extra').map((c) => c.fm.name), partsSrc: src };
  // 束の見本が抜き出しで見せる部品（{{WORKED 名前 "見出し" 部品}}）
  const shownInWorked = new Set(SETS.flatMap((x) => [...read('tools', 'llm-guide', 'sets', x + '.md').matchAll(/\{\{WORKED \w+ "[^"]+" (m-[a-z]+(?:-[a-z]+)*)\}\}/g)].map((m) => m[1])));
  const pre = {};
  for (const lang of ['en', 'ja']) {
    const ja = lang === 'ja';
    const contractFile = ja ? 'docs/contract.ja.md' : 'docs/contract.md';
    const contract = read(contractFile);
    // 系列の見本は抜き出し（{{WORKED 名前 "見出し" 部品}}）：その部品を使うスライドとその口述原稿の節だけ。骨組みと表紙は §6 の共通の見本と同じなので載せない
    // （見本のファイルそのものは、npm test がそのまま組んで検査する）
    const excerpt = (name, title, tag) => {
      const deck = read('tools', 'llm-guide', 'worked', name, 'deck.html'), narr = read('tools', 'llm-guide', 'worked', name, 'narration.md');
      const secs = [...deck.matchAll(/<section class="slide[^"]*">[\s\S]*?<\/section>/g)].map((m) => m[0]).filter((s) => s.includes('<' + tag));
      if (!secs.length) throw new Error(`tools/llm-guide/worked/${name}/deck.html: no slide uses <${tag}>`);
      const heads = secs.map((s) => (s.match(/<h2>([^<]*)<\/h2>/) || [])[1]);
      const nsecs = narr.split(/\n(?=## )/).filter((x) => heads.includes(x.match(/^## (.*)$/m)?.[1]?.trim()));
      if (nsecs.length !== secs.length) throw new Error(`tools/llm-guide/worked/${name}/narration.md: no section for each slide with <${tag}>`);
      const note = ja ? '（その部品を使うスライドだけ。`deck.html` の骨組みは §6 の見本と同じ）' : '(only the slides with the part; the rest of `deck.html` is as in §6)';
      // 部品を外した組み立てでは、この見本ごと除く（<!--part:…-->）
      return `<!--part:${tag}-->### ${title}\n\n${note}\n\n\`\`\`deck.html\n${secs.join('\n\n')}\n\`\`\`\n\n\`\`\`narration.md\n${nsecs.map((x) => x.trim()).join('\n\n')}\n\`\`\`<!--/part-->`;
    };
    // 見本の全体：部品を使うスライドとその口述原稿の節を <!--part:m-x--> で囲む（その部品を外した組み立てでは、そのスライドがなくなる）
    const worked = (name, title) => {
      let deck = read('tools', 'llm-guide', 'worked', name, 'deck.html').trim(), narr = read('tools', 'llm-guide', 'worked', name, 'narration.md').trim();
      const heads = [];
      deck = deck.replace(/\n*(<section class="slide[^"]*">[\s\S]*?<\/section>)/g, (m, sec) => {
        const tags = [...new Set([...sec.matchAll(/<(m-[a-z]+(?:-[a-z]+)*)[\s>]/g)].map((x) => x[1]))];
        if (!tags.length) return m;
        heads.push([(sec.match(/<h[12]>([^<]*)<\/h[12]>/) || [])[1], tags]);
        return `<!--part:${tags.join(',')}-->${m}<!--/part-->`;
      });
      for (const [h, tags] of heads) {
        const re = new RegExp(`\\n*## ${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?(?=\\n## |$)`);
        if (!re.test(narr)) throw new Error(`tools/llm-guide/worked/${name}/narration.md: no section "${h}"`);
        narr = narr.replace(re, (m) => `<!--part:${tags.join(',')}-->${m}<!--/part-->`);
      }
      return `### ${title}\n\n\`\`\`deck.html\n${deck}\n\`\`\`\n\n\`\`\`narration.md\n${narr}\n\`\`\``;
    };
    const fill = (tpl) => tpl
      .replace(/\{\{contract §(\d+) "([^"]+)"\}\}/g, (_, sec, prefix) => contractBullet(contract, sec, prefix, contractFile))
      .replace(/\{\{WORKED (\w+) "([^"]+)"(?: (m-[a-z]+(?:-[a-z]+)*))?\}\}/g, (_, n, t, tag) => (tag ? excerpt(n, t, tag) : worked(n, t)));
    // 型紙も英語と日本語の組（1 行目の印は写さない）
    const full = fill(splitStamp(read('tools', 'llm-guide', ja ? 'template.ja.md' : 'template.md')).body)
      .replace('{{GENERATED}}', GENERATED(path.basename(contractFile)));
    const i = full.search(AI_HEAD);
    if (i < 0) throw new Error(`tools/llm-guide/template${ja ? '.ja' : ''}.md: no "# ${ja ? 'AI への指示' : 'Instructions for the AI'}" heading`);
    pre[lang] = full.slice(0, i).replace(/\n{3,}/g, '\n\n');
    const j = full.search(REQ_HEAD);
    if (j < i) throw new Error(`tools/llm-guide/template${ja ? '.ja' : ''}.md: no "# ${ja ? '頼みたいこと' : 'What I want'}" heading after the instructions`);
    const D = {
      common: full.slice(i, j).trim(), request: full.slice(j).trim(), sets: {}, components: {}, tableHead: TABLE_HEAD[lang],
      supNote: ja ? '（* はこの指示が補った説明）' : '(* = description added by this guide)',
      // 無料のプランで一覧の 1 行だけの部品（kit/core/llm-pack-assemble.mjs の briefParts）
      briefNote: ja ? '下に説明の節がない部品は、表の「データの形」のとおりに子の JSON か属性を書き、ほかの属性は既定のままにする。' : 'For a component without a section below, write the child JSON or attributes as its “data shape” column says and leave the other attributes at their defaults.',
      extHead: ja ? '### `<{name}>`：この束の拡張（部品の説明は §3）' : '### `<{name}>`: extension for this part set (the component is described in §3)',
    };
    if (!D.common.includes('{{CATALOG}}')) throw new Error(`template${ja ? '.ja' : ''}.md: no {{CATALOG}}`);
    const known = new Set(comps.map((c) => c.fm.name));
    for (const c of comps) {
      const e = entryOf(c, lang, shownInWorked);
      const ext = Object.fromEntries(Object.entries(c.ext).map(([s, x]) => [s, markRefs(demote(stripRepoRefs(x)), c.fm.name, known)]));
      D.components[c.fm.name] = { set: c.set, row: markRefs(rowOf(c, lang), c.fm.name, known), entry: markRefs(e.entry, c.fm.name, known), ...(e.sup ? { sup: true } : {}), ...(Object.keys(ext).length ? { ext } : {}) };
    }
    for (const s of SETS) {
      const f = `tools/llm-guide/sets/${s}${ja ? '.ja' : ''}.md`;
      if (!fs.existsSync(rel(f))) throw new Error(`${f} is missing`);
      const text = fill(splitStamp(read(f)).body).trim();
      if (!text.includes('{{CATALOG}}')) throw new Error(`${f}: no {{CATALOG}}`);
      D.sets[s] = text;
    }
    data[lang] = D;
  }
  for (const lang of ['en', 'ja']) if (!data[lang].common.includes(PACK_VERSION)) throw new Error(`template${lang === 'ja' ? '.ja' : ''}.md: no ${PACK_VERSION} line`);
  data.version = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 8);
  for (const lang of ['en', 'ja']) data[lang].common = data[lang].common.replace(PACK_VERSION, data.version);
  // 段と束（新規作成 ④ のパーツの一覧。handoff/parts-tiers-2026-10-27.md §1・§2）：パーツライブラリ 2.0 の既定のカタログの manifest
  // （components2.lock.json の default → vendor/components-2/manifest-<版>.json）の tier・set・purposes と、伝えたいことの名前。
  // 指示の文章ではないので、指示の版（data.version）には入れない
  data.tiers = opts.tiers !== undefined ? opts.tiers : tiersFrom(cat);

  const files = {};
  files[DATA_FILE] = '// generated by tools/make-llm-guide.mjs from tools/llm-guide/, docs/contract*.md and vendor/components/*/README.md; do not edit by hand\n'
    + '// AI への指示の材料。組み立ては kit/core/llm-pack.mjs（buildPack）\n'
    + `export const PACK = ${JSON.stringify(data, null, 1)};\n`;
  // 大きさ（KB）：無料のプランの標準すべて・標準＋1 つの束と、有料のプランの標準すべて・標準＋2 つの束（どの組も）・すべての束（docs が見せる指示の全体）
  const sizes = {};
  const PAIRS = pairsOf(SETS);
  for (const lang of ['en', 'ja']) {
    const kb = (sets, plan, short = false) => KB(assemble(data, { sets, lang, plan, short }));
    // 無料のプラン：新規作成とコマンド（kit/llm-pack.mjs）が写すのと同じ、目安に収めた指示（llm-pack-assemble.mjs の fitPack：越えたら中核の 4 つを短く、
    // それでも越えれば専門のパーツを外す）。目安は 45 KB と貼り付けの長さ 31,000 の小さいほう（fitSize）。freeFit は束ごとの {short, dropped}。
    // 大きさ（KB）と貼り付けの長さ（freePaste…）は、収めた指示そのものを測る
    const textOf = (tags, short) => assemble(data, { ...packOptsOf(data, tags, 'free', { short }), lang });
    const fitted = (sets) => {
      const f = fitPack(data, [...membersOf(data[lang], STANDARD), ...sets.flatMap((s) => membersOf(data[lang], s))], 'free', { sizeOf: (tags, short) => fitSize(textOf(tags, short), 'free'), capBytes: LIMITS.free * 1024 });
      const text = textOf(f.tags, f.short);
      return { ...f, kb: Buffer.byteLength(text, 'utf8') / 1024, paste: pasteUnits(text) };
    };
    const std = fitted([]);
    const fits = Object.fromEntries(SETS.map((s) => [s, fitted([s])]));
    sizes[lang] = {
      free: std.kb, freePaste: std.paste, freeStandardShort: std.short || std.dropped.length > 0,
      freeSets: Object.fromEntries(SETS.map((s) => [s, fits[s].kb])), freeSetsPaste: Object.fromEntries(SETS.map((s) => [s, fits[s].paste])), freeFit: Object.fromEntries(SETS.map((s) => [s, { short: fits[s].short, dropped: fits[s].dropped }])),
      freeShort: SETS.filter((s) => fits[s].short),
      paid: kb([], 'paid'), paidSets: Object.fromEntries(SETS.map((s) => [s, kb([s], 'paid')])),
      paidPairs: Object.fromEntries(PAIRS.map((p) => [p.join('+'), kb(p, 'paid')])), paidAll: kb('all', 'paid'),
    };
  }
  const f1 = (x) => x.toFixed(1) + ' KB';
  for (const lang of ['en', 'ja']) {
    const ja = lang === 'ja';
    // docs は有料のプランの指示の全体（kit/llm-pack.mjs --sets all --plan paid と同じ）：共通の本体と頼みたいこと、束ごとの部分。どの部品も説明がある
    const list = SETS.map((s) => {
      const names = membersOf(data[lang], s).map((n) => '`' + n + '`').join(ja ? '・' : ', ');
      return ja ? `[${s}](llm-parts/${s}.ja.md)（${names}）` : `[${s}](llm-parts/${s}.md) (${names})`;
    }).join(ja ? '、' : '; ');
    const z = sizes[lang];
    const core = FREE_CORE.map((t) => '`' + t + '`').join(ja ? '・' : ', ');
    // 無料のプランの行は貼り付けの長さ（UTF-16 の単位の数＋改行の数）とその上限も。有料のプランはファイルで渡せるので —
    const n0 = (n) => n.toLocaleString('en-US');
    const rows = ja
      ? [[`無料のプラン：標準のパーツすべて（${core} のほかは一覧の 1 行だけ）`, z.free, LIMITS.free, z.freePaste], ...SETS.map((s) => [`無料のプラン：標準＋${s}${z.freeShort.includes(s) ? '（中核の 4 つも一覧の 1 行だけ' + (z.freeFit[s].dropped.length ? `、${z.freeFit[s].dropped.join('・')} を外す` : '') + '）' : ''}`, z.freeSets[s], LIMITS.free, z.freeSetsPaste[s]]), ['有料のプラン：標準のパーツすべて', z.paid, LIMITS.paid], [`有料のプラン：すべての束（このファイルとすべての束の指示）${z.paidAll > LIMITS.paid ? '。上限を越えても知らせるだけ' : ''}`, z.paidAll, LIMITS.paid]]
      : [[`Free plan: every standard part (only one catalogue line each, except ${core})`, z.free, LIMITS.free, z.freePaste], ...SETS.map((s) => [`Free plan: standard + ${s}${z.freeShort.includes(s) ? ' (the core four shortened too' + (z.freeFit[s].dropped.length ? `; ${z.freeFit[s].dropped.join(', ')} left out` : '') + ')' : ''}`, z.freeSets[s], LIMITS.free, z.freeSetsPaste[s]]), ['Paid plan: every standard part', z.paid, LIMITS.paid], [`Paid plan: every part set (this file and every set pack)${z.paidAll > LIMITS.paid ? '; over the cap it is a warning only' : ''}`, z.paidAll, LIMITS.paid]];
    const table = (ja ? '| 指示 | 大きさ | 上限 | 貼り付けの長さ | 上限 |\n|---|---:|---:|---:|---:|\n' : '| Pack | Size | Cap | Paste length | Cap |\n|---|---:|---:|---:|---:|\n')
      + rows.map(([w, kb, cap, paste]) => `| ${w} | ${f1(kb)} | ${cap} KB | ${paste === undefined ? '—' : n0(paste)} | ${paste === undefined ? '—' : n0(LIMITS.paste)} |`).join('\n');
    const preamble = pre[lang].replace('{{SIZE_TABLE}}', table).replace('{{SETS_LIST}}', list);
    files[commonFile(lang)] = preamble + commonOf(data, lang, { sets: [], plan: 'paid' }) + '\n\n' + requestOf(data, lang) + '\n';
    for (const s of SETS) {
      files[partFile(s, lang)] = `<!-- generated by tools/make-llm-guide.mjs (part set ${s}, full pack; paste it after ${path.basename(commonFile(lang))}); do not edit by hand -->\n` + partOf(data, s, lang, { sets: SETS }) + '\n';
    }
  }
  Object.assign(files, skillFiles(data, opts.skillLang));
  files['kit/instruction-version.json'] = JSON.stringify({ instruction: data.version }, null, 2) + '\n';   // egatari doctor が、入れたスキルの指示の版と比べる
  files['skills/studio/SKILL.md'] = studioDocs(studioVersion(read('skills/studio/SKILL.md'), data.version));
  for (const [f, text] of Object.entries(files)) if (f !== DATA_FILE && PLACEHOLDER.test(text)) throw new Error(`unreplaced placeholder in ${f}: ${text.match(PLACEHOLDER)[0]}`);
  for (const [f, text] of Object.entries(files)) if (f !== DATA_FILE && /<!--\/?part/.test(text)) throw new Error(`a <!--part:…--> marker is left in ${f} (unbalanced in tools/llm-guide/)`);
  return { files, sizes, data, warnings };
}

// Deterministic ZIP (stored entries, UTF-8 names, 1980-01-01). No dependencies.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
export function makeSkillZip(files) {
  const entries = Object.entries(files).filter(([f]) => f.startsWith(MAKE_SKILL_DIR + '/')).sort(([a], [b]) => a.localeCompare(b));
  const local = [], central = [];
  let offset = 0, centralSize = 0;
  for (const [file, text] of entries) {
    const name = Buffer.from('make/' + file.slice(MAKE_SKILL_DIR.length + 1));
    const bytes = Buffer.from(text), crc = crc32(bytes);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4); // version needed
    h.writeUInt16LE(0x800, 6); // UTF-8
    h.writeUInt16LE(33, 12); // DOS date: 1980-01-01
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(bytes.length, 18);
    h.writeUInt32LE(bytes.length, 22);
    h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4); // version made by
    h.copy(c, 6, 4, 30); // shared fields: version through extra length
    c.writeUInt32LE(offset, 42);
    local.push(h, name, bytes);
    central.push(c, name);
    offset += h.length + name.length + bytes.length;
    centralSize += c.length + name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
export function writeMakeSkillZip(out, files = generate().files) {
  fs.mkdirSync(out, { recursive: true });
  const dest = path.join(out, 'egatari-make-skill.zip');
  fs.writeFileSync(dest, makeSkillZip(files));
  return dest;
}

// 大きさの検査：[{lang, what, plan, sets, kb, max, level: 'ok'|'warn'|'fail'}]（plan・sets：どの指示か。上限を越えたときに組み直して中を見せる）
//   無料のプラン：標準すべて（束なし）は LIMITS.fail を越えれば失敗・LIMITS.warn を越えれば警告。標準＋1 つの束は LIMITS.free を越えれば知らせるだけ（over。
//   新規作成のメーターが外す候補を出す）。有料のプラン：標準＋2 つの束のどの組も LIMITS.paid まで（失敗）、すべての束（いちばん大きいとき）は越えれば知らせるだけ
export function sizeReport(sizes) {
  const out = [];
  for (const [lang, z] of Object.entries(sizes)) {
    // 標準すべては、短くも外しもせずに収まること（越えて短くしたら失敗）
    // 貼り付けの長さ（paste）も無料のプランの上限（LIMITS.paste）。標準すべてが越えれば失敗（収めるために短くしても失敗）
    const pasteOver = (n) => n !== undefined && n > LIMITS.paste;
    out.push({ lang, what: 'free standard', plan: 'free', sets: [], kb: z.free, paste: z.freePaste, max: LIMITS.fail, level: z.free > LIMITS.fail || pasteOver(z.freePaste) || z.freeStandardShort ? 'fail' : z.free > LIMITS.warn ? 'warn' : 'ok' });
    for (const [s, kb] of Object.entries(z.freeSets)) { const paste = (z.freeSetsPaste || {})[s]; out.push({ lang, what: 'free standard+' + s, plan: 'free', sets: [s], freeSet: true, short: (z.freeShort || []).includes(s), dropped: ((z.freeFit || {})[s] || {}).dropped || [], kb, paste, max: LIMITS.free, level: kb > LIMITS.free || pasteOver(paste) ? 'over' : 'ok' }); }
    out.push({ lang, what: 'paid standard', plan: 'paid', sets: [], kb: z.paid, max: LIMITS.paid, level: z.paid > LIMITS.paid ? 'fail' : 'ok' });
    for (const [p, kb] of Object.entries(z.paidPairs)) out.push({ lang, what: 'paid standard+' + p, plan: 'paid', sets: p.split('+'), paidPair: true, kb, max: LIMITS.paid, level: kb > LIMITS.paid ? 'fail' : 'ok' });
    out.push({ lang, what: 'paid every set', plan: 'paid', sets: 'all', worst: true, kb: z.paidAll, max: LIMITS.paid, level: z.paidAll > LIMITS.paid ? 'warn' : 'ok' });
  }
  return out;
}
// 指示の中の大きい節：見出し（# ・## ・### 。コードの囲みの中の行は見出しにしない）で分け、バイト数の大きい順に n 個
export function largestSections(text, n = 3) {
  const secs = [];
  let cur = { head: '(before the first heading)', bytes: 0 }, fence = null;
  for (const ln of String(text).split('\n')) {
    const f = ln.match(/^(`{3,}|~{3,})/);
    if (f) { if (!fence) fence = f[1]; else if (ln.startsWith(fence) && !ln.slice(fence.length).trim()) fence = null; }
    if (!fence && !f && /^#{1,3} \S/.test(ln)) { if (cur.bytes) secs.push(cur); cur = { head: ln.trim(), bytes: 0 }; }
    cur.bytes += Buffer.byteLength(ln, 'utf8') + 1;
  }
  secs.push(cur);
  return secs.sort((a, b) => b.bytes - a.bytes).slice(0, n);
}
// 上限を越えた指示の知らせ：どの指示か（プラン・言語・束）、何バイト越えたか、大きい節 3 つ
export function overMessage(r, data) {
  const text = assemble(data, { sets: r.sets, lang: r.lang, plan: r.plan, short: !!r.short });
  const bytes = Buffer.byteLength(text, 'utf8'), over = bytes - r.max * 1024;
  const top = largestSections(text).map((x) => `${x.head} (${x.bytes} B)`).join('; ');
  const sets = r.sets === 'all' ? 'every set' : r.sets.length ? r.sets.join('+') : '(none)';
  return `pack over the cap: plan ${r.plan}, lang ${r.lang}, part sets ${sets}: ${bytes} B, ${over} B over ${r.max} KB (${r.max * 1024} B). Largest sections: ${top}`;
}

// 1 行目の i18n の印は残し、それより後ろを比べる・書く
function current(file) { return fs.existsSync(rel(file)) ? fs.readFileSync(rel(file), 'utf8') : null; }
const bodyOf = (text) => splitStamp(text).body;
// 前の形の指示（全体版・core 版）と、今の束にない部分のファイル（前の系列の docs/llm-parts/academic.md など）：作り直すと消す（--check では古いもの）
function leftovers(files, sets) {
  const out = ['docs/authoring-with-llms.core.md', 'docs/authoring-with-llms.core.ja.md'].filter((f) => fs.existsSync(rel(f)));
  const dir = rel('docs', 'llm-parts');
  if (fs.existsSync(dir)) for (const n of fs.readdirSync(dir)) { const s = n.replace(/(\.ja)?\.md$/, ''); if (!sets.includes(s) || !/\.md$/.test(n)) out.push('docs/llm-parts/' + n); }
  for (const dir of ['skills/make', 'skills/parts', 'skills/video']) if (fs.existsSync(rel(dir))) out.push(dir);
  const walk = (dir) => {
    if (!fs.existsSync(rel(dir))) return;
    for (const e of fs.readdirSync(rel(dir), { withFileTypes: true })) {
      const f = dir + '/' + e.name;
      if (e.isDirectory()) walk(f);
      else if (!Object.hasOwn(files, f)) out.push(f);
    }
  };
  walk('plugins/egatari');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const zi = process.argv.indexOf('--zip');
  if (zi >= 0) {
    if (!process.argv[zi + 1] || process.argv[zi + 1].startsWith('--')) throw new Error('--zip requires an output directory');
    const li = process.argv.indexOf('--lang');
    const lang = li < 0 ? 'ja' : process.argv[li + 1];
    if (!['ja', 'en'].includes(lang)) throw new Error('--lang requires ja or en');
    console.log(writeMakeSkillZip(process.argv[zi + 1], generate({ skillLang: lang }).files));
    process.exit(0);
  }
  const check = process.argv.includes('--check');
  const { files, sizes, warnings, data } = generate();
  for (const w of warnings) console.warn('warning: ' + w);
  let stale = 0;
  fs.mkdirSync(rel('docs', 'llm-parts'), { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    const now = current(file);
    const kept = now ? splitStamp(now).stamp : null;
    const next = (kept ? `<!-- i18n: pair=${kept.pair} sha256=${kept.hash} -->\n` : '') + text;
    if (check) {
      if (now === null || bodyOf(now).replace(/\r\n/g, '\n') !== text) { stale++; console.error(`stale: ${file} (run: node tools/make-llm-guide.mjs)`); }
      else console.log(`ok ${file} (${KB(text).toFixed(1)} KB)`);
    } else if (now !== next) {
      fs.mkdirSync(path.dirname(rel(file)), { recursive: true });
      fs.writeFileSync(rel(file), next);
      console.log(`wrote ${file} (${KB(text).toFixed(1)} KB)`);
    } else console.log(`unchanged ${file}`);
  }
  for (const f of leftovers(files, data.sets)) {
    if (check) { stale++; console.error(`stale: ${f} should not exist (run: node tools/make-llm-guide.mjs)`); }
    else { fs.rmSync(rel(f), { recursive: true, force: true }); console.log(`removed ${f}`); }
  }
  let fail = 0;
  // 有料のプランの 2 つの束の組はどれも確かめ、越えたものは全部出す。越えていなければ、言語ごとにいちばん大きい組だけを出す
  const shownPaid = Object.fromEntries(Object.entries(sizes).map(([lang, z]) => [lang, 'paid standard+' + largestPair(z.paidPairs)[0]]));
  for (const r of sizeReport(sizes)) {
    const line = `size ${r.lang} ${r.what}: ${r.kb.toFixed(1)} KB${r.paste !== undefined ? `, paste length ${r.paste} (cap ${LIMITS.paste})` : ''}${r.paidPair ? ` (largest pair; cap ${r.max} KB)` : r.worst ? ` (every set at once on the paid plan; cap ${r.max} KB, a warning only, never a failure)` : r.freeSet ? ` (fitted to ${r.max} KB and ${LIMITS.paste} paste length as New… and kit/llm-pack.mjs copy it${r.short ? ': the core four shortened too' : ''}${r.dropped.length ? `; left out ${r.dropped.join(', ')}` : ''})` : ''}`;
    if (r.paidPair && r.level !== 'fail' && r.what !== shownPaid[r.lang]) continue;
    if (r.level === 'fail') { fail++; console.error(`${line} — over the limit (${r.max} KB${r.paste !== undefined ? `, paste length ${LIMITS.paste}` : ''})`); console.error('  ' + overMessage(r, data)); }
    else if (r.level === 'warn' && r.worst) { console.warn(`warning: ${line} — over ${r.max} KB`); console.warn('  ' + overMessage(r, data)); }
    else if (r.level === 'warn') console.warn(`warning: ${line} — over the ${LIMITS.warn} KB target`);
    else if (r.level === 'over') console.log(`${line} — over ${r.max} KB or ${LIMITS.paste} paste length`);
    else console.log(line);
  }
  if (check && (stale || fail)) process.exit(1);
  if (!check && fail) process.exit(1);
  if (!check) console.log('after comparing the English and Japanese files: npm run i18n -- --stamp docs/authoring-with-llms.ja.md ' + data.sets.map((s) => partFile(s, 'ja')).join(' '));
}
