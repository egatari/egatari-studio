// コンタクトシート（tools/sheet.mjs）の確認：node tools/test-sheet.mjs [作業用のフォルダ]
// examples/minimal（6 枚）をフォルダと組んだ HTML の両方から撮り、画像があるか・大きさが格子の計算と合うか・枚数が合うか・--tiles の枚数を見る
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { sheet, gridSize } from './sheet.mjs';
import { build } from '../kit/build.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'motion-sheet'));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const dims = (f) => { const b = fs.readFileSync(f); return b.subarray(0, 8).toString('latin1') === '\x89PNG\r\n\x1a\n' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; };

const deck = path.join(ROOT, 'examples/minimal');
const N = 6;
const r = await sheet(deck, { out: path.join(work, 'a.png'), cols: 3, width: 320, tiles: true });
const g = gridSize(N, 3, 320), d = dims(r.out);
ok(r.count === N, `slide count ${r.count} = ${N}`);
ok(d && d.w === g.width && d.h === g.height, `size ${d && d.w}×${d && d.h} = grid ${g.width}×${g.height} (3 cols × 2 rows)`);
const tiles = fs.readdirSync(r.tilesDir).filter((f) => /^\d\d\.png$/.test(f));
ok(tiles.length === N && dims(path.join(r.tilesDir, tiles[0])).w === 1280 && dims(path.join(r.tilesDir, tiles[0])).h === 720, `${tiles.length} tiles of 1280×720`);

// 組んだ HTML をそのまま（既定の列・幅）
const built = path.join(work, 'built.html');
fs.writeFileSync(built, build(path.join(deck, 'deck.html'), {}).html);
const r2 = await sheet(built, { out: path.join(work, 'b.png') });
const g2 = gridSize(N, 4, 640), d2 = dims(r2.out);
ok(r2.count === N && d2 && d2.w === g2.width && d2.h === g2.height, `built.html: ${r2.count} slides, ${d2 && d2.w}×${d2 && d2.h} = ${g2.width}×${g2.height}`);

ok(r.labels[1].startsWith('2 · ') && r.labels[1].includes('何を最小化するか'), `label has number and heading: ${r.labels[1]}`);
ok(r.labels.every((l, i) => l.startsWith(`${i + 1} · `) && l.length > 4 && !/\n/.test(l)), 'every label is "n · … heading" on one line');
ok(r.labels.every((l) => !/ · [^·]{14,}$/.test(l) || /…$/.test(l)), 'long headings are cut at 12 characters with …');

// CLI：出力の場所と枚数を印字する
const o = execFileSync('node', [path.join(ROOT, 'tools/sheet.mjs'), built, path.join(work, 'c.png'), '--cols', '2', '--width', '400'], { encoding: 'utf8' });
ok(o.includes(path.join(work, 'c.png')) && o.includes(`${N} slides`), 'CLI prints the path and the count');
ok(gridSize(2, 4, 640).cols === 2, 'fewer slides than columns shrinks the grid');
process.exit(fails ? 1 : 0);
