// Stage directions (#111): shared parsing, archive-only storage, presenter and public outputs.
// test-all: unit
// node tools/test-notes.mjs [--browser]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseNarration, renderText, narrationMap, noteProblems, presenterParts, stripNotes, rawTurns, segDigest } from '../kit/narration.mjs';
import * as Narration from '../kit/core/narration-parse.mjs';
import { inputHash, playOnly } from '../kit/core/portable.mjs';
import { build, buildPortable } from '../kit/build.mjs';
import { readingProblems } from '../kit/core/narration-lint.mjs';
import { spokenText, spokenTurns } from '../kit/core/read-aloud.mjs';
import { message } from '../kit/check-messages.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';
import { FORMAT } from '../kit/core/format.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const parse = (raw) => parseNarration(`## A {#s-a}\n[0] ${raw}\n`)[0];
const raw = '{note:START}Hello{note:SECRET <&> | pause} (spoken) {θ|theta}{cue}next{mark:x|box}end{note:END}';
const plain = stripNotes(raw), s = parse(raw), t = s.turns[0];
assert.equal(t.raw, raw);
assert.equal(t.display, 'Hello (spoken) θnextend');
assert.deepEqual(t.ttsParts, ['Hello (spoken) theta', 'next', 'end']);
assert.equal(t.bounds.length, 2, 'notes do not create boundaries');
assert.deepEqual(renderText(raw), renderText(plain));
assert.equal(await inputHash(s), await inputHash(parse(plain)));
assert.equal(await inputHash(s), await inputHash(parse(raw.replace('SECRET <&> | pause', 'changed'))));
assert.equal(segDigest(s), segDigest(parse(plain)));
assert.equal(spokenText(raw), spokenText(plain));
assert.deepEqual(spokenTurns([{ role: 'expert', raw }]), spokenTurns([{ role: 'expert', raw: plain }]));
assert.deepEqual(rawTurns(`## s-a\n[0] ${raw}\n`, 's-a', '0').turns, [{ role: 'expert', text: raw }]);
assert.deepEqual(presenterParts('a {note:ask} {θ|theta}'), [{ text: 'a ' }, { note: 'ask' }, { text: ' θ' }]);
assert.equal(JSON.stringify(narrationMap([s])).includes('SECRET'), false);
assert.deepEqual(renderText('a{note:}b{note:next}c').ttsParts, ['abc']);
assert.deepEqual(readingProblems('{note:a+b|pause}'), []);
assert.deepEqual(noteProblems(raw), []);
for (const bad of ['{note:missing', '{note:a{b}', '{note:a{b}}', '{note:a}}']) {
  assert.equal(noteProblems(bad).length, 1, bad);
}
for (const lang of ['ja', 'en']) assert.match(message(lang, 'narrNote', { t: '{note:bad', line: 3 }), /note:/);
console.log('notes: parsing, display, TTS, hashes, inline parts and checker diagnostics ok');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'test-notes-'));
try {
  const src = path.join(work, 'deck.html');
  fs.writeFileSync(src, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title></head><body><div id="stage"><section class="slide static noconcl" id="s-a"><h1>A</h1></section></div></body></html>');
  fs.writeFileSync(path.join(work, 'narration.md'), `## A {#s-a}\n[0] Hello{note:SECRET <&> | pause} (spoken).\n`);
  const ordinary = build(src), portable = await buildPortable(src);
  const runtime = (html) => JSON.parse(html.match(/<script[^>]*id="deck-narration"[^>]*>([\s\S]*?)<\/script>/)[1]);
  for (const html of [ordinary.html, portable.html, playOnly(portable.html)]) {
    assert.equal(JSON.stringify(runtime(html)).includes('SECRET'), false);
  }
  assert.equal(new TextDecoder().decode(portable.files['narration.md']).includes('{note:SECRET'), true);
  assert.equal(portable.html.includes('id="studio-script-source"'), false, 'portable notes exist only in the source archive');
  // studio-* の塊は作業フォルダの組み立てだけのもの（Egatari ファイルの実行系の塊は §4 の deck-* に閉じる）
  assert.equal(ordinary.html.includes('id="studio-script-source"'), true, 'the folder build carries the script source when it has notes');
  for (const [name, html] of [['portable', portable.html], ['play-only', playOnly(portable.html)]]) assert.equal(/<script\b[^>]*\bid="studio-/.test(html), false, `${name}: no studio-* block`);
  const readable = portable.html.match(new RegExp(`<section id="${FORMAT.READABLE_ID}"[\\s\\S]*?</section>`))[0];
  assert.equal(readable.includes('SECRET'), false, 'readable and printed script omit notes');

  // Exercise the actual player archive reader without a browser, including async DOM replacement.
  const loader = fs.readFileSync(path.join(ROOT, 'kit/deck.js'), 'utf8').split('DECK.scriptSource = async function(){')[1].split('// 音声の作り方（format spec §5.2')[0];
  const nodes = new Map();
  for (const m of portable.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const id = m[1].match(/\bid="([^"]+)"/), hash = m[1].match(/\bdata-sha256="([^"]+)"/);
    if (id) nodes.set(id[1], { textContent: m[2], getAttribute: () => hash?.[1] });
  }
  const ctx = { DECK: {}, FMT: { indexId: FORMAT.INDEX_ID }, json: () => null, document: { getElementById: (id) => nodes.get(id) }, window: { crypto: globalThis.crypto }, crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, atob };
  vm.runInNewContext('DECK.scriptSource = async function(){' + loader, ctx);
  const loading = ctx.DECK.scriptSource();
  const snapshot = new Map(nodes); nodes.clear();
  assert.match(await loading, /\{note:SECRET/);
  for (const [id, node] of snapshot) nodes.set(id, node);
  nodes.get(FORMAT.INDEX_ID).getAttribute = () => '0'.repeat(64);
  assert.equal(await ctx.DECK.scriptSource(), null, 'tampered source is not displayed');
  console.log('notes: ordinary/portable/play-only outputs, readable print layer and verified archive reader ok');

  // Run the real presenter renderer with a small DOM substitute; verify inline placement and escaping.
  const els = new Map(), listeners = {}, styles = [];
  const element = () => ({ classList: { add() {}, toggle() {} }, setAttribute() {}, addEventListener() {}, appendChild() {}, contentWindow: { postMessage() {} } });
  const get = (id) => { if (!els.has(id)) els.set(id, element()); return els.get(id); };
  const opener = { postMessage() {} };
  const presenter = { DECK: { NARRATION: runtime(ordinary.html), Narration, scriptSource: async () => fs.readFileSync(path.join(work, 'narration.md'), 'utf8') }, opener, addEventListener: (name, fn) => { listeners[name] = fn; }, focus() {} };
  presenter.parent = presenter;
  const doc = { documentElement: element(), body: element(), head: { appendChild: (s) => styles.push(s.textContent) }, getElementById: get, createElement: element, querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, hasFocus: () => true };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'kit/presenter.js'), 'utf8'), { window: presenter, document: doc, location: { href: 'file:///notes.html?presenter=1', search: '?presenter=1' }, setInterval() {}, setTimeout() {} });
  presenter.DECK.presenterView();
  await Promise.resolve();
  listeners.message({ source: opener, data: { type: 'deck-pos', key: 's-a:0', i: 0, k: 0, n: 1, max: 0 } });
  assert.equal(get('pv-text').innerHTML, '<p>Hello<span class="note">[SECRET &lt;&amp;&gt; | pause]</span> (spoken).</p>');
  assert.ok(styles.some((s) => s.includes('@media print{#pv-text .note{display:none!important}}')));
  console.log('notes: actual presenter renderer preserves position, escapes content and hides notes in print');

  if (process.argv.includes('--browser')) {
    const browser = await launch();
    try {
      for (const [name, html] of [['ordinary', ordinary.html], ['portable', portable.html]]) {
        const out = path.join(work, `${name}.html`); fs.writeFileSync(out, html);
        const page = await browser.newPage();
        await page.goto(fileUrl(out) + '?captions=1');
        await page.waitForFunction(() => window.DECK?.ready);
        await page.waitForFunction(() => DECK.caption()?.includes('Hello'));
        assert.equal((await page.locator('body').innerText()).includes('SECRET'), false, `${name} stage/captions`);
        assert.equal((await page.evaluate(() => DECK.caption())).includes('SECRET'), false);
        await page.goto(fileUrl(out) + '?mode=video&captions=1');
        await page.waitForFunction(() => window.DECK?.ready);
        assert.equal((await page.locator('body').innerText()).includes('SECRET'), false, `${name} video`);
        await page.emulateMedia({ media: 'print' });
        await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
        assert.equal((await page.locator('body').innerText()).includes('SECRET'), false, `${name} print`);
        await page.emulateMedia({ media: 'screen' });
        await page.goto(fileUrl(out) + '?presenter=1');
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { source: window.opener, data: { type: 'deck-pos', key: 's-a:0', i: 0, k: 0, n: 1, max: 0 } })));
        await page.waitForFunction(() => document.querySelector('#pv-text .note')?.textContent.includes('SECRET'));
        assert.equal(await page.locator('#pv-text p').first().innerText(), 'Hello[SECRET <&> | pause] (spoken).');
        await page.emulateMedia({ media: 'print' });
        assert.equal(await page.locator('#pv-text .note').isVisible(), false, `${name} presenter print`);
        await page.close();
      }
    } finally { await browser.close(); }
    // The checker uses a browser; check actual error severity and code in both languages.
    fs.writeFileSync(path.join(work, 'narration.md'), '## A {#s-a}\n[0] Expert: Hello{note:nested {bad}}\nNovice: Hello{note:unterminated\n');
    for (const lang of ['ja', 'en']) {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), src, '--json', '--lang', lang], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(r.status, 1, r.stderr);
      const errors = JSON.parse(r.stdout).results.filter((r) => r.code === 'narrNote');
      assert.equal(errors.length, 2, JSON.stringify(errors));
      assert.ok(errors.every((r) => r.sev === 'error'), JSON.stringify(errors));
    }
    console.log('notes: presenter, stage, captions, video, print and checker browser integration ok');
  }
} finally { fs.rmSync(work, { recursive: true, force: true }); }
