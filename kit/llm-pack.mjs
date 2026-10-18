// チャットの AI への指示を組み立てて出す（kit/core/llm-pack.mjs の buildPack。編集アプリの「AI への指示を写す」と同じ文章）
//   node kit/llm-pack.mjs --series academic,info --lang ja     共通の本体 + 系列（'all' で全部、指定なしで共通の本体だけ）
//   node kit/llm-pack.mjs --list [--lang ja]                   系列・その部品・大きさ（共通の本体 + その系列）
import { buildPack, SERIES, membersOfSeries, packSize } from './core/llm-pack.mjs';

function arg(name) {
  const a = process.argv.slice(2);
  const i = a.indexOf(name);
  if (i >= 0) return a[i + 1];
  const eq = a.find((x) => x.startsWith(name + '='));
  return eq ? eq.slice(name.length + 1) : undefined;
}
const lang = arg('--lang') || 'en';
if (!['en', 'ja'].includes(lang)) { console.error(`--lang must be en or ja (got ${lang})`); process.exit(2); }
const kb = (s) => (packSize(s) / 1024).toFixed(1) + ' KB';

if (process.argv.includes('--list')) {
  const base = buildPack({ series: [], lang });
  console.log(`common\t${kb(base)}\t${membersOfSeries('common').join(', ')}`);
  for (const s of SERIES) console.log(`${s}\t${kb(buildPack({ series: [s], lang }))}\t${membersOfSeries(s).join(', ')}`);
  console.log(`all\t${kb(buildPack({ series: 'all', lang }))}`);
} else {
  const s = arg('--series');
  try {
    process.stdout.write(buildPack({ series: s === undefined ? [] : s, lang }));
  } catch (e) { console.error(e.message); process.exit(2); }
}
