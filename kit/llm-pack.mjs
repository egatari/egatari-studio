// チャットの AI への指示を組み立てて出す（kit/core/llm-pack.mjs の buildPack。編集アプリの「AI への指示を写す」と同じ文章）
//   node kit/llm-pack.mjs --sets stats,math --lang ja         共通の本体（標準の部品）+ 束（'all' で全部、指定なしで共通の本体だけ）
//   node kit/llm-pack.mjs --plan paid [--sets …]             有料のプラン（どの部品も詳しく。--sets all --plan paid で指示の全体）
//   node kit/llm-pack.mjs --no-fit [--sets …]                無料のプランで目安に収めない（下の fit をしない。比べる・調べる用）
//   node kit/llm-pack.mjs --from-sample <名前> [--request <文|ファイル>] [--plan …] [--lang …]
//                                                            「このサンプルを参考に作る」で ② を書いて ④ で写す指示と同じバイト（backlog #130。kit/core/new-deck-pack.mjs の fromSamplePack）：
//                                                            examples/<名前>/sample.json の場面・テーマ・パーツ（外す候補にしない）と構成。--request の 1 行目は ② のタイトル、残りは内容（なければ空）。
//                                                            無料のプランも有料のプランも、目安に収めた後（［候補を外す］を押した後と同じ）。サンプルのパーツは詳しく書き、
//                                                            越えたら ① ほかの中核の 4 つを短く → ② サンプルにない専門のパーツを外す → ③ 最後にサンプルのパーツを短く（fitSample）
//   node kit/llm-pack.mjs --list [--lang ja]                   束・その部品・大きさ（無料のプランは収めた大きさと収める前の大きさ。最後に有料のプラン）
//   node kit/llm-pack.mjs --help | -h                          使い方
// 無料のプランは、編集アプリの新規作成と同じに目安（PACK_CAP_KB.free と、貼り付けの長さ FREE_PASTE_UNITS の近いほう。fitSize）に収める（kit/core/llm-pack.mjs の fitPack。backlog #125）：
//   越えたら中核の 4 つの説明を短くし、それでも越えれば専門のパーツを大きい順に外す。短くした・外したときは、何をなぜしたかを stderr に出す
//   （黙って外さない。毎晩の評価・スキルが無料のプランで使う指示が、利用者が編集アプリで貼るものと同じになるように）。生の指示は --no-fit
// 前の --series（系列）と --tools（道具）は 1 版のあいだ読む：系列は束に読み替え（SERIES_SETS。info は特殊になったので何も足さない）、道具は束 tools
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromSamplePack, sampleProblems } from './core/new-deck-pack.mjs';
import { readRegularText, READ_LIMITS } from './bounded-read.mjs';
import { buildPack, SETS, membersOfSet, packKb, kbOf, packSize, BRIEF, STANDARD, FREE_CORE, PACK_CAP_KB, FREE_PASTE_UNITS, pasteUnits, fitSize, loadedParts, partsPackOpts, fitPack, normalizeSets, SINGLE_SET_DROP_ORDER } from './core/llm-pack.mjs';

// 前の系列 → 束
const SERIES_SETS = { academic: ['stats', 'math'], business: ['business'], kokugo: ['kokugo'], english: ['english'], info: [], social: ['maps'], music: ['music'] };

