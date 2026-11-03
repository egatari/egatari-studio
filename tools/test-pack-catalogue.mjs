// AI への指示（instruction pack）が出すパーツと、新しい教材の既定のカタログ（パーツライブラリ 2.x）が合っているか（#165 の続き）
//   node tools/test-pack-catalogue.mjs [出力先] [名前 …]
// 新しい教材は egatari.json の "componentsCatalogue": "2"（components2.lock.json の default）で組む。指示はその既定のカタログの manifest から作る。
// 確かめること：
//   - 指示の材料（kit/core/llm-pack-data.mjs の tiers.catalogue）が components2.lock.json の default と同じ
//   - 指示が出すパーツ（標準と、どの束の専門も。特殊は除く）が、どれもその既定のカタログの要素のパーツ
//   - そのパーツごとに、既定のカタログの版の見本（demo.html）を "componentsCatalogue": "2" の作業フォルダに置いて組み、エラーがない（選んだカタログにない要素なし）、
//     ブラウザで全スライドの全ステップを最後まで進めて pageerror も DECK.componentErrors もない、品質チェック（kit/check.mjs）のエラーが 0
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { PACK } from '../kit/core/llm-pack-data.mjs';
import { resolveComponent } from '../kit/core/components-lock.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
// 出力先は区切り（/）を含む最初の引数。ほかの引数はパーツの名前（m-bars か bars）
const out = path.resolve(args[0] && /[\\/]/.test(args[0]) ? args.shift() : fs.mkdtempSync(path.join(os.tmpdir(), 'test-pack-catalogue-')));
fs.mkdirSync(out, { recursive: true });
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'components.lock.json'), 'utf8'));
const lock2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'components2.lock.json'), 'utf8'));
const cat = lock2.catalogues[lock2.default];
ok(PACK.tiers.catalogue === lock2.default, `the instruction pack is made from the default 2.x catalogue (${PACK.tiers.catalogue} = ${lock2.default})`);

const offered = Object.entries(PACK.tiers.parts).filter(([, p]) => p.tier !== 'extra').map(([t]) => t).sort();
const nameOf = (tag) => Object.keys(cat.parts).find((n) => { const p = lock2.parts[n][cat.parts[n]]; return p.kind === 'element' && p.tag === tag; });
const missing = offered.filter((t) => !nameOf(t));
ok(offered.length > 20 && missing.length === 0, `every part the pack offers (${offered.length}, standard and every set) is an element of catalogue ${lock2.default}${missing.length ? ': missing ' + missing.join(' ') : ''}`);

const picked = args.length ? offered.filter((t) => args.includes(t) || args.includes(t.slice(2))) : offered;
const run = (file, a) => new Promise((resolve) => execFile(process.execPath, [path.join(ROOT, file), ...a], { encoding: 'utf8', maxBuffer: 64 << 20 }, (e, stdout, stderr) => resolve({ status: e ? (e.code ?? 1) : 0, stdout, stderr })));
const decks = [];
for (const tag of picked) {
  const name = nameOf(tag);
  if (!name) continue;
  const dir = resolveComponent(path, ROOT, lock, name, cat.parts[name]);
  const demo = dir && path.join(dir, 'demo.html');
  if (!demo || !fs.existsSync(demo)) { ok(false, `${tag}: catalogue ${lock2.default} has a demo (${name}@${cat.parts[name]})`); continue; }
  const d = path.join(out, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(demo, path.join(d, 'deck.html'));
  for (const f of fs.readdirSync(dir)) if (/\.json$/.test(f)) fs.copyFileSync(path.join(dir, f), path.join(d, f));   // 見本が {{JSON:…}} で読むデータ
  fs.writeFileSync(path.join(d, 'egatari.json'), JSON.stringify({ componentsCatalogue: '2' }, null, 2) + '\n');
  decks.push({ tag, name, d });
}

// 組み立てと品質チェック（子のプロセス。何本か並べる）
// 同時に走る品質チェックの数。test-all がほかの段と並べて走らせるので既定は 2（ブラウザの描画は 1 つのブラウザを使い回す）
const JOBS = Math.max(1, +(process.env.TEST_PACK_CATALOGUE_JOBS || 2));
const results = new Map();
{
  let next = 0;
  const worker = async () => {
    while (next < decks.length) {
      const x = decks[next++];
      const b = await run('kit/build.mjs', [path.join(x.d, 'deck.html'), '-o', path.join(x.d, 'out.html')]);
      const c = b.status === 0 ? await run('kit/check.mjs', [path.join(x.d, 'deck.html'), '--json']) : null;
      results.set(x.tag, { b, c });
    }
  };
  await Promise.all(Array.from({ length: JOBS }, worker));
}

const br = await launch();
for (const x of decks) {
  const { b, c } = results.get(x.tag);
  const notFound = (b.stderr.match(/component not found: \S+/g) || []);
  ok(b.status === 0 && !notFound.length, `${x.tag}: the demo builds on "componentsCatalogue": "2"${b.status ? ' — ' + (b.stderr || b.stdout).split('\n')[0] : notFound.length ? ' — ' + notFound.join(', ') : ''}`);
  if (b.status !== 0) continue;
  let r = null;
  try { r = JSON.parse(c.stdout); } catch { /* 下で失敗にする */ }
  const errs = r ? r.results.filter((f) => f.sev === 'error') : null;
  ok(c.status === 0 && errs && errs.length === 0, `${x.tag}: quality check error 0${errs && errs.length ? ' — ' + errs.slice(0, 3).map((f) => `[${f.code}] ${f.msg}`).join(' | ') : !r ? ' — ' + (c.stderr || c.stdout).slice(0, 200) : ''}`);
  const p = await br.newPage({ viewport: { width: 1280, height: 720 } });
  const perr = [];
  p.on('pageerror', (e) => perr.push(e.message));
  await p.goto(fileUrl(path.join(x.d, 'out.html')));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 }).catch((e) => perr.push(String(e.message).split('\n')[0]));
  const st = await p.evaluate(() => {
    for (let i = 0; i < DECK.slides.length; i++) for (let k = 0; k <= DECK.slides[i]._max; k++) DECK.seek(i, k, Infinity);
    return { slides: DECK.slides.length, comps: DECK.slides.reduce((n, s) => n + s._comps.length, 0), errors: DECK.componentErrors.map((e) => `${e.tag} ${e.phase} ${e.kind}${e.msg ? ': ' + e.msg : ''}`) };
  }).catch((e) => ({ slides: 0, comps: 0, errors: [String(e.message).split('\n')[0]] }));
  ok(perr.length === 0 && st.errors.length === 0 && st.comps > 0, `${x.tag}: runs to the last step of every slide (${st.slides} slides, ${st.comps} parts) without page errors or component errors${perr.length || st.errors.length ? ' — ' + [...perr, ...st.errors].slice(0, 3).join(' | ') : ''}`);
  await p.close();
}
await br.close();
console.log(fail ? `${fail} failed` : 'all ok');
process.exit(fail ? 1 : 0);
