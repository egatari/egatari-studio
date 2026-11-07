// test-all: unit
// 組まれずに残った数式の見つけ方（kit/core/raw-math.mjs、品質チェックの rawMath）：英語の金額を数式と見なさない
import assert from 'node:assert/strict';
import { findRawMath } from '../kit/core/raw-math.mjs';
let n = 0;
const ok = (name, f) => { f(); n++; console.log('  ok   ' + name); };
const hit = (t) => findRawMath(t) !== null;
ok('currency is not math: $200, $1.2M, $5–10, costs $3 and $4, US$ 30, $ 40, $200 per seat; $M', () => {
  for (const t of ['$200 per restaurant per month', 'Revenue $1.2M in year 1', 'Price $5–10', 'It costs $3 and $4', 'about US$30 a month', 'only $ 40 each', '$M; assumes $200 per seat', 'from $2.5k to $10k', '売上は $200 です'])
    assert.equal(hit(t), false, t);
});
ok('unrendered math is still found: $x^2$, $a_1$, $y = 2x$, $x$, $\\alpha$, \\( x \\), \\[ x \\], $2x+1$', () => {
  for (const t of ['the area is $x^2$', 'term $a_1$', 'line $y = 2x$', 'let $x$ be', 'angle $\\alpha$', 'see \\( x \\)', 'block \\[ x \\]', 'value $2x+1$'])
    assert.equal(hit(t), true, t);
});
ok('mixed: currency next to real math still finds the math', () => {
  assert.equal(hit('It costs $3; the curve is $y=x^2$'), true);
  const r = findRawMath('It costs $3; the curve is $y=x^2$');
  assert.ok(r.text.startsWith('$y=x^2$'), r.text);
});
ok('a $ pair split across lines is not paired', () => assert.equal(hit('costs $\n3 and $4'), false));
console.log(`raw-math: ${n} ok`);
