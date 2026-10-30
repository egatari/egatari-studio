// tools/fixtures/parts2 の probe を、前の書き手が許した依存不足のファイルにする（Node とブラウザの回帰試験）。
import assert from 'node:assert/strict';
import { readPortable, sha256Hex, sourceSha256, scanDocument, replaceIndexText } from '../kit/core/portable.mjs';
import { normalizeEol } from '../kit/core/identity-hash.mjs';
const safe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--').replace(/\r\n?/g, '\n');

export async function missingParts2Requirement(html) {
  const read = await readPortable(html);
  const oldIndex = structuredClone(read.index), probe = oldIndex.components.find((p) => p.name === 'probe');
  const oldCode = new TextDecoder().decode(read.files[probe.path]);
  const missingCode = oldCode.replace('requires: {base: "1.0.0"}', 'requires: {base: "9.9.9"}');
  assert.notEqual(missingCode, oldCode);
  probe.requires.base = '9.9.9';
  probe.sha256 = await sha256Hex(normalizeEol(new TextEncoder().encode(missingCode)));
  const blob = oldIndex.blobs[oldIndex.files[probe.path]];
  assert.equal(blob.chunks.length, 1);
  blob.bytes = Buffer.byteLength(missingCode);
  blob.sha256 = await sha256Hex(missingCode);
  let oldHtml = html.replace(safe(oldCode), () => safe(missingCode));
  const chunk = scanDocument(oldHtml).byId.get(blob.chunks[0]);
  oldHtml = oldHtml.slice(0, chunk.start) + `<script type="application/octet-stream" id="${blob.chunks[0]}">${Buffer.from(missingCode).toString('base64')}</script>` + oldHtml.slice(chunk.end);
  oldIndex.sourceSha256 = await sourceSha256(Object.fromEntries(Object.entries(oldIndex.files).map(([p, id]) => [p, oldIndex.blobs[id].sha256])));
  const dm = scanDocument(oldHtml).byId.get('deck-meta');
  oldHtml = oldHtml.slice(0, dm.start) + `<script type="application/json" id="deck-meta">${JSON.stringify({ ...read.deckMeta, sourceSha256: oldIndex.sourceSha256 })}</script>` + oldHtml.slice(dm.end);
  oldHtml = await replaceIndexText(oldHtml, JSON.stringify(oldIndex));
  return oldHtml;
}
