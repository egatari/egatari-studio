// 字の絞り込み（wasm、#178 (4)。kit/font-subset.mjs・kit/core/build-core.mjs の rangeCss）の試験
//   node tools/test-font-subset.mjs [作業フォルダ]
// 1. 同じ字の集まりなら同じバイト：2 回・字の順を入れ替え・重ねても同じ。別のプロセスで作っても同じ
// 2. 縦書きの機能（GSUB の vert・vrt2）が残る。字の番号の表（cmap）は渡した字だけ
// 3. 組み立て：日本語の教材を 2 回組むとバイトが同じ。@font-face の unicode-range は使う字だけ。絞り込みを切る（EGATARI_FONT_SUBSET=0）と分割ファイルのまま
// 4. 予約された字体名（RFN）のある字体（Source Sans 3 など）は絞り込まない
// 5. 字の範囲の点検（kit/core/font-coverage.mjs）：組んだ HTML の見える字に、埋め込んだ字が持たない字がない
// 6. OS によらない同じバイト：決まった分割ファイルと字の切り出しの sha256 を固定する（CI の Linux・macOS・Windows で同じ値）。道具の版は package.json の固定と同じ
// 7. unicode-range は切り出した字が本当に持つ字だけ（分割ファイルの範囲にあっても字形のない字は書かない。仕様 §7.2）
// 8. ブラウザ（編集アプリの道具 font-subset.js を、アプリと同じ CSP の下の Chromium で）でも Node とバイトまで同じ。決まりの違反（eval）がない
// 9. 見本（羅生門・国語の漢文・平均と中央値）：切り出しても、端末の字体で出る字が増えない（増えたように見える字は、その分割ファイルが字形を持たない字だけ）。
//    日本語の教材は、プレーヤーの画面の言葉（再生・停止など）の字も入る
// 10. 段 A：明朝を埋め込んだ文書の新しい字は、ゴシックと明朝の両方に補う。切り出しの道具があれば補いもその字だけ。字の元がなければ断らずに保存し、その字を名指す
// test-all: platform
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initSubsetter, subsetWoff2, subsetFace, SUBSET_TOOL, SUBSET_PINS } from '../kit/font-subset.mjs';
import { uncoveredGlyphs } from '../kit/core/font-coverage.mjs';
import { parseRange, fontFaces, FONTS, fontByFamily, playerUiGlyphs } from '../kit/core/build-core.mjs';

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


// ---------------------------------------------------------------- 6. OS によらない同じバイト
// 入力：@fontsource 5.3.x の決まった分割ファイルと決まった字。値は harfbuzzjs 1.6.4・wawoff2 2.0.1 で作ったもの。道具か @fontsource の版を上げたら、
// 出力が変わるのは意図したことなので、ここの値を書き直す（RELEASING.md「字の切り出しの道具の版」）
const PINNED = [
  ['biz-udpmincho', 0x3001, [0x3001, 0x3002, 0x300c, 0x300d], '93493d518b1d1dd5b89f22d0ad7f2c6111c23d5d6b6fe631f5d6a8d5d4fbadef'],
  ['biz-udpgothic', 0x7f85, [0x7f85, 0x751f, 0x9580, 0x4e0b, 0x4eba], '3a5802316a9bc45f1a8a983bbf44698fabcd5e964b4a6255b4312b2c191940d6'],
  ['biz-udpgothic', 0x41, [0x41, 0x42, 0x61, 0x62, 0x31], '4e63bd701c886f80f39f404e25c198dcbd818b81cb980c449e26c8ca43f33a18'],
];
const chunkOf = (pkg, cp, w = 400) => {
  const css = fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource', pkg, `${w}.css`), 'utf8');
  const b = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]).find((x) => parseRange(/unicode-range:\s*([^;]+);/.exec(x)[1]).some(([a, z]) => cp >= a && cp <= z));
  return { file: fsrc(pkg, /files\/([^)]+\.woff2)/.exec(b)[1]), range: parseRange(/unicode-range:\s*([^;]+);/.exec(b)[1]) };
};
await t('OS によらない同じバイト：決まった分割ファイルと字の切り出しは、固定した sha256 になる。道具の版は package.json の固定と同じ', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const [k, v] of Object.entries(SUBSET_PINS)) {
    assert.equal(pkg.dependencies[k], v, `package.json pins ${k} ${v} exactly`);
    assert.equal(SUBSET_TOOL[k], v, `installed ${k} is ${v}`);
  }
  const got = PINNED.map(([p, cp, cps]) => sha(subsetWoff2(fs.readFileSync(chunkOf(p, cp).file), cps)));
  if (process.env.PRINT_PINS) console.log('     pins: ' + JSON.stringify(got));
  assert.deepEqual(got, PINNED.map((x) => x[3]));
});

