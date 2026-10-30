// 図の中の重なる字（backlog #139）。元デッキの P5・P7 と、座標・逆向きの辺を直した対。
// コマンド版とプレビュー版、段階の可視性、意図した重ね字、空白・複数行の空所、既存の部品の見本を確かめる。
//   node tools/test-check-svg-overlap.mjs [作業フォルダ]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { build } from '../kit/build.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';
import { layoutScan, withLayoutScan, CLIP_ATTR, ANNOT_ATTR, OVERLAP_ATTR } from '../kit/core/layout-scan.mjs';
import { message, MESSAGES } from '../kit/check-messages.mjs';
import { previewDocument } from '../app/preview-doc.js';
import { ROOT, vendorComponents } from './vendor-components.mjs';

const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-check-svg-overlap-'));
fs.mkdirSync(work, { recursive: true });
const fixture = path.join(ROOT, 'tools/fixtures/check-svg-overlap');
const options = { JA: true, refRe: '文献', clip: CLIP_ATTR, annot: ANNOT_ATTR, overlap: OVERLAP_ATTR };
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n' + e.stack); } };
const overlaps = (rs) => rs.filter((r) => r.code === 'textOverlap');
const pairs = { 's-quad139': ['目指すべき市場', '目指す顧客'], 's-flow139': ['技術許諾', '特許実施料'] };
const expectPairs = (rs, idOf, dataOf) => {
  const xs = overlaps(rs);
  assert.equal(xs.length, 2);
  for (const [id, pair] of Object.entries(pairs)) {
    const r = xs.find((x) => idOf(x) === id);
    assert.ok(r, id);
    assert.equal(r.sev, 'warn');
    const a = dataOf(r);
    assert.equal(a.svg, true);
    assert.deepEqual([a.t, a.u].sort(), pair.slice().sort());
  }
};

await t('messages: SVG overlap names both texts and gives deck-side fixes in ja/en', () => {
  const a = { t: '目指すべき市場', u: '目指す顧客', with: 'text', svg: true, n: 1 };
  assert.equal(MESSAGES.textOverlap.rule, 'R-fit');
  for (const lang of ['ja', 'en']) {
    const m = message(lang, 'textOverlap', a);
    for (const text of [a.t, a.u, 'm-flow', 'shift']) assert.ok(m.includes(text), m);
    assert.match(m, lang === 'ja' ? /項目を動かすか座標を変える/ : /move the item or change its coordinates/);
  }
  assert.ok(!message('en', 'textOverlap', { ...a, svg: false }).includes('shift'));
});
await t('fixtures: original, corrected and marker decks build offline', () => {
  for (const name of ['deck.html', 'fixed.html', 'markers.html']) {
    const r = build(path.join(fixture, name));
    assert.ok(name === 'markers.html' ? r.html.includes('data-overlap="ok"') : r.html.includes('目指すべき市場') && r.html.includes('特許実施料'));
  }
});
await t('preview wrapper passes the marker into the serialized scanner', () => {
  const f = new Function('return ' + withLayoutScan('(function(){return LAYOUT_OVERLAP;})'))();
  assert.equal(f(), OVERLAP_ATTR);
});

