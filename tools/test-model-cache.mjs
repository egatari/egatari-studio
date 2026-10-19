// ブラウザの TTS のモデルのキャッシュ（lab/model-cache.mjs）の単体の試験：偽の Cache Storage と navigator.storage で（ブラウザなし）
// test-all: unit（tools/test-all.mjs が見つけて、引数なしで走らせる）
//   node tools/test-model-cache.mjs
import assert from 'node:assert/strict';
import { modelCaches, deleteModelCaches, pruneOldModels, storageUsage, requestPersist, modelCacheSizes, isModelCache } from '../lab/model-cache.mjs';

// 偽の Cache Storage：{名前: {url: バイト数}}
function fakeCaches(init) {
  const m = new Map(Object.entries(init).map(([n, e]) => [n, new Map(Object.entries(e))]));
  const store = (name) => ({
    keys: async () => [...m.get(name).keys()].map((url) => ({ url })),
    match: async (req) => { const n = m.get(name).get(req.url ?? req); return n === undefined ? undefined : new Response(new Uint8Array(0), { headers: { 'content-length': String(n) } }); },
    delete: async (req) => m.get(name).delete(req.url ?? req),
  });
  return {
    m,
    keys: async () => [...m.keys()],
    open: async (n) => { if (!m.has(n)) m.set(n, new Map()); return store(n); },
    delete: async (n) => m.delete(n),
  };
}
const HF = 'https://huggingface.co/';
const OLD = 'a'.repeat(40), REV = 'b'.repeat(40);
const mk = () => fakeCaches({
  'irodori-lab-b75a9bbf2c10': { [HF + 'x/dit.onnx']: 700, [HF + 'x/dit.onnx.data']: 1000 },
  'irodori-lab-000000000000': { [HF + 'x/dit.onnx']: 5 },
  'transformers-cache': {
    [`${HF}onnx-community/Kokoro/resolve/${OLD}/onnx/model.onnx`]: 300,
    [`${HF}onnx-community/Kokoro/resolve/${REV}/onnx/model.onnx`]: 300,
    [`${HF}onnx-community/Kokoro/resolve/main/voices/af_heart.bin`]: 2,
    [`${HF}other/model/resolve/${OLD}/x.onnx`]: 9,
  },
  'my-app-cache': { 'https://example.org/a': 1 },
});

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok   ' + name); };

await t('isModelCache: Irodori caches and transformers-cache only', () => {
  assert.ok(isModelCache('irodori-lab-123') && isModelCache('transformers-cache') && !isModelCache('my-app-cache'));
});
await t('modelCaches: lists only the model caches; [] without Cache Storage', async () => {
  assert.deepEqual((await modelCaches(mk())).sort(), ['irodori-lab-000000000000', 'irodori-lab-b75a9bbf2c10', 'transformers-cache']);
  assert.deepEqual(await modelCaches(null), []);
});
await t('modelCacheSizes: sums content-length per cache', async () => {
  const s = Object.fromEntries((await modelCacheSizes(mk())).map((x) => [x.name, x.bytes]));
  assert.equal(s['irodori-lab-b75a9bbf2c10'], 1700);
  assert.equal(s['transformers-cache'], 611);
  assert.equal(s['my-app-cache'], undefined);
});
await t('pruneOldModels: deletes other Irodori versions and old Kokoro revisions; keeps the current one, main and other repos', async () => {
  const c = mk();
  const k = await pruneOldModels('irodori-lab-b75a9bbf2c10', { kokoro: { repo: 'onnx-community/Kokoro', rev: REV }, caches: c });
  assert.equal(k, 2);
  assert.deepEqual([...c.m.keys()].sort(), ['irodori-lab-b75a9bbf2c10', 'my-app-cache', 'transformers-cache']);
  assert.deepEqual([...c.m.get('transformers-cache').keys()].filter((u) => u.includes('/Kokoro/')).map((u) => u.split('/resolve/')[1].split('/')[0]).sort(), [REV, 'main'].sort());
  assert.ok(c.m.get('transformers-cache').has(`${HF}other/model/resolve/${OLD}/x.onnx`), 'another repo is not touched');
  assert.equal(await pruneOldModels('irodori-lab-b75a9bbf2c10', { kokoro: { repo: 'onnx-community/Kokoro', rev: REV }, caches: c }), 0, 'nothing left to prune');
  assert.equal(await pruneOldModels('x', { caches: null }), 0);
});
await t('deleteModelCaches: deletes every model cache, nothing else', async () => {
  const c = mk();
  assert.equal((await deleteModelCaches(c)).length, 3);
  assert.deepEqual([...c.m.keys()], ['my-app-cache']);
});
await t('storageUsage: estimate and persisted; null when not available', async () => {
  assert.deepEqual(await storageUsage({ estimate: async () => ({ usage: 1260000000, quota: 5e10 }), persisted: async () => false }), { usage: 1260000000, quota: 5e10, persisted: false });
  assert.deepEqual(await storageUsage({ estimate: async () => ({ usage: 1, quota: 2 }) }), { usage: 1, quota: 2, persisted: null });
  assert.equal(await storageUsage(null), null);
  assert.equal(await storageUsage({ estimate: async () => { throw new Error('x'); } }), null);
});
await t('requestPersist: asks only when not persisted yet; null when not available', async () => {
  let asked = 0;
  assert.equal(await requestPersist({ persisted: async () => true, persist: async () => { asked++; return true; } }), true);
  assert.equal(asked, 0);
  assert.equal(await requestPersist({ persisted: async () => false, persist: async () => { asked++; return false; } }), false);
  assert.equal(asked, 1);
  assert.equal(await requestPersist({}), null);
  assert.equal(await requestPersist(null), null);
});
console.log(`model-cache: ${n} passed`);
