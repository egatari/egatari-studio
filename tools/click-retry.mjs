// test-all: part of test-app
// 開いたばかりの重ね（確かめの窓・「開く ▾」の一覧）のボタンを押す。押しても効かなかったら（プレビューに行ってしまった）もう一度押す
//   await clickUntil(page, '#dlg-discard', () => page.waitForSelector('#dlg[open] #dlg-discard', { state: 'detached', timeout: 2500 }));
// 重ねはプレビューの iframe（sandbox で origin を持たない → 別のプロセス）の上に出る。macOS の CI では、重ねを出した直後（品質チェックの板を
// 閉じて枠の大きさが変わった直後など）に押すと、押したものが重ねのボタンではなく下の iframe に届き、ページには何も起きないことがある
// （4 回とも iframe の mousedown・mouseup・click が数えられ、ページには何も来なかった）。Playwright が押す前に確かめるのは
// ページの中の elementFromPoint だけで、ブラウザが押したものを渡す先は見ないので、確かめは通る。重ねの描画が落ち着けば次の押しは届く。
// effect：押した効果が出るのを待つ関数（出なければ投げる）。押す前から効果が出ていれば 1 回で済む
export async function clickUntil(page, selector, effect, { tries = 5 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    await page.click(selector);
    try { await effect(); return i; } catch (e) { last = e; }
  }
  throw last;
}
