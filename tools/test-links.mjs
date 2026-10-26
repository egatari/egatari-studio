// スライドへのリンク（format spec §9.1A、docs/contract.md §9）と部品 m-menu の確認
//   node tools/test-links.mjs [作業フォルダ]
// 開いたときの #（#<id>・#<id>:<段階>・#N）、発表・授業・動画・ペンでのクリック、戻る（ボタン・Backspace・Alt+←・ブラウザの戻る/進む）、
// 自動再生の状態を保つこと、キーボードで押したリンクへフォーカスが戻ること、字幕・発表者ビューがついてくること、
// 埋め込み（?embed=1）の position（cause: "link"）と、親が止めたときの linkRefused、m-menu の「見た」の印と段階、品質チェックのエラー
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-links-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 試験用のデッキ
const deckDir = path.join(work, 'deck');
fs.mkdirSync(deckDir, { recursive: true });
fs.writeFileSync(path.join(deckDir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>リンクの試験</title></head>
<body>
<div id="stage">
<section class="slide noconcl" id="s-menu01">
  <h2>目次</h2>
  <div class="body">
    <m-menu per-step="2" aria-label="目次">
      <a href="#s-two" data-icon="1" data-sub="段階 0 へ">二枚目</a>
      <a href="#s-three:2" data-icon="2" data-sub="段階 2 へ">三枚目の途中</a>
      <a href="#s-three:concl" data-icon="3">三枚目の結論</a>
    </m-menu>
  </div>
</section>
<section class="slide noconcl" id="s-two">
  <h2>二枚目</h2>
  <div class="body"><p data-step="1">二枚目の一つ目</p><p data-step="2">二枚目の二つ目</p></div>
</section>
<section class="slide" id="s-three">
  <h2>三枚目</h2>
  <div class="body"><p data-step="1" id="t1">三枚目の一つ目</p><p data-step="2" id="t2">三枚目の二つ目</p><p><a href="#s-menu01" id="tomenu">目次へ</a></p></div>
  <div class="concl"><span>三枚目の結論</span></div>
</section>
<section class="slide noconcl" id="s-four">
  <h2>四枚目</h2>
  <div class="body"><p>終わり</p></div>
</section>
</div>
</body>
</html>
`);
const narr = ['## 目次 {#s-menu01}', '[0] 目次です。', '[1] 一つ目と二つ目です。', '[2] 三つ目です。', '',
  '## 二枚目 {#s-two}', '[0] 二枚目です。', '[1] 二枚目の一つ目です。', '[2] 二枚目の二つ目です。', '',
  '## 三枚目 {#s-three}', '[0] 三枚目です。', '[1] 三枚目の一つ目です。', '[2] 三枚目の二つ目の口述原稿です。', '[concl] 三枚目の結論です。', '',
  '## 四枚目 {#s-four}', '[0] 終わりです。', ''];
fs.writeFileSync(path.join(deckDir, 'narration.md'), narr.join('\n'));
const out = path.join(deckDir, 'out', 'deck.html');
execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(deckDir, 'deck.html'), '-o', out], { stdio: 'pipe' });
const url = fileUrl(out);

const b = await launch();
const errs = [];
const watch = (p, name) => {
  p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  p.on('pageerror', (e) => errs.push(name + ': pageerror: ' + e.message));
};
const ready = (p) => p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
const st = (p) => p.evaluate(() => { const s = DECK.state(); return `${s.slide}:${s.step}`; });
const card = (h) => `m-menu a[href="${h}"]`;
const backShown = (p) => p.evaluate(() => { const e = document.getElementById('deck-back'); return !!e && !e.hidden && e.getBoundingClientRect().width > 0; });
const settle = (p, ms = 250) => p.waitForTimeout(ms);

const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const open = async (hash = '', q = '') => {
  const p = await ctx.newPage(); watch(p, 'deck' + q + hash);
  const warns = [];
  p.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
  await p.goto(url + q + hash); await ready(p);
  p.warns = warns;
  return p;
};

// ---- 開いたときの位置
{
  const cases = [['#s-three', '3:0'], ['#s-three:2', '3:2'], ['#s-three:concl', '3:3'], ['#s-two:1', '2:1'], ['#3', '3:0'], ['#99', '4:0'], ['', '1:0']];
  for (const [h, want] of cases) { const p = await open(h); ok(await st(p) === want, `開いたときの ${h || '（# なし）'} → ${want}（${await st(p)}）`); await p.close(); }
  const p = await open('#s-three:2');
  ok(await p.evaluate(() => [getComputedStyle(t1).opacity, getComputedStyle(t2).opacity].join()) === '1,1', '#s-three:2 は段階 2 の最終状態で開く');
  await p.close();
  for (const h of ['#s-nope', '#s-three:9', '#s-three:3', '#s-two:concl', '#s-three:01']) {
    const q = await open(h);
    ok(await st(q) === '1:0' && q.warns.some((w) => w.includes(h.slice(1))), `読めない ${h} は 1 枚目で開き、警告を出す`);
    await q.close();
  }
}

// ---- URL の # はスライドの id（format spec §9.1A）。番号（#N）は開くときにだけ読む
{
  const p = await open('#2');
  ok(await st(p) === '2:0' && await p.evaluate(() => location.hash) === '#s-two', `#2 で開くと 2 枚目、# は #s-two に書き直す（${await p.evaluate(() => location.hash)}）`);
  await p.keyboard.press('ArrowRight'); await settle(p);
  ok(await p.evaluate(() => location.hash) === '#s-two:1', `送ると # は #<id>:<段階>（${await p.evaluate(() => location.hash)}）`);
  await p.keyboard.press('Shift+ArrowRight'); await settle(p);
  ok(await p.evaluate(() => location.hash) === '#s-three', `次のスライドへ：#s-three（${await p.evaluate(() => location.hash)}）`);
  await p.keyboard.press('End'); await settle(p);
  await p.keyboard.press('ArrowLeft'); await settle(p);
  ok(await st(p) === '3:3' && await p.evaluate(() => location.hash) === '#s-three:concl', `結論の段階は #s-three:concl（${await p.evaluate(() => location.hash)}）`);
  await p.reload(); await ready(p);
  ok(await st(p) === '3:3', `書いた # で読み込み直すと同じ位置（${await st(p)}）`);
  // 一覧（o）で選んでも # は id
  await p.keyboard.press('o'); await p.waitForSelector('#dt-ov');
  await p.click('#dt-ov .dt-cell >> nth=1'); await settle(p, 400);
  ok(await st(p) === '2:0' && await p.evaluate(() => location.hash) === '#s-two', `一覧で選ぶと #s-two（${await st(p)} ${await p.evaluate(() => location.hash)}）`);
  // 手で番号を書いても動く
  await p.evaluate(() => { location.hash = '#4'; }); await settle(p, 400);
  ok(await st(p) === '4:0', `手で書いた #4 でも動く（${await st(p)}）`);
  await p.close();
}

// ---- 発表（talk）でのクリック・戻る
{
  const p = await open('#s-menu01:2');
  const h0 = await p.evaluate(() => history.length);
  ok(!(await backShown(p)), '初めは戻るボタンがない');
  await p.click(card('#s-three:2')); await settle(p);
  ok(await st(p) === '3:2', `リンク #s-three:2 → 3:2（${await st(p)}）`);
  ok(await p.evaluate(() => [getComputedStyle(t1).opacity, getComputedStyle(t2).opacity].join()) === '1,1', '発表ではその段階の最終状態');
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('autoplay'))), '止まっていれば止まったまま');
  ok(await backShown(p), 'リンクで来たら戻るボタンが出る');
  ok(await p.evaluate(() => document.querySelector('#deck-back .to').textContent) === '目次', '戻るボタンに戻り先の見出し');
  ok(await p.evaluate(() => history.length) === h0 + 1, '上の窓では履歴に 1 つ積む（ブラウザの戻るでも戻れる）');
  ok(await p.evaluate(() => location.hash) === '#s-three:2', `URL の # はスライドの id と段階（format spec §9.1A。${await p.evaluate(() => location.hash)}）`);
  await p.keyboard.press('Backspace'); await settle(p);
  ok(await st(p) === '1:2', `Backspace で戻る（${await st(p)}）`);
  ok(!(await backShown(p)), '戻りきったら戻るボタンは消える');
  await p.click(card('#s-two')); await settle(p);
  ok(await st(p) === '2:0', 'リンク #s-two → 2:0');
  await p.click('#deck-back'); await settle(p);
  ok(await st(p) === '1:2', '戻るボタンで戻る');
  await p.click(card('#s-three:concl')); await settle(p);
  ok(await st(p) === '3:3', 'リンク #s-three:concl → 結論の段階');
  // リンクの先からさらにリンク（2 段）→ Alt+← で 1 段ずつ
  await p.click('#tomenu'); await settle(p);
  ok(await st(p) === '1:0' && await p.evaluate(() => DECK.links().depth) === 2, 'リンクの先のリンクで 2 段');
  await p.keyboard.press('Alt+ArrowLeft'); await settle(p);
  ok(await st(p) === '3:3', `Alt+← で 1 段戻る（${await st(p)}）`);
  await p.keyboard.press('Alt+ArrowLeft'); await settle(p);
  ok(await st(p) === '1:2', 'もう一度で目次へ');
  // ブラウザの戻る・進む
  await p.click(card('#s-two')); await settle(p);
  await p.keyboard.press('ArrowRight'); await settle(p);   // リンクの先で 1 つ進めてから
  await p.goBack(); await settle(p, 250);
  ok(await st(p) === '1:2', `ブラウザの戻るで目次へ（${await st(p)}）`);
  await p.goForward(); await settle(p, 250);
  ok(await st(p) === '2:1' && await backShown(p), `ブラウザの進むでリンクの先の最後の位置へ（${await st(p)}）`);
  // 「見た」の印：開いたスライドへの札だけ
  await p.keyboard.press('Backspace'); await settle(p);
  const vis = await p.evaluate(() => [...document.querySelectorAll('m-menu a')].map((a) => a.classList.contains('mm-visited')));
  ok(vis.join() === 'true,true,true', `開いたスライドへの札に「見た」の印（${vis}）`);
  // 普通の送り（→）では履歴を積まない
  const h1 = await p.evaluate(() => history.length);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await settle(p);
  ok(await p.evaluate(() => history.length) === h1, '普通の送りでは履歴を積まない');
  await p.close();
}
{
  const p = await open('#1');
  const vis = await p.evaluate(() => [...document.querySelectorAll('m-menu a')].map((a) => a.classList.contains('mm-visited')).join());
  ok(vis === 'false,false,false', '開いた直後は「見た」の印がない（保存しない）');
  // 段階 0：札は出ていないので押せない
  const pe = await p.evaluate(() => [...document.querySelectorAll('m-menu a')].map((a) => getComputedStyle(a).pointerEvents + '/' + a.getAttribute('tabindex')).join());
  ok(pe === 'none/-1,none/-1,none/-1', `出ていない札は押せず Tab でも選べない（${pe}）`);
  await p.keyboard.press('ArrowRight'); await settle(p, 700);
  const sh = await p.evaluate(() => [...document.querySelectorAll('m-menu a')].map((a) => +getComputedStyle(a).opacity).join());
  ok(sh === '1,1,0', `per-step="2"：段階 1 で 2 枚（${sh}）`);
  // キーボード：札にフォーカスして Enter、戻るとその札にフォーカスが戻る
  await p.keyboard.press('ArrowRight'); await settle(p, 700);
  await p.focus(card('#s-three:concl')); await p.keyboard.press('Enter'); await settle(p);
  ok(await st(p) === '3:3', 'フォーカスした札で Enter → その段階');
  await p.keyboard.press('Backspace'); await settle(p);
  ok(await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('href')) === '#s-three:concl', 'キーボードで押した札にフォーカスが戻る');
  // ペンの間はリンクを押しても動かない
  await p.keyboard.press('d');
  await p.click(card('#s-two'), { force: true }); await settle(p);
  ok(await st(p) === '1:2', 'ペンの間はリンクで動かない');
  await p.keyboard.press('Escape');
  // 字幕：リンクの先の段階の口述原稿
  await p.evaluate(() => DECK.captions(true));
  await p.click(card('#s-three:2')); await settle(p);
  ok(/三枚目の二つ目の口述原稿/.test(await p.evaluate(() => DECK.caption() || '')), '字幕はリンクの先の段階の口述原稿');
  await p.close();
}

