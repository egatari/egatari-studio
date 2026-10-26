// CHANGELOG の断片（changes/<短い名前>.md）を検める・見る・版にまとめる（CONTRIBUTING.md「Changelog」・RELEASING.md）
//   node tools/changelog.mjs --check [--base <ref>]     断片の書き方を確かめる（間違いがあれば終了コード 1。npm test と CI）。
//                                                     --base があれば、そこからコードが変わったのに断片が増えていないとき知らせる（知らせだけ。終了コード 0）
//   node tools/changelog.mjs --preview [X.Y.Z]         まとめた節を出すだけ（何も書かない）
//   node tools/changelog.mjs --release X.Y.Z [--date YYYY-MM-DD]
//                                                     断片を CHANGELOG.md の「## [X.Y.Z] - 日付」にまとめ、比べるリンクを直し、
//                                                     package.json と package-lock.json の版を X.Y.Z にし、断片を消す
//   どれも [--root <dir>]（既定はリポジトリ。試験用）
// 断片の形：見出しの行「### <節>」（節は SECTIONS のどれか）と、その下の「- 」で始まる 1〜2 行の項目。1 つの断片に節がいくつあってもよい。
// 項目の続きの行は空白で始める。空行はかまわない。それ以外の行は間違い
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SECTIONS = ['Added', 'Changed (API)', 'Changed', 'Removed', 'Fixed', 'Security'];
// コードが変わったと見なす場所（--check --base）。文書・試験・CI だけの変更には断片は要らない
const CODE = /^(app|kit|vendor\/components|vendor\/themes|server|render|tts|themes|lab|skills)\/|^(package|components\.lock|themes\.lock)\.json$/;
const FRAG = /^[a-z0-9][a-z0-9._-]*\.md$/;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = path.resolve(opt('--root') || path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIR = path.join(ROOT, 'changes');
const CL = path.join(ROOT, 'CHANGELOG.md');
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
const gha = !!process.env.GITHUB_ACTIONS;
const warn = (msg, file) => console.log(gha ? `::warning${file ? ` file=${file}` : ''}::${msg}` : `warning: ${msg}`);

// 断片を読む → {files: [名前], sections: Map(節 → [項目の行の塊]), errors: [文字列]}
function readFragments(dir = DIR) {
  const errors = [];
  const sections = new Map(SECTIONS.map((s) => [s, []]));
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')).sort() : [];
  for (const f of files) {
    if (!FRAG.test(f)) { errors.push(`changes/${f}: name must be <short-name>.md (lowercase letters, digits, . _ -)`); continue; }
    const lines = read(path.join(dir, f)).split('\n');
    let sec = null, cur = null, n = 0;
    lines.forEach((ln, i) => {
      const at = `changes/${f}:${i + 1}`;
      if (!ln.trim()) { cur = null; return; }
      const h = ln.match(/^###\s+(.+?)\s*$/);
      if (h) {
        if (!SECTIONS.includes(h[1])) errors.push(`${at}: unknown section "${h[1]}" (use one of: ${SECTIONS.join(', ')})`);
        sec = SECTIONS.includes(h[1]) ? h[1] : null; cur = null;
        return;
      }
      if (/^- \S/.test(ln)) {
        if (!sec) { errors.push(`${at}: entry before a section header (### ${SECTIONS[0]} …)`); return; }
        cur = [ln]; sections.get(sec).push(cur); n++;
        return;
      }
      if (/^\s+\S/.test(ln) && cur) { cur.push(ln); return; }
      errors.push(`${at}: expected "### <section>", "- entry" or an indented continuation line`);
    });
    if (!n) errors.push(`changes/${f}: no entries`);
  }
  return { files, sections, errors };
}

function render(sections) {
  const out = [];
  for (const s of SECTIONS) {
    const items = sections.get(s) || [];
    if (items.length) out.push(`### ${s}\n\n${items.map((x) => x.join('\n')).join('\n')}\n`);
  }
  return out.join('\n');
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const SEMVER = /^\d+\.\d+\.\d+$/;

function fail(msg) { console.error(`changelog: ${msg}`); process.exit(1); }

// CHANGELOG.md に版の節を入れる（文字列 → 文字列）
function release(text, version, date, body) {
  const lines = text.split('\n');
  const u = lines.findIndex((l) => /^## \[Unreleased\]\s*$/.test(l));
  if (u < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" heading');
  if (lines.some((l) => l.startsWith(`## [${version}]`))) throw new Error(`CHANGELOG.md already has ${version}`);
  let next = lines.findIndex((l, i) => i > u && /^## \[/.test(l));
  if (next < 0) next = lines.findIndex((l, i) => i > u && /^\[.+\]: /.test(l));
  if (next < 0) next = lines.length;
  const between = lines.slice(u + 1, next).filter((l) => l.trim() && !/^<!--.*-->$/.test(l.trim()));
  if (between.length) throw new Error('"## [Unreleased]" has entries in CHANGELOG.md: move them into changes/*.md first');
  const keep = lines.slice(u + 1, next).filter((l) => /^<!--.*-->$/.test(l.trim()));
  const head = [...lines.slice(0, u + 1), ...(keep.length ? ['', ...keep] : []), '', `## [${version}] - ${date}`, '', ...body.replace(/\n+$/, '').split('\n'), ''];
  let rest = lines.slice(next);
  const li = rest.findIndex((l) => /^\[Unreleased\]: /.test(l));
  if (li >= 0) {
    const m = rest[li].match(/^\[Unreleased\]: (.+\/compare\/)(v\d+\.\d+\.\d+)\.\.\.HEAD\s*$/);
    if (!m) throw new Error(`cannot read the [Unreleased] link: ${rest[li]}`);
    rest = [...rest.slice(0, li), `[Unreleased]: ${m[1]}v${version}...HEAD`, `[${version}]: ${m[1]}${m[2]}...v${version}`, ...rest.slice(li + 1)];
  }
  return [...head, ...rest].join('\n');
}

function setVersion(file, version) {
  if (!fs.existsSync(file)) return;
  const raw = read(file);
  const j = JSON.parse(raw);
  if (JSON.stringify(j, null, 2) + '\n' !== raw) fail(`${path.basename(file)} is not in npm's format (2-space JSON): set the version by hand`);
  j.version = version;
  if (j.packages && j.packages['']) j.packages[''].version = version;
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
}

function changedFiles(base) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const mb = git('merge-base', base, 'HEAD').trim();
  return git('diff', '--name-status', mb, 'HEAD').split('\n').filter(Boolean).map((l) => l.split('\t'));
}

const { files, sections, errors } = readFragments();

if (args.includes('--check')) {
  for (const e of errors) console.log(gha ? `::error::${e}` : `error: ${e}`);
  const base = opt('--base');
  if (base) {
    let ch = null;
    try { ch = changedFiles(base); } catch (e) { warn(`cannot compare with ${base}: ${String(e.message).split('\n')[0]}`); }
    if (ch) {
      const code = ch.filter(([, f]) => CODE.test(f)).map(([, f]) => f);
      const added = ch.filter(([st, f]) => st === 'A' && /^changes\/[^/]+\.md$/.test(f));
      if (code.length && !added.length) warn(`code changed since ${base} (${code.slice(0, 3).join(', ')}${code.length > 3 ? ', …' : ''}) but no changes/*.md fragment was added; add one if users or callers will notice (see CONTRIBUTING.md "Changelog")`);
      else console.log(`changelog: ${added.length} fragment(s) added since ${base}, ${code.length} code file(s) changed`);
    }
  }
  console.log(errors.length ? `changelog: ${errors.length} problem(s) in changes/` : `changelog: ${files.length} fragment(s) ok`);
  process.exit(errors.length ? 1 : 0);
}

if (args.includes('--preview')) {
  if (errors.length) fail(errors.join('\n'));
  const v = opt('--preview');
  const body = render(sections);
  console.log(`## [${v && SEMVER.test(v) ? v : 'Unreleased'}] - ${opt('--date') || today()}\n\n${body || '(no fragments in changes/)\n'}`);
  process.exit(0);
}

if (args.includes('--release')) {
  const v = opt('--release');
  if (!v || !SEMVER.test(v)) fail('usage: --release X.Y.Z (three numbers; rc versions are tags only, not CHANGELOG sections)');
  const date = opt('--date') || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('--date must be YYYY-MM-DD');
  if (errors.length) fail(errors.join('\n'));
  const body = render(sections);
  if (!body) fail('no fragments in changes/: nothing to release');
  let text;
  try { text = release(read(CL), v, date, body); } catch (e) { fail(e.message); }
  fs.writeFileSync(CL, text);
  setVersion(path.join(ROOT, 'package.json'), v);
  setVersion(path.join(ROOT, 'package-lock.json'), v);
  for (const f of files) fs.rmSync(path.join(DIR, f));
  console.log(`CHANGELOG.md: [${v}] - ${date} from ${files.length} fragment(s); package.json and package-lock.json set to ${v}; fragments removed`);
  process.exit(0);
}

console.error('usage: node tools/changelog.mjs --check [--base <ref>] | --preview [X.Y.Z] | --release X.Y.Z [--date YYYY-MM-DD]  [--root <dir>]');
process.exit(1);
