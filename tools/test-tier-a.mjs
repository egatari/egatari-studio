// 段 A の編集（format spec §7.2。kit/core/tier-a.mjs）の試験：組み直さずに決まった場所だけを書き換える
//   node tools/test-tier-a.mjs [作業フォルダ]
// examples/minimal（TTS の dry-run の音声。なければ JS の無音）と examples/tmlr2026-calibration（手元に合成済みの音声があればそれ、なければ dry-run）の
// 持ち運べる 1 ファイルで、口述原稿の 1 つの発言（新しい字が要る漢字を含む）と timeline.json の 1 つの pad_after を変え、段 A で保存して確かめる：
//   場所を見分ける差分（regionDiff）：決まった場所の外は 1 バイトも違わない。中も、変わった段階のほかの項目はバイトのまま
//   読める層と口述原稿の JSON が新しい・索引と data-sha256 と sourceSha256 が正しい・字の補いは要るときだけ
//   ヘッドレス Chrome で再生でき、コンソールのエラーがない（新しい字が補いの字で出る）
//   展開 → 編集したフォルダと同じ。そのフォルダをまとめ直すと同じ中身（同じバイトではない。違いを数えて出す）
//   ほかの書き手の文書（実行系のバイト・注釈・JSON の書き方が違う）でも、その部分のバイトが残る。知らない項目はどの深さでも残る
//   音声を替えた段階（録音の見立て）・新しい教材として保存（docId と derivedFrom）・何も変えなければ同じバイト・断る場合
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';
import * as PF from '../kit/core/portable.mjs';
import { tierA, scanLayout, jsonObjectAt, deepEqual } from '../kit/core/tier-a.mjs';
import { parseNarration, narrationMap, marksMap } from '../kit/core/narration-core.mjs';
import { fontFaces, FONTS } from '../kit/core/build-core.mjs';
import { buildPortable, nodeEnv } from '../kit/build.mjs';
import { unpack } from './portable.mjs';
import { silentWav, addUnknownMembers } from './portable-fixtures.mjs';
import { regionDiff, skeleton, firstDiff } from './tier-a-diff.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-tier-a-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const enc = new TextEncoder(), dec = new TextDecoder();
const plain = (o) => JSON.parse(JSON.stringify(o));
const FONTS_SRC = { faces: (k) => fontFaces(nodeEnv, FONTS[k]), load: async (f) => nodeEnv.readBase64(f) };

