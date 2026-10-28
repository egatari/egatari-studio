// 選べる字体（#133）の試験
//   node tools/test-fonts.mjs [作業フォルダ]
// 1. 一覧（FONT_LIST）：10 の字体（日本語 5・英語 4・等幅 1）、どれも @fontsource の包みが package.json にある
// 2. 選んだ字体だけが入る：一覧の字体をスライドの CSS で名指すと埋め込み、名指さない字体は入らない。既定の日本語の教材は Source Sans 3 を入れない
// 3. 英語の斜体：斜体で出す字があるときだけ、その太さ（400i・700i）の、その字の分割ファイルだけ。日本語の教材は強調の中のラテン文字だけ
// 3b. 本文の字体を一覧から選んだテーマ（浅葱）：BIZ UDPゴシックはその字体が持たない字だけ
// 4. 品質チェック：一覧にない字体（端末の字体）を名指したスライドに fontNotEmbedded（警告、名前を挙げる）。埋め込んだ字体・総称の字体には出ない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FONT_LIST, chosenFonts, italicText } from '../kit/core/build-core.mjs';
import { message } from '../kit/check-messages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'test-fonts-'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let n = 0, fail = 0;
const t = async (name, fn) => { n++; try { await fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); } };

const deck = (name, lang, body, theme = 'default') => {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>\n<html lang="${lang}" data-theme="${theme}">\n<head><meta charset="utf-8"><title>${name}</title></head>\n<body><div id="stage">\n<section class="slide noconcl static" id="s1"><h2>${lang === 'ja' ? '字体の見本' : 'Fonts'}</h2><div class="body">${body}</div></section>\n</div></body></html>\n`);
  fs.writeFileSync(path.join(dir, 'narration.md'), `## s1\n\n[0] ${lang === 'ja' ? '字体の見本です。' : 'Fonts.'}\n`);
  const b = spawnSync(process.execPath, ['kit/build.mjs', path.join(dir, 'deck.html')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(b.status, 0, b.stderr);
  const html = fs.readFileSync(path.join(dir, 'out', 'deck.html'), 'utf8');
  const faces = [...html.matchAll(/@font-face\{font-family:"([^"]+)";font-style:(\w+)/g)].map((m) => `${m[1]}/${m[2]}`);
  return { dir, html, faces, has: (f) => faces.includes(f) };
};
const check = (dir) => JSON.parse(spawnSync(process.execPath, ['kit/check.mjs', path.join(dir, 'deck.html'), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout);

await t('一覧：日本語 5・英語 4・等幅 1 の 10 の名前（Klee One は 400 と 600）、どれも OFL の @fontsource が package.json にある', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(FONT_LIST.map((f) => f.family), ['BIZ UDPGothic', 'BIZ UDPMincho', 'Shippori Mincho', 'Zen Maru Gothic', 'Klee One', 'Source Sans 3', 'Source Serif 4', 'Andika', 'Atkinson Hyperlegible Next', 'Source Code Pro']);
  for (const f of FONT_LIST) assert.ok(pkg.dependencies[f.pkg], f.pkg);
  assert.deepEqual(FONT_LIST.find((f) => f.family === 'Klee One').weights, [400, 600]);
});

await t('選ぶ：theme.json の fonts と CSS の名指し（既定の 3 つは数えない）。強調の中のラテン文字', () => {
  assert.deepEqual(chosenFonts('.x{font-family:"Klee One",serif} /* "Andika" */', { body: 'Zen Maru Gothic' }).map((f) => f.family).sort(), ['Klee One', 'Zen Maru Gothic']);
  assert.deepEqual(chosenFonts('--font-sans:"BIZ UDPGothic","Hiragino Sans",sans-serif'), []);
  assert.deepEqual(italicText('<p>和文<em>のみ</em></p>', '', true), { 400: '', 700: '' });
  assert.ok(italicText('<p>和文<em>Bayes</em></p>', '', true)[400].includes('B'));
  const en = italicText('<p>plain <em>soft</em> <b>bold <i>both</i></b> <span style="font-style:italic">st</span></p><h2>Head <em>Ital</em></h2>');
  assert.equal([...en[400]].sort().join(''), [...new Set('softst')].sort().join(''));
  assert.equal([...en[700]].sort().join(''), [...new Set('bothItal')].sort().join(''));
  assert.deepEqual(italicText('<p>no italics here</p>'), { 400: '', 700: '' });
});

await t('既定の日本語の教材：BIZ UDPゴシックだけ（強調の中にラテン文字がなければ Source Sans 3 も斜体も入らない）', () => {
  const r = deck('ja-plain', 'ja', '<p>ただの日本語の文と <b>ABC</b>。<em>強調</em></p>');
  assert.ok(r.has('BIZ UDPGothic/normal') && !r.faces.some((f) => f.startsWith('Source Sans 3')), r.faces.join(' '));
});

await t('日本語の教材の <em> の中のラテン文字：Source Sans 3 の斜体だけを足し、強調にその字体を当てる', () => {
  const r = deck('ja-em', 'ja', '<p>ベイズの考え方（<em>Bayes</em>）</p>');
  assert.ok(r.has('Source Sans 3/italic') && !r.has('Source Sans 3/normal'), r.faces.join(' '));
  assert.ok(r.html.includes(':is(em,i,cite){font-family:"Source Sans 3",var(--font-sans)}'));
});

await t('英語の教材：斜体のない教材は斜体を入れない。<em> があれば 400 の斜体を、その字の分割ファイル（latin）だけ。太字の中の斜体があれば 700 の斜体も', () => {
  const plain = deck('en-plain', 'en', '<p>Plain text, <b>bold</b> and more.</p>');
  assert.ok(plain.has('Source Sans 3/normal') && !plain.has('Source Sans 3/italic'), plain.faces.join(' '));
  const it = deck('en-it', 'en', '<p>Plain text and <em>italic</em>.</p>');
  const w = (r) => [...r.html.matchAll(/font-family:"Source Sans 3";font-style:italic;font-display:block;font-weight:(\d+)/g)].map((m) => m[1]);
  assert.deepEqual(w(it), ['400'], 'one face: 400 italic, the latin chunk only');
  const bi = deck('en-bi', 'en', '<p>Plain and <em>italic</em>, <b>bold <em>bold italic</em></b>.</p>');
  assert.deepEqual(w(bi).sort(), ['400', '700']);
});

await t('浅葱（本文が Zen Maru Gothic）：BIZ UDPゴシックは Zen Maru Gothic が持たない字だけ（同じ字を 2 度入れない）。既定のテーマより重くならない', () => {
  const body = '<p>丸い字の見本：ひらがな・カタカナ・漢字、ABC 123。</p>';
  const a = deck('asagi', 'ja', body, 'asagi'), d = deck('asagi-default', 'ja', body);
  assert.ok(a.has('Zen Maru Gothic/normal') && !a.has('BIZ UDPGothic/normal'), a.faces.join(' '));
  assert.ok(a.html.length <= d.html.length * 1.05, `asagi ${a.html.length} B vs default ${d.html.length} B`);
});

let rKlee = null, rSys = null;
await t('一覧の字体をスライドの CSS で名指す：その字体を埋め込む（Klee One）', () => {
  rKlee = deck('klee', 'ja', '<p style="font-family:\'Klee One\',var(--font-sans)">手書きに近い字</p>');
  assert.ok(rKlee.has('Klee One/normal'), rKlee.faces.join(' '));
  assert.ok(!rKlee.faces.some((f) => /^(Zen Maru Gothic|Shippori Mincho|Andika)\//.test(f)), 'only the chosen font');
});

await t('品質チェック：端末の字体を名指した字に fontNotEmbedded（警告・名前）。埋め込んだ字体には出ない', () => {
  rSys = deck('system', 'ja', '<p style="font-family:\'Hiragino Maru Gothic ProN\',sans-serif">端末の丸ゴ</p>');
  const a = check(rSys.dir).results.filter((x) => x.code === 'fontNotEmbedded');
  assert.equal(a.length, 1);
  assert.ok(a[0].sev === 'warn' && a[0].data.fonts.includes('Hiragino Maru Gothic ProN'), JSON.stringify(a[0]));
  assert.equal(check(rKlee.dir).results.filter((x) => x.code === 'fontNotEmbedded').length, 0);
});

await t('知らせの言葉：日本語は「端末」で、名前を挙げる（「機械」と言わない）。英語は device', () => {
  const ja = message('ja', 'fontNotEmbedded', { fonts: ['Hiragino Maru Gothic ProN'] }), en = message('en', 'fontNotEmbedded', { fonts: ['X'] });
  assert.ok(ja.startsWith('ファイルに入っていない字体です') && ja.includes('開く端末によって見え方が変わります') && ja.includes('Hiragino Maru Gothic ProN') && !ja.includes('機械'), ja);
  assert.ok(en.startsWith('This font is not embedded in the file') && en.includes('looks different on each device'), en);
});

console.log(fail ? `${fail} of ${n} failed` : `all ${n} ok`);
process.exit(fail ? 1 : 0);
