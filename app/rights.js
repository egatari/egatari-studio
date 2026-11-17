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

// 変更したことを示すよう求めるライセンスか（format spec §3.6.1：Creative Commons の 4.0 のどれも）。SPDX の名前（CC-BY-4.0・CC-BY-SA-4.0・
// CC-BY-NC-ND-4.0 …）か URL（https://creativecommons.org/licenses/by-nc/4.0/ …）。CC0（権利を放棄）と 4.0 でない版は含めない
export function requiresChangeNote(license) {
  const l = str(license);
  if (!l) return false;
  const low = l.toLowerCase();
  if (/^cc-by(-(nc|sa|nd|nc-sa|nc-nd))?-4\.0$/.test(low)) return true;
  return /creativecommons\.org\/licenses\/by(-(nc|sa|nd|nc-sa|nc-nd))?\/4\.0\b/.test(low);
}

// 編集の記録（metadata.edits、§3.6.1・§7.3）に 1 件足した新しい並び。元の並びは変えない（写しを返す）。
//   by：入力した名前（前後の空白は除く。空なら名前なし）、note：編集した内容（空なら書かない）、required：ライセンスが変更を示すよう求める
//   同じ by の項目があれば、足さずにその項目の note を新しいものにする（note が空なら変えない）。名前のない項目はだれのものか分からないので
//   書き換えず、同じ中身（名前なし・同じ note）のものがあれば足さない。名前が空で、ライセンスが求めず、note もなければ何も足さない。変わらなければ null
export function addEdit(edits, { by, note, required }) {
  const list = Array.isArray(edits) ? edits.map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? { ...x } : x)) : [];
  const b = str(by), n = str(note);
  if (!b && !required && !n) return null;
  const isEntry = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!b) {
    if (list.some((x) => isEntry(x) && !str(x.by) && (!n || str(x.note) === n))) return null;
    list.push(n ? { note: n } : {});
    return list;
  }
  const at = list.findIndex((x) => isEntry(x) && str(x.by) === b);
  if (at >= 0) {
    if (!n || list[at].note === n) return null;
    list[at].note = n;
    return list;
  }
  list.push({ by: b, ...(n ? { note: n } : {}) });
  return list;
}
