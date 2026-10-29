// チャットの AI に教材を書かせる指示（AI instruction pack）の材料と docs を作る。手で直さない
//   node tools/make-llm-guide.mjs            書く：kit/core/llm-pack-data.mjs（組み立ての材料）と、
//                                            docs/authoring-with-llms(.ja).md（共通の本体）・docs/llm-parts/<系列>(.ja).md（系列ごとの部分）
//   node tools/make-llm-guide.mjs --check    今のファイルが作り直したものと同じか・大きさ（npm test。違えば・大きすぎれば終了コード 1）
// 組み立ては kit/core/llm-pack-assemble.mjs の assemble（編集アプリ・kit/llm-pack.mjs・修正依頼と同じ関数）。docs はその出力そのもの
//
// 材料（どれかを直したら作り直す）：
//   tools/llm-guide/template.md・template.ja.md   共通の本体（英語が正本）。{{…}} を下の中身で置き換える
//   tools/llm-guide/series/<系列>.md・.ja.md      系列ごとの部分。{{CATALOG}}（その系列の部品）・{{EXTENSIONS}}（共通の部品のその系列向けの節）・{{WORKED …}}
//   docs/contract.md・contract.ja.md              {{contract §N "頭の字"}}：その節の箇条書きのうち、その字で始まる 1 つ（見つからなければ失敗）
//   vendor/components/<名前>/<版>/README.md・index.js  部品庫の写しの既定の版（components.lock.json）。frontmatter の series（common か系列の名前。ないと失敗）・name・summary・steps と、
//                                                 props の型・既定値・説明（static props）・データの形（static shape）・README の本文。
//                                                 本文の <!-- llm: <系列> --> … <!-- llm: end --> はその系列の部分に「拡張」として（共通の部品だけ）、
//                                                 <!-- llm: omit --> … <!-- llm: end --> は指示に入れない（開発者向けの注意など）
//   vendor/components/manifest.json（あれば）       {{PURPOSES}}：言いたいこと → パーツ → ステップの表。全パーツの一覧を兼ねる（写した既定の版の部品だけを出し、
//                                                 部品がまだない言いたいことは「近い部品か HTML・インラインの SVG」。版を固定した URL 付き）。
//                                                 manifest に purposes がなければ kit/core/purposes.mjs の FALLBACK（parts-map の 10）。どちらを使ったかは材料の purposes.source
//                                                 TODO(#99, components v1.2.0)：m-curves（学術）と m-quad（ビジネス）を本体（series: common）へ移すのは部品庫 v1.2.0 で。
//                                                 移ったら一覧と表はそのまま正しくなる（系列は frontmatter から読む）。系列の指示の文（tools/llm-guide/series/academic*.md・business*.md）の見直しを忘れない
//   tools/llm-guide/worked/<名前>/                {{WORKED 名前 "見出し"}}：見本の deck.html と narration.md（npm test が組んで検査する）
// 大きさ（--check。sizeReport）：無料版の共通 + 系列 1 つは 35 KB を超えれば警告・40 KB を超えれば失敗、2 つの組は 50 KB、有料版は 120 KB（PACK_CAP_KB）
// 1 行目の i18n の印（tools/i18n-pairs.mjs）は残す。作り直して中身が変わったら、両方を見比べて npm run i18n -- --stamp で印を付け直す
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStamp } from './i18n-pairs.mjs';
import { vendorComponents } from './vendor-components.mjs';
import { assemble, commonOf, partOf, membersOf, requestOf, PACK_CAP_KB, planData, paidOnly } from '../kit/core/llm-pack-assemble.mjs';
import { purposesFrom, toolsFrom } from '../kit/core/purposes.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (...p) => path.join(ROOT, ...p);
const read = (...p) => fs.readFileSync(rel(...p), 'utf8').replace(/\r\n/g, '\n');
const GUIDE = rel('tools', 'llm-guide');
export const SERIES = ['academic', 'business', 'kokugo', 'english', 'info', 'social', 'music'];
export const DATA_FILE = 'kit/core/llm-pack-data.mjs';
export const commonFile = (lang) => (lang === 'ja' ? 'docs/authoring-with-llms.ja.md' : 'docs/authoring-with-llms.md');
export const partFile = (s, lang) => `docs/llm-parts/${s}${lang === 'ja' ? '.ja' : ''}.md`;
// KB（1024 バイト）。fail・two・paid はお使いの AI ごとの上限（kit/core/llm-pack-assemble.mjs の PACK_CAP_KB）：
// fail は無料版の共通の本体＋1 つの分野、two は無料版の共通の本体＋2 つの分野（どの組でも。無料版で選べるのは 2 つまで）、paid は有料版。試験 tools/test-new-deck.mjs が使う
export const LIMITS = { warn: 35, fail: PACK_CAP_KB.free.one, two: PACK_CAP_KB.free.two, paid: PACK_CAP_KB.paid };
// 2 つの分野の組（SERIES の順）。'a+b' の名前で大きさを持つ
export const PAIRS = SERIES.flatMap((a, i) => SERIES.slice(i + 1).map((b) => [a, b]));
// いちばん大きい組：[名前, KB]
export const largestPair = (pairs) => Object.entries(pairs).reduce((m, x) => (!m || x[1] > m[1] ? x : m), null);

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
  return cleanReadme(body).split('\n').filter((ln) => !/demo\.html|examples\/|tools\/|motion-components スキル/.test(ln)).join('\n')
    .replace(/\n?（motion-slides スキル §\d+「[^」]*」）/g, '').replace(/\n{3,}/g, '\n\n').trim()
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
// 部品の README の言い方が、この指示のほかの決まりとぶつかるとき、指示の側で言い換える（部品庫の README は変えない）。
// find が README にないときは失敗させる（部品庫が直ったら、この言い換えも要らないか見直す）
const PACK_EDITS = {
  // 積み上げ棒の描き方（色の満ち方・名前の置き場所）は AI の書き方に関わらないので短く（大きさを抑える）
  'm-bars': [
    { find: '下の系列から順に色が満ちながら棒が合計まで伸び、合計を棒の端に（`unit` 付き）、それぞれの値を区切りの中に単位なしで書く（区切りが字より小さければ書かない）。系列の名前は、縦棒なら最後の組の棒の右、横棒なら最初の組の棒の上に、区切りの真ん中にそろえて書く。軸の上限は合計から決める。組の `tone` は合計の数字の色になる（区切りの色は系列の色のまま）。',
      ja: '合計を棒の端に、それぞれの値を区切りの中に書く。軸の上限は合計から決まる。組の `tone` は合計の数字の色。', en: '合計を棒の端に、それぞれの値を区切りの中に書く。軸の上限は合計から決まる。組の `tone` は合計の数字の色。' },
  ],
  // m-flow の前の色の経緯の言い換えは、部品庫 v1.13.0 が README から消したので要らなくなった
  // 部品の中の作り（測り方・読み込み）は AI の書き方に関わらないので除く（大きさを抑える。#99）。m-kobun の札の説明は部品庫 v1.9.1 で llm: omit に移った
  'm-gendai': [
    { find: '線と枠は字の位置を測って SVG で描く。描くたびに測るので、呼び出しの順によらない（字が読み込まれる前と後では位置が違うので、品質チェックと動画は字を待ってから撮る）。\n', ja: '', en: '' },
  ],
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
    if (!out.includes(e.find)) throw new Error(`PACK_EDITS ${name}: ${JSON.stringify(e.find)} is not in the README any more (review tools/make-llm-guide.mjs)`);
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
function classOf(js, name) {
  let cls = null;
  const D = { define: (n, c) => { if (n === name) cls = c; }, MotionElement: class {} };
  const ctx = { DECK: D, window: { DECK: D } };
  vm.createContext(ctx);
  try { vm.runInContext(js, ctx, { filename: name + '/index.js' }); } catch (e) { throw new Error(`components: ${name}/index.js could not be read for its shape: ${e.message}`); }
  return cls;
}
// README の本文を、部品の場所の文章と <!-- llm: 系列 --> の節（拡張）に分ける。<!-- llm: omit --> の節は捨てる
function splitBlocks(body, file) {
  const own = [], ext = {};
  let cur = null;
  for (const ln of body.split('\n')) {
    const m = ln.match(/^<!--\s*llm:\s*([\w-]+)\s*-->\s*$/);
    if (m) {
      if (m[1] === 'end') { if (cur === null) throw new Error(`${file}: <!-- llm: end --> without a block`); cur = null; continue; }
      if (cur !== null) throw new Error(`${file}: <!-- llm: ${m[1]} --> inside another block (close it with <!-- llm: end -->)`);
      if (m[1] !== 'omit' && !SERIES.includes(m[1])) throw new Error(`${file}: <!-- llm: ${m[1]} --> names an unknown series (known: ${SERIES.join(', ')}, or omit)`);
      cur = m[1];
      continue;
    }
    if (/<!--\s*llm:/.test(ln)) throw new Error(`${file}: malformed llm marker: ${ln}`);
    if (cur === null) own.push(ln); else if (cur !== 'omit') (ext[cur] = ext[cur] || []).push(ln);
  }
  if (cur !== null) throw new Error(`${file}: <!-- llm: ${cur} --> is not closed (<!-- llm: end -->)`);
  return { own: own.join('\n'), ext: Object.fromEntries(Object.entries(ext).map(([k, v]) => [k, v.join('\n').trim()])) };
}
function components() {
  return vendorComponents(ROOT).filter((c) => fs.existsSync(path.join(c.dir, 'README.md'))).map(({ name: n, version: v, dir }) => {
    const file = `vendor/components/${n}/${v}/README.md`;
    const [fm, body] = frontmatter(read('vendor', 'components', n, v, 'README.md'));
    const js = fs.existsSync(path.join(dir, 'index.js')) ? read('vendor', 'components', n, v, 'index.js') : '';
    if (!fm.name) throw new Error(`${file} has no frontmatter name`);
    if (!fm.series) throw new Error(`${file} has no frontmatter series (common, or one of ${SERIES.join(', ')}): every kit component belongs to exactly one place in the AI instruction pack`);
    if (fm.series !== 'common' && !SERIES.includes(fm.series)) throw new Error(`${file}: series "${fm.series}" is not common or one of ${SERIES.join(', ')}`);
    const blocks = splitBlocks(body, file);
    const cls = js ? classOf(js, fm.name) : null;
    return { fm, body: blocks.own, ext: blocks.ext, props: propDocs(js), shape: cls && cls.shape, rawProps: (cls && cls.props) || {} };
  });
}
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
// データの形の短い書き方（一覧の欄）と見本（詳しい節）
const SH = shapeApi();
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
  return '`' + SH.brief(sh.schema) + '`' + (note ? ' — ' + note : '');
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
  const entry = `### \`<${c.fm.name}>\`\n\n` + (ex ? ex + '\n\n' : '') + (rows.length ? `| ${H.join(' | ')} |\n|---|---|---|---|\n${rows.join('\n')}\n\n` : '') + demote(stripRepoRefs(applyPackEdits(c.fm.name, body, lang)));
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
// 最後の「頼みたいこと」（記入欄の付いた頼み方）。組み立てでは系列の指示の後ろ、いちばん最後に付く
const REQ_HEAD = /^# (What I want|頼みたいこと)\s*$/m;
const KB = (s) => Buffer.byteLength(s, 'utf8') / 1024;
const PLACEHOLDER = /\{\{(?:SIZE|CATALOG|EXTENSIONS|WORKED|contract|GENERATED|SERIES_LIST|PACK_VERSION|PURPOSES)/;
// 指示の版：材料（版の行を除く。英語と日本語の両方）の SHA-256 の先頭 8 字。指示の文章が変われば変わり、変わらなければ同じ（手で上げない）
const PACK_VERSION = '{{PACK_VERSION}}';

// 戻り値：{files: {相対パス: 中身（i18n の印の行なし）}, sizes: {en|ja: {common, series: {名前: 共通 + その系列}, all}}（KB）, data}
export function generate(opts = {}) {
  const warnings = [];
  const comps = components();
  for (const c of comps) if (Object.keys(c.ext).length && c.fm.series !== 'common') throw new Error(`vendor/components/${c.fm.name.replace(/^m-/, '')}/README.md: <!-- llm: … --> extension blocks are only for common components (this one is in ${c.fm.series})`);
  for (const s of SERIES) if (!comps.some((c) => c.fm.series === s)) throw new Error(`series ${s} has no component (frontmatter series: ${s})`);
  // 言いたいこと：部品庫の manifest.json（あれば）か、決めた表（kit/core/purposes.mjs）
  //   manifest.json が JSON として読めなければ、知らせて決めた表を使う（components:check が写しの壊れを見つける）。札に写らない id・形の合わない項目も知らせる
  const allParts = comps.map((c) => ({ tag: c.fm.name, series: c.fm.series }));
  let manifest = opts.manifest;
  if (manifest === undefined) {
    const mf = rel('vendor', 'components', 'manifest.json');
    manifest = null;
    if (fs.existsSync(mf)) { try { manifest = JSON.parse(read('vendor', 'components', 'manifest.json')); } catch (e) { warnings.push(`vendor/components/manifest.json is not JSON (${e.message}); the decided purposes table is used (run npm run components:check)`); } }
  }
  const { warnings: pw, unmapped, ...P } = purposesFrom(manifest, { vendored: allParts.map((c) => c.tag) });
  warnings.push(...pw);
  const lock = JSON.parse(read('components.lock.json'));
  const src = `${lock.source}/blob/${lock.tag}/components/`;
  // 表（{{PURPOSES}}）は組み立てのときに作る（入っている系列・外した言いたいことに合わせる。kit/core/llm-pack-assemble.mjs）
  // 道具（タイマーなど）：札を押したときだけ指示に入る共通の部品（manifest の group: "tool"）
  const tools = toolsFrom(manifest, { vendored: allParts.map((c) => c.tag) });
  for (const t of tools) if ((allParts.find((c) => c.tag === t.tag) || {}).series !== 'common') throw new Error(`${t.tag}: a tool must be in the common series`);
  const data = { series: SERIES, purposes: P, tools, parts: allParts, partsSrc: src };
  // 系列の見本が抜き出しで見せる部品（{{WORKED 名前 "見出し" 部品}}）
  const shownInWorked = new Set(SERIES.flatMap((x) => [...read('tools', 'llm-guide', 'series', x + '.md').matchAll(/\{\{WORKED \w+ "[^"]+" (m-[a-z]+(?:-[a-z]+)*)\}\}/g)].map((m) => m[1])));
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
      common: full.slice(i, j).trim(), request: full.slice(j).trim(), series: {}, components: {}, tableHead: TABLE_HEAD[lang],
      supNote: ja ? '（* はこの指示が補った説明）' : '(* = description added by this guide)',
      extHead: ja ? '### `<{name}>`：この系列の拡張（部品の説明は §3）' : '### `<{name}>`: extension for this series (the component is described in §3)',
    };
    if (!D.common.includes('{{CATALOG}}')) throw new Error(`template${ja ? '.ja' : ''}.md: no {{CATALOG}}`);
    const known = new Set(comps.map((c) => c.fm.name));
    for (const c of comps) {
      const e = entryOf(c, lang, shownInWorked);
      const ext = Object.fromEntries(Object.entries(c.ext).map(([s, x]) => [s, markRefs(demote(stripRepoRefs(x)), c.fm.name, known)]));
      D.components[c.fm.name] = { series: c.fm.series, row: markRefs(rowOf(c, lang), c.fm.name, known), entry: markRefs(e.entry, c.fm.name, known), ...(e.sup ? { sup: true } : {}), ...(Object.keys(ext).length ? { ext } : {}) };
    }
    for (const s of SERIES) {
      const f = `tools/llm-guide/series/${s}${ja ? '.ja' : ''}.md`;
      if (!fs.existsSync(rel(f))) throw new Error(`${f} is missing`);
      const text = fill(splitStamp(read(f)).body).trim();
      if (!text.includes('{{CATALOG}}')) throw new Error(`${f}: no {{CATALOG}}`);
      D.series[s] = text;
    }
    data[lang] = D;
  }
  for (const lang of ['en', 'ja']) if (!data[lang].common.includes(PACK_VERSION)) throw new Error(`template${lang === 'ja' ? '.ja' : ''}.md: no ${PACK_VERSION} line`);
  data.version = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 8);
  for (const lang of ['en', 'ja']) data[lang].common = data[lang].common.replace(PACK_VERSION, data.version);

  const files = {};
  files[DATA_FILE] = '// generated by tools/make-llm-guide.mjs from tools/llm-guide/, docs/contract*.md and vendor/components/*/README.md; do not edit by hand\n'
    + '// AI への指示の材料。組み立ては kit/core/llm-pack.mjs（buildPack）\n'
    + `export const PACK = ${JSON.stringify(data, null, 1)};\n`;
  // 大きさ（KB）：無料版の共通の本体・共通＋1 つの分野・共通＋2 つの分野（どの組も）と、有料版（docs が見せる指示の全体）
  const sizes = {};
  const TOOL_TAGS = (data.tools || []).map((t) => t.tag);
  for (const lang of ['en', 'ja']) {
    // 有料版：ふつうの組（どの 2 つの分野＋すべての道具。越えたら止まる）と、すべての分野と道具を選んだとき（いちばん大きい。越えても知らせるだけ）
    sizes[lang] = { common: KB(assemble(data, { series: [], lang })), series: Object.fromEntries(SERIES.map((s) => [s, KB(assemble(data, { series: [s], lang }))])), pairs: Object.fromEntries(PAIRS.map((p) => [p.join('+'), KB(assemble(data, { series: p, lang }))])),
      // 無料版の道具：道具は分野と合わせて 2 つまでに数える。道具だけ（1 つの上限）、分野＋道具・道具 2 つ（2 つの組の上限）
      freeTools: Object.fromEntries([...TOOL_TAGS.map((t) => [t, KB(assemble(data, { series: [], tools: [t], lang }))]),
        ...TOOL_TAGS.flatMap((t) => SERIES.map((s) => [s + '+' + t, KB(assemble(data, { series: [s], tools: [t], lang }))])),
        ...TOOL_TAGS.flatMap((a, i) => TOOL_TAGS.slice(i + 1).map((b) => [a + '+' + b, KB(assemble(data, { series: [], tools: [a, b], lang }))]))]),
      paidPairs: Object.fromEntries(PAIRS.map((p) => [p.join('+'), KB(assemble(data, { series: p, tools: 'all', lang, plan: 'paid' }))])), paid: KB(assemble(data, { series: 'all', tools: 'all', lang, plan: 'paid' })) };
  }
  const f1 = (x) => x.toFixed(1) + ' KB';
  for (const lang of ['en', 'ja']) {
    const ja = lang === 'ja';
    // docs は有料版の指示の全体（kit/llm-pack.mjs --plan paid と同じ）：共通の本体と頼みたいこと、系列ごとの部分。どの部品も説明がある
    const paid = planData(data, 'paid'), ex = paidOnly(data, 'paid');
    const list = SERIES.map((s) => {
      const names = membersOf(paid[lang], s).map((n) => '`' + n + '`').join(ja ? '・' : ', ');
      return ja ? `[${s}](llm-parts/${s}.ja.md)（${names}）` : `[${s}](llm-parts/${s}.md) (${names})`;
    }).join(ja ? '、' : '; ');
    const z = sizes[lang];
    // 無料のプランは 1 つの分野ごとと、いちばん大きい 2 つの組（選べるのは 2 つまで。ほかの組はこれより小さい）
    const [bigPair, bigKb] = largestPair(z.pairs), pairName = bigPair.split('+').join(ja ? '＋' : ' + ');
    const rows = ja
      ? [['無料のプラン：共通の本体だけ', z.common, LIMITS.fail], ...SERIES.map((s) => [`無料のプラン：共通の本体＋${s}`, z.series[s], LIMITS.fail]), [`無料のプラン：共通の本体＋2 つの分野でいちばん大きい組（${pairName}）`, bigKb, LIMITS.two], ['有料のプラン：すべての分野と道具を選んだとき（このファイルとすべての系列）', z.paid, LIMITS.paid]]
      : [['Free plan: common body only', z.common, LIMITS.fail], ...SERIES.map((s) => [`Free plan: common body + ${s}`, z.series[s], LIMITS.fail]), [`Free plan: common body + the largest pair of subjects (${pairName})`, bigKb, LIMITS.two], ['Paid plan: every subject and tool chosen (this file and every series pack)', z.paid, LIMITS.paid]];
    const table = (ja ? '| 指示 | 大きさ | 上限 |\n|---|---:|---:|\n' : '| Pack | Size | Cap |\n|---|---:|---:|\n') + rows.map(([w, kb, cap]) => `| ${w} | ${f1(kb)} | ${cap} KB |`).join('\n');
    const preamble = pre[lang].replace('{{SIZE_TABLE}}', table).replace('{{SERIES_LIST}}', list);
    files[commonFile(lang)] = preamble + commonOf(paid, lang, ex, SERIES) + '\n\n' + requestOf(data, lang) + '\n';
    for (const s of SERIES) {
      files[partFile(s, lang)] = `<!-- generated by tools/make-llm-guide.mjs (series pack ${s}, full pack; paste it after ${path.basename(commonFile(lang))}); do not edit by hand -->\n` + partOf(paid, s, lang, ex, SERIES) + '\n';
    }
  }
  for (const [f, text] of Object.entries(files)) if (f !== DATA_FILE && PLACEHOLDER.test(text)) throw new Error(`unreplaced placeholder in ${f}: ${text.match(PLACEHOLDER)[0]}`);
  for (const [f, text] of Object.entries(files)) if (f !== DATA_FILE && /<!--\/?part/.test(text)) throw new Error(`a <!--part:…--> marker is left in ${f} (unbalanced in tools/llm-guide/)`);
  return { files, sizes, data, warnings };
}

// 大きさの検査：[{lang, what, plan, series, kb, max, level: 'ok'|'warn'|'fail'}]（plan・series：どの指示か。上限を越えたときに組み直して中を見せる）
export function sizeReport(sizes) {
  const out = [];
  for (const [lang, z] of Object.entries(sizes)) {
    // 無料版：共通の本体、共通の本体＋1 つの分野（LIMITS.fail）、共通の本体＋2 つの分野のどの組も（LIMITS.two）。有料版：すべての部品（LIMITS.paid）
    out.push({ lang, what: 'free common', plan: 'free', series: [], kb: z.common, max: LIMITS.fail, level: z.common > LIMITS.fail ? 'fail' : z.common > LIMITS.warn ? 'warn' : 'ok' });
    for (const [s, kb] of Object.entries(z.series)) out.push({ lang, what: 'free common+' + s, plan: 'free', series: [s], kb, max: LIMITS.fail, level: kb > LIMITS.fail ? 'fail' : kb > LIMITS.warn ? 'warn' : 'ok' });
    for (const [p, kb] of Object.entries(z.pairs)) out.push({ lang, what: 'free common+' + p, plan: 'free', series: p.split('+'), pair: true, kb, max: LIMITS.two, level: kb > LIMITS.two ? 'fail' : 'ok' });
    // 無料版で道具も押したとき：1 つの分野なら LIMITS.fail、2 つなら LIMITS.two を越えたら知らせる（止めない。道具なしの組が上限の本体）
    for (const [k, kb] of Object.entries(z.freeTools || {})) {
      const ks = k.split('+'), ss = ks.filter((x) => !x.startsWith('m-')), ts = ks.filter((x) => x.startsWith('m-')), max = ks.length === 2 ? LIMITS.two : LIMITS.fail;
      out.push({ lang, what: 'free common+' + k, plan: 'free', series: ss, tools: ts, withTools: true, toolPair: ks.length === 2, kb, max, level: kb > max ? 'fail' : 'ok' });
    }
    // 有料版：どの 2 つの分野＋すべての道具も LIMITS.paid まで（越えたら止まる）。すべての分野と道具（いちばん大きいとき）は越えたら知らせるだけ
    for (const [p, kb] of Object.entries(z.paidPairs || {})) out.push({ lang, what: 'paid common+' + p + '+tools', plan: 'paid', series: p.split('+'), tools: 'all', paidPair: true, kb, max: LIMITS.paid, level: kb > LIMITS.paid ? 'fail' : 'ok' });
    if (z.paid !== undefined) out.push({ lang, what: 'paid all subjects+tools', plan: 'paid', series: [...SERIES], tools: 'all', worst: true, kb: z.paid, max: LIMITS.paid, level: z.paid > LIMITS.paid ? 'warn' : 'ok' });
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
// 上限を越えた指示の知らせ：どの指示か（版・言語・分野の組）、何バイト越えたか、大きい節 3 つ
export function overMessage(r, data) {
  const text = assemble(data, { series: r.series, tools: r.tools || [], lang: r.lang, plan: r.plan });
  const bytes = Buffer.byteLength(text, 'utf8'), over = bytes - r.max * 1024;
  const top = largestSections(text).map((x) => `${x.head} (${x.bytes} B)`).join('; ');
  return `pack over the cap: plan ${r.plan}, lang ${r.lang}, subjects ${r.series.length ? r.series.join('+') : '(none)'}${r.tools === 'all' ? ', every tool' : Array.isArray(r.tools) && r.tools.length ? ', tools ' + r.tools.join('+') : ''}: ${bytes} B, ${over} B over ${r.max} KB (${r.max * 1024} B). Largest sections: ${top}`;
}

// 1 行目の i18n の印は残し、それより後ろを比べる・書く
function current(file) { return fs.existsSync(rel(file)) ? fs.readFileSync(rel(file), 'utf8') : null; }
const bodyOf = (text) => splitStamp(text).body;
// 前の形の指示（全体版・core 版）と、今の系列にない部分のファイル：作り直すと消す（--check では古いもの）
function leftovers() {
  const out = ['docs/authoring-with-llms.core.md', 'docs/authoring-with-llms.core.ja.md'].filter((f) => fs.existsSync(rel(f)));
  const dir = rel('docs', 'llm-parts');
  if (fs.existsSync(dir)) for (const n of fs.readdirSync(dir)) { const s = n.replace(/(\.ja)?\.md$/, ''); if (!SERIES.includes(s) || !/\.md$/.test(n)) out.push('docs/llm-parts/' + n); }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
      fs.writeFileSync(rel(file), next);
      console.log(`wrote ${file} (${KB(text).toFixed(1)} KB)`);
    } else console.log(`unchanged ${file}`);
  }
  for (const f of leftovers()) {
    if (check) { stale++; console.error(`stale: ${f} should not exist (run: node tools/make-llm-guide.mjs)`); }
    else { fs.unlinkSync(rel(f)); console.log(`removed ${f}`); }
  }
  let fail = 0;
  // 2 つの組はどれも確かめ、越えたものは全部出す。越えていなければ、言語ごとにいちばん大きい組だけを出す
  const shownPair = Object.fromEntries(Object.entries(sizes).map(([lang, z]) => [lang, 'free common+' + largestPair(z.pairs)[0]]));
  const shownTool = Object.fromEntries(Object.entries(sizes).map(([lang, z]) => [lang, 'free common+' + largestPair(Object.fromEntries(Object.entries(z.freeTools || {}).filter(([k]) => k.includes('+'))))?.[0]]));
  const shownPaid = Object.fromEntries(Object.entries(sizes).map(([lang, z]) => [lang, 'paid common+' + largestPair(z.paidPairs)[0] + '+tools']));
  for (const r of sizeReport(sizes)) {
    const line = `size ${r.lang} ${r.what}: ${r.kb.toFixed(1)} KB${r.pair ? ` (largest pair; cap ${r.max} KB)` : r.paidPair ? ` (largest pair with every tool; cap ${r.max} KB)` : r.worst ? ` (worst case; cap ${r.max} KB, a warning only)` : r.toolPair ? ` (largest subject + tool; cap ${r.max} KB)` : r.withTools ? ` (tool alone; cap ${r.max} KB)` : ''}`;
    if (r.pair && r.level !== 'fail' && r.what !== shownPair[r.lang]) continue;
    if (r.paidPair && r.level !== 'fail' && r.what !== shownPaid[r.lang]) continue;
    if (r.toolPair && r.level !== 'fail' && r.what !== shownTool[r.lang]) continue;
    if (r.level === 'fail') { fail++; console.error(`${line} — over the limit (${r.max} KB)`); console.error('  ' + overMessage(r, data)); }
    else if (r.level === 'warn' && r.worst) { console.warn(`warning: ${line} — over ${r.max} KB`); console.warn('  ' + overMessage(r, data)); }
    else if (r.level === 'warn') console.warn(`warning: ${line} — over the ${LIMITS.warn} KB target`);
    else console.log(line);
  }
  if (check && (stale || fail)) process.exit(1);
  if (!check && fail) process.exit(1);
  if (!check) console.log('after comparing the English and Japanese files: npm run i18n -- --stamp docs/authoring-with-llms.ja.md ' + SERIES.map((s) => partFile(s, 'ja')).join(' '));
}
