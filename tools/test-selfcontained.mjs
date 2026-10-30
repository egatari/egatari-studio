// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
// 自己完結の点検（backlog #50。clone しただけで動き、作った人の環境に頼らない）：追跡しているファイルだけを読む（git ls-files）
//   1. 禁止のパターン：個人のパス・私的な網の番地・秘密の置き場所・個人の声の名前・大学のアドレス（vendor/ と、漏れを禁じる試験の見本は除く）。
//      localhost:8882 は IRODORI_URL の既定として書くときだけ（同じ行に IRODORI_URL）
//   2. skills/ の中のスキルの名前：同梱のスキル（skills/<名前>/）だけ。説明（frontmatter）の中の a-b の形の名前と、「… スキル」「… skill」の名前
//   3. 文書（*.md）が挙げるパス（`tools/x.mjs` など、リポジトリの最上位のフォルダから書いたもの）と相対のリンクが実在し、`npm run <名前>` が package.json にある
//   4. kit/ と server/（スライドの系）が tts/ と render/（音声と動画の系）を import しない
//   node tools/test-selfcontained.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const gitFiles = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)
  .filter((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
// 新しいプラグインのファイルは、git add の前でも点検する。
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const f = dir + '/' + e.name;
  return e.isDirectory() ? walk(f) : e.isFile() ? [f] : [];
});
const tracked = [...new Set([...gitFiles, ...walk('skills'), ...walk('.claude-plugin'), 'tools/video.mjs'])];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const isText = (f) => !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|wav|mp3|m4a|mp4|pdf|zip|gz|wasm)$/i.test(f);
const SELF = 'tools/test-selfcontained.mjs';

// ---------------------------------------------------------------- 1. 禁止のパターン
// この試験の文字列が自分に当たらないよう、パターンは分けて書く
const FORBIDDEN = [
  ['personal path', new RegExp('/' + 'Users/')], ['personal path', new RegExp('~/' + 'Projects')], ['personal path', /\bC:\\Users\\/],
  ['private network address', new RegExp('\\b100\\.64\\.' + '\\d')], ['private network', new RegExp('head' + 'scale', 'i')],
  ['secrets', new RegExp('\\.' + 'secrets\\b')], ['secrets', new RegExp('api' + '_keys')],
  ['personal voice', new RegExp('gendo' + '\\d')], ['personal voice', new RegExp('voice:\\s*' + 'gendo')],
  ['university address', new RegExp('nagaok' + 'aut', 'i')],
];
// 漏れを禁じる試験の見本（個人のパスを入れて、出力に出ないことを確かめる）
const ALLOW = { 'tools/test-portable.mjs': ['personal path'] };
const hits = [];
for (const f of tracked) {
  if (f.startsWith('vendor/') || f === SELF || !isText(f)) continue;
  const lines = read(f).split('\n');
  lines.forEach((l, i) => {
    for (const [what, re] of FORBIDDEN) if (re.test(l) && !(ALLOW[f] || []).includes(what)) hits.push(`${f}:${i + 1}: ${what}: ${l.trim().slice(0, 100)}`);
    if (/(localhost|127\.0\.0\.1):8882/.test(l) && !/IRODORI_URL/.test(l)) hits.push(`${f}:${i + 1}: TTS server assumed at :8882 (write it as the default of IRODORI_URL): ${l.trim().slice(0, 100)}`);
  });
}
ok(!hits.length, `forbidden patterns: none in ${tracked.length} tracked files` + hits.map((h) => '\n       ' + h).join(''));

// ---------------------------------------------------------------- 2. スキルの名前
const BUNDLED = new Set(fs.readdirSync(path.join(ROOT, 'skills')).filter((d) => fs.existsSync(path.join(ROOT, 'skills', d, 'SKILL.md'))));
// リポジトリの前の名前・今の名前と、説明文に 1 版だけ残す旧スキル名
const NOT_SKILLS = new Set(['motion-academic-slides', 'egatari-studio', 'motion-slides', 'motion-components', 'motion-slides-video']);
const skillHits = [];
for (const f of tracked.filter((x) => x.startsWith('skills/') && x.endsWith('.md'))) {
  const t = read(f);
  const fm = /^---\n([\s\S]*?)\n---/.exec(t);
  if (fm) for (const m of fm[1].matchAll(/\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g)) if (!BUNDLED.has(m[0]) && !NOT_SKILLS.has(m[0])) skillHits.push(`${f}: frontmatter names "${m[0]}"`);
  for (const m of t.matchAll(/`?([a-z][a-z0-9]*(?:[-:][a-z0-9]+)+)`?\s?(?:スキル|skill)/g)) if (!BUNDLED.has(m[1].replace(/^egatari:/, ''))) skillHits.push(`${f}: names the skill "${m[1]}"`);
}
ok(!skillHits.length, `skills: only the bundled skills (${[...BUNDLED].join(', ')}) are named` + skillHits.map((h) => '\n       ' + h).join(''));

