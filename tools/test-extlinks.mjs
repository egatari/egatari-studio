// 授業の外へ出るリンク（format spec §11「Links that leave the lesson」）：決まり（kit/core/link-policy.mjs）の単体の試験と、再生器での確認の箱
//   node tools/test-extlinks.mjs [作業フォルダ]
// 単体：scheme の判定・確かめる理由（見える字の host・https でない・ダウンロード・userinfo・punycode）・host の記憶
// ブラウザ：授業の中のリンクは変わらない／外へのリンクは同意するまでどこへも行かず、全体と host を見せる／開くのは noopener の新しいタブ／
//   開かない scheme／同じ host は 2 度目から聞かない（must は毎回）／キーボードと a11y／動画・sandbox の枠・編集のプレビューでは開かない
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, fileUrl } from '../kit/browser.mjs';
import { LinkPolicy } from '../kit/core/link-policy.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-extlinks-')));
fs.mkdirSync(work, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

// ---------------------------------------------------------------- 単体
{
  const LP = LinkPolicy();
  const base = 'https://lesson.example/play/deck.html';
  const d = (href, text = '', o = {}, hosts = new Set()) => LP.decide({ href, text, download: !!o.download }, { base: o.base || base, hosts });
  let r = d('https://example.org/a?b=1', '参考');
  ok(r.verdict === 'confirm' && !r.must && r.host === 'example.org' && r.url === 'https://example.org/a?b=1', 'https: の普通のリンクは確かめる（must でない）');
  const hosts = new Set(); LP.remember(hosts, r);
  ok(d('https://example.org/other', '別', {}, hosts).verdict === 'open', '同じ host に同意済みなら、2 度目は聞かない');
  ok(d('https://other.example/', '別', {}, hosts).verdict === 'confirm', '別の host は聞く');
  for (const [href, text, o, reason] of [
    ['https://evil.example/', 'example.org', {}, 'mismatch'],
    ['https://evil.example/', 'https://example.org/path を見る', {}, 'mismatch'],
    ['http://example.org/', 'x', {}, 'insecure'],
    ['https://example.org/a.zip', 'x', { download: true }, 'download'],
    ['https://example.org@evil.example/', 'x', {}, 'userinfo'],
    ['https://пример.example/', 'x', {}, 'punycode'],
    ['mailto:a@example.org', 'x', {}, 'insecure'],
    ['tel:+81000', 'x', {}, 'insecure'],
  ]) {
    const x = d(href, text, o, hosts);
    ok(x.verdict === 'confirm' && x.must && x.reasons.includes(reason), `確かめる理由 ${reason}：${href}（同意済みの host でも毎回）`);
  }
  ok(!d('https://www.example.org/', 'example.org').reasons.includes('mismatch'), '見える字の host と同じ（www. の違いだけ）なら理由にしない');
  ok(!d('https://example.org/', 'スライド 3 を見る。e.g. これ').reasons.includes('mismatch'), 'ふつうの字は理由にしない');
  ok(LP.remember(hosts, d('http://z.example/', 'x')) === undefined && !hosts.has('z.example'), 'must の同意は記憶しない');
  for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' \tjavascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'blob:https://x/1', 'vbscript:x', 'ftp://example.org/', 'view-source:https://example.org/', 'about:blank', 'chrome://settings', 'intent://x#Intent;end', 'ssh://x']) {
    ok(d(href).verdict === 'refuse', `開かない scheme：${href}`);
  }
  ok(d('').verdict === 'refuse' && d('https://').verdict === 'refuse', '読めないアドレスは開かない');
  ok(d('next.ega.html', '次', { base: 'file:///home/u/deck.html' }).reasons?.includes('local') && d('next.ega.html', '次', { base: 'file:///home/u/deck.html' }).must, 'file: の文書から相対で書いた隣のファイルは、毎回確かめる');
  ok(d('file:///etc/passwd', 'x', { base: 'file:///home/u/deck.html' }).verdict === 'refuse', 'file: の文書でも、絶対の file: は開かない');
  ok(d('other.html', 'x', { base: 'about:srcdoc' }).verdict === 'refuse', '相対を解けない文書（srcdoc）では開かない');
  ok(LP.OPEN_FEATURES === 'noopener,noreferrer', 'window.open の特徴は noopener,noreferrer');
}

