// test-all: unit
// プラグインと配布するスキルの点検（backlog #126）。git add 前のファイルも読む。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generate, skillFiles, studioVersion, MAKE_SKILL_DIR } from './make-llm-guide.mjs';
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
const files = [...walk('.claude-plugin'), ...walk('skills'), ...walk('plugins/egatari'), 'README.md', 'README.ja.md', ...walk('docs')].filter((f) => /\.(md|json)$/.test(f));
const hits = files.flatMap((f) => environmentHits(read(f)).map((h) => `${f}:${h}`));
assert.deepEqual(hits, [], 'personal environment references');
console.log(`ok environment scan: ${files.length} files`);

const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
const light = JSON.parse(read('plugins/egatari/.claude-plugin/plugin.json'));
const market = JSON.parse(read('.claude-plugin/marketplace.json'));
assert.equal(plugin.name, 'egatari-studio');
assert.equal(light.name, 'egatari');
for (const p of [plugin, light]) assert.ok(!Object.hasOwn(p, 'version'));
assert.equal(market.name, 'egatari');
assert.ok(market.owner.name);
assert.deepEqual(market.plugins.map((p) => [p.name, p.source]), [['egatari', './plugins/egatari'], ['egatari-studio', './']]);
for (const p of market.plugins) {
  assert.ok(fs.statSync(path.join(ROOT, p.source)).isDirectory());
  assert.equal(JSON.parse(read(path.posix.join(p.source, '.claude-plugin/plugin.json'))).name, p.name);
}
for (const dir of ['kit', 'vendor', 'themes']) assert.ok(fs.statSync(path.join(ROOT, dir)).isDirectory());
assert.deepEqual(fs.readdirSync(path.join(ROOT, 'plugins/egatari')).sort(), ['.claude-plugin', 'skills']);
assert.deepEqual(fs.readdirSync(path.join(ROOT, 'plugins/egatari/skills')), ['make']);
assert.deepEqual(fs.readdirSync(path.join(ROOT, 'skills')), ['studio']);
for (const dir of ['make', 'parts', 'video']) assert.ok(!fs.existsSync(path.join(ROOT, 'skills', dir)));
assert.deepEqual(fs.readdirSync(path.join(ROOT, 'skills/studio/references')).sort(), ['audio-local.md', 'parts.md', 'video.md']);
for (const [f, name, triggers] of [
  [`${MAKE_SKILL_DIR}/SKILL.md`, 'make', ['motion-slides']],
  ['skills/studio/SKILL.md', 'studio', ['動画にして', 'パーツを作って', 'この図をパーツにして', 'motion-slides-video', 'motion-components', 'checking and building lessons locally']],
]) {
  const fm = read(f).match(/^---\n([\s\S]*?)\n---/)[1];
  assert.ok(fm.includes(`name: ${name}\n`));
  const desc = fm.match(/^description: (.+)$/m)[1];
  assert.ok([...desc].length <= 1024, `${f}: description exceeds 1024 characters`);
  for (const trigger of triggers) assert.ok(desc.includes(trigger), trigger);
}
for (const f of ['README.md', 'README.ja.md', 'docs/with-claude.md', 'docs/with-claude.ja.md', 'skills/studio/SKILL.md']) {
  const t = read(f);
  for (const command of ['/plugin marketplace add egatari/egatari-studio', '/plugin install egatari@egatari', '/plugin install egatari-studio@egatari', '/plugin update egatari@egatari', '/plugin update egatari-studio@egatari']) assert.ok(t.includes(command), `${f}: ${command}`);
  if (!f.startsWith('skills/')) assert.ok(t.includes('~/.claude/skills/motion-*'));
  assert.doesNotMatch(t, /ln -s|ItemType Junction/);
}
console.log('ok both plugin payloads, names, references and installation');