// ---------------------------------------------------------------- 3. 文書が挙げるパスと npm script
const TOP = new Set(tracked.map((f) => f.split('/')[0]).filter((d) => tracked.some((f) => f.startsWith(d + '/'))));
const scripts = JSON.parse(read('package.json')).scripts || {};
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const docHits = [];
let nPaths = 0, nLinks = 0, nScripts = 0;
// 追跡しないが実在するもの・ほかの場所のもの
const NOT_HERE = {
  'vendor/lame-wasm': 'copied from node_modules by tools/build-app.mjs into the editor site',
};
const PLACEHOLDER = /(^|\/)(name|名前|…)(\/|$)|…/;
// CHANGELOG.md と changes/ は過去のことも書くので見ない。tools/llm-guide/ は docs/ に入る型（リンクは docs/ から見たもの）
const docs = tracked.filter((f) => f.endsWith('.md') && !f.startsWith('vendor/') && !f.startsWith('changes/') && !f.startsWith('tools/llm-guide/') && f !== 'CHANGELOG.md');
for (const f of docs) {
  const t = read(f);
  t.split('\n').forEach((l, i) => {
    const at = `${f}:${i + 1}`;
    // `…` の中の、最上位のフォルダから書いたパス（<…>・*・{…}・$ を含むものは型なので見ない）
    for (const c of l.matchAll(/`([^`\n]+)`/g)) {
      for (const m of c[1].matchAll(/(?:^|[\s(="'])(\.?[A-Za-z0-9_.-]+\/[^\s`'"()]*)/g)) {
        let p = m[1].replace(/[.,;:)]+$/, '').replace(/[#?].*$/, '').replace(/:\d+$/, '');
        const top = p.split('/')[0];
        if (!TOP.has(top) || /[<>*{}$|]|\.\.\./.test(p) || /^(examples|components|themes)\/[^/]+\/(out|audio|video|bundle)(\/|$)/.test(p)) continue;
        if (/\/(out|audio|video|bundle|node_modules|dist)(\/|$)/.test(p)) continue;   // 作るもの（追跡しない）
        p = p.replace(/\/$/, '');
        if (PLACEHOLDER.test(p) || Object.keys(NOT_HERE).some((x) => p === x || p.startsWith(x + '/'))) continue;
        nPaths++;
        if (!exists(p) && !exists(p + '.md')) docHits.push(`${at}: \`${p}\` does not exist`);
      }
      for (const m of c[1].matchAll(/\bnpm run ([a-z][a-z0-9:_-]*)/g)) if (++nScripts && !(m[1] in scripts)) docHits.push(`${at}: npm run ${m[1]} is not in package.json`);
    }
    // 相対のリンク [..](x.md#a)
    for (const m of l.matchAll(/\]\(([^)\s]+)\)/g)) {
      const u = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('#') || u.startsWith('/') || /[<>{}$]/.test(u)) continue;
      const p = path.posix.normalize(path.posix.join(path.posix.dirname(f), decodeURIComponent(u.replace(/#.*$/, '').replace(/\?.*$/, ''))));
      if (p && !p.startsWith('..') && ++nLinks && !exists(p)) docHits.push(`${at}: link ${u} does not exist`);
    }
  });
}
ok(!docHits.length && nPaths > 100 && nLinks > 50 && nScripts > 5, `docs: the paths (${nPaths}), links (${nLinks}) and npm scripts (${nScripts}) named in ${docs.length} documents exist` + docHits.map((h) => '\n       ' + h).join(''));

// ---------------------------------------------------------------- 4. スライドの系が音声と動画の系を import しない
const impHits = [];
for (const f of tracked.filter((x) => /^(kit|server)\/.*\.(m?js|cjs)$/.test(x))) {
  const t = read(f);
  for (const m of t.matchAll(/(?:\bimport\s*(?:[^'"`;]*?\bfrom\s*)?|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const to = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
    if (/^(tts|render)(\/|$)/.test(to)) impHits.push(`${f}: imports ${spec}`);
  }
}
ok(!impHits.length, 'layers: kit/ and server/ do not import tts/ or render/' + impHits.map((h) => '\n       ' + h).join(''));

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
