// サンプルの情報（sample.json。backlog #130、handoff/samples-gallery-plan.md §1.5）：サンプルから「このサンプルのように作る」で引き継ぐもの。
// Node にもブラウザにも依存しない（純粋な ESM）。サンプルのフォルダ（examples/<名前>/sample.json）に置き、tools/examples-portable.mjs が確かめて
// 編集アプリのサンプルの一覧（RES.examples の sample）に入れる。画面は app/main.js（大きく再生する窓）と app/llm.js（新規作成に入れる）
//
// sample.json の形（v: 1）：
//   request       頼み方の文（このサンプルを作るときにチャットの AI に頼んだ文。サンプルの言語）
//   category      使う場面の大分類の id（kit/core/new-deck.mjs の CATEGORIES）
//   subcategory   小分類の id か null（小分類のない大分類と「この中にない」）
//   theme         テーマの名前（<html data-theme>）
//   parts         使ったパーツのタグ（パーツライブラリのカタログにあるもの。新規作成の ④ で印を付ける）
//   structure     構成：[{heading, point}]（スライドごとの見出しと要点。指示に「この構成と見せ方に倣って」と添える。全文は入れない）
//   book          本があるか
//   lang          サンプルの言語（'ja' | 'en'）
//   rights        {license, attribution}（ライセンスの SPDX の名前（CC-BY-4.0 が基本）と、作った人の表示）
//
//   validateSample(obj, {categories, parts}) → 誤りの一覧（[{path, code}]。空なら正しい）。categories・parts は確かめる相手（なければ形だけ）
//   sampleStructureRequest(sample, title, lang) → 指示の「頼みたいこと」の後ろに添える節（構成と見せ方に倣う。lang は画面の言語、見出しと言いたいことはサンプルの言語のまま）
//   SAMPLE_LIMITS                            構成の行の数と字数の上限（指示を約 300 トークンに収める。無料のプランの上限のため）

export const SAMPLE_VERSION = 1;
export const SAMPLE_LANGS = ['ja', 'en'];
export const SAMPLE_LIMITS = Object.freeze({ rows: 16, heading: 80, point: 100, structureChars: 1100, request: 600, attribution: 200 });
const KEYS = ['v', 'request', 'category', 'subcategory', 'theme', 'parts', 'structure', 'book', 'lang', 'rights'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim() !== '' && v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v);
const len = (s) => [...s].length;

export function validateSample(obj, { categories = null, parts = null } = {}) {
  const errs = [];
  const bad = (path, code) => errs.push({ path, code });
  if (!isObj(obj)) { bad('', 'not-object'); return errs; }
  for (const k of Object.keys(obj)) if (!KEYS.includes(k)) bad(k, 'unknown-key');
  if (obj.v !== SAMPLE_VERSION) bad('v', 'version');
  if (!str(obj.request)) bad('request', 'not-text');
  else if (len(obj.request) > SAMPLE_LIMITS.request) bad('request', 'too-long');
  if (!str(obj.category)) bad('category', 'not-text');
  else if (categories) {
    const c = categories.find((x) => x.id === obj.category);
    if (!c) bad('category', 'unknown');
    else if (!('subcategory' in obj) || obj.subcategory === null) { /* 小分類なし・この中にない（ないときは下で） */ }
    else if (!str(obj.subcategory) || !c.subs.some((s) => s.id === obj.subcategory)) bad('subcategory', 'unknown');
  }
  if (!('subcategory' in obj)) bad('subcategory', 'missing');
  else if (obj.subcategory !== null && !str(obj.subcategory)) bad('subcategory', 'not-text');
  if (!str(obj.theme) || !/^[a-z0-9][a-z0-9-]*$/.test(obj.theme)) bad('theme', 'not-name');
  if (!Array.isArray(obj.parts)) bad('parts', 'not-array');
  else {
    const seen = new Set();
    obj.parts.forEach((t, i) => {
      if (typeof t !== 'string' || !/^m-[a-z0-9-]+$/.test(t)) bad(`parts[${i}]`, 'not-tag');
      else if (seen.has(t)) bad(`parts[${i}]`, 'duplicate');
      else if (parts && !parts.includes(t)) bad(`parts[${i}]`, 'unknown');
      seen.add(t);
    });
  }
  if (!Array.isArray(obj.structure) || !obj.structure.length) bad('structure', 'not-array');
  else {
    if (obj.structure.length > SAMPLE_LIMITS.rows) bad('structure', 'too-many');
    let chars = 0;
    obj.structure.forEach((r, i) => {
      if (!isObj(r) || Object.keys(r).some((k) => k !== 'heading' && k !== 'point')) { bad(`structure[${i}]`, 'not-row'); return; }
      if (!str(r.heading)) bad(`structure[${i}].heading`, 'not-text');
      else if (len(r.heading) > SAMPLE_LIMITS.heading) bad(`structure[${i}].heading`, 'too-long');
      if (!str(r.point)) bad(`structure[${i}].point`, 'not-text');
      else if (len(r.point) > SAMPLE_LIMITS.point) bad(`structure[${i}].point`, 'too-long');
      chars += (typeof r.heading === 'string' ? len(r.heading) : 0) + (typeof r.point === 'string' ? len(r.point) : 0);
    });
    if (chars > SAMPLE_LIMITS.structureChars) bad('structure', 'too-long');
  }
  if (typeof obj.book !== 'boolean') bad('book', 'not-boolean');
  if (!SAMPLE_LANGS.includes(obj.lang)) bad('lang', 'unknown');
  if (!isObj(obj.rights)) bad('rights', 'not-object');
  else {
    for (const k of Object.keys(obj.rights)) if (k !== 'license' && k !== 'attribution') bad(`rights.${k}`, 'unknown-key');
    if (!str(obj.rights.license) || !/^[A-Za-z0-9.+-]+$/.test(obj.rights.license)) bad('rights.license', 'not-spdx');
    if (!str(obj.rights.attribution)) bad('rights.attribution', 'not-text');
    else if (len(obj.rights.attribution) > SAMPLE_LIMITS.attribution) bad('rights.attribution', 'too-long');
  }
  return errs;
}

// 指示に添える節。題材は ② の答えに替え、サンプルの文・例・数字は写さない（中身ではなく作り方を引き継ぐ。§1.5）。
// 指示の決まり（構成案がなければ 5〜8 枚）と食い違わないよう、構成案ではないと書き、枚数は ② の長さに合わせて縮めさせる（2 回に分けるかは ② の長さだけで決まる）
export function sampleStructureRequest(sample, title, lang) {
  const ja = lang === 'ja';
  const name = String(title || '').replace(/\s+/g, ' ').trim();
  const rows = sample.structure.map((r, i) => `${i + 1}. ${r.heading} — ${r.point}`);   // 見出しに「：」があってもよいように（構成案の一覧と同じ区切り）
  const head = ja ? '## 倣うサンプルの構成' : '## Structure of the sample to follow';
  const lead = ja
    ? `サンプル「${name}」の構成と見せ方に倣って作ってください。題材は上の答えに替え、サンプルの文・例・数字は使わないでください。これは構成案ではないので、枚数は上の長さ（なければ短く）に合わせ、流れを保って縮めたり伸ばしたりしてください。スライドごとの見出しと要点：`
    : `Follow the structure and presentation of the sample “${name}”. Use the topic from the answers above instead, and do not reuse the sample’s text, examples or numbers. This is not an outline: fit the number of slides to the length above (short if none), keeping the flow while shortening or extending it. The heading and point of each slide:`;
  return [head, lead, rows.join('\n')].join('\n\n') + '\n';
}
