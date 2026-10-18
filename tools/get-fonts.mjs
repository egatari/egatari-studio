// BIZ UDPゴシックと BIZ UDP明朝（どちらも OFL）の TTF を fonts/ に取ってくる：node tools/get-fonts.mjs
// build が使う字だけに絞って埋め込む（ないときは @fontsource の分割ファイルを使う。明朝はデッキが明朝を使うときだけ）。curl も sh も要らない（Windows でも動く）
// 取ってくる先は google/fonts の決まったコミットで、大きさと SHA-256 を確かめてから置く（違えば置かずに止める）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const COMMIT = '6ce172f74aa355ea43eb964fa4a91570a4d3064d';   // google/fonts、ofl/bizudpgothic と ofl/bizudpmincho を最後に変えたコミット（2026-03-03）
const BASE = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/`;
const FILES = {
  'BIZUDPGothic-Regular.ttf': { dir: 'bizudpgothic', bytes: 4669688, sha256: '258d7156c165f2ff774b6efee637c22c3b950de0d8a10e501137061bc8085d01' },
  'BIZUDPGothic-Bold.ttf': { dir: 'bizudpgothic', bytes: 4640596, sha256: '30eba52fc837e8b62c97d4b82e6706583149fb7294e3712dd71a655eaea80a90' },
  'BIZUDPMincho-Regular.ttf': { dir: 'bizudpmincho', bytes: 6156444, sha256: 'dbcea04578ac1e9d3484525e870ce491bd04361768f4d2ba4b827d96e20f891d' },
  'BIZUDPMincho-Bold.ttf': { dir: 'bizudpmincho', bytes: 7109432, sha256: '99618e39b881597efc03d58706bd194757c968c1bf7a7017a893efead6b1b260' },
};

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
fs.mkdirSync(dir, { recursive: true });
for (const [name, want] of Object.entries(FILES)) {
  const out = path.join(dir, name);
  if (fs.existsSync(out) && fs.statSync(out).size === want.bytes && sha(fs.readFileSync(out)) === want.sha256) continue;
  const url = BASE + want.dir + '/' + name;
  const res = await fetch(url);
  if (!res.ok) { console.error(`failed: ${url} (${res.status})`); process.exit(1); }
  // 決めた大きさを超えたら読むのをやめる（配布元が変わっても大きなものを受け取らない）
  const chunks = []; let n = 0;
  for await (const c of res.body) {
    n += c.length;
    if (n > want.bytes) { console.error(`failed: ${name} is larger than expected (${want.bytes} bytes)`); process.exit(1); }
    chunks.push(c);
  }
  const buf = Buffer.concat(chunks);
  if (buf.length !== want.bytes || sha(buf) !== want.sha256) { console.error(`failed: ${name} does not match the expected SHA-256`); process.exit(1); }
  fs.writeFileSync(out + '.part', buf);
  fs.renameSync(out + '.part', out);
}
console.log('ok: ' + Object.keys(FILES).join(' '));
