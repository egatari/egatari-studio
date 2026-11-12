// The gallery (gallery.html): one deck with every component's demo slides, each component introduced by a slide made from
// its README frontmatter (summary, purposes, variants). It is made from the demos, so it is never edited by hand.
//   node tools/gallery.mjs            rewrite gallery.html
//   node tools/gallery.mjs --check    only check that gallery.html is up to date (npm test)
//   node tools/gallery.mjs --build    also build it with the pinned Egatari Studio and write out/gallery/:
//                                     gallery.html (the deck: → to step) and sheet.html (every slide's mid-step and final
//                                     state on one page, from screenshots)
//   node tools/gallery.mjs --pack <tarball or folder> --manifest <manifest.json> [--previous <manifest.json>] -o <dir>
//                                     the gallery of one release, from its pack alone (no git, no network), for Studio to build
//                                     and put at studio.egatari.org/parts/vX.Y.Z/: writes <dir>/deck.html and <dir>/egatari.json
//                                     (the catalogue version). Every file is checked against the manifest's identity sha256 (spec §6,
//                                     tools/identity.mjs; a tarball byte-exact against manifest.tarball). The parts are grouped by purpose as in Studio's new-deck list (#124):
//                                     a part goes under the tile of its first purpose that has one (tile own, or {into}); else under
//                                     its set, or そのほか. With --previous, parts not in it are marked new, parts with another version changed,
//                                     and parts with the same version but another demo.html or README.md サンプルが変わった. The page is public, so its
//                                     words are Studio's (docs/terms.json: パーツ, サンプル, ステップ, パーツライブラリ).
//                                     --samples-href '<link with {tag}>' --samples-tags m-flow,m-bars,…  (both or neither): under the
//                                     summary of each listed part, a line linking to Studio's samples that use it ({tag} is replaced
//                                     by the part's tag, URL-encoded). Without them the page is as before.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, componentNames } from './studio.mjs';
import { baseline, git } from './baseline.mjs';
import { migratedNames, C2_BASELINE } from './parts.mjs';
import { readTarGz } from './tar.mjs';
import { identityBytes } from './identity.mjs';
import { frontmatter, list, purposeIds, SERIES_LABEL, SET_LABEL, flags } from './lint.mjs';

// The words of the link to Studio's samples that use a part (--samples-href); a proposal until the glossary review settles them
const SAMPLES_LINK_TEXT = 'このパーツを使ったサンプル / Samples that use this part';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// a demo slide: class "slide" with or without more classes (noconcl), any attribute order
const SLIDE_RE = /<section\b[^>]*\bclass="slide(?:\s[^"]*)?"[\s\S]*?<\/section>/g;
// A demo's slides, its <style> and the plain scripts outside its slides (m-collect, m-seq fill their data so), each in its own scope
function demoParts(demo, name){
  demo = demo.replace(/\r\n?/g, '\n');
  const st = demo.match(/<style>([\s\S]*?)<\/style>/);
  const outside = demo.replace(SLIDE_RE, '');
  return {
    style: st && st[1].trim() ? `/* ${name} */\n${st[1].trim()}` : null,
    scripts: [...outside.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `<script>/* ${name} */\n(function(){\n${m[1].trim()}\n})();\n</script>`),
    // a slide without an id gets one, since demos of different parts share titles (見せ方の種類) and so slide keys
    secs: (demo.match(SLIDE_RE) || []).map((x, i) => (/^<section\b[^>]*\bid=/.test(x) ? x : x.replace(/^<section\b/, `<section id="g-${name.replace(/^m-/, '')}-${i + 1}"`)).trim()),
  };
}
// The slide that introduces a part (interactive parts: a badge and a dashed --accent2 frame; text and dash, not colour alone)
function introSlide({ name, summary, purposes, variants, group, n, ia, mark, next, sample = '見本', samplesHref }){
  return `<section class="slide">
  <h2>${esc(name)}${mark ? `（${mark}${next ? `、${next}` : ''}）` : ''}</h2>
  <div class="body">
${ia ? '    <p style="margin:0 0 10px;line-height:1.3"><span style="display:inline-block;font-size:27px;font-weight:700;color:var(--fg);border:2px dashed var(--accent2);border-radius:8px;padding:0 12px">操作できる / Interactive</span></p>\n' : ''}    <p${ia ? ' style="border:3px dashed var(--accent2);border-radius:10px;padding:10px 16px"' : ''}>${esc(summary)}${ia ? '（見る人が押して操作できる）' : ''}</p>
${samplesHref ? `    <p style="margin:6px 0 0"><a href="${esc(samplesHref).replace(/"/g, '&quot;')}">${esc(SAMPLES_LINK_TEXT)}</a></p>\n` : ''}    <ul>
      <li>伝えたいこと：${esc(purposes)}</li>
      <li>見せ方：${variants.length ? esc(variants.join('・')) : '1 種類'}</li>
      <li>${group}　${sample}のスライド：${n} 枚</li>
    </ul>
  </div>
