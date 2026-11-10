// 埋め込みの命令と知らせ（Player P8）を、親の枠から送って確かめる：
//   node tools/test-embed.mjs [作業フォルダ]
// test-all: serial（自動再生で stepEnded・ended が届くのを決まった待ちで確かめる。--jobs が 2 以上でも、最後にほかと重ねずに走らせる）
// 親は {egatari:"ready"} を待ってから命令を送る（tools/test-offer.mjs と同じ）。
//   seek → position（cause seek）と seeked（slide はスライドの鍵か 0 からの番号、step は段階の鍵、t は秒か null = ∞）。再生中の seek は再生を保つ
//   preview on/off → 同じ形の答えと薄く見せる表示。controls visible false/true → 同じ形の答えと帯の出し入れ（?controls=0 で作らなかった帯も出せる）
//   再生（play）で段階を終わりまで流すたびに stepEnded、タイムラインの最後の後に ended。飛ばした段階には stepEnded を送らない
//   snapshot → {egatari:"error", id, code:"unsupported"}。知らない命令 → code unsupported。悪い引数 → code はその命令の名前（mode・rate・layout と同じ）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'test-embed-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const J = (x) => JSON.stringify(x);

// ---------------------------------------------------------------- 教材（3 枚 × 2 段階。1 段階 0.5 秒）
const SL = [['s-em1aaa', '一'], ['s-em2bbb', '二'], ['s-em3ccc', '三']];
const dir = path.join(work, 'deck');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>埋め込みの試験</title></head>
<body>
<div id="stage">
${SL.map(([id, t]) => `<section class="slide" id="${id}"><h2>${t}</h2><div class="body"><p data-step="1">${t}の点。</p></div></section>`).join('\n')}
</div>
</body>
</html>
`);
fs.writeFileSync(path.join(dir, 'narration.md'), SL.map(([id, t]) => `## ${t} {#${id}}\n[0] ${t}の話です。\n[1] ${t}の点です。\n`).join('\n'));
const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(dir, 'deck.html')], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
const DUR = 0.5;
const out = path.join(dir, 'out');
fs.writeFileSync(path.join(out, 'short.html'), fs.readFileSync(path.join(out, 'deck.html'), 'utf8').replace(/(<script type="application\/json" id="deck-timing">)([\s\S]*?)(<\/script>)/, (m, a, j, b) =>
  a + JSON.stringify(Object.fromEntries(SL.flatMap(([id]) => ['0', '1'].map((k) => [`${id}:${k}`, { dur: DUR, hold: 0, lead: 0, pad_after: 0 }])))) + b));
fs.writeFileSync(path.join(out, 'host.html'), `<!doctype html><meta charset="utf-8"><body><iframe id="f" style="width:960px;height:540px"></iframe><script>
window.msgs = []; var f = document.getElementById('f');
addEventListener('message', function(e){ if (e.source === f.contentWindow) window.msgs.push(e.data); });
window.send = function(m){ f.contentWindow.postMessage(m, '*'); };
window.load = function(q){ window.msgs = []; f.src = 'short.html?embed=1' + q; };
</script></body>`);

const browser = await launch();
const errors = [];
const c = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const hp = await c.newPage();
hp.on('pageerror', (e) => errors.push(`host: ${e.message}`));
await hp.goto(fileUrl(path.join(out, 'host.html')));
const frame = () => hp.frames().find((f) => f.url().includes('embed=1'));
async function load(q = '') {
  await hp.evaluate((x) => window.load(x), q);
  await hp.waitForFunction(() => window.msgs.some((m) => m && m.egatari === 'ready'), null, { timeout: 20000 });
  await hp.waitForFunction(() => window.msgs.some((m) => m && m.egatari === 'position'), null, { timeout: 5000 });
  frame().on('pageerror', (e) => errors.push(`frame: ${e.message}`));
}
// 命令を送り、同じ id の答えを待つ（答えの前に届いた知らせは since からの msgs で見る）
async function cmd(m) {
  const since = await hp.evaluate(() => window.msgs.length);
  await hp.evaluate((x) => window.send(x), m);
  await hp.waitForFunction((id) => window.msgs.some((x) => x && x.id === id), m.id, { timeout: 5000 }).catch(() => {});
  await hp.waitForTimeout(50);
  const ms = await hp.evaluate((n) => window.msgs.slice(n), since);
  return { reply: ms.find((x) => x && x.id === m.id) || null, ms };
}
const fstate = () => frame().evaluate(() => ({ key: DECK.state().key, playing: DECK.playing(), preview: DECK.previewOn(), html: document.documentElement.className,
  bar: !!document.getElementById('dt-cb'), barShown: !!(document.getElementById('dt-cb') && document.getElementById('dt-cb').checkVisibility()) }));

