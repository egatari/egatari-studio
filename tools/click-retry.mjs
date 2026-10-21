// test-all: part of test-app
// 開いたばかりの重ね（確かめの窓・「開く ▾」の一覧）のボタンを押す。押しても効かなかったら（プレビューに行ってしまった）もう一度押す
//   await clickUntil(page, '#dlg-discard', () => page.waitForSelector('#dlg[open] #dlg-discard', { state: 'detached', timeout: 2500 }));
// 重ねはプレビューの iframe（sandbox で origin を持たない → 別のプロセス）の上に出る。macOS の CI では、重ねを出した直後（品質チェックの板を
// 閉じて枠の大きさが変わった直後など）に押すと、押したものが重ねのボタンではなく下の iframe に届き、ページには何も起きないことがある
// （4 回とも iframe の mousedown・mouseup・click が数えられ、ページには何も来なかった）。Playwright が押す前に確かめるのは
// ページの中の elementFromPoint だけで、ブラウザが押したものを渡す先は見ないので、確かめは通る。重ねの描画が落ち着けば次の押しは届く。
// effect：押した効果が出るのを待つ関数（出なければ投げる）。押す前から効果が出ていれば 1 回で済む
// 2 回以上押したときは、数えられるように標準出力に書く（"click-retry: <selector> needed N clicks"）
export async function clickUntil(page, selector, effect, { tries = 5 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    await page.click(selector);
    try {
      await effect();
      if (i > 0) console.log(`click-retry: ${selector} needed ${i + 1} clicks`);
      return i;
    } catch (e) { last = e; }
  }
  throw last;
}

const EFFECT_MS = 2500;

// 確かめの窓のボタン（#dlg-*）：押した効果は「その窓が閉じる」（ボタンが開いている窓の中から消える。次の確かめが同じ窓で開いても、ボタンは作り直される）
export async function clickDlg(page, selector) {
  const h = await page.waitForSelector(selector);
  return clickUntil(page, selector, () => page.waitForFunction((b) => !b.isConnected || !b.closest('dialog[open]'), h, { timeout: EFFECT_MS }));
}

// 「開く ▾」「保存 ▾」「書き出す ▾」を開く：効果は一覧が見えること
export function clickMenuOpen(page, selector) {
  return clickUntil(page, selector, async () => {
    const id = await page.getAttribute(selector, 'aria-controls');
    await page.waitForSelector(`#${id}:not([hidden])`, { timeout: EFFECT_MS });
  });
}

// 一覧の項目：効果は一覧が閉じること（項目を選ぶと閉じる）
export async function clickMenuItem(page, selector) {
  const h = await page.waitForSelector(selector, { state: 'attached' });
  return clickUntil(page, selector, () => page.waitForFunction((b) => { const l = b.closest('.menu-list'); return !l || l.hidden; }, h, { timeout: EFFECT_MS }));
}
