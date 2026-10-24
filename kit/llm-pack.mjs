// チャットの AI への指示を組み立てて出す（kit/core/llm-pack.mjs の buildPack。編集アプリの「AI への指示を写す」と同じ文章）
//   node kit/llm-pack.mjs --series academic,info --lang ja     共通の本体 + 系列（'all' で全部、指定なしで共通の本体だけ）
//   node kit/llm-pack.mjs --plan paid [--lang ja]              有料版（すべての系列とすべての部品。--series は見ない）
//   node kit/llm-pack.mjs --list [--lang ja]                   系列・その部品・大きさ（無料版の共通の本体 + その系列。最後に有料版）。--lang がなければ en と ja の両方の列
//   node kit/llm-pack.mjs --help | -h                          使い方
import { buildPack, SERIES, membersOfSeries, packKb, PAID_ONLY } from './core/llm-pack.mjs';

const USAGE = `usage: node kit/llm-pack.mjs [--series <name,…|all>] [--lang en|ja] [--plan free|paid]
       node kit/llm-pack.mjs --list [--lang en|ja]
       node kit/llm-pack.mjs --help

Prints the instructions for a chat AI: the common body plus the series packs
(${SERIES.join(', ')}; 'all' for every pack; none: the common body only).
--lang   language of the instructions (default en)
--plan   the user's chat AI: free (default; the chosen packs) or paid (every
         pack and every part, including ${PAID_ONLY.join(', ')})
--list   lists the series, their components and the size of the common body
         with that series (KB = UTF-8 bytes / 1024), free plan, then the paid
         plan; without --lang, en and ja sizes
`;
const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((x) => x.startsWith(name + '='));
  return eq ? eq.slice(name.length + 1) : undefined;
}
if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(USAGE); process.exit(0); }
const langArg = arg('--lang');
if (langArg !== undefined && !['en', 'ja'].includes(langArg)) { console.error(`--lang must be en or ja (got ${langArg})\n\n${USAGE}`); process.exit(2); }
const planArg = arg('--plan');
if (planArg !== undefined && !['free', 'paid'].includes(planArg)) { console.error(`--plan must be free or paid (got ${planArg})\n\n${USAGE}`); process.exit(2); }
const known = new Set(['--series', '--lang', '--list', '--plan']);
const bad = argv.filter((a, i) => a.startsWith('-') && !known.has(a.split('=')[0]) && !(i > 0 && ['--series', '--lang', '--plan'].includes(argv[i - 1])));
if (bad.length) { console.error(`unknown option ${bad[0]}\n\n${USAGE}`); process.exit(2); }

if (argv.includes('--list')) {
  const langs = langArg ? [langArg] : ['en', 'ja'];
  const cols = (series) => langs.map((lang) => packKb(buildPack({ series, lang })) + ' KB').join('\t');
  console.log(['series', ...langs.map((l) => `${l} (common + series)`), 'components'].join('\t'));
  console.log(`common\t${cols([])}\t${membersOfSeries('common').join(', ')}`);
  for (const s of SERIES) console.log(`${s}\t${cols([s])}\t${membersOfSeries(s).join(', ')}`);
  console.log(`all\t${cols('all')}`);
  console.log(`paid\t${langs.map((lang) => packKb(buildPack({ lang, plan: 'paid' })) + ' KB').join('\t')}\t+ ${PAID_ONLY.join(', ')}`);
} else {
  const s = arg('--series');
  try {
    process.stdout.write(buildPack({ series: s === undefined ? [] : s, lang: langArg || 'en', plan: planArg || 'free' }));
  } catch (e) { console.error(e.message); process.exit(2); }
}
