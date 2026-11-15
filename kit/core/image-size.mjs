// 埋め込んだ画像の大きさ（data: URI を戻したバイト数）。組み立てた HTML をコマンド版と編集アプリで同じように調べる
import { parse } from 'parse5';

const MAX_IMAGE_BYTES = 1048576;
const attr = (n, name) => (n.attrs || []).find((a) => a.name === name)?.value || '';
function dataBytes(src) {
  const m = /^data:([^,]*),([\s\S]*)$/i.exec(src.trim());
  if (!m) return null;
  if (!/;base64$/i.test(m[1])) return new TextEncoder().encode(m[2].replace(/%[\da-f]{2}/gi, 'a')).length;
  let data;
  try { data = decodeURIComponent(m[2]).replace(/\s/g, ''); } catch { return null; }
  if (!/^[a-z\d+/]*={0,2}$/i.test(data) || data.length % 4 === 1) return null;
  return Math.floor(data.replace(/=+$/, '').length * 3 / 4);
}

export function imageSizeFindings(html) {
  const out = [];
  let index = 0, count = 0, total = 0;
  const walk = (n, i = null) => {
    // パーツの画像はパーツ自身が知らせる。見本の文字列やテンプレートの画像も数えない
    if (/^m-/.test(n.tagName || '') || ['script', 'style', 'template', 'textarea'].includes(n.tagName)) return;
    if (n.tagName === 'section' && attr(n, 'class').split(/\s+/).includes('slide')) i = index++;
    if (n.tagName === 'img') {
      const bytes = dataBytes(attr(n, 'src'));
      if (bytes !== null) {
        count++; total += bytes;
        if (bytes > MAX_IMAGE_BYTES) out.push({ i, sev: 'warn', code: 'imgTooLarge', a: { image: count, n: bytes, max: MAX_IMAGE_BYTES } });
      }
    }
    for (const c of n.childNodes || []) walk(c, i);
  };
  walk(parse(String(html)));
  if (count) out.push({ i: null, sev: 'info', code: 'imgTotal', a: { n: total, count } });
  return out;
}
