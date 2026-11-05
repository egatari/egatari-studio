// パーツの画面の名前（kit/core/part-labels.mjs）が、部品庫 2.x の既定のカタログの manifest の display と合うか（npm run gen:check。ネットワークなし）
//   node tools/part-labels-check.mjs
// components2.lock.json の default → vendor/components-2/manifest-<版>.json を直に読み、display のある要素のパーツすべてについて
// partLabel(tag, 'ja') と partLabel(tag, 'en') が display の日本語・英語と同じかを見る。display のない要素のパーツは、表（PART_LABELS）に ja・en があること。
// 合わなければ npm run gen（kit/core/llm-pack-data.mjs の tiers.parts.<タグ>.display を写し直す）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PART_LABELS, partLabel } from '../kit/core/part-labels.mjs';
import { LOCK2_FILE, VENDOR_PARTS2 } from '../kit/core/parts2.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lock2 = JSON.parse(fs.readFileSync(path.join(ROOT, LOCK2_FILE), 'utf8'));
const version = lock2.default;
const file = path.join(ROOT, ...VENDOR_PARTS2, `manifest-${version}.json`);
const m = JSON.parse(fs.readFileSync(file, 'utf8'));
const want = (d) => (typeof d === 'string' ? (([ja, en]) => ({ ja, en }))(d.split(' / ').map((x) => x.trim())) : { ja: d.ja, en: d.en });
const bad = [];
let named = 0, local = 0;
for (const c of Object.values(m.components)) {
  if (c.kind !== 'element' || !c.tag) continue;
  if (c.display != null) {
    const w = want(c.display);
    named++;
    for (const lang of ['ja', 'en']) {
      const got = partLabel(c.tag, lang);
      if (got !== w[lang]) bad.push(`${c.tag} (${lang}): part-labels says ${JSON.stringify(got)}, manifest-${version}.json display says ${JSON.stringify(w[lang])}`);
    }
  } else {
    local++;
    const x = PART_LABELS[c.tag];
    if (!x || !x.ja || !x.en) bad.push(`${c.tag}: no display in manifest-${version}.json and no ja/en name in kit/core/part-labels.mjs`);
  }
}
if (bad.length) {
  console.error(`part labels do not match the parts library ${version} manifest (run npm run gen, or add the name to kit/core/part-labels.mjs):\n  ` + bad.join('\n  '));
  process.exit(1);
}
console.log(`part labels: ${named} names from manifest-${version}.json display, ${local} local names; all agree`);
