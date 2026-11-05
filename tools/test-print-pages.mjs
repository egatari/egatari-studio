// 印刷の PDF のページ数がスライド数ちょうどであること（backlog #162：#deck-live（sr-only）が
// test-all: platform（--platform でも走らせる：印刷の pdf（OS ごとの印刷））
// 舞台の下に絶対配置で残り、改ページの後ろにもう 1 ページ（空白）を作っていた）
//   node tools/test-print-pages.mjs [作業フォルダ]
// 見ること：examples/minimal（6 枚）と examples/tmlr2026-calibration（14 枚）を組み、print の媒体で
//   page.pdf() を作り、PDF のバイト列を数えて「/Type /Page」の数（「/Type /Pages」は除く）がスライド数と一致すること
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from '../kit/build.mjs';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'motion-print-pages-')));
fs.mkdirSync(tmp, { recursive: true });

// PDF のバイト列から「/Type /Page」のオブジェクトを数える（「/Type /Pages」は含めない）
function countPdfPages(buf) {
  const s = buf.toString('latin1');
  const m = s.match(/\/Type\s*\/Page(?!s)\b/g);
  return m ? m.length : 0;
}

let n = 0;
const ok = (name) => { n++; console.log('ok   ' + name); };
const b = await launch();

async function checkDeck(label, deckHtml) {
  const out = path.join(tmp, label, 'built.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, build(deckHtml, { subset: false }).html);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(fileUrl(out));
  await p.waitForFunction(() => window.DECK && DECK.ready);
  await p.evaluate(() => document.fonts.ready);
  const nSlides = await p.evaluate(() => document.querySelectorAll('.slide').length);
  await p.emulateMedia({ media: 'print' });
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const pdf = path.join(tmp, label, 'print.pdf');
  await p.pdf({ path: pdf, width: '1280px', height: '720px', preferCSSPageSize: true, printBackground: false });
  await p.close();
  const nPages = countPdfPages(fs.readFileSync(pdf));
  assert.equal(nPages, nSlides, label + ': pdf page count (' + nPages + ') should equal slide count (' + nSlides + ') — a stray page means something (e.g. #deck-live) still lands after the last slide');
  ok(label + ': ' + nSlides + ' slides -> ' + nPages + ' pdf pages');
}

await checkDeck('minimal', path.join(ROOT, 'examples/minimal/deck.html'));
await checkDeck('tmlr2026-calibration', path.join(ROOT, 'examples/tmlr2026-calibration/deck.html'));

await b.close();
console.log(`${n} checks passed`);
