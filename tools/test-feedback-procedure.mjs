// test-all: unit
// 使い終わりの感想を報告する手順（handoff #91）の点検：make（ja・en）と studio のスキルが同じ正本（docs/llm-feedback(.ja).md）の手順を持つこと、
// 手順の種類（Type）の一覧が .github/ISSUE_TEMPLATE/feedback.yml の選択肢と一致すること、URL で埋める欄の id が feedback.yml にあること
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, feedbackRef, MAKE_SKILL_DIR } from './make-llm-guide.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

// feedback.yml を依存なしで読む：body の項目ごとに type・id と、dropdown の options
export function formFields(yml) {
  const items = yml.split(/\n  - type: /).slice(1).map((chunk) => {
    const type = chunk.split('\n')[0].trim();
    const id = chunk.match(/^    id: (\S+)$/m)?.[1] || null;
    const opts = chunk.match(/^      options:\n((?:        - .+\n?)+)/m);
    const options = opts ? opts[1].trim().split('\n').map((l) => l.replace(/^\s*- /, '').replace(/^"(.*)"$/, '$1')) : [];
    return { type, id, options };
  });
  return items;
}
// 手順の文の <!-- feedback-types --> の間の箇条書きの `…`
export function procedureTypes(text) {
  const m = text.match(/<!-- feedback-types -->\n([\s\S]*?)\n<!-- \/feedback-types -->/);
  assert.ok(m, 'feedback-types block');
  return m[1].split('\n').map((l) => l.match(/^- `([^`]+)`/)?.[1]).filter(Boolean);
}

const fields = formFields(read('.github/ISSUE_TEMPLATE/feedback.yml'));
const typeField = fields.find((f) => f.id === 'type');
assert.equal(typeField.type, 'dropdown');
assert.ok(typeField.options.includes('Insight / うまくいったこと'), 'feedback.yml offers Insight');
const ids = new Set(fields.map((f) => f.id).filter(Boolean));
for (const id of ['did', 'happened', 'made', 'worked', 'didnt', 'why', 'version', 'browser', 'os', 'context']) assert.ok(ids.has(id), `feedback.yml field ${id}`);
// 読み方の試験：小さな例
assert.deepEqual(formFields('body:\n  - type: dropdown\n    id: t\n    attributes:\n      options:\n        - "A / あ"\n        - "B"\n    validations:\n').map((f) => [f.id, f.options]), [['t', ['A / あ', 'B']]]);

const { files } = generate();
const refs = { ja: `${MAKE_SKILL_DIR}/references/feedback.md`, en: `${MAKE_SKILL_DIR}/references/en/feedback.md`, studio: 'skills/studio/references/feedback.md' };
for (const [k, f] of Object.entries(refs)) assert.equal(read(f), files[f], `${f} is generated (npm run gen)`);
// 2 か所で食い違わない：studio の手順は make の ja と同じ文
assert.equal(files[refs.studio], files[refs.ja]);
assert.equal(files[refs.ja], feedbackRef('ja'));
assert.equal(files[refs.en], feedbackRef('en'));

// スキルの本体が手順を指す
const makeJa = files[`${MAKE_SKILL_DIR}/SKILL.md`], makeEn = files[`${MAKE_SKILL_DIR}/SKILL.en.md`], studio = read('skills/studio/SKILL.md');
assert.ok(makeJa.includes('(references/feedback.md)'), 'make ja links the procedure');
assert.ok(makeEn.includes('(references/en/feedback.md)'), 'make en links the procedure');
assert.ok(studio.includes('(references/feedback.md)'), 'studio links the procedure');
assert.ok(!/gh issue create/.test(studio), 'studio keeps no second copy of the procedure');

for (const [lang, f] of [['ja', refs.ja], ['en', refs.en]]) {
  const t = files[f];
  assert.deepEqual(procedureTypes(t), typeField.options, `${lang}: types match feedback.yml`);
  const must = lang === 'ja'
    ? ['送ると決まるまで材料を集めない', '「報告は公開の Issue になり、Egatari の改善に使われます」', '指示のバージョン', 'components2.lock.json', 'git rev-parse --short HEAD', '6,000 字']
    : ['Do not gather material until the user agrees to send', '“The report becomes a public issue and is used to improve Egatari.”', 'Instruction version', 'components2.lock.json', 'git rev-parse --short HEAD', '6,000 characters'];
  for (const s of [...must, 'gh issue list -R egatari/egatari-studio --search', '--state all', '--body-file', 'issues/new?template=feedback.yml']) assert.ok(t.includes(s), `${lang}: ${s}`);
  // URL で埋める欄の id はどれも feedback.yml にある（Issue のフォームは body を読まない）
  const url = t.match(/https:\/\/github\.com\/egatari\/egatari-studio\/issues\/new\?template=feedback\.yml&[^\s`]+/)[0];
  const params = [...url.matchAll(/&([a-z]+)=/g)].map((m) => m[1]);
  for (const p of params) assert.ok(p === 'title' || ids.has(p), `${lang}: URL parameter ${p} is a field id`);
  assert.ok(!params.includes('body'));
  const listed = t.match(/`type`[^\n]*`context`/)[0].match(/`([a-z]+)`/g).map((s) => s.slice(1, -1));
  for (const p of listed) assert.ok(ids.has(p), `${lang}: listed field ${p}`);
}
console.log('ok feedback procedure: make (ja, en) and studio share one text; types match feedback.yml; prefill ids are field ids');