// ---------------------------------------------------------------- 試験用のデッキ
const deckDir = path.join(work, 'deck');
fs.mkdirSync(deckDir, { recursive: true });
fs.writeFileSync(path.join(deckDir, 'deck.html'), `<!DOCTYPE html>
<html lang="ja" data-theme="default">
<head><meta charset="utf-8"><title>外へのリンク</title></head>
<body>
<div id="stage">
<section class="slide noconcl" id="s-one">
  <h2>一枚目</h2>
  <div class="body"><p>
    <a id="inner" href="#s-two">内</a>
    <a id="ext" href="https://example.org/a?x=1">参考資料</a>
    <a id="ext2" href="https://example.org/b">同じ host</a>
    <a id="other" href="https://other.example/">別の host</a>
    <a id="mis" href="https://evil.example/login">example.org</a>
    <a id="http" href="http://plain.example/">http</a>
    <a id="dl" href="https://example.org/f.zip" download>保存</a>
    <a id="js" href="javascript:window.__pwned=1">js</a>
    <a id="data" href="data:text/html,<script>window.__pwned=1</script>">data</a>
    <a id="file" href="file:///etc/passwd">file</a>
    <a id="own1" href="https://own1.example/" data-ega-own="true">own1</a>
    <a id="own2" href="https://own2.example/" __egaOwn="true" __egaown>own2</a>
    <a id="own3" href="https://own3.example/" data-egaown egaown="1" data-own="1">own3</a>
    <a id="blank" href="https://third.example/blank" target="_blank">blank</a>
  </p></div>
</section>
<section class="slide noconcl" id="s-two"><h2>二枚目</h2><div class="body"><p>終わり</p></div></section>
</div>
</body>
</html>
`);
fs.writeFileSync(path.join(deckDir, 'narration.md'), '## 一枚目 {#s-one}\n[0] 一枚目です。\n\n## 二枚目 {#s-two}\n[0] 終わりです。\n');
const out = path.join(deckDir, 'out', 'deck.html');
execFileSync(process.execPath, [path.join(ROOT, 'kit/build.mjs'), path.join(deckDir, 'deck.html'), '-o', out], { stdio: 'pipe' });
const url = fileUrl(out);

const b = await launch();
const errs = [];
const requests = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
// 外のサイトへの要求は、ここで止めて数える（同意の前にどこへも行かないことの確認）。応答は空のページ
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => { requests.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/html', body: '<title>out</title>' }); });
const ready = (p) => p.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 10000 });
const open = async (q = '') => {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.goto(url + q); await ready(p);
  return p;
};
const dlg = (p) => p.evaluate(() => {
  const d = document.getElementById('deck-extlink');
  if (!d) return null;
  return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), labelled: !!document.getElementById(d.getAttribute('aria-labelledby')), host: d.querySelector('.host')?.textContent || '', url: d.querySelector('.url')?.textContent || '',
    notes: [...d.querySelectorAll('li')].map((l) => l.textContent), buttons: [...d.querySelectorAll('button')].map((x) => x.className), focus: document.activeElement?.className || '', stageInert: document.getElementById('stage').inert };
});
const st = (p) => p.evaluate(() => `${DECK.state().slide}:${DECK.state().step}`);
const popups = async (ctx_, fn) => { const got = []; const h = (pg) => got.push(pg); ctx_.on('page', h); await fn(); await new Promise((r) => setTimeout(r, 400)); ctx_.off('page', h); return got; };

// ---- 授業の中のリンクは変わらない
{
  const p = await open();
  await p.click('#inner'); await p.waitForTimeout(250);
  ok(await st(p) === '2:0' && !(await dlg(p)), '授業の中のリンク（#s-two）は確かめずに移る');
  await p.close();
}

