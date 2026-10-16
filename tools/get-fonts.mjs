// BIZ UDPゴシック（OFL）の TTF を fonts/ に取ってくる：node tools/get-fonts.mjs
// build が使う字だけに絞って埋め込む（ないときは @fontsource の分割ファイルを使う）。curl も sh も要らない（Windows でも動く）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const base = 'https://github.com/google/fonts/raw/main/ofl/bizudpgothic/';
fs.mkdirSync(dir, { recursive: true });
for (const w of ['Regular', 'Bold']) {
  const name = `BIZUDPGothic-${w}.ttf`, out = path.join(dir, name);
  if (fs.existsSync(out)) continue;
  const res = await fetch(base + name);
  if (!res.ok) { console.error(`failed: ${base + name} (${res.status})`); process.exit(1); }
  fs.writeFileSync(out + '.part', Buffer.from(await res.arrayBuffer()));
  fs.renameSync(out + '.part', out);
}
console.log('ok: ' + fs.readdirSync(dir).filter((f) => f.endsWith('.ttf')).join(' '));
