// 見ている人が手で変えた部品の状態（m-kobun の活用表の札など）は (i, k, t) の外：段階に入るたび（同じ段階に入り直すときも）
// render(k, t) の画面に戻る（docs/contract.md §3、format spec §8.4）
//   node tools/test-step-reset.mjs [出力先] [--only 名前,名前]
// 部品庫の部品の見本（vendor/components の既定の版の demo.html）を組み、部品のあるスライドの各段階（押すと状態が変わる m-kobun・m-menu。ほかの部品は最後の段階）で：
//   画面を撮る（A）→ 部品を操作する（m-kobun：助動詞の語を押して札を開く。ほかの部品：部品の真ん中を押す。m-menu の札は押すとリンクで動く）→
//   次の段階へ進んでから戻る（スライドの最後の段階では次のスライドへ行って戻る）／DECK.go(i, k) で同じ段階に入り直す／DECK.seek(i, k, Infinity) で入り直す
//   → 撮った画面が A と画素まで同じ（部品の DOM がバイトまで同じなら、縁のアンチエイリアスの少しの揺れは許して記録する：kit/render-compare.mjs）
// m-kobun はキーボード（Tab で選んで Enter）でも開いて確かめる（比べる前にフォーカスを外す。フォーカスの枠はブラウザの状態で、部品の状態ではない）
// m-menu の「見た」の印はこのセッションで開いたスライドの記録（contract §9、DECK.visited）で、手で変えた部品の状態ではないので、
// 撮る前に行き先をすべて開いておく
// 発表者ビュー：本体で札を開いたままでも、発表者ビューの今の画面（view=follow）は宣言どおりの画面
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, fileUrl } from '../kit/browser.mjs';
import { ROOT, vendorComponents } from './vendor-components.mjs';
import { compareRenders, domSnapshot, noiseLog } from '../kit/render-compare.mjs';

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : null;
const out = path.resolve(args[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-step-reset-')));
fs.mkdirSync(out, { recursive: true });
let fail = 0;
const failed = new Set();
const ok = (c, m, name) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) { fail++; if (name) failed.add(name); } };

const comps = vendorComponents().filter((c) => fs.existsSync(path.join(c.dir, 'demo.html')) && (!only || only.includes(c.name)));
// 押すと状態が変わる部品（部品の中で押す・キーを打つ口を持つもの）。ほかの部品は真ん中を押しても何も変わらないはずなので、軽く確かめる
const FULL = ['kobun', 'menu'];
const CLIP = { x: 0, y: 0, width: 1280, height: 720 };
// 実行系の操作の部品（操作のバー・知らせ・リンクで来たときの「戻る」ボタン）は部品の外なので隠して比べる
const HIDE = '#dt-cb,#deck-toast,#deck-back{display:none!important}';
const b = await launch();

const settle = (p) => p.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
// 画素の比較は kit/render-compare.mjs（tools/test-components.mjs の決定性・kit/check.mjs の D と同じ基準）：部品の DOM がバイトまで同じで、
// 違いが NOISE_BOUNDS の内側（縁の 1 px・部品の箱の中・部品の面積の 0.1 % かつ 200 px 以下）なら描き方の揺れとして許して記録する。
// DOM が違う・比べる DOM がない部品は、今までどおり画素の数だけ（はっきり違う画素が 40 以下）
let exactN = 0, tolN = 0;
const noise = noiseLog();   // 描き方の揺れとして通した比べ（部品・スライド・段階）。終わりにまとめて出す
const shot = async (p) => { await settle(p); return p.screenshot({ clip: CLIP }); };
const goTo = (p, i, k) => p.evaluate(([i, k]) => DECK.go(i, k, false), [i, k]);

// 部品を操作する：押した数（0 なら押すものがない）。opened：開いた札があるか（m-kobun）
async function interact(p, i, how) {
  const targets = await p.evaluate((i) => {
    const s = DECK.slides[i], r = [];
    s._comps.forEach((c, n) => {
      const tag = c.localName;
      const pick = tag === 'm-kobun' ? [...c.querySelectorAll('.kb-aux')].slice(0, 1) : tag === 'm-menu' ? [...c.querySelectorAll('a[href]')].filter((a) => +getComputedStyle(a).opacity > 0).slice(0, 1) : [c];
      pick.forEach((e) => { const b = e.getBoundingClientRect(); if (b.width > 0 && b.height > 0) r.push({ n, tag, x: b.x + b.width / 2, y: b.y + b.height / 2 }); });
    });
    return r;
  }, i);
  for (const t of targets) {
    if (how === 'key' && t.tag === 'm-kobun') {
      await p.evaluate(([i, n]) => DECK.slides[i]._comps[n].querySelector('.kb-aux').focus(), [i, t.n]);
      await p.keyboard.press('Enter');
    } else await p.mouse.click(t.x, t.y);
  }
  const opened = await p.evaluate((i) => [...DECK.slides[i].querySelectorAll('m-kobun .kb-pop')].some((e) => e.style.display === 'block'), i);
  return { n: targets.length, opened, kobun: targets.some((t) => t.tag === 'm-kobun') };
}

