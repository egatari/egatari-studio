// 読み上げで聞く（端末の声。format spec §5.6、backlog #89）の試験
//   node tools/test-read-aloud.mjs [作業用のフォルダ]
// 1. 読む文（kit/core/read-aloud.mjs）：{x|y} は y、{cue}・{mark:…}・@x- の行は読まない、読み辞書と join-num-counter は AI 音声と同じ
// 2. 声を選ぶ：端末の中の声（localService === true）だけ。ネットワークの声は既定の声でも一覧の先頭でも選ばない。2 つあれば役ごとに別の声
// 3. 実行系に入れる形（classicNamespace → DECK.ReadAloud・DECK.TtsNormalize）
// 4. 再生器（speechSynthesis の差し替え）：帯のボタン・音声のあるステップでは読まない・読む・札「読み上げ中（この端末の声）」・進むと止める・
//    Esc で止める・声がない端末の知らせ・タイムラインと (i, k, t) の画面が変わらない・動画のモードでは何も作らない・ファイルのバイトが変わらない
// 5. 編集アプリの音声の板：今のステップ（読み辞書を当てた文）と選んだ語・声がないときの知らせ（AI 音声・Colab）・作業フォルダに何も書かない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spokenTurns, spokenText, pickVoices, localVoices, createReader } from '../kit/core/read-aloud.mjs';
import { applyYomi, parseYomiTerms } from '../kit/core/yomi.mjs';
import { normalizeTtsText } from '../kit/core/tts-normalize.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import { classicNamespace, RUNTIME_NAMESPACES } from '../kit/core/build-core.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import * as PF from '../kit/core/portable.mjs';
import { audioState } from '../kit/core/audio-core.mjs';
import { launch, fileUrl, stableCapture } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-read-aloud-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------- 1. 読む文
const terms = parseYomiTerms(fs.readFileSync(path.join(ROOT, 'tts', 'yomi.yaml'), 'utf8'));
const O = { lang: 'ja', terms, applyYomi, normalize: normalizeTtsText };
{
  const md = '## 例 {#s-ex}\n[0] パラメータ {θ|シータ} を{cue} 1 歩ずつ {mark:eta|circle}動かします。\n@x-live-poll q1\nN: {η|イータ} は 3 分で決めます。\n[1] {L殻|エルかく}\n';
  const seg = parseNarration(md)[0];
  const sp = spokenTurns(seg.turns, O);
  ok(sp.length === 2 && sp[0].role === 'expert' && sp[1].role === 'novice', 'text: one entry per turn, roles kept ' + JSON.stringify(sp));
  ok(sp[0].text === 'パラメータ シータ を1歩ずつ動かします。', 'text: readings substituted, {cue} and {mark} not read, join-num-counter applied: ' + sp[0].text);
  ok(!/x-live|q1/.test(sp.map((t) => t.text).join('')), 'text: @x- lines are not read');
  ok(sp[1].text === 'イータ は 3分で決めます。', 'text: second turn ' + sp[1].text);
  // 書いたままの文（発言の raw・選んだ語）でも同じ
  ok(spokenText('パラメータ {θ|シータ} を{cue} 1 歩ずつ {mark:eta|circle}動かします。\n@x-live-poll q1', O) === sp[0].text, 'text: the raw form gives the same text');
  ok(spokenText('L殻', O) === 'エルかく', 'text: the reading dictionary (tts/yomi.yaml) is applied like TTS: ' + spokenText('L殻', O));
  ok(spokenText('温度は −1 度', O) === normalizeTtsText(applyYomi('温度は −1 度', terms).text), 'text: the minus sign is read as TTS reads it');
  ok(spokenText('L殻', { ...O, lang: 'en' }) === 'L殻', 'text: the Japanese dictionary is not applied to an English deck');
  // AI 音声（app/audio-panel.js の regenerate）と同じ文：全段階で、TTS に渡す部品をつないだものと同じ
  let same = 0, all = 0;
  for (const ex of ['minimal', 'tmlr2026-calibration', 'kokugo-kanbun']) {
    for (const s of parseNarration(fs.readFileSync(path.join(ROOT, 'examples', ex, 'narration.md'), 'utf8'))) {
      for (const t of s.turns) {
        const tts = t.ttsParts.map((p) => normalizeTtsText(applyYomi(p, terms).text).trim()).filter(Boolean).join('');
        const ra = spokenTurns([t], O).map((x) => x.text).join('');
        all++; if (tts.replace(/\s+/g, '') === ra.replace(/\s+/g, '')) same++;
      }
    }
  }
  ok(all > 30 && same === all, `text: same words as the AI voice gets, for every turn of the examples (${same}/${all})`);
  // 表示の文（deck-narration の {role, text}）もそのまま読める
  ok(spokenTurns([{ role: 'novice', text: '1 歩 進む' }], O)[0].text === '1歩 進む', 'text: display text from deck-narration is read with the same normalisation');
}