// ---------------------------------------------------------------- 教材の用意
function withAudio(dir) {
  if (fs.existsSync(path.join(dir, 'audio', 'manifest.json'))) return 'cached';
  const r = spawnSync('uv', ['run', '--quiet', '--project', path.join(ROOT, 'tts'), 'python', path.join(ROOT, 'tts', 'synth.py'), dir, '--dry-run'], { encoding: 'utf8' });
  if (r.status === 0 && fs.existsSync(path.join(dir, 'audio', 'manifest.json'))) return 'dry-run';
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  const segments = {};
  parseNarration(fs.readFileSync(path.join(dir, 'narration.md'), 'utf8')).forEach((x, j) => {
    fs.writeFileSync(path.join(dir, 'audio', `seg_js${j}.wav`), silentWav(0.5));
    segments[`${x.slideKey}:${x.stepKey}`] = { file: `seg_js${j}.wav`, dur: 0.5, cues: [], engine: 'dry-run' };
  });
  fs.writeFileSync(path.join(dir, 'audio', 'manifest.json'), JSON.stringify({ segments }, null, 1));
  return 'silent (js)';
}
async function prepare(name) {
  const dir = path.join(work, name);
  fs.cpSync(path.join(ROOT, 'examples', name), dir, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
  const audio = withAudio(dir);
  fs.writeFileSync(path.join(dir, FORMAT.CONFIG_FILE), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test Author', attribution: 'Test Author', creators: ['Test Author'] } }, null, 2) + '\n');
  const out = path.join(dir, 'out', 'deck' + FORMAT.FILE_EXT);
  const p = await buildPortable(path.join(dir, 'deck.html'), { out });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, p.html);
  const r = await PF.readPortable(p.html);
  assert.equal(r.sourceMatches, true);
  console.log(`  ${name}: ${(p.html.length / 1048576).toFixed(1)} MB, ${Object.keys(r.audio).length} audio (${audio})`);
  return { dir, html: p.html, r };
}
// 作業場所（展開したフォルダと同じ形：原稿・音声・audio/manifest.json）
const workspace = (r) => {
  const m = new Map(Object.entries(r.files));
  if (r.index.audio && Object.keys(r.index.audio).length) m.set('audio/manifest.json', enc.encode(PF.manifestFromAudio(r.index.audio)));
  return m;
};
const setText = (m, p, t) => m.set(p, enc.encode(t));
const getText = (m, p) => (m.get(p) ? dec.decode(m.get(p)) : '');
// 口述原稿の 1 つの段階の文を書き換える（最初の発言の終わりに足す）
function editTurn(narr, key, add) {
  const segs = parseNarration(narr), s = segs.find((x) => `${x.slideKey}:${x.stepKey}` === key);
  const lines = narr.split('\n'), ln = lines[s.line - 1];
  lines[s.line - 1] = ln.replace(/\s*$/, '') + add;
  return lines.join('\n');
}
const segOf = (narr, key) => parseNarration(narr).find((x) => `${x.slideKey}:${x.stepKey}` === key);

// ---------------------------------------------------------------- 見本の 2 つ
const decks = {};
const results = {};
// 新しい字（どちらの教材の原稿にも、組み立ての字にもない漢字）。字の出どころで「組み立ての字にない」が変わることに気をつける：
// fonts/*.ttf があれば使った字だけに絞り込む（範囲は原稿の字だけ）が、ない（CI・新しく取ってきたリポジトリ）なら @fontsource の
// 分割ファイルを丸ごと埋め込み、その範囲の字はみな文書にある（たとえば「鬱」は minimal が使う字と同じ分割ファイルに入る）。
// どちらの見本の分割ファイルにも入らない字を選び、試験の前提として下（uncovered）で確かめる
const NEW_GLYPHS = '蒼穹';
const parseRange = (r) => r.split(',').map((x) => { const [a, b] = x.trim().replace(/^U\+/i, '').split('-').map((y) => parseInt(y, 16)); return [a, b ?? a]; });
// 文書の BIZ UDPGothic の @font-face が範囲に持たない字（範囲のない face は原稿の字だけを持つとみなす）
const uncovered = (html, chars) => {
  const faces = [...html.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]).filter((b) => /font-family\s*:\s*"?BIZ UDPGothic/.test(b));
  return [...chars].filter((ch) => !faces.some((b) => { const r = /unicode-range\s*:\s*([^;]+)/.exec(b); return r && parseRange(r[1]).some(([a, z]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= z); }));
};
for (const name of ['minimal', 'tmlr2026-calibration']) {
  ok(`${name}：口述原稿の 1 つの発言（新しい字の漢字）と timeline.json の pad_after を変えて段 A で保存する`, async () => {
    const d = decks[name] = await prepare(name);
    const { r } = d;
    const ws = workspace(r);
    const narr = getText(ws, 'narration.md');
    const segs = parseNarration(narr);
    assert.deepEqual(uncovered(d.html, NEW_GLYPHS), [...NEW_GLYPHS], `test precondition: ${NEW_GLYPHS} must not be in the fonts the document already embeds (pick other glyphs)`);
    assert.ok(![...NEW_GLYPHS].some((c) => narr.includes(c)), 'test precondition: the new glyphs are not in the narration');
    // 音声のある段階を 1 つ（その音声は古くなる）
    const key = Object.keys(r.audio)[1];
    assert.ok(key && segOf(narr, key), 'a step with audio');
    setText(ws, 'narration.md', editTurn(narr, key, ` ${NEW_GLYPHS}の森。`));
    const tkey = `${segs[2].slideKey}:${segs[2].stepKey}`;
    const tl = getText(ws, 'timeline.json');
    const t = tl ? JSON.parse(tl) : {};
    t[tkey] = { ...(t[tkey] || {}), pad_after: 1.75 };
    setText(ws, 'timeline.json', JSON.stringify(t, null, 2) + '\n');
    const a = await tierA(d.html, ws, { fonts: FONTS_SRC });
    assert.ok(a.ok, `tier A refused: [${a.code}] ${a.reason}`);
    assert.deepEqual(a.changes.narration, [key]);
    assert.deepEqual(a.changes.timing, [tkey]);
    assert.deepEqual(a.changes.audio, [], 'audio records unchanged (the edited step becomes stale)');
    assert.ok(a.changes.supplement && [...NEW_GLYPHS].every((c) => a.changes.supplement.chars.includes(c)), `font supplement for the new glyphs: ${JSON.stringify(a.changes.supplement)}`);
    // 知らせる字のファイルは名前だけ。Windows の Node は字のファイルを C:\...\x.woff2 で渡すので、その形の出どころでも確かめる
    const real = new Map();
    const winFonts = { faces: (k) => FONTS_SRC.faces(k).map((f) => { const w = 'C:\\fonts\\' + path.basename(f.file); real.set(w, f.file); return { ...f, file: w }; }), load: (f) => FONTS_SRC.load(real.get(f)) };
    const aw = await tierA(d.html, ws, { fonts: winFonts });
    for (const x of [a, aw]) assert.ok(x.changes.supplement.files.length && x.changes.supplement.files.every((f) => /^[\w.-]+\.woff2$/.test(f)), JSON.stringify(x.changes.supplement.files));
    assert.equal(aw.html, a.html, 'the same document whatever the path style of the font files');
    const diff = regionDiff(d.html, a.html, { narration: [key], timing: [tkey] });
    assert.deepEqual(diff.supplements, [FORMAT.FONT_SUPPLEMENT_PREFIX + '0']);
    // 読める層と JSON
    const L = scanLayout(a.html);
    const nj = JSON.parse(a.html.slice(L.blocks.get('deck-narration').cStart, L.blocks.get('deck-narration').cEnd));
    const nm = narrationMap(parseNarration(getText(ws, 'narration.md')));
    const [sk, st] = [key.slice(0, key.lastIndexOf(':')), key.slice(key.lastIndexOf(':') + 1)];
    assert.deepEqual(nj[sk][st], plain(nm[sk][st]));
    assert.ok(nj[sk][st][0].text.includes(NEW_GLYPHS));
    assert.deepEqual(nj, plain(nm), 'deck-narration equals what a rebuild would write');
    const div = L.readable.articles.get(sk).divs.get(key);
    assert.ok(a.html.slice(div.start, div.end).includes(NEW_GLYPHS + 'の森'), 'readable layer updated');
    const tj = JSON.parse(a.html.slice(L.blocks.get('deck-timing').cStart, L.blocks.get('deck-timing').cEnd));
    assert.equal(tj[tkey].pad_after, 1.75);
    // 読み直す：索引・data-sha256・sourceSha256
    const back = await PF.readPortable(a.html);
    assert.equal(back.sourceMatches, true);
    assert.deepEqual(back.warnings, []);
    assert.equal(back.index.sourceSha256, back.deckMeta.sourceSha256);
    assert.notEqual(back.index.sourceSha256, r.index.sourceSha256);
    assert.equal(back.docId, r.docId);
    assert.deepEqual(PF.validateIndex(back.index), []);
    assert.equal(dec.decode(back.files['narration.md']), getText(ws, 'narration.md'));
    // 音声：古い（inputHash が今の口述原稿と合わない）。バイトと kind はそのまま
    assert.deepEqual(plain(back.index.audio[key]), plain(r.index.audio[key]));
    assert.equal(await PF.isStale(back.index.audio[key], segOf(getText(ws, 'narration.md'), key)), true);
    results[name] = { a, ws, back };
    fs.writeFileSync(path.join(d.dir, 'out', 'tier-a' + FORMAT.FILE_EXT), a.html);
    console.log(`    regions: narration ${key}, timing ${tkey}, supplement ${a.changes.supplement.id} (${a.changes.supplement.files.length} files: ${a.changes.supplement.chars}), chunks +${diff.chunksAdded.length} -${diff.chunksDropped.length}, bytes ${d.html.length} → ${a.html.length}`);
  });
  ok(`${name}：もう一度、今度は文書の字にある字だけで直すと、字の補いは足さない（前の補いもそのまま）`, async () => {
    const { a, ws } = results[name];
    const narr = getText(ws, 'narration.md');
    const key = Object.keys(decks[name].r.audio)[2];
    const ws2 = new Map(ws);
    setText(ws2, 'narration.md', editTurn(narr, key, name === 'minimal' ? '勾配' : ' the loss'));
    const b = await tierA(a.html, ws2, { fonts: FONTS_SRC });
    assert.ok(b.ok, `[${b.code}] ${b.reason}`);
    assert.equal(b.changes.supplement, null);
    const diff = regionDiff(a.html, b.html, { narration: [key] });
    assert.deepEqual(diff.supplements, []);
    // 字のソースがなくても、要らなければ段 A はできる
    const c = await tierA(a.html, ws2);
    assert.ok(c.ok && c.html === b.html, JSON.stringify({ ok: c.ok, code: c.code, reason: c.reason, same: c.html === b.html, w: c.warnings, bw: b.warnings }));
  });
  ok(`${name}：ヘッドレス Chrome（file://）で再生でき、コンソールのエラーがなく、新しい字は補いの字で出る`, async () => {
    const file = path.join(decks[name].dir, 'out', 'tier-a' + FORMAT.FILE_EXT);
    const browser = await launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(fileUrl(file));
      await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 30000 });
      const key = results[name].a.changes.narration[0];
      const res = await page.evaluate(async ([key, glyphs]) => {
        const p = key.lastIndexOf(':'), sk = key.slice(0, p), st = key.slice(p + 1);
        const i = DECK.slides.findIndex((s) => s.dataset.key === sk);
        DECK.go(i, st === 'concl' ? DECK.slides[i].steps : +st, false);
        await new Promise((r) => setTimeout(r, 300));
        const faces = await document.fonts.load('16px "BIZ UDPGothic"', glyphs);
        const text = JSON.stringify(DECK.NARRATION[sk][st]);
        const audio = Object.values(DECK.AUDIO).filter((a) => /^data:audio\//.test(a.src)).length;
        return { faces: faces.length, has: text.includes(glyphs), audio, total: Object.keys(DECK.AUDIO).length };
      }, [key, NEW_GLYPHS]);
      assert.deepEqual(errors, [], 'console errors');
      assert.ok(res.has, 'narration on screen has the new text');
      assert.ok(res.faces >= 1, 'a font face for the new glyphs loads');
      assert.equal(res.audio, res.total, 'every audio reference resolves');
      await page.close();
    } finally { await browser.close(); }
  });
  ok(`${name}：展開すると編集したフォルダと同じ。そのフォルダをまとめ直すと同じ中身（違いは字の置き場所・索引の書き方だけ）`, async () => {
    const { a, ws } = results[name];
    const F = path.join(work, name + '-tier-a' + FORMAT.FILE_EXT);
    fs.writeFileSync(F, a.html);
    const U = path.join(work, name + '-unpacked');
    const u = await unpack(F, U);
    const want = [...ws.keys()].filter((k) => !k.startsWith('audio/') || k === 'audio/manifest.json' || Object.values(results[name].back.index.audio).some((x) => x.file === k)).sort();
    assert.deepEqual(u.written.slice().sort(), want);
    for (const k of u.written) assert.ok(fs.readFileSync(path.join(U, k)).equals(Buffer.from(ws.get(k))), `unpacked ${k} equals the edited workspace`);
    // まとめ直す（組み直し）
    const re = await buildPortable(path.join(U, 'deck.html'), { out: path.join(U, 'out', 're' + FORMAT.FILE_EXT) });
    const x = await PF.readPortable(re.html), y = results[name].back;
    assert.equal(x.docId, y.docId);
    assert.equal(x.index.sourceSha256, y.index.sourceSha256, 'same sourceSha256');
    assert.deepEqual(Object.keys(x.files).sort(), Object.keys(y.files).sort());
    for (const p of Object.keys(x.files)) assert.ok(Buffer.from(x.files[p]).equals(Buffer.from(y.files[p])), `same bytes: ${p}`);
    assert.deepEqual(plain(x.index.audio), plain(y.index.audio), 'same audio records');
    const blocks = (h) => { const L = scanLayout(h); return Object.fromEntries(['deck-narration', 'deck-marks', 'deck-timing', 'deck-audio', 'deck-meta'].map((id) => [id, JSON.parse(h.slice(L.blocks.get(id).cStart, L.blocks.get(id).cEnd))])); };
    assert.deepEqual(blocks(re.html), blocks(a.html), 'same runtime JSON blocks');
    const rdText = (h) => { const L = scanLayout(h); return h.slice(L.readable.start, L.readable.end); };
    assert.equal(rdText(re.html), rdText(a.html), 'same readable layer');
    // 違い：<style id="deck-base"> の字（まとめ直しは字を選び直す）、字の補いの <style>、索引の項目の並びと書き方、塊の並び
    const same = (h) => { const L = scanLayout(h); return h.slice(0, L.styles.find((s) => s.id === 'deck-base').start); };
    assert.equal(same(re.html), same(a.html), 'same bytes before the font styles');
    const sup = scanLayout(re.html).styles.filter((s) => s.id && s.id.startsWith(FORMAT.FONT_SUPPLEMENT_PREFIX));
    assert.equal(sup.length, 0, 'a rebuild has no supplement (the glyphs are in deck-base)');
    // 字（deck-base の中身と補いの <style>）・索引・塊を除けば、同じバイト
    const rest = (h) => {
      const L = scanLayout(h), base = L.styles.find((q) => q.id === 'deck-base');
      const sups = new Set(L.styles.filter((q) => q.id && q.id.startsWith(FORMAT.FONT_SUPPLEMENT_PREFIX)).map((q) => q.id));
      return skeleton(h, { ...L, blocks: new Map(), readable: null, styles: L.styles.filter((q) => sups.has(q.id)) }, sups).replace(h.slice(base.cStart, base.cEnd), '<<fonts>>');
    };
    assert.ok(rest(re.html) === rest(a.html), 'outside fonts, index and chunks the rebuild is byte-identical: ' + firstDiff(rest(re.html), rest(a.html)));
    const ix = (h) => plain(PF.parseJsonStrict(PF.scanDocument(h).byId.get(FORMAT.INDEX_ID).text));
    assert.ok(deepEqual(ix(re.html), ix(a.html)), 'same index (as JSON values)');
    const ixSame = PF.scanDocument(re.html).byId.get(FORMAT.INDEX_ID).text === PF.scanDocument(a.html).byId.get(FORMAT.INDEX_ID).text;
    const chunks = (h) => scanLayout(h).chunks.map((c) => h.slice(c.start, c.end));
    const chSame = JSON.stringify(chunks(re.html)) === JSON.stringify(chunks(a.html)), chSet = JSON.stringify(chunks(re.html).sort()) === JSON.stringify(chunks(a.html).sort());
    const baseOf = (h) => { const L = scanLayout(h), b = L.styles.find((q) => q.id === 'deck-base'); return h.slice(b.cStart, b.cEnd); };
    console.log(`    pack(unpack(tier A)) vs tier A: identical=${re.html === a.html}; same files, sha256, audio records, runtime JSON, readable layer, index values${ixSame ? ' and index text' : ' (index text differs in member order)'}, chunks ${chSame ? 'in the same order' : chSet ? '(same set, other order)' : 'DIFFER'}; deck-base fonts ${baseOf(re.html) === baseOf(a.html) ? 'same' : 'differ'} (${baseOf(a.html).length} vs ${baseOf(re.html).length} chars), tier A adds ${scanLayout(a.html).styles.filter((q) => q.id && q.id.startsWith(FORMAT.FONT_SUPPLEMENT_PREFIX)).length} supplement(s)`);
    assert.ok(chSet, 'same chunk blocks');
  });
}