const { files: generated, data } = generate();
const payload = Object.keys(generated).filter((f) => f.startsWith('plugins/egatari/')).sort();
assert.deepEqual(walk('plugins/egatari').sort(), payload, 'light contains only its manifest and generated make');
for (const f of [...payload, 'skills/studio/SKILL.md']) assert.deepEqual(fs.readFileSync(path.join(ROOT, f)), Buffer.from(generated[f]), f);
const make = read(`${MAKE_SKILL_DIR}/SKILL.md`), studio = read('skills/studio/SKILL.md');
assert.ok(make.includes(data.version));
assert.ok(make.includes('新しいパーツがあります'));
assert.doesNotMatch(make, /ffmpeg|動画|\bvideo\b/i);
// Every make file is safe to read in a chat with no local environment.
const makeForbidden = ['<repo>', 'npm', 'node ', 'npx', 'tools/', 'kit/', '/Users/', '100.64', '8882', 'brew', 'LaunchAgent', 'gendo'];
function checkMake(text, file) {
  for (const token of makeForbidden) assert.ok(!text.includes(token), `${file}: forbidden ${token}`);
}
for (const f of walk(MAKE_SKILL_DIR)) checkMake(read(f), f);
for (const token of makeForbidden) assert.throws(() => checkMake(token, 'fixture'), /forbidden/);
assert.doesNotMatch(make, /CLI：|コマンドを動かせるときだけ読む/);
assert.ok(!fs.existsSync(path.join(ROOT, MAKE_SKILL_DIR, 'references/audio-local.md')));
const versionLine = (text) => text.match(/^\*\*指示の版：[a-f0-9]{8}\*\*$/m)?.[0];
assert.ok(versionLine(make));
assert.equal(versionLine(studio), versionLine(make));
assert.ok(studio.includes('egatari:make'));
// Updating the generated version must preserve every byte of hand-written Studio text.
const modifiedStudio = studio.replace('教材をローカルで確かめて組む', '手書きの見出しを保つ');
assert.equal(studioVersion(modifiedStudio, '1234abcd'), modifiedStudio.replace(versionLine(studio), '**指示の版：1234abcd**'));
assert.throws(() => studioVersion('no marker', data.version), /exactly one/);
for (const [old, owner] of [['motion-slides', MAKE_SKILL_DIR], ['motion-slides-video', 'skills/studio'], ['motion-components', 'skills/studio']]) {
  const owners = [MAKE_SKILL_DIR, 'skills/studio'].filter((dir) => walk(dir).some((f) => new RegExp(`(^|[^a-zA-Z0-9-])${old}($|[^a-zA-Z0-9-])`).test(read(f))));
  assert.deepEqual(owners, [owner], `${old}: exactly one skill owns the old name`);
}
// Relative Markdown links must resolve inside the corresponding plugin bundle.
function checkLinks(files, bundleRoot) {
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const text = read(file).replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');
    for (const [, href] of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) continue;
      const target = path.resolve(ROOT, path.dirname(file), decodeURIComponent(href.split('#')[0]));
      const base = path.resolve(ROOT, bundleRoot);
      assert.ok(target.startsWith(base + path.sep), `${file}: link escapes bundle: ${href}`);
      assert.ok(fs.existsSync(target) && fs.statSync(target).isFile(), `${file}: missing linked file ${href}`);
    }
  }
}
checkLinks(walk(MAKE_SKILL_DIR), 'plugins/egatari');
checkLinks(walk('skills/studio'), '.');
for (const tool of ['npm ci', 'tools/new.mjs', 'kit/check.mjs', 'tools/ids.mjs', 'tools/sheet.mjs', 'server/dev.mjs', 'tools/comment-shots.mjs', 'kit/build.mjs', 'CLI：パーツ', 'CLI：id', 'tier', 'set', 'standard', 'specialized', 'extra']) assert.ok(studio.includes(tool), tool);
assert.ok(studio.includes('この SKILL.md のあるフォルダから 2 つ上'));
for (const ref of ['audio-local', 'video', 'parts']) assert.ok(studio.includes(`(references/${ref}.md)`));
assert.ok(make.includes('egatari-studio') && make.includes('https://studio.egatari.org/') && make.includes('Safari'));
for (const tag of Object.keys(data.ja.components)) assert.ok(Object.entries(generated).some(([f, t]) => f.startsWith(`${MAKE_SKILL_DIR}/references/parts/`) && t.includes(`### \`<${tag}>\``)), tag);
// 特殊が入っても本文や props を複製しない。セット名も manifest から読む。
const sample = skillFiles(data, { 'm-bars': { tier: 'extra' }, 'm-flow': { set: 'custom' } });
const extra = sample[`${MAKE_SKILL_DIR}/references/parts/extra.md`];
assert.ok(extra.includes('bars/README.md'));
assert.ok(!extra.includes(data.ja.components['m-bars'].entry));
assert.ok(!sample[`${MAKE_SKILL_DIR}/references/parts/common.md`].includes('### `<m-bars>`'));
assert.ok(sample[`${MAKE_SKILL_DIR}/references/parts/custom.md`].includes('### `<m-flow>`'));
assert.ok(Buffer.byteLength(generated[`${MAKE_SKILL_DIR}/references/parts/common.md`]) > 40 * 1024, 'skill references have no paste-in cap');
const standard = skillFiles(data, { 'm-bars': { tier: 'standard', set: 'ignored' } });
assert.ok(standard[`${MAKE_SKILL_DIR}/references/parts/standard.md`].includes('### `<m-bars>`'));
const tiers = skillFiles(data, { ...Object.fromEntries(Object.keys(data.ja.components).map((tag) => [tag, { tier: 'standard' }])), 'm-flow': { tier: 'specialized', set: 'custom' }, 'm-bars': { tier: 'extra' } });
assert.deepEqual(Object.keys(tiers).filter((f) => f.startsWith(`${MAKE_SKILL_DIR}/references/parts/`) && !f.includes('/en/')).map((f) => path.basename(f)).sort(), ['custom.md', 'extra.md', 'standard.md']);
for (const language of ['ja', 'en']) {
  const text = generated[`${MAKE_SKILL_DIR}/${language === 'ja' ? 'SKILL.md' : 'SKILL.en.md'}`];
  assert.ok(text.indexOf(language === 'ja' ? '## 書き終えたら' : '## When you finish') < text.indexOf(language === 'ja' ? '# AI への指示' : '# Instructions for the AI'));
  for (const label of ['フォルダで作業する…', 'Work in a folder…', '新規作成…', 'New…']) {
    assert.ok(read('app/i18n.js').includes(`'${label}'`), label);
    assert.ok(text.includes(label), `${language}: ${label}`);
  }
  const description = text.match(/^description: (.+)$/m)[1];
  assert.ok([...description].length <= 1024);
  const book = read(`docs/llm-book${language === 'ja' ? '.ja' : ''}.md`).replace(/^<!-- i18n:.*-->\n/, '').trim();
  assert.ok(text.includes(book), `${language}: book comes from docs`);
}
console.log('ok generated payloads, writing/local split, versions, links and all part sets');

