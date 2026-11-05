// test-all: part of test-abcjs-browser
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { LOCK_FILE, resolveCatalogueContent } from '../kit/core/components-lock.mjs';
import { LOCK2_FILE } from '../kit/core/parts2.mjs';
export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// score の写しの置き場所は既定のカタログの写し（components2.lock.json の catalogues.<版>.content）で引く（sha256 を決め打ちにしない：
// ほかのファイル（README・CHANGELOG・fixtures など）だけが部品庫のリリースで変わっても、index.js が同じなら版はそのまま）
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, LOCK_FILE), 'utf8'));
const lock2 = JSON.parse(fs.readFileSync(path.join(ROOT, LOCK2_FILE), 'utf8'));
const scoreVersion = lock2.catalogues[lock2.default].parts.score;
const dir = resolveCatalogueContent(path, ROOT, lock, lock2, lock2.default, 'score', scoreVersion);
export const fixtures = Object.fromEntries(['doremi', 'chords', 'kaeru', 'rhythm', 'ties'].map((name) => [name, JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', name + '.json'), 'utf8'))]));
export const scoreDeck = (abc) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Score</title></head><body><div id="stage"><section class="slide" id="score-test"><h2>Score</h2><div class="body"><m-score style="height:400px" aria-label="Score"><script type="application/json">${JSON.stringify({ abc }).replace(/</g, '\\u003c')}</script></m-score></div></section></div></body></html>`;
export function scoreData(html) {
  let result;
  const walk = (n) => {
    if (n.tagName === 'm-score') {
      const s = n.childNodes.find((c) => c.tagName === 'script');
      result = JSON.parse(s.childNodes[0].value);
    } else for (const c of n.childNodes || []) walk(c);
  };
  walk(parse(html)); return result;
}
