// チャットの AI への指示を組み立てて出す（kit/core/llm-pack.mjs の buildPack。編集アプリの「AI への指示を写す」と同じ文章）
//   node kit/llm-pack.mjs --sets stats,math --lang ja         共通の本体（標準の部品）+ 束（'all' で全部、指定なしで共通の本体だけ）
//   node kit/llm-pack.mjs --plan paid [--sets …]             有料のプラン（どの部品も詳しく。--sets all --plan paid で指示の全体）
//   node kit/llm-pack.mjs --list [--lang ja]                   束・その部品・大きさ（無料のプランの共通の本体 + その束。最後に有料のプラン）。--lang がなければ en と ja の両方の列
//   node kit/llm-pack.mjs --help | -h                          使い方
// 前の --series（系列）と --tools（道具）は 1 版のあいだ読む：系列は束に読み替え（SERIES_SETS。info は特殊になったので何も足さない）、道具は束 tools
import { buildPack, SETS, membersOfSet, packKb, BRIEF, STANDARD } from './core/llm-pack.mjs';

// 前の系列 → 束
const SERIES_SETS = { academic: ['stats', 'math'], business: ['business'], kokugo: ['kokugo'], english: ['english'], info: [], social: ['maps'], music: ['music'] };

const USAGE = `usage: node kit/llm-pack.mjs [--sets <name,…|all>] [--lang en|ja] [--plan free|paid]
       node kit/llm-pack.mjs --list [--lang en|ja]
       node kit/llm-pack.mjs --help

Prints the instructions for a chat AI: the common body (every standard part)
plus the packs of the chosen part sets (${SETS.join(', ')};
'all' for every set; none: the common body only). Extra parts are never included.
--lang   language of the instructions (default en)
--plan   the user's chat AI: free (default; the standard parts other than
         the four core ones get only their catalogue line: ${BRIEF.join(', ')})
         or paid (every part described in full)
--list   lists the part sets, their components and the size of the common
         body with that set (KB = UTF-8 bytes / 1024), free plan, then the
         paid plan; without --lang, en and ja sizes
--series, --tools  the former options, read for one version: a series is
         read as its part sets (${Object.entries(SERIES_SETS).map(([s, x]) => `${s} = ${x.join('+') || 'none'}`).join(', ')}),
         and any tool as the tools set
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
const VALUED = ['--sets', '--series', '--tools', '--lang', '--plan'];
const known = new Set([...VALUED, '--list']);
const bad = argv.filter((a, i) => a.startsWith('-') && !known.has(a.split('=')[0]) && !(i > 0 && VALUED.includes(argv[i - 1])));
if (bad.length) { console.error(`unknown option ${bad[0]}\n\n${USAGE}`); process.exit(2); }

if (argv.includes('--list')) {
  const langs = langArg ? [langArg] : ['en', 'ja'];
  const cols = (sets, plan = 'free') => langs.map((lang) => packKb(buildPack({ sets, lang, plan })) + ' KB').join('\t');
  console.log(['set', ...langs.map((l) => `${l} (free: standard + set)`), 'components'].join('\t'));
  console.log(`standard\t${cols([])}\t${membersOfSet(STANDARD).join(', ')}`);
  for (const s of SETS) console.log(`${s}\t${cols([s])}\t${membersOfSet(s).join(', ')}`);
  console.log(`all\t${cols('all')}`);
  console.log(`paid standard\t${cols([], 'paid')}`);
  console.log(`paid all\t${cols('all', 'paid')}`);
} else {
  try {
    let sets = arg('--sets');
    const series = arg('--series'), tools = arg('--tools');
    if (series !== undefined || tools !== undefined) {
      const want = new Set(sets === 'all' ? SETS : String(sets || '').split(',').map((x) => x.trim()).filter(Boolean));
      if (series === 'all') SETS.forEach((s) => want.add(s));
      else for (const s of String(series || '').split(',').map((x) => x.trim()).filter(Boolean)) {
        if (!SERIES_SETS[s]) throw new Error(`unknown series "${s}" (known: ${Object.keys(SERIES_SETS).join(', ')}); use --sets (${SETS.join(', ')})`);
        SERIES_SETS[s].forEach((x) => want.add(x));
      }
      if (tools !== undefined && String(tools).trim()) want.add('tools');
      console.error(`note: --series and --tools are read as --sets ${[...want].join(',') || '(none)'}`);
      sets = [...want];
    }
    process.stdout.write(buildPack({ sets: sets === undefined ? [] : sets, lang: langArg || 'en', plan: planArg || 'free' }));
  } catch (e) { console.error(e.message); process.exit(2); }
}
