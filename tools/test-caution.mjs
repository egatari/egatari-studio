// Caution build annotations, source checks (CLI/editor) and vertical layout.
//   node tools/test-caution.mjs [work folder]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from '../kit/build.mjs';
import { cautionFindings, insertCautionLabels } from '../kit/core/caution.mjs';
import { sourceFindings } from '../kit/core/check-source.mjs';
import { ruleOfCode } from '../kit/core/check-rules.mjs';
import { shareBrowser, launch, fileUrl } from '../kit/browser.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'test-caution-')));
fs.mkdirSync(work, { recursive: true });
const deck = (lang, body, vertical = false) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Caution boxes</title></head><body><div id="stage"><section class="slide noconcl static${vertical ? ' layout-tate' : ''}" id="s-caution"><h2>Boxes</h2><div class="body">${body}</div></section></div></body></html>`;
const codes = (src) => cautionFindings(src).map(({ i, sev, code }) => ({ i, sev, code }));
const expected = [{ i: 0, sev: 'error', code: 'cautionEmpty' }, { i: 0, sev: 'warn', code: 'cautionLabel' }];

for (const lang of ['ja', 'en']) {
  for (const warn of [false, true]) {
    const cls = 'caution' + (warn ? ' warn' : '');
    const label = lang === 'en' ? (warn ? 'Warning' : 'Caution') : (warn ? '警告' : '注意');
    const src = deck(lang, `<div class="${cls}">Body</div>`);
    const out = insertCautionLabels(src);
    assert.ok(out.includes(`<div class="${cls}" role="note"><span class="caution-label">${label}</span>Body</div>`));
    assert.equal(insertCautionLabels(out), out, 'insertion is byte-idempotent');
    assert.deepEqual(codes(out), [], 'generated labels are not handwritten labels');
    assert.ok(!out.includes('aria-label'), 'note does not add an accessible label');
    assert.deepEqual(codes(deck(lang, `<div class="${cls}"> </div>`)), [expected[0]]);
    for (const manual of ['注意', '警告', 'Caution', 'Warning']) for (const colon of ['', ':', '：']) {
      const authored = deck(lang, `<div class="${cls}">\n<!-- comment --><b>${manual}</b>${colon} Body</div>`);
      const built = insertCautionLabels(authored);
      assert.ok(!built.includes('class="caution-label"'), 'handwritten labels are not duplicated, in either language');
      assert.deepEqual(codes(authored), [expected[1]]);
      assert.deepEqual(codes(deck(lang, `<div class="${cls}">${manual}${colon}</div>`)), expected);
    }
  }
}
assert.deepEqual(codes(deck('en', '<div class="caution">Cautionary example</div>')), []);
assert.deepEqual(codes(deck('en', '<div class="caution"><span class="caution-label">Caution</span><!-- empty --><script>"not body text"</script></div>')), [expected[0]]);
assert.ok(insertCautionLabels(deck('en', '<div class="caution" role="alert">Body</div>')).includes('role="note"'));
const inert = deck('en', '<template><div class="caution"></div></template><script>"<div class=\'caution\'></div>"</script>');
assert.equal(insertCautionLabels(inert), inert);
const bad = deck('en', '<div class="caution"></div><div class="caution warn">Warning: Body</div>');
assert.deepEqual(sourceFindings({ deck: bad }).filter((f) => f.code.startsWith('caution')).map(({ i, sev, code }) => ({ i, sev, code })), expected);
assert.equal(ruleOfCode('cautionEmpty'), 'R-caution');
assert.equal(ruleOfCode('cautionLabel'), 'R-caution');
console.log('ok   source checks, all labels/colons, idempotence, inert examples and editor source path');

const samples = [];
for (const lang of ['ja', 'en']) for (const vertical of [false, true]) {
  const name = lang + (vertical ? '-tate' : ''), src = path.join(work, name + '.html');
  const body = lang === 'ja' ? '条件を確かめる。' : 'Check the conditions.';
  fs.writeFileSync(src, deck(lang, `<div class="caution">${body}</div><div class="caution warn">${body}</div>`, vertical));
  const first = build(src, { subset: false });
  const out = path.join(work, name + '-built.html');
  fs.writeFileSync(out, first.html);
  // Rebuild actual build output, not just the annotation helper's output.
  const second = build(out, { subset: false });
  assert.equal((second.html.match(/<span class="caution-label">/g) || []).length, 2);
  samples.push({ lang, vertical, name, out });
}
console.log('ok   actual build and rebuild for both languages and writing directions');

await shareBrowser();
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  for (const { lang, vertical, name, out } of samples) {
    await page.goto(fileUrl(out));
    await page.waitForFunction(() => window.DECK && DECK.ready);
    await page.evaluate(() => document.fonts.ready);
    const boxes = await page.locator('.body .caution').evaluateAll((nodes) => nodes.map((e) => {
      const s = getComputedStyle(e), icon = getComputedStyle(e, '::before');
      return { first: e.firstChild.outerHTML, labels: e.querySelectorAll('.caution-label').length, role: e.getAttribute('role'), aria: e.getAttribute('aria-label'), writing: s.writingMode,
        top: s.borderTopWidth, left: s.borderLeftWidth, right: s.borderRightWidth, bottom: s.borderBottomWidth, content: icon.content, mask: icon.maskImage };
    }));
    assert.deepEqual(boxes.map((b) => b.first), (lang === 'ja' ? ['注意', '警告'] : ['Caution', 'Warning']).map((t) => `<span class="caution-label">${t}</span>`));
    for (const box of boxes) {
      assert.equal(box.labels, 1); assert.equal(box.role, 'note'); assert.equal(box.aria, null);
      assert.equal(box.writing, vertical ? 'vertical-rl' : 'horizontal-tb');
      assert.equal(box.content, '""'); assert.match(box.mask, /data:image\/svg\+xml/);
    }
    assert.equal(boxes[0][vertical ? 'top' : 'left'], '6px');
    assert.equal(boxes[0][vertical ? 'left' : 'top'], '0px');
    assert.deepEqual([boxes[1].top, boxes[1].left, boxes[1].bottom, boxes[1].right], ['8px', '8px', '8px', '8px']);
    assert.notEqual(boxes[0].mask, boxes[1].mask);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(work, name + '.png') });
    console.log('ok   build, rebuild, decorative icons and ' + name + ' layout');
  }
  await page.close();
  const src = path.join(work, 'bad.html'); fs.writeFileSync(src, bad);
  const cli = spawnSync(process.execPath, ['kit/check.mjs', src, '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const findings = JSON.parse(cli.stdout).results.filter((f) => f.code.startsWith('caution'));
  assert.deepEqual(findings.map(({ sev, code }) => ({ sev, code })), expected.map(({ sev, code }) => ({ sev, code })));
  assert.equal(cli.status, 1, 'empty caution fails the CLI check');
  console.log('ok   CLI and editor share cautionEmpty/error and cautionLabel/warn');
} finally { await browser.close(); }
console.log('all caution tests ok');