</section>`;
}
function deckHtml({ title, styles, scripts, first, slides }){
  return `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<!-- tools/gallery.mjs が各部品の demo.html と README.md から作る。手で直さない。数値・会社はすべて架空か公の事実 -->
<style>
${styles.join('\n')}
</style>
</head>
<body>
${scripts.join('\n')}
<div id="stage">

${first}

${slides.join('\n\n')}

</div>
</body>
</html>
`;
}
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes('--pack')) { packGallery(); process.exit(0); }
const ids = purposeIds(ROOT);
// New and changed components (index.js or demo.html) since the release before this one come first, marked on their first slide
const { base, label: next } = baseline();
// A part migrated to components 2.0 draws what it drew in C2_BASELINE (tools/test-c2-identity.mjs), so its index.js counts as
// changed only if it changed between base and C2_BASELINE; its demo.html as usual
const migrated = new Set(migratedNames(ROOT));
const changed = new Set(base ? git('diff', '--name-only', base, '--', 'components').split('\n').filter((p) => /\/(index\.js|demo\.html)$/.test(p))
  .filter((p) => !(p.endsWith('/index.js') && migrated.has(p.split('/')[1]) && !git('diff', '--name-only', base, C2_BASELINE, '--', p).trim())).map((p) => p.split('/')[1]) : []);
const existed = (name) => !!base && git('cat-file', '-t', `${base}:components/${name}/index.js`).trim() === 'blob';
const status = (name) => (!base ? '' : !existed(name) ? '新しい' : changed.has(name) ? '変わった' : '');
const order = componentNames().map((name) => ({ name, st: status(name) }));
const rank = { '新しい': 0, '変わった': 1, '': 2 };
order.sort((a, b) => rank[a.st] - rank[b.st]);
const styles = [], scripts = [], slides = [], index = [];
for (const { name, st: mark } of order) {
  const dir = path.join(ROOT, 'components', name);
  const f = frontmatter(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'));
  const d = demoParts(fs.readFileSync(path.join(dir, 'demo.html'), 'utf8'), f.name);
  if (d.style) styles.push(d.style);
  scripts.push(...d.scripts);
  const purposes = list(f.purposes).map((p) => (ids.get(p) || {}).ja || p).join('・');
  const ia = flags(fs.readFileSync(path.join(dir, 'index.js'), 'utf8')).interactive;
  index.push({ name: f.name, n: d.secs.length, mark });
  slides.push(introSlide({ name: f.name, summary: f.summary, purposes, variants: list(f.variants), group: `系列：${esc(SERIES_LABEL[f.series] || f.series)}`,
    n: d.secs.length, ia, mark, next }), ...d.secs);
}
const total = index.reduce((a, x) => a + x.n + 1, 0) + 1;
const html = deckHtml({ title: '部品の一覧（見本）', styles, scripts, slides, first: `<section class="slide">
  <h2>部品の一覧（${index.length} 個、${total} 枚）</h2>
  <div class="body">
    <p>部品ごとに、説明の 1 枚と見本のスライドが続く。→ で段階を進める。</p>
    <p>${index.map((x) => esc(x.name) + (x.mark ? `（${x.mark}）` : '')).join('　')}</p>
  </div>