// Read ZIP metadata independently of the writer, including CRC and central directory offsets.
function readSkillZip(zip) {
  const eocd = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50);
  assert.equal(zip.readUInt16LE(eocd + 8), zip.readUInt16LE(eocd + 10));
  assert.equal(zip.readUInt16LE(eocd + 20), 0);
  let pos = zip.readUInt32LE(eocd + 16), localEnd = 0;
  assert.equal(pos + zip.readUInt32LE(eocd + 12), eocd);
  const contents = new Map();
  for (let i = 0; i < zip.readUInt16LE(eocd + 10); i++) {
    assert.equal(zip.readUInt32LE(pos), 0x02014b50);
    assert.equal(zip.readUInt16LE(pos + 8), 0x800);
    assert.equal(zip.readUInt16LE(pos + 10), 0); // stored
    const size = zip.readUInt32LE(pos + 24), len = zip.readUInt16LE(pos + 28);
    assert.equal(zip.readUInt32LE(pos + 20), size);
    const name = zip.subarray(pos + 46, pos + 46 + len).toString();
    const offset = zip.readUInt32LE(pos + 42);
    assert.equal(offset, localEnd);
    assert.equal(zip.readUInt32LE(offset), 0x04034b50);
    assert.deepEqual(zip.subarray(offset + 4, offset + 30), zip.subarray(pos + 6, pos + 32));
    assert.equal(zip.subarray(offset + 30, offset + 30 + len).toString(), name);
    const start = offset + 30 + len + zip.readUInt16LE(offset + 28);
    const bytes = zip.subarray(start, start + size);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, zip.readUInt32LE(pos + 16), name);
    assert.ok(!contents.has(name), name);
    contents.set(name, bytes);
    localEnd = start + size;
    pos += 46 + len + zip.readUInt16LE(pos + 30) + zip.readUInt16LE(pos + 32);
  }
  assert.equal(pos, eocd);
  assert.equal(localEnd, zip.readUInt32LE(eocd + 16));
  return contents;
}
function checkZip(zip, generated) {
  const contents = readSkillZip(zip);
  const expected = Object.entries(generated).filter(([f]) => f.startsWith(MAKE_SKILL_DIR + '/')).map(([f, text]) => ['make/' + f.slice(MAKE_SKILL_DIR.length + 1), Buffer.from(text)]);
  assert.deepEqual([...contents.keys()].sort(), expected.map(([f]) => f).sort());
  for (const [f, bytes] of expected) { assert.deepEqual(contents.get(f), bytes, f); checkMake(contents.get(f).toString(), f); }
  return contents;
}
const zipDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-skill-zip-'));
try {
  for (const lang of ['ja', 'en']) {
    const command = () => spawnSync(process.execPath, [path.join(ROOT, 'tools/make-llm-guide.mjs'), '--zip', zipDir, '--lang', lang], { encoding: 'utf8' });
    const r = command();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const file = path.join(zipDir, 'egatari-make-skill.zip'), zip = fs.readFileSync(file);
    const contents = checkZip(zip, generate({ skillLang: lang }).files);
    assert.deepEqual(contents.get('make/SKILL.md'), Buffer.from(generated[`${MAKE_SKILL_DIR}/${lang === 'ja' ? 'SKILL.md' : 'SKILL.en.md'}`]));
    assert.equal(command().status, 0);
    assert.deepEqual(fs.readFileSync(file), zip, `${lang}: ZIP generation is deterministic`);
    const release = path.join(ROOT, 'out/release/egatari-make-skill.zip');
    // The ignored release artifact is optional in a clean checkout; check it when present.
    if (lang === 'ja' && fs.existsSync(release)) assert.deepEqual(fs.readFileSync(release), zip, 'release ZIP is current');
  }
} finally { fs.rmSync(zipDir, { recursive: true, force: true }); }
console.log('ok upload ZIP contains the exact generated make bytes');

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