// 部品の DOM（属性・style・中身・shadow DOM）。画素が違ったとき、部品の状態が違うのか描き方（ラスタライズ）の揺れなのかを分ける
const domOf = (p, i) => domSnapshot(p, i);

for (const { name, dir } of comps) {
  const deck = path.join(out, name, 'demo.html');
  execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'demo.html'), '-o', deck], { stdio: 'pipe' });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  let n = 0;
  // 開き直す（失敗した場合の後始末にも使う：次の確かめが前の操作の残りに引きずられないように）
  const open = async () => {
    await p.goto(fileUrl(deck));
    await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
    await p.addStyleTag({ content: HIDE });
    // 「見た」の印を先に揃える（すべてのスライドを一度開く）
    n = await p.evaluate(() => DECK.slides.length);
    for (let i = 0; i < n; i++) await goTo(p, i, 0);
  };
  await open();
  // 押すと状態が変わる部品（FULL）はすべての段階、ほかの部品はスライドの最後の段階だけ（CI の macOS で時間に収めるため）
  const pos = await p.evaluate((full) => DECK.slides.flatMap((s, i) => (!s._comps.length ? [] : full ? Array.from({ length: s._max + 1 }, (_, k) => [i, k]) : [[i, s._max]])), FULL.includes(name));
  let tried = 0;
  for (const [i, k] of pos) {
    const max = await p.evaluate((i) => DECK.slides[i]._max, i);
    const ways = [
      ['next and back', async () => { if (k < max) await goTo(p, i, k + 1); else if (i + 1 < n) await goTo(p, i + 1, 0); else await goTo(p, i, Math.max(0, k - 1)); await goTo(p, i, k); }],
      ['DECK.go same step', () => goTo(p, i, k)],
      ['DECK.seek same step', () => p.evaluate(([i, k]) => DECK.seek(i, k, Infinity), [i, k])],
    ];
    const hows = name === 'kobun' ? ['mouse', 'key'] : ['mouse'];
    for (const how of hows) {
      for (const [label, enter] of ways) {
        // 基準の画面：同じ段階に 2 回入り直してから撮る（Chrome は同じ値を書き直しただけでも塗り直し、初めの 1〜2 回だけ字や線の縁の画素が揺れることがある）
        for (let r = 0; r < 2; r++) { await goTo(p, i, k); await settle(p); }
        const A = await shot(p), DA = await domOf(p, i);
        const it = await interact(p, i, how);
        if (!it.n) break;
        // 操作が効いたか（m-kobun は札が開く）。効かなければ確かめにならない
        if (it.kobun) ok(it.opened, `${name}: slide ${i + 1} step ${k}: ${how} opens the card`, name);
        tried++;
        // 操作した位置（m-menu の札のリンクなどで動いたら、その位置）から入り直す
        const st = await p.evaluate(() => DECK.state());
        if (st.slide !== i + 1 || st.step !== k) await goTo(p, i, k);
        await enter();
        await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        await p.mouse.move(0, 0);
        const B = await shot(p), DB = await domOf(p, i);
        const cmp = await compareRenders(p, A, B, DA, DB), same = cmp.same;
        if (cmp.exact) exactN++; else if (same) tolN++;
        const tag = `${name}-s${i + 1}-k${k}-${how}-${label.replace(/\W+/g, '_')}`;
        if (!cmp.exact) console.log(`     ${same ? 'note' : 'diff'} ${name} slide ${i + 1} step ${k} (${how}, ${label}): ${cmp.note}`);
        noise.add(`${name} slide ${i + 1} step ${k} (${how}, ${label})`, cmp);
        if (!same) { fs.writeFileSync(path.join(out, tag + '-A.png'), A); fs.writeFileSync(path.join(out, tag + '-B.png'), B); }
        ok(same, `${name}: slide ${i + 1} step ${k}: ${how} interaction, then ${label} = before (pixel-equal)`, name);
        if (!same) await open();
      }
    }
  }
  if (!tried) console.log(`---- ${name}: nothing to interact with`);
  else console.log(`---- ${name}: ${tried} interactions checked`);
  ok(!errs.length, `${name}: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`, name);
  await p.close();
}