const USAGE = `usage: node kit/llm-pack.mjs [--sets <name,…|all>] [--lang en|ja] [--plan free|paid] [--no-fit]
       node kit/llm-pack.mjs --from-sample <name> [--request <text|file>] [--lang en|ja] [--plan free|paid]
       node kit/llm-pack.mjs --list [--lang en|ja]
       node kit/llm-pack.mjs --help

Prints the instructions for a chat AI: the common body (every standard part)
plus the packs of the chosen part sets (${SETS.join(', ')};
'all' for every set; none: the common body only). Extra parts are never included.
--lang   language of the instructions (default en)
--plan   the user's chat AI: free (default; the standard parts other than
         the four core ones get only their catalogue line: ${BRIEF.join(', ')})
         or paid (every part described in full)
         On the free plan the pack is fitted to ${PACK_CAP_KB.free} KB and to a paste
         length of ${FREE_PASTE_UNITS} (UTF-16 code units + line feeds), as the editor's New… does:
         over the limit, the core four (${FREE_CORE.join(', ')}) get only their
         catalogue line too; if still over, with one part set the standard
         parts outside the core four are left out in a fixed order
         (${SINGLE_SET_DROP_ORDER.filter((t) => !FREE_CORE.includes(t)).join(', ')}),
         never the set's own parts; with two or more sets, specialized parts
         are left out, largest first. stderr says what was shortened or left out
--no-fit the free-plan pack as assembled, without fitting it to the limit
--from-sample  exactly what the editor copies in New… after “Make one based on
         this sample” (examples/<name>/sample.json): its setting, theme and parts (never
         suggested for unticking, described in full), plus its structure; fitted to
         the plan as after “Untick these”: over the limit, first the core parts the
         sample does not use are shortened, then specialized parts it does not use
         are left out, and only then its own parts are shortened. --request: the
         first line is the title of step 2, the rest its content (a file name
         reads that file; none: step 2 left empty)
--list   lists the part sets, their components and the size of the common
         body with that set (KB = UTF-8 bytes / 1024; the free plan fitted
         also shows its paste length): the free plan fitted,
         then before fitting, then the paid plan; without --lang, en and ja
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
const VALUED = ['--sets', '--series', '--tools', '--lang', '--plan', '--from-sample', '--request'];
const known = new Set([...VALUED, '--list', '--no-fit']);
const bad = argv.filter((a, i) => a.startsWith('-') && !known.has(a.split('=')[0]) && !(i > 0 && VALUED.includes(argv[i - 1])));
if (bad.length) { console.error(`unknown option ${bad[0]}\n\n${USAGE}`); process.exit(2); }

// 無料のプランの指示を目安に収める（編集アプリと同じ fitPack。頼みたいことは記入欄のまま）→ {text, fit}
function fittedPack(sets, lang) {
  const sizeOf = (tags, short) => fitSize(buildPack({ ...partsPackOpts(tags, 'free', { short }), lang }), 'free');
  const fit = fitPack(loadedParts(sets), 'free', { sizeOf, capBytes: PACK_CAP_KB.free * 1024 });
  return { text: buildPack({ ...partsPackOpts(fit.tags, 'free', { short: fit.short }), lang }), fit };
}

// 「このサンプルを参考に作る」の指示（編集アプリの新規作成 ④ と同じ組み立て）
function samplePack(name, lang, plan) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`--from-sample: not a sample name: ${name}`);
  const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'examples', name);
  const file = path.join(dir, 'sample.json');
  if (!fs.existsSync(file)) throw new Error(`--from-sample: ${file} not found`);
  const obj = JSON.parse(readRegularText(file, { max: READ_LIMITS.json }).text);
  const errs = sampleProblems(obj);
  if (errs.length) throw new Error(`--from-sample: ${file}: ${errs.map((e) => `${e.path || '(root)'} ${e.code}`).join(', ')}`);
  // サンプルの題名：原稿の <title>（編集アプリのサンプルの一覧と同じ）
  const m = readRegularText(path.join(dir, 'deck.html'), { max: READ_LIMITS.source }).text.match(/<title>([^<]*)<\/title>/);
  const title = m ? m[1].trim() : name;
  let req = arg('--request');
  if (req !== undefined && req !== '' && fs.existsSync(req) && fs.statSync(req).isFile()) req = readRegularText(req, { max: READ_LIMITS.json }).text;
  const lines = String(req || '').replace(/\r\n?/g, '\n').split('\n');
  const at = lines.findIndex((l) => l.trim());
  const second = at < 0 ? {} : { title: lines[at].trim(), content: lines.slice(at + 1).join('\n').trim() };
  return fromSamplePack({ sample: { ...obj, title, name }, lang, plan, second });
}

if (argv.includes('--from-sample')) {
  try {
    if (argv.includes('--no-fit') || arg('--sets') !== undefined || argv.includes('--list')) throw new Error('--from-sample cannot be used with --sets, --list or --no-fit');
    const lang = langArg || 'en', plan = planArg || 'free';
    const r = samplePack(String(arg('--from-sample') || ''), lang, plan);
    // 収め方（kit/core/llm-pack-assemble.mjs の fitSample）：サンプルのパーツは詳しいまま。① ほかの中核の 4 つを短く → ② サンプルにない専門のパーツを外す → ③ 最後にサンプルのパーツを短く
    if (r.shortened.length) console.error(`note: free plan: over ${PACK_CAP_KB.free} KB or a paste length of ${FREE_PASTE_UNITS}, so these core parts the sample does not use get only their catalogue line: ${r.shortened.join(', ')} (the sample's own parts stay in full)`);
    if (r.dropped.length) console.error(`note: ${plan} plan: still over the limit, so these specialized parts the sample does not use were left out, largest first: ${r.dropped.join(', ')} (the sample's own parts stay)`);
    if (r.ownShortened.length) console.error(`note: free plan: still over the limit with nothing else to leave out, so these parts of the sample get only their catalogue line too: ${r.ownShortened.join(', ')}`);
    if (r.over) console.error(`warning: ${plan} plan: ${kbOf(r.bytes)} KB is still over the limit`);
    process.stdout.write(r.text);
  } catch (e) { console.error(e.message); process.exit(2); }
} else if (argv.includes('--list')) {
  const langs = langArg ? [langArg] : ['en', 'ja'];
  const cols = (f) => langs.map((lang) => f(lang)).join('\t');
  const fitted = (sets) => cols((lang) => { const { text, fit } = fittedPack(sets, lang); return packKb(text) + ' KB, ' + pasteUnits(text) + ' paste' + (fit.dropped.length ? ` (core four shortened; left out ${fit.dropped.join(', ')})` : fit.short ? ' (core four shortened)' : ''); });
  const raw = (sets, plan = 'free') => cols((lang) => packKb(buildPack({ sets, lang, plan })) + ' KB');
  console.log(['set', ...langs.map((l) => `${l} free, fitted to ${PACK_CAP_KB.free} KB and ${FREE_PASTE_UNITS} paste`), ...langs.map((l) => `${l} free, before fitting`), 'components'].join('\t'));
  console.log(`${STANDARD}\t${fitted([])}\t${raw([])}\t${membersOfSet(STANDARD).join(', ')}`);
  for (const s of SETS) console.log(`${s}\t${fitted([s])}\t${raw([s])}\t${membersOfSet(s).join(', ')}`);
  console.log(`all\t${fitted('all')}\t${raw('all')}`);
  console.log(['', ...langs.map((l) => `${l} paid (cap ${PACK_CAP_KB.paid} KB)`)].join('\t'));
  console.log(`paid standard\t${raw([], 'paid')}`);
  // 有料のプランのすべての束（いちばん大きいとき）は上限を越えても知らせるだけ（npm run gen は止めない）
  console.log(`paid all\t${cols((lang) => { const b = packSize(buildPack({ sets: 'all', lang, plan: 'paid' })); return kbOf(b) + ' KB' + (b > PACK_CAP_KB.paid * 1024 ? ` (over ${PACK_CAP_KB.paid} KB: every set at once, a warning only)` : ''); })}`);
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
    sets = sets === undefined ? [] : sets;
    const lang = langArg || 'en', plan = planArg || 'free';
    if (plan === 'paid' || argv.includes('--no-fit')) process.stdout.write(buildPack({ sets, lang, plan }));
    else {
      const { text, fit } = fittedPack(sets, lang);
      const limit = `${PACK_CAP_KB.free} KB or a paste length of ${FREE_PASTE_UNITS} (UTF-16 code units + line feeds)`;
      if (fit.short) console.error(`note: free plan: over ${limit}, so the core four (${FREE_CORE.join(', ')}) get only their catalogue line too (--no-fit for the pack as assembled)`);
      // 束が 1 つなら中核の 4 つのほかの標準のパーツを決まった順に、2 つ以上なら専門のパーツを大きい順に（kit/core/llm-pack-assemble.mjs の fitPlan）
      if (fit.dropped.length) console.error(normalizeSets(sets).length === 1
        ? `note: free plan: still over ${limit}, so these standard parts were left out, in the fixed order: ${fit.dropped.join(', ')} (the ${normalizeSets(sets)[0]} parts and the core four are kept; --no-fit keeps them all)`
        : `note: free plan: still over ${limit}, so these specialized parts were left out, largest first: ${fit.dropped.join(', ')} (--no-fit keeps them)`);
      if (fit.over) console.error(`warning: free plan: ${kbOf(packSize(text))} KB, paste length ${pasteUnits(text)}, is still over ${limit}`);
      process.stdout.write(text);
    }
  } catch (e) { console.error(e.message); process.exit(2); }
}
