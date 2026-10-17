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

// ---------------------------------------------------------------- 場所を見分ける差分
// a（元）と b（段 A の後）を比べる。allowed：{narration: [段階の鍵], marks, timing, audio, meta: [deck-meta の項目]}
// 返すもの：{supplements: [新しい補いの id], chunksAdded, chunksDropped}。決まった場所の外が違えば assert で落ちる
function skeleton(text, L, newSups) {
  const cut = [];
  for (const [id, b] of L.blocks) cut.push([b.cStart, b.cEnd, `<<${id}>>`]);
  cut.push([L.index.start, L.index.end, '<<index>>']);
  for (const c of L.chunks) cut.push([c.start, c.end + (text[c.end] === '\n' ? 1 : 0), '']);
  if (L.readable) cut.push([L.readable.cStart, L.readable.cEnd, '<<readable>>']);
  for (const s of L.styles) if (newSups.has(s.id)) cut.push([s.start - (text[s.start - 1] === '\n' ? 1 : 0), s.end, '']);
  cut.sort((x, y) => y[0] - x[0]);
  let out = text;
  for (const [s, e, r] of cut) out = out.slice(0, s) + r + out.slice(e);
  return out;
}
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `at ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 60), i + 80))}\n   vs ${JSON.stringify(b.slice(Math.max(0, i - 60), i + 80))}`; };
// JSON の object の各項目の生の文字列（{鍵: 文字列}）
const rawMembers = (t, at = 0) => { const o = jsonObjectAt(t, t.indexOf('{', at)); return Object.fromEntries(o.members.map((m) => [m.key, { raw: t.slice(m.valStart, m.valEnd), at: m.valStart }])); };
export function regionDiff(a, b, allowed = {}) {
  const La = scanLayout(a), Lb = scanLayout(b);
  const supsA = new Set(La.styles.map((s) => s.id).filter(Boolean)), newSups = new Set(Lb.styles.map((s) => s.id).filter((id) => id && !supsA.has(id)));
  for (const id of newSups) assert.ok(id.startsWith(FORMAT.FONT_SUPPLEMENT_PREFIX), `new <style id="${id}"> is not a font supplement`);
  const sa = skeleton(a, La, new Set()), sb = skeleton(b, Lb, newSups);
  assert.ok(sa === sb, 'bytes outside the tier A regions differ: ' + firstDiff(sa, sb));
  // 実行系の JSON：変わってよい項目のほかは生の文字列が同じ
  const allow = { 'deck-marks': allowed.marks || [], 'deck-timing': allowed.timing || [], 'deck-audio': allowed.audio || [], 'deck-meta': allowed.meta || ['sourceSha256'] };
  const text = (L, t, id) => t.slice(L.blocks.get(id).cStart, L.blocks.get(id).cEnd);
  for (const id of Object.keys(allow)) {
    const ma = rawMembers(text(La, a, id)), mb = rawMembers(text(Lb, b, id));
    for (const k of new Set([...Object.keys(ma), ...Object.keys(mb)])) if (!allow[id].includes(k)) assert.equal(mb[k]?.raw, ma[k]?.raw, `${id}["${k}"] changed but is not an affected entry`);
  }
  const na = rawMembers(text(La, a, 'deck-narration')), nb = rawMembers(text(Lb, b, 'deck-narration'));
  const narr = new Set(allowed.narration || []);
  for (const s of new Set([...Object.keys(na), ...Object.keys(nb)])) {
    const steps = (m) => (m[s] ? rawMembers(m[s].raw) : {});
    const xa = steps(na), xb = steps(nb);
    for (const st of new Set([...Object.keys(xa), ...Object.keys(xb)])) if (!narr.has(`${s}:${st}`)) assert.equal(xb[st]?.raw, xa[st]?.raw, `deck-narration["${s}"]["${st}"] changed but is not an affected step`);
  }
  // 読める層：変わった段階の div を除けば同じ
  const rd = (t, L) => {
    const cut = [];
    for (const art of L.readable.articles.values()) for (const [k, d] of art.divs) if (narr.has(k)) cut.push([d.start - (t[d.start - 1] === '\n' ? 1 : 0), d.end]);
    cut.sort((x, y) => y[0] - x[0]);
    let out = t.slice(L.readable.cStart, L.readable.cEnd), off = L.readable.cStart;
    for (const [s, e] of cut) out = out.slice(0, s - off) + out.slice(e - off);
    return out;
  };
  const ra = rd(a, La), rb = rd(b, Lb);
  assert.ok(ra === rb, 'readable layer changed outside the affected steps: ' + firstDiff(ra, rb));
  // 塊：両方にあるものは同じバイト。消えたものは新しい索引から参照されない。増えたものは参照される
  const ib = PF.parseJsonStrict(Lb.index && b.slice(Lb.index.cStart, Lb.index.cEnd));
  const used = new Set(Object.values(ib.blobs).flatMap((x) => x.chunks));
  const ca = new Map(La.chunks.map((c) => [c.id, a.slice(c.start, c.end)])), cb = new Map(Lb.chunks.map((c) => [c.id, b.slice(c.start, c.end)]));
  const added = [], dropped = [];
  for (const [id, t] of ca) { if (cb.has(id)) assert.equal(cb.get(id), t, `chunk ${id} changed`); else { dropped.push(id); assert.ok(!used.has(id), `dropped chunk ${id} is still referenced`); } }
  for (const id of cb.keys()) if (!ca.has(id)) { added.push(id); assert.ok(used.has(id), `added chunk ${id} is not referenced`); }
  return { supplements: [...newSups], chunksAdded: added, chunksDropped: dropped };
}

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
// 新しい字（どちらの教材の原稿にも、組み立ての字にもない漢字）
const NEW_GLYPHS = '鬱蒼';
for (const name of ['minimal', 'tmlr2026-calibration']) {
  ok(`${name}：口述原稿の 1 つの発言（新しい字の漢字）と timeline.json の pad_after を変えて段 A で保存する`, async () => {
    const d = decks[name] = await prepare(name);
    const { r } = d;
    const ws = workspace(r);
    const narr = getText(ws, 'narration.md');
    const segs = parseNarration(narr);
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
    assert.ok(c.ok && c.html === b.html);
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
  const b = await tierA(a.html, workspace(r), { fonts: FONTS_SRC });   // 元に戻す（足す。字を絞り込んだ文書では、消した段階の字を持つとみなせないので補いが要ることがある）
  assert.ok(b.ok, `[${b.code}] ${b.reason}`);
  const rd = (h) => { const L = scanLayout(h); return h.slice(L.readable.start, L.readable.end); };
  assert.equal(rd(b.html), rd(d.html), 'adding the step back restores the readable layer byte for byte');
  const blk = (h, id) => { const L = scanLayout(h); return h.slice(L.blocks.get(id).cStart, L.blocks.get(id).cEnd); };
  for (const id of ['deck-narration', 'deck-marks', 'deck-audio']) assert.equal(blk(b.html, id), blk(d.html, id), `${id} restored byte for byte`);
  assert.ok(deepEqual(plain(b.index.audio), plain(r.index.audio)), 'audio records restored');
});

for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { console.error(`FAIL ${name}\n${e.stack}`); process.exitCode = 1; }
}
console.log(`tier A: ${tests.length} tests (${work})`);
