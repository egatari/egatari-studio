// パーツの段 local（ローカル（CLI）向け、backlog #213）の試験
// test-all: unit
//   node tools/test-local-tier.mjs
// 1. manifest の段 local のパーツで tiersFrom が投げず、段と束の一覧（新規作成のパーツの一覧・言いたいことの表の材料）に入らない。知らない段は今までどおり投げる
// 2. local のパーツを足しても、チャットの指示の材料（llm-pack-data の中身と指示のバージョン）と、組み立てた指示（無料・有料、すべての束の組み合わせの代表）はバイトまで同じ
// 3. CLI のスキルの参照にだけ書く：references/parts/local.md（ja・en）と SKILL の一覧の 1 行。ほかのファイルは同じ
import assert from 'node:assert/strict';
import { generate, tiersFrom, catalogue } from './make-llm-guide.mjs';
import { buildPack } from '../kit/core/llm-pack.mjs';

let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok  ', name); };
const cat = catalogue();
const withTier = (tier) => ({ ...cat, manifest: { ...cat.manifest, components: { ...cat.manifest.components, trace: { kind: 'element', tag: 'm-trace', tier, purposes: ['process'] } } } });

ok('tiersFrom: tier local is accepted and left out of the parts list; an unknown tier still throws', () => {
  const t = tiersFrom(withTier('local'));
  assert.equal(t.parts['m-trace'], undefined);
  assert.deepEqual(t, tiersFrom(cat));
  assert.throws(() => tiersFrom(withTier('mystery')), /has tier "mystery"/);
});

const LOCAL = [{ fm: { name: 'm-trace' }, body: 'ローカルのトレーサーの出力を、行ごとに見せる。\n\n- `src`：トレースの JSON', en: { body: 'Shows a local tracer\'s output line by line.\n\n- `src`: the trace JSON' } }];
const a = generate(), b = generate({ addLocal: LOCAL });
ok('the chat instructions are byte-identical with a local part: pack data and instruction version', () => {
  assert.equal(JSON.stringify(b.data), JSON.stringify(a.data));
  for (const f of Object.keys(a.files)) if (!/plugins\/egatari\/skills\/make\/(SKILL(\.en)?\.md|references\/)/.test(f)) assert.equal(b.files[f], a.files[f], f);
  assert.equal(JSON.stringify(b.sizes), JSON.stringify(a.sizes));
});
ok('no assembled pack mentions m-trace (free and paid, ja and en)', () => {
  for (const lang of ['ja', 'en']) for (const plan of ['free', 'paid']) {
    const text = String(buildPack({ lang, plan, sets: a.data.sets }).text ?? buildPack({ lang, plan, sets: a.data.sets }));
    assert.ok(!text.includes('m-trace'), `${lang} ${plan}`);
  }
});
ok('the skill gets references/parts/local.md (ja and en) and a line in its list; nothing else in the skill changes', () => {
  const ja = Object.keys(b.files).find((f) => f.endsWith('references/parts/local.md')), en = Object.keys(b.files).find((f) => f.endsWith('references/parts/en/local.md'));
  assert.ok(ja && en);
  assert.match(b.files[ja], /ローカル（CLI）向けのパーツ。Claude Code・Codex などの CLI/);
  assert.match(b.files[ja], /### `<m-trace>`\n\nローカルのトレーサーの出力/);
  assert.match(b.files[en], /Local \(CLI\) only parts/);
  assert.match(b.files[en], /Shows a local tracer's output/);
  const added = Object.keys(b.files).filter((f) => !(f in a.files)).sort();
  assert.deepEqual(added, [ja, en].sort());
  const changed = Object.keys(a.files).filter((f) => a.files[f] !== b.files[f]);
  for (const f of changed) {
    assert.match(f, /SKILL(\.en)?\.md$/, f);
    const plus = b.files[f].split('\n').filter((l) => !a.files[f].split('\n').includes(l));
    assert.ok(plus.length === 1 && /\[local\]\(references\/parts\/(en\/)?local\.md\)/.test(plus[0]), f + ': ' + plus.join(' | '));
  }
});
ok('without a local part nothing is written for it', () => {
  assert.ok(!Object.keys(a.files).some((f) => f.endsWith('/local.md')));
});
console.log(`local-tier: ${n} ok`);