// ---------------------------------------------------------------- ほかの書き手の文書
ok('ほかの書き手の文書（実行系のバイト・注釈・JSON の書き方が違う）：段 A の後もそのバイトが残る', async () => {
  const d = decks.minimal;
  let h = d.html;
  // 実行系に注釈と 1 行を足し、<head> に注釈、deck-narration・deck-timing を字下げ付きの JSON に（ほかの書き手のつもり）
  h = h.replace('<script>\nwindow.DECK = window.DECK || {};', '<script>\n/* produced by another-tool 9.9 */ window.__other = 1;\nwindow.DECK = window.DECK || {};');
  assert.ok(h.includes('another-tool 9.9'));
  h = h.replace('</head>', '<!-- other producer: keep me -->\n</head>');
  const re = (id, fn) => { const b = scanLayout(h).blocks.get(id); h = h.slice(0, b.cStart) + PF.htmlSafeJson(fn(JSON.parse(h.slice(b.cStart, b.cEnd)))) + h.slice(b.cEnd); };
  re('deck-narration', (o) => JSON.stringify(o, null, 2));
  re('deck-timing', (o) => JSON.stringify({ ...o, 'x-other:0': { hold: 2 } }, null, '\t'));
  const r = await PF.readPortable(h);
  assert.ok(r.sourceMatches, 'runtime bytes are not part of sourceSha256');
  const ws = workspace(r);
  const key = Object.keys(r.audio)[0];
  setText(ws, 'narration.md', editTurn(getText(ws, 'narration.md'), key, '（別の書き手）'));
  setText(ws, 'timeline.json', JSON.stringify({ [key]: { lead: 0.5 } }));
  const a = await tierA(h, ws, { fonts: FONTS_SRC });
  assert.ok(a.ok, `[${a.code}] ${a.reason}`);
  regionDiff(h, a.html, { narration: [key], timing: [key] });
  assert.ok(a.html.includes('/* produced by another-tool 9.9 */ window.__other = 1;') && a.html.includes('<!-- other producer: keep me -->'));
  const b = scanLayout(a.html).blocks.get('deck-narration'), nt = a.html.slice(b.cStart, b.cEnd);
  assert.ok(nt.includes('\n  "'), 'deck-narration keeps its indentation');
  const tb = scanLayout(a.html).blocks.get('deck-timing'), tt = a.html.slice(tb.cStart, tb.cEnd);
  assert.ok(tt.includes('"x-other:0"') && tt.includes('\n\t"'), 'deck-timing keeps the other entry and its tabs');
  assert.deepEqual(JSON.parse(tt)[key], { lead: 0.5 });
});

