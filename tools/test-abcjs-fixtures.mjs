// test-all: part of test-abcjs-browser
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = fs.readdirSync(path.join(ROOT, 'vendor/components/sha256')).find((x) => x.startsWith('011b72fe'));
export const fixtures = Object.fromEntries(['doremi', 'chords', 'kaeru', 'rhythm', 'ties'].map((name) => [name, JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/components/sha256', dir, 'fixtures', name + '.json'), 'utf8'))]));
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
