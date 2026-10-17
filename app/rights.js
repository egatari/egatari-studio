// 権利の表示（format spec §7.3）：開いた文書の metadata から、編集の前に見せるもの。ブラウザの API を使わない（Node の単体の試験でも動く）
//   rightsOf(metadata) → {title, license, copyright, attribution, creators, noDerivatives, reason}
//   reason：'nd-license'（改変を認めないライセンス：Creative Commons の -ND、All rights reserved）、
//           'copyright-only'（ライセンスがなく著作権の表示だけ）、null（改変を認める・何も書いていない）
// 改変を認めない文書は、編集の前に「権利者の著作権を侵すおそれ」を知らせ、はっきりした確認を求める
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function isNoDerivatives(license) {
  const l = str(license);
  if (!l) return false;
  const low = l.toLowerCase();
  const tokens = low.split(/[^a-z0-9]+/).filter(Boolean);
  // CC-BY-ND-4.0、CC-BY-NC-ND-4.0、https://creativecommons.org/licenses/by-nd/4.0/、by-nc-nd など
  if (tokens.includes('nd') && (tokens.includes('cc') || low.includes('creativecommons') || tokens.includes('by'))) return true;
  return /all rights reserved|無断(?:転載|複製|改変)|禁(?:転載|複製|改変)/i.test(l);
}

export function rightsOf(metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  const license = str(m.license), copyright = str(m.copyright);
  const creators = Array.isArray(m.creators) ? m.creators.filter((x) => typeof x === 'string' && x.trim()) : [];
  let reason = null;
  if (license && isNoDerivatives(license)) reason = 'nd-license';
  else if (!license && copyright) reason = 'copyright-only';
  return { title: str(m.title), license, copyright, attribution: str(m.attribution), creators, noDerivatives: !!reason, reason };
}