// ---------------------------------------------------------------- 知らない項目
ok('知らない項目（索引の上・metadata・音声の記録・塊・テーマ・版・拡張）は段 A の保存の後も残る。拡張はバイトのまま', async () => {
  const d = decks.minimal;
  const ixText = PF.scanDocument(d.html).byId.get(FORMAT.INDEX_ID).text;
  const ix = JSON.parse(ixText);
  addUnknownMembers(ix);
  const h = await PF.replaceIndexText(d.html, JSON.stringify(ix, null, 1));
  const r = await PF.readPortable(h);
  const ws = workspace(r);
  const key = Object.keys(r.audio)[0];
  setText(ws, 'narration.md', editTurn(getText(ws, 'narration.md'), key, '（知らない項目）'));
  // 音声も 1 つ替える（その記録の知らない項目も残る）
  const k2 = Object.keys(r.audio)[1], f2 = r.audio[k2].file;
  ws.set(f2, new Uint8Array(silentWav(0.9)));
  const man = JSON.parse(getText(ws, 'audio/manifest.json'));
  man.segments[k2] = { ...man.segments[k2], dur: 0.9, kind: 'recorded', sync: 'none', cues: [], inputHash: null };
  delete man.segments[k2].recipe; delete man.segments[k2].engine; delete man.segments[k2].digest;
  setText(ws, 'audio/manifest.json', JSON.stringify(man, null, 1) + '\n');
  const a = await tierA(h, ws, { fonts: FONTS_SRC });
  assert.ok(a.ok, `[${a.code}] ${a.reason}`);
  const x = plain(a.index);
  assert.deepEqual(x.futureMember, { kept: true });
  assert.equal(x.version.xPatch, 7);
  assert.equal(x.metadata.xAudienceNote, 'kept');
  for (const [k, rec] of Object.entries(x.audio)) assert.deepEqual(rec.xTake, { kept: true }, k);
  for (const [id, b] of Object.entries(x.blobs)) if (r.index.blobs[id]) assert.equal(b.xStorage, 'kept', id);
  for (const t of x.themes || []) assert.equal(t.xRegistryUrl, 'kept');
  const ext = (t) => { const o = jsonObjectAt(t, t.indexOf('{')); const m = o.members.find((q) => q.key === 'extensions'); return t.slice(m.valStart, m.valEnd); };
  const na = PF.scanDocument(a.html).byId.get(FORMAT.INDEX_ID).text;
  assert.equal(ext(na), ext(PF.scanDocument(h).byId.get(FORMAT.INDEX_ID).text), 'extensions byte-for-byte');
  // 替えた音声：録音（kind・sync none・cues []）、新しい塊、deck-audio も新しい塊を指す
  assert.equal(x.audio[k2].kind, 'recorded'); assert.equal(x.audio[k2].sync, 'none'); assert.equal(x.audio[k2].inputHash, null);
  const L = scanLayout(a.html), da = JSON.parse(a.html.slice(L.blocks.get('deck-audio').cStart, L.blocks.get('deck-audio').cEnd));
  assert.equal(da[k2].src, FORMAT.URI_SCHEME + x.files[f2]); assert.equal(da[k2].sync, 'none'); assert.equal(da[k2].dur, 0.9);
  regionDiff(h, a.html, { narration: [key], audio: [k2] });
  const back = await PF.readPortable(a.html);
  assert.ok(back.sourceMatches);
  assert.ok(Buffer.from(back.files[f2]).equals(silentWav(0.9)));
});

