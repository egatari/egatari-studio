// 新規作成 ③ のテーマを作る画面（「オリジナル」。app/theme-workshop.js・kit/core/theme-derive.mjs。#58 の表示の試作）の試験
//   node tools/test-app-theme-workshop.mjs [作業用のフォルダ] [--shots <フォルダ>]
// 1. 日本語・幅 1280：「オリジナル」を選ぶと画面が開き、前に選んでいたテーマ（藍）の基調色とフォントから始まる。全部通るので、確かめた結果の欄は出ない。
//    保存するまで［次へ］は押せない。基調色を入れるとプレビュー（表紙と本文。影の木の中）の色が変わる。
//    通らない色（明るい黄 #F5C000）では、結果の欄に「用語の色が読みにくい」などと「#…… にする」が出て、押すと直り、欄が消える。
//    ロゴ（SVG）から色を拾うと色のボタンが出て、押すと基調色になる。表紙の背景画像（黒い PNG）を入れると「表紙のタイトルが読みにくい」が出る。
//    名前を入れて「ZIP ファイルでダウンロード」：<名前>/tokens.css・theme.json（builder に基調色）。「テーマを保存」：自分のテーマに入り、選ぶ欄がそのテーマになり、［次へ］が押せる
// 2. 英語：選ぶ欄に「Custom」、見出し「Custom theme」、通らない色の知らせが英語
// 3. 幅 390：横にスクロールしない（--shots なら themeworks-1280.png・themeworks-390.png。通らない色を 1 つ出した状態）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { readZip, crc32 } from '../kit/core/zip-read.mjs';
import { SHAPES, BACKGROUNDS } from '../kit/core/theme-shapes.mjs';
import { CHOOSABLE } from '../kit/core/themes-list.mjs';
import { deriveTheme, themeFiles } from '../kit/core/theme-derive.mjs';
import { clickDlg } from './click-retry.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const si = argv.indexOf('--shots');
const SHOTS = si >= 0 ? path.resolve(argv.splice(si, 2)[1]) : null;
const work = path.resolve(argv[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-theme-workshop-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// 1 色の PNG（表紙の背景画像の試験用）
function png(w, h, [r, g, b]) {
  const chunk = (type, data) => { const t = Buffer.from(type, 'latin1'), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0); return Buffer.concat([len, t, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
const LOGO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#fff"/><rect x="10" y="10" width="60" height="40" fill="#0a5753"/><rect x="80" y="10" width="30" height="40" fill="#f5c000"/></svg>');

const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples', '--no-single'], { stdio: 'ignore' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const browser = await launch();
const errs = [];

async function toThemeStep(page) {
  await page.click('#w-new');
  await page.waitForSelector('#dlg[open] #paste-step-kind');
  await page.check('#paste-cat-other');
  await page.click('#paste-next-kind');
  await page.fill('#paste-title', 'theme');
  await page.click('#paste-next-content');
  await page.waitForSelector('#paste-theme', { state: 'visible' });
}
const ORIGINAL = '\u0000original';
const state = (page) => page.evaluate(() => {
  const sh = document.getElementById('theme-shop'), slides = [...sh.querySelectorAll('.shop-slide')].map((h) => h.shadowRoot);
  const cs = (r, sel, p) => { const e = r && r.querySelector(sel); return e ? getComputedStyle(e)[p] : null; };
  const checks = document.getElementById('shop-checks');
  return {
    open: !sh.hidden && sh.getBoundingClientRect().height > 0, base: sh.dataset.base, hex: document.getElementById('shop-base-hex').value, font: document.getElementById('shop-font').value,
    start: document.getElementById('shop-start').value, background: document.getElementById('shop-background').value,
    look: Object.fromEntries(['heading', 'cover', 'concl'].map((key) => [key, document.getElementById('shop-' + key).value])),
    h1: cs(slides[0], '.cover h1', 'color'), band: cs(slides[0], '.cover', 'backgroundImage'), term: cs(slides[1], '.term', 'color'), rule: cs(slides[1], 'h2', 'borderBottomColor'),
    previewW: Math.round(slides[0].host.getBoundingClientRect().width), stageW: Math.round(slides[0].querySelector('.stage').getBoundingClientRect().width),
    checksShown: !checks.hidden, ids: [...checks.querySelectorAll('.shop-check')].map((x) => x.dataset.id), msgs: [...checks.querySelectorAll('.shop-check-msg')].map((x) => x.textContent),
    fixes: [...checks.querySelectorAll('.shop-fix')].map((b) => ({ hex: b.dataset.hex, text: b.textContent, label: b.getAttribute('aria-label') })),
    next: document.getElementById('paste-next-theme').disabled, sel: document.getElementById('paste-theme').value,
  };
});
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const setHex = async (page, hex) => { await page.fill('#shop-base-hex', hex); await page.waitForFunction((h) => document.getElementById('theme-shop').dataset.base === h, hex); };
const noScroll = (page) => page.evaluate(() => { const d = document.getElementById('dlg'); return { dlg: d.scrollWidth - d.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });

async function session(lang, viewport, fn) {
  const ctx = await browser.newContext({ viewport, locale: lang === 'ja' ? 'ja-JP' : 'en-US', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${lang} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${lang} console: ${m.text()}`); });
  await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''));
  await page.waitForSelector('#drop');
  try { await fn(page); } finally { await ctx.close(); }
}

try {
  // ---------------------------------------------------------------- 1. 日本語・幅 1280
  await session('ja', { width: 1280, height: 900 }, async (page) => {
    await toThemeStep(page);
    ok(await page.isHidden('#theme-shop') && await page.$eval('#paste-theme', (s) => [...s.options].some((o) => o.textContent === 'オリジナル')), 'ja: 「オリジナル」 is a choice; the workshop is closed until chosen');
    await page.selectOption('#paste-theme', ORIGINAL);
    await page.waitForSelector('#theme-shop:not([hidden])');
    let s = await state(page);
    const d0 = deriveTheme('#1D4F91');
    ok(s.open && s.base === '#1D4F91' && s.hex === '#1D4F91' && s.font === 'gothic', 'ja: opens from the theme chosen before (藍: #1D4F91, BIZ UDPGothic) ' + JSON.stringify([s.base, s.font]));
    ok(!s.checksShown && !s.ids.length, 'ja: all checks pass, so the check area stays empty and hidden');
    ok(s.next, 'ja: Next is disabled until the theme is saved');
    ok(s.h1 && s.term === rgb(d0.term) && s.rule === rgb(d0.base), 'ja: the preview uses the starting theme colours (title, term, heading rule) ' + JSON.stringify([s.h1, s.term, s.rule]));
    ok(s.previewW > 250 && s.previewW < 440 && Math.abs(s.stageW - s.previewW) <= 2, 'ja 1280: the two previews sit side by side and the 1280 px slide is scaled to fit ' + JSON.stringify([s.previewW, s.stageW]));
    ok(s.start === 'default' && s.background === 'white' && s.look.heading === 'default', 'ja: starting theme and default styles are selected');
    ok((await page.$$eval('#shop-start option', (opts) => opts.map((o) => o.value))).join() === CHOOSABLE.map((t) => t.name).join(), 'ja: every currently choosable bundled theme is offered');
    // 撮る前に、字の読み込みが終わり、続けて 2 回撮っても同じになるまで待つ（テーマを替えた直後は字が替わる途中のことがある。CI の macOS で 2 回続けて落ちた）
    const settled = async (loc) => {
      let prev = null;
      for (let i = 0; i < 20; i++) {
        await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
        const shot = await loc.screenshot({ animations: 'disabled', caret: 'hide' });
        if (prev && prev.equals(shot)) return shot;
        prev = shot;
      }
      return prev;
    };
    // 2 つのプレビューの中のすべての要素の計算された見た目（getComputedStyle の全部の値）。テーマの CSS が同じ見た目を作るかを、描かれる時機に左右されずに比べる
    const computed = () => page.evaluate(() => [...document.querySelectorAll('.shop-slide')].map((host) => [...host.shadowRoot.querySelectorAll('*')].filter((e) => e.tagName !== 'STYLE').map((e) => {
      const cs = getComputedStyle(e), out = [e.tagName];
      for (let i = 0; i < cs.length; i++) out.push(cs[i] + ':' + cs.getPropertyValue(cs[i]));
      return out.join(';');
    })));
    const firstDiff = (a, b) => {
      for (let h = 0; h < Math.max(a.length, b.length); h++) for (let i = 0; i < Math.max((a[h] || []).length, (b[h] || []).length); i++) {
        const x = (a[h] || [])[i] || '', y = (b[h] || [])[i] || '';
        if (x !== y) { const xs = x.split(';'), ys = y.split(';'); const k = xs.findIndex((v, j) => v !== ys[j]); return { slide: h, element: i, tag: xs[0], generated: xs[k], bundled: ys[k] }; }
      }
      return null;
    };
    for (const theme of CHOOSABLE) {
      await page.selectOption('#shop-start', theme.name);
      const preview = page.locator('.shop-preview');
      const generated = await settled(preview);
      const genStyles = await computed();
      const css = fs.readFileSync(path.join(ROOT, 'themes', theme.name, 'tokens.css'), 'utf8');
      const styles = await page.evaluate((css) => [...document.querySelectorAll('.shop-slide')].map((host) => {
        const style = host.shadowRoot.querySelector('style'), original = style.textContent;
        style.textContent = original.slice(0, original.indexOf('/* preview: made with')) + css.replace(/:root\b/g, ':host');
        return original;
      }), css);
      const bundled = await settled(preview);
      const bundledStyles = await computed();
      const same = JSON.stringify(genStyles) === JSON.stringify(bundledStyles);
      ok(same, `ja: ${theme.name} starts with the same cover and body previews (every element's computed style)` + (same ? '' : ' ' + JSON.stringify(firstDiff(genStyles, bundledStyles))));
      // 画素の比べは記録だけ（字の描かれる時機で 1 画素ずれることがある。CI の macOS で default と kokugo が 1 度ずつ）
      if (!generated.equals(bundled)) console.log(`       ${theme.name}: the screenshots differ although the computed styles are ${same ? 'the same' : 'different'}`);
      await page.evaluate((styles) => [...document.querySelectorAll('.shop-slide')].forEach((host, i) => { host.shadowRoot.querySelector('style').textContent = styles[i]; }), styles);
    }
    await page.selectOption('#shop-start', 'default');
    await page.selectOption('#shop-font', 'mincho');
    await page.selectOption('#shop-background', 'off-white');
    await page.selectOption('#shop-heading', 'soft');
    await page.selectOption('#shop-cover', 'circle');
    await page.selectOption('#shop-concl', 'rounded');
    const styled = await page.evaluate(() => {
      const [cover, body] = [...document.querySelectorAll('.shop-slide')].map((h) => h.shadowRoot);
      return [getComputedStyle(body.querySelector('.stage')).fontFamily, getComputedStyle(body.querySelector('.slide')).backgroundColor,
        getComputedStyle(body.querySelector('h2')).borderRadius, getComputedStyle(cover.querySelector('.cover'), '::before').borderRadius,
        getComputedStyle(body.querySelector('.concl')).borderRadius];
    });
    ok(styled[0].includes('BIZ UDPMincho') && styled[1] === rgb('#FFFDF8') && styled.slice(2).join() === '16px,50%,36px', 'ja: font, background and all three styles immediately update the shadow previews ' + JSON.stringify(styled));
    await page.selectOption('#shop-heading', 'band');
    await setHex(page, '#F5C000');
    s = await state(page);
    ok(s.ids.includes('heading-band') && s.msgs.some((m) => m.startsWith('見出しの白い文字')), 'ja: heading band contrast has a Japanese failure message');
    await page.click('#shop-checks .shop-fix');
    ok((await state(page)).ids.length === 0, 'ja: the offered fix clears band and background failures together');
    await page.selectOption('#shop-start', 'default');
    // 基調色を変える → プレビューが変わる（通る色）
    await setHex(page, '#0A5753');
    s = await state(page);
    ok(s.term === rgb('#0A5753') && s.h1 === rgb(deriveTheme('#0A5753').title) && !s.checksShown, 'ja: a new main colour redraws the preview, still no messages ' + JSON.stringify([s.term, s.h1]));
    // 通らない色
    await setHex(page, '#F5C000');
    s = await state(page);
    ok(s.checksShown && s.ids.includes('term-contrast') && s.ids.includes('sec-contrast') && s.ids.includes('washout')
      && s.msgs[0] === '基調色の文字が白い背景の上で薄く、投影したときや教室の後ろの席から読みにくくなります。基調色を濃くしてください（コントラスト比 1.6:1。目安は 4.5:1 以上）',
    'ja #F5C000: the check area lists what fails, how much, and how to fix it ' + JSON.stringify(s.msgs));
    const fx = s.fixes[0];
    ok(fx && /^#[0-9A-F]{6}$/.test(fx.hex) && fx.text === `${fx.hex} にする` && fx.label === `基調色を ${fx.hex} にする`, 'ja: each failure offers the nearest passing colour 「#…… にする」 ' + JSON.stringify(fx));
    if (SHOTS) { await page.mouse.move(0, 0); await page.locator('#paste-step-theme').screenshot({ path: path.join(SHOTS, 'themeworks-1280.png') }); }
    await page.click('#shop-checks .shop-fix');
    await page.waitForFunction(() => document.getElementById('shop-checks').hidden);
    s = await state(page);
    ok(s.base === fx.hex && !s.checksShown, 'ja: 「#…… にする」 sets the main colour and the messages go away ' + s.base);
    // 赤に近い基調色
    await setHex(page, '#C00000');
    s = await state(page);
    ok(s.ids.includes('red-hue') && s.ids.includes('cvd') && s.msgs.some((m) => m.startsWith('用語の色と結論の色が、2 型色覚の人には見分けにくくなります')), 'ja #C00000: red-like main colour fails the colour-vision check ' + JSON.stringify(s.msgs));
    // ロゴから色を拾う
    await page.setInputFiles('#shop-logo-file', { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: LOGO });
    await page.waitForSelector('#shop-logo-colours:not([hidden]) .shop-swatch');
    const sw = await page.$$eval('#shop-logo-colours .shop-swatch', (a) => a.map((b) => ({ hex: b.dataset.hex, label: b.getAttribute('aria-label') })));
    ok(sw.length === 2 && sw[0].hex === '#0A5753' && sw[1].hex === '#F5C000' && sw[0].label === '#0A5753 を基調色にする', 'ja logo: two colours picked (most used first), white left out ' + JSON.stringify(sw));
    await page.click('#shop-logo-colours .shop-swatch');
    s = await state(page);
    ok(s.base === '#0A5753' && !s.checksShown, 'ja logo: pressing a colour makes it the main colour');
    // 詳しく：導いた色を替える・表紙の背景画像
    await page.click('#shop-more summary');
    await page.fill('#shop-h-term', '#9AB0C0');
    await page.waitForFunction(() => !document.getElementById('shop-checks').hidden);
    s = await state(page);
    ok(s.ids.includes('term-contrast') && s.msgs[0].startsWith('用語の色の文字が') && s.fixes[0] && s.fixes[0].label.startsWith('用語の色を '), 'ja More: a hand-changed term colour is checked and fixed on its own ' + JSON.stringify([s.msgs[0], s.fixes[0]]));
    await page.click('#shop-reset');
    await page.setInputFiles('#shop-cover-file', { name: 'night.png', mimeType: 'image/png', buffer: png(32, 18, [10, 10, 20]) });
    await page.waitForFunction(() => document.querySelector('#shop-checks .shop-check[data-id="cover-title"]'));
    s = await state(page);
    ok(s.ids.join() === 'cover-title' && /url\("data:image\/png;base64,/.test(s.band) && s.msgs[0].startsWith('表紙のタイトルが背景画像の上で読みにくくなります'), 'ja cover image: shown on the preview cover; a dark image fails the cover title check ' + JSON.stringify(s.msgs));
    await page.click('#shop-cover-remove');
    await page.waitForFunction(() => document.getElementById('shop-checks').hidden);
    // Exercise the generated CSS, with and without a kicker, in actual slide boxes.
    const combinations = [];
    for (const heading of Object.keys(SHAPES.heading)) for (const cover of Object.keys(SHAPES.cover)) {
      for (const concl of Object.keys(SHAPES.concl)) for (const background of Object.keys(BACKGROUNDS)) {
        const input = { base: '#1D4F91', font: 'BIZ UDPGothic', background, look: { heading, cover, concl } };
        combinations.push({ ...input, css: themeFiles(input, { name: 'geometry', results: [] })['tokens.css'] });
      }
    }
    const geometry = await page.evaluate((combinations) => {
      const root = document.querySelector('.shop-slide').shadowRoot;
      const style = document.createElement('style'), stage = document.createElement('div');
      stage.className = 'stage'; stage.style.transform = 'none';
      stage.innerHTML = '<section class="slide"><h2>Heading</h2><div class="body"><p>Body text</p></div><div class="concl"><span>Conclusion</span></div></section>'
        + '<section class="slide"><p class="kicker">Kicker</p><h2>Heading</h2><div class="body"><p>Body text</p></div><div class="concl"><span>Conclusion</span></div></section>'
        + '<section class="slide cover"><p class="venue">Venue</p><h1>Title</h1><p class="au">Author</p></section>';
      root.append(style, stage);
      const errors = [], bands = [];
      const base = root.querySelector('style').textContent.split('/* preview: made with')[0];
      for (const input of combinations) {
        style.textContent = base + input.css.replace(/:root\b/g, ':host');
        for (const slide of stage.querySelectorAll('.slide:not(.cover)')) {
          const heading = slide.querySelector('h2'), body = slide.querySelector('.body'), concl = slide.querySelector('.concl');
          // Decorative heading borders may extend into the reserved top margin. The body and conclusion allocations stay fixed.
          if (body.offsetLeft !== 48 || body.offsetTop !== 122 || body.offsetWidth !== 1184 || body.offsetHeight !== 438
            || concl.offsetTop !== 571 || concl.offsetHeight !== 72 || heading.offsetTop < 0 || heading.offsetTop + heading.offsetHeight > 122
            || heading.scrollWidth > heading.clientWidth || body.scrollHeight > body.clientHeight || concl.scrollWidth > concl.clientWidth) errors.push(input.look);
        }
        const cover = stage.querySelector('.cover'), deco = getComputedStyle(cover, '::before');
        if (['default', 'top-band', 'top-band-wide', 'bottom-band', 'left-bar'].includes(input.look.cover)) {
          const top = deco.top === 'auto' ? 720 - parseFloat(deco.bottom) - parseFloat(deco.height) : parseFloat(deco.top);
          const left = parseFloat(deco.left), width = parseFloat(deco.width), height = parseFloat(deco.height);
          for (const text of cover.querySelectorAll('.venue,h1,.au')) {
            if (text.offsetLeft < left + width && text.offsetLeft + text.offsetWidth > left && text.offsetTop < top + height && text.offsetTop + text.offsetHeight > top) bands.push(input.look.cover);
          }
        }
      }
      style.remove(); stage.remove();
      return { count: combinations.length, errors: errors.slice(0, 5), bands: bands.slice(0, 5) };
    }, combinations);
    ok(geometry.count === 588 && !geometry.errors.length, '588 shape × background combinations keep content allocations and fit without overflow ' + JSON.stringify(geometry));
    ok(!geometry.bands.length, 'current cover bands are decorative and do not intersect cover text');
    await page.selectOption('#shop-background', 'base-wash');
    await page.selectOption('#shop-font', 'maru-gothic');
    await page.selectOption('#shop-heading', 'double');
    await page.selectOption('#shop-cover', 'frame');
    await page.selectOption('#shop-concl', 'rule');
    // 保存（ZIP・自分のテーマ）
    ok(await page.isDisabled('#shop-save') && (await page.textContent('#shop-save-note')) === 'テーマの名前を入力してください', 'ja save: needs a name first');
    await page.fill('#shop-name', 'Science classes');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#shop-zip')]);
    const z = await readZip(new Uint8Array(fs.readFileSync(await dl.path())), { maxMembers: 10, maxMemberBytes: () => 1 << 22, maxTotalBytes: 1 << 23 });
    const tok = new TextDecoder().decode(z.files.get('science-classes/tokens.css') || new Uint8Array()), tj = JSON.parse(new TextDecoder().decode(z.files.get('science-classes/theme.json') || new Uint8Array()) || '{}');
    ok(dl.suggestedFilename() === 'science-classes.zip' && /--base: #0A5753;/.test(tok) && tj.extends === 'default' && tj.title === 'Science classes' && tj.builder && tj.builder.base === '#0A5753' && tj.background === 'base-wash' && tj.fontKind === 'maru-gothic'
      && tj.look.heading === 'double' && tj.look.cover === 'frame' && tj.look.concl === 'rule' && tok.includes('/* look heading: double */'),
      'ja ZIP: science-classes/tokens.css and theme.json (extends default, builder.base) ' + JSON.stringify(tj));
    await page.click('#shop-save');
    await page.waitForFunction(() => document.getElementById('paste-theme').value === 'science-classes');
    s = await state(page);
    ok(!s.next && s.open && s.sel === 'science-classes', 'ja save: the theme goes into My themes, is selected, the workshop stays open and Next works');
    // 保存したテーマを開き直したときの比べは、プレビューに入る CSS（影の木の style）で見る
    // （画素で比べると、開き直した後のスクロールの位置で字の並びが 1 画素ずれることがある）
    const previewCss = () => page.$$eval('.shop-slide', (hs) => hs.map((h) => h.shadowRoot.querySelector('style').textContent));
    const beforeReopen = await previewCss();
    await page.selectOption('#paste-theme', 'default');
    await page.selectOption('#paste-theme', 'science-classes');
    await page.selectOption('#paste-theme', ORIGINAL);
    await page.waitForSelector('#theme-shop:not([hidden])');
    s = await state(page);
    ok(s.start === 'default' && s.font === 'maru-gothic' && s.background === 'base-wash'
      && s.look.heading === 'double' && s.look.cover === 'frame' && s.look.concl === 'rule', 'ja: reopening a saved theme restores every choice');
    const afterReopen = await previewCss();
    ok(afterReopen.length === 2 && afterReopen.every((c, i) => c === beforeReopen[i]), 'ja: saved and reopened previews use the same CSS');
    await page.click('#shop-save');
    await page.waitForFunction(() => document.getElementById('paste-theme').value === 'science-classes');
    await page.click('#paste-next-theme');
    ok((await page.textContent('#paste-step-theme-answer .paste-answer-text')) === 'テーマ：Science classes', 'ja: ③ collapses to 「テーマ：Science classes」');
    await clickDlg(page, '#dlg-cancel');
  });

  // ---------------------------------------------------------------- 2. 英語
  await session('en', { width: 1280, height: 900 }, async (page) => {
    await toThemeStep(page);
    await page.selectOption('#paste-theme', ORIGINAL);
    await page.waitForSelector('#theme-shop:not([hidden])');
    ok(await page.$eval('#paste-theme', (s) => s.selectedOptions[0].textContent) === 'Custom' && (await page.textContent('#theme-shop-h')) === 'Custom theme', 'en: 「Custom」 and 「Custom theme」');
    const labels = await page.$$eval('#theme-shop .shop-inputs label', (nodes) => nodes.map((n) => n.textContent));
    ok(labels.join('|') === 'Starting theme|Main colour|Font|Background|Heading style|Cover style|Conclusion line style', 'en: every workshop field uses its English label');
    await page.selectOption('#shop-heading', 'band');
    await setHex(page, '#F5C000');
    const s = await state(page);
    ok(s.ids.includes('heading-band') && s.msgs.some((m) => m.startsWith('White heading text')), 'en: heading band contrast message is translated');
    ok(s.msgs[0] === 'Text in the main colour is faint on white and hard to read when projected or from the back of the classroom. Make the main colour darker (contrast ratio 1.6:1; guide: 4.5:1 or more)' && s.fixes[0].text === `Use ${s.fixes[0].hex}`, 'en: the message and 「Use #……」 ' + JSON.stringify([s.msgs[0], s.fixes[0]]));
    await clickDlg(page, '#dlg-cancel');
  });

  // ---------------------------------------------------------------- 3. 幅 390
  await session('ja', { width: 390, height: 844 }, async (page) => {
    await toThemeStep(page);
    await page.selectOption('#paste-theme', ORIGINAL);
    await page.waitForSelector('#theme-shop:not([hidden])');
    await setHex(page, '#00A0E9');
    const s = await state(page), wide = await noScroll(page);
    ok(s.checksShown && s.previewW > 250 && s.previewW <= 340 && wide.dlg <= 0 && wide.doc <= 0, 'ja 390: previews stack, fit the width; no horizontal scroll ' + JSON.stringify({ w: s.previewW, wide }));
    await page.click('#shop-more summary');
    const wide2 = await noScroll(page);
    ok(wide2.dlg <= 0 && wide2.doc <= 0, 'ja 390: More opened, still no horizontal scroll ' + JSON.stringify(wide2));
    await page.click('#shop-more summary');
    if (SHOTS) {
      await page.mouse.move(0, 0);
      await page.evaluate(() => { const d = document.getElementById('dlg'); d.scrollTop += document.getElementById('theme-shop').getBoundingClientRect().top - 60; });
      await page.screenshot({ path: path.join(SHOTS, 'themeworks-390.png'), fullPage: false });
    }
  });
  ok(!errs.length, 'no page errors ' + JSON.stringify(errs));
} finally { await browser.close(); srv.close(); }
console.log(fails ? `\n${fails} FAILED` : '\nOK');
process.exit(fails ? 1 : 0);
