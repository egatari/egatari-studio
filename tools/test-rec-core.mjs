// test-all: unit
// 録音モード（app/rec-mode.js）の cue の置き方（kit/core/audio-core.mjs の cuesFromTaps・takeEntry の sync）の確認（ブラウザなし）
//   node tools/test-rec-core.mjs
// C を押した数が区切りの数と合えば sync manual（前を削った分を引いて [0, dur] に収める）、合わなければ・前後すれば・区切りがなければ sync none
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cuesFromTaps, takeEntry } from '../kit/core/audio-core.mjs';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let r = cuesFromTaps([1.2, 2.5, 4.0], 3, { head: 0.2, dur: 5 });
ok(r.sync === 'manual' && eq(r.cues, [1, 2.3, 3.8]), 'taps = bounds: manual, the trimmed head is subtracted ' + JSON.stringify(r));
r = cuesFromTaps([0.1, 6], 2, { head: 0.5, dur: 5 });
ok(r.sync === 'manual' && eq(r.cues, [0, 5]), 'cues are kept inside [0, dur]');
r = cuesFromTaps([1, 2], 3, { head: 0, dur: 5 });
ok(r.sync === 'none' && r.cues === null && r.taps === 2, 'fewer taps than bounds: sync none, no cues');
r = cuesFromTaps([1, 2, 3, 4], 3, { head: 0, dur: 5 });
ok(r.sync === 'none' && r.cues === null && r.taps === 4, 'more taps than bounds: sync none');
r = cuesFromTaps([2, 1], 2, { head: 0, dur: 5 });
ok(r.sync === 'none', 'out-of-order taps: sync none');
r = cuesFromTaps([], 0, { head: 0, dur: 5 });
ok(r.sync === 'none' && r.cues === null, 'no bounds: sync none');
r = cuesFromTaps([1], 0, { head: 0, dur: 5 });
ok(r.sync === 'none' && r.taps === 1, 'taps but no bounds: sync none');
r = cuesFromTaps([NaN, 1], 2, { head: 0, dur: 5 });
ok(r.sync === 'none', 'non-finite taps are dropped (then the count does not match)');

const base = { file: 'rec_x.mp3', dur: 3, kind: 'recorded', inputHash: 'h' };
let e = takeEntry({ ...base, cues: [1, 2], sync: 'manual' });
ok(e.sync === 'manual' && eq(e.cues, [1, 2]) && e.kind === 'recorded', 'takeEntry: recorded with sync manual keeps the cues');
e = takeEntry({ ...base, cues: null });
ok(e.sync === 'none' && eq(e.cues, []), 'takeEntry: no cues is sync none (as before)');
e = takeEntry({ ...base, cues: [1], sync: null });
ok(e.sync === 'auto', 'takeEntry: cues without sync stay auto (TTS)');
e = takeEntry({ ...base, cues: null, sync: 'manual' });
ok(e.sync === 'none', 'takeEntry: manual without cues falls back to none');

// 画面の言葉（app/i18n.js の rec）：日本語と英語で同じ項目があること
{
  const src = fs.readFileSync(fileURLToPath(new URL('../app/i18n.js', import.meta.url)), 'utf8');
  const blocks = [...src.matchAll(/\n  rec: \{\n([\s\S]*?)\n  \},/g)].map((m) => m[1]);
  const strip = (b) => b.replace(/'(?:[^'\\\\]|\\\\.)*'/g, "''").replace(/`[^`]*`/g, '``');
  const keys = (b) => [...strip(b).matchAll(/(?:^|[\s,{])(\w+): /gm)].map((m) => m[1]).sort().join(',');
  ok(blocks.length === 2, 'i18n: the rec strings exist in ja and en');
  if (blocks.length === 2) ok(keys(blocks[0]) === keys(blocks[1]), 'i18n: ja and en have the same rec keys');
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
