// Bun でも動くこと（CI の bun ジョブ。.github/workflows/test.yml）：npm pack した tarball をリポジトリの外の一時フォルダに入れ（tools/test-npm-pack.mjs と同じ）、
// bunx --bun egatari（Bun の実行系。#!/usr/bin/env node の node も Bun になる）で new・check・build・build --portable を走らせ、
// 同じフォルダで Node（npx egatari）が組んだものとバイトまで同じかを比べる。違えば失敗
//   node tools/bun-check.mjs [作業フォルダ] [--keep]   （bun が PATH にあること。npm test には入れない）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const keep = args.includes('--keep');
let work = args.find((a) => !a.startsWith('--'));
// リポジトリの中では node_modules を上にたどって見つけてしまうので、外に作る（test-npm-pack と同じ）
if (!work || path.resolve(work).startsWith(ROOT + path.sep)) work = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-bun-'));
work = path.resolve(work);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };
const WIN = process.platform === 'win32';
const sh = (cmd, argv, cwd) => {
  if (WIN) argv = argv.map((a) => (/[\s&()^|<>]/.test(a) ? `"${a}"` : a));
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', shell: WIN, maxBuffer: 64 << 20, timeout: 600000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', error: r.error };
};
const must = (r, what) => { assert.equal(r.code, 0, `${what} failed (${r.code})${r.error ? ' ' + r.error.message : ''}\n${r.out.slice(-3000)}`); return r; };

const proj = path.join(work, 'proj');
const user = path.join(proj, 'lessons');
const deck = path.join(user, 'deck');
const bun = (argv) => sh('bunx', ['--bun', 'egatari', ...argv], user);
const node = (argv) => sh('npx', ['--no', '--', 'egatari', ...argv], user);

await t('npm pack と npm install <tarball>（リポジトリの外）', () => {
  const r = must(sh('npm', ['pack', '--json', '--pack-destination', work], ROOT), 'npm pack');
  const tgz = path.join(work, JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].filename);
  fs.mkdirSync(user, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'egatari-bun-test', version: '0.0.0', private: true }, null, 2));
  must(sh('npm', ['install', path.relative(proj, tgz).split(path.sep).join('/'), '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund'], proj), 'npm install');
});

await t('bunx --bun は Bun の実行系で動かす（node の名前も Bun になる）', () => {
  const v = must(sh('bunx', ['--bun', 'node', '-p', 'process.versions.bun || ""'], user), 'bunx --bun node').stdout.trim();
  assert.match(v, /^\d+\.\d+\.\d+/, 'process.versions.bun under bunx --bun: ' + JSON.stringify(v));
  console.log('     bun ' + v);
});

await t('bunx --bun egatari new deck：deck.html・narration.md・egatari.json', () => {
  must(bun(['new', 'deck', '--lang', 'en']), 'new');
  for (const f of ['deck.html', 'narration.md', 'egatari.json']) assert.ok(fs.existsSync(path.join(deck, f)), f);
});

await t('bunx --bun egatari check：エラー 0', () => {
  const r = must(bun(['check', 'deck/deck.html', '--json']), 'check');
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.equal(j.counts.error, 0, r.stdout.slice(0, 2000));
});

// 同じフォルダで Node が先に組み（--portable が egatari.json に docId を書いても、Bun は同じ docId を読む）、Bun の出力と比べる
const same = (what, file) => {
  const a = fs.readFileSync(file);
  return (b) => assert.ok(a.equals(b), `${what}: Bun's output differs from Node's (${a.length} vs ${b.length} bytes, first difference at byte ${[...a].findIndex((x, i) => x !== b[i])})`);
};
await t('bunx --bun egatari build：out/deck.html が Node の build とバイトまで同じ', () => {
  must(node(['build', 'deck/deck.html']), 'build (node)');
  const out = path.join(deck, 'out', 'deck.html');
  const eq = same('build', out);
  fs.rmSync(out);
  must(bun(['build', 'deck/deck.html']), 'build (bun)');
  eq(fs.readFileSync(out));
});

await t('bunx --bun egatari build --portable：.ega.html が Node の build --portable とバイトまで同じ', () => {
  must(node(['build', 'deck/deck.html', '--portable']), 'build --portable (node)');
  const f = fs.readdirSync(deck).find((x) => x.endsWith('.ega.html'));
  assert.ok(f, 'no .ega.html');
  const eq = same('build --portable', path.join(deck, f));
  fs.rmSync(path.join(deck, f));
  must(bun(['build', 'deck/deck.html', '--portable']), 'build --portable (bun)');
  eq(fs.readFileSync(path.join(deck, f)));
});

if (!keep && !fail) fs.rmSync(work, { recursive: true, force: true });
else console.log('work: ' + work);
console.log(fail ? `${fail} / ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