// ---- 自動再生中のクリック：再生を続ける
{
  const p = await open('#s-menu01:2');
  await p.evaluate(() => DECK.autoplay(true)); await settle(p, 200);
  await p.click(card('#s-two')); await settle(p, 200);
  ok(await st(p) === '2:0' && await p.evaluate(() => document.documentElement.classList.contains('autoplay')), '自動再生中のリンク：そこから再生を続ける');
  await p.keyboard.press('Backspace'); await settle(p, 200);
  ok(await st(p) === '1:2' && await p.evaluate(() => document.documentElement.classList.contains('autoplay')), '自動再生中の戻る：再生を続ける');
  await p.evaluate(() => DECK.autoplay(false));
  await p.close();
}

// ---- 授業モード・動画
{
  const p = await open('#s-menu01:2', '?mode=lecture');
  await p.click(card('#s-three:2')); await settle(p);
  ok(await st(p) === '3:2', '授業モードでもリンクで動く');
  await p.close();
  const v = await open('#s-menu01:2', '?mode=video');
  await v.click(card('#s-three:2'), { force: true }); await settle(v);
  ok(await st(v) === '1:2' && !(await v.evaluate(() => document.getElementById('deck-back'))), '動画ではリンクで動かず、戻るボタンも作らない');
  await v.close();
}

