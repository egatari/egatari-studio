// チャットの AI への指示（AI instruction pack）を組み立てる。Node にもブラウザにも依存しない（純粋な ESM）
// 指示は「共通の本体」（規格 R-…・大きさ・出力の形・どの教材でも使う部品）と、系列ごとの部品の指示（academic・business・kokugo・info）からなる。
// 材料（kit/core/llm-pack-data.mjs）は tools/make-llm-guide.mjs が tools/llm-guide/・docs/contract・vendor/components/*/README.md から作る（手で直さない）。
// 同じ関数を、編集アプリの「AI への指示をコピー」（app/llm.js）・コマンド（kit/llm-pack.mjs）・docs の書き出し（tools/make-llm-guide.mjs）・
// 修正依頼（kit/core/llm-fix.mjs）が使う
//
//   buildPack({series, lang}) → 文字列         series：系列の名前の配列（[] なら共通の本体だけ）か 'all'（全部。比べる・CI 用）か 'a,b'
//   SERIES                                      系列の名前（決まった順）
//   PACK_VERSION                                指示の版（材料の SHA-256 の先頭 8 字。指示のはじめの行に出る）
//   commonBody(lang, exclude?)・seriesPart(name, lang, exclude?)  共通の本体・1 つの系列の部分（docs/authoring-with-llms*.md・docs/llm-parts/*.md と同じ中身。
//                                                exclude：使わせない部品を一覧と説明から除く）
//   PURPOSES                                     言いたいこと（新規作成の札と指示の表の材料。kit/core/purposes.mjs）
//   requestBody(lang)                            最後に付く「頼みたいこと」（記入欄の付いた頼み方。docs/authoring-with-llms*.md の最後と同じ）
//   seriesOf(tag)                                部品（'m-kpi'）の居場所：'common' か系列の名前（部品庫にない部品は null）
//   componentsIn(html)                           デッキで使っている部品庫の部品（名前の並び）
//   seriesForDeck(html)                          デッキの部品・テーマから推した系列（編集アプリの既定の選び方）
//   componentNotes(names, lang)                  部品の説明（共通の本体・系列にあるものと同じ文章。拡張の節も付ける）。修正依頼が使う
//   packSize(text)                               UTF-8 のバイト数
//   kbOf(bytes)・packKb(text)                    大きさの表示（KB、小数 1 桁。CLI の --list と編集アプリが同じ計算）
//   PACK_CAP_KB・PAID_PACK_KB                   指示の大きさの上限（お使いの AI の無料版・有料版ごと。kit/core/llm-pack-assemble.mjs）
//   assemble(data, {series, lang})               buildPack の本体（材料を渡す。tools/make-llm-guide.mjs が作りたての材料で使う）
import { PACK } from './llm-pack-data.mjs';
import { assemble, normalizeSeries as norm, commonOf, partOf, requestOf, membersOf, langOf, PACK_CAP_KB, PAID_PACK_KB } from './llm-pack-assemble.mjs';

export { assemble, PACK_CAP_KB, PAID_PACK_KB };
export const normalizeSeries = (series) => norm(series, PACK);

export const SERIES = PACK.series;
export const PACK_VERSION = PACK.version;   // 指示の版（指示のはじめの「Pack version」の行と同じ。tools/make-llm-guide.mjs が材料から決める）

export const buildPack = (opts) => assemble(PACK, opts);
// series：入っている系列（表が指す部品。省くと [] = 共通の本体だけ）。off：外した札
export const commonBody = (lang = 'en', exclude = [], series = [], off = []) => commonOf(PACK, lang, exclude, series, off) + '\n';
export const seriesPart = (name, lang = 'en', exclude = []) => partOf(PACK, name, lang, exclude) + '\n';
export const PURPOSES = PACK.purposes;   // 言いたいこと（kit/core/purposes.mjs の形。source が 'manifest' か 'fallback'）
export const requestBody = (lang = 'en') => requestOf(PACK, lang) + '\n';

export function seriesOf(tag) {
  const c = PACK.en.components[String(tag).toLowerCase()];
  return c ? c.series : null;
}
export function membersOfSeries(name) { return membersOf(PACK.en, name); }

// 部品庫の部品のうち、デッキに出てくるもの（コメントの中も数える。軽い見積もりでよい）
export function componentsIn(html) {
  const found = new Set();
  for (const m of String(html || '').matchAll(/<(m-[a-z0-9-]+)[\s>/]/gi)) { const t = m[1].toLowerCase(); if (PACK.en.components[t]) found.add(t); }
  return [...found].sort();
}
export function seriesForDeck(html) {
  const s = new Set(componentsIn(html).map(seriesOf).filter((x) => x && x !== 'common'));
  const h = String(html || '');
  const theme = (h.match(/<html[^>]*\sdata-theme\s*=\s*["']?([\w-]+)/i) || [])[1];
  if (theme === 'business') s.add('business');
  if (theme === 'kokugo' || /class\s*=\s*["'][^"']*\blayout-tate\b/i.test(h)) s.add('kokugo');
  return PACK.series.filter((x) => s.has(x));
}

// 部品の説明（buildPack に入るものと同じ文章）。拡張の節（m-flow のお金の流れなど）も付ける
export function componentNotes(names, lang = 'en') {
  const D = langOf(PACK, lang);
  return names.filter((n) => D.components[n]).map((n) => {
    const c = D.components[n];
    const ext = Object.entries(c.ext || {}).map(([, t]) => D.extHead.replace('{name}', n) + '\n\n' + t);
    return [c.entry, ...ext].join('\n\n');
  }).join('\n\n');
}

export const packSize = (text) => new TextEncoder().encode(String(text)).length;
// 大きさの表示（KB = UTF-8 のバイト数 / 1024、小数 1 桁）。node kit/llm-pack.mjs --list と編集アプリの貼り付けの窓が同じ計算を使う
export const kbOf = (bytes) => (bytes / 1024).toFixed(1);
export const packKb = (text) => kbOf(packSize(text));
