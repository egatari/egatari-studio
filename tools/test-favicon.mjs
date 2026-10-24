// test-all: unit
// 組んだデッキのタブのアイコン（backlog #59、kit/core/favicon.mjs）
//   node tools/test-favicon.mjs [作業フォルダ]
// 既定で入る／data-favicon="off" で入らない／原稿の <link rel="icon"> があれば何も足さない／持ち運べる形式・再生専用にも入る／
// 再生専用に Live の CSP を付けても img-src data: で通る／外へのリクエストがない／形と色が assets/logo と同じ／ハッシュが動かない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build, buildPortable } from '../kit/build.mjs';
import { FAVICON, faviconSvg } from '../kit/core/favicon.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-favicon-')));
fs.mkdirSync(tmp, { recursive: true });
const ok = (name, fn) => { fn(); console.log('ok   ' + name); };
const SRC = fs.readFileSync(path.join(ROOT, 'examples/minimal/deck.html'), 'utf8');
const OPEN = '<html lang="ja" data-theme="default">';
assert.ok(SRC.includes(OPEN));

const deck = (name, edit = (s) => s) => {
  const d = path.join(tmp, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'examples/minimal/narration.md'), path.join(d, 'narration.md'));
  fs.writeFileSync(path.join(d, 'deck.html'), edit(SRC));
  return path.join(d, 'deck.html');
};
const icons = (html) => [...html.matchAll(/<link\b[^>]*\brel="(?:shortcut )?icon"[^>]*>/gi)].map((m) => m[0]);
const mine = (html) => icons(html).filter((t) => /data-egatari-favicon/.test(t));
const decode = (tag) => decodeURIComponent(/href="data:image\/svg\+xml,([^"]*)"/.exec(tag)[1]);

const on = deck('on'), off = deck('off', (s) => s.replace(OPEN, '<html lang="ja" data-theme="default" data-favicon="off">'));
const own = deck('own', (s) => s.replace('</head>', '<link rel="icon" href="data:image/png;base64,iVBORw0KGgo="></head>'));
const own2 = deck('own2', (s) => s.replace('</head>', '<link rel="shortcut icon" href="data:image/png;base64,iVBORw0KGgo="></head>'));
const apple = deck('apple', (s) => s.replace('</head>', '<link rel="apple-touch-icon" href="data:image/png;base64,iVBORw0KGgo="></head>'));

const h = build(on, { subset: false }).html;
ok('build: one SVG data: icon in <head>, before the deck style', () => {
  assert.equal(mine(h).length, 1);
  assert.ok(h.indexOf('data-egatari-favicon') < h.indexOf('<style id="deck-base">'));
  assert.ok(h.indexOf('data-egatari-favicon') < h.indexOf('</head>'));
  assert.ok(/^<svg /.test(decode(mine(h)[0])));
});
ok('data-favicon="off": no icon', () => { assert.equal(icons(build(off, { subset: false }).html).length, 0); });
ok("the author's own <link rel=icon> (or shortcut icon) is kept alone", () => {
  for (const f of [own, own2]) { const t = icons(build(f, { subset: false }).html); assert.equal(t.length, 1); assert.ok(!/data-egatari-favicon/.test(t[0])); }
});
ok('an apple-touch-icon alone does not count as an icon', () => { assert.equal(mine(build(apple, { subset: false }).html).length, 1); });
ok('dev build also has it', () => { assert.equal(mine(build(on, { subset: false, dev: true }).html).length, 1); });

const port = await buildPortable(on, { subset: false });
const play = await buildPortable(on, { subset: false, playOnly: true });
ok('portable and play-only have it exactly once', () => { assert.equal(mine(port.html).length, 1); assert.equal(mine(play.html).length, 1); });
for (const [n, f] of [['off', off], ['own', own]]) {
  const p = await buildPortable(f, { subset: false }), q = await buildPortable(f, { subset: false, playOnly: true });
  ok(`${n}: portable and play-only add nothing`, () => { assert.equal(mine(p.html).length, 0); assert.equal(mine(q.html).length, 0); assert.equal(icons(q.html).length, n === 'own' ? 1 : 0); });
}

