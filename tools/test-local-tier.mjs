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

// 部品庫 2.12.0 から既定のカタログに本物の m-trace がある。試験はもう 1 つ架空のローカルのパーツ（m-tracex）を足して比べる
const LOCAL = [{ fm: { name: 'm-tracex' }, body: 'ローカルのトレーサーの出力を、行ごとに見せる。\n\n- `src`：トレースの JSON', en: { body: 'Shows a local tracer\'s output line by line.\n\n- `src`: the trace JSON' } }];
const a = generate(), b = generate({ addLocal: LOCAL });
ok('the chat instructions are byte-identical with one more local part: pack data and instruction version', () => {
  assert.equal(JSON.stringify(b.data), JSON.stringify(a.data));
  for (const f of Object.keys(a.files)) if (!/plugins\/egatari\/skills\/make\/references\/parts\/(en\/)?local\.md$/.test(f)) assert.equal(b.files[f], a.files[f], f);
  assert.equal(JSON.stringify(b.sizes), JSON.stringify(a.sizes));
});
ok('no assembled pack mentions m-trace (free and paid, ja and en)', () => {
  for (const lang of ['ja', 'en']) for (const plan of ['free', 'paid']) {
    const text = String(buildPack({ lang, plan, sets: a.data.sets }).text ?? buildPack({ lang, plan, sets: a.data.sets }));
    assert.ok(!text.includes('m-trace'), `${lang} ${plan}`);
  }
});
ok('the skill gets references/parts/local.md (ja and en) with the parts library\'s m-trace and a line in its list; m-trace is named nowhere else', () => {
  const ja = Object.keys(a.files).find((f) => f.endsWith('references/parts/local.md')), en = Object.keys(a.files).find((f) => f.endsWith('references/parts/en/local.md'));
  assert.ok(ja && en);
  assert.match(a.files[ja], /ローカル（CLI）向けのパーツ。Claude Code・Codex などの CLI/);
  assert.match(a.files[ja], /### `<m-trace>`\n\n/);
  assert.match(a.files[en], /Local \(CLI\) only parts/);
  assert.match(a.files[en], /### `<m-trace>`\n\n/);
  for (const f of [ja, en]) assert.ok(a.files[f].includes('<m-trace>') && b.files[f].includes('<m-trace>') && b.files[f].includes('<m-tracex>') && !a.files[f].includes('<m-tracex>'), f);
  assert.match(b.files[ja], /### `<m-tracex>`\n\nローカルのトレーサーの出力/);
  assert.match(b.files[en], /Shows a local tracer's output/);
  assert.deepEqual(Object.keys(b.files).sort(), Object.keys(a.files).sort());
  for (const f of Object.keys(a.files).filter((x) => x !== ja && x !== en)) assert.ok(!/m-trace(?![a-z0-9-])/.test(a.files[f]), f + ' names m-trace');
  for (const f of Object.keys(a.files).filter((x) => /skills\/make\/SKILL(\.en)?\.md$/.test(x))) assert.match(a.files[f], /\[local\]\(references\/parts\/(en\/)?local\.md\)/, f);
});
console.log(`local-tier: ${n} ok`);
