// チャットの AI に教材を書かせる指示のまとめ（docs/authoring-with-llms*.md）を作る。手で直さない
//   node tools/make-llm-guide.mjs            書く（4 つ：英語・日本語 × 全体版・core 版）
//   node tools/make-llm-guide.mjs --check    今のファイルが作り直したものと同じか（npm test。違えば終了コード 1）
//
// 材料（どれかを直したら作り直す）：
//   tools/llm-guide/template.md・template.ja.md   指示の本文（英語が正本）。{{…}} を下の中身で置き換える
//   docs/contract.md・contract.ja.md              {{contract §N "頭の字"}}：その節の箇条書きのうち、その字で始まる 1 つ（見つからなければ失敗）
//   components/<名前>/README.md・index.js         {{CATALOG_TABLE}}（frontmatter の name・summary・steps）と
//                                                 {{CATALOG_DETAILS}}（props の型・既定値・説明（static props）と README の本文。core 版では省く）
//   themes/                                       {{THEMES}}：テーマの名前
//   tools/llm-guide/worked/<名前>/                {{WORKED 名前 "見出し"}}：見本の deck.html と narration.md（npm test が組んで検査する）
// 1 行目の i18n の印（tools/i18n-pairs.mjs）は残す。作り直して中身が変わったら、両方を見比べて npm run i18n -- --stamp で印を付け直す
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStamp } from './i18n-pairs.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (...p) => path.join(ROOT, ...p);
const read = (...p) => fs.readFileSync(rel(...p), 'utf8').replace(/\r\n/g, '\n');
const GUIDE = rel('tools', 'llm-guide');
export const OUTPUTS = {
  en: { full: 'docs/authoring-with-llms.md', core: 'docs/authoring-with-llms.core.md' },
  ja: { full: 'docs/authoring-with-llms.ja.md', core: 'docs/authoring-with-llms.core.ja.md' },
};

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
    .replace(/\n?（motion-slides スキル §\d+「[^」]*」）/g, '').replace(/\n{3,}/g, '\n\n').trim();
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
function components() {
  const dir = rel('components');
  return fs.readdirSync(dir).sort().filter((n) => fs.existsSync(path.join(dir, n, 'README.md'))).map((n) => {
    const [fm, body] = frontmatter(read('components', n, 'README.md'));
    const js = fs.existsSync(path.join(dir, n, 'index.js')) ? read('components', n, 'index.js') : '';
    if (!fm.name) throw new Error(`components/${n}/README.md has no frontmatter name`);
    const cls = js ? classOf(js, fm.name) : null;
    return { fm, body, props: propDocs(js), shape: cls && cls.shape, rawProps: (cls && cls.props) || {} };
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
function catalogTable(comps, lang) {
  const head = lang === 'ja' ? '| 部品 | 内容 | steps | データの形 |\n|---|---|---|---|' : '| component | what it shows | steps | data shape |\n|---|---|---|---|';
  return head + '\n' + comps.map((c) => `| \`<${c.fm.name}>\` | ${cell(c.fm.summary)} | ${cell(c.fm.steps)} | ${cell(shapeBrief(c, lang))} |`).join('\n');
}
function catalogDetails(comps, lang) {
  const H = lang === 'ja' ? ['値', '型', '既定', '意味'] : ['prop', 'type', 'default', 'meaning'];
  let sup = false;
  const parts = comps.map((c) => {
    const rows = (c.fm.props || '').split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
      const d = c.props.get(p) || { type: '', dflt: '', doc: '' };
      let doc = d.doc;
      if (!doc && AXIS[lang][p]) { doc = AXIS[lang][p] + ' *'; sup = true; }
      return `| \`${p}\` | ${d.type} | ${d.dflt ? '`' + cell(d.dflt) + '`' : ''} | ${cell(doc)} |`;
    });
    // README の見出し（## 書き方 など）は、この部品の節（###）の下に下げる
    const body = stripRepoRefs(c.body).replace(/^(#{1,4}) /gm, (_, h) => '#'.repeat(Math.min(6, h.length + 2)) + ' ');
    const ex = shapeExample(c, lang);
    return `### \`<${c.fm.name}>\`\n\n` + (ex ? ex + '\n\n' : '') + (rows.length ? `| ${H.join(' | ')} |\n|---|---|---|---|\n${rows.join('\n')}\n\n` : '') + body;
  });
  const note = sup ? (lang === 'ja' ? '（* はこの指示が補った説明）\n\n' : '(* = description added by this guide)\n\n') : '';
  return note + parts.join('\n\n');
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
export function generate() {
  const comps = components();
  const themes = fs.readdirSync(rel('themes')).filter((n) => fs.statSync(rel('themes', n)).isDirectory()).sort();
  const out = {};
  for (const lang of ['en', 'ja']) {
    const contractFile = lang === 'ja' ? 'docs/contract.ja.md' : 'docs/contract.md';
    const contract = read(contractFile);
    const tpl = splitStamp(read('tools', 'llm-guide', lang === 'ja' ? 'template.ja.md' : 'template.md')).body;   // 型紙も英語と日本語の組（1 行目の印は写さない）
    const worked = (name, title) => {
      const deck = read('tools', 'llm-guide', 'worked', name, 'deck.html').trim(), narr = read('tools', 'llm-guide', 'worked', name, 'narration.md').trim();
      return `### ${title}\n\n\`\`\`deck.html\n${deck}\n\`\`\`\n\n\`\`\`narration.md\n${narr}\n\`\`\``;
    };
    const fill = (variant) => tpl
      .replace('{{GENERATED}}', `<!-- generated by tools/make-llm-guide.mjs from tools/llm-guide/, docs/${path.basename(contractFile)} and components/*/README.md; do not edit by hand -->`)
      .replace(/\{\{contract §(\d+) "([^"]+)"\}\}/g, (_, sec, prefix) => contractBullet(contract, sec, prefix, contractFile))
      .replace('{{THEMES}}', themes.map((t) => '`' + t + '`').join(' '))
      .replace('{{CATALOG_TABLE}}', catalogTable(comps, lang))
      .replace('{{CATALOG_DETAILS}}', variant === 'core'
        ? (lang === 'ja' ? '（この core 版は部品ごとの詳しい説明を省いている。部品を使うなら、使い方を利用者に聞くか、全体版 authoring-with-llms.ja.md を貼ってもらう）'
          : '(This core pack leaves out the per-component details. To use a component, ask the user for its notes or for the full pack, authoring-with-llms.md.)')
        : catalogDetails(comps, lang))
      .replace(/\{\{WORKED (\w+) "([^"]+)"\}\}/g, (_, n, t) => worked(n, t));
    const full0 = fill('full'), core0 = fill('core');
    const kb = (s) => String(Math.ceil(Buffer.byteLength(s, 'utf8') / 1024));
    for (const [variant, body] of [['full', full0], ['core', core0]]) {
      const text = body.replace('{{SIZE_FULL}}', kb(full0)).replace('{{SIZE_CORE}}', kb(core0)).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
      if (/\{\{(?:SIZE|CATALOG|WORKED|THEMES|contract|GENERATED)/.test(text)) throw new Error(`unreplaced placeholder in ${lang} ${variant}`);
      out[OUTPUTS[lang][variant]] = text;
    }
  }
  return out;
}

// 1 行目の i18n の印は残し、それより後ろを比べる・書く
function current(file) { return fs.existsSync(rel(file)) ? fs.readFileSync(rel(file), 'utf8') : null; }
const bodyOf = (text) => splitStamp(text).body;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const files = generate();
  let stale = 0;
  for (const [file, text] of Object.entries(files)) {
    const now = current(file);
    const kept = now ? splitStamp(now).stamp : null;
    const next = (kept ? `<!-- i18n: pair=${kept.pair} sha256=${kept.hash} -->\n` : '') + text;
    if (check) {
      if (now === null || bodyOf(now).replace(/\r\n/g, '\n') !== text) { stale++; console.error(`stale: ${file} (run: node tools/make-llm-guide.mjs)`); }
      else console.log(`ok ${file} (${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB)`);
    } else if (now !== next) {
      fs.writeFileSync(rel(file), next);
      console.log(`wrote ${file} (${(Buffer.byteLength(text, 'utf8') / 1024).toFixed(1)} KB)`);
    } else console.log(`unchanged ${file}`);
  }
  if (check && stale) process.exit(1);
  if (!check) console.log('after comparing the English and Japanese files: npm run i18n -- --stamp docs/authoring-with-llms.ja.md docs/authoring-with-llms.core.ja.md');
}
