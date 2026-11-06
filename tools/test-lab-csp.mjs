// ブラウザの TTS の窓（lab/tts-helper.html）の決まり（CSP）と、jsDelivr から取るコードの中身の固定（SRI）の試験。ネットワークを使わない
// test-all: unit
//   node tools/test-lab-csp.mjs
// 確かめること：'unsafe-eval' がない・つなぐ先が決まった host だけ（*.huggingface.co・*.hf.co のような広い許しがない）・worker を許さない・
// import map が lab/tts-engine.mjs の SRI の表と同じで、CSP の 'sha256-…' がその import map のもの（合わないと import map が止められ、
// integrity も黙って効かなくなる）・jsDelivr の URL はどれも版が x.y.z で、表に sha384 がある・コードの import() は importPinned の 1 か所だけ・
// Kokoro の重み・設定・声の表（固定の版、sha256 と大きさ。合わない中身・表にないファイルを断る）。
// 表の中身が配信元と合うかは node tools/tts-sri.mjs --fetch（ネットワークを使う）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../lab/tts-engine.mjs';
import { PAGES, IMPORT_MAP_RE, cspHash } from './tts-sri.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) fails++; };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ---------------------------------------------------------------- the policy of the TTS window
const helper = read('lab/tts-helper.html');
const metas = [...helper.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g)];
ok(metas.length === 1, 'tts-helper.html: exactly one CSP <meta>');
const csp = metas[0]?.[1] || '';
const dirs = new Map();
for (const part of csp.split(';').map((s) => s.trim()).filter(Boolean)) {
  const [name, ...vals] = part.split(/\s+/);
  ok(!dirs.has(name), `CSP: "${name}" appears once`);
  dirs.set(name, vals);
}
const set = (name) => [...(dirs.get(name) || [])].sort().join(' ');
const importMap = (IMPORT_MAP_RE.exec(helper) || [])[1];
ok(set('default-src') === "'none'", "CSP: default-src 'none'");
ok(!csp.includes("'unsafe-eval'"), "CSP: no 'unsafe-eval' (onnxruntime-web needs only 'wasm-unsafe-eval')");
ok(!csp.includes("'unsafe-inline'") || set('style-src') === "'unsafe-inline'", "CSP: 'unsafe-inline' only for styles");
ok(!/\*/.test(csp), 'CSP: no wildcard sources (no *.huggingface.co, *.hf.co)');
ok(set('script-src') === ["'self'", 'https://cdn.jsdelivr.net', "'wasm-unsafe-eval'", importMap ? cspHash(importMap) : 'missing'].sort().join(' '),
  "CSP: script-src is 'self', jsDelivr, 'wasm-unsafe-eval' and the hash of this page's import map");
ok(set('connect-src') === ["'self'", 'https://cdn.jsdelivr.net', 'https://huggingface.co', 'https://us.aws.cdn.hf.co', 'blob:'].sort().join(' '),
  'CSP: connect-src is the site, jsDelivr, huggingface.co and the host it redirects the pinned files to (us.aws.cdn.hf.co), and blob:');
ok(set('worker-src') === "'none'", "CSP: worker-src 'none'");
for (const d of ['object-src', 'base-uri', 'form-action', 'frame-src']) ok(set(d) === "'none'", `CSP: ${d} 'none'`);

// ---------------------------------------------------------------- the import maps (SRI for modules)
const want = E.importMapText();
for (const rel of PAGES) {
  const html = read(rel), maps = [...html.matchAll(/<script type="importmap">/g)];
  ok(maps.length === 1, `${rel}: exactly one import map`);
  ok((IMPORT_MAP_RE.exec(html) || [])[1] === want, `${rel}: the import map is the SRI table of lab/tts-engine.mjs (node tools/tts-sri.mjs writes it)`);
  const firstModule = html.search(/<script type="module"/);
  ok(firstModule < 0 || html.search(IMPORT_MAP_RE) < firstModule, `${rel}: the import map comes before the first module script`);
}
const parsed = JSON.parse(want);
ok(parsed.imports?.[E.SRI_MARK] === './tts-engine.mjs', 'import map: carries the mark that importPinned checks');
ok(JSON.stringify(Object.keys(parsed.integrity).sort()) === JSON.stringify([...E.MODULE_URLS].sort()), 'import map: integrity for every module URL');