// ---------------------------------------------------------------- 7. 範囲は字形のある字だけ
await t('unicode-range は切り出した字が持つ字だけ：分割ファイルの範囲にあっても字形のない字は返さない', () => {
  const c = chunkOf('biz-udpmincho', 0x3001);
  const all = c.range.flatMap(([a, z]) => Array.from({ length: z - a + 1 }, (_, i) => a + i));
  const r = subsetFace(fs.readFileSync(c.file), all);
  assert.ok(r.cps.length > 0 && r.cps.length <= all.length);
  assert.ok(r.cps.every((x) => all.includes(x)), 'only requested characters');
  const none = all.filter((x) => !r.cps.includes(x));
  // 字形のない字だけを頼むと、字は空（組み立てはその分割ファイルを入れない）
  if (none.length) assert.deepEqual(subsetFace(fs.readFileSync(c.file), none.slice(0, 5)).cps, []);
  assert.deepEqual(subsetFace(fs.readFileSync(c.file), [0x3001, ...none.slice(0, 3)]).cps, [0x3001]);
});

// ---------------------------------------------------------------- 8. ブラウザでも同じバイト
await t('ブラウザ（編集アプリの font-subset.js、アプリと同じ CSP）でも Node とバイトまで同じ。決まりの違反がない', async () => {
  const { buildFontSubsetJs } = await import('./font-subset-bundle.mjs');
  const { launch } = await import('../kit/browser.mjs');
  const js = await buildFontSubsetJs('test');
  const appCsp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8'))[1];
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.setContent(`<!doctype html><meta http-equiv="Content-Security-Policy" content="${appCsp}"><title>t</title>`);
    await page.evaluate((src) => { const s = document.createElement('script'); s.textContent = src; document.head.append(s); s.remove(); }, js);
    const cases = [...PINNED.map(([p, cp, cps]) => [chunkOf(p, cp).file, cps]), [punct.file, cps], [chunkOf('biz-udpmincho', 0x7f85, 700).file, [0x7f85, 0x751f, 0x9580]]];
    for (const [file, list] of cases) {
      const bytes = fs.readFileSync(file);
      const b = await page.evaluate(async ([b64, l]) => { const s = await globalThis.__egatariFontSubset.init(); return s.subsetFont(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), l); }, [bytes.toString('base64'), list]);
      const nd = subsetFace(bytes, list);
      assert.equal(b.b64, Buffer.from(nd.woff2).toString('base64'), `${path.basename(file)}: same bytes`);
      assert.deepEqual(b.cps, nd.cps);
    }
    assert.deepEqual(errs, [], 'no console errors (CSP: no eval)');
  } finally { await browser.close(); }
});

// ---------------------------------------------------------------- 9. 見本：端末の字体で出る字が増えない
const { buildExamples } = await import('./examples-portable.mjs');
const SAMPLES = ['kokugo-kanbun', 'heikin-chuouchi', 'rashomon'];
await t('見本（国語の漢文・平均と中央値・羅生門）：切り出しても、端末の字体で出る字は増えない。画面の言葉の字も入る', async () => {
  const onDir = path.join(work, 'samples-on'), offDir = path.join(work, 'samples-off');
  const on = await buildExamples(onDir, { names: SAMPLES });
  const code = `const { buildExamples } = await import(${JSON.stringify(path.join(ROOT, 'tools/examples-portable.mjs'))}); await buildExamples(${JSON.stringify(offDir)}, { names: ${JSON.stringify(SAMPLES)} });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, EGATARI_FONT_SUBSET: '0' }, maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, r.stderr);
  const ui = [...new Set(playerUiGlyphs((f) => fs.readFileSync(path.join(ROOT, 'kit', f), 'utf8')))];
  for (const x of on) {
    const a = fs.readFileSync(path.join(onDir, x.file), 'utf8'), b = fs.readFileSync(path.join(offDir, x.file), 'utf8');
    assert.ok(a.length < b.length, `${x.name}: smaller (${a.length} < ${b.length})`);
    const ca = uncoveredGlyphs(a), cb = uncoveredGlyphs(b);
    assert.deepEqual(ca.missing.map((m) => m.char), cb.missing.map((m) => m.char), `${x.name}: the same characters are in no embedded font`);
    // 和文の字体ごと：切り出した文書にだけ欠ける字は、その字体の分割ファイルが字形を持たない字（分割ファイルの範囲が言い過ぎていた字）
    for (const [fam, chars] of Object.entries(ca.byFamily)) {
      const more = [...chars].filter((c) => !(cb.byFamily[fam] || '').includes(c));
      const font = fontByFamily(fam);
      for (const c of more) {
        const cp = c.codePointAt(0);
        const face = fontFaces({ path, fontDir: (p) => path.join(ROOT, 'node_modules', p), readText: (f) => fs.readFileSync(f, 'utf8') }, font, [400]).find((f) => f.range.some(([lo, hi]) => cp >= lo && cp <= hi));
        assert.ok(face, `${x.name}: ${fam} ${c}: a chunk declares it`);
        assert.deepEqual(subsetFace(fs.readFileSync(face.file), [cp]).cps, [], `${x.name}: ${fam} has no glyph for ${c} (U+${cp.toString(16)})`);
      }
    }
    // プレーヤーの画面の言葉（日本語の教材）：ゴシックの字に入る
    const goth = [...a.matchAll(/@font-face\{font-family:"BIZ UDPGothic"[^}]*unicode-range:([^}]+)\}/g)].flatMap((m) => parseRange(m[1]));
    const lack = ui.filter((c) => !goth.some(([lo, hi]) => c.codePointAt(0) >= lo && c.codePointAt(0) <= hi));
    // ゴシックの分割ファイルが字形を持たない字は数えない
    const real = lack.filter((c) => { const cp = c.codePointAt(0); const f = fontFaces({ path, fontDir: (p) => path.join(ROOT, 'node_modules', p), readText: (q) => fs.readFileSync(q, 'utf8') }, FONTS.biz, [400]).find((y) => y.range.some(([lo, hi]) => cp >= lo && cp <= hi)); return f && subsetFace(fs.readFileSync(f.file), [cp]).cps.length; });
    assert.deepEqual(real, [], `${x.name}: the player's UI characters are embedded`);
  }
});

