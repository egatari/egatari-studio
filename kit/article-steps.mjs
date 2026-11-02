// 本文のステップへのリンクの行き先（format spec §9C.8 の 1：ないスライド・ないステップへのリンクは誤りで、書き出さない）を、
// 組んだ文書を再生器（ヘッドレスのブラウザ、kit/browser.mjs）で開いて DECK.resolveFragment で確かめる。check（kit/check.mjs の M）と同じ確かめ方。
// 1 ファイルへの書き出し（kit/core/portable.mjs）が nodeEnv.articleSteps を通して使う
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, fileUrl } from './browser.mjs';
import { STEP_PROBE } from './core/article.mjs';

// html：組んだ文書の字。links："<slideKey>:<stepKey>" の並び。返すもの：{リンク → {error, max} か {legacy, id}}
export async function resolveStepLinks(html, links) {
  if (!links.length) return {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egatari-steps-'));
  const file = path.join(dir, 'deck.html');
  let browser = null;
  try {
    fs.writeFileSync(file, html);
    browser = await launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(fileUrl(file));
    await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 30000 });   // eslint-disable-line no-undef
    return await page.evaluate(STEP_PROBE, links);
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
