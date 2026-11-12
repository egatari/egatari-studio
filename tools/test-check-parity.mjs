// 品質チェックのコマンド版（kit/check.mjs）と編集アプリの品質チェックが同じ指摘を出すこと（v0.6.9）
//   node tools/test-check-parity.mjs [作業用のフォルダ]
// 見本（tools/fixtures/check-parity）：en-rawmath（英語の教材に $…$ の数式が 4 枚残る。持ち主の報告：コマンド版は rawMath のエラーと R-formula の警告を出すのに、
// 編集アプリの品質チェックは何も出さなかった）と ja-mix（です・ます・句読点の混在・旧来の鍵・data-steps・モーフの相手がない・答えが数と同時に開く m-predict・答えが出ない m-predict）。
// 0. 静的な棚卸し：MESSAGES のどの code も IN_EDITOR・CLI_ONLY（CLI_ONLY_PREFIX）・EDITOR_ALIAS と BUILD_WARN の行き先のちょうど 1 つに入る。
//    一覧が MESSAGES にない code を名指さない。IN_EDITOR の code は編集アプリの道筋のファイルに文字列として現れる（見本が出さない code も見る）
// 1. コマンド版を --json で走らせ、見本が狙った code を出すこと
// 2. 編集アプリ（tools/build-app.mjs で組み、127.0.0.1 で配る）で同じ見本を作業フォルダ（OPFS）として開き、品質チェックの結果（app/main.js の checkResults：
//    プレビューの答え＋原稿の文字列からの指摘＋組み立ての警告）を集める
// 3. コマンド版の code はどれも編集アプリにもある。ないものは kit/core/check-parity.mjs の CLI_ONLY（わけを 1 行）に書いたものだけ
// 4. 編集アプリの言葉はコマンド版と同じ（kit/check-messages.mjs）。rawMath は板に出て、修正依頼（kit/core/llm-fix.mjs）に R-math と一緒に入る
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shareBrowser, launch } from '../kit/browser.mjs';
import { message, MESSAGES } from '../kit/check-messages.mjs';
import { IN_EDITOR, CLI_ONLY, CLI_ONLY_PREFIX, EDITOR_ALIAS, BUILD_WARN, cliOnly } from '../kit/core/check-parity.mjs';
import { scaled } from './wait-scale.mjs';
import { silentWav } from './portable-fixtures.mjs';
// ブラウザは 1 つだけ起動し、子のプロセス（kit/check.mjs）の launch() はそこにつなぐ（kit/browser.mjs の shareBrowser）
await shareBrowser();

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-check-parity-')));
fs.mkdirSync(work, { recursive: true });
const DIST = path.join(work, 'dist');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };

const FIX = path.join(ROOT, 'tools', 'fixtures', 'check-parity');
// en-stale：en-rawmath の写しに、今の台本から作っていない音声（inputHash が null）を 1 つ足したもの（audioStale。作業用のフォルダに作る）
const STALE = path.join(work, 'en-stale');
fs.rmSync(STALE, { recursive: true, force: true });
fs.cpSync(path.join(FIX, 'en-rawmath'), STALE, { recursive: true });
fs.mkdirSync(path.join(STALE, 'audio'), { recursive: true });
fs.writeFileSync(path.join(STALE, 'audio', 'a.wav'), silentWav(1));
fs.writeFileSync(path.join(STALE, 'audio', 'manifest.json'), JSON.stringify({ segments: { 's-attn:0': { file: 'a.wav', dur: 1, inputHash: null } } }));
const FIXTURES = [{ name: 'en-rawmath', lang: 'en' }, { name: 'ja-mix', lang: 'ja' }, { name: 'ja-flow', lang: 'ja' }, { name: 'en-stale', lang: 'en', dir: STALE }];
const dirOf = (f) => f.dir || path.join(FIX, f.name);
// 見本が出すはずの code（見本を直して減ったら気づくように）
const WANT = {
  'en-rawmath': ['rawMath', 'narrFormula', 'narrNote', 'narrOrphan', 'narrMissing', 'markMissing', 'imgAlt', 'svgName', 'linkUnknown', 'linkNumber', 'linkStepRange', 'linkCount', 'legacyColorClass', 'colorOutside'],
  'en-stale': ['audioStale', 'rawMath'],
  'ja-flow': ['compLayout'],
  'ja-mix': ['desuMasu', 'punctMixed', 'legacyDataKey', 'legacyIndex', 'legacyStepAttr', 'morphNoSrc', 'build', 'narrMissing', 'predictAnswerWithCount', 'predictAnswerNeverShown'],
};

