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
function propDocs(js) {
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
function components() {
  const dir = rel('components');
  return fs.readdirSync(dir).sort().filter((n) => fs.existsSync(path.join(dir, n, 'README.md'))).map((n) => {
    const [fm, body] = frontmatter(read('components', n, 'README.md'));
    const js = fs.existsSync(path.join(dir, n, 'index.js')) ? read('components', n, 'index.js') : '';
    if (!fm.name) throw new Error(`components/${n}/README.md has no frontmatter name`);
    return { fm, body, props: propDocs(js) };
  });
}
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function catalogTable(comps, lang) {
  const head = lang === 'ja' ? '| 部品 | 内容 | steps |\n|---|---|---|' : '| component | what it shows | steps |\n|---|---|---|';
  return head + '\n' + comps.map((c) => `| \`<${c.fm.name}>\` | ${cell(c.fm.summary)} | ${cell(c.fm.steps)} |`).join('\n');
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
    return `### \`<${c.fm.name}>\`\n\n` + (rows.length ? `| ${H.join(' | ')} |\n|---|---|---|---|\n${rows.join('\n')}\n\n` : '') + body;
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
