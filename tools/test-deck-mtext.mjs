// DECK.mtext（kit/deck.js）の * の規則が部品庫の base 1.2.0 の mtext と同じか（backlog #199）
// test-all: unit
//   node tools/test-deck-mtext.mjs
// * は内側がすぐ空白でない対のときだけ斜体（markdown と同じ）。1 つだけの *（「A* 探索」「5*3」「注*」）はそのまま。\* \_ \^ はその字そのもの
// 例は部品庫の test（components/base の star の表、026e37a）と同じ。ブラウザはいらない：el と mtext を小さな DOM の代わりで動かす
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(ROOT, 'kit/deck.js'), 'utf8').replace(/\r\n?/g, '\n');   // Windows の checkout は CRLF
const from = src.indexOf('function el('), to = src.indexOf('\n}\n', src.indexOf('function mtext(')) + 3;
assert.ok(from >= 0 && to > from, 'el and mtext found in kit/deck.js');
class Node { constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this._text = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
  appendChild(c) { this.children.push(c); return c; }
  set textContent(v) { this._text = v; } get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); } }
const ctx = { document: { createElementNS: (_ns, tag) => new Node(tag) }, NS: 'http://www.w3.org/2000/svg' };
vm.runInNewContext(src.slice(from, to) + '\nthis.mtext = mtext;', ctx);
const run = (s) => { const t = ctx.mtext(null, 0, 0, s); const sp = t.children; return [t.textContent, sp.filter((x) => x.attrs['font-style'] === 'italic').length, sp.filter((x) => x.attrs['baseline-shift']).length]; };
const cases = [['A* 探索', 'A* 探索', 0, 0], ['5*3', '5*3', 0, 0], ['注*', '注*', 0, 0], ['**', '**', 0, 0], ['* x *', '* x *', 0, 0], ['*x*', 'x', 1, 0], ['A* と *B*', 'A* と B', 1, 0],
  ['a\\*b\\*', 'a*b*', 0, 0], ['max\\_depth', 'max_depth', 0, 0], ['x\\^2', 'x^2', 0, 0], ['*x*_1', 'x1', 1, 1], ['*a*_*b*', 'a*b*', 1, 1], ['*f*(*x*) = *x*^2', 'f(x) = x2', 3, 1]];
const bad = cases.map(([s, txt, it, sh]) => { const g = run(s); return g[0] === txt && g[1] === it && g[2] === sh ? '' : s + ' → ' + JSON.stringify(g); }).filter(Boolean);
assert.deepEqual(bad, [], 'DECK.mtext: lone * literal, pairs italicise, escapes');
console.log(`  ok   DECK.mtext: ${cases.length} cases as base 1.2.0 (A* 探索, 5*3, 注*, \\* \\_ \\^)`);
console.log('deck-mtext: 1 ok');
