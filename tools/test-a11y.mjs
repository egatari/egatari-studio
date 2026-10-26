// 読み上げソフト・キーボード・字幕の確認（kit/deck.js・kit/tools.js・kit/presenter.js・kit/check.mjs）
//   node tools/test-a11y.mjs <built.html> [画面の保存先]
// aria-live の領域が次へ・前へで変わる・隠れたスライドは aria-hidden と inert・ボタンに名前と aria-pressed・
// Tab で帯に入り Esc で戻る・一覧はフォーカスが縮図に付いてくる・ペンでもフォーカスが閉じ込められない・
// s で字幕（今の段階の口述原稿を 1 まとまりずつ、3 行まで、読む速さで送る）・Shift+s で字幕の大きさ・印刷では字幕が出ない・a11y の属性は画素を変えない・動画では何も足さない
// （?captions=1 のときだけ字幕）・check が alt の無い画像と名前の無い SVG を警告する
import { launch, fileUrl, stableCapture } from '../kit/browser.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [file, outdir = path.join(os.tmpdir(), 'test-a11y')] = process.argv.slice(2);
if (!file) { console.error('usage: node tools/test-a11y.mjs <built.html> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
const url = fileUrl(file);
const b = await launch();
const errs = [];
const watch = (p, name) => {
  p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push(name + ': pageerror: ' + e.message));
};
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const ready = (p) => p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
const live = (p) => p.evaluate(() => { const e = document.getElementById('deck-live'); return e ? e.textContent : null; });
const settle = (p) => p.waitForTimeout(120);
// 領域はいったん空にしてから少し後に入る（kit/deck.js の announce）。遅い機械（CI の macOS など）でも決まった時間で読まず、前と違う文が入るまで待つ
const liveNew = async (p, prev) => { let t = null; for (let i = 0; i < 60; i++) { t = await live(p); if (t && t !== prev) return t; await p.waitForTimeout(50); } return t; };
const frame = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const act = (p) => p.evaluate(() => { const a = document.activeElement; return a ? { tag: a.tagName, id: a.id, b: a.getAttribute('data-b'), cls: a.className, label: a.getAttribute('aria-label') } : null; });

const ctx = await b.newContext({ viewport: { width: 1280, height: 840 } });
const p = await ctx.newPage(); watch(p, '本体');
await p.goto(url + '#1'); await ready(p);
await p.evaluate(() => document.fonts.ready);

// ---- aria-live と隠れたスライド
const lr = await p.evaluate(() => { const e = document.getElementById('deck-live'); return e && { live: e.getAttribute('aria-live'), atomic: e.getAttribute('aria-atomic'), w: e.getBoundingClientRect().width }; });
ok(lr && lr.live === 'polite' && lr.atomic === 'true' && lr.w <= 1, 'aria-live="polite" の領域があり、画面には出ない');
await p.keyboard.press('ArrowRight'); await settle(p);
const titles = await p.evaluate(() => DECK.slides.map((s) => (s.querySelector('h2, h1') || {}).textContent || ''));
let t = await liveNew(p, null);
ok(/スライド 2 \/ \d+：/.test(t) && t.includes(titles[1].trim()), `スライドが変わると「スライド n / N：タイトル」（${t}）`);
const sl = await p.evaluate(() => DECK.slides.map((s) => ({ ah: s.getAttribute('aria-hidden'), inert: s.inert, role: s.getAttribute('role'), rd: s.getAttribute('aria-roledescription'), label: s.getAttribute('aria-label'), active: s.classList.contains('active') })));
ok(sl.every((s) => s.active ? s.ah === null && !s.inert : s.ah === 'true' && s.inert), '隠れたスライドは aria-hidden="true" と inert、今のスライドは外れる');
ok(sl.every((s) => s.role === 'group' && s.rd === 'スライド' && /^スライド \d+ \/ \d+/.test(s.label)), 'スライドは role="group"・aria-roledescription・aria-label を持つ');
ok(await p.evaluate(() => { const s = DECK.slides[1]; return s._items.every((e) => (e.getAttribute('aria-hidden') === 'true') === !e.classList.contains('on')); }), 'まだ出ていない段階は aria-hidden（発表）');
await p.keyboard.press('ArrowRight'); await settle(p);
t = await liveNew(p, t);
const want1 = await p.evaluate(() => DECK.slides[1]._items.filter((e) => +e.getAttribute('data-step') === 1)[0].textContent.slice(0, 6));
ok(t.includes(want1), `次の段階で、新しく出た段階の文字を読む（${t.slice(0, 40)}…）`);
ok(!/\\theta|annotation/.test(t), '式は TeX の原文を読ませない');
await p.keyboard.press('ArrowLeft'); await settle(p);
t = await liveNew(p, t);
ok(/^ステップ 0 \/ \d+$/.test(t), `前へ戻ると「ステップ k / K」（${t}）`);
await p.keyboard.press('l'); await settle(p);
ok(await p.evaluate(() => DECK.slides[1]._items.every((e) => e.getAttribute('aria-hidden') !== 'true')), '授業モードでは後の段階も読める（薄く見えているので）');
await p.keyboard.press('l');

// ---- a11y の属性は画素を変えない（属性を外した画面と同じ）
let same = true;
for (const [i, k] of [[1, 0], [1, 2], [2, 1], [4, 0]]) {
  await p.evaluate(([i, k]) => DECK.seek(i, k, Infinity), [i, k]); await frame(p);
  const a = await stableCapture(p);
  await p.evaluate(() => {
    window.__a11y = [...document.querySelectorAll('[aria-hidden], [inert], .slide[role]')].filter((e) => e.closest('#stage') && !e.closest('svg.marks')).map((e) => [e, e.getAttribute('aria-hidden'), e.inert, e.getAttribute('role')]);
    window.__a11y.forEach(([e]) => { e.removeAttribute('aria-hidden'); e.inert = false; e.removeAttribute('role'); });
  });
  await frame(p);
  const c = await stableCapture(p);
  await p.evaluate(() => window.__a11y.forEach(([e, ah, inert, role]) => { if (ah !== null) e.setAttribute('aria-hidden', ah); e.inert = inert; if (role) e.setAttribute('role', role); }));
  if (!a.equals(c)) { same = false; console.log('  differs at', i, k); }
}
ok(same, 'aria-hidden / inert / role を外しても画素が同じ（発表モード）');
await p.evaluate(() => { document.querySelectorAll('style').forEach((s) => { if (s.textContent === '#dt-cb{display:none!important}') s.remove(); }); DECK.go(1, 0, false); });

// ---- 操作の帯のボタン
const btns = await p.evaluate(() => [...document.querySelectorAll('#dt-cb button')].map((e) => ({ b: e.getAttribute('data-b'), label: e.getAttribute('aria-label'), pressed: e.getAttribute('aria-pressed'), tab: e.tabIndex })));
ok(btns.length >= 13 && btns.every((x) => x.label && x.label.trim()), `帯のボタン ${btns.length} 個すべてに aria-label`);
ok(['auto', 'laser', 'pen', 'vpen', 'lect', 'cap', 'full', 'help'].every((n) => btns.find((x) => x.b === n)?.pressed === 'false'), '切り替えのボタンは aria-pressed="false"');
ok(btns.every((x) => x.tab === 0), 'ボタンは Tab で選べる（tabindex 0）');
ok(await p.evaluate(() => document.getElementById('dt-cb').getAttribute('aria-label')), '帯（role="toolbar"）に名前');
await p.keyboard.press('x');
ok(await p.evaluate(() => document.querySelector('#dt-cb [data-b="laser"]').getAttribute('aria-pressed')) === 'true', 'レーザーにすると aria-pressed="true"');
await p.keyboard.press('Escape');
ok(await p.evaluate(() => document.querySelector('#dt-cb [data-b="laser"]').getAttribute('aria-pressed')) === 'false', '解除すると aria-pressed="false"');

// Tab で帯に入る → 枠が出る → Enter で押せてフォーカスが残る → Esc で本体に戻る
await p.waitForTimeout(2800);
await p.keyboard.press('Tab');
let a = await act(p);
ok(a && a.tag === 'BUTTON' && a.b, `Tab で帯のボタンに入る（${a && a.b}）`);
ok(await p.evaluate(() => document.getElementById('dt-cb').classList.contains('show')), 'フォーカスが入ると帯が出る');
const ring = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + ' ' + s.outlineWidth; });
ok(/solid 2px/.test(ring), `キーボードのフォーカスには枠（${ring}）`);
await p.waitForTimeout(2900);
ok(await p.evaluate(() => document.getElementById('dt-cb').classList.contains('show')), 'フォーカスがある間は帯を隠さない');
await p.evaluate(() => document.querySelector('#dt-cb [data-b="next"]').focus());
const s0 = await p.evaluate(() => DECK.state());
await p.keyboard.press('Enter'); await settle(p);
const s1 = await p.evaluate(() => DECK.state());
ok(s1.step === s0.step + 1 || s1.slide === s0.slide + 1, 'フォーカスした「次へ」を Enter で押すと 1 つ進む');
a = await act(p);
ok(a && a.b === 'next', 'キーボードで押したらフォーカスは残る');
await p.keyboard.press(' '); await settle(p);
const s2 = await p.evaluate(() => DECK.state());
ok(s2.step === s1.step + 1 || s2.slide === s1.slide + 1, 'Space でもボタンを押す（二重に送らない）');
await p.keyboard.press('Escape');
a = await act(p);
ok(a && a.tag === 'BODY', 'Esc で帯から本体に戻る');
// マウスで押したらフォーカスを残さない（従来どおり）
await p.mouse.move(640, 800, { steps: 3 }); await p.waitForTimeout(300);
await p.click('#dt-cb [data-b="prev"]'); await settle(p);
ok((await act(p)).tag === 'BODY', 'マウスで押したボタンにはフォーカスが残らない');