// ---------------------------------------------------------------- 新しい教材・何も変えない・断る
ok('新しい教材として保存（段 A）：docId・derivedFrom・設定のファイルが変わり、権利の表示はそのまま。何も変えなければ同じバイト', async () => {
  const d = decks.minimal, r = d.r;
  const same = await tierA(d.html, workspace(r));
  assert.ok(same.ok && same.html === d.html && same.changes.unchanged, 'no change → identical bytes');
  const ws = workspace(r);
  const nid = PF.newDocId(), derivedFrom = { docId: r.docId, sourceSha256: r.index.sourceSha256 };
  const cfg = JSON.parse(getText(ws, FORMAT.CONFIG_FILE));
  setText(ws, FORMAT.CONFIG_FILE, JSON.stringify({ ...cfg, docId: nid, metadata: { ...cfg.metadata, derivedFrom } }, null, 2) + '\n');
  const a = await tierA(d.html, ws, { identity: { docId: nid, derivedFrom } });
  assert.ok(a.ok, `[${a.code}] ${a.reason}`);
  regionDiff(d.html, a.html, { meta: ['sourceSha256', 'docId'] });
  const back = await PF.readPortable(a.html);
  assert.equal(back.docId, nid); assert.equal(back.deckMeta.docId, nid);
  assert.deepEqual(plain(back.index.metadata.derivedFrom), derivedFrom);
  for (const k of ['license', 'copyright', 'attribution', 'creators']) assert.deepEqual(back.index.metadata[k], r.index.metadata[k]);
  // docId を変えない保存で設定のファイルの docId だけ変えたら断る
  const bad = await tierA(d.html, ws);
  assert.equal(bad.ok, false); assert.equal(bad.code, 'config-changed');
});
ok('断る：スライドの原稿が変わった（段 B へ）・組んだ教材と原稿が食い違う・timeline.json が JSON でない・取り出しだけの文書', async () => {
  const d = decks.minimal, r = d.r;
  const ws = workspace(r);
  setText(ws, 'deck.html', getText(ws, 'deck.html').replace('</title>', ' x</title>'));
  let a = await tierA(d.html, ws);
  assert.equal(a.code, 'source-changed'); assert.deepEqual(a.details, ['deck.html']);
  const ws2 = workspace(r); setText(ws2, 'timeline.json', '{oops');
  a = await tierA(d.html, ws2); assert.equal(a.code, 'timeline');
  const m = PF.scanDocument(d.html).byId.get('deck-meta'), meta = JSON.parse(m.text); meta.sourceSha256 = 'f'.repeat(64);
  const mism = d.html.slice(0, m.start) + `<script type="application/json" id="deck-meta">${PF.htmlSafeJson(JSON.stringify(meta))}</script>` + d.html.slice(m.end);
  a = await tierA(mism, workspace(r)); assert.equal(a.code, 'source-mismatch');
  const fut = await PF.replaceIndexText(d.html, JSON.stringify({ ...JSON.parse(PF.scanDocument(d.html).byId.get(FORMAT.INDEX_ID).text), requires: ['sources-v1', 'audio-v1', 'something-v9'] }, null, 1));
  a = await tierA(fut, workspace(r)); assert.equal(a.code, 'unreadable'); assert.equal(a.details.code, 'unknown-feature');
  // 段階を消す・足す（読める層の div を消す・足す。新しい段階は順の位置に）
  const ws3 = workspace(r);
  const narr = getText(ws3, 'narration.md');
  const segs = parseNarration(narr), victim = segs[3];
  const lines = narr.split('\n'); lines.splice(victim.line - 1, 1);
  setText(ws3, 'narration.md', lines.join('\n'));
  a = await tierA(d.html, ws3);
  assert.ok(a.ok, `[${a.code}] ${a.reason}`);
  const vk = `${victim.slideKey}:${victim.stepKey}`;
  regionDiff(d.html, a.html, { narration: [vk], marks: [vk], audio: [vk] });
  assert.ok(!scanLayout(a.html).readable.articles.get(victim.slideKey).divs.has(vk));
  // 段階の口述原稿をまるごと消した：その音声の記録と塊も消し、知らせる（§5.4）。作業場所の audio/manifest.json に残っていても、消してあっても同じ
  assert.ok(r.index.audio[vk], 'the removed step had audio');
  const vBlob = r.index.files[r.index.audio[vk].file];
  const removedWarn = (x) => x.warnings.filter((w) => w.includes(`"${vk}"`) && /removed/.test(w));
  assert.equal(removedWarn(a).length, 1, `one warning for the removed audio: ${JSON.stringify(a.warnings)}`);
  assert.ok(!a.index.audio[vk] && a.changes.audio.includes(vk) && !a.index.files[r.index.audio[vk].file], 'record and file entry removed');
  if (!Object.entries(r.index.audio).some(([k, x]) => k !== vk && r.index.files[x.file] === vBlob)) assert.ok(a.changes.blobsDropped.includes(vBlob) && !a.html.includes(`id="${FORMAT.BLOB_PREFIX}${vBlob}-0"`), 'blob removed');
  const ws3b = new Map(ws3), man3 = JSON.parse(getText(ws3b, 'audio/manifest.json'));
  delete man3.segments[vk]; setText(ws3b, 'audio/manifest.json', JSON.stringify(man3, null, 1) + '\n');
  const a2 = await tierA(d.html, ws3b);
  assert.ok(a2.ok && removedWarn(a2).length === 1 && !a2.index.audio[vk], 'same when the manifest entry was removed as well');
  // 直しただけの段階の音声は残る（古い。知らせはない）：最初の試験のとおり
  assert.equal(results.minimal.a.warnings.filter((w) => /removed/.test(w)).length, 0);
  const b = await tierA(a.html, workspace(r), { fonts: FONTS_SRC });   // 元に戻す（足す。字を絞り込んだ文書では、消した段階の字を持つとみなせないので補いが要ることがある）
  assert.ok(b.ok, `[${b.code}] ${b.reason}`);
  const rd = (h) => { const L = scanLayout(h); return h.slice(L.readable.start, L.readable.end); };
  assert.equal(rd(b.html), rd(d.html), 'adding the step back restores the readable layer byte for byte');
  const blk = (h, id) => { const L = scanLayout(h); return h.slice(L.blocks.get(id).cStart, L.blocks.get(id).cEnd); };
  for (const id of ['deck-narration', 'deck-marks', 'deck-audio']) assert.equal(blk(b.html, id), blk(d.html, id), `${id} restored byte for byte`);
  assert.ok(deepEqual(plain(b.index.audio), plain(r.index.audio)), 'audio records restored');
});

