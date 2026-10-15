// deck.js のタイムラインの単体の検査：音声の cue で伸縮した部品の終わり（実時間）、数値の入力の検査
//   node tools/test-deck-timing.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const deckJs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit', 'deck.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-timing-'));
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body><div id="stage">
<section class="slide" id="a"><h2>A</h2><m-warp data-from="1"></m-warp></section>
<section class="slide" id="b"><h2>B</h2><div data-step="abc">x</div><div data-step="1.5">y</div><div data-step="1">z</div><m-warp steps="-1"></m-warp></section>
<section class="slide" id="c" data-steps="Infinity"><h2>C</h2></section>
</div>
<script type="application/json" id="deck-audio">{"a:1": {"src": null, "dur": 5, "cues": [4]}}</script>
<script type="application/json" id="deck-marks">{"a:1": [{"type": "cue"}]}</script>
<script type="application/json" id="deck-timing">{"b:0": {"dur": "x", "hold": -1, "lead": 0.5}}</script>
<script src="${fileUrl(deckJs)}"></script>
<script>
class W extends DECK.MotionElement {
  static steps = 1;
  duration(k){ return 3; }     // 部品の時刻で 3 秒
  cues(k){ return [1]; }       // 部品の時刻 1 秒が {cue}
}
DECK.define("m-warp", W);
</script></body></html>`;
fs.writeFileSync(path.join(tmp, 'deck.html'), html);

const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const warns = [], errs = [];
p.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(fileUrl(path.join(tmp, 'deck.html')) + '?mode=video');
await p.waitForFunction(() => window.DECK && DECK.ready);
const tl = await p.evaluate(() => DECK.timeline().map((g) => ({ key: g.key, anim: g.anim, dur: g.dur, lead: g.lead })));
await b.close();
fs.rmSync(tmp, { recursive: true, force: true });

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const g = (k) => tl.find((x) => x.key === k);
// 部品の時刻 1 秒 ↔ 実時間 lead 0.25 + 4 秒。部品の終わり 3 秒 → 実時間 4.25 + (3 - 1) = 6.25 秒
ok(Math.abs(g('a:1').anim - 6.25) < 1e-6, `伸縮した部品の終わりが実時間で anim になる（${g('a:1').anim}）`);
ok(g('a:1').dur >= g('a:1').anim, `段階の長さが動きを切らない（dur ${g('a:1').dur}）`);
ok(!tl.some((x) => x.key.startsWith('b:') && x.key !== 'b:0' && x.key !== 'b:1'), `不正な data-step / steps は無視（b の段階 ${tl.filter((x) => x.key.startsWith('b:')).map((x) => x.key)}）`);
ok(tl.filter((x) => x.key.startsWith('c:')).length === 1, 'data-steps="Infinity" は無視');
ok(g('b:0').lead === 0.5 && g('b:0').dur > 0 && Number.isFinite(g('b:0').dur), `不正な dur / hold は無視、正しい lead は使う（${JSON.stringify(g('b:0'))}）`);
ok(warns.filter((w) => /deck\.js:/.test(w)).length >= 5, `不正な入力ごとに警告（${warns.length} 件）`);
ok(tl.every((x) => Number.isFinite(x.dur) && Number.isFinite(x.anim)), 'タイムラインの数値はすべて有限');
ok(errs.length === 0, 'エラーなし' + (errs.length ? '：' + errs.join(' | ') : ''));
console.log(fails ? `${fails} 件の失敗` : 'すべて通過');
process.exit(fails ? 1 : 0);