// ---- 外へのリンク
{
  const p = await open();
  const n0 = requests.length;
  const got = await popups(ctx, async () => { await p.click('#ext'); await p.waitForTimeout(250); });
  const d = await dlg(p);
  ok(d && d.role === 'alertdialog' && d.modal === 'true' && d.labelled, '確認の箱：role=alertdialog・aria-modal・名前がある');
  ok(d && d.host === 'example.org' && d.url === 'https://example.org/a?x=1', `行き先の host と全体を見せる（${d && d.host} / ${d && d.url}）`);
  ok(d && d.buttons.join() === 'cancel,go' && d.focus === 'cancel', '焦点は「やめる」から（開くほうではない）');
  ok(d && d.stageInert, '箱が出ている間、授業の画面は inert（読み上げ・焦点が入らない）');
  ok(got.length === 0 && requests.length === n0 && p.url().split('#')[0] === url, '同意するまでどこへも行かない（新しいタブなし・要求なし・この窓は動かない）');
  // 箱の中のキーはスライドを動かさない・Tab は箱の中で回る
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
  ok(await st(p) === '1:0' && !!(await dlg(p)), '箱の中の → はスライドを進めない');
  await p.keyboard.press('Tab'); ok((await dlg(p)).focus === 'go', 'Tab で「開く」へ');
  await p.keyboard.press('Tab'); ok((await dlg(p)).focus === 'cancel', 'Tab は箱の中で回る');
  await p.keyboard.press('Shift+Tab'); ok((await dlg(p)).focus === 'go', 'Shift+Tab で逆に回る');
  // Esc：やめる。焦点はリンクへ戻る
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(!(await dlg(p)) && await p.evaluate(() => document.activeElement && document.activeElement.id) === 'ext' && !(await p.evaluate(() => document.getElementById('stage').inert)), 'Esc でやめる：箱が消え、焦点はリンクに戻り、画面の inert は外れる');
  ok(requests.length === n0, 'やめたあとも要求なし');
  // 「やめる」ボタンを Enter
  await p.click('#ext'); await p.waitForTimeout(150);
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok(!(await dlg(p)) && requests.length === n0, '既定の焦点で Enter を押しても開かない');
  // 外側を押す：やめる
  await p.click('#ext'); await p.waitForTimeout(150);
  await p.mouse.click(5, 5); await p.waitForTimeout(150);
  ok(!(await dlg(p)) && requests.length === n0, '箱の外を押すとやめる（開かない）');
  // 開く：新しいタブ・noopener
  await p.click('#ext'); await p.waitForTimeout(150);
  const opened = await popups(ctx, async () => { await p.click('#deck-extlink button.go'); });
  ok(opened.length === 1, `「開く」で新しいタブが 1 つ開く（${opened.length}）`);
  ok(opened[0] && (await opened[0].evaluate(() => window.opener)) === null, '新しいタブは noopener（window.opener が null）');
  ok(opened[0] && !(await opened[0].evaluate(() => document.referrer)), '新しいタブは noreferrer（referrer が空）');
  ok(p.url().split('#')[0] === url && !(await dlg(p)), '授業の窓は動かず、箱は閉じる');
  for (const x of opened) await x.close();
  // 同じ host は 2 度目から聞かない
  const again = await popups(ctx, async () => { await p.click('#ext2'); });
  ok(again.length === 1 && !(await dlg(p)), '同じ host（example.org）は、2 度目は聞かずに開く');
  for (const x of again) await x.close();
  await p.click('#other'); await p.waitForTimeout(150);
  const o = await dlg(p);
  ok(o && o.host === 'other.example', '別の host は聞く');
  await p.keyboard.press('Escape');
  await p.close();
}