await load();
const ready = await hp.evaluate(() => window.msgs.find((m) => m.egatari === 'ready'));
ok(ready && ready.timeline.length === SL.length * 2 && ready.timeline.every((x) => x.dur === DUR), `ready carries the short timeline (${ready && ready.timeline.length} steps)`);

// ---------------------------------------------------------------- seek
{
  let { reply, ms } = await cmd({ egatari: 'seek', id: 's1', slide: 's-em2bbb', step: '1', t: null });
  const pos = ms.filter((m) => m.egatari === 'position');
  ok(reply && J(reply) === J({ egatari: 'seeked', id: 's1', slideKey: 's-em2bbb', stepKey: '1', t: null }), `seek by slide key and step key replies seeked (${J(reply)})`);
  ok(pos.length >= 1 && J(pos.at(-1)) === J({ egatari: 'position', slideKey: 's-em2bbb', stepKey: '1', t: null, cause: 'seek' }) && ms.indexOf(pos.at(-1)) < ms.indexOf(reply),
    `the seek sends position (cause seek) before seeked (${J(pos.at(-1))})`);
  ok((await fstate()).key === (await frame().evaluate(() => DECK.stepKey(1, 1))), 'the player is at that step');
  ({ reply, ms } = await cmd({ egatari: 'seek', id: 's2', slide: 2, step: 0, t: 0.2 }));
  const p2 = ms.filter((m) => m.egatari === 'position').at(-1);
  ok(reply && reply.egatari === 'seeked' && reply.slideKey === 's-em3ccc' && reply.stepKey === '0' && reply.t === 0.2, `seek by index with t replies seeked with that t (${J(reply)})`);
  ok(p2 && p2.slideKey === 's-em3ccc' && p2.stepKey === '0' && p2.t === 0.2 && p2.cause === 'seek', `the position that follows carries t (${J(p2)})`);
  ok(!(await fstate()).playing, 'a seek while paused stays paused');
  ({ reply } = await cmd({ egatari: 'seek', slide: 0, step: '0', t: null }));
  await hp.waitForTimeout(100);
  ok((await hp.evaluate(() => window.msgs.filter((m) => m.egatari === 'seeked').at(-1))).slideKey === 's-em1aaa', 'a seek without id is applied and answered too');
  for (const [m, why] of [[{ slide: 'nope', step: '0', t: null }, 'unknown slide key'], [{ slide: 7, step: '0', t: null }, 'index out of range'],
    [{ slide: 's-em1aaa', step: '5', t: null }, 'step out of range'], [{ slide: 's-em1aaa', step: 'x', t: null }, 'not a step key'],
    [{ slide: 's-em1aaa', step: '1', t: -1 }, 'negative t'], [{ slide: 's-em1aaa', step: '1', t: '3' }, 't not a number'], [{ step: '0' }, 'no slide']]) {
    const id = 'bad-' + why;
    ({ reply } = await cmd({ egatari: 'seek', id, ...m }));
    ok(reply && reply.egatari === 'error' && reply.code === 'seek' && typeof reply.message === 'string', `seek with ${why} replies error code seek (${J(reply)})`);
  }
  ok((await fstate()).key === (await frame().evaluate(() => DECK.stepKey(0, 0))), 'bad seeks do not move the player');
}