// ---------------------------------------------------------------- 0. 許す一覧そのもの
ok(Object.keys(CLI_ONLY).every((c) => MESSAGES[c]) && Object.values(CLI_ONLY).every((w) => typeof w === 'string' && w.length > 10 && !w.includes('\n')),
  'allowlist: every CLI_ONLY entry is a known check code with a one-line reason');
ok(Object.keys(CLI_ONLY_PREFIX).every((p) => Object.keys(MESSAGES).some((c) => c.startsWith(p))) && cliOnly('attachForbidden') && cliOnly('articleXref') && !cliOnly('rawMath') && !cliOnly('attach'),
  'allowlist: the prefix entries match real codes (attach…, article…) and nothing else');

{
  const codes = Object.keys(MESSAGES);
  const classes = (c) => [
    IN_EDITOR.includes(c) && 'IN_EDITOR',
    Object.hasOwn(CLI_ONLY, c) && 'CLI_ONLY',
    !Object.hasOwn(CLI_ONLY, c) && cliOnly(c) && 'CLI_ONLY_PREFIX',
    Object.values(EDITOR_ALIAS).includes(c) && 'EDITOR_ALIAS',
    Object.hasOwn(BUILD_WARN, c) && 'BUILD_WARN',
  ].filter(Boolean);
  const none = codes.filter((c) => classes(c).length === 0), twice = codes.filter((c) => classes(c).length > 1).map((c) => `${c} (${classes(c).join(' + ')})`);
  const dupIn = IN_EDITOR.filter((c, k) => IN_EDITOR.indexOf(c) !== k);
  ok(!none.length, `inventory: every MESSAGES code (${codes.length}) is classified` + (none.length ? ': unclassified ' + none.join(', ') : ''));
  ok(!twice.length && !dupIn.length, 'inventory: no code is classified twice' + (twice.length || dupIn.length ? ': ' + [...twice, ...dupIn.map((c) => c + ' (IN_EDITOR twice)')].join(', ') : ''));
  const known = (c) => Object.hasOwn(MESSAGES, c);
  const stray = [...IN_EDITOR.filter((c) => !known(c)).map((c) => 'IN_EDITOR ' + c), ...Object.keys(CLI_ONLY).filter((c) => !known(c)).map((c) => 'CLI_ONLY ' + c),
    ...Object.values(EDITOR_ALIAS).filter((c) => !known(c)).map((c) => 'EDITOR_ALIAS → ' + c),
    ...Object.keys(BUILD_WARN).filter((c) => !known(c)).map((c) => 'BUILD_WARN ' + c)];
  ok(!stray.length, 'inventory: IN_EDITOR, CLI_ONLY, the alias targets and BUILD_WARN name only MESSAGES codes' + (stray.length ? ': ' + stray.join(', ') : ''));
  const counts = { IN_EDITOR: 0, CLI_ONLY: 0, CLI_ONLY_PREFIX: 0, EDITOR_ALIAS: 0, BUILD_WARN: 0 };
  for (const c of codes) for (const k of classes(c)) counts[k]++;
  console.log('  info inventory: ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
  // 道筋：編集アプリが code を出すファイル（プレビューの中・原稿の文字列・作業場所の台本と音声）に、その code が文字列で現れる
  const src = ['app/frame-shim.js', 'app/main.js', 'app/llm.js', 'kit/core/layout-scan.mjs', 'kit/core/check-source.mjs', 'kit/core/legacy-vocab.mjs']
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const unreached = IN_EDITOR.filter((c) => !new RegExp(`["'\`]${c}["'\`]`).test(src));
  ok(!unreached.length, `inventory: every IN_EDITOR code (${IN_EDITOR.length}) appears as a string in the editor's check path` + (unreached.length ? ': not found ' + unreached.join(', ') : ''));
}

// ---------------------------------------------------------------- 1. コマンド版
const CLI = {};
const CLIJ = {};   // コマンド版の --json の全体（決まりの数え上げ rules を比べる）
for (const f of FIXTURES) {
  const { name, lang } = f;
  const r = spawnSync(process.execPath, ['kit/check.mjs', dirOf(f), '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { j = null; }
  ok(j && Array.isArray(j.results) && j.lang === lang, `cli ${name}: check --json ran (exit ${r.status}, lang ${j && j.lang})` + (j ? '' : '\n       ' + String(r.stderr).slice(0, 400)));
  CLI[name] = j ? j.results : [];
  CLIJ[name] = j;
  const codes = new Set(CLI[name].map((x) => x.code));
  const lack = WANT[name].filter((c) => !codes.has(c));
  ok(!lack.length, `cli ${name}: the fixture triggers the codes it is meant to (${WANT[name].length})` + (lack.length ? ': missing ' + lack.join(', ') : ''));
}
{
  const raw = CLI['en-rawmath'].filter((x) => x.code === 'rawMath');
  ok(raw.length === 4 && raw.every((x) => x.sev === 'error' && x.rule === 'R-math'), `cli en-rawmath: rawMath is an error (R-math) on 4 slides: ${raw.map((x) => x.id).join(', ')}`);
  ok(CLI['en-rawmath'].some((x) => x.code === 'narrFormula' && x.sev === 'warn' && x.rule === 'R-formula'), 'cli en-rawmath: the narration that reads a formula is an R-formula warning');
}

// ---------------------------------------------------------------- 2. 編集アプリ
execFileSync(process.execPath, [path.join(ROOT, 'tools/build-app.mjs'), '--out', DIST, '--no-examples'], { stdio: 'ignore' });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `http://127.0.0.1:${srv.address().port}/`;
const browser = await launch();
const errs = [];

try {
  for (const fx of FIXTURES) {
    const { name, lang } = fx;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: lang === 'en' ? 'en-US' : 'ja-JP' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${name} pageerror: ${e.message}`));
    await page.goto(`${HOST}?lang=${lang}`);
    await page.waitForFunction(() => !!window.__APP_TEST && !!window.__APP_TEST_OPEN);
    const files = Object.fromEntries(fs.readdirSync(dirOf(fx), { recursive: true }).filter((f) => fs.statSync(path.join(dirOf(fx), f)).isFile())
      .map((f) => [f.split(path.sep).join('/'), fs.readFileSync(path.join(dirOf(fx), f)).toString('base64')]));
    await page.evaluate(async ([dir, files]) => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(dir, { recursive: true }).catch(() => {});
      const d = await root.getDirectoryHandle(dir, { create: true });
      for (const [rel, b64] of Object.entries(files)) {
        const parts = rel.split('/'); let dir = d;
        for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const w = await (await dir.getFileHandle(parts[parts.length - 1], { create: true })).createWritable(); await w.write(bytes); await w.close();
      }
      window.__testDir = d;
    }, ['parity-' + name, files]);
    ok((await page.evaluate(() => window.__APP_TEST_OPEN(window.__testDir))) === true, `editor ${name}: opened the working folder`);
    await page.waitForFunction(() => { const s = window.__APP_TEST.state(); return s.allowed && !s.building && s.loads > 0 && s.frameLoaded === s.loads; }, null, { timeout: scaled(60000) });
    const results = await page.evaluate(() => window.__APP_TEST.checkResults());
    const st = await page.evaluate(() => window.__APP_TEST.state());
    ok(Array.isArray(results) && !st.error, `editor ${name}: the quality check answered (${results ? results.length : 'no'} findings)`);
    if (!Array.isArray(results)) continue;

    // 3. コマンド版の code はどれも編集アプリにもある（CLI_ONLY を除く）
    const have = new Set(results.map((r) => EDITOR_ALIAS[r.code] || r.code));
    for (const [code, re] of Object.entries(BUILD_WARN)) if ((st.warn || []).some((w) => re.test(w))) have.add(code);
    const cliCodes = [...new Set(CLI[name].map((x) => x.code))].sort();
    const missing = cliCodes.filter((c) => !have.has(c) && !cliOnly(c));
    ok(!missing.length, `parity ${name}: every code the command line reports is in the editor's check, or listed in CLI_ONLY (${cliCodes.length} codes)` + (missing.length ? ': missing ' + missing.join(', ') : ''));
    // 同じ code はスライドも同じ（スライドごとの指摘：rawMath・desuMasu など、本文と台本と原稿から見るもの）
    for (const code of ['rawMath', 'desuMasu', 'punctMixed', 'narrFormula', 'narrNote', 'markMissing', 'imgAlt', 'svgName', 'linkUnknown', 'linkNumber', 'linkStepRange', 'morphNoSrc', 'legacyDataKey', 'legacyIndex', 'predictAnswerWithCount', 'predictAnswerNeverShown', 'compLayout']) {
      const a = CLI[name].filter((x) => x.code === code).map((x) => `${x.slide}:${x.sev}`).sort().join(' ');
      const b = results.filter((x) => x.code === code).map((x) => `${x.i === null ? null : x.i + 1}:${x.sev}`).sort().join(' ');
      if (a || b) ok(a === b, `parity ${name}: ${code} on the same slides with the same severity (cli “${a}”, editor “${b}”)`);
    }
    // 3b. 決まりの数え上げ（#202、kit/core/check-rules.mjs）：編集アプリも同じ決まりの一覧（同じ ruleSet）を返し、コマンド版だけの決まりは skipped/notInEditor。
    // 当てはまらない決まり（excused）とその理由は、教材の性質を同じ文字列から決めるので両方で同じ
    if (CLIJ[name] && CLIJ[name].rules) {
      const er = await page.evaluate(() => window.__APP_TEST.checkRules());
      const cr = CLIJ[name].rules;
      ok(er && er.rules.map((x) => x.id).join() === cr.map((x) => x.id).join() && er.status === 'ok', `rules ${name}: the editor accounts for the same ${cr.length} rules (status ${er && er.status})`);
      const ex = (rs) => rs.filter((x) => x.state === 'excused').map((x) => x.id + '/' + x.reason).join(' ');
      const notSkipped = new Set(er ? er.rules.filter((x) => x.state !== 'skipped').map((x) => x.id) : []);
      ok(er && ex(er.rules) === ex(cr.filter((x) => notSkipped.has(x.id))) && er.rules.filter((x) => x.state === 'skipped').every((x) => x.reason === 'notInEditor'),
        `rules ${name}: the same rules are not applicable for the same reasons (${ex(cr) || 'none'}); the rest the editor does not run are notInEditor`);
    }
    // 4. 言葉：コマンド版の言葉（どこか＋何が違うか）の「何が違うか」と、編集アプリの板の言葉が同じ
    const shown = await (async () => {
      await page.evaluate(() => { window.__APP_TEST.lastCopy = null; });
      await page.evaluate(() => window.__APP_TEST.fixRequest());
      await page.waitForFunction(() => window.__APP_TEST.lastCopy, null, { timeout: scaled(30000) });
      return page.$$eval('#panel .res span:nth-child(2)', (xs) => xs.map((x) => x.textContent));
    })();
    const req = await page.evaluate(() => window.__APP_TEST.lastCopy);
    for (const r of results.filter((x) => x.arg && typeof x.arg === 'object' && MESSAGES[x.code] && CLI[name].some((c) => c.code === x.code))) {
      const text = message(lang, r.code, r.arg);
      const same = CLI[name].some((c) => c.code === r.code && (c.slide === null ? r.i === null : c.slide === r.i + 1) && c.msg.endsWith(text));
      ok(same && shown.includes(text), `messages ${name}: ${r.code} on ${r.i === null ? 'the whole deck' : 'slide ' + (r.i + 1)} reads the same as the command line, in the panel: ${text.slice(0, 90)}`);
    }
    // 修正依頼：エラー・警告はすべて入る（情報は入らない）
    for (const r of results.filter((x) => x.sev !== 'info' && x.arg && typeof x.arg === 'object' && MESSAGES[x.code])) {
      ok(req.includes(message(lang, r.code, r.arg)), `fix request ${name}: includes the ${r.code} finding`);
    }
    if (name === 'en-stale') {
      const c = CLI[name].filter((x) => x.code === 'audioStale'), e = results.filter((x) => x.code === 'audioStale');
      ok(c.length === 1 && c[0].sev === 'warn' && c[0].slide === 2 && c[0].data.k === 's-attn:0' && c[0].msg.endsWith(message('en', 'audioStale', { k: 's-attn:0', kind: 'tts' })) && /^Slide 2 .*: audio: stale — the audio of step s-attn:0 was not made from the current script/.test(c[0].msg),
        `cli en-stale: the stale audio is code audioStale (warn, slide 2), its English message after the fixed head “audio: stale —”: ${c[0] && c[0].msg}`);
      ok(e.length === 1 && e[0].sev === 'warn' && e[0].i === 1, 'editor en-stale: the same step is reported as audioStale');
    }
    if (name === 'en-rawmath') {
      const raw = results.filter((x) => x.code === 'rawMath');
      ok(raw.length === 4 && raw.every((x) => x.sev === 'error'), `editor en-rawmath: rawMath is an error on 4 slides (the owner's case): ${raw.map((x) => x.i + 1).join(', ')}`);
      ok(raw.every((x) => req.includes(message('en', 'rawMath', x.arg))) && /^- \*\*R-math\*\* /m.test(req) && (req.match(/^\d+\. \[error\] Slide \d+[^\n]*math was left unrendered/gm) || []).length === 4,
        'fix request en-rawmath: every rawMath finding is in the fix request, with the R-math standard quoted');
      ok(results.some((x) => x.code === 'narrFormula' && x.sev === 'warn') && /^- \*\*R-formula\*\* /m.test(req), 'fix request en-rawmath: the R-formula warning on the narration is in it too');
      ok(!results.some((x) => x.code === 'colorOutside' && x.sev !== 'info') && !/colou?r.*outside/i.test(req.split('## Current files')[0]), 'fix request en-rawmath: colorOutside stays info and out of the fix request');
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