// ---------------------------------------------------------------- the table: every jsDelivr URL pinned by version and by content
const cdnUrls = Object.entries(E).filter(([, v]) => typeof v === 'string' && v.startsWith('https://cdn.jsdelivr.net/') && /\.(m?js|wasm)$/.test(v));
ok(cdnUrls.length >= 7, `engine exports ${cdnUrls.length} jsDelivr file URLs`);
for (const [name, url] of cdnUrls) {
  ok(/@\d+\.\d+\.\d+\//.test(url), `${name}: exact version x.y.z (${url.replace('https://cdn.jsdelivr.net/npm/', '')})`);
  ok(/^sha384-[A-Za-z0-9+/]{64}$/.test(E.SRI[url] || ''), `${name}: sha384 in the SRI table`);
  ok(E.MODULE_URLS.includes(url) !== E.WASM_URLS.includes(url), `${name}: listed once, as a module or as WebAssembly`);
}
ok(Object.keys(E.SRI).length === E.MODULE_URLS.length + E.WASM_URLS.length, 'SRI table: nothing extra');
ok(/^[0-9a-f]{40}$/.test(E.HF_REV) && /^[0-9a-f]{40}$/.test(E.KOKORO_REV), 'Hugging Face revisions are full commit hashes');

// ---------------------------------------------------------------- Kokoro's model, config and voices: pinned to KOKORO_REV and checked by sha256
const { KOKORO_VOICES } = await import('../lab/tts-voices.mjs');
const kf = E.KOKORO_FILES, kwant = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model.onnx', ...KOKORO_VOICES.map((v) => `voices/${v}.bin`)];
ok(JSON.stringify(Object.keys(kf).sort()) === JSON.stringify([...kwant].sort()), `Kokoro pin table: exactly the model, config, tokenizer and the ${KOKORO_VOICES.length} voices the editor offers`);
ok(Object.values(kf).every(([sri, n]) => /^sha256-[A-Za-z0-9+/]{43}=$/.test(sri) && Number.isInteger(n) && n > 0), 'Kokoro pin table: a sha256 and a size for every file');
ok(KOKORO_VOICES.every((v) => kf[`voices/${v}.bin`][1] === 522240), 'Kokoro pin table: every voice is 522240 bytes (510 × 256 float32)');
ok(E.KOKORO_BYTES === kf['onnx/model.onnx'][1] + kf['tokenizer.json'][1] + kf['tokenizer_config.json'][1] + kf['config.json'][1] + 2 * 522240, 'KOKORO_BYTES (the progress total) agrees with the pin table');
ok(E.KOKORO_BASE === `https://huggingface.co/${E.KOKORO_REPO}/resolve/${E.KOKORO_REV}/`, 'Kokoro files are fetched from the pinned commit');
const KR = `https://huggingface.co/${E.KOKORO_REPO}/resolve/`;
ok(E.kokoroPath(KR + 'main/voices/af_heart.bin') === 'voices/af_heart.bin' && E.kokoroPath(KR + E.KOKORO_REV + '/onnx/model.onnx?download=true') === 'onnx/model.onnx', 'kokoroPath: main and the pinned commit map to the table');
ok(E.kokoroPath(KR + 'abc123/config.json') === null && E.kokoroPath(KR + 'main/onnx/model_q4.onnx') === null && E.kokoroPath(KR + 'main/voices/jf_alpha.bin') === null, 'kokoroPath: another revision or a file outside the table is refused');
ok(E.kokoroPath(`${E.HF_BASE}/onnx_fp16/dit.onnx`) === undefined && E.kokoroPath('https://cdn.jsdelivr.net/x') === undefined, 'kokoroPath: other URLs are not touched');
{ // kokoroFetch with a fake network: the right bytes pass, wrong bytes fail, unpinned files never reach the network
  const body = new TextEncoder().encode('{"x":1}'), sri = await E.sha256Sri(body), calls = [];
  const saved = kf['config.json'];
  const net = async (u) => { calls.push(String(u)); return new Response(String(u).includes('bad') ? 'nope!!!' : body); };
  const realFiles = E.KOKORO_FILES;
  ok(saved[0] !== sri, 'fake: the fixture differs from the pinned config.json');
  const fetchFile = (bytes) => E.fetchKokoroFile('config.json', { fetchImpl: async (u) => { calls.push(String(u)); return new Response(bytes); } });
  let err = null; try { await fetchFile(body); } catch (e) { err = e; }
  ok(err && /pinned/.test(err.message) && calls[0] === E.KOKORO_BASE + 'config.json', `kokoroFetch: content that does not match the table is refused, and it asked the pinned commit (${err && err.message})`);
  calls.length = 0;
  const f = E.kokoroFetch(net);
  const r = await f(KR + 'main/onnx/model_q4.onnx');
  ok(r.status === 404 && calls.length === 0, 'kokoroFetch: a file outside the table is answered 404 without a request');
  await f('https://example.org/other');
  ok(calls.length === 1 && calls[0] === 'https://example.org/other', 'kokoroFetch: other URLs pass through unchanged');
  ok(realFiles === E.KOKORO_FILES && Object.isFrozen(E.KOKORO_FILES), 'Kokoro pin table is frozen');
}
const tc = { // a fake Cache Storage: one good entry is kept, a stale one is deleted
  stores: new Map([['kokoro-voices', new Map([[KR + 'main/voices/af_heart.bin', new Uint8Array(3)], [KR + 'main/voices/af_bella.bin', new Uint8Array(3)]])]]),
  async has(n) { return this.stores.has(n); },
  async open(n) { const m = this.stores.get(n); return { keys: async () => [...m.keys()], match: async (k) => (m.has(k) ? new Response(m.get(k)) : undefined), delete: async (k) => m.delete(k) }; },
};
ok(await E.verifyKokoroCaches(tc) === 2 && tc.stores.get('kokoro-voices').size === 0, 'verifyKokoroCaches: cached Kokoro files that do not match the table are deleted');

// ---------------------------------------------------------------- code: only pinned imports, and WebAssembly fetched with integrity
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
for (const rel of ['lab/tts-engine.mjs', 'lab/tts-helper.js', 'lab/irodori.js']) {
  const code = strip(read(rel));
  const imports = [...code.matchAll(/\bimport\s*\(/g)].length;
  ok(imports === (rel === 'lab/tts-engine.mjs' ? 1 : 0), `${rel}: ${imports} dynamic import() (only importPinned may import)`);
  ok(!/wasmPaths\s*=\s*ORT_WASM\s*;?\s*$/m.test(code) || /wasmBinary\s*=\s*await fetchVerified/.test(code), `${rel}: onnxruntime-web gets verified WebAssembly bytes`);
}
const engine = strip(read('lab/tts-engine.mjs'));
ok(/fetch\(url, \{ integrity: SRI\[url\]/.test(engine), 'fetchVerified passes the pinned integrity to fetch');
ok(/fetchVerified\(KOKORO_WASM_URL\)/.test(engine) && /fetchVerified\(ORT_WASM_URL\)/.test(engine), 'both WebAssembly files are fetched with fetchVerified');

if (fails) { console.log(`\n${fails} FAIL`); process.exit(1); }
console.log('\nall ok');