// ---------------------------------------------------------------- 字の補い（§7.2）：番号・位置・埋め込んである字ごと
ok('書き手：埋め込む @font-face はどれも unicode-range を持つ（段 A が字の範囲から分かるように）', async () => {
  for (const name of Object.keys(decks)) {
    const h = decks[name].html, L = scanLayout(h);
    const faces = L.styles.flatMap((st) => h.slice(st.cStart, st.cEnd).match(/@font-face\s*\{[^}]*\}/g) || []);
    assert.ok(faces.length > 0, `${name}: has font faces`);
    for (const f of faces) assert.match(f, /unicode-range\s*:/, `${name}: ${f.slice(0, 80)}…`);
  }
  // KaTeX の字の範囲（前もって cmap から求めたもの）が今の KaTeX と合う
  const c = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'katex-ranges.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(c.status, 0, c.stdout + c.stderr);
});
ok('字の補い：番号は今ある補い（正準の 10 進）の次、最後の字の <style> の後に、埋め込んである字（family・weight・style）ごとに。400 だけなら 400 だけ', async () => {
  const d = decks.minimal, SUP = FORMAT.FONT_SUPPLEMENT_PREFIX;
  let h = d.html;
  const base = scanLayout(h).styles.find((x) => x.id === 'deck-base');
  // 太字の字を除く（400 だけを埋め込んだ文書）。ほかの書き手の補い（3 と、正準でない 07）と、斜体の字（A だけ）を足す
  const css = h.slice(base.cStart, base.cEnd).replace(/@font-face\{[^}]*font-weight:700;[^}]*\}\n?/g, '');
  const faceRules = css.match(/@font-face\{[^}]*\}/g) || [];
  assert.ok(!faceRules.some((x) => /font-weight:700/.test(x)) && faceRules.some((x) => /BIZ UDPGothic[^}]*font-weight:400/.test(x)));
  const extra = `\n<style id="${SUP}3">/* another editor */</style>\n<style id="${SUP}07">@font-face{font-family:"BIZ UDPGothic";font-style:italic;font-display:block;font-weight:400;src:url(data:font/woff2;base64,AA==) format("woff2");unicode-range:U+41}\n</style>`;
  h = h.slice(0, base.cStart) + css + h.slice(base.cEnd, base.end) + extra + h.slice(base.end);
  const r = await PF.readPortable(h);
  assert.ok(r.sourceMatches);
  const ws = workspace(r), key = Object.keys(r.audio)[1];
  setText(ws, 'narration.md', editTurn(getText(ws, 'narration.md'), key, ` ${NEW_GLYPHS}の森。`));
  const a = await tierA(h, ws, { fonts: FONTS_SRC });
  assert.ok(a.ok, `[${a.code}] ${a.reason}`);
  assert.equal(a.changes.supplement.id, SUP + '4');
  const fam = 'BIZ UDPGothic';
  // 斜体の字は A しか持たないので、変えた段階の字の分も補う（それも 400 だけ）
  assert.deepEqual([...new Set(a.changes.supplement.faces.map((f) => `${f.family}/${f.weight}/${f.style}`))].sort(), [`${fam}/400/italic`, `${fam}/400/normal`], 'faces only for the embedded (family, weight, style) that lack the characters, no 700');
  const L = scanLayout(a.html), sup = L.styles.find((x) => x.id === SUP + '4'), prev = L.styles.find((x) => x.id === SUP + '07');
  assert.ok(sup && prev && a.html.slice(prev.end, sup.start) === '\n', 'placed right after the last font style element');
  const supCss = a.html.slice(sup.cStart, sup.cEnd), rules = supCss.match(/@font-face\{[^}]*\}/g);
  const faceKey = (b) => `${/font-family:"?([^";]+)"?/.exec(b)[1]}/${/font-weight:(\d+)/.exec(b)[1]}/${/font-style:(\w+)/.exec(b)[1]}`;
  const embedded = new Set([...h.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => faceKey(m[1])));
  for (const x of rules) assert.ok(embedded.has(faceKey(x)) && /unicode-range:/.test(x), x.slice(0, 100));
  regionDiff(h, a.html, { narration: [key] });
  // もう一度足すと 5
  const ws2 = new Map(ws); setText(ws2, 'narration.md', editTurn(getText(ws, 'narration.md'), Object.keys(r.audio)[2], '　饕餮。'));
  const b = await tierA(a.html, ws2, { fonts: FONTS_SRC });
  assert.ok(b.ok && b.changes.supplement.id === SUP + '5', JSON.stringify(b.changes && b.changes.supplement));
  const L2 = scanLayout(b.html);
  assert.ok(L2.styles.find((x) => x.id === SUP + '5').start === L2.styles.find((x) => x.id === SUP + '4').end + 1, 'after the previous supplement');
});

