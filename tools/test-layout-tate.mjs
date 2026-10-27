// 縦組みのスライド（class="slide layout-tate"、kit/layouts.css）の試験
//   node tools/test-layout-tate.mjs [作業フォルダ]
// 1. 試験用のデッキ（文章・箇条書き・.tate とルビ・m-kobun・m-gendai・m-kanbun）を default と kokugo のテーマで組み、
//    最終段階で：見出しが縦書きで右端の列（右 1232px・天 48px）にあり、罫が列の左にあり、字が列に収まる／本文の字が見出しの列・結論の列・ページ番号に重ならず、
//    地 680px を越えない／結論は左端の縦の列で字が枠に収まる／ページ番号は見出しの列の下
// 2. 決定性：同じ (i, k, t) を、読み込み直後と、ほかの位置を経てからとで描いて画素が一致する（tools/test-components.mjs と同じ基準）
// 3. 品質チェック（kit/check.mjs --json）：試験用のデッキはエラー 0。縦組みの悪い例（長すぎる見出し・結論・本文の重なり）はそれぞれのエラーになる
// 4. スライドの鍵と持ち運べる 1 ファイルの読める層は、layout-tate があってもなくても同じ（見た目だけの class）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl, stableCapture } from '../kit/browser.mjs';
import { parseCheck } from '../kit/core/check-result.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-layout-tate-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

let n = 0, fail = 0;
const t = async (name, fn) => {
  n++;
  try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8' });

const page = (title, slides) => `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<div id="stage">
<section class="slide cover noconcl static" id="cover"><h1>${title}</h1></section>
${slides}
</div>
</body>
</html>
`;
// 見出しから鍵を作るスライド（id なし）も 1 枚入れる
const GOOD = page('縦組みの試験', `
<section class="slide layout-tate">
  <h2>縦組みのスライドの見本</h2>
  <div class="body">
    <p>見出しは右端の列に縦に組み、本文はその左に組む。</p>
    <ul>
      <li>箇条書きも縦に並ぶ</li>
      <li>二つ目の項目は左の列へ</li>
    </ul>
  </div>
  <div class="concl"><span>結論は左端の縦の列に置く</span></div>
</section>
<section class="slide layout-tate noconcl" id="tate">
  <h2>縦書きの塊とルビ</h2>
  <div class="body">
    <div class="tate" style="font-size:34px">
      <p><ruby>返<rt>かえ</rt></ruby>り<ruby>点<rt>てん</rt></ruby>は、漢字の左下に付けて、読む順を示す。</p>
      <p data-step="1"><b class="term">レ点</b>　すぐ下の一字を読んでから、一字上へ戻る。</p>
      <p data-step="2"><b class="term">一二点</b>　二字以上へだてて戻る。<span class="tcy">12</span>字まで。</p>
    </div>
  </div>
</section>
<section class="slide layout-tate noconcl" id="kobun">
  <h2>古文の通し読み</h2>
  <div class="body">
    <m-kobun tate style="height:600px" size="32">
      春[名]/は[係助]/あけぼの[名]。
      = 春は明け方（がよい）。
      やうやう[副]/白く[形・ク・連用]/なりゆく[動・カ四・連体]/山ぎは[名]、
      = だんだん白くなっていく山ぎわ（の空）が、
    </m-kobun>
  </div>
</section>
<section class="slide layout-tate noconcl" id="gendai">
  <h2>現代文の段落</h2>
  <div class="body">
    <m-gendai tate style="height:600px">
      @具体例#p1>p2
      駅までの道を、私は{地図アプリ|#app}に頼って歩く。だが、{それ|>app}を閉じると、角さえ思い出せない。

      @主張#p2
      便利な道具は、私たちから==迷う機会を奪う==。
    </m-gendai>
  </div>
</section>
<section class="slide layout-tate" id="kanbun">
  <h2>孟浩然「春暁」</h2>
  <div class="body">
    <m-kanbun style="height:600px">
      春眠不{=ず}レ覚(エ)レ暁(ヲ)
      処処聞(ク)[二]啼鳥(ヲ)[一]
    </m-kanbun>
  </div>
  <div class="concl"><span>レ点が続くときは下から戻る</span></div>
</section>
`);
const BAD = page('縦組みの悪い例', `
<section class="slide layout-tate static" id="longtitle">
  <h2>とても長い見出しは縦の一列には収まりきらない</h2>
  <div class="body"><p>短い本文。</p></div>
  <div class="concl"><span>結論の列も長すぎると縦の枠から下へはみ出す</span></div>
</section>
<section class="slide layout-tate static" id="overconcl">
  <h2>本文が多すぎる</h2>
  <div class="body"><div class="tate">${'<p>あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめも。</p>'.repeat(14)}</div></div>
  <div class="concl"><span>はみ出す</span></div>
</section>
<section class="slide layout-tate static noconcl" id="overhead">
  <h2>見出しに重なる</h2>
  <div class="body"><p style="margin-right:-80px">右へずれた本文。</p></div>
</section>
`);

const write = (name, html) => { const d = path.join(work, name); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'deck.html'), html); return path.join(d, 'deck.html'); };
const good = write('good', GOOD);
const bad = write('bad', BAD);
const plainDeck = write('plain', GOOD.replaceAll(' layout-tate', ''));

