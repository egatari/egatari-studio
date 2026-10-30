// test-all: unit
// プラグインと配布するスキルの点検（backlog #126）。git add 前のファイルも読む。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generate, skillFiles } from './make-llm-guide.mjs';
import { videoPlan } from './video.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const f = dir + '/' + e.name;
  return e.isDirectory() ? walk(f) : e.isFile() ? [f] : [];
});
const forbidden = ['br' + 'ew', '100' + '.64', '/' + 'Users/', 'gen' + 'do', 'Launch' + 'Agent', 'marp' + '-tts', 'Mac' + ' Studio', 'Head' + 'scale'];
export function environmentHits(text) {
  return text.split('\n').flatMap((line, i) => {
    const hits = forbidden.filter((s) => line.includes(s));
    // ポートの数字を許すのは、同じ行で IRODORI_URL の既定と明記したときだけ。
    if (/8882/.test(line) && !(/IRODORI_URL/.test(line) && /既定|default/i.test(line) && /localhost:8882/.test(line))) hits.push('undocumented default port');
    return hits.map((s) => `${i + 1}: ${s}`);
  });
}
for (const s of forbidden) assert.ok(environmentHits(s).length, s);
assert.ok(environmentHits('8882').length);
assert.ok(environmentHits('IRODORI_URL http://localhost:8882').length);
assert.deepEqual(environmentHits('IRODORI_URL default http://localhost:8882'), []);
const files = [...walk('.claude-plugin'), ...walk('skills'), 'README.md', 'README.ja.md', ...walk('docs')].filter((f) => /\.(md|json)$/.test(f));
const hits = files.flatMap((f) => environmentHits(read(f)).map((h) => `${f}:${h}`));
assert.deepEqual(hits, [], 'personal environment references');
console.log(`ok environment scan: ${files.length} files`);

const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
const market = JSON.parse(read('.claude-plugin/marketplace.json'));
assert.equal(plugin.name, 'egatari');
assert.equal(market.name, 'egatari');
assert.ok(market.owner.name);
assert.deepEqual(market.plugins.map((p) => [p.name, p.source]), [['egatari', './']]);
for (const dir of ['kit', 'vendor', 'themes']) assert.ok(fs.statSync(path.join(ROOT, market.plugins[0].source, dir)).isDirectory());
const names = fs.readdirSync(path.join(ROOT, 'skills')).sort();
assert.deepEqual(names, ['make', 'parts', 'video']);
for (const [name, old] of [['make', 'motion-slides'], ['parts', 'motion-components'], ['video', 'motion-slides-video']]) {
  const fm = read(`skills/${name}/SKILL.md`).match(/^---\n([\s\S]*?)\n---/)[1];
  assert.ok(fm.includes(`name: ${name}\n`));
  assert.ok(fm.match(/^description: .+$/m)[0].includes(old));
}
for (const f of ['README.md', 'README.ja.md', 'docs/with-claude.md', 'docs/with-claude.ja.md']) {
  const t = read(f);
  assert.ok(t.includes('/plugin marketplace add egatari/egatari-studio'));
  assert.ok(t.includes('/plugin install egatari@egatari'));
  assert.ok(t.includes('~/.claude/skills/motion-*'));
  assert.doesNotMatch(t, /ln -s|ItemType Junction/);
}
console.log('ok plugin payload, names and installation');

const { files: generated, data } = generate();
for (const [f, t] of Object.entries(generated).filter(([f]) => f.startsWith('skills/'))) assert.equal(read(f), t, f);
const make = read('skills/make/SKILL.md');
assert.ok(make.includes(data.version));
assert.ok(make.includes('新しいパーツがあります'));
assert.doesNotMatch(make, /ffmpeg|動画|\bvideo\b/i);
for (const tool of ['kit/check.mjs', 'tools/ids.mjs', 'server/dev.mjs', 'tools/comment-shots.mjs', 'kit/build.mjs']) assert.ok(make.includes(tool), tool);
assert.ok(make.indexOf('kit/check.mjs') > make.indexOf('# コマンドを動かせるときだけ読む'));
assert.ok(make.indexOf('tools/ids.mjs') > make.indexOf('# コマンドを動かせるときだけ読む'));
for (const tag of Object.keys(data.ja.components)) assert.ok(Object.entries(generated).some(([f, t]) => f.startsWith('skills/make/references/parts/') && t.includes(`### \`<${tag}>\``)), tag);
// 特殊が入っても本文や props を複製しない。セット名も manifest から読む。
const sample = skillFiles(data, { 'm-bars': { tier: 'extra' }, 'm-flow': { set: 'custom' } });
const extra = sample['skills/make/references/parts/extra.md'];
assert.ok(extra.includes('bars/README.md'));
assert.ok(!extra.includes(data.ja.components['m-bars'].entry));
assert.ok(!sample['skills/make/references/parts/common.md'].includes('### `<m-bars>`'));
assert.ok(sample['skills/make/references/parts/custom.md'].includes('### `<m-flow>`'));
assert.ok(Buffer.byteLength(generated['skills/make/references/parts/common.md']) > 40 * 1024, 'skill references have no paste-in cap');
console.log('ok generated body and all part sets, extra pointers, no paste-in cap');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-video-'));
try {
  const absent = spawnSync(process.execPath, [path.join(ROOT, 'tools/video.mjs'), tmp], { encoding: 'utf8', env: { ...process.env, PATH: tmp } });
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /ffmpeg is required.*Colab/);
  assert.deepEqual(fs.readdirSync(tmp), [], 'missing ffmpeg stops before building or rendering');
  const folder = videoPlan(tmp);
  assert.equal(folder.commands[0][0], 'kit/build.mjs');
  assert.equal(folder.commands[1][0], 'render/render.mjs');
  const file = path.join(tmp, '音声のある教材.play.ega.html');
  fs.writeFileSync(file, '');
  assert.deepEqual(videoPlan(file).commands, [['render/render.mjs', file, '--out', file.slice(0, -9) + '.video', '--full']]);
  assert.throws(() => videoPlan(import.meta.filename), /working folder/);
  assert.ok([...folder.commands, ...videoPlan(file).commands].every((args) => !args.some((s) => /synth|tts/.test(s))));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('ok video entry point uses existing audio only');