// ---------------------------------------------------------------- 読める層（§2.1）：段階の並び・行き先のない口述原稿
ok('読める層：段階は番号の小さい順で concl が最後（原稿の書き順によらない）。どのスライドにも当たらない口述原稿は入れず知らせる', async () => {
  const d = decks.minimal, r = d.r;
  const ws = workspace(r), narr = getText(ws, 'narration.md');
  const sk = '何を最小化するか';
  const segs = parseNarration(narr).filter((x) => x.slideKey === sk);
  const lineOf = (st) => narr.split('\n')[segs.find((x) => x.stepKey === st).line - 1];
  // 1. 1・2・concl を消す
  const lines = narr.split('\n');
  const drop = new Set(['1', '2', 'concl'].map((st) => segs.find((x) => x.stepKey === st).line - 1));
  setText(ws, 'narration.md', lines.filter((_, j) => !drop.has(j)).join('\n'));
  const a = await tierA(d.html, ws);
  assert.ok(a.ok, `[${a.code}] ${a.reason}`);
  // 2. 書き順を逆にして戻す（[0] の後に concl・2・1）。行き先のない節も足す
  const back = lines.filter((_, j) => !drop.has(j));
  const at = back.indexOf(lineOf('0')) + 1;
  back.splice(at, 0, lineOf('concl'), lineOf('2'), lineOf('1'));
  const ws2 = workspace(r);
  setText(ws2, 'narration.md', back.join('\n') + '\n## 存在しないスライド\n[0] 勾配の話の続きです。\n');
  const b = await tierA(a.html, ws2, { fonts: FONTS_SRC });
  assert.ok(b.ok, `[${b.code}] ${b.reason}`);
  const L = scanLayout(b.html), art = L.readable.articles.get(sk);
  const order = [...art.divs.entries()].sort((x, y) => x[1].start - y[1].start).map(([k]) => k.slice(sk.length + 1));
  assert.deepEqual(order, ['0', '1', '2', '3', 'concl']);
  const rd = (h) => { const M = scanLayout(h); return h.slice(M.readable.start, M.readable.end); };
  assert.equal(rd(b.html), rd(d.html), 'same readable layer as the original (whose writer sorts the same way)');
  assert.ok(!L.readable.articles.has('存在しないスライド') && !rd(b.html).includes('存在しないスライド'), 'no article for the orphan narration');
  assert.ok(b.warnings.some((w) => w.includes('"存在しないスライド:0"') && /matches no slide/.test(w)), `orphan reported: ${JSON.stringify(b.warnings)}`);
});

