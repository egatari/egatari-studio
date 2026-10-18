// チャットの AI に教材を書かせる指示（AI instruction pack）の材料と docs を作る。手で直さない
//   node tools/make-llm-guide.mjs            書く：kit/core/llm-pack-data.mjs（組み立ての材料）と、
//                                            docs/authoring-with-llms(.ja).md（共通の本体）・docs/llm-parts/<系列>(.ja).md（系列ごとの部分）
//   node tools/make-llm-guide.mjs --check    今のファイルが作り直したものと同じか・大きさ（npm test。違えば・大きすぎれば終了コード 1）
// 組み立ては kit/core/llm-pack-assemble.mjs の assemble（編集アプリ・kit/llm-pack.mjs・直しの依頼と同じ関数）。docs はその出力そのもの
//
// 材料（どれかを直したら作り直す）：
//   tools/llm-guide/template.md・template.ja.md   共通の本体（英語が正本）。{{…}} を下の中身で置き換える
//   tools/llm-guide/series/<系列>.md・.ja.md      系列ごとの部分。{{CATALOG}}（その系列の部品）・{{EXTENSIONS}}（共通の部品のその系列向けの節）・{{WORKED …}}
//   docs/contract.md・contract.ja.md              {{contract §N "頭の字"}}：その節の箇条書きのうち、その字で始まる 1 つ（見つからなければ失敗）
//   components/<名前>/README.md・index.js         frontmatter の series（common か系列の名前。ないと失敗）・name・summary・steps と、
//                                                 props の型・既定値・説明（static props）・データの形（static shape）・README の本文。
//                                                 本文の <!-- llm: <系列> --> … <!-- llm: end --> はその系列の部分に「拡張」として（共通の部品だけ）、
//                                                 <!-- llm: omit --> … <!-- llm: end --> は指示に入れない（開発者向けの注意など）
//   themes/                                       {{THEMES}}：テーマの名前
//   tools/llm-guide/worked/<名前>/                {{WORKED 名前 "見出し"}}：見本の deck.html と narration.md（npm test が組んで検査する）
// 大きさ（--check）：共通 + 系列 1 つは 35 KB を超えれば警告・40 KB を超えれば失敗、全部（'all'）は 64 KB を超えれば失敗
// 1 行目の i18n の印（tools/i18n-pairs.mjs）は残す。作り直して中身が変わったら、両方を見比べて npm run i18n -- --stamp で印を付け直す
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStamp } from './i18n-pairs.mjs';
import { assemble, commonOf, partOf, membersOf } from '../kit/core/llm-pack-assemble.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (...p) => path.join(ROOT, ...p);
const read = (...p) => fs.readFileSync(rel(...p), 'utf8').replace(/\r\n/g, '\n');
const GUIDE = rel('tools', 'llm-guide');
export const SERIES = ['academic', 'business', 'kokugo', 'info'];
export const DATA_FILE = 'kit/core/llm-pack-data.mjs';
export const commonFile = (lang) => (lang === 'ja' ? 'docs/authoring-with-llms.ja.md' : 'docs/authoring-with-llms.md');
export const partFile = (s, lang) => `docs/llm-parts/${s}${lang === 'ja' ? '.ja' : ''}.md`;
export const LIMITS = { warn: 35, fail: 40, all: 64 };   // KB（1024 バイト）

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
  return body.split('\n').filter((ln) => !/demo\.html|examples\/|tools\/|motion-components スキル/.test(ln)).join('\n')
    .replace(/\n?（motion-slides スキル §\d+「[^」]*」）/g, '').replace(/\n{3,}/g, '\n\n').trim()
    // 中身を除いて空になった「注意」の見出しも除く
    .replace(/\n+(?:#{1,6} )?注意\s*$/, '').replace(/\n(?:#{1,6} )?注意\n+(?=#{1,6} )/g, '\n');
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
  const dir = rel('components');
  return fs.readdirSync(dir).sort().filter((n) => fs.existsSync(path.join(dir, n, 'README.md'))).map((n) => {
    const file = `components/${n}/README.md`;
    const [fm, body] = frontmatter(read('components', n, 'README.md'));
    const js = fs.existsSync(path.join(dir, n, 'index.js')) ? read('components', n, 'index.js') : '';
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
  return '`' + SH.brief(sh.schema) + '`' + (sh.note ? ' — ' + sh.note[lang] : '');
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
const rowOf = (c, lang) => `| \`<${c.fm.name}>\` | ${cell(c.fm.summary)} | ${cell(c.fm.steps)} | ${cell(shapeBrief(c, lang))} |`;
// README の見出し（## 書き方 など）は、この部品の節（###）の下に下げる
const demote = (s) => s.replace(/^(#{1,4}) /gm, (_, h) => '#'.repeat(Math.min(6, h.length + 2)) + ' ');
function entryOf(c, lang) {
  const H = lang === 'ja' ? ['値', '型', '既定', '意味'] : ['prop', 'type', 'default', 'meaning'];
  let sup = false;
  // 秒で測る値（動きの速さ・ずれ）は表に載せない：既定のままで口述原稿に合う（§3 の前書きに書いてある）
  const rows = (c.fm.props || '').split(',').map((p) => p.trim()).filter(Boolean).filter((p) => !TIMING.test((c.props.get(p) || {}).doc || '')).map((p) => {
    const d = c.props.get(p) || { type: '', dflt: '', doc: '' };
    let doc = d.doc;
    if (!doc && AXIS[lang][p]) { doc = AXIS[lang][p] + ' *'; sup = true; }
    return `| \`${p}\` | ${d.type} | ${d.dflt ? '`' + cell(d.dflt) + '`' : ''} | ${cell(doc)} |`;
  });
  const ex = shapeExample(c, lang);
  const entry = `### \`<${c.fm.name}>\`\n\n` + (ex ? ex + '\n\n' : '') + (rows.length ? `| ${H.join(' | ')} |\n|---|---|---|---|\n${rows.join('\n')}\n\n` : '') + demote(stripRepoRefs(c.body));
  return { entry: entry.trim(), sup };
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
const GENERATED = (contract) => `<!-- generated by tools/make-llm-guide.mjs from tools/llm-guide/, docs/${contract} and components/*/README.md; do not edit by hand -->`;
const AI_HEAD = /^# (Instructions for the AI|AI への指示)\s*$/m;
const KB = (s) => Buffer.byteLength(s, 'utf8') / 1024;
const PLACEHOLDER = /\{\{(?:SIZE|CATALOG|EXTENSIONS|WORKED|THEMES|contract|GENERATED|SERIES_LIST)/;

// 戻り値：{files: {相対パス: 中身（i18n の印の行なし）}, sizes: {en|ja: {common, series: {名前: 共通 + その系列}, all}}（KB）, data}
export function generate() {
  const comps = components();
  for (const c of comps) if (Object.keys(c.ext).length && c.fm.series !== 'common') throw new Error(`components/${c.fm.name.replace(/^m-/, '')}/README.md: <!-- llm: … --> extension blocks are only for common components (this one is in ${c.fm.series})`);
  for (const s of SERIES) if (!comps.some((c) => c.fm.series === s)) throw new Error(`series ${s} has no component (frontmatter series: ${s})`);
  const themes = fs.readdirSync(rel('themes')).filter((n) => fs.statSync(rel('themes', n)).isDirectory()).sort();
  const data = { series: SERIES };
  const pre = {};
  for (const lang of ['en', 'ja']) {
    const ja = lang === 'ja';
    const contractFile = ja ? 'docs/contract.ja.md' : 'docs/contract.md';
    const contract = read(contractFile);
    const worked = (name, title) => {
      const deck = read('tools', 'llm-guide', 'worked', name, 'deck.html').trim(), narr = read('tools', 'llm-guide', 'worked', name, 'narration.md').trim();
      return `### ${title}\n\n\`\`\`deck.html\n${deck}\n\`\`\`\n\n\`\`\`narration.md\n${narr}\n\`\`\``;
    };
    const fill = (tpl) => tpl
      .replace(/\{\{contract §(\d+) "([^"]+)"\}\}/g, (_, sec, prefix) => contractBullet(contract, sec, prefix, contractFile))
      .replace('{{THEMES}}', themes.map((t) => '`' + t + '`').join(' '))
      .replace(/\{\{WORKED (\w+) "([^"]+)"\}\}/g, (_, n, t) => worked(n, t));
    // 型紙も英語と日本語の組（1 行目の印は写さない）
    const full = fill(splitStamp(read('tools', 'llm-guide', ja ? 'template.ja.md' : 'template.md')).body)
      .replace('{{GENERATED}}', GENERATED(path.basename(contractFile)));
    const i = full.search(AI_HEAD);
    if (i < 0) throw new Error(`tools/llm-guide/template${ja ? '.ja' : ''}.md: no "# ${ja ? 'AI への指示' : 'Instructions for the AI'}" heading`);
    pre[lang] = full.slice(0, i).replace(/\n{3,}/g, '\n\n');
    const D = {
      common: full.slice(i).trim(), series: {}, components: {}, tableHead: TABLE_HEAD[lang],
      supNote: ja ? '（* はこの指示が補った説明）' : '(* = description added by this guide)',
      extHead: ja ? '### `<{name}>`：この系列の拡張（部品の説明は §3）' : '### `<{name}>`: extension for this series (the component is described in §3)',
    };
    if (!D.common.includes('{{CATALOG}}')) throw new Error(`template${ja ? '.ja' : ''}.md: no {{CATALOG}}`);
    for (const c of comps) {
      const e = entryOf(c, lang);
      const ext = Object.fromEntries(Object.entries(c.ext).map(([s, x]) => [s, demote(stripRepoRefs(x))]));
      D.components[c.fm.name] = { series: c.fm.series, row: rowOf(c, lang), entry: e.entry, ...(e.sup ? { sup: true } : {}), ...(Object.keys(ext).length ? { ext } : {}) };
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

  const files = {};
  files[DATA_FILE] = '// generated by tools/make-llm-guide.mjs from tools/llm-guide/, docs/contract*.md and components/*/README.md; do not edit by hand\n'
    + '// AI への指示の材料。組み立ては kit/core/llm-pack.mjs（buildPack）\n'
    + `export const PACK = ${JSON.stringify(data, null, 1)};\n`;
  const sizes = {};
  for (const lang of ['en', 'ja']) {
    const ja = lang === 'ja';
    const base = assemble(data, { series: [], lang });
    const list = SERIES.map((s) => {
      const add = Math.ceil(KB(assemble(data, { series: [s], lang })) - KB(base));
      const names = membersOf(data[lang], s).map((n) => '`' + n + '`').join(ja ? '・' : ', ');
      return ja ? `[${s}](llm-parts/${s}.ja.md)（${names}。+${add} KB）` : `[${s}](llm-parts/${s}.md) (${names}; +${add} KB)`;
    }).join(ja ? '、' : '; ');
    const preamble = pre[lang].replace('{{SIZE_COMMON}}', String(Math.ceil(KB(base)))).replace('{{SERIES_LIST}}', list);
    files[commonFile(lang)] = preamble + commonOf(data, lang) + '\n';
    for (const s of SERIES) {
      files[partFile(s, lang)] = `<!-- generated by tools/make-llm-guide.mjs (series pack ${s}; paste it after ${path.basename(commonFile(lang))}); do not edit by hand -->\n` + partOf(data, s, lang) + '\n';
    }
    sizes[lang] = { common: KB(base), series: Object.fromEntries(SERIES.map((s) => [s, KB(assemble(data, { series: [s], lang }))])), all: KB(assemble(data, { series: 'all', lang })) };
  }
  for (const [f, text] of Object.entries(files)) if (f !== DATA_FILE && PLACEHOLDER.test(text)) throw new Error(`unreplaced placeholder in ${f}: ${text.match(PLACEHOLDER)[0]}`);
  return { files, sizes, data };
}

// 大きさの検査：[{lang, what, kb, level: 'ok'|'warn'|'fail'}]
export function sizeReport(sizes) {
  const out = [];
  for (const [lang, z] of Object.entries(sizes)) {
    out.push({ lang, what: 'common', kb: z.common, level: z.common > LIMITS.fail ? 'fail' : z.common > LIMITS.warn ? 'warn' : 'ok' });
    for (const [s, kb] of Object.entries(z.series)) out.push({ lang, what: 'common+' + s, kb, level: kb > LIMITS.fail ? 'fail' : kb > LIMITS.warn ? 'warn' : 'ok' });
    out.push({ lang, what: 'all', kb: z.all, level: z.all > LIMITS.all ? 'fail' : 'ok' });
  }
  return out;
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
  const { files, sizes } = generate();
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
  for (const r of sizeReport(sizes)) {
    const line = `size ${r.lang} ${r.what}: ${r.kb.toFixed(1)} KB`;
    if (r.level === 'fail') { fail++; console.error(`${line} — over the limit (${r.what === 'all' ? LIMITS.all : LIMITS.fail} KB)`); }
    else if (r.level === 'warn') console.warn(`warning: ${line} — over the ${LIMITS.warn} KB target`);
    else console.log(line);
  }
  if (check && (stale || fail)) process.exit(1);
  if (!check && fail) process.exit(1);
  if (!check) console.log('after comparing the English and Japanese files: npm run i18n -- --stamp docs/authoring-with-llms.ja.md ' + SERIES.map((s) => partFile(s, 'ja')).join(' '));
}
