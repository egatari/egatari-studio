// Egatari Viewer のキー：送りのキー（矢印・Space・PageUp/PageDown・Home/End）が、フォーカスがどこにあっても教材を動かすか
// （tools/test-play.mjs が Chromium で、tools/test-viewer-webkit.mjs が WebKit で使う）。見ること：
//   開いた直後（何も押さずに）・Viewer の帯を押した後・Viewer のボタンにフォーカスがある間・教材の中を押した後・タブを切り替えて戻った後。
//   1 回押して 1 つだけ動く（枠の中で押したキーを Viewer がもう一度送らない）。ボタンの上の Space はボタンを押す（送らない）。
//   教材が自分に送った「キー」の知らせは効かない（play/lesson-shim.js は Viewer のページからの知らせだけを受ける）
//   checkViewerKeys({ctx, p, f, ok, until, engine}) — p は再生中の Viewer のページ、f は教材の枠（DECK.ready）
export async function checkViewerKeys({ ctx, p, f, ok, until, engine }) {
  const pos = () => f.evaluate(() => { const s = DECK.state(); return { i: s.slide - 1, k: s.step, n: DECK.slides.length }; });
  const go = (i, k) => f.evaluate(([i, k]) => DECK.go(i, k, false), [i, k]);
  const same = (a, b) => a.i === b.i && a.k === b.k;
  // where one press of each key from (0, 0) lands, by the player's own path (a keydown on the lesson's document, as kit/tools.js press())
  const expect = {};
  for (const k of ['ArrowRight', 'PageDown', ' ', 'ArrowDown', 'End']) {
    await go(0, 0);
    await f.evaluate((key) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })), k);
    expect[k] = await pos();
  }
  await go(0, 0);
  const KEY = { ' ': 'Space' };
  // press one key from (0, 0) (or from the end for the keys that go back) and see that it lands exactly where the player's own press does
  async function tryKeys(label, { space = true } = {}) {
    const bad = [];
    for (const k of ['ArrowRight', 'PageDown', ' ', 'ArrowDown', 'End']) {
      if (k === ' ' && !space) continue;
      await go(0, 0);
      await p.keyboard.press(KEY[k] || k);
      if (!(await until(async () => same(await pos(), expect[k]), 2000))) bad.push(`${KEY[k] || k} → ${JSON.stringify(await pos())}`);
    }
    for (const [k, back] of [['ArrowLeft', expect.ArrowRight], ['PageUp', expect.PageDown], ['ArrowUp', expect.ArrowDown], ['Home', expect.End]]) {
      await go(back.i, back.k);
      await p.keyboard.press(k);
      if (!(await until(async () => same(await pos(), { i: 0, k: 0 }), 2000))) bad.push(`${k} → ${JSON.stringify(await pos())}`);
    }
    await go(0, 0);
    ok(bad.length === 0, `${engine} keys ${label}: → ←${space ? ' Space' : ''} PageDown PageUp ↓ ↑ End Home each move the lesson once${space ? '' : ' (Space aside: it presses the button)'} (${bad.join('; ') || 'all'})`);
  }
  ok(!same(expect.ArrowRight, { i: 0, k: 0 }) && expect.End.i === expect.End.n - 1, `${engine} keys: the lesson has somewhere to go (${JSON.stringify(expect)})`);
  await tryKeys('right after opening, without a click');
  await p.click('#lesson-title');
  await tryKeys('after a click on the Viewer\'s bar (the focus in the page)');
  await p.focus('#b-lang');
  await tryKeys('with the focus on a Viewer button', { space: false });
  await go(0, 0);
  const lang = await p.evaluate(() => document.documentElement.lang);
  await p.focus('#b-lang');
  await p.keyboard.press('Space');
  ok(await until(() => p.evaluate((l) => document.documentElement.lang !== l, lang), 2000) && same(await pos(), { i: 0, k: 0 }), `${engine} keys: Space on a Viewer button presses the button and does not move the lesson`);
  await p.click('#b-lang');
  const box = await (await p.$('#lesson')).boundingBox();
  await p.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.25);
  await tryKeys('after a click inside the lesson (the keys go to the frame itself)');
  const other = await ctx.newPage();
  await other.goto('about:blank'); await other.bringToFront();
  await p.bringToFront();
  await tryKeys('after switching to another tab and back');
  await other.close();
  await p.click('#lesson-title');
  await f.evaluate(() => window.postMessage({ egaViewer: 'key', key: 'End' }, '*'));
  await new Promise((r) => setTimeout(r, 400));
  ok(same(await pos(), { i: 0, k: 0 }), `${engine} keys: a key message the lesson sends itself does nothing (only the Viewer's page hands keys over)`);
}