// m-kobun：段階の中の動き（実時間の再生の続きのコマ）では閉じない／印刷には出ない
if (!only || only.includes('kobun')) {
  const deck = path.join(out, 'kobun', 'demo.html');
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(fileUrl(deck));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await goTo(p, 0, 1);
  await p.evaluate(() => DECK.go(0, 2, true));
  const it = await interact(p, 0, 'mouse');
  await p.waitForTimeout(1500);
  const still = await p.evaluate(() => [...document.querySelectorAll('m-kobun .kb-pop')].some((e) => e.style.display === 'block'));
  ok(it.opened && still, 'kobun: a card opened while the step is moving stays open until the next step is entered');
  const printed = await p.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); const r = [...document.querySelectorAll('m-kobun .kb-pop')].some((e) => e.style.display === 'block'); window.dispatchEvent(new Event('afterprint')); return r; });
  ok(!printed, 'kobun: printing draws the declared rendering (the open card is closed)');
  await p.close();
}

// 発表者ビュー：本体で札を開いても、発表者ビューの今の画面は宣言どおり（m-kobun の見本のスライド 1 の段階 2）
if (!only || only.includes('kobun')) {
  const deck = path.join(out, 'kobun', 'demo.html');
  const ref = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await ref.goto(fileUrl(deck) + '?view=follow');
  await ref.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await ref.addStyleTag({ content: HIDE });
  await goTo(ref, 0, 2);
  const R = await shot(ref);
  const main = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await main.goto(fileUrl(deck));
  await main.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  const popP = main.waitForEvent('popup');
  await main.keyboard.press('p');
  const pv = await popP;
  await pv.setViewportSize({ width: 1400, height: 820 });
  await pv.waitForSelector('#f-cur');
  const fr = await (await pv.$('#f-cur')).contentFrame();
  await fr.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await fr.addStyleTag({ content: HIDE });
  await goTo(main, 0, 2);
  await fr.waitForFunction(() => DECK.state().slide === 1 && DECK.state().step === 2, null, { timeout: 15000 });
  const it = await interact(main, 0, 'mouse');
  ok(it.opened, 'presenter: the card is open on the main window');
  // 発表者ビューの今の画面は送られた位置を動きつきで描くので、動きが終わるまで待つ
  await pv.waitForTimeout(2500);
  // 発表者ビューの今の画面（iframe）を 1280×720 にし、窓の左上に固定して撮る。同じ位置を ?view=follow で描いた画面と比べる
  await pv.evaluate(() => { const f = document.getElementById('f-cur'); Object.assign(f.style, { position: 'fixed', left: '0px', top: '0px', width: '1280px', height: '720px', aspectRatio: 'auto', zIndex: 99 }); });
  await fr.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const P = await pv.screenshot({ clip: CLIP });
  const popupInFrame = await fr.evaluate(() => [...document.querySelectorAll('m-kobun .kb-pop')].some((e) => e.style.display === 'block'));
  ok(!popupInFrame, 'presenter: no card is open in the presenter view while the main window has one open');
  const DF = await domOf(fr, 0), DR = await domOf(ref, 0);
  ok(DF.dom === DR.dom, 'presenter: the component in the presenter view = the declared rendering of (1, 2) (DOM)');
  const pc = await compareRenders(ref, R, P, DR, DF), same = pc.same;
  if (!pc.exact) console.log(`     ${same ? 'note' : 'diff'} kobun slide 1 step 2 (presenter view): ${pc.note}`);
  noise.add('kobun slide 1 step 2 (presenter view)', pc);
  if (!same) { fs.writeFileSync(path.join(out, 'presenter-ref.png'), R); fs.writeFileSync(path.join(out, 'presenter-cur.png'), P); }
  ok(same, 'presenter: the presenter view\'s current frame = the declared rendering of (1, 2) (pixel-equal)');
  await pv.close(); await main.close(); await ref.close();
}
await b.close();
console.log(`comparisons: ${exactN} exactly equal, ${tolN} within the anti-aliasing tolerance (kit/render-compare.mjs)`);
console.log(noise.summary('renderer-noise acceptances (DOM byte-identical, edge-only, kit/render-compare.mjs)'));
if (failed.size) console.log('failed components: ' + [...failed].join(', '));
console.log(fail ? `${fail} failure(s)` : 'all ok');
process.exit(fail ? 1 : 0);