// ---- ペンでもフォーカスが閉じ込められない
await p.keyboard.press('d');
ok(await p.evaluate(() => document.getElementById('dt-layer').getAttribute('aria-hidden') === 'true' && document.getElementById('dt-layer').tabIndex < 0 && !document.getElementById('dt-canvas').hasAttribute('tabindex')), '描く面は aria-hidden でフォーカスを取らない');
await p.mouse.move(400, 300); await p.mouse.down(); await p.mouse.move(500, 350, { steps: 4 }); await p.mouse.up();
await p.keyboard.press('Tab');
a = await act(p);
ok(a && a.tag === 'BUTTON', 'ペンで描いた後も Tab で帯に移れる');
await p.keyboard.press('Escape');
ok(await p.evaluate(() => DECK.tools.mode()) === null, 'Esc でペンを解除');
await p.keyboard.press('Escape');
await p.evaluate(() => DECK.tools.clear(true));

// ---- 一覧：縮図はボタン、フォーカスが付いてくる、閉じると戻る
await p.evaluate(() => document.querySelector('#dt-cb [data-b="over"]').focus());
await p.keyboard.press('Enter'); await settle(p);
const ov = await p.evaluate(() => { const box = document.getElementById('dt-ov'); const cells = [...box.querySelectorAll('.dt-cell')]; return { role: box.getAttribute('role'), n: cells.length, buttons: cells.every((c) => c.tagName === 'BUTTON' && /^\d+\. ./.test(c.getAttribute('aria-label'))), thumbsHidden: [...box.querySelectorAll('.dt-thumb > .slide')].every((s) => s.inert && s.getAttribute('aria-hidden') === 'true') }; });
ok(ov.role === 'dialog' && ov.buttons, `一覧は dialog、縮図 ${ov.n} 枚はすべて名前つきのボタン`);
ok(ov.thumbsHidden, '縮図の中身は inert・aria-hidden');
a = await act(p);
const selLabel = await p.evaluate(() => document.querySelector('#dt-ov .dt-cell.sel').getAttribute('aria-label'));
ok(a && a.label === selLabel, `開くと選んだ縮図にフォーカス（${a && a.label}）`);
await p.keyboard.press('ArrowRight');
const a2 = await act(p);
ok(a2 && a2.label !== a.label && a2.label === await p.evaluate(() => document.querySelector('#dt-ov .dt-cell.sel').getAttribute('aria-label')), `矢印で選ぶとフォーカスも動く（${a2 && a2.label}）`);
await shot(p, 'overview-focus');
await p.keyboard.press('Escape');
a = await act(p);
ok(await p.locator('#dt-ov').count() === 0 && a && a.b === 'over', 'Esc で閉じると、開く前のボタンにフォーカスが戻る');
await p.keyboard.press('Escape');
// キーの一覧
await p.keyboard.press('?');
ok(await p.evaluate(() => { const h = document.getElementById('dt-help'); return h.getAttribute('role') === 'dialog' && h.contains(document.activeElement); }), 'キーの一覧は dialog で、開くとフォーカスが入る');
ok(/字幕/.test(await p.locator('#dt-help').innerText()), 'キーの一覧に s（字幕）');
await p.keyboard.press('Escape');
ok((await act(p)).tag === 'BODY', 'Esc で閉じるとフォーカスは本体に戻る');