</section>` });
const OUT = path.join(ROOT, 'gallery.html');
if (args.includes('--check')) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') === html;
  console.log(same ? `gallery.html is up to date (${index.length} components)` : 'gallery.html is out of date: run node tools/gallery.mjs');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, html);
console.log(`gallery.html: ${index.length} components, ${total} slides`);

if (args.includes('--build')) {
  const { studio } = await import('./studio.mjs');
  const S = await studio();
  const out = path.join(ROOT, 'out', 'gallery');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
  // build from inside the Studio copy, where every component is overlaid
  const src = path.join(S.dir, 'gallery-src.html');
  fs.writeFileSync(src, html);
  S.build(src, path.join(out, 'gallery.html'));
  const b = await S.browser.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto(S.browser.fileUrl(path.join(out, 'gallery.html')));
  await p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  const plan = await p.evaluate(() => { const tl = DECK.timeline(); return DECK.slides.map((s, i) => ({ i, max: s._max, comps: s._comps.length, title: (s.querySelector('h2') || {}).textContent || '', anim: tl.filter((x) => x.i === i).map((x) => x.anim) })); });
  const rows = [];
  for (const s of plan) {
    const frames = [];
    const shoot = async (k, t, label) => {
      await p.evaluate(([i, k, t]) => DECK.seek(i, k, t === null ? Infinity : t), [s.i, k, t]);
      await p.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const f = `s${String(s.i).padStart(3, '0')}_k${k}_${label}.png`;
      await p.screenshot({ path: path.join(out, 'shots', f) });
      frames.push({ f, label: `段階 ${k}${label === 'end' ? '（最後）' : '（途中）'}` });
    };
    if (s.comps) {
      // the middle of the busiest step, then the final state
      let km = 1; for (let k = 1; k <= s.max; k++) if ((s.anim[k] || 0) > (s.anim[km] || 0)) km = k;
      if (s.max >= 1 && s.anim[km] > 0) await shoot(km, s.anim[km] * 0.5, 'mid');
    }
    await shoot(s.max, null, 'end');
    rows.push(`<section><h2>${s.i + 1}. ${esc(s.title)}</h2><div class="row">${frames.map((x) => `<figure><img src="shots/${x.f}" loading="lazy" alt="${esc(s.title)} ${x.label}"><figcaption>${x.label}</figcaption></figure>`).join('')}</div></section>`);
  }
  await b.close();
  fs.rmSync(src);
  fs.writeFileSync(path.join(out, 'sheet.html'), `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>部品の一覧（画像）</title>
