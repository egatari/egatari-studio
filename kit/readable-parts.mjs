// パーツの読める中身（format spec §2.1 Readable content of components、backlog #216）を、組んだ文書を再生器（ヘッドレスのブラウザ、kit/browser.mjs）で
// 開いて DECK.readableParts() で読む。1 ファイルへの書き出し（kit/core/portable.mjs）が nodeEnv.readableParts を通して使う（印のあるときだけ。kit/article-steps.mjs と同じ開き方）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, fileUrl } from './browser.mjs';
import { READABLE_PROBE } from './core/readable-parts.mjs';

// html：組んだ文書の字。返すもの：{スライドの鍵: [HTML の字…]}（作り直す前。kit/core/readable-parts.mjs の readablePartsOf が確かめる）
export async function readParts(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-readable-'));
  const file = path.join(dir, 'deck.html');
  let browser = null;
  try {
    fs.writeFileSync(file, html);
    browser = await launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(fileUrl(file));
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 30000 });   // eslint-disable-line no-undef
    return await page.evaluate(READABLE_PROBE);
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
