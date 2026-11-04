// ブラウザの TTS の窓（lab/tts-helper.html）と試験ページ（lab/irodori.html）が jsDelivr から取るコードの中身の固定（SRI）を手入れする
//   node tools/tts-sri.mjs           2 つのページの import map と、tts-helper.html の CSP の 'sha256-…' を lab/tts-engine.mjs の SRI の表から書き直す（ネットワークを使わない）
//   node tools/tts-sri.mjs --fetch   表の URL をすべて取り、sha384 が表と合うか確かめる（ネットワークを使う。版を替えたとき。合わなければ終了コード 1）
// 試験（tools/test-lab-csp.mjs）は、ページが表と合っていることだけを確かめる（ネットワークを使わない）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SRI, importMapText } from '../lab/tts-engine.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PAGES = ['lab/tts-helper.html', 'lab/irodori.html'];
export const IMPORT_MAP_RE = /<script type="importmap">([^<]*)<\/script>/;
export const cspHash = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

function write() {
  const text = importMapText(), tag = `<script type="importmap">${text}</script>`;
  for (const rel of PAGES) {
    const file = path.join(ROOT, rel);
    let html = fs.readFileSync(file, 'utf8');
    if (!IMPORT_MAP_RE.test(html)) throw new Error(`${rel}: no <script type="importmap"> to replace`);
    html = html.replace(IMPORT_MAP_RE, () => tag);
    // CSP（あるページだけ）：script-src の 'sha256-…' を今の import map のものにする
    html = html.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*script-src [^;"]*?)'sha256-[A-Za-z0-9+/=]+'/, (_, a) => a + cspHash(text));
    fs.writeFileSync(file, html);
    console.log(`${rel}: import map ${text.length} chars, ${cspHash(text)}`);
  }
}

async function check() {
  let bad = 0;
  for (const [url, want] of Object.entries(SRI)) {
    const res = await fetch(url);
    if (!res.ok) { console.log(`FAIL ${url}: HTTP ${res.status}`); bad++; continue; }
    const got = 'sha384-' + crypto.createHash('sha384').update(Buffer.from(await res.arrayBuffer())).digest('base64');
    console.log(`${got === want ? 'ok  ' : 'FAIL'} ${url}${got === want ? '' : `\n     pinned ${want}\n     served ${got}`}`);
    if (got !== want) bad++;
  }
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--fetch')) await check(); else write();
}
