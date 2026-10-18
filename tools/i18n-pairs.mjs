// 英語と日本語の文書の組（X.md と X.ja.md）が古くなっていないかを見る（npm run i18n）
//   node tools/i18n-pairs.mjs --check [--strict] [--plain] [--root <dir>]
//   node tools/i18n-pairs.mjs --stamp <file> [<file> …] [--root <dir>]
//   node tools/i18n-pairs.mjs --stamp-all [--root <dir>]
// 英語が正本。それぞれのファイルの 1 行目に、最後に訳を揃えたときの相手のハッシュを書いておく：
//   <!-- i18n: pair=README.ja.md sha256=0123456789abcdef -->
// ハッシュは相手を正規化したもの（この行を除き、CRLF → LF、行末と末尾の空白を落とす）の sha256 の先頭 16 桁。
// --check：相手が変わって記録と合わない（= こちらが古い）、行がない、相手がない、を知らせる。
//   GitHub Actions の中では ::warning file=…:: の形で出す（--plain で普通の行にする）。終了コードは 0（--strict なら知らせがあれば 1）
// --stamp：人が訳の揃っていることを確かめた後に、その組の両方のファイルに今の相手のハッシュを書く（どちらのファイルを渡してもよい）
// --stamp-all：見つけたすべての組に書く（初めの設定用）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['node_modules', 'vendor', 'out', 'dist', '.git']);
const STAMP_RE = /^<!--\s*i18n:\s*pair=(\S+)\s+sha256=([0-9a-f]+)\s*-->\s*$/;

export function splitStamp(text) {
  const nl = text.indexOf('\n');
  const first = (nl < 0 ? text : text.slice(0, nl)).replace(/\r$/, '');
  const m = first.match(STAMP_RE);
  if (!m) return { stamp: null, body: text };
  return { stamp: { pair: m[1], hash: m[2] }, body: nl < 0 ? '' : text.slice(nl + 1) };
}

export function normalize(text) {
  const { body } = splitStamp(text);
  return body.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\s+$/, '');
}

export function hashOf(text) {
  return crypto.createHash('sha256').update(normalize(text), 'utf8').digest('hex').slice(0, 16);
}

// root の下の X.ja.md を探し、[en, ja]（root からの相対、/ 区切り）を返す。en がなければ en は null
export function findPairs(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name)); continue; }
      if (!e.isFile() || !e.name.endsWith('.ja.md')) continue;
      const ja = path.join(dir, e.name);
      const en = ja.slice(0, -'.ja.md'.length) + '.md';
      const rel = (p) => path.relative(root, p).split(path.sep).join('/');
      out.push([fs.existsSync(en) ? rel(en) : null, rel(ja)]);
    }
  };
  walk(root);
  return out;
}

const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');

export function checkPairs(root) {
  const warnings = [];
  const warn = (file, msg) => warnings.push({ file, msg });
  for (const [en, ja] of findPairs(root)) {
    if (!en) { warn(ja, `${ja} has no English counterpart (${ja.replace(/\.ja\.md$/, '.md')})`); continue; }
    const t = { [en]: read(root, en), [ja]: read(root, ja) };
    const stale = [];
    for (const [self, other] of [[ja, en], [en, ja]]) {
      const { stamp } = splitStamp(t[self]);
      const name = path.posix.basename(other);
      if (!stamp) { warn(self, `${self} has no i18n stamp; after checking it matches ${other}, run: npm run i18n -- --stamp ${self}`); continue; }
      if (stamp.pair !== name) { warn(self, `${self}: i18n stamp names pair=${stamp.pair}, expected ${name}`); continue; }
      if (stamp.hash !== hashOf(t[other])) stale.push([self, other]);
    }
    if (stale.length === 2) warn(ja, `${en} and ${ja} were both edited since the last sync; update ${ja} to match ${en} (English is the source), then run: npm run i18n -- --stamp ${ja}`);
    else for (const [self, other] of stale) warn(self, `${self} is older than ${other}; update it, then run: npm run i18n -- --stamp ${self}`);
  }
  return warnings;
}

// 組の両方に、今の相手のハッシュを書く。行末は元のファイルに合わせる
export function stampPair(root, en, ja) {
  const write = (self, other) => {
    const text = read(root, self);
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    const { body } = splitStamp(text);
    const line = `<!-- i18n: pair=${path.posix.basename(other)} sha256=${hashOf(read(root, other))} -->`;
    fs.writeFileSync(path.join(root, self), line + eol + body);
  };
  write(ja, en);
  write(en, ja); // ja の 1 行目が変わっても ja のハッシュは変わらない（その行は除くので）
}

export function pairOf(root, file) {
  const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
  const en = rel.endsWith('.ja.md') ? rel.slice(0, -'.ja.md'.length) + '.md' : rel;
  const ja = en.replace(/\.md$/, '.ja.md');
  if (!en.endsWith('.md') || !fs.existsSync(path.join(root, en)) || !fs.existsSync(path.join(root, ja))) return null;
  return [en, ja];
}

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = path.resolve(opt('--root') ?? path.dirname(path.dirname(fileURLToPath(import.meta.url))));
  if (argv.includes('--stamp-all')) {
    for (const [en, ja] of findPairs(root)) if (en) { stampPair(root, en, ja); console.log(`stamped ${en} + ${ja}`); }
    return 0;
  }
  const si = argv.indexOf('--stamp');
  if (si >= 0) {
    const files = argv.slice(si + 1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--root');
    if (!files.length) { console.error('usage: --stamp <file> [<file> …]'); return 2; }
    let bad = 0;
    for (const f of files) {
      const p = pairOf(root, f);
      if (!p) { console.error(`not part of an X.md + X.ja.md pair: ${f}`); bad++; continue; }
      stampPair(root, ...p); console.log(`stamped ${p[0]} + ${p[1]}`);
    }
    return bad ? 1 : 0;
  }
  if (argv.includes('--check')) {
    const ws = checkPairs(root);
    const gh = !!process.env.GITHUB_ACTIONS && !argv.includes('--plain');
    for (const w of ws) console.log(gh ? `::warning file=${w.file},line=1,title=i18n pair::${w.msg}` : `warning: ${w.msg}`);
    console.log(`i18n pairs: ${findPairs(root).length} found, ${ws.length} warning(s)`);
    return ws.length && argv.includes('--strict') ? 1 : 0;
  }
  console.error('usage: node tools/i18n-pairs.mjs --check [--strict] [--plain] | --stamp <file> … | --stamp-all  [--root <dir>]');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