const b = await launch();
for (const theme of ['default', 'kokugo']) {
  const out = path.join(work, 'good', 'out', theme + '.html');
  await t(`${theme}: build`, () => {
    const r = node('kit/build.mjs', good, '--theme', theme, '-o', out);
    assert.equal(r.status, 0, r.stderr);
  });
  if (!fs.existsSync(out)) continue;
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const load = async () => {
    await p.goto(fileUrl(out));
    await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
    await p.evaluate(() => document.fonts.ready);
  };
  const settle = () => p.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await load();
  const plan = await p.evaluate(() => DECK.slides.map((s, i) => ({ i, key: s._key, max: s._max, tate: s.classList.contains('layout-tate') })).filter((s) => s.tate));
  await t(`${theme}: ${plan.length} slides in layout-tate`, () => assert.equal(plan.length, 5));
  for (const s of plan) {
    await t(`${theme}: ${s.key}: heading at the right edge, body and conclusion clear of it`, async () => {
      await p.evaluate(([i, k]) => DECK.seek(i, k, Infinity), [s.i, s.max]);
      await settle();
      const g = await p.evaluate((i) => {
        const sl = DECK.slides[i], R = sl.getBoundingClientRect(), k = R.width / 1280;
        const rel = (r) => ({ l: (r.left - R.left) / k, t: (r.top - R.top) / k, r: (r.right - R.left) / k, b: (r.bottom - R.top) / k });
        // 字の外形：文字の範囲（Range）と SVG の text。透明（段階の前）の字は数えない
        const shown = (e) => { for (let x = e; x && x !== sl; x = x.parentElement) if (+(x.getAttribute && x.getAttribute('opacity') || getComputedStyle(x).opacity) < 0.5) return false; return true; };
        const glyphs = (root) => {
          const out = [];
          const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = tw.nextNode())) {
            const e = n.parentElement;
            if (!n.textContent.trim() || !shown(e) || e.closest('svg')) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const r of rg.getClientRects()) if (r.width && r.height) out.push({ s: n.textContent.trim().slice(0, 8), ...rel(r) });
          }
          root.querySelectorAll('svg text').forEach((e) => { if (e.textContent.trim() && shown(e)) out.push({ s: e.textContent.trim(), ...rel(e.getBoundingClientRect()) }); });
          return out;
        };
        const h2 = sl.querySelector('h2'), c = sl.querySelector('.concl'), pn = sl.querySelector('.pn'), cs = getComputedStyle(h2);
        return { wm: cs.writingMode, bl: parseFloat(cs.borderLeftWidth), bb: parseFloat(cs.borderBottomWidth), h2: rel(h2.getBoundingClientRect()), h2g: glyphs(h2),
          body: glyphs(sl.querySelector('.body')), pn: pn && rel(pn.getBoundingClientRect()),
          c: c && { wm: getComputedStyle(c).writingMode, box: rel(c.getBoundingClientRect()), g: glyphs(c), bt: parseFloat(getComputedStyle(c).borderTopWidth), rad: getComputedStyle(c).borderTopLeftRadius, jc: getComputedStyle(c).justifyContent } };
      }, s.i);
      const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1, `${what}: ${a.toFixed(1)} (expected ${b})`);
      const inside = (g, box, what) => { for (const x of g) assert.ok(x.l >= box.l - 1 && x.r <= box.r + 1 && x.t >= box.t - 1 && x.b <= box.b + 1, `${what}: "${x.s}" ${JSON.stringify(x)} outside ${JSON.stringify(box)}`); };
      const apart = (g, box, what) => { for (const x of g) assert.ok(x.r <= box.l || x.l >= box.r || x.b <= box.t || x.t >= box.b, `${what}: "${x.s}" overlaps ${JSON.stringify(box)}`); };
      assert.equal(g.wm, 'vertical-rl', 'heading writing-mode');
      near(g.h2.r, 1232, 'heading right'); near(g.h2.t, 48, 'heading top');
      assert.ok(g.h2.b <= 680, `heading bottom ${g.h2.b}`);
      assert.ok(g.bl >= 1 && g.bb === 0, `rule on the left of the heading (border-left ${g.bl}, border-bottom ${g.bb})`);
      assert.ok(g.h2g.length, 'heading has text');
      inside(g.h2g, g.h2, 'heading text fits its column');
      assert.ok(g.body.length, 'body has visible text');
      for (const x of g.body) assert.ok(x.r <= g.h2.l - 8 && x.b <= 680 && x.t >= 0 && x.l >= 40, `body text "${x.s}" ${JSON.stringify(x)} (heading column from ${g.h2.l.toFixed(1)})`);
      if (g.c) {
        assert.equal(g.c.wm, 'vertical-rl', 'conclusion writing-mode');
        near(g.c.box.l, 48, 'conclusion left'); near(g.c.box.t, 48, 'conclusion top');
        // default 1.2.0 の結論の行（左の縦線・左揃え）は横組みだけ。縦組みの結論の列は今までの枠（四辺の線・角丸・中央揃え）のまま
        assert.ok(g.c.bt >= 2 && g.c.rad === '10px' && g.c.jc === 'center', `conclusion column keeps its frame (border-top ${g.c.bt}, radius ${g.c.rad}, ${g.c.jc})`);
        assert.ok(g.c.box.r <= 124, `conclusion column right ${g.c.box.r}`);
        inside(g.c.g, g.c.box, 'conclusion text fits its box');
        for (const x of g.body) assert.ok(x.l >= g.c.box.r + 8, `body text "${x.s}" over the conclusion column (${x.l.toFixed(1)})`);
      }
      assert.ok(g.pn, 'page number');
      assert.ok(g.pn.t >= g.h2.b && g.pn.b <= 720, `page number below the heading column ${JSON.stringify(g.pn)}`);
      apart(g.body, g.pn, 'body text vs page number');
    });
  }
  // 決定性：読み込み直後の (i, k, 0.5) と、ほかの位置を経てからの (i, k, 0.5)
  await t(`${theme}: determinism of seek`, async () => {
    const diffs = [];
    for (const s of plan) for (let k = 1; k <= s.max; k++) {
      await load(); await p.evaluate(([i, k]) => DECK.seek(i, k, 0.5), [s.i, k]); await settle();
      const A = await stableCapture(p);
      await p.evaluate(([i, k, m]) => { DECK.seek(i, m, Infinity); DECK.seek(i, 0, Infinity); DECK.seek(i, k, 1.7); DECK.seek(i, Math.min(m, k + 1), 0.3); DECK.seek(i, k, 0.5); }, [s.i, k, s.max]);
      await settle();
      let B = await stableCapture(p);
      if (!A.equals(B)) { await settle(); B = await stableCapture(p); }
      if (!A.equals(B)) {
        const nd = await p.evaluate(async ([a, b]) => {
          const ld = (s) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + s; });
          const [ia, ib] = await Promise.all([ld(a), ld(b)]);
          const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
          g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++;
          return n;
        }, [A.toString('base64'), B.toString('base64')]);
        if (nd > 40) diffs.push(`${s.key} k${k}: ${nd} px`);
      }
    }
    assert.deepEqual(diffs, []);
  });
  await t(`${theme}: no console errors`, () => assert.deepEqual(errs, []));
  await p.close();
  await t(`${theme}: checker reports no errors`, () => {
    const r = node('kit/check.mjs', good, '--theme', theme, '--json');
    const j = parseCheck(r.stdout, r.status);   // 検査が終わっていない（終了コード 2）ときは例外（エラー 0 と取り違えない）
    const e = j.results.filter((x) => x.sev === 'error');
    assert.deepEqual(e, []);
  });
}
await b.close();

