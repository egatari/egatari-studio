// マーカーの重心の下のパーツ → comments.json → AI への修正依頼（#29、backlog #90 stage 1）。
// node tools/test-stroke-part.mjs（Node のみ。DOM と HTTP の口は試験用のもの）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createDevApi } from '../app/devapi.js';
import { normPin, normPart, entryStrokes, strokesCentroid } from '../kit/core/comment-core.mjs';
import { partOf, entryStrokesOf, strokesCentroidOf } from '../server/editor-ui.js';
import { commentNoteLine, buildFixRequest } from '../kit/core/llm-fix.mjs';

let count = 0;
function ok(name, check) { check(); count++; console.log('  ok  ' + name); }
// 同じ書き込みの値と検証を、編集アプリと開発サーバーで確かめる。
const files = {};
const api = createDevApi({ ws: { readText: async (n) => files[n] || null, writeText: async (n, s) => { files[n] = s; } },
  deckFile: () => 'deck.html', slideOrder: () => [], editable: () => true, afterWrite: async () => false, msg: {} });
const stroke = [[[100, 200], [200, 200]]];
for (const part of [null, {}, [], { name: 'div' }, { name: 'm-bars', id: 'bars', extra: true }, { name: 'm-bars' }, { name: 'm-x', id: 4 }]) {
  assert.deepEqual(partOf(part), normPart(part));
  const r = await api('POST', '/__dev/comment', { key: 'parts:0', pin: { x: 0, y: 0 }, strokes: stroke, part, comment: '直す' });
  assert.equal(r._status, 200);
  assert.deepEqual(JSON.parse(files['comments.json']).at(-1).part || null, normPart(part));
}
ok('editor app saves normalized part metadata; editor UI uses the same validation', () => {});
await api('POST', '/__dev/comment', { key: 'parts:0', pin: { x: 100, y: 100 }, part: { name: 'm-bars' }, comment: '点だけ' });
ok('a point without strokes does not acquire part metadata', () => assert.equal(JSON.parse(files['comments.json']).at(-1).part, undefined));
const note = { where: 'スライド 1', quote: 'A', text: '色を変えて', strokes: stroke, part: { name: 'm-bars', id: 'bars' } };
ok('Japanese and English fix request lines include the part and optional data-id', () => {
  assert.equal(commentNoteLine(note, 'ja'), '- スライド 1「A」：色を変えて\n  パーツ：m-bars（data-id: bars）');
  assert.match(commentNoteLine(note, 'en'), /\n  Part: m-bars \(data-id: bars\)$/);
  assert.match(commentNoteLine({ ...note, part: { name: 'm-bars' } }, 'ja'), /\n  パーツ：m-bars$/);
  assert.equal(commentNoteLine({ ...note, part: null }, 'ja'), '- スライド 1「A」：色を変えて');
  assert.doesNotMatch(commentNoteLine({ ...note, strokes: null }, 'ja'), /パーツ/);
  assert.match(commentNoteLine({ ...note, strokes: undefined, stroke: stroke[0] }, 'ja'), /パーツ：m-bars/);
});