// ---------------------------------------------------------------- 2. 声を選ぶ
{
  const V = (name, lang, local, def) => ({ name, lang, localService: local, default: !!def });
  const remoteFirst = [V('Google 日本語', 'ja-JP', false, true), V('Kyoko', 'ja-JP', true), V('Otoya', 'ja-JP', true), V('Samantha', 'en-US', true), V('Google US English', 'en-US', false)];
  let p = pickVoices(remoteFirst, 'ja');
  ok(p.expert.name === 'Kyoko' && p.novice.name === 'Otoya', 'voice: the network voice is never chosen, even as the default and first in the list; two local voices map to Expert and Novice');
  p = pickVoices([V('Google 日本語', 'ja-JP', false, true), V('Kyoko', 'ja-JP', true)], 'ja');
  ok(p.expert.name === 'Kyoko' && p.novice.name === 'Kyoko', 'voice: one local voice reads both roles');
  ok(pickVoices([V('Google 日本語', 'ja-JP', false, true), { name: 'X', lang: 'ja-JP' }, { name: 'Y', lang: 'ja-JP', localService: 'true' }], 'ja').expert === null, 'voice: no voice when only network voices (or voices without localService === true) exist');
  ok(pickVoices(remoteFirst, 'en').expert.name === 'Samantha' && pickVoices(remoteFirst, 'fr').expert === null, 'voice: matched by the deck language');
  ok(localVoices([V('A', 'en-GB', true), V('B', 'en_US', true, true)], 'en-US')[0].name === 'B', 'voice: the exact region and the default voice come first (en_US is read as en-US)');
  // macOS の Chrome が並べる順（名前の順。遊びの声と Eloquence の声も en-US / ja-JP の端末の声）
  const mac = [V('Kyoko', 'ja-JP', true, true), V('Albert', 'en-US', true), V('Bad News', 'en-US', true), V('Daniel', 'en-GB', true), V('Eddy (日本語（日本）)', 'ja-JP', true), V('Eddy (英語（イギリス）)', 'en-GB', true), V('Samantha', 'en-US', true), V('Zarvox', 'en-US', true)];
  p = pickVoices(mac, 'en');
  ok(p.expert.name === 'Samantha' && p.novice.name === 'Daniel', 'voice: natural voices before novelty voices (Albert, Bad News) on macOS Chrome ' + JSON.stringify([p.expert.name, p.novice.name]));
  p = pickVoices(mac, 'ja');
  ok(p.expert.name === 'Kyoko' && p.novice.name === 'Kyoko', 'voice: a robotic voice (Eddy) is not used for Novice; one natural voice reads both');
  ok(pickVoices([V('Albert', 'en-US', true)], 'en').expert.name === 'Albert', 'voice: a novelty voice is still used when it is the only local voice');
  // 読む・止める（差し替えの speechSynthesis）
  const said = []; let cancels = 0;
  const synth = { getVoices: () => remoteFirst, speak: (u) => said.push(u), cancel: () => { cancels++; } };
  class U { constructor(t) { this.text = t; } }
  const r = createReader({ synth, Utterance: U });
  const res = r.speak([{ role: 'expert', text: 'あ' }, { role: 'novice', text: 'い' }], 'ja');
  ok(res.ok && said.length === 2 && said[0].voice.name === 'Kyoko' && said[1].voice.name === 'Otoya' && said.every((u) => u.voice.localService === true) && r.speaking(), 'reader: speaks each turn with a local voice');
  said[1].onend({ type: 'end' });
  ok(!r.speaking(), 'reader: done after the last turn ends');
  const none = createReader({ synth: { getVoices: () => [V('Google 日本語', 'ja-JP', false, true)], speak: (u) => said.push(u), cancel() {} }, Utterance: U });
  const n0 = said.length;
  ok(none.speak([{ role: 'expert', text: 'あ' }], 'ja').reason === 'no-voice' && said.length === n0, 'reader: with only a network voice, nothing is sent to the synthesizer');
}