// ---------------------------------------------------------------- preview
{
  let { reply } = await cmd({ egatari: 'preview', id: 'p1', on: true });
  let s = await fstate();
  ok(reply && J(reply) === J({ egatari: 'preview', id: 'p1', on: true }) && s.preview && /deck-preview/.test(s.html), `preview on: acknowledged and later steps shown faintly (${J(reply)})`);
  const faint = await frame().evaluate(() => { const e = document.querySelector('#s-em1aaa [data-step="1"]'); return +getComputedStyle(e).opacity; });
  ok(faint > 0 && faint < 1, `preview on: a later step is drawn at --preview-opacity (${faint})`);
  ({ reply } = await cmd({ egatari: 'preview', id: 'p2', on: false }));
  s = await fstate();
  ok(reply && reply.on === false && !s.preview && !/deck-preview/.test(s.html), `preview off: acknowledged and later steps hidden again (${J(reply)})`);
  ({ reply } = await cmd({ egatari: 'preview', id: 'p3', on: 'yes' }));
  ok(reply && reply.egatari === 'error' && reply.code === 'preview' && !(await fstate()).preview, `preview with a non-boolean on replies error code preview (${J(reply)})`);
}

// ---------------------------------------------------------------- controls
{
  let s = await fstate();
  ok(s.bar && !/deck-nocontrols/.test(s.html), 'the player shows its own toolbar by default');
  let { reply } = await cmd({ egatari: 'controls', id: 'c1', visible: false });
  s = await fstate();
  const hidden = await frame().evaluate(() => ['dt-cb', 'dt-handle'].every((id) => { const e = document.getElementById(id); return !e || !e.checkVisibility(); }));
  ok(reply && J(reply) === J({ egatari: 'controls', id: 'c1', visible: false }) && /deck-nocontrols/.test(s.html) && hidden, `controls hide: acknowledged; toolbar and handle not shown (${J(reply)})`);
  ({ reply } = await cmd({ egatari: 'controls', id: 'c2', visible: true }));
  await frame().evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { clientX: 480, clientY: 530 })));
  await hp.waitForTimeout(400);
  s = await fstate();
  ok(reply && reply.visible === true && !/deck-nocontrols/.test(s.html) && s.barShown, `controls show: acknowledged; the toolbar can be shown again (${J(s)})`);
  ({ reply } = await cmd({ egatari: 'controls', id: 'c3' }));
  ok(reply && reply.egatari === 'error' && reply.code === 'controls', `controls without visible replies error code controls (${J(reply)})`);
  // ?controls=0 では帯を作らない。controls visible:true で作って出す
  await load('&controls=0');
  s = await fstate();
  ok(!s.bar && /deck-nocontrols/.test(s.html), `?controls=0: no toolbar (${J(s)})`);
  ({ reply } = await cmd({ egatari: 'controls', id: 'c4', visible: true }));
  s = await fstate();
  ok(reply && reply.visible === true && s.bar && s.barShown, `?controls=0 then controls show: the toolbar is built and shown (${J(s)})`);
}

// ---------------------------------------------------------------- snapshot・知らない命令・ほかの命令の悪い引数
{
  let { reply } = await cmd({ egatari: 'snapshot', id: 'n1', slide: 0, step: '0', t: null });
  ok(reply && reply.egatari === 'error' && reply.id === 'n1' && reply.code === 'unsupported', `snapshot replies error code unsupported (${J(reply)})`);
  ({ reply } = await cmd({ egatari: 'dance', id: 'u1' }));
  ok(reply && reply.egatari === 'error' && reply.code === 'unsupported' && /dance/.test(reply.message), `an unknown command replies error code unsupported (${J(reply)})`);
  ({ reply } = await cmd({ egatari: 'links', id: 'k1', follow: 'no' }));
  ok(reply && reply.egatari === 'error' && reply.code === 'links', `links with a non-boolean follow replies error code links (${J(reply)})`);
  ({ reply } = await cmd({ egatari: 'layout', id: 'y1', layout: 'flow' }));
  ok(reply && reply.egatari === 'layout', `layout (handled by the panes) is not answered as unknown (${J(reply)})`);
  await cmd({ egatari: 'layout', id: 'y2', layout: 'slides' });
}

