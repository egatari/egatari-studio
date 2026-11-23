// 閉じていない <script>（handoff #96）の編集アプリでの見え方
//   node tools/test-app-script-unclosed.mjs [作業用のフォルダ]
// 2 枚目のパーツのデータの <script type="application/json"> に </script> がなく、後ろの 2 枚が <script> の中の文字になった作業フォルダ（OPFS）を
// 編集アプリ（tools/build-app.mjs で組んで 127.0.0.1 で配る）で開き、日本語と英語の画面で：
//   1. 組み立ての警告（state().warn）：飲み込まれた 2 枚の節の「スライドが見つからない」は出さず、どのスライドにもない見出しの節には出す（app/main.js の swallowFree）
//   2. 品質チェックの板：scriptUnclosed のエラー（2 文の言葉）と、組み立ての警告の箱には「どこにもない見出し」だけ
//   3. AI への修正依頼（#fix-text）：</script> を書く指示は入り、飲み込まれた見出しの「スライドが見つからない」は入らない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { answerCreator } from './edit-role-answer.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { clickDlg } from './click-retry.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-app-script-unclosed-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 材料（tools/test-script-unclosed.mjs と同じ形）
const json = '{"kind":"answers","rows":[{"q":"使うデータは","before":{"text":"棚の画像","by":"[3]"},"after":"POS だけ","basis":"架空の設定"}]}';
const deck = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>閉じていない script</title></head><body><div id="stage">
<section class="slide" id="s-aaaaaa">
  <h2>欠品は売り逃しを生む</h2>
</section>

<section class="slide" id="s-bbbbbb">
  <h2>本研究の答えを並べる</h2>
  <div class="body">
    <m-contrast style="height:340px" aria-label="比較">
      <script type="application/json">
${json}
    </m-contrast>
  </div>
</section>

<section class="slide">
  <h2>なぜ POS だけを使うのか</h2>
</section>

<section class="slide">
  <h2>序論のまとめ</h2>
</section>

</div></body></html>
`;
const narration = `# 台本

## 欠品は売り逃しを生む {#s-aaaaaa}
[0] 欠品の話です。

## 本研究の答えを並べる {#s-bbbbbb}
[0] 答えを並べます。

## なぜ POS だけを使うのか
[0] POS の話です。

## 序論のまとめ
[0] まとめます。

## どこにもない見出し
[0] 合わない節です。
`;
const files = { 'deck.html': deck, 'narration.md': narration, [FORMAT.CONFIG_FILE]: JSON.stringify({ componentsCatalogue: '2' }) + '\n' };   // m-contrast は部品庫 2.x

const DIST = path.join(work, 'dist');
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'ignore' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;
const browser = answerCreator(await launch());

const NO_SLIDE = /スライドが見つからない「## ([^」]*)」/g;
const noSlide = (s) => [...String(s).matchAll(NO_SLIDE)].map((m) => m[1]);
const WORDS = {
  ja: '<script> に </script> がない。そのため後ろのスライド 2 枚（「なぜ POS だけを使うのか」「序論のまとめ」）が <script> の中の文字になり、スライドとして読めない（台本の節も結べない）。<script> の中身（JSON など）のすぐ後ろに </script> を書く',
  en: 'has no </script>. So the 2 slides after it (“なぜ POS だけを使うのか”, “序論のまとめ”) are read as script text, not as slides (and their sections in narration.md match no slide). Write </script> right after the script\'s content (the JSON)',
};

async function session(lang) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''));
    await page.waitForSelector('#drop');
    // 作業フォルダ（OPFS）として開く（組んだ 1 ファイルでは、<script> が原稿も飲み込んで、編集できる原稿のないファイルになる）
    await page.evaluate(async (files) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('su', { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle('su', { create: true });
      for (const [rel, text] of Object.entries(files)) { const w = await (await d.getFileHandle(rel, { create: true })).createWritable(); await w.write(text); await w.close(); }
      window.__dir = d;
    }, files);
    const opening = page.evaluate(() => window.__APP_TEST_OPEN(window.__dir));
    // <script> の中に入った再生器の部品が「独自のコード」に見えるので、プレビューを始める前の確かめが出る（その知らせはこの試験の外）
    await page.waitForSelector('#dlg[open] #dlg-run', { timeout: scaled(60000) });
    await clickDlg(page, '#dlg-run');
    const opened = await opening;
    ok(opened === true, `${lang}: opens the folder`);
    await page.waitForFunction(() => window.__APP_TEST.state().builds > 0, null, { timeout: scaled(60000) });
    const warn = (await page.evaluate(() => window.__APP_TEST.state().warn)).join('\n');
    ok(JSON.stringify(noSlide(warn)) === JSON.stringify(['どこにもない見出し']), `${lang}: build warnings: "slide not found" only for the unrelated heading (${JSON.stringify(noSlide(warn))})`);

    // 品質チェックの板
    await page.click('#b-check');
    await page.waitForSelector('#panel-body .sum', { timeout: scaled(60000) });
    const panel = await page.evaluate(() => ({ res: [...document.querySelectorAll('#panel-body .res.error')].map((r) => r.textContent), bw: (document.getElementById('check-buildwarn') || {}).textContent || '' }));
    ok(panel.res.some((t) => t.includes(WORDS[lang])), `${lang}: the check panel shows scriptUnclosed in two sentences (${panel.res.find((t) => t.includes('</script>')) || panel.res.join(' | ')})`);
    ok(panel.bw.includes('どこにもない見出し') && !panel.bw.includes('序論のまとめ') && !panel.bw.includes('なぜ POS'), `${lang}: the build-warning box lists only the unrelated heading (${panel.bw})`);

    // AI への修正依頼
    await page.evaluate(() => window.__APP_TEST.fixRequest());
    await page.waitForSelector('#dlg[open] #fix-text', { timeout: scaled(30000) });
    const req = await page.inputValue('#fix-text');
    ok(req.includes(WORDS[lang]), `${lang}: the fix request asks to write </script>`);
    ok(JSON.stringify(noSlide(req)) === JSON.stringify(['どこにもない見出し']), `${lang}: the fix request has "slide not found" only for the unrelated heading (${JSON.stringify(noSlide(req))})`);
  } finally { await ctx.close(); }
}
try {
  await session('ja');
  await session('en');
} finally {
  await browser.close();
  srv.close();
}
if (fails) { console.error(`test-app-script-unclosed: ${fails} failed`); process.exit(1); }
console.log('test-app-script-unclosed: all ok');