<style>
:root{--bg:#fff;--fg:#1d2433;--muted:#5b6475;--line:#d9dde5}
@media (prefers-color-scheme:dark){:root{--bg:#14171d;--fg:#e8ebf1;--muted:#a3abba;--line:#323844}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font-family:system-ui,"Hiragino Sans","Noto Sans JP",sans-serif}
h1{font-size:22px;margin:0 0 4px}p{color:var(--muted);margin:0 0 24px}
section{border-top:1px solid var(--line);padding:16px 0}h2{font-size:17px;margin:0 0 10px}
.row{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;flex:1 1 420px;max-width:640px}
img{width:100%;height:auto;border:1px solid var(--line);border-radius:6px;display:block}figcaption{font-size:13px;color:var(--muted);margin-top:4px}
</style></head><body>
<h1>部品の一覧（画像）</h1>
<p>gallery.html の各スライドの、いちばん動く段階の途中と最後の状態。動きは gallery.html を開いて → で見る。${index.length} 個の部品、${plan.length} 枚。</p>
${rows.join('\n')}
</body></html>
`);
  console.log(`${path.join(out, 'gallery.html')}\n${path.join(out, 'sheet.html')}${errs.length ? '\nconsole: ' + errs.slice(0, 5).join(' | ') : ''}`);
}

// --pack: the gallery of one release from its pack and manifest alone (see the top of this file)
function packGallery(){
  const usage = 'usage: node tools/gallery.mjs --pack <tarball or folder> --manifest <manifest.json> [--previous <manifest.json>] -o <dir>';
  const packArg = opt('--pack'), out = opt('-o');
  if (!packArg || !opt('--manifest') || !out) { console.error(usage); process.exit(2); }
  const fail = (m) => { console.error('gallery --pack: ' + m); process.exit(1); };
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { fail(`${p}: ${e.message}`); } };
  const man = readJson(opt('--manifest')), prev = opt('--previous') ? readJson(opt('--previous')) : null;
  // links to Studio's samples that use a part: both options or neither
  const sHref = opt('--samples-href'), sTagsArg = opt('--samples-tags');
  if ((sHref === undefined) !== (sTagsArg === undefined)) fail('--samples-href and --samples-tags go together');
  if (sHref !== undefined && (!sHref.includes('{tag}') || /^\s*(javascript|data|vbscript):/i.test(sHref))) fail(`--samples-href ${JSON.stringify(sHref)}: a link with {tag} in it`);
  const sTags = new Set((sTagsArg || '').split(',').map((t) => t.trim()).filter(Boolean));
  const samplesHrefOf = (tag) => (sHref !== undefined && sTags.has(tag) ? sHref.split('{tag}').join(encodeURIComponent(tag)) : undefined);
  if (!man.version || !man.components || !man.files) fail(`${opt('--manifest')}: not a components manifest (version, components, files)`);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  // the pack's files: a tarball (checked against manifest.tarball) or the folder it was unpacked into
  let files;
  if (fs.statSync(packArg).isDirectory()) {
    files = new Map(Object.keys(man.files).filter((f) => fs.existsSync(path.join(packArg, f))).map((f) => [f, fs.readFileSync(path.join(packArg, f))]));
  } else {
    const gz = fs.readFileSync(packArg);
    if (man.tarball && sha(gz) !== man.tarball.sha256) fail(`${packArg}: sha256 ${sha(gz)} is not the manifest's ${man.tarball.sha256}`);
    files = readTarGz(gz);
  }
  const bad = [];
  for (const [f, h] of Object.entries(man.files)) {
    if (!files.has(f)) bad.push(`${f}: missing`);
    else if (sha(identityBytes(f, files.get(f))) !== h) bad.push(`${f}: sha256 differs from the manifest`);
  }
  for (const f of files.keys()) if (!(f in man.files)) bad.push(`${f}: not in the manifest`);
  if (bad.length) fail('the pack does not match the manifest:\n  ' + bad.slice(0, 20).join('\n  '));
  const text = (f) => new TextDecoder().decode(files.get(f));

  // purposes as Studio's new-deck list groups them (#124): own tiles in manifest order; {into} goes to its tile
  const P = new Map((man.purposes || []).map((p) => [p.id, p]));
  const tileOf = (id) => { const p = P.get(id); if (!p) return null; if (p.tile === 'own') return id; if (p.tile && p.tile.into && P.get(p.tile.into)?.tile === 'own') return p.tile.into; return null; };
  const label = (id) => { const p = P.get(id); return p ? (p.label?.ja || p.ja || id) : id; };
  const groups = new Map([...P.values()].filter((p) => p.tile === 'own').map((p) => [p.id, { title: label(p.id), parts: [] }]));
  const statusOf = (name, c) => {
    if (!prev) return '';
    const q = prev.components?.[name];
    if (!q) return '新しい';
    if (q.version !== c.version) return '変わった';
    return ['demo.html', 'README.md'].some((f) => (q.files || {})[f] !== (c.files || {})[f]) ? 'サンプルが変わった' : '';
  };
  for (const [name, c] of Object.entries(man.components)) {
    if (c.kind !== 'element') continue;
    if (!files.has(`${name}/demo.html`)) continue;
    const f = frontmatter(text(`${name}/README.md`)) || {};
    const own = (c.purposes || []).map(tileOf).find(Boolean);
    const key = own || `set:${c.set || ''}`;
    if (!groups.has(key)) groups.set(key, { title: own ? label(own) : c.set ? `${SET_LABEL[c.set] || c.set}（束）` : 'そのほか', parts: [] });
    groups.get(key).parts.push({ name, c, f, mark: statusOf(name, c) });
  }
  const rank = { '新しい': 0, '変わった': 1, 'サンプルが変わった': 2, '': 3 };
  const next = `v${man.version}`, styles = [], scripts = [], slides = [], toc = [];
  let total = 1;
  for (const g of groups.values()) {
    if (!g.parts.length) continue;
    g.parts.sort((a, b) => rank[a.mark] - rank[b.mark] || a.name.localeCompare(b.name));
    const tags = g.parts.map((x) => x.c.tag || `m-${x.name}`);
    slides.push(`<section class="slide noconcl">
  <h2>${esc(g.title)}</h2>
  <div class="body">
    <p>${g.parts.map((x, i) => esc(tags[i]) + (x.mark ? `（${x.mark}）` : '')).join('　')}</p>
  </div>
</section>`);
    toc.push(`${esc(g.title)}（${g.parts.length}）`);
    total++;
    g.parts.forEach((x, i) => {
      const d = demoParts(text(`${x.name}/demo.html`), tags[i]);
      if (d.style) styles.push(d.style);
      scripts.push(...d.scripts);
      const tier = x.c.tier === 'specialized' && x.c.set ? `専門のパーツ（${SET_LABEL[x.c.set] || x.c.set}）` : x.c.tier === 'extra' ? '特殊なパーツ' : '標準パーツ';
      slides.push(introSlide({ name: tags[i], summary: x.f.summary, purposes: (x.c.purposes || []).map(label).join('・'), variants: x.c.variants || [],
        group: `${esc(tier)}　版：${esc(x.c.version)}`, n: d.secs.length, ia: flags(text(`${x.name}/index.js`)).interactive,
        mark: x.mark, next: x.mark ? next : '', sample: 'サンプル', samplesHref: samplesHrefOf(tags[i]) }), ...d.secs);
      total += 1 + d.secs.length;
    });
  }
  const html = deckHtml({ title: `パーツのサンプル（${next}）`, styles, scripts, slides, first: `<section class="slide noconcl">
  <h2>パーツのサンプル（パーツライブラリ ${esc(next)}、${total} 枚）</h2>
  <div class="body">
    <p>伝えたいことごとに、パーツの説明の 1 枚とサンプルのスライドが続く。→ でステップを進める。</p>
    <p>${toc.join('　')}</p>
  </div>
</section>` });
  const known = new Set(Object.values(man.components).filter((c) => c.kind === 'element').map((c) => c.tag));
  const unknown = [...sTags].filter((t) => !known.has(t));
  if (unknown.length) console.error(`gallery --pack: --samples-tags not in ${next}, no link: ${unknown.join(', ')}`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'deck.html'), html);
  fs.writeFileSync(path.join(out, 'egatari.json'), JSON.stringify({ componentsCatalogue: man.version }) + '\n');
  console.log(`gallery --pack: ${path.join(out, 'deck.html')} (${next}: ${[...groups.values()].reduce((a, g) => a + g.parts.length, 0)} parts in ${toc.length} groups, ${total} slides)`);
}