await t('checker: vertical heading, conclusion and body overlaps are errors', () => {
  const r = node('kit/check.mjs', bad, '--json');
  const j = parseCheck(r.stdout, r.status);
  const e = (key) => j.results.filter((x) => x.sev === 'error' && x.id === key).map((x) => x.msg);
  const has = (title, re) => assert.ok(e(title).some((m) => re.test(m)), `${title}: ${JSON.stringify(e(title))} lacks ${re}`);
  has('longtitle', /縦組みの見出しが列に収まらない/);
  has('longtitle', /結論の行が枠からはみ出す/);
  has('overconcl', /本文が結論の列に重なる/);
  has('overhead', /本文が見出しの列に重なる/);
  assert.equal(r.status, 1);
});

await t('slide keys and the readable layer do not depend on layout-tate', () => {
  const a = path.join(work, 'tate.html'), c = path.join(work, 'plain.html');
  for (const [src, o] of [[good, a], [plainDeck, c]]) { const r = node('kit/build.mjs', src, '--portable', '-o', o); assert.equal(r.status, 0, r.stderr); }
  const layer = (f) => { const h = fs.readFileSync(f, 'utf8'); const m = h.match(/<section id="[^"]*readable"[\s\S]*?<\/section>/); assert.ok(m, 'readable layer in ' + f); return m[0]; };
  // id のないスライドには書き出しがそれぞれ新しい id を付ける（format spec §8.1。乱数）：その id は比べない
  const norm = (h) => h.replace(/\bs-[a-z2-7]{6}\b/g, 's-ID');
  const A = norm(layer(a)), C = norm(layer(c));
  assert.ok(A.includes('data-slide-key="s-ID"'), 'the slide without an id got one at export');
  assert.equal(A, C);
  assert.ok(A.includes('<h2>縦組みのスライドの見本</h2>') && A.includes('<h2>孟浩然「春暁」</h2>'), 'headings in the readable layer');
  const keys = (h) => [...h.matchAll(/data-slide-key="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(keys(A), keys(C));
});

console.log(`\n${n - fail}/${n} passed`);
process.exit(fail ? 1 : 0);