// ---------------------------------------------------------------- 3. 実行系に入れる形
{
  for (const [f, name] of Object.entries(RUNTIME_NAMESPACES)) {
    const ctx = { DECK: {} };
    vm.runInNewContext(classicNamespace(fs.readFileSync(path.join(ROOT, 'kit', ...f.split('/')), 'utf8'), name), ctx);
    ok(ctx.DECK[name] && Object.keys(ctx.DECK[name]).length >= 1, `runtime: ${f} becomes DECK.${name} (${Object.keys(ctx.DECK[name] || {}).join(', ')})`);
  }
  assert.throws(() => classicNamespace("import x from './y.mjs';\nexport function f() {}", 'X'));
  assert.throws(() => classicNamespace('export default 1;', 'X'));
}

// ---------------------------------------------------------------- 4. 再生器
// 差し替えの speechSynthesis（文脈のすべての文書に。編集アプリのプレビューの枠にも）。window.__RA_VOICES で声の一覧を替える
const STUB = `(() => {
  const all = { ja: [{ name: 'Google 日本語', lang: 'ja-JP', localService: false, default: true }, { name: 'Kyoko', lang: 'ja-JP', localService: true }, { name: 'Otoya', lang: 'ja-JP', localService: true },
    { name: 'Google US English', lang: 'en-US', localService: false }, { name: 'Samantha', lang: 'en-US', localService: true }],
    remote: [{ name: 'Google 日本語', lang: 'ja-JP', localService: false, default: true }] };
  const R = window.__ra = { spoken: [], cancels: 0, queue: [] };
  const list = () => all[window.__raVoices || 'ja'];
  class U { constructor(t) { this.text = t; } }
  const synth = {
    getVoices: () => list(),
    speak(u) { R.spoken.push({ text: u.text, voice: u.voice && u.voice.name, local: u.voice && u.voice.localService, lang: u.lang }); R.queue.push(u); },
    cancel() { R.cancels++; const q = R.queue; R.queue = []; q.forEach((u) => u.onerror && u.onerror({ type: 'error', error: 'interrupted' })); },
    addEventListener() {}, removeEventListener() {},
  };
  R.finish = () => { const q = R.queue; R.queue = []; q.forEach((u) => u.onend && u.onend({ type: 'end' })); };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
})();`;

// examples/minimal を組み、1 つのステップ（2 枚目の [1]）にだけ音声を入れる
const DECK_DIR = path.join(work, 'deck');
fs.rmSync(DECK_DIR, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'examples', 'minimal'), DECK_DIR, { recursive: true, filter: (s) => !/[\\/](?:out|video)([\\/]|$)/.test(path.relative(path.join(ROOT, 'examples'), s)) });
const segs = parseNarration(fs.readFileSync(path.join(DECK_DIR, 'narration.md'), 'utf8'));
const AKEY = `${segs[2].slideKey}:${segs[2].stepKey}`;
{
  fs.mkdirSync(path.join(DECK_DIR, 'audio'), { recursive: true });
  const sr = 8000, n = sr / 2, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(path.join(DECK_DIR, 'audio', 'seg_a.wav'), b);
  fs.writeFileSync(path.join(DECK_DIR, 'audio', 'manifest.json'), JSON.stringify({ segments: { [AKEY]: { file: 'seg_a.wav', dur: 0.5, cues: [], kind: 'recorded', sync: 'none' } } }));
}
const OUT = path.join(DECK_DIR, 'out', 'deck.html');
{ const r = build(path.join(DECK_DIR, 'deck.html'), { out: OUT }); if (!fs.existsSync(OUT)) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, r.html); } }
const bytes0 = sha(fs.readFileSync(OUT));