// ---------------------------------------------------------------- 拡張（§9A）：変わった行から作られる項目だけが変わる
ok('拡張：段 A は変わった拡張の行から作られる項目だけを書き換え、ほかの項目（v・設定・ほかの段階・ほかの拡張）はバイトのまま', async () => {
  const d = decks.minimal;
  const ix = JSON.parse(PF.scanDocument(d.html).byId.get(FORMAT.INDEX_ID).text);
  addUnknownMembers(ix);
  ix.extensions.tutor = { v: 1, xConf: { kept: true } };
  const h = await PF.replaceIndexText(d.html, JSON.stringify(ix, null, 1));
  const r = await PF.readPortable(h);
  const keys = Object.keys(r.audio), [k1, k2] = [keys[1], keys[3]];
  const withLines = (narr, adds) => {
    const L = narr.split('\n'), segs = parseNarration(narr);
    for (const [k, lines] of Object.entries(adds).sort((x, y) => segOf(narr, y[0]).line - segOf(narr, x[0]).line)) L.splice(segs.find((x) => `${x.slideKey}:${x.stepKey}` === k).line, 0, ...lines);
    return L.join('\n');
  };
  const memberText = (html, ...path) => {
    const t = PF.scanDocument(html).byId.get(FORMAT.INDEX_ID).text;
    let at = t.indexOf('{'), m = null;
    for (const p of path) { m = jsonObjectAt(t, at).members.find((q) => q.key === p); if (!m) return undefined; at = m.valStart; }
    return t.slice(m.valStart, m.valEnd);
  };
  const narr0 = getText(workspace(r), 'narration.md');
  // 1. 2 つの段階に行を足す
  const ws = workspace(r);
  setText(ws, 'narration.md', withLines(narr0, { [k1]: ['@x-tutor-q 問い 1'], [k2]: ['@x-tutor-q 問い 2', '@x-tutor-hint ヒント'] }));
  const a = await tierA(h, ws);
  assert.ok(a.ok, `[${a.code}] ${a.reason}`);
  assert.deepEqual(a.changes.extensions, ['tutor']);
  assert.deepEqual(plain(a.index.extensions.tutor), { v: 1, xConf: { kept: true }, [k1]: { q: '問い 1' }, [k2]: { q: '問い 2', hint: 'ヒント' } });
  for (const p of [['chapters'], ['tutor', 'v'], ['tutor', 'xConf']]) assert.equal(memberText(a.html, 'extensions', ...p), memberText(h, 'extensions', ...p), `byte-for-byte: ${p.join('.')}`);
  // 2. 1 つの段階の行だけを直す：その項目だけが変わる
  const ws2 = workspace(r);
  setText(ws2, 'narration.md', withLines(narr0, { [k1]: ['@x-tutor-q 問い 1（直した）'], [k2]: ['@x-tutor-q 問い 2', '@x-tutor-hint ヒント'] }));
  const b = await tierA(a.html, ws2);
  assert.ok(b.ok, `[${b.code}] ${b.reason}`);
  assert.deepEqual(plain(b.index.extensions.tutor[k1]), { q: '問い 1（直した）' });
  for (const p of [['chapters'], ['tutor', 'v'], ['tutor', 'xConf'], ['tutor', k2]]) assert.equal(memberText(b.html, 'extensions', ...p), memberText(a.html, 'extensions', ...p), `byte-for-byte: ${p.join('.')}`);
  // 3. 行をすべて消す：行から作った項目だけが消え、v と設定は残る（v だけになる拡張は消える）
  const c = await tierA(b.html, workspace(r));
  assert.ok(c.ok, `[${c.code}] ${c.reason}`);
  assert.deepEqual(plain(c.index.extensions.tutor), { v: 1, xConf: { kept: true } });
  assert.equal(memberText(c.html, 'extensions', 'chapters'), memberText(h, 'extensions', 'chapters'));
  const plainH = await PF.replaceIndexText(d.html, JSON.stringify(JSON.parse(PF.scanDocument(d.html).byId.get(FORMAT.INDEX_ID).text), null, 1));
  const e1 = await tierA(plainH, ws), e2 = e1.ok && await tierA(e1.html, workspace(r));
  assert.ok(e1.ok && e1.index.extensions.tutor && e2.ok && !(e2.index.extensions && e2.index.extensions.tutor), 'an extension made only from lines goes away with its lines');
});

for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; }
}
console.log(`tier A: ${tests.length} tests (${work})`);
