// LMS 用の SCORM 1.2 の包み（kit/core/scorm.mjs・kit/core/zip-write.mjs・build --scorm。spec bindings/scorm12.md）の確認：Node と Chromium で
//   node tools/test-scorm.mjs [作業フォルダ]
// 1. CLI：egatari build <作業フォルダ> --scorm が <題名>.scorm.zip を書く。中身は imsmanifest.xml と index.html の 2 つだけ、この順。
//    index.html は --play-only の出力とバイトまで同じ（包み方 §1：変えない）
// 2. 決まった形：同じ作業フォルダから 2 度作って同じバイト。項目の時刻は 1980-01-01 00:00、圧縮なし、UTF-8 の印、CRC が合う（書き手とは別に読む）。
//    scormPackage を 2 度呼んでも同じバイト。AI への指示のスキルの zip（tools/make-llm-guide.mjs）も同じ書き手を使う
// 3. imsmanifest.xml を包み方 §1 の決まりで確かめる（XML として読む：Chromium の DOMParser）：名前空間・identifier（egatari-<docId>）・metadata・
//    organizations の default と organization・item の identifierref・resource（webcontent、adlcp:scormtype="sco"、href と file が index.html）・題（metadata.title、
//    XML の字の逃がし）・identifier が重ならない・masteryscore など点数の要素がない。仕様の写しに XSD はないので、決まりはここに書く
// 4. 断るもの：索引のある（編集できる）Egatari ファイル・deck-meta.tracking に scorm12 がない・再開データが 4096 字を超えうるステップの数（ちょうどの境目）
// 5. 包みを LMS の形で開く：親のページが SCORM 1.2 の API（window.API）を持ち、index.html を iframe で開く。プレーヤーが親の API を見つけ、
//    終えた判定（metadata.completion：既定・visitedFraction・reachedEnd）のとおりに cmi.core.lesson_status を incomplete → completed にする。
//    足りないうちは completed にしない。閉じると exit（終えたら ""）・LMSFinish。プレーヤーのステップの数が包み手の数え方（stepCount）と同じ
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../kit/browser.mjs';
import { readZip } from '../kit/core/zip-read.mjs';
import { scormPackage, scormManifest, suspendLength, stepCount, SUSPEND_MAX, SCORM_EXT } from '../kit/core/scorm.mjs';
import { writeZip } from '../kit/core/zip-write.mjs';
import { makeSkillZip, MAKE_SKILL_DIR } from './make-llm-guide.mjs';
import { scaled } from './wait-scale.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-scorm-')));
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 試験用の教材（架空の中身。4 枚 × 3 ステップ）
const SLIDES = [['s-sc2aaa', '春の朝'], ['s-sc3bbb', '夏の雨'], ['s-sc4ccc', '秋の夕'], ['s-sc5ddd', '冬の夜']];
const N_STEPS = SLIDES.length * 3;
const DOC_ID = '3b1f7c2e-9a4d-4e6b-8c21-5d0e7f9a1b42';
const TITLE = '季節の <教材> & "SCORM"';
function makeFolder(name, completion = null) {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>季節</title></head>
<body>
<div id="stage">
${SLIDES.map(([id, t]) => `<section class="slide" id="${id}">
  <h2>${t}</h2>
  <div class="body">
    <p data-step="1">${t}の一つ目の点。</p>
    <p data-step="2">${t}の二つ目の点。</p>
  </div>
</section>`).join('\n')}
</div>
</body>
</html>
`);
  fs.writeFileSync(path.join(dir, 'narration.md'), SLIDES.map(([id, t]) => `## ${t} {#${id}}
[0] ${t}について話します。
[1] 一つ目の点です。
[2] 二つ目の点です。
`).join('\n'));
  fs.writeFileSync(path.join(dir, 'egatari.json'), JSON.stringify({ docId: DOC_ID, metadata: { title: TITLE, ...(completion ? { completion } : {}) } }, null, 1));
  return dir;
}
const cli = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'egatari.mjs'), 'build', ...a], { encoding: 'utf8' });
const zipName = (dir) => fs.readdirSync(dir).find((f) => f.endsWith(SCORM_EXT));

// ---------------------------------------------------------------- 1. CLI
const D = makeFolder('default');
const po = cli(D, '--play-only');
ok(po.status === 0, `build --play-only (${po.stderr.trim().slice(0, 200)})`);
const playFile = fs.readdirSync(D).find((f) => f.endsWith('.play.ega.html'));
const r1 = cli(D, '--scorm');
ok(r1.status === 0 && /scorm: SCORM 1\.2 package \(imsmanifest\.xml \+ index\.html\), 12 steps/.test(r1.stdout) && /completed when every step is reached/.test(r1.stdout), `build --scorm says what it wrote and the completion rule (${(r1.stdout + r1.stderr).trim().split('\n').pop()})`);
const zn = zipName(D);
ok(zn === '季節の 教材 & SCORM.scorm.zip', `the zip is named after the title, <title>${SCORM_EXT} (${zn})`);
const zip1 = fs.readFileSync(path.join(D, zn));
const files = (await readZip(new Uint8Array(zip1), { maxMembers: 10, maxMemberBytes: () => 64 * 1048576, maxTotalBytes: 128 * 1048576, accept: () => true })).files;
ok([...files.keys()].join() === 'imsmanifest.xml,index.html', `the zip holds imsmanifest.xml and index.html, in this order (${[...files.keys()]})`);
const play = fs.readFileSync(path.join(D, playFile));
ok(Buffer.compare(Buffer.from(files.get('index.html')), play) === 0, 'index.html is the --play-only file, byte for byte');

// ---------------------------------------------------------------- 2. 決まった形
fs.renameSync(path.join(D, zn), path.join(work, 'first.zip'));
await new Promise((r) => setTimeout(r, 1100));   // 時計が進んでも同じ
const r2 = cli(D, '--scorm');
const zip2 = fs.readFileSync(path.join(D, zipName(D)));
ok(r2.status === 0 && Buffer.compare(zip1, zip2) === 0, 'building the package twice gives the same bytes');
const html = play.toString('utf8');
const p1 = scormPackage(html), p2 = scormPackage(html);
ok(Buffer.compare(Buffer.from(p1.zip), Buffer.from(p2.zip)) === 0 && Buffer.compare(Buffer.from(p1.zip), zip1) === 0, 'scormPackage gives the same bytes as the CLI, every time');
// 書き手とは別に読む：局所の見出し・中央ディレクトリ・終わりの記録
{
  const z = zip1, errs = [];
  let o = 0;
  const names = [];
  while (z.readUInt32LE(o) === 0x04034b50) {
    const flags = z.readUInt16LE(o + 6), method = z.readUInt16LE(o + 8), time = z.readUInt16LE(o + 10), date = z.readUInt16LE(o + 12);
    const csize = z.readUInt32LE(o + 18), usize = z.readUInt32LE(o + 22), nl = z.readUInt16LE(o + 26), xl = z.readUInt16LE(o + 28);
    const name = z.toString('utf8', o + 30, o + 30 + nl);
    names.push(name);
    if (flags !== 0x800) errs.push(`${name}: flags ${flags}`);
    if (method !== 0 || csize !== usize) errs.push(`${name}: not stored`);
    if (time !== 0 || date !== 33) errs.push(`${name}: time ${time} date ${date}`);
    if (xl !== 0) errs.push(`${name}: extra field`);
    o += 30 + nl + xl + csize;
  }
  const cd = o;
  for (let k = 0; k < names.length; k++) {
    if (z.readUInt32LE(o) !== 0x02014b50) { errs.push('central directory'); break; }
    if (z.readUInt16LE(o + 12) !== 0 || z.readUInt16LE(o + 14) !== 33 || z.readUInt32LE(o + 38) !== 0) errs.push('central time or attributes');
    o += 46 + z.readUInt16LE(o + 28) + z.readUInt16LE(o + 30) + z.readUInt16LE(o + 32);
  }
  if (z.readUInt32LE(o) !== 0x06054b50 || z.readUInt32LE(o + 16) !== cd || z.readUInt16LE(o + 10) !== names.length || o + 22 !== z.length) errs.push('end of central directory');
  ok(!errs.length, `zip entries: stored, 1980-01-01 00:00, UTF-8 names, no extra fields or comment (${errs.join('; ') || names.join(', ')})`);
}
{
  const a = writeZip([['b.txt', 'x'], ['a.txt', 'y']]), b = writeZip([['b.txt', 'x'], ['a.txt', 'y']]);
  ok(Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0, 'writeZip is deterministic and keeps the given order');
  let refused = 0;
  for (const bad of [[['../x', '']], [['/x', '']], [['a', ''], ['a', '']], [['a\\b', '']]]) try { writeZip(bad); } catch { refused++; }
  ok(refused === 4, 'writeZip refuses .., absolute, duplicate and backslash names');
  const sk = makeSkillZip({ [MAKE_SKILL_DIR + '/SKILL.md']: '# x\n', [MAKE_SKILL_DIR + '/refs/a.md']: 'a', 'other/x.md': 'not in the zip' });
  const back = (await readZip(new Uint8Array(sk), { maxMembers: 10, maxMemberBytes: () => 1e6, maxTotalBytes: 1e6, accept: () => true })).files;
  ok([...back.keys()].join() === 'make/refs/a.md,make/SKILL.md', 'the skill zip (tools/make-llm-guide.mjs) uses the same writer and reads back');
}

// ---------------------------------------------------------------- 4. 断るもの
const refuse = (h) => { try { scormPackage(h); return null; } catch (e) { return e.code || e.message; } };
{
  const pr = cli(D, '--portable');
  const ega = fs.readdirSync(D).find((f) => f.endsWith('.ega.html') && !f.endsWith('.play.ega.html'));
  ok(pr.status === 0 && refuse(fs.readFileSync(path.join(D, ega), 'utf8')) === 'scorm-not-play-only', 'refuses an Egatari file that still carries its source (package the play-only copy)');
  ok(refuse(html.replace('"tracking":["scorm12","postmessage","local"]', '"tracking":["postmessage","local"]')) === 'scorm-no-tracking', 'refuses a file whose deck-meta.tracking has no "scorm12" (binding §2)');
  ok(refuse('<!DOCTYPE html><title>x</title>') === 'scorm-not-egatari', 'refuses a file that is not an Egatari file');
  let n = 1; while (suspendLength(n + 1) <= SUSPEND_MAX) n++;
  const meta = `<script type="application/json" id="deck-meta">${JSON.stringify({ format: 'egatari', docId: DOC_ID, title: 'x', tracking: ['scorm12'] })}</script>`;
  const many = (k) => `<!DOCTYPE html><html><head>${meta}</head><body><section id="egatari-readable"><article data-slide-key="s">${Array.from({ length: k }, (_, j) => `<div data-step-key="s:${j}"></div>`).join('')}</article></section></body></html>`;
  ok(stepCount(many(n)) === n && refuse(many(n)) === null && refuse(many(n + 1)) === 'scorm-too-many-steps', `refuses more steps than the 4096-character resume data holds with all three bitsets: ${n} steps pass, ${n + 1} are refused (binding §2.2)`);
  ok(suspendLength(N_STEPS) === JSON.stringify({ v: 1, n: N_STEPS, h: '00000000', seen: 'AAA', stage: 'AAA', text: 'AAA' }).length, 'suspendLength matches the player’s suspend data for 12 steps');
}

// ---------------------------------------------------------------- 3・5. ブラウザ
const browser = await launch();
const errors = [];
const MIME = { '.html': 'text/html; charset=utf-8', '.xml': 'application/xml' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(work, p);
  if (!file.startsWith(work + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HOST = `http://127.0.0.1:${srv.address().port}/`;
try {
  // ---------------------------------------------------------------- 3. imsmanifest.xml
  {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto('about:blank');
    // 包み方 §1 の決まり。返すもの：違反の一覧
    const check = (text, want) => p.evaluate(([text, want]) => {
      const CP = 'http://www.imsproject.org/xsd/imscp_rootv1p1p2', AD = 'http://www.adlnet.org/xsd/adlcp_rootv1p2';
      const e = [];
      if (!text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')) e.push('XML declaration');
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) return ['not well-formed XML'];
      const m = doc.documentElement;
      const kids = (el, name) => [...el.children].filter((x) => x.namespaceURI === CP && x.localName === name);
      const one = (el, name) => { const k = kids(el, name); if (k.length !== 1) e.push(`${el.localName} needs one ${name} (${k.length})`); return k[0] || doc.createElementNS(CP, name); };
      if (m.namespaceURI !== CP || m.localName !== 'manifest') e.push('root is not imscp manifest');
      if (m.getAttribute('identifier') !== 'egatari-' + want.docId) e.push('manifest identifier');
      if (m.getAttribute('version') !== '1') e.push('manifest version');
      const md = one(m, 'metadata');
      if (one(md, 'schema').textContent !== 'ADL SCORM' || one(md, 'schemaversion').textContent !== '1.2') e.push('metadata schema / schemaversion');
      const orgs = one(m, 'organizations'), org = one(orgs, 'organization');
      if (orgs.getAttribute('default') !== org.getAttribute('identifier')) e.push('organizations default does not name the organization');
      if (one(org, 'title').textContent !== want.title) e.push(`organization title (${one(org, 'title').textContent})`);
      const items = kids(org, 'item');
      if (items.length !== 1) e.push('one item');
      const item = items[0] || doc.createElementNS(CP, 'item');
      if (one(item, 'title').textContent !== want.title) e.push('item title');
      const res = kids(one(m, 'resources'), 'resource');
      if (res.length !== 1) e.push('one resource');
      const r = res[0] || doc.createElementNS(CP, 'resource');
      if (item.getAttribute('identifierref') !== r.getAttribute('identifier')) e.push('item identifierref does not name the resource');
      if (r.getAttribute('type') !== 'webcontent') e.push('resource type');
      if (r.getAttributeNS(AD, 'scormtype') !== 'sco') e.push('adlcp:scormtype');
      if (r.getAttribute('href') !== 'index.html') e.push('resource href');
      const fl = kids(r, 'file');
      if (fl.length !== 1 || fl[0].getAttribute('href') !== 'index.html') e.push('resource file');
      const ids = [...doc.querySelectorAll('[identifier]')].map((x) => x.getAttribute('identifier'));
      if (new Set(ids).size !== ids.length) e.push('identifiers repeat');
      if (!ids.every((x) => /^[A-Za-z_][\w.-]*$/.test(x))) e.push('identifier is not an XML ID');
      // 点数を使わない（§2.1）：masteryscore・maxtimeallowed・prerequisites などを書かない
      if ([...doc.getElementsByTagNameNS(AD, '*')].length) e.push('adlcp elements (masteryscore …) present');
      return e;
    }, [text, want]);
    const man = new TextDecoder().decode(files.get('imsmanifest.xml'));
    const e1 = await check(man, { docId: DOC_ID, title: TITLE });
    ok(!e1.length, `imsmanifest.xml follows the binding §1 (identifier, organization, item, sco resource, launch index.html, title from metadata.title, XML-escaped) ${e1.join('; ')}`);
    ok(man === scormManifest({ docId: DOC_ID, title: TITLE }) && man.includes('<title>季節の &lt;教材&gt; &amp; &quot;SCORM&quot;</title>'), 'the title is XML-escaped');
    const e2 = await check(scormManifest({ docId: DOC_ID, title: 'a\u0001b' }), { docId: DOC_ID, title: 'a b' });
    ok(!e2.length, `characters XML cannot carry become spaces (${e2.join('; ')})`);
    await c.close();
  }

  // ---------------------------------------------------------------- 5. LMS の形で開く
  // 親のページ：SCORM 1.2 の API（値は vals、呼び出しは window.__calls）。index.html は iframe（自分の窓にではなく、親に API がある）
  const lms = (dir, vals) => {
    fs.writeFileSync(path.join(dir, 'lms.html'), `<!DOCTYPE html><html><head><meta charset="utf-8"><title>LMS</title><script>
window.__calls = [];
const store = ${JSON.stringify(vals)};
const log = (x) => window.__calls.push(x);
window.API = {
  LMSInitialize: (a) => { log(['LMSInitialize', a]); return 'true'; },
  LMSGetValue: (k) => { log(['LMSGetValue', k]); return k in store ? store[k] : ''; },
  LMSSetValue: (k, x) => { log(['LMSSetValue', k, x]); store[k] = x; return 'true'; },
  LMSCommit: (a) => { log(['LMSCommit', a]); return 'true'; },
  LMSFinish: (a) => { log(['LMSFinish', a]); return 'true'; },
  LMSGetLastError: () => '0', LMSGetErrorString: () => '', LMSGetDiagnostic: () => ''
};
</script></head><body style="margin:0"><iframe id="sco" src="index.html" style="width:1280px;height:720px;border:0"></iframe></body></html>`);
  };
  const base = { 'cmi.core.lesson_mode': 'normal', 'cmi.core.lesson_status': 'not attempted', 'cmi.core.entry': 'ab-initio', 'cmi.core.lesson_location': '', 'cmi.suspend_data': '' };
  // 包みを作って取り出す → 親のページで開く
  async function launchPackage(name, completion) {
    const dir = name === 'default' ? D : makeFolder(name, completion);
    if (name !== 'default') { const b = cli(dir, '--scorm'); if (b.status !== 0) throw new Error(b.stderr); }
    const z = fs.readFileSync(path.join(dir, zipName(dir)));
    const out = path.join(work, 'lms-' + name);
    fs.mkdirSync(out, { recursive: true });
    const got = (await readZip(new Uint8Array(z), { maxMembers: 10, maxMemberBytes: () => 64 * 1048576, maxTotalBytes: 128 * 1048576, accept: () => true })).files;
    for (const [n, b] of got) fs.writeFileSync(path.join(out, n), b);
    lms(out, base);
    const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await p.goto(`${HOST}lms-${name}/lms.html`);
    await p.waitForFunction(() => { const f = document.getElementById('sco'); try { const D = f.contentWindow.DECK; return D && D.ready && D.tracking && D.tracking().adapter; } catch { return false; } }, null, { timeout: scaled(30000) });
    const f = await (await p.$('#sco')).contentFrame();
    return { c, p, f, steps: stepCount(new TextDecoder().decode(got.get('index.html'))) };
  }
  const sets = (calls, k) => calls.filter((x) => x[0] === 'LMSSetValue' && x[1] === k).map((x) => x[2]);
  const calls = (p) => p.evaluate(() => window.__calls);
  const forward = async (p, n) => { for (let j = 0; j < n; j++) await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150); };
  const close = async (L) => { await L.f.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))); const C = await calls(L.p); await L.c.close(); return C; };

  // 既定：すべてのステップ
  {
    const L = await launchPackage('default');
    const t = await L.f.evaluate(() => DECK.tracking());
    ok(t.adapter === 'scorm12', `the launched index.html finds the SCORM 1.2 API in the parent frame (${t.adapter})`);
    ok(t.total === N_STEPS && L.steps === N_STEPS, `the player's step count equals the packager's (${t.total}, ${L.steps})`);
    await L.p.mouse.click(300, 400);
    await forward(L.p, N_STEPS - 2);   // 最後のステップの手前まで（N - 1 ステップ）
    let C = await calls(L.p);
    ok(C[0][0] === 'LMSInitialize' && sets(C, 'cmi.core.lesson_status').join() === 'incomplete', `default rule: incomplete after the first gesture, not completed with one step left (${sets(C, 'cmi.core.lesson_status')})`);
    await forward(L.p, 1);
    C = await calls(L.p);
    ok(sets(C, 'cmi.core.lesson_status').pop() === 'completed', 'default rule: completed when every step is reached');
    C = await close(L);
    ok(sets(C, 'cmi.core.exit').pop() === '' && C[C.length - 1][0] === 'LMSFinish' && /^\d{4}:\d{2}:\d{2}\.\d{2}$/.test(sets(C, 'cmi.core.session_time').pop()), 'closing after completion: session_time, exit "", LMSFinish last');
  }
  // visitedFraction 0.5：12 ステップの半分（6 ステップ）
  {
    const L = await launchPackage('fraction', { visitedFraction: 0.5 });
    await L.p.mouse.click(300, 400);
    await forward(L.p, 4);   // 5 ステップ
    let C = await calls(L.p);
    ok(!sets(C, 'cmi.core.lesson_status').includes('completed'), 'visitedFraction 0.5: not completed after 5 of 12 steps');
    await forward(L.p, 1);
    C = await calls(L.p);
    ok(sets(C, 'cmi.core.lesson_status').pop() === 'completed', 'visitedFraction 0.5: completed after 6 of 12 steps');
    await close(L);
  }
  // reachedEnd：最後のステップに飛ぶだけで
  {
    const L = await launchPackage('end', { reachedEnd: true });
    await L.p.mouse.click(300, 400);
    await forward(L.p, 2);
    let C = await calls(L.p);
    ok(!sets(C, 'cmi.core.lesson_status').includes('completed'), 'reachedEnd: not completed before the last step');
    await L.f.evaluate(() => { const t = DECK.timeline(), g = t[t.length - 1]; DECK.go(g.i, g.k, false); });
    await L.p.waitForTimeout(150);
    C = await calls(L.p);
    ok(sets(C, 'cmi.core.lesson_status').pop() === 'completed', 'reachedEnd: completed on reaching the last step, with most steps skipped');
    C = await close(L);
    ok(sets(C, 'cmi.core.exit').pop() === '', 'reachedEnd: exit "" after completion');
  }
  // 途中で閉じる：suspend
  {
    const L = await launchPackage('default');
    await L.p.mouse.click(300, 400);
    await forward(L.p, 3);
    const C = await close(L);
    ok(sets(C, 'cmi.core.exit').pop() === 'suspend' && sets(C, 'cmi.core.lesson_location').pop() === '#3' && JSON.parse(sets(C, 'cmi.suspend_data').pop()).n === N_STEPS, 'closing before completion: exit suspend, lesson_location #3, suspend_data for 12 steps');
  }
} catch (e) {
  fails++;
  console.log('FAIL ' + (e.stack || e));
} finally {
  await browser.close();
  srv.close();
}
ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
