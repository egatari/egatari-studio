// 「ファイルの情報…」で書く欄（handoff #88）：タイトル・作成者・著作権の表示・ライセンス・クレジットの表示を、入力から metadata の値にする。
// ブラウザの API を使わない（Node の単体の試験でも動く。tools/test-file-info.mjs）。形は仕様の egatari-metadata（title・license・copyright・
// attribution は文字列、creators は文字列の並び）。app/rights.js の rightsOf が読む形と同じ
//   LICENSES                    選べるライセンス（SPDX の名前と、見せる名前）
//   licenseChoice(license)      今の値 → {choice: SPDX の名前 | 'none' | 'other', other}
//   isSpdxLike(s)               SPDX の名前（式）としてゆるく正しいか（MIT・CC-BY-4.0・GPL-2.0+・Apache-2.0 OR MIT・GPL-2.0 WITH Classpath-exception-2.0）
//   creatorsOf(text)            1 行に 1 人（前後の空白を除き、空の行は捨てる）
//   fileInfoPatch(form, prev)   入力 → {patch} か {error}。patch は入力にある項目だけ。値が undefined の項目は消す（kit/core/config-file.mjs の merge）
//   applyFileInfo(md, patch)    metadata に patch を当てた写し（元は変えない）
export const LICENSES = [
  { id: 'CC-BY-4.0', label: 'CC BY 4.0' },
  { id: 'CC-BY-SA-4.0', label: 'CC BY-SA 4.0' },
  { id: 'CC-BY-NC-4.0', label: 'CC BY-NC 4.0' },
  { id: 'CC-BY-NC-SA-4.0', label: 'CC BY-NC-SA 4.0' },
  { id: 'CC-BY-ND-4.0', label: 'CC BY-ND 4.0' },
  { id: 'CC-BY-NC-ND-4.0', label: 'CC BY-NC-ND 4.0' },
  { id: 'CC0-1.0', label: 'CC0 1.0' },
];
// 初めての保存の問い（このファイルは、あなたが作ったものですか）で選べるもの。ほかは「ファイルの情報…」で
export const FIRST_SAVE_LICENSES = ['CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0'];

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
const SPDX = /^[A-Za-z0-9.+-]+( (AND|OR|WITH) [A-Za-z0-9.+-]+)*$/;
export const isSpdxLike = (s) => SPDX.test(str(s));

export function licenseChoice(license) {
  const l = str(license);
  if (!l) return { choice: 'none', other: '' };
  const hit = LICENSES.find((x) => x.id.toLowerCase() === l.toLowerCase());
  return hit ? { choice: hit.id, other: '' } : { choice: 'other', other: l };
}

export function creatorsOf(text) {
  return String(text ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

// form：{title?, creators?（文字列。1 行に 1 人）, copyright?, attribution?, license?（SPDX の名前・'none'・'other'）, other?（その他の名前）}
// prev：今の metadata（その他の名前が今の値と同じなら、SPDX の形でなくてもそのまま残す。URL などで書かれたファイル）
// 空の欄は項目を消す（タイトルは、消すとスライドの原稿の題が使われる）。error：'license-empty'（その他で名前がない）・'license-format'
export function fileInfoPatch(form, prev = {}) {
  const f = form && typeof form === 'object' ? form : {};
  const p = prev && typeof prev === 'object' ? prev : {};
  const patch = {};
  const own = (k) => Object.prototype.hasOwnProperty.call(f, k);
  for (const k of ['title', 'copyright', 'attribution']) if (own(k)) patch[k] = str(f[k]) || undefined;
  if (own('creators')) { const c = creatorsOf(f.creators); patch.creators = c.length ? c : undefined; }
  if (own('license')) {
    if (f.license === 'none') patch.license = undefined;
    else if (f.license === 'other') {
      const o = str(f.other);
      if (!o) return { error: 'license-empty' };
      if (!isSpdxLike(o) && o !== str(p.license)) return { error: 'license-format' };
      patch.license = o;
    } else {
      const hit = LICENSES.find((x) => x.id === f.license);
      if (!hit) return { error: 'license-format' };
      patch.license = hit.id;
    }
  }
  return { patch };
}

export function applyFileInfo(metadata, patch) {
  const out = { ...(metadata && typeof metadata === 'object' ? metadata : {}) };
  for (const [k, v] of Object.entries(patch || {})) { if (v === undefined) delete out[k]; else out[k] = Array.isArray(v) ? [...v] : v; }
  return out;
}

// patch のうち、今の metadata と違う項目だけ（同じ値を書き直さない：保存が再ビルドにならないように）
export function changedOnly(metadata, patch) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const has = Object.prototype.hasOwnProperty.call(m, k);
    if (v === undefined ? has : !(has && JSON.stringify(m[k]) === JSON.stringify(v))) out[k] = v;
  }
  return out;
}