// 形と色が assets/logo と同じ
ok('shape and colours equal assets/logo/egatari-32-{light,dark}.svg', () => {
  const rd = (f) => fs.readFileSync(path.join(ROOT, 'assets/logo', f), 'utf8');
  for (const [v, c] of [['light', FAVICON.light], ['dark', FAVICON.dark]]) {
    const s = rd(`egatari-32-${v}.svg`);
    const ds = [...s.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ds, [FAVICON.bracket, FAVICON.e]);
    assert.ok(s.includes(`stroke="${c.ink}"`) && s.includes(`fill="${c.sun}"`));
    assert.ok(s.includes(`cx="${FAVICON.sun.cx}" cy="${FAVICON.sun.cy}" r="${FAVICON.sun.r}"`));
  }
  const svg = faviconSvg();
  assert.ok(svg.includes('@media (prefers-color-scheme:dark)') && svg.includes(FAVICON.dark.ink) && svg.includes(FAVICON.light.ink));
});

// CSP：Live の部屋を付けた再生専用（default-src 'none'。img-src は data: blob:）。アイコンは data: なので通る
const room = { v: 1, endpoint: 'https://live.example.org', room: 'r-7k2q6xw4', key: 'Q2xhc3Nyb29tS2V5MDAwMD', window: { from: new Date(Date.now() - 6e4).toISOString(), to: new Date(Date.now() + 36e5).toISOString() },
  activities: { '*': [{ id: 'qa', kind: 'qa' }] } };
const liveHtml = (await buildPortable(on, { subset: false, playOnly: true, live: room })).html;
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(liveHtml)?.[1].replace(/&quot;/g, '"');
ok('play-only with a Live room: CSP img-src allows data:, and the icon is a data: URI (CSP not loosened)', () => {
  assert.ok(csp && /(^|; )img-src data: blob:(;|$)/.test(csp) && csp.startsWith("default-src 'none'"));
  assert.equal(mine(liveHtml).length, 1);
  assert.ok(liveHtml.indexOf('Content-Security-Policy') < liveHtml.indexOf('data-egatari-favicon'));
  assert.ok(/ href="data:image\/svg\+xml,/.test(mine(liveHtml)[0]));
});

// ハッシュ：アイコンは組んだ後の文書にだけ入る。原稿の sourceSha256 は、原稿のファイルの hash のまま
ok('portable: the embedded source is the author\'s bytes (no icon), so sourceSha256 does not depend on the icon', () => {
  const txt = (v) => typeof v === 'string' ? v : Buffer.from(v).toString('utf8');
  assert.equal(txt(port.files['deck.html']), SRC);
  assert.ok(!/data-egatari-favicon/.test(txt(port.files['deck.html'])));
  assert.match(port.index.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(port.deckMeta.sourceSha256, port.index.sourceSha256);
  assert.ok(!/data-egatari-favicon/.test(JSON.stringify(port.index)));
});

// ブラウザ：外へのリクエストが 0（file:// の読み込みと data: だけ）。Live の CSP 付きでも CSP 違反の知らせがない
const b = await launch();
for (const [n, html] of [['built', h], ['portable', port.html], ['play-only', play.html], ['play-only+CSP', liveHtml]]) {
  const f = path.join(tmp, `probe-${n.replace(/\W/g, '')}.html`);
  fs.writeFileSync(f, html);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const reqs = [], viol = [];
  p.on('request', (r) => { const u = r.url(); if (!/^(data:|blob:|file:|about:)/.test(u)) reqs.push(u); });
  p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) viol.push(m.text()); });
  await p.goto(fileUrl(f));
  await p.waitForFunction(() => window.DECK && DECK.ready);
  const link = await p.evaluate(() => { const l = document.querySelector('link[rel~="icon"]'); return l && l.href.slice(0, 24); });
  await p.close();
  ok(`browser (${n}): icon present, no network request, no CSP violation`, () => { assert.equal(link, 'data:image/svg+xml,%3Csv'); assert.deepEqual(reqs, []); assert.deepEqual(viol, []); });
}
await b.close();
console.log('test-favicon: done');