// ---- 埋め込み（?embed=1）：position の cause: "link"、親が止めると linkRefused
{
  const host = path.join(deckDir, 'out', 'host.html');
  fs.writeFileSync(host, `<!doctype html><meta charset="utf-8"><body style="margin:0">
<iframe id="f" style="width:1280px;height:720px;border:0"></iframe>
<script>
window.msgs = [];
var f = document.getElementById('f');
window.addEventListener('message', function(e){ if (e.source === f.contentWindow) window.msgs.push(e.data); });
f.src = 'deck.html' + location.search + location.hash;
</script>`);
  const p = await ctx.newPage(); watch(p, 'host');
  await p.goto(fileUrl(host) + '?embed=1#s-menu01:2');
  const fr = () => p.frame({ url: /deck\.html/ });
  await p.waitForFunction(() => window.msgs.some((m) => m.egatari === 'position'), null, { timeout: 10000 });
  const h0 = await p.evaluate(() => history.length);
  await fr().click(card('#s-three:2')); await p.waitForTimeout(200);
  const pos = await p.evaluate(() => window.msgs.filter((m) => m.egatari === 'position').pop());
  ok(pos && pos.cause === 'link' && pos.slideKey === 's-three' && pos.stepKey === '2' && pos.t === null, `埋め込み：{egatari:"position", cause:"link"}（${JSON.stringify(pos)}）`);
  ok(await p.evaluate(() => !window.msgs.some((x) => x.type === 'deck-pos')), '埋め込みの親には deck-pos を送らない（Player P8 の position だけ）');
  ok(await p.evaluate(() => history.length) === h0, '埋め込みでは上の窓の履歴を積まない');
  ok(await fr().evaluate(() => !document.getElementById('deck-back').hidden), '埋め込みでも戻るボタン');
  await fr().focus('body'); await p.keyboard.press('Backspace'); await p.waitForTimeout(200);
  ok(await fr().evaluate(() => DECK.state().slide) === 1, '埋め込みで Backspace：戻る（履歴を使わない）');
  await p.evaluate(() => { window.msgs = []; f.contentWindow.postMessage({ egatari: 'links', id: 7, follow: false }, '*'); });
  await p.waitForFunction(() => window.msgs.some((m) => m.egatari === 'links'));
  ok(await p.evaluate(() => { const m = window.msgs.find((x) => x.egatari === 'links'); return m.id === 7 && m.follow === false; }), '親の {egatari:"links", follow:false} に id つきで答える');
  await fr().click(card('#s-two')); await p.waitForTimeout(200);
  ok(await fr().evaluate(() => DECK.state().slide) === 1, '親が止めているとリンクで動かない');
  ok(await p.evaluate(() => window.msgs.some((m) => m.egatari === 'linkRefused' && m.slideKey === 's-two' && m.stepKey === '0') && !window.msgs.some((m) => m.egatari === 'position')), '止めたリンクは linkRefused を送り、position は送らない');
  // ほかの窓からの links は聞かない
  await fr().evaluate(() => window.postMessage({ egatari: 'links', follow: true }, '*'));
  await fr().click(card('#s-two')); await p.waitForTimeout(200);
  ok(await fr().evaluate(() => DECK.state().slide) === 1, '親でない窓からの links は無視する');
  await p.goto(fileUrl(host) + '?embed=1&links=0#s-menu01:2');
  await p.waitForFunction(() => window.msgs.some((m) => m.egatari === 'position'), null, { timeout: 10000 });
  await fr().click(card('#s-two')); await p.waitForTimeout(200);
  ok(await fr().evaluate(() => DECK.state().slide) === 1 && await p.evaluate(() => window.msgs.some((m) => m.egatari === 'linkRefused')), '?embed=1&links=0 なら初めから止める');
  await p.close();
}