// ---- 毎回確かめるもの・開かないもの
{
  const p = await open();
  // example.org は同意済みにしてから、must のものが毎回聞くことを確かめる
  await p.click('#ext'); await p.waitForTimeout(100);
  const first = await popups(ctx, async () => { await p.click('#deck-extlink button.go'); });
  for (const x of first) await x.close();
  const cases = [['#mis', 'evil.example', 'mismatch', /別のサイト|different site/], ['#http', 'plain.example', 'insecure', /https/], ['#dl', 'example.org', 'download', /ダウンロード|downloads/]];
  for (const [sel, host, , re] of cases) {
    const n0 = requests.length;
    const got = await popups(ctx, async () => { await p.click(sel); await p.waitForTimeout(150); });
    const d = await dlg(p);
    ok(d && d.host === host && d.notes.some((t) => re.test(t)) && d.url.startsWith('http') && got.length === 0, `${sel}：全体と理由を見せて確かめる（同意済みの host でも）`);
    await p.keyboard.press('Escape');
    ok(requests.length === n0, `${sel}：やめれば要求なし`);
  }
  for (const [sel, name] of [['#js', 'javascript:'], ['#data', 'data:'], ['#file', 'file:']]) {
    const n0 = requests.length;
    const got = await popups(ctx, async () => { await p.click(sel); await p.waitForTimeout(150); });
    const d = await dlg(p);
    ok(d && d.buttons.join() === 'cancel' && got.length === 0 && p.url().split('#')[0] === url && requests.length === n0, `${name} は開かない（「開く」がなく、動かない）`);
    ok(!(await p.evaluate(() => window.__pwned)), `${name} は何も実行しない`);
    await p.keyboard.press('Escape');
  }
  // target=_blank も、確かめるまで開かない
  const got = await popups(ctx, async () => { await p.click('#blank'); await p.waitForTimeout(150); });
  ok(got.length === 0 && !!(await dlg(p)), 'target=_blank のリンクも、確かめるまで開かない');
  await p.keyboard.press('Escape');
  // 修飾キー・中ボタンでも同じ
  const m1 = await popups(ctx, async () => { await p.click('#other', { modifiers: ['Shift'] }); await p.waitForTimeout(150); });
  ok(m1.length === 0 && !!(await dlg(p)), 'Shift+クリックでも、確かめずには開かない');
  await p.keyboard.press('Escape');
  const m2 = await popups(ctx, async () => { await p.click('#other', { button: 'middle' }); await p.waitForTimeout(150); });
  ok(m2.length === 0 && !!(await dlg(p)), '中ボタンでも、確かめずには開かない');
  await p.keyboard.press('Escape');
  // キーボード：リンクへ Tab で行き Enter
  await p.focus('#other');
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok((await dlg(p)) && (await dlg(p)).host === 'other.example', 'リンクにフォーカスして Enter でも確かめる');
  await p.keyboard.press('Escape');
  await p.close();
}

// ---- 再生器が作るリンクの印（__egaOwn）は JS の性質だけ：授業の HTML の属性では外せない（format spec §11 (h)）
{
  const p = await open();
  for (const id of ['own1', 'own2', 'own3']) {
    const n0 = requests.length;
    const got = await popups(ctx, async () => { await p.click('#' + id); await p.waitForTimeout(150); });
    ok(got.length === 0 && requests.length === n0 && !!(await dlg(p)), `作者の書いた印（#${id} の属性）では確認の箱を外せない`);
    await p.keyboard.press('Escape');
  }
  ok(await p.evaluate(() => ['own1', 'own2', 'own3'].every((id) => document.getElementById(id).__egaOwn === undefined)), '属性は __egaOwn の性質にならない');
  // 再生器自身が JS で付けた印だけが効く（このリンクは箱を通さず、既定の動作に任せる）
  const r = await p.evaluate(() => { const a = document.createElement('a'); a.href = '#s-two'; a.__egaOwn = true; document.body.appendChild(a); let prevented; a.addEventListener('click', (e) => { setTimeout(() => { prevented = e.defaultPrevented; }); }, { once: true }); a.click(); return new Promise((res) => setTimeout(() => res(prevented), 50)); });
  ok(r === false, 'JS で __egaOwn を付けたリンクは、確認の箱の処理に入らない');
  await p.close();
  const own = ['kit/deck.js', 'kit/tools.js', 'kit/live.js', 'kit/presenter.js', 'kit/shape.js'].map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  const bad = own.filter(([, t]) => /(getAttribute|hasAttribute|dataset|attributes)[^\n;]*egaOwn|egaOwn[^\n;]*(getAttribute|hasAttribute|dataset)/i.test(t)).map(([f]) => f);
  ok(bad.length === 0, '__egaOwn を属性・dataset から読む所がない' + (bad.length ? '：' + bad : ''));
}