const b = await launch();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  async function load(src, name) {
    const f = path.join(work, name + '.html');
    fs.writeFileSync(f, build(src).html);
    await page.goto(fileUrl(f));
    await page.waitForFunction(() => window.DECK && DECK.ready);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(`window.__layoutScan = ${layoutScan}`);
  }
  async function scan(i, k = null) {
    return page.evaluate(([i, k, options]) => {
      const s = DECK.slides[i];
      DECK.seek(i, k === null ? s._max : k, Infinity);
      return window.__layoutScan(s, options);
    }, [i, k, options]);
  }
  await t('check --json: P5/P7 each warn, name the slide and both texts, with R-fit and no errors', () => {
    for (const lang of ['ja', 'en']) {
      const r = spawnSync(process.execPath, ['kit/check.mjs', path.join(fixture, 'deck.html'), '--json', '--lang', lang], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
      assert.equal(r.status, 0, r.stderr);
      const j = JSON.parse(r.stdout);
      assert.equal(j.counts.error, 0);
      expectPairs(j.results, (x) => x.id, (x) => x.data);
      for (const x of overlaps(j.results)) {
        assert.equal(x.rule, 'R-fit');
        assert.ok(x.msg.includes(x.title), x.msg);
        assert.ok(x.msg.includes('shift'), x.msg);
      }
    }
  });
  await t('scanner: only visible text at the scanned step counts', async () => {
    await load(path.join(fixture, 'deck.html'), 'bad');
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(overlaps(await scan(i, 0)), []);
      assert.deepEqual(overlaps(await scan(i, 2)), []);
      const rs = overlaps(await scan(i));
      assert.equal(rs.length, 1);
      assert.deepEqual([rs[0].a.t, rs[0].a.u].sort(), Object.values(pairs)[i].slice().sort());
    }
  });
  await t('check --json: moved item and shifted reverse edge give no overlap warnings', () => {
    const r = spawnSync(process.execPath, ['kit/check.mjs', path.join(fixture, 'fixed.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.counts.error, 0);
    assert.deepEqual(overlaps(j.results), []);
  });
  await t('quick check: P5/P7 match the command; the corrected deck has no overlap warning', async () => {
    const shim = withLayoutScan(fs.readFileSync(path.join(ROOT, 'app/frame-shim.js'), 'utf8'));
    for (const name of ['deck.html', 'fixed.html']) {
      const f = path.join(work, 'preview-' + name);
      fs.writeFileSync(f, previewDocument(build(path.join(fixture, name)).html, `${shim}(${JSON.stringify({ dev: true, load: 1 })});`));
      await page.goto(fileUrl(f));
      const q = await page.evaluate(() => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no app-check-result')), 30000);
        addEventListener('message', (e) => { if (e.data?.type === 'app-check-result') { clearTimeout(timer); resolve({ results: e.data.results, ids: DECK.slides.map((s) => s.id) }); } });
        postMessage({ type: 'app-check', id: 'svg139' }, '*');
      }));
      if (name === 'deck.html') expectPairs(q.results, (x) => q.ids[x.i], (x) => x.arg);
      else assert.deepEqual(overlaps(q.results), []);
    }
  });
  await t('marker fixture: only the exact ok value on text or an ancestor g opts out', async () => {
    await load(path.join(fixture, 'markers.html'), 'markers');
    const ids = await page.evaluate(() => DECK.slides.map((s) => s.id));
    for (let i = 0; i < ids.length; i++) {
      assert.equal(overlaps(await scan(i)).length, ids[i].startsWith('s-ok') ? 0 : 1, ids[i]);
    }
  });
  await t('glyphs: whitespace, multiline gaps, hidden/unpainted text, tolerance, clip and overlap markers', async () => {
    await load(path.join(fixture, 'fixed.html'), 'glyphs');
    const count = async (markup) => {
      await page.evaluate((markup) => {
        DECK.seek(0, DECK.slides[0]._max, Infinity);
        DECK.slides[0].querySelector('.body').innerHTML = `<svg viewBox="0 0 1184 320" width="1184" height="320" style="overflow:visible;font-size:28px">${markup}</svg>`;
      }, markup);
      return overlaps(await page.evaluate((o) => window.__layoutScan(DECK.slides[0], o), options));
    };
    // a と b2 は同じ場所の違う字（同じ字を同じ場所に重ねたものは 1 つに読めるので、下で別に確かめる）
    const a = '<text x="100" y="100">重ねる字</text>', b2 = '<text x="100" y="100">別の字だ</text>';
    assert.equal((await count(a + b2)).length, 1);
    await page.evaluate(() => DECK.slides[0].querySelector('.body').setAttribute('data-overlap', 'ok'));
    assert.equal(overlaps(await page.evaluate((o) => window.__layoutScan(DECK.slides[0], o), options)).length, 1, 'HTML is not an opt-out');
    await page.evaluate(() => DECK.slides[0].querySelector('.body').removeAttribute('data-overlap'));
    for (const attr of ['data-overlap="ok"', 'data-clip', 'style="display:none"', 'style="visibility:hidden"', 'opacity="0"']) {
      assert.deepEqual(await count(a + `<g ${attr}>${b2}</g>`), [], attr);
    }
    // 塗らない字：fill は <text> 自身に書く（kit/layouts.css が fill のない <text> を --fg で塗るので、<g fill="none"> の中の字は見える）
    for (const attr of ['fill="none"', 'fill-opacity="0"', 'fill="none" stroke="none"']) {
      assert.deepEqual(await count(a + `<text ${attr} x="100" y="100">別の字だ</text>`), [], attr);
    }
    assert.equal((await count(a + `<g fill="none">${b2}</g>`)).length, 1, 'text in <g fill="none"> is painted by layouts.css');
    assert.equal((await count(a + '<text fill="none" stroke="black" x="100" y="100">別の字だ</text>')).length, 1, 'outlined text counts');
    // 同じ字を同じ場所に重ねたもの（m-collect の写し）は 1 つに読める。違う字や、ずれた同じ字は知らせる
    assert.equal((await count(a + '<text x="100" y="100">別の字だ</text>')).length, 1, 'different text at the same place');
    assert.equal((await count(a + '<text x="130" y="100">重ねる字</text>')).length, 1, 'same text shifted');
    assert.equal((await count(a + `<g data-overlap="ok">${b2}</g>` + '<text x="100" y="100">三つ目だ</text>')).length, 1, 'marked text does not hide an unmarked pair');
    assert.deepEqual(await count(a + '<text data-overlap="ok" x="100" y="100">別の字だ</text>'), []);
    assert.deepEqual(await count(a + `<g data-overlap="ok"><g data-overlap="no">${b2}</g></g>`), []);
    for (const attr of ['data-overlap', 'data-overlap=""', 'data-overlap="OK"', 'data-overlap="no"', 'data-overlap=" ok "']) {
      assert.equal((await count(a + `<g ${attr}>${b2}</g>`)).length, 1, attr);
      assert.equal((await count(a + `<text ${attr} x="100" y="100">別の字だ</text>`)).length, 1, attr);
    }
    assert.equal((await count(a + '<text x="100" y="100"><tspan data-overlap="ok">別の字だ</tspan></text>')).length, 1, 'tspan is not an opt-out');
    assert.equal((await count(a + `<svg data-overlap="ok" width="1184" height="320">${b2}</svg>`)).length, 1, 'svg is not an opt-out');
    assert.deepEqual(await count(a + '<text><tspan x="100" y="100" opacity="0">隠れた字</tspan><tspan x="500" y="100">見える字</tspan></text>'), []);
    assert.deepEqual(await count(a + '<text x="100" y="100">   </text><text></text>'), []);
    assert.deepEqual(await count(a + '<line x1="0" y1="90" x2="1000" y2="90" stroke="black"/><circle cx="130" cy="90" r="20"/>'), []);
    // 字の箱（フォントの高さ）は重なるがインクは離れている 2 行（グラフの目盛りの数字と軸の名前のような近さ）は知らせない
    assert.deepEqual(await count('<text x="100" y="100">ace</text><text x="100" y="126">mno</text>'), []);
    assert.equal((await count('<text x="100" y="100">ace</text><text x="100" y="110">mno</text>')).length, 1, 'ink that does overlap');
    assert.deepEqual(await count('<text><tspan x="100" y="50">上の行</tspan><tspan x="300" y="150">下の行</tspan></text><text x="100" y="100">行の間</text>'), []);
    assert.deepEqual(await count('<text x="100" y="100" style="white-space:pre">左          右</text><text x="165" y="100">間</text>'), []);
    await count(a);
    const x = await page.evaluate(() => DECK.slides[0].querySelector('text').getBoundingClientRect().right);
    // 箱の端の 2px は許す。スライドを縮めていない 1280px の画面で測る。
    const left = await page.evaluate(() => DECK.slides[0].getBoundingClientRect().left);
    assert.deepEqual(await count(a + `<text x="${x - left - 1}" y="100">端</text>`), []);
    // この印は重なりだけを除く。小さい字・スライドの外に出る字は引き続き知らせる。
    await count('<text data-overlap="ok" x="1200" y="100" font-size="12">枠の外</text>');
    const codes = (await page.evaluate((o) => window.__layoutScan(DECK.slides[0], o), options)).map((r) => r.code);
    assert.ok(codes.includes('svgTextOut'));
    assert.ok(codes.includes('smallSvgText'));
  });
  await t('default component demos: no SVG text overlap warnings at any settled step', async () => {
    const found = [];
    for (const c of vendorComponents().filter((c) => fs.existsSync(path.join(c.dir, 'demo.html')))) {
      await load(path.join(c.dir, 'demo.html'), 'demo-' + c.name);
      const max = await page.evaluate(() => DECK.slides.map((s) => s._max));
      for (let i = 0; i < max.length; i++) for (let k = 0; k <= max[i]; k++) {
        for (const r of overlaps(await scan(i, k))) if (r.a.svg) found.push({ component: c.name, i, k, ...r.a });
      }
    }
    assert.deepEqual(found, []);
  });
} finally { await b.close(); }
console.log(`\n${n - fail}/${n} passed`);
process.exitCode = fail ? 1 : 0;
