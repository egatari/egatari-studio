// 字の絞り込み（wasm、#178 (4)。kit/font-subset.mjs・kit/core/build-core.mjs の rangeCss）の試験
//   node tools/test-font-subset.mjs [作業フォルダ]
// 1. 同じ字の集まりなら同じバイト：2 回・字の順を入れ替え・重ねても同じ。別のプロセスで作っても同じ
// 2. 縦書きの機能（GSUB の vert・vrt2）が残る。字の番号の表（cmap）は渡した字だけ
// 3. 組み立て：日本語の教材を 2 回組むとバイトが同じ。@font-face の unicode-range は使う字だけ。絞り込みを切る（EGATARI_FONT_SUBSET=0）と分割ファイルのまま
// 4. 予約された字体名（RFN）のある字体（Source Sans 3 など）は絞り込まない
// 5. 字の範囲の点検（kit/core/font-coverage.mjs）：組んだ HTML の見える字に、埋め込んだ字が持たない字がない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initSubsetter, subsetWoff2 } from '../kit/font-subset.mjs';
import { uncoveredGlyphs } from '../kit/core/font-coverage.mjs';
import { parseRange } from '../kit/core/build-core.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-font-subset-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fsrc = (pkg, file) => path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file);
// 分割ファイルの 1 つ（明朝の 400、和文の約物と漢字を持つもの）と、そこに入る字
const chunkCss = fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource/biz-udpmincho/400.css'), 'utf8');
const blocks = [...chunkCss.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
const pick = (cp) => {
  const b = blocks.find((x) => parseRange(/unicode-range:\s*([^;]+);/.exec(x)[1]).some(([a, z]) => cp >= a && cp <= z));
  return { file: fsrc('biz-udpmincho', /files\/([^)]+\.woff2)/.exec(b)[1]), range: parseRange(/unicode-range:\s*([^;]+);/.exec(b)[1]) };
};
const punct = pick(0x3001);   // 、 の分割ファイル（縦書きで形が替わる約物）
const cps = punct.range.flatMap(([a, z]) => (z - a < 64 ? Array.from({ length: z - a + 1 }, (_, i) => a + i) : [a])).slice(0, 12);

await initSubsetter();

await t('同じ字の集まりなら同じバイト（2 回・順を入れ替え・重ねても）', () => {
  const src = fs.readFileSync(punct.file);
  const a = subsetWoff2(src, cps), b = subsetWoff2(src, cps), c = subsetWoff2(src, [...cps].reverse().concat(cps));
  assert.equal(sha(a), sha(b));
  assert.equal(sha(a), sha(c));
  assert.ok(a.length < src.length, `smaller than the chunk (${a.length} < ${src.length})`);
});

await t('別のプロセスで作っても同じバイト', () => {
  const code = `import fs from 'node:fs'; import { initSubsetter, subsetWoff2 } from ${JSON.stringify(path.join(ROOT, 'kit/font-subset.mjs'))};
await initSubsetter(); process.stdout.write(Buffer.from(subsetWoff2(fs.readFileSync(${JSON.stringify(punct.file)}), ${JSON.stringify([...cps].sort(() => 0.5 - Math.random()))})).toString('hex'));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(sha(Buffer.from(r.stdout, 'hex')), sha(subsetWoff2(fs.readFileSync(punct.file), cps)));
});

await t('縦書きの機能（vert・vrt2）が残る', () => {
  const out = subsetWoff2(fs.readFileSync(punct.file), cps);
  // woff2 の表の名前は既知の表なら番号なので、展開した sfnt（wawoff2 の展開）で見る
  const wd = spawnSync(process.execPath, ['--input-type=module', '-e', `import { createRequire } from 'node:module'; const r = createRequire(${JSON.stringify(path.join(ROOT, 'kit/'))});
const d = r('wawoff2/build/decompress_binding.js'); d.onRuntimeInitialized = () => { const s = Buffer.from(d.decompress(Buffer.from(process.argv[1], 'hex'))); process.stdout.write(s.toString('latin1')); };`, Buffer.from(out).toString('hex')], { encoding: 'latin1', maxBuffer: 64 << 20 });
  assert.equal(wd.status, 0, wd.stderr);
  assert.ok(wd.stdout.includes('GSUB'), 'GSUB table');
  assert.ok(wd.stdout.includes('vert') && wd.stdout.includes('vrt2'), 'vert and vrt2 features');
});

// 日本語の教材（明朝の縦書きの文を含む）
const dir = path.join(work, 'ja');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>\n<html lang="ja" data-theme="default">\n<head><meta charset="utf-8"><title>字の絞り込み</title></head>\n<body><div id="stage">\n<section class="slide noconcl static" id="s1"><h2>字の絞り込み</h2><div class="body"><p class="mincho">下人の行方は、誰も知らない。</p><p>English text, Source Sans.</p></div></section>\n</div></body></html>\n`);
fs.writeFileSync(path.join(dir, 'narration.md'), '## s1\n\n[0] 羅生門の下で雨やみを待っていた。\n');
const build = (out, env = {}) => {
  const r = spawnSync(process.execPath, ['kit/build.mjs', path.join(dir, 'deck.html'), '-o', out], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(out, 'utf8');
};

await t('組み立て：2 回組むとバイトが同じ。unicode-range は使う字だけ（分割ファイルの範囲より狭い）', () => {
  const a = build(path.join(work, 'a.html')), b = build(path.join(work, 'b.html'));
  assert.equal(sha(a), sha(b));
  const off = build(path.join(work, 'off.html'), { EGATARI_FONT_SUBSET: '0' });
  const faces = (h, fam) => [...h.matchAll(/@font-face\{[^}]*\}/g)].map((m) => m[0]).filter((x) => x.includes(`"${fam}"`));
  for (const fam of ['BIZ UDPGothic', 'BIZ UDPMincho']) {
    const on = faces(a, fam), full = faces(off, fam);
    assert.ok(on.length && on.length === full.length, `${fam}: same chunks (${on.length} / ${full.length})`);
    const size = (l) => l.reduce((s, x) => s + x.length, 0);
    assert.ok(size(on) * 3 < size(full), `${fam}: much smaller (${size(on)} vs ${size(full)})`);
    const r = parseRange(/unicode-range:([^}]+)\}/.exec(on.find((x) => x.includes('font-weight:400')))[1]);
    const n = r.reduce((s, [x, y]) => s + y - x + 1, 0);
    assert.ok(n < 300, `${fam}: range lists the used characters only (${n})`);
  }
  assert.ok(a.includes('羅') && /BIZ UDPMincho/.test(a));
});

await t('予約された字体名のある字体（Source Sans 3）は分割ファイルのまま', () => {
  const a = fs.readFileSync(path.join(work, 'a.html'), 'utf8'), off = fs.readFileSync(path.join(work, 'off.html'), 'utf8');
  const ss = (h) => [...h.matchAll(/@font-face\{font-family:"Source Sans 3"[^}]*\}/g)].map((m) => m[0]).join('\n');
  assert.equal(ss(a), ss(off));
});

await t('字の範囲の点検：見える字はどれも埋め込んだ字にある', () => {
  const r = uncoveredGlyphs(fs.readFileSync(path.join(work, 'a.html'), 'utf8'));
  assert.deepEqual(r.missing.map((m) => m.char), []);
  const r2 = uncoveredGlyphs(fs.readFileSync(path.join(work, 'a.html'), 'utf8').replace('雨やみを待っていた', '雨やみを待っていた。鬱'));
  assert.deepEqual(r2.missing.map((m) => m.char), ['鬱']);
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
