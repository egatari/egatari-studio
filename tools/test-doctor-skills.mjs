// egatari doctor が、旧 README のシンボリックリンク ~/.claude/skills/motion-* の残りを見つけること（一時の HOME で。何も消さない）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-doctor-skills.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI = path.join(ROOT, 'bin/egatari.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-skills-'));
const doctor = (home) => {
  const r = spawnSync(process.execPath, [CLI, 'doctor'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home }, timeout: scaled(60000) });
  return r.stdout + r.stderr;
};
const home = (name) => { const h = path.join(tmp, name); fs.mkdirSync(path.join(h, '.claude', 'skills'), { recursive: true }); return h; };

// 1. 何もない
assert.match(doctor(home('empty')), /ok   skills\s+古いスキルの置き場なし/);

// 2. 切れたリンク・移動のお知らせの項目・他のスキル・生きた別のスキル
const h = home('old');
const sk = path.join(h, '.claude', 'skills');
fs.symlinkSync(path.join(tmp, 'gone', 'motion-slides'), path.join(sk, 'motion-slides'));
fs.mkdirSync(path.join(sk, 'motion-components'));
fs.writeFileSync(path.join(sk, 'motion-components', 'SKILL.md'), '---\nname: motion-components\n---\nThis skill moved into the egatari plugin. Delete ...\n');
fs.mkdirSync(path.join(sk, 'motion-other'));
fs.writeFileSync(path.join(sk, 'motion-other', 'SKILL.md'), '---\nname: motion-other\n---\nmine\n');
fs.mkdirSync(path.join(sk, 'unrelated'));
const out = doctor(h);
assert.match(out, /--   skills/);
assert.ok(out.includes(path.join(sk, 'motion-slides')) && out.includes('dead link'));
assert.ok(out.includes(path.join(sk, 'motion-components')) && out.includes('moved notice'));
assert.ok(!out.includes('motion-other') && !out.includes('unrelated'));
for (const c of ['/plugin marketplace add egatari/egatari-studio', '/plugin install egatari@egatari', '/plugin install egatari-studio@egatari']) assert.ok(out.includes(c), c);
// 読むだけ：何も消えていない
assert.deepEqual(fs.readdirSync(sk).sort(), ['motion-components', 'motion-other', 'motion-slides', 'unrelated']);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok doctor: old skill entries');