// ---- 字幕（s）
await p.evaluate(() => DECK.go(1, 1, false)); await settle(p);
const narr = (pp) => pp.evaluate(() => { const s = DECK.state(), sl = DECK.slides[s.slide - 1], k = s.key.slice(sl._key.length + 1); return ((DECK.NARRATION[sl._key] || {})[k] || []).map((x) => x.text).join(''); });
ok(!(await p.evaluate(() => DECK.captions())), '初めは字幕なし');
await p.keyboard.press('s'); await settle(p);
const cap = () => p.evaluate(() => { const e = document.getElementById('deck-cap'); return e && !e.hidden && getComputedStyle(e).display !== 'none' ? [...e.querySelectorAll('.cap-line')].map((x) => x.textContent).join('') : null; });
let c = await cap();
const pre = (a, b) => !!a && b.replace(/\s/g, '').startsWith(a.replace(/\s/g, ''));
ok(pre(c, await narr(p)), `s で字幕が出て、今の段階の口述原稿の初めから（${c && c.slice(0, 30)}…）`);
ok(await p.evaluate(() => document.querySelector('#dt-cb [data-b="cap"]').getAttribute('aria-pressed')) === 'true', '字幕のボタンが aria-pressed="true"');
await p.keyboard.press('ArrowRight'); await settle(p);
c = await cap();
ok(pre(c, await narr(p)), '次の段階で字幕も変わる');
const geo = await p.evaluate(() => { const r = document.getElementById('deck-cap').getBoundingClientRect(), st = document.getElementById('stage').getBoundingClientRect(); const l = document.querySelector('#deck-cap .cap-line'), cs = getComputedStyle(l); return { bottom: st.bottom - r.bottom, inside: r.left >= st.left && r.right <= st.right, fg: cs.color, bg: cs.backgroundColor }; });
ok(geo.inside && geo.bottom >= 0 && geo.bottom < 40, '字幕は舞台の下端に');
ok(geo.fg !== geo.bg, `字幕はテーマの色（文字 ${geo.fg}、地 ${geo.bg}）`);
await p.mouse.move(10, 10); await p.waitForTimeout(2800);
await stableCapture(p, { path: path.join(outdir, 'captions.png') });
await p.emulateMedia({ media: 'print' });
ok(await p.evaluate(() => getComputedStyle(document.getElementById('deck-cap')).display === 'none'), '印刷では字幕を出さない');
await p.emulateMedia({ media: 'screen' });
await p.keyboard.press('s'); await settle(p);
ok((await cap()) === null && !(await p.evaluate(() => DECK.captions())), 'もう一度 s で字幕を消す');