// 本物の hints.js のイベント処理を、点の下の要素とステップの状態を返す小さな DOM で動かす。
const uiSource = fs.readFileSync(new URL('../server/editor-ui.js', import.meta.url), 'utf8');
const placeStart = uiSource.indexOf('function placeOf(hint) {');
const placeEnd = uiSource.indexOf('function openComment(hint)', placeStart);
assert.ok(placeStart > 0 && placeEnd > placeStart);
const placeOf = vm.runInNewContext('(' + uiSource.slice(placeStart, placeEnd) + ')', {
  str: (s, max) => String(s || '').slice(0, max), RANGE: /^\d+-\d+$/, pinOf: normPin, entryStrokesOf, strokesCentroidOf, partOf
});
const json = (x) => JSON.parse(JSON.stringify(x));
const listeners = {}, winListeners = {}, messages = [];
const classes = { add() {}, remove() {}, toggle() {} };
function element(tag, parent = null, attrs = {}, text = '') {
  return { localName: tag, tagName: tag.toUpperCase(), nodeType: 1, parentElement: parent, parentNode: parent,
    classList: classes, textContent: text, getAttribute: (k) => attrs[k] || null,
    getRootNode: () => doc, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
    closest(sel) { if (sel.includes('#dt-layer')) return null; return this; } };
}
const stage = element('div'); stage.contains = (n) => { for (; n; n = n.parentElement || n.parentNode?.host) if (n === stage) return true; return false; };
const bars = element('m-bars', stage, { 'data-id': 'bars' }, 'A B');
const second = element('m-bars', stage, {}, 'C');
const text = element('p', stage, {}, 'ここは普通の文章です');
let step = 0, final = false, hit = () => bars;
const seeks = [];
const doc = {
  head: { appendChild() {} }, documentElement: { classList: classes },
  createElement: () => ({}), getElementById: (id) => id === 'stage' ? stage : null,
  querySelectorAll: () => [], addEventListener: (name, fn) => { listeners[name] = fn; },
  dispatchEvent: (e) => listeners[e.type]?.(e),
  elementsFromPoint: (x, y) => { assert.equal(final, true, 'hit testing must use the final state of the step'); return [hit(x * 2, y * 2), stage].filter(Boolean); }
};
const parent = { postMessage: (m) => messages.push(json(m)) };
const deck = { ready: true, slides: [{ _key: 'parts', _max: 1, _cstep: -1 }], state: () => ({ key: 'parts:' + step }),
  seek: (i, k, t) => { seeks.push([i, k, t]); final = t === Infinity; },
  aside: (fn) => { try { return fn(); } finally { final = false; } } };
const win = { parent, DECK: deck, addEventListener: (name, fn) => { winListeners[name] = fn; } };
vm.runInNewContext(fs.readFileSync(new URL('../server/hints.js', import.meta.url), 'utf8'),
  { window: win, document: doc, location: { search: '' }, URLSearchParams, CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts.detail; } } });
function message(data) { winListeners.message({ source: parent, data }); }
message({ type: 'edit-state', edit: true });
async function mark(points, expected, name) {
  message({ type: 'edit-ink-reset' });
  listeners['deck:ink']({ detail: { pts: points } });
  const hint = messages.at(-1);
  assert.equal(hint.kind, 'comment');
  assert.deepEqual(hint.part, expected);
  const saved = await api('POST', '/__dev/comment', { ...placeOf(hint), comment: '直して' });
  assert.equal(saved._status, 200);
  const c = JSON.parse(files['comments.json']).at(-1);
  assert.deepEqual(c.part, expected);
  const request = commentNoteLine({ ...c, where: c.key, text: c.comment }, 'ja');
  if (expected) assert.ok(request.includes('パーツ：' + expected.name));
  else assert.doesNotMatch(request, /パーツ：/);
  ok(name, () => {});
  return hint;
}
await mark([[180, 200], [220, 200]], { name: 'm-bars', id: 'bars' }, 'm-bars marker → hint → comments.json → Japanese fix request');
hit = () => text;
const plain = await mark([[180, 400], [220, 400]], undefined, 'plain text has no part line');
assert.equal(plain.quote, 'ここは普通の文章です');
hit = (x) => x > 600 ? second : bars;
await mark([[800, 200], [100, 200], [300, 200]], { name: 'm-bars', id: 'bars' }, 'a mark spanning parts selects only the part under its centroid');
step = 1;
hit = () => second;
await mark([[780, 200], [820, 200]], { name: 'm-bars' }, 'part without data-id in step 1');
assert.deepEqual(seeks.at(-1), [0, 1, Infinity]);
step = 0;
hit = () => text;
await mark([[780, 200], [820, 200]], undefined, 'the same point in step 0 has no part');
const shadow = { nodeType: 11, host: bars };
const inner = element('m-inner', null, { 'data-id': 'inner' }, '中の字'); inner.parentNode = shadow;
const label = element('span', inner, {}, '中の字');
bars.shadowRoot = { elementsFromPoint: () => [label, bars] };
hit = () => bars;
await mark([[180, 200], [220, 200]], { name: 'm-inner', id: 'inner' }, 'shadow DOM and nested parts select the innermost m-* ancestor');
// 重心がスライド外なら、引用は初めの点から取れても、パーツは重心の下にないので付けない。
hit = (x) => x > 1280 ? null : bars;
await mark([[1200, 200], [1600, 200]], undefined, 'fallback quote does not falsely name the part under the first point');
// 後の線で重心が文の上へ動けば、前のパーツ情報は残さない。
delete bars.shadowRoot;
hit = (x) => x < 500 ? bars : text;
message({ type: 'edit-ink-reset' });
listeners['deck:ink']({ detail: { pts: [[180, 200], [220, 200]] } });
assert.equal(messages.at(-1).part.name, 'm-bars');
listeners['deck:ink']({ detail: { pts: [[600, 400], [1200, 400]] } });
ok('adding another stroke recomputes the part from all strokes', () => assert.equal(messages.at(-1).part, undefined));

