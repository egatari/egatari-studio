// test-all: unit
// 「ファイルの情報…」で書く欄（handoff #88。app/file-info.js）
//   node tools/test-file-info.mjs
// - 入力から metadata の値：前後の空白を除く・1 行に 1 人（空の行は捨てる）・空の欄は項目を消す・「付けない」は license を消す・
//   その他は SPDX の名前をゆるく確かめる（今の値と同じなら形を問わない）
// - 今の値からライセンスの選択（licenseChoice）・変わった項目だけ（changedOnly）
// - rightsOf（app/rights.js）で読み戻すと、入れたものが出る。仕様の形（文字列・文字列の並び）
import { LICENSES, FIRST_SAVE_LICENSES, isSpdxLike, licenseChoice, creatorsOf, fileInfoPatch, applyFileInfo, changedOnly } from '../app/file-info.js';
import { rightsOf, isNoDerivatives } from '../app/rights.js';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 選べるもの
ok(same(LICENSES.map((x) => x.id), ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-ND-4.0', 'CC0-1.0']), 'LICENSES: the seven Creative Commons choices as SPDX names');
ok(same(FIRST_SAVE_LICENSES, ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0']) && FIRST_SAVE_LICENSES.every((id) => LICENSES.some((x) => x.id === id)), 'FIRST_SAVE_LICENSES: CC BY, CC BY-SA, CC BY-NC');
ok(LICENSES.filter((x) => isNoDerivatives(x.id)).map((x) => x.id).join() === 'CC-BY-ND-4.0,CC-BY-NC-ND-4.0', 'the ND choices are the ones rightsOf treats as no-derivatives (ND handling unchanged)');

// SPDX
for (const s of ['MIT', 'CC-BY-4.0', 'GPL-2.0+', 'Apache-2.0 OR MIT', 'GPL-2.0-only WITH Classpath-exception-2.0', 'LicenseRef-my.1', ' MIT ']) ok(isSpdxLike(s), `isSpdxLike: "${s}"`);
for (const s of ['', 'All rights reserved', 'https://creativecommons.org/licenses/by/4.0/', 'MIT or Apache', 'MIT  OR Apache-2.0', 'CC BY 4.0', 'ライセンス', null]) ok(!isSpdxLike(s), `isSpdxLike: not "${s}"`);

// 今の値からの選択
ok(same(licenseChoice('CC-BY-4.0'), { choice: 'CC-BY-4.0', other: '' }) && same(licenseChoice(' cc-by-nc-sa-4.0 '), { choice: 'CC-BY-NC-SA-4.0', other: '' }), 'licenseChoice: a listed SPDX name (any case) selects it');
ok(same(licenseChoice(undefined), { choice: 'none', other: '' }) && same(licenseChoice('  '), { choice: 'none', other: '' }), 'licenseChoice: no license → none');
ok(same(licenseChoice('MIT'), { choice: 'other', other: 'MIT' }) && same(licenseChoice('https://example.org/l'), { choice: 'other', other: 'https://example.org/l' }), 'licenseChoice: anything else → other with its text');

// 作成者
ok(same(creatorsOf('  山田 花子 \n\n Taro Suzuki\r\n  \n'), ['山田 花子', 'Taro Suzuki']), 'creatorsOf: one per line, trimmed, empty lines dropped');
ok(same(creatorsOf(''), []) && same(creatorsOf(undefined), []), 'creatorsOf: empty → none');

// 入力 → patch
{
  const r = fileInfoPatch({ title: '  てこのはたらき ', creators: 'A\n\n B ', copyright: ' © 2026 A ', license: 'CC-BY-SA-4.0', other: 'ignored', attribution: ' ○○大学 ○○研究室 ' });
  ok(same(r, { patch: { title: 'てこのはたらき', copyright: '© 2026 A', attribution: '○○大学 ○○研究室', creators: ['A', 'B'], license: 'CC-BY-SA-4.0' } }), 'fileInfoPatch: trims every field, creators one per line ' + JSON.stringify(r));
  const e = fileInfoPatch({ title: ' ', creators: '\n \n', copyright: '', license: 'none', attribution: '' });
  ok(same(Object.keys(e.patch).sort(), ['attribution', 'copyright', 'creators', 'license', 'title']) && Object.values(e.patch).every((v) => v === undefined), 'fileInfoPatch: empty fields and "no license" remove the keys');
  ok(same(fileInfoPatch({ license: 'none' }), { patch: { license: undefined } }), 'fileInfoPatch: only the fields given are in the patch');
  ok(same(fileInfoPatch({ license: 'other', other: ' Apache-2.0 OR MIT ' }), { patch: { license: 'Apache-2.0 OR MIT' } }), 'fileInfoPatch: other with an SPDX expression');
  ok(same(fileInfoPatch({ license: 'other', other: '  ' }), { error: 'license-empty' }), 'fileInfoPatch: other without a name → license-empty');
  ok(same(fileInfoPatch({ license: 'other', other: 'All rights reserved' }), { error: 'license-format' }), 'fileInfoPatch: other that is not an SPDX name → license-format');
  ok(same(fileInfoPatch({ license: 'other', other: 'https://example.org/l' }, { license: 'https://example.org/l' }), { patch: { license: 'https://example.org/l' } }), 'fileInfoPatch: other equal to the current value is kept as it is (a file written with a URL)');
  ok(same(fileInfoPatch({ license: 'GPL-3.0' }), { error: 'license-format' }), 'fileInfoPatch: a choice that is not listed is refused');
}

// 当てる・変わった項目だけ
{
  const md = { title: 'Old', lang: 'ja', license: 'CC-BY-4.0', creators: ['A'], edits: [{ by: 'X' }], description: 'd' };
  const patch = fileInfoPatch({ title: 'New', creators: 'A\nB', copyright: '© 2026 A', license: 'none', attribution: '' }).patch;
  const out = applyFileInfo(md, patch);
  ok(same(out, { title: 'New', lang: 'ja', creators: ['A', 'B'], edits: [{ by: 'X' }], description: 'd', copyright: '© 2026 A' }), 'applyFileInfo: sets and removes keys, others (lang, edits, description) unchanged ' + JSON.stringify(out));
  ok(md.title === 'Old' && 'license' in md, 'applyFileInfo: the original metadata is not changed');
  const ch = changedOnly(md, patch);
  ok(same(Object.keys(ch).sort(), ['copyright', 'creators', 'license', 'title']), 'changedOnly: only the keys that differ (attribution was absent and stays absent) ' + JSON.stringify(Object.keys(ch)));
  ok(same(changedOnly(md, { title: 'Old', creators: ['A'], copyright: undefined }), {}), 'changedOnly: the same values → nothing to write');
}

// rightsOf で読み戻す（往復）
{
  const form = { title: 'てこ', creators: '山田 花子\n鈴木 太郎', copyright: '© 2026 山田 花子', license: 'CC-BY-NC-4.0', attribution: '○○高校 理科' };
  const md = applyFileInfo({ title: 'x', lang: 'ja' }, fileInfoPatch(form).patch);
  const R = rightsOf(md);
  ok(R.title === 'てこ' && same(R.creators, ['山田 花子', '鈴木 太郎']) && R.copyright === '© 2026 山田 花子' && R.license === 'CC-BY-NC-4.0' && R.attribution === '○○高校 理科' && !R.noDerivatives, 'round trip: rightsOf reads back what the form wrote');
  ok(typeof md.license === 'string' && Array.isArray(md.creators) && md.creators.every((x) => typeof x === 'string'), 'round trip: the shapes follow egatari-metadata (strings, array of strings)');
  // 読み戻した値で欄を満たしてもう一度保存しても、何も変わらない
  const again = fileInfoPatch({ title: R.title, creators: R.creators.join('\n'), copyright: R.copyright, license: licenseChoice(R.license).choice, other: licenseChoice(R.license).other, attribution: R.attribution }, md);
  ok(same(changedOnly(md, again.patch), {}), 'round trip: filling the form from rightsOf and saving again changes nothing');
  const nd = rightsOf(applyFileInfo(md, fileInfoPatch({ license: 'CC-BY-ND-4.0' }).patch));
  ok(nd.noDerivatives && nd.reason === 'nd-license', 'round trip: choosing CC BY-ND 4.0 makes rightsOf report no-derivatives');
  const none = rightsOf(applyFileInfo(md, fileInfoPatch({ license: 'none' }).patch));
  ok(none.license === null && none.reason === 'copyright-only', 'round trip: no license with a copyright notice → copyright-only (as before)');
}

console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