// ---------------------------------------------------------------- 10. 段 A：明朝にも補う・補いも切り出す・字の元がなくても保存する
await t('段 A：明朝を埋め込んだ文書の新しい字は、ゴシックと明朝の両方に補う。補いもその字だけに切り出す。字の元がなければ断らずに保存し、字を名指す', async () => {
  const { buildPortable } = await import('../kit/build.mjs');
  const PF = await import('../kit/core/portable.mjs');
  const { tierA, FONT_FALLBACK_WARN } = await import('../kit/core/tier-a.mjs');
  const { nodeEnv } = await import('../kit/build.mjs');
  const dk = path.join(work, 'tier-a');
  fs.cpSync(dir, dk, { recursive: true });
  fs.writeFileSync(path.join(dk, 'egatari.json'), JSON.stringify({ docId: '6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f' }) + '\n');
  const built = await buildPortable(path.join(dk, 'deck.html'), { out: path.join(work, 'tier-a.ega.html') });
  const html = built.html;
  const r = await PF.readPortable(html);
  const files = { ...r.files };
  files['narration.md'] = new TextEncoder().encode(new TextDecoder().decode(files['narration.md']).replace('待っていた。', '待っていた。鬱'));
  const src = { faces: (k) => fontFaces(nodeEnv, FONTS[k] || fontByFamily(k)), load: async (f) => nodeEnv.readBase64(f) };
  const full = await tierA(html, files, { fonts: src });
  assert.ok(full.ok, `[${full.code}] ${full.reason}`);
  const fams = new Set(full.changes.supplement.faces.map((f) => f.family));
  assert.ok(fams.has('BIZ UDPGothic') && fams.has('BIZ UDPMincho'), `supplement for both families (${[...fams].join(', ')})`);
  assert.ok(full.changes.supplement.chars.includes('鬱'));
  const cut = await tierA(html, files, { fonts: src, fontSubset: async () => (bytes, cpsList) => { const x = subsetFace(bytes, cpsList); return { b64: Buffer.from(x.woff2).toString('base64'), cps: x.cps }; } });
  assert.ok(cut.ok);
  const sup = (h) => /<style id="egatari-font-supplement-0">([\s\S]*?)<\/style>/.exec(h)[1];
  assert.ok(sup(cut.html).length * 5 < sup(full.html).length, `the cut supplement is much smaller (${sup(cut.html).length} vs ${sup(full.html).length})`);
  for (const m of sup(cut.html).matchAll(/unicode-range:([^}]+)\}/g)) assert.equal(m[1], 'U+9b31', 'the cut supplement declares only 鬱');
  assert.equal(uncoveredGlyphs(cut.html).missing.length, 0, 'the new character is covered');
  const none = await tierA(html, files, {});
  assert.ok(none.ok, `no font source: saved anyway ([${none.code}] ${none.reason})`);
  assert.equal(none.changes.uncovered, '鬱');
  assert.ok(none.warnings.some((w) => w.startsWith(FONT_FALLBACK_WARN) && w.includes('鬱')), 'the warning names the character');
  assert.deepEqual(uncoveredGlyphs(none.html).missing.map((m) => m.char), ['鬱'], 'and the coverage check reports it');
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