// ---------------------------------------------------------------- 再生：stepEnded と ended
const keys = SL.flatMap(([id]) => [id + ':0', id + ':1']);
const ends = (ms) => ms.filter((m) => m.egatari === 'stepEnded').map((m) => m.slideKey + ':' + m.stepKey);
{
  await cmd({ egatari: 'seek', id: 'a0', slide: 0, step: '0', t: null });
  const since = await hp.evaluate(() => window.msgs.length);
  await hp.evaluate(() => window.send({ egatari: 'play' }));
  await hp.waitForFunction((n) => window.msgs.slice(n).some((m) => m.egatari === 'ended'), since, { timeout: 15000 }).catch(() => {});
  await hp.waitForTimeout(200);
  const ms = await hp.evaluate((n) => window.msgs.slice(n), since);
  const iEnd = ms.findIndex((m) => m.egatari === 'ended');
  ok(J(ends(ms)) === J(keys), `a full run sends stepEnded for every step in order (${J(ends(ms))})`);
  ok(iEnd > ms.findLastIndex((m) => m.egatari === 'stepEnded') && ms.filter((m) => m.egatari === 'ended').length === 1 && J(ms[iEnd]) === J({ egatari: 'ended' }),
    `ended is sent once, after the last stepEnded (#${iEnd})`);
  ok(ms.some((m, j) => j < iEnd && m.egatari === 'state' && m.playing === false) && !(await fstate()).playing, 'playback has stopped (state playing false) when ended arrives');
}
{
  // 再生中の seek：再生を保ち、t から続ける。飛ばした段階には stepEnded を送らない
  await cmd({ egatari: 'seek', id: 'b0', slide: 0, step: '0', t: null });
  const since = await hp.evaluate(() => window.msgs.length);
  await hp.evaluate(() => window.send({ egatari: 'play' }));
  await hp.waitForFunction((n) => window.msgs.slice(n).some((m) => m.egatari === 'stepEnded'), since, { timeout: 5000 }).catch(() => {});
  const { reply } = await cmd({ egatari: 'seek', id: 'b1', slide: 's-em3ccc', step: '1', t: 0.1 });
  ok(reply && reply.egatari === 'seeked' && reply.t === 0.1 && (await fstate()).playing, `a seek while playing keeps playing (${J(reply)})`);
  await hp.waitForFunction((n) => window.msgs.slice(n).some((m) => m.egatari === 'ended'), since, { timeout: 5000 }).catch(() => {});
  await hp.waitForTimeout(200);
  const ms = await hp.evaluate((n) => window.msgs.slice(n), since);
  ok(J(ends(ms)) === J(['s-em1aaa:0', 's-em3ccc:1']) && ms.some((m) => m.egatari === 'ended'), `skipped steps get no stepEnded; the run still ends (${J(ends(ms))})`);
  // 手で止めたら stepEnded も ended も来ない
  await cmd({ egatari: 'seek', id: 'c0', slide: 0, step: '0', t: null });
  const s2 = await hp.evaluate(() => window.msgs.length);
  await hp.evaluate(() => window.send({ egatari: 'play' }));
  await hp.waitForTimeout(150);
  await hp.evaluate(() => window.send({ egatari: 'pause' }));
  await hp.waitForTimeout(DUR * 1000 + 300);
  const m2 = await hp.evaluate((n) => window.msgs.slice(n), s2);
  ok(!m2.some((m) => m.egatari === 'stepEnded' || m.egatari === 'ended'), `pausing before a step ends sends neither stepEnded nor ended (${J(m2.map((m) => m.egatari))})`);
}

await browser.close();
ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log('test-embed: all ok');
