// 新しいデッキのフォルダを、きれいな雛形から作る（npm run new）
//   npm run new -- <folder> [--lang en|ja] [--theme name] [--title "…"]
//   node tools/new.mjs <folder> [--lang en|ja] [--theme name] [--title "…"]
// 作るもの：<folder>/deck.html（表紙＋見本 3 枚：段階・数式と注目の演出・部品）と <folder>/narration.md（全段階ぶん）
// 空でないフォルダには書かない。依存なし（Node の標準だけ）。雛形の中身は kit/templates/new-deck.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { choosableOf, RETIRED } from '../kit/core/themes-list.mjs';
import { newDeckFiles } from '../kit/templates/new-deck.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const USAGE = 'usage: npm run new -- <folder> [--lang en|ja] [--theme name] [--title "…"]';

function fail(msg) {
  console.error(`new: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- 引数
const args = process.argv.slice(2);
const opts = { lang: 'ja', theme: 'default', title: null };
let folder = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
  const m = a.match(/^--(lang|theme|title)(?:=(.*))?$/);
  if (m) {
    const v = m[2] ?? args[++i];
    if (v === undefined) fail(`--${m[1]} needs a value\n${USAGE}`);
    opts[m[1]] = v;
  } else if (a.startsWith('--')) fail(`unknown option ${a}\n${USAGE}`);
  else if (folder === null) folder = a;
  else fail(`unexpected argument ${a}\n${USAGE}`);
}
if (!folder) fail(`missing <folder>\n${USAGE}`);
if (!['en', 'ja'].includes(opts.lang)) fail(`--lang must be en or ja (got ${opts.lang})`);
const themes = fs.readdirSync(path.join(ROOT, 'themes'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, 'themes', d.name, 'tokens.css'))).map((d) => d.name);
// 新しく選べるのは CHOOSABLE（kit/core/themes-list.mjs）。business は同梱のまま組めるが、新しい教材には選べない（#129）
const choosable = choosableOf(themes);
if (RETIRED.includes(opts.theme)) fail(`the theme "${opts.theme}" is no longer offered for new lessons (lessons that use it still build); for business and pitch decks use "sumi" (available: ${choosable.join(', ')})`);
if (!choosable.includes(opts.theme)) fail(`unknown theme "${opts.theme}" (available: ${choosable.join(', ')})`);
const EN = opts.lang === 'en';
const title = (opts.title ?? (EN ? 'Untitled deck' : '新しいデッキ')).trim() || (EN ? 'Untitled deck' : '新しいデッキ');

// npm run は package のフォルダで動くので、呼び出した場所（INIT_CWD）から解決する
const base = process.env.INIT_CWD || process.cwd();
const dir = path.resolve(base, folder);
if (fs.existsSync(dir)) {
  if (!fs.statSync(dir).isDirectory()) fail(`${dir} exists and is not a folder`);
  if (fs.readdirSync(dir).length) fail(`${dir} is not empty; refusing to overwrite`);
}

// ---------------------------------------------------------------- 雛形（kit/templates/new-deck.mjs。編集アプリと共有）
const files = newDeckFiles({ ...opts, title });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'deck.html'), files['deck.html']);
fs.writeFileSync(path.join(dir, 'narration.md'), files['narration.md']);

// ---------------------------------------------------------------- 次の手順（リポジトリの根から打つ形で出す）
const relp = path.relative(ROOT, dir);
const shown = (!relp || relp.startsWith('..') || path.isAbsolute(relp) ? dir : relp).split(path.sep).join('/');
const q = (s) => (/[^\w./-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s);
const d = q(shown + '/deck.html');
console.log(`Created ${shown}/ (deck.html, narration.md; lang=${opts.lang}, theme=${opts.theme})

Next steps (from ${ROOT}):
  npm run build -- ${d}     # -> ${shown}/out/deck.html, open it in a browser
  npm run dev -- ${d}       # dev server at http://127.0.0.1:8730/ (edit in the browser)
  npm run check -- ${d}     # checker; the last line should read "エラー 0" (0 errors)`);