// ---- 発表者ビュー：本体のリンクについてきて、戻るボタンがあり、「今の画面」のリンクは本体でたどる
{
  const p = await open('#s-menu01:2');
  const [pv] = await Promise.all([ctx.waitForEvent('page'), p.keyboard.press('p')]);
  watch(pv, 'presenter');
  await pv.waitForFunction(() => /1 \//.test((document.getElementById('pv-pos') || {}).textContent || ''), null, { timeout: 10000 });
  await p.click(card('#s-three:2')); await settle(p, 300);
  ok(await pv.evaluate(() => document.getElementById('pv-step').textContent.includes('2') && /3 \//.test(document.getElementById('pv-pos').textContent)), '発表者ビューはリンクの先についてくる');
  ok(await pv.evaluate(() => !document.getElementById('pv-back').hidden && document.getElementById('pv-back').textContent.includes('目次')), '発表者ビューにも戻るボタン');
  await pv.click('#pv-back'); await settle(p, 300);
  ok(await st(p) === '1:2', '発表者ビューの戻るボタンで本体が戻る');
  const fc = pv.frame({ url: /view=follow/ });
  await fc.waitForFunction(() => window.DECK && DECK.ready && DECK.state().step === 2, null, { timeout: 10000 });
  await fc.click(card('#s-two')); await settle(p, 400);
  ok(await st(p) === '2:0', `「今の画面」のリンクは本体でたどる（${await st(p)}）`);
  ok(await fc.evaluate(() => DECK.state().slide) === 2 && !(await fc.evaluate(() => document.getElementById('deck-back'))), '「今の画面」は本体についてきて、自分の戻るボタンは作らない');
  await pv.keyboard.press('Backspace'); await settle(p, 300);
  ok(await st(p) === '1:2', '発表者ビューの Backspace で本体が戻る');
  await pv.close(); await p.close();
}

// ---- 品質チェック：行き先のないリンク・範囲の外の段階はエラー
{
  const bad = path.join(work, 'bad');
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'deck.html'), fs.readFileSync(path.join(deckDir, 'deck.html'), 'utf8').replace('<p>終わり</p>',
    '<p><a href="#s-nope">a</a> <a href="#s-three:7">b</a> <a href="#s-two:concl">c</a> <a href="#s-three:3">d</a> <a href="#9">e</a> <a href="#2">f</a> <a href="other.ega.html#s-x">g</a> <a href="https://example.org/">h</a></p>'));
  fs.writeFileSync(path.join(bad, 'narration.md'), narr.join('\n'));
  const run = (f) => { const r = spawnSync(process.execPath, [path.join(ROOT, 'kit/check.mjs'), f, '--json'], { encoding: 'utf8' }); return { code: r.status, j: JSON.parse(r.stdout) }; };
  const g = run(path.join(deckDir, 'deck.html'));
  ok(g.code === 0 && g.j.counts.error === 0, `品質チェック：正しいリンクはエラー 0（${g.j.counts.error}）`);
  const r = run(path.join(bad, 'deck.html'));
  const errsJ = r.j.results.filter((x) => x.sev === 'error' && /リンク/.test(x.msg)).map((x) => x.msg);
  const warnsJ = r.j.results.filter((x) => x.sev === 'warn' && /リンク/.test(x.msg)).map((x) => x.msg);
  ok(r.code === 1, '品質チェック：行き先のないリンクで終了コード 1');
  for (const [h, re] of [['#s-nope', /スライド「s-nope」がない/], ['#s-three:7', /段階 7 がない/], ['#s-two:concl', /結論.*の段階がない/], ['#s-three:3', /段階 3 がない.*concl/], ['#9', /スライド 9 がない/]]) {
    ok(errsJ.some((m) => m.includes(`href="${h}"`) && re.test(m)), `品質チェックのエラー：${h}`);
  }
  ok(warnsJ.some((m) => m.includes('href="#2"') && /番号/.test(m)), '品質チェックの警告：番号のリンク #2');
  ok(warnsJ.some((m) => m.includes('other.ega.html') && /見つからない/.test(m)), '品質チェックの警告：ほかのファイルが見つからない');
  ok(!r.j.results.some((x) => x.msg.includes('example.org')), '品質チェック：http のリンクは見ない');
  ok(errsJ.length === 5, `品質チェックのリンクのエラーは 5 つ（${errsJ.length}）`);
}

await b.close();
ok(errs.length === 0, 'コンソールのエラーなし' + (errs.length ? '：' + errs.join(' | ') : ''));
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);
