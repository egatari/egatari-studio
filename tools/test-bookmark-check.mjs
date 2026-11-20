// しおり（format spec §8.0）の品質チェック：同じ名前（bookmarkDup）と 20 字を超える名前（bookmarkLong）
//   node tools/test-bookmark-check.mjs [作業フォルダ]
// kit/core/bookmark.mjs の判定（字は code point で数える。20 字ちょうどは出さない。前後と続く空白は名前に入れない）、
// 編集アプリの経路（kit/core/check-source.mjs の sourceFindings）、指摘の言葉（日本語・英語）と族（C-ids）、
// コマンド版（kit/check.mjs --json）が同じスライド・重さで出すこと
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bookmarkFindings, bookmarkLength, BOOKMARK_MAX } from '../kit/core/bookmark.mjs';
import { sourceFindings } from '../kit/core/check-source.mjs';
import { message } from '../kit/check-messages.mjs';
import { ruleOfCode } from '../kit/core/check-rules.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-bookmark-check-')));
fs.mkdirSync(work, { recursive: true });

const long21 = 'あいうえおかきくけこさしすせそたちつてとな', ok20 = '😀'.repeat(20);
const slides = [['s-a', '質疑用'], ['s-b', ''], ['s-c', ' 質疑用 '], ['s-d', long21], ['s-e', ok20], ['s-f', '質疑用'], ['s-g', null], ['s-h', 'Q&amp;A']];
const deck = `<!DOCTYPE html><html lang="ja" data-theme="default"><head><meta charset="utf-8"><title>しおり</title></head><body><div id="stage">\n` +
  slides.map(([id, b]) => `<section class="slide noconcl" id="${id}"${b === null ? '' : ` data-bookmark="${b}"`}><h2>${id}</h2><div class="body"><p>x</p></div></section>`).join('\n') +
  '\n</div></body></html>\n';

assert.equal(BOOKMARK_MAX, 20);
assert.equal(bookmarkLength(ok20), 20, 'code points, not UTF-16 units');
const f = bookmarkFindings(deck).map(({ i, sev, code, a }) => ({ i, sev, code, a }));
assert.deepEqual(f, [
  { i: 0, sev: 'warn', code: 'bookmarkDup', a: { name: '質疑用', n: 3 } },
  { i: 3, sev: 'warn', code: 'bookmarkLong', a: { name: long21, n: 21 } },
]);
console.log('ok   bookmarkFindings: one duplicate finding on the first slide (spaces trimmed, empty names ignored), 21 characters warned, 20 emoji not');
const editor = sourceFindings({ deck }).filter((x) => x.code.startsWith('bookmark')).map(({ i, sev, code, a }) => ({ i, sev, code, a }));
assert.deepEqual(editor, f);
console.log('ok   the editor path (sourceFindings) gives the same findings');
assert.equal(message('ja', 'bookmarkDup', { name: '質疑用', n: 3 }), 'しおりの名前「質疑用」が 3 枚のスライドにあります。どれに飛ぶか分かるよう、名前を変えてください');
assert.equal(message('en', 'bookmarkDup', { name: 'Q&A', n: 2 }), 'The bookmark name “Q&A” is on 2 slides. Give each a different name so it is clear where it goes');
assert.equal(message('ja', 'bookmarkLong', { name: long21, n: 21 }), `しおりの名前「${long21}」は 21 字です。操作の帯に収まるよう、20 字までにしてください`);
assert.equal(message('en', 'bookmarkLong', { name: 'x', n: 25 }), 'The bookmark name “x” is 25 characters long. Keep it to 20 or fewer so it fits the control bar');
assert.equal(ruleOfCode('bookmarkDup'), 'C-ids');
assert.equal(ruleOfCode('bookmarkLong'), 'C-ids');
console.log('ok   messages (ja, en) and the checker family C-ids');

const dir = path.join(work, 'deck');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'deck.html'), deck);
const r = spawnSync(process.execPath, ['kit/check.mjs', dir, '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const out = JSON.parse(r.stdout);
const cli = (out.results || out).filter((x) => /^bookmark/.test(x.code)).map((x) => `${x.code}/${x.sev}/${x.id}`);
assert.deepEqual(cli, ['bookmarkDup/warn/s-a', 'bookmarkLong/warn/s-d'], JSON.stringify(cli));
console.log('ok   the command line (check --json) reports the same slides and severity');
console.log('all bookmark check tests ok');