// ---- 手で送るときの長い口述原稿：1 まとまり（3 行まで）ずつ、読む速さで進み、最後は残る。段階が変わると最初から
const LONG = 'まず、目標を決めます。次に、ずれを測ります。それから、少しずつ動かします。そして、また測ります。最後に、確かめます。' + '学習とは、データに合うようにパラメータを少しずつ動かして、予測と正解のずれを減らしていく手続きのことです。'.repeat(2) +
  'ここで大事なのは、ずれの測り方、つまり損失の形を先に決めておかないと、どの方向に動かせばよいかが決まらないという点で、この点はあとの勾配の話にもつながります。' +
  '最後に、この考え方は回帰でも分類でも同じだということを覚えておいてください。';
await p.evaluate((t) => { const s = DECK.slides[2]; DECK.NARRATION[s._key][DECK.stepKey(2, 1).slice(s._key.length + 1)] = [{ role: 'expert', text: t }]; s._cap = null; DECK.captionRate = 30; }, LONG);
await p.keyboard.press('s');
await p.evaluate(() => DECK.go(2, 1, false));
const capGeo = () => p.evaluate(() => { const l = document.querySelector('#deck-cap .cap-line'); if (!l) return null; const cs = getComputedStyle(l), lh = parseFloat(cs.lineHeight);
  return { n: document.querySelectorAll('#deck-cap .cap-line').length, lines: Math.round((l.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh), fs: parseFloat(cs.fontSize), text: l.textContent, over: l.scrollHeight > l.clientHeight + 1 }; });
const g1 = await capGeo();
ok(g1 && g1.n === 1 && g1.lines <= 3 && pre(g1.text, LONG) && g1.text.length < LONG.length / 2, `長い原稿でも 1 まとまりだけ、${g1 && g1.lines} 行（3 行まで）`);
await stableCapture(p, { path: path.join(outdir, 'caption-long-1.png') });
await p.waitForTimeout(3200);
const g2 = await capGeo();
ok(g2 && g2.text !== g1.text && g2.lines <= 3 && LONG.includes(g2.text), `時間がたつと次のまとまりへ（${g2 && g2.text.slice(0, 16)}…、${g2 && g2.lines} 行）`);
await stableCapture(p, { path: path.join(outdir, 'caption-long-2.png') });
const tail = LONG.slice(-20);
await p.waitForFunction((t) => (document.querySelector('#deck-cap .cap-line') || {}).textContent?.endsWith(t), tail, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);
const g3 = await capGeo();
ok(g3 && LONG.endsWith(g3.text) && g3.lines <= 3, '最後のまとまりはそのまま残る');
await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft'); await settle(p);
ok(pre((await capGeo()).text, LONG), '段階が変わると最初のまとまりから');
// Shift+s：S / M / L
const toast = () => p.evaluate(() => { const t = document.getElementById('deck-toast'); return t && t.classList.contains('show') ? t.textContent : null; });
ok((await capGeo()).fs === 27 && await p.evaluate(() => DECK.captionSize()) === 'm', '字幕の大きさは初め M（27px）');
await p.keyboard.press('Shift+S'); await settle(p);
const tl = await toast();
await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowLeft'); await settle(p);
const gl = await capGeo();
ok(gl.fs === 34 && await p.evaluate(() => DECK.captionSize()) === 'l' && tl === '字幕の大きさ：L', `Shift+s で L（${gl.fs}px）、「字幕の大きさ：L」と知らせる`);
ok(gl.lines <= 3 && gl.text.length < g1.text.length, `大きいほど 1 まとまりが短い（M ${g1.text.length} 字 → L ${gl.text.length} 字、${gl.lines} 行）`);
await p.mouse.move(10, 10); await p.waitForTimeout(400);
await stableCapture(p, { path: path.join(outdir, 'caption-size-l.png') });
await p.keyboard.press('Shift+S'); await settle(p);
ok((await capGeo()).fs === 22 && await toast() === '字幕の大きさ：S', 'もう一度で S（22px）');
await p.keyboard.press('Shift+S'); await settle(p);
ok((await capGeo()).fs === 27, 'もう一度で M に戻る');
await p.keyboard.press('Shift+S'); await settle(p);
const stored = await p.evaluate(() => { try { return localStorage.getItem('deck-capsize'); } catch (e) { return 'n/a'; } });
ok(stored === 'l' || stored === 'n/a', `最後に選んだ大きさを覚える（${stored}）`);
await p.close();
const pl = await ctx.newPage(); watch(pl, '?capsize=s');
await pl.goto(url + '?captions=1&capsize=s#2'); await ready(pl); await settle(pl);
ok(await pl.evaluate(() => DECK.captionSize() === 's' && parseFloat(getComputedStyle(document.querySelector('#deck-cap .cap-line')).fontSize) === 22), '?capsize=s で S の大きさで開く（覚えた大きさより優先）');
await pl.close();

// ---- ?captions=1 で始める（発表）
const q = await ctx.newPage(); watch(q, '?captions=1');
await q.goto(url + '?captions=1#2'); await ready(q); await settle(q);
ok(await q.evaluate(() => DECK.captions() && !!document.getElementById('deck-cap').textContent), '?captions=1 なら初めから字幕');
await q.close();

// ---- 動画：何も足さない。?captions=1 のときだけ字幕（(i, k, t) だけで決まる）
const v = await ctx.newPage(); watch(v, '?mode=video');
await v.setViewportSize({ width: 1280, height: 720 });
await v.goto(url + '?mode=video'); await ready(v);
ok(await v.evaluate(() => !document.getElementById('deck-live') && !document.getElementById('deck-cap') && DECK.slides.every((s) => !s.hasAttribute('aria-hidden') && !s.inert && !s.hasAttribute('role'))), '動画では aria-live も aria-hidden も字幕も足さない');
await v.keyboard.press('s');
ok(await v.evaluate(() => !document.getElementById('deck-cap')), '動画では s を押しても字幕は出ない');
await v.close();
const vc = await ctx.newPage(); watch(vc, '?mode=video&captions=1');
await vc.setViewportSize({ width: 1280, height: 720 });
await vc.goto(url + '?mode=video&captions=1'); await ready(vc);
const vt = await vc.evaluate(() => { DECK.seek(1, 1, 0.5); const a = DECK.caption(); DECK.seek(3, 0, 1); DECK.seek(1, 1, 0.5); return [a, DECK.caption(), DECK.captions()]; });
ok(vt[2] && vt[0] && vt[0] === vt[1], `?mode=video&captions=1 では字幕が出て、(i, k, t) だけで決まる（${(vt[0] || '').slice(0, 20)}…）`);
// 字幕の文の区切り（#1）：後ろが空白でない「.」（0.5・e.g.・lr=0.01・a.b.c）の前の字を落とさない
// 音声のない段階なので、動画では区切ったまとまりが全部並ぶ。並んだまとまりを見る
const capOf = (t) => vc.evaluate((t) => { const s = DECK.slides[1]; DECK.NARRATION[s._key][DECK.stepKey(1, 1).slice(s._key.length + 1)] = [{ role: 'expert', text: t }]; s._cap = null;
  DECK.seek(3, 0, 1); DECK.seek(1, 1, 0.5); return [...document.querySelectorAll('#deck-cap .cap-line')].map((x) => x.textContent); }, t);
const ns = (x) => x.replace(/\s/g, '');
for (const [t, want] of [
  ['T を 0.5 に下げると、損失が減る。次に e.g. の例を見る。', ['T を 0.5 に下げると、損失が減る。次に e.g. の例を見る。']],
  ['We set lr=0.01. Then it converges! Done.', ['We set lr=0.01. Then it converges! Done.']],
  ['終わり。', ['終わり。']],
  ['a.b.c', ['a.b.c']],
  ['...', ['...']],
  ['For example, e.g. a small lr=0.01. works. Then we stop.', ['For example, e.g. a small lr=0.01. works. Then we stop.']],
]) {
  const got = await capOf(t);
  ok(JSON.stringify(got) === JSON.stringify(want) && ns(got.join('')) === ns(t), `字幕は「.」の前の字を落とさない：${JSON.stringify(t)} → ${JSON.stringify(got)}`);
}
// 文の区切りそのもの（つなぐ前）：kit/deck.js の capChunks の正規表現を取り出して、報告の 3 例と足した例を見る
const capRe = (() => { const src = fs.readFileSync(path.join(ROOT, 'kit/deck.js'), 'utf8'), m = src.match(/function capChunks[\s\S]*?\.match\((\/[^\n]*?\/g)\)/); return m ? new Function('return ' + m[1])() : null; })();
for (const [t, want] of [
  ['T を 0.5 に下げると、損失が減る。次に e.g. の例を見る。', ['T を 0.5 に下げると、損失が減る。', '次に e.g. ', 'の例を見る。']],
  ['We set lr=0.01. Then it converges! Done.', ['We set lr=0.01. ', 'Then it converges! ', 'Done.']],
  ['終わり。', ['終わり。']],
  ['a.b.c', ['a.b.c']],
  ['...', ['...']],
  ['This works, e.g. with lr=0.01. Then it stops.', ['This works, e.g. ', 'with lr=0.01. ', 'Then it stops.']],
]) {
  const got = capRe ? t.match(capRe) || [] : null;
  ok(got && JSON.stringify(got) === JSON.stringify(want), `文の区切り：${JSON.stringify(t)} → ${JSON.stringify(got)}`);
}
await vc.keyboard.press('Shift+S');
ok(await vc.evaluate(() => DECK.captionSize() === null && !document.getElementById('deck-toast') && parseFloat(getComputedStyle(document.getElementById('deck-cap')).fontSize) === 27), '動画では Shift+s も覚えた大きさも効かない（27px のまま）');
await vc.close();

// ---- 発表者ビューのボタン
const pv = await ctx.newPage(); watch(pv, '発表者ビュー');
await pv.goto(url + '?presenter=1'); await pv.waitForTimeout(800);
const pb = await pv.evaluate(() => [...document.querySelectorAll('#pv button')].map((e) => ({ id: e.id, b: e.getAttribute('data-b'), name: (e.getAttribute('aria-label') || e.textContent).trim(), pressed: e.getAttribute('aria-pressed'), tab: e.tabIndex })));
ok(pb.length >= 8 && pb.every((x) => x.name && x.tab === 0), `発表者ビューのボタン ${pb.length} 個に名前があり、Tab で選べる`);
ok(pb.filter((x) => /^(laser|pen|vpen)$/.test(x.b)).every((x) => x.pressed === 'false') && pb.find((x) => x.id === 'pv-auto').pressed === 'false', '道具と自動再生のボタンは aria-pressed');
ok(await pv.evaluate(() => [...document.querySelectorAll('#pv iframe')].every((f) => f.title)), 'iframe に title');
await pv.click('#pv .pv-tools [data-b="laser"]');
ok(await pv.evaluate(() => document.querySelector('#pv .pv-tools [data-b="laser"]').getAttribute('aria-pressed')) === 'true', '発表者ビューのレーザーを押すと aria-pressed="true"');
await pv.close();

// ---- check：alt の無い画像と名前の無い SVG
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-check-'));
fs.writeFileSync(path.join(tmp, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>検査</title></head><body><div id="stage">
<section class="slide static noconcl"><h2>画像と図</h2><div class="body">
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="200" height="100">
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="200" height="100" alt="">
<div class="fig"><svg viewBox="0 0 300 150" width="300" height="150"><rect width="300" height="150" fill="none" stroke="currentColor"/></svg></div>
<div class="fig"><svg viewBox="0 0 300 150" width="300" height="150" aria-label="四角"><rect width="300" height="150" fill="none" stroke="currentColor"/></svg></div>
</div></section></div></body></html>`);
const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), path.join(tmp, 'deck.html'), '--json'], { encoding: 'utf8' });
let res = [];
try { res = JSON.parse(r.stdout).results; } catch (e) { console.log(r.stdout.slice(-500), r.stderr.slice(-500)); }
ok(res.some((x) => x.sev === 'warn' && /alt の無い画像が 1 枚/.test(x.msg)), 'check：alt の無い画像を警告（alt="" は飾りとして通す）');
ok(res.some((x) => x.sev === 'warn' && /名前の無い SVG の図が 1 個/.test(x.msg)), 'check：名前の無い SVG の図を警告（aria-label があれば通す）');
fs.rmSync(tmp, { recursive: true, force: true });

ok(errs.length === 0, 'コンソールのエラーなし' + (errs.length ? '：' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} 件の失敗` : 'すべて通過', '→', outdir);
process.exit(fails ? 1 : 0);

async function shot(pg, name) { await pg.screenshot({ path: path.join(outdir, name + '.png') }); }
