// 組んだ HTML の見える字のうち、埋め込んだ字が持たない字を挙げる（#178 (4)、kit/core/font-coverage.mjs）
//   node tools/font-coverage.mjs <out.html | file.ega.html> [--json]
import { readRegularText, READ_LIMITS } from '../kit/bounded-read.mjs';
import { uncoveredGlyphs } from '../kit/core/font-coverage.mjs';
const file = process.argv[2];
if (!file) { console.error('usage: node tools/font-coverage.mjs <built.html> [--json]'); process.exit(2); }
const r = uncoveredGlyphs(readRegularText(file, { max: READ_LIMITS.built }).text);
if (process.argv.includes('--json')) console.log(JSON.stringify(r));
else {
  console.log(`faces: ${r.faces.length}, characters not in any embedded font: ${r.missing.length}`);
  const by = {};
  for (const m of r.missing) (by[m.where] ||= []).push(m.char);
  for (const [w, cs] of Object.entries(by)) console.log(`  ${w}: ${cs.join('')}`);
  for (const [f, cs] of Object.entries(r.byFamily)) console.log(`  not in ${f}: ${[...cs].length} (${cs.slice(0, 40)})`);
}
