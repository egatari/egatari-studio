// 編集アプリの試験の助け：保存の前の「このファイルは、あなたが作ったものですか。」（format spec §7.3。app/main.js の askEditRole）に、作成者と答えたことにする。
// 作成者・ライセンスのある教材を開いて保存する試験が、その問いで止まらないように。問いそのものは tools/test-metadata-edits.mjs で試す
//   answerCreator(browser)：この後に作る context と page で、window.__APP_TEST_EDIT_ROLE = 'creator'
export function answerCreator(browser) {
  const init = () => { window.__APP_TEST_EDIT_ROLE = 'creator'; };
  const nc = browser.newContext.bind(browser), np = browser.newPage.bind(browser);
  browser.newContext = async (o) => { const c = await nc(o); await c.addInitScript(init); return c; };
  browser.newPage = async (o) => { const p = await np(o); await p.addInitScript(init); return p; };
  return browser;
}