// 開発サーバーの実際の POST ハンドラー（HTTP・ファイルの口だけメモリに置く）。
const serverSource = fs.readFileSync(new URL('../server/dev.mjs', import.meta.url), 'utf8');
const start = serverSource.indexOf("if (req.method === 'POST' && p === '/__dev/comment') {");
const end = serverSource.indexOf("if (req.method === 'POST' && p === '/__dev/comment/resolve')", start);
assert.ok(start > 0 && end > start);
let serverBody, serverSaved;
const serverHandler = vm.runInNewContext('(async function(){' + serverSource.slice(start, end) + '})', {
  req: { method: 'POST' }, p: '/__dev/comment', res: {}, readBody: async () => serverBody,
  readComments: () => [], writeComments: (list) => { serverSaved = list; },
  normPin, entryStrokes, strokesCentroid, normPart, crypto: { randomBytes: () => ({ toString: () => 'abcd' }) },
  send: (_res, status, c) => ({ status, ...c }), console: { log() {} }
});
for (const part of [{ name: 'm-bars', id: 'bars' }, null, { name: 'div' }]) {
  serverBody = { key: 'parts:0', pin: { x: 0, y: 0 }, strokes: stroke, part, comment: '直して' };
  await serverHandler();
  assert.deepEqual(serverSaved[0].part || null, normPart(part));
}
ok('dev server writes the same part field as the editor app', () => {});
// 編集アプリの実際の openNotes → reviseRequest を通す。保存した情報を途中で落とさない。
const appSource = fs.readFileSync(new URL('../app/llm.js', import.meta.url), 'utf8');
const noteStart = appSource.indexOf('async function openNotes()');
const noteEnd = appSource.indexOf('async function fixRequest(results)', noteStart);
assert.ok(noteStart > 0 && noteEnd > noteStart);
for (const lang of ['ja', 'en']) {
  files['comments.json'] = JSON.stringify([
    { key: 'parts:0', quote: '棒', comment: '色を変えて', status: 'open', strokes: stroke, part: { name: 'm-bars', id: 'bars' } },
    { key: 'parts:0', quote: '文', comment: '短く', status: 'open', strokes: stroke },
    { key: 'parts:0', comment: '対応済み', status: 'resolved', strokes: stroke, part: { name: 'm-hidden' } }
  ]);
  const request = await vm.runInNewContext('(async function(){' + appSource.slice(noteStart, noteEnd) + "return reviseRequest([], '');})()", {
    S: { ws: { readText: async (n) => files[n] }, slides: [{ key: 'parts', heading: '比べる' }] },
    T: { sl: { slideName: () => 'Slide 1' } }, READ_LIMITS: { comments: 4 * 1024 * 1024 },
    problemsOf: async () => [], readDeck: async () => ({ deck: '<section class="slide" id="parts"><h2>比べる</h2></section>', narration: '' }),
    buildFixRequest, LANG: lang, X: { notesHead: '## Comments', noteLine: (c) => commentNoteLine(c, lang) }
  });
  assert.equal(request.notes, 2);
  assert.match(request.text, lang === 'ja' ? /パーツ：m-bars（data-id: bars）/ : /Part: m-bars \(data-id: bars\)/);
  assert.doesNotMatch(request.text, /m-hidden|対応済み/);
  assert.equal((request.text.match(lang === 'ja' ? /パーツ：/g : /Part:/g) || []).length, 1);
}
ok('editor fix request retains part metadata, plain-text notes and resolved-note filtering in both languages', () => {});
console.log(`stroke-part: ${count} ok`);