// deck-narration の ttsParts（format spec §4）：どの発言も、TTS に渡す部品（parseNarration の ttsParts、inputHash に入る値）と同じ
const blockOf = (html, id) => JSON.parse(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(html)[1]);
{
  const html = fs.readFileSync(OUT, 'utf8'), dn = blockOf(html, 'deck-narration'), marks = blockOf(html, 'deck-marks');
  let n = 0, same = 0, hashSame = 0, steps = 0;
  for (const s of segs) {
    const turns = dn[s.slideKey] && dn[s.slideKey][s.stepKey];
    if (!turns) continue;
    steps++;
    s.turns.forEach((t, j) => { n++; if (turns[j] && JSON.stringify(turns[j].ttsParts) === JSON.stringify(t.ttsParts) && Object.keys(turns[j]).join() === 'role,text,ttsParts') same++; });
    // deck-narration の ttsParts と区切り（deck-marks、なければ cue だけ）から作った inputHash の元の文字列が、口述原稿から作るものと同じ
    const bounds = marks[`${s.slideKey}:${s.stepKey}`] || s.bounds;
    const fromDeck = { turns: turns.map((t, j) => ({ role: t.role, ttsParts: t.ttsParts, bounds: s.turns[j].bounds })) };
    if (PF.inputCanonical(fromDeck) === PF.inputCanonical(s) && bounds.length === s.bounds.length) hashSame++;
  }
  ok(n > 20 && same === n, `build: every deck-narration turn carries ttsParts equal to the TTS input ({role, text, ttsParts}; ${same}/${n})`);
  ok(hashSame === steps, `build: ttsParts is the inputHash input of every step (${hashSame}/${steps})`);
  const eta = Object.values(dn).flatMap((st) => Object.values(st).flat()).find((t) => t.text.includes('η は学習率'));
  ok(eta && eta.ttsParts.join('').includes('イータ は学習率') && !eta.ttsParts.join('').includes('η'), 'build: {η|イータ} shows η and speaks イータ ' + JSON.stringify(eta));
}
// 前からある音声は古くならない：作った時の inputHash を持つ音声の記録は、1 ファイルに組んでも fresh のまま
{
  const man = JSON.parse(fs.readFileSync(path.join(DECK_DIR, 'audio', 'manifest.json'), 'utf8'));
  const h0 = await PF.inputHash(segs[2]);
  man.segments[AKEY].inputHash = h0;
  const PD = path.join(work, 'deck-portable');
  fs.rmSync(PD, { recursive: true, force: true });
  fs.cpSync(DECK_DIR, PD, { recursive: true, filter: (x) => !/[\\/]out([\\/]|$)/.test(path.relative(DECK_DIR, x)) });
  fs.writeFileSync(path.join(PD, 'audio', 'manifest.json'), JSON.stringify(man));
  fs.writeFileSync(path.join(PD, 'egatari.json'), JSON.stringify({ metadata: { license: 'CC-BY-4.0', copyright: '© 2026 Test', creators: ['Test'] } }) + '\n');
  const pr = await buildPortable(path.join(PD, 'deck.html'), { out: path.join(PD, 'out', 'deck.ega.html') });
  const rd = await PF.readPortable(pr.html);
  const rec = rd.audio[AKEY];
  const seg = parseNarration(new TextDecoder().decode(rd.files['narration.md'])).find((s) => `${s.slideKey}:${s.stepKey}` === AKEY);
  ok(rec && rec.inputHash === h0 && await audioState(rec, seg) === 'fresh', 'audio: an existing take keeps its inputHash and stays fresh in a single file with ttsParts');
  const dn = blockOf(pr.html, 'deck-narration');
  ok(Object.values(dn).every((st) => Object.values(st).every((ts) => ts.every((t) => Array.isArray(t.ttsParts)))), 'single file: deck-narration carries ttsParts too');
}

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  await ctx.addInitScript(STUB);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(fileUrl(OUT) + '#2');
  await p.waitForFunction(() => window.DECK && DECK.ready);
  const showBar = async () => { await p.mouse.move(640, 790); await p.mouse.move(641, 791); await p.waitForTimeout(300); };
  const btn = () => p.evaluate(() => { const b = document.querySelector('#dt-cb [data-b="read"]'); return b && { label: b.getAttribute('aria-label'), title: b.title, pressed: b.getAttribute('aria-pressed'), disabled: b.getAttribute('aria-disabled') }; });
  const label = () => p.evaluate(() => { const e = document.getElementById('dt-ra'); return e && e.classList.contains('on') && getComputedStyle(e).display !== 'none' ? e.textContent : null; });
  const R = () => p.evaluate(() => ({ spoken: window.__ra.spoken.slice(), cancels: window.__ra.cancels }));
  await showBar();
  let b = await btn();
  ok(b && b.label === '読み上げで聞く（音声ファイルにはなりません）' && b.pressed === 'false', 'player: the control bar has 「読み上げで聞く（音声ファイルにはなりません）」 ' + JSON.stringify(b));
  const tl0 = await p.evaluate(() => JSON.stringify(DECK.timeline()));
  const seekShot = async () => { await p.evaluate(() => DECK.go(1, 2, false)); await p.waitForTimeout(1200); await p.evaluate(() => DECK.seek(1, 2, Infinity)); await p.mouse.move(640, 300); return stableCapture(p); };
  const shot0 = await seekShot();
  
  // 音声のあるステップ（2 枚目の [1]）：読まない
  await p.evaluate(() => DECK.go(1, 1, false));
  await p.waitForFunction((k) => DECK.state().key === k, AKEY);
  await showBar();
  b = await btn();
  ok(b.disabled === 'true' && /音声があります/.test(b.title), 'player: on a step with audio the button is disabled and says the step has audio ' + JSON.stringify(b));
  await p.click('#dt-cb [data-b="read"]', { force: true });
  await p.waitForTimeout(150);
  ok((await R()).spoken.length === 0 && (await label()) === null, 'player: a step with audio is not read aloud (its audio is used)');
  // 音声のないステップ（2 枚目の [2]）：読む
  await p.evaluate(() => DECK.go(1, 2, false));
  await showBar();
  await p.click('#dt-cb [data-b="read"]');
  await p.waitForFunction(() => window.__ra.spoken.length > 0);
  let r = await R();
  const want = segs.find((s) => `${s.slideKey}:${s.stepKey}` === segs[3].slideKey + ':' + segs[3].stepKey);
  ok(r.spoken.length === 1 && r.spoken[0].voice === 'Kyoko' && r.spoken[0].local === true && r.spoken[0].text === normalizeTtsText(want.turns[0].display), 'player: reads the current step with the local voice (never the network default) ' + JSON.stringify(r.spoken));
  ok((await label()) && (await label()).startsWith('読み上げ中（この端末の声）'), 'player: shows 「読み上げ中（この端末の声）」 while reading: ' + await label());
  b = await btn();
  ok(b.pressed === 'true', 'player: the button is pressed while reading');
  ok(await p.evaluate(() => DECK.tools.readAloud()) === true, 'player: DECK.tools.readAloud() says it is reading');
  // 進むと止める
  const c0 = r.cancels;
  await p.keyboard.press('ArrowRight');
  await p.waitForFunction(() => DECK.state().step === 3);
  r = await R();
  ok(r.cancels > c0 && (await label()) === null && !(await p.evaluate(() => DECK.tools.readAloud())), 'player: advancing cancels the speech and removes the label');
  // Esc で止める・読み終えると札が消える
  await showBar();
  await p.click('#dt-cb [data-b="read"]');
  await p.waitForFunction(() => window.__ra.queue.length > 0);
  await p.keyboard.press('Escape');
  ok((await label()) === null && (await p.evaluate(() => DECK.state().step)) === 3, 'player: Esc stops reading (the step stays)');
  await p.click('#dt-cb [data-b="read"]');
  await p.waitForFunction(() => window.__ra.queue.length > 0);
  await p.evaluate(() => window.__ra.finish());
  ok((await label()) === null, 'player: the label goes away when the reading ends');
  // 読み（{η|イータ}）は deck-narration の ttsParts から：「イータ」と読み、古いファイルの知らせは出さない
  await p.evaluate(() => { window.__ra.spoken = []; DECK.go(2, 2, false); });
  await showBar();
  await p.click('#dt-cb [data-b="read"]');
  await p.waitForFunction(() => window.__ra.spoken.length > 0);
  r = await R();
  ok(/^イータ は学習率で/.test(r.spoken[0].text) && !/η/.test(r.spoken[0].text), 'player: reads イータ for η from ttsParts: ' + r.spoken[0].text);
  ok(!(await p.evaluate(() => !!document.querySelector('#dt-ra .dt-ra-old'))), 'player: no older-file hint when ttsParts is present');
  await p.keyboard.press('Escape');
  // タイムラインと (i, k, t) の画面は変わらない
  ok(await p.evaluate(() => JSON.stringify(DECK.timeline())) === tl0, 'player: the timeline is unchanged after read-aloud');
  const shot1 = await seekShot();
  ok(shot0.equals(shot1), 'player: the stage at (i, k, t) renders the same after read-aloud');
  // 声がない端末（ネットワークの声だけ）：読まずに知らせる
  await p.evaluate(() => { window.__raVoices = 'remote'; });
  const n1 = (await R()).spoken.length;
  await p.evaluate(() => DECK.go(1, 2, false));
  await showBar();
  await p.click('#dt-cb [data-b="read"]');
  await p.waitForTimeout(300);
  const toast = await p.evaluate(() => (document.getElementById('deck-toast') || {}).textContent || '');
  ok((await R()).spoken.length === n1 && /読み上げの声がありません/.test(toast) && (await label()) === null, 'player: with only network voices nothing is read, and it says so: ' + toast);
  await p.evaluate(() => { window.__raVoices = 'ja'; });
  ok(!errs.length, 'player: no page errors ' + errs.join(' | '));
  await p.close();

  // 動画のモード：道具を作らず、読まず、DOM も帯の要素もない
  const v = await ctx.newPage();
  await v.goto(fileUrl(OUT) + '?mode=video#2');
  await v.waitForFunction(() => window.DECK && DECK.ready);
  const vs = await v.evaluate(() => ({ cb: !!document.getElementById('dt-cb'), ra: !!document.getElementById('dt-ra'), read: !!document.querySelector('[data-b="read"]'), tools: !!DECK.tools, spoken: window.__ra.spoken.length }));
  ok(!vs.cb && !vs.ra && !vs.read && !vs.tools && vs.spoken === 0, 'video: no read-aloud control, label or speech ' + JSON.stringify(vs));
  const domWith = await v.evaluate(() => document.body.innerHTML);
  const tlv = await v.evaluate(() => JSON.stringify(DECK.timeline()));
  await v.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  await ctx2.addInitScript(() => { try { Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); } catch (e) { /* 無視 */ } });
  const v2 = await ctx2.newPage();
  await v2.goto(fileUrl(OUT) + '?mode=video#2');
  await v2.waitForFunction(() => window.DECK && DECK.ready);
  ok(await v2.evaluate(() => document.body.innerHTML) === domWith && await v2.evaluate(() => JSON.stringify(DECK.timeline())) === tlv, 'video: the DOM and the timeline are the same with or without a speech synthesizer');
  await ctx2.close();
  ok(sha(fs.readFileSync(OUT)) === bytes0, 'player: the file bytes are unchanged after read-aloud');
  // 古いファイル（deck-narration に ttsParts がない）：表示の文を読み、札の横に「読み方は反映されません（古いファイル）」
  {
    const OLD = path.join(DECK_DIR, 'out', 'old.html');
    const html = fs.readFileSync(OUT, 'utf8');
    const dn = blockOf(html, 'deck-narration');
    for (const sk of Object.keys(dn)) for (const st of Object.keys(dn[sk])) for (const t of dn[sk][st]) delete t.ttsParts;
    fs.writeFileSync(OLD, html.replace(/(<script type="application\/json" id="deck-narration">)[\s\S]*?(<\/script>)/, (_, a, b) => a + JSON.stringify(dn) + b));
    const o = await ctx.newPage();
    await o.goto(fileUrl(OLD) + '#3');
    await o.waitForFunction(() => window.DECK && DECK.ready);
    await o.evaluate(() => { window.__ra.spoken = []; DECK.go(2, 2, false); });
    await o.mouse.move(640, 790); await o.mouse.move(641, 791); await o.waitForTimeout(300);
    await o.click('#dt-cb [data-b="read"]');
    await o.waitForFunction(() => window.__ra.spoken.length > 0);
    const os = await o.evaluate(() => ({ text: window.__ra.spoken[0].text, label: document.getElementById('dt-ra').textContent, hint: (document.querySelector('#dt-ra .dt-ra-old') || {}).textContent }));
    ok(/^η は学習率で/.test(os.text), 'older file: falls back to the display text: ' + os.text);
    ok(os.hint === '読み方は反映されません（古いファイル）' && os.label.startsWith('読み上げ中（この端末の声）'), 'older file: the label carries the hint 「読み方は反映されません（古いファイル）」 ' + JSON.stringify(os));
    if (process.env.RA_SHOTS) await o.screenshot({ path: path.join(process.env.RA_SHOTS, 'player-old.png') });
    await o.close();
  }

  // ---------------------------------------------------------------- 5. 編集アプリ
  const DIST = path.join(work, 'dist');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-single'], { stdio: 'ignore' });
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const q = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(DIST, q.endsWith('/') ? q + 'index.html' : q);
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((rs) => srv.listen(0, '127.0.0.1', rs));
  try {
    const BASE = `http://127.0.0.1:${srv.address().port}/`;
    const actx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ja-JP' });
    await actx.addInitScript(STUB);
    const page = await actx.newPage();
    const aerrs = [];
    page.on('pageerror', (e) => aerrs.push(e.message));
    await page.goto(BASE);
    await page.waitForSelector('#drop');
    const narr = fs.readFileSync(path.join(DECK_DIR, 'narration.md'), 'utf8').replace('[2] {mark:eta|circle}{η|イータ} は学習率で、1 歩の大きさを決めます。', '[2] {mark:eta|circle}{η|イータ} は学習率で、1 歩の大きさを決めます。L殻 も読みます。');
    const files = { 'deck.html': fs.readFileSync(path.join(DECK_DIR, 'deck.html'), 'utf8'), 'narration.md': narr };
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('ra-deck', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('ra-deck', { create: true });
      for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
      window.__testDir = d;
    }, files);
    ok(await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir)) === true, 'editor: opened the working folder');
    // 作業フォルダの全ファイル（名前と中身の hash）
    const snap = () => page.evaluate(async () => {
      const out = {};
      async function walk(d, pre) { for await (const [k, h] of d.entries()) { if (h.kind === 'directory') await walk(h, pre + k + '/'); else { const b = new Uint8Array(await (await h.getFile()).arrayBuffer()); const dg = new Uint8Array(await crypto.subtle.digest('SHA-256', b)); out[pre + k] = [...dg].map((x) => x.toString(16).padStart(2, '0')).join(''); } } }
      await walk(window.__testDir, '');
      return out;
    });
    await page.waitForFunction(() => window.__APP_TEST.state().loads > 0, null, { timeout: 30000 });
    const deckFrame = () => page.frames().find((f) => f.parentFrame() === page.mainFrame());
    for (let i = 0; i < 100; i++) { const f = deckFrame(); try { if (f && await f.evaluate(() => !!(window.DECK && DECK.ready))) break; } catch { /* 読み込み中 */ } await page.waitForTimeout(100); }
    await page.waitForTimeout(300);
    const before = await snap();
    await deckFrame().evaluate(() => DECK.go(2, 2, false));
    await page.waitForFunction(() => (window.__APP_TEST.ui().pos || {}).k === 2);
    await page.click('#b-audio');
    await page.waitForSelector('#dev-audio #dev-audio-read');
    const rb = await page.evaluate(() => document.getElementById('dev-audio-read').textContent);
    ok(rb === '読み上げで聞く（音声ファイルにはなりません）', 'editor: the audio panel has 「読み上げで聞く（音声ファイルにはなりません）」');
    await page.evaluate(() => { window.__ra.spoken = []; });
    await page.click('#dev-audio-read');
    await page.waitForFunction(() => window.__ra.spoken.length > 0);
    const es = await page.evaluate(() => window.__ra.spoken.slice());
    ok(es.length === 1 && es[0].voice === 'Kyoko' && es[0].text === 'イータ は学習率で、1歩の大きさを決めます。エルかく も読みます。', 'editor: reads the step with readings, the reading dictionary and join-num-counter, with a local voice ' + JSON.stringify(es));
    await page.waitForSelector('#dev-audio-reading:not([hidden])');
    ok((await page.textContent('#dev-audio-reading')) === '読み上げ中（この端末の声）', 'editor: shows 「読み上げ中（この端末の声）」 while reading');
    if (process.env.RA_SHOTS) await page.screenshot({ path: path.join(process.env.RA_SHOTS, 'editor-reading.png') });
    await page.evaluate(() => window.__ra.finish());
    await page.waitForSelector('#dev-audio-reading', { state: 'hidden' });
    ok(true, 'editor: the label goes away when the reading ends');
    // 選んだ語：表示の θ ではなく読み（このステップの {η|イータ}）を当てる
    await page.evaluate(() => {
      const box = document.getElementById('dev-audio-script'), tn = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      let n; while ((n = tn.nextNode())) { const i = n.data.indexOf('η'); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } }
    });
    await page.evaluate(() => { window.__ra.spoken = []; });
    await page.click('#dev-audio-read-sel');
    await page.waitForFunction(() => window.__ra.spoken.length > 0);
    const sel = await page.evaluate(() => window.__ra.spoken.slice());
    ok(sel.length === 1 && sel[0].text === 'イータ', 'editor: the selected word is read with its reading: ' + JSON.stringify(sel));
    // 外部から使う口（#101「試しに聞く」）：readAloud(text, lang)
    await page.evaluate(() => window.__ra.finish());
    // 声がない端末：知らせて AI 音声・Colab を挙げる
    await page.evaluate(() => { window.__raVoices = 'remote'; window.__ra.spoken = []; });
    await page.click('#dev-audio-read');
    await page.waitForSelector('#dev-audio-read-msg');
    const msg = await page.textContent('#dev-audio-read-msg');
    ok(/日本語の読み上げの声がありません/.test(msg) && /AI 音声/.test(msg) && /Colab/.test(msg) && (await page.evaluate(() => window.__ra.spoken.length)) === 0, 'editor: without a local voice it says so plainly and points to AI 音声 or Colab: ' + msg);
    await page.evaluate(() => { window.__raVoices = 'ja'; });
    // 別のステップに動くと止める
    await page.click('#dev-audio-read');
    await page.waitForFunction(() => window.__ra.queue.length > 0);
    const c1 = await page.evaluate(() => window.__ra.cancels);
    await deckFrame().evaluate(() => DECK.go(2, 3, false));
    await page.waitForFunction((c) => window.__ra.cancels > c, c1, { timeout: 5000 }).catch(() => {});
    ok(await page.evaluate((c) => window.__ra.cancels > c, c1), 'editor: moving to another step stops the reading');
    await page.waitForTimeout(500);
    const after = await snap();
    ok(JSON.stringify(after) === JSON.stringify(before), 'editor: nothing is written to the working folder ' + JSON.stringify(Object.keys(after).filter((k) => after[k] !== before[k])));
    ok(!(await page.evaluate(() => window.__APP_TEST.state().error)), 'editor: no build error');
    ok(!aerrs.length, 'editor: no page errors ' + aerrs.join(' | '));
    await actx.close();
  } finally { srv.close(); }
} finally {
  await browser.close();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