// ---- 動画（mode=video）：リンクは何もしない（これまでと同じ）
{
  const p = await open('?mode=video');
  const n0 = requests.length;
  const got = await popups(ctx, async () => { await p.click('#ext'); await p.waitForTimeout(250); });
  ok(!(await dlg(p)) && got.length === 0 && requests.length === n0 && p.url().startsWith(url), '動画：外へのリンクは何も起こさない（箱もなく、窓も動かない）');
  await p.click('#inner'); await p.waitForTimeout(150);
  ok(await st(p) === '1:0', '動画：授業の中のリンクも動かない（これまでと同じ）');
  await p.close();
}

// ---- 印刷：箱は出さず、リンクは押せない（CSS）
{
  const p = await open();
  await p.click('#ext'); await p.waitForTimeout(100);
  await p.emulateMedia({ media: 'print' });
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('deck-extlink')).display) === 'none', '印刷では確認の箱を隠す');
  await p.keyboard.press('Escape');
  await p.close();
}

// ---- sandbox の枠（編集のプレビューと同じ allow-scripts allow-modals。allow-popups なし）
{
  const html = fs.readFileSync(out, 'utf8');
  for (const dev of [true, false]) {
    const host = path.join(work, dev ? 'host-dev.html' : 'host-plain.html');
    const inner = dev ? html.replace('<head>', '<head><script>window.DECK_DEV = true;</script>') : html;
    fs.writeFileSync(host, `<!DOCTYPE html><meta charset="utf-8"><iframe id="f" style="width:1280px;height:720px" sandbox="allow-scripts allow-modals" srcdoc="${inner.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await p.goto(fileUrl(host));
    const fr = p.frameLocator('#f');
    await fr.locator('#ext').waitFor();
    await p.waitForTimeout(500);
    const n0 = requests.length;
    const got = await popups(ctx, async () => { await fr.locator('#ext').click(); await p.waitForTimeout(250); });
    const f = p.frames().find((x) => x !== p.mainFrame());
    const d = await f.evaluate(() => { const e = document.getElementById('deck-extlink'); return e ? { buttons: [...e.querySelectorAll('button')].map((x) => x.className), title: e.querySelector('.t').textContent, host: e.querySelector('.host').textContent } : null; });
    ok(d && got.length === 0 && requests.length === n0, `${dev ? 'プレビュー' : '枠の中の再生器'}：同意するまで開かない・枠は動かない`);
    if (dev) ok(d && d.buttons.join() === 'cancel' && d.host === 'example.org', 'プレビュー：外へは出さない（「開く」がなく、行き先だけ見せる）');
    else {
      const o = await popups(ctx, async () => { await f.evaluate(() => document.querySelector('#deck-extlink button.go').click()); });
      ok(!!d && d.buttons.join() === 'cancel,go' && f.url() === 'about:srcdoc', 'allow-popups のない枠：確かめる箱は出る。開いても枠そのものは移らない');
      for (const x of o) await x.close();
    }
    ok(await f.evaluate(() => location.href) === 'about:srcdoc', '枠の URL は動かない');
    await p.close();
  }
}

await b.close();
ok(errs.length === 0, 'コンソールのエラーなし' + (errs.length ? '：' + errs.join(' | ') : ''));
console.log(fails ? `\nFAIL: ${fails}` : '\nOK');
process.exit(fails ? 1 : 0);
