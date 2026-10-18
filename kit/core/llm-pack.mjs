// チャットの AI への指示（AI instruction pack）を組み立てる。Node にもブラウザにも依存しない（純粋な ESM）
// 指示は「共通の本体」（決まり R-…・大きさ・出力の形・どの教材でも使う部品）と、系列ごとの部品の指示（academic・business・kokugo・info）からなる。
// 材料（kit/core/llm-pack-data.mjs）は tools/make-llm-guide.mjs が tools/llm-guide/・docs/contract・components/*/README.md から作る（手で直さない）。
// 同じ関数を、編集アプリの「AI への指示を写す」（app/llm.js）・コマンド（kit/llm-pack.mjs）・docs の書き出し（tools/make-llm-guide.mjs）・
// 直しの依頼（kit/core/llm-fix.mjs）が使う
//
//   buildPack({series, lang}) → 文字列         series：系列の名前の配列（[] なら共通の本体だけ）か 'all'（全部。比べる・CI 用）か 'a,b'
//   SERIES                                      系列の名前（決まった順）
//   commonBody(lang)・seriesPart(name, lang)    共通の本体・1 つの系列の部分（docs/authoring-with-llms*.md・docs/llm-parts/*.md と同じ中身）
//   seriesOf(tag)                                部品（'m-kpi'）の居場所：'common' か系列の名前（部品庫にない部品は null）
//   componentsIn(html)                           デッキで使っている部品庫の部品（名前の並び）
//   seriesForDeck(html)                          デッキの部品・テーマから推した系列（編集アプリの既定の選び方）
//   componentNotes(names, lang)                  部品の説明（共通の本体・系列にあるものと同じ文章。拡張の節も付ける）。直しの依頼が使う
//   packSize(text)                               UTF-8 のバイト数
//   kbOf(bytes)・packKb(text)                    大きさの表示（KB、小数 1 桁。CLI の --list と編集アプリが同じ計算）
//   assemble(data, {series, lang})               buildPack の本体（材料を渡す。tools/make-llm-guide.mjs が作りたての材料で使う）
import { PACK } from './llm-pack-data.mjs';
import { assemble, normalizeSeries as norm, commonOf, partOf, membersOf, langOf } from './llm-pack-assemble.mjs';

export { assemble };
export const normalizeSeries = (series) => norm(series, PACK);

export const SERIES = PACK.series;

export const buildPack = (opts) => assemble(PACK, opts);
export const commonBody = (lang = 'en') => commonOf(PACK, lang) + '\n';
export const seriesPart = (name, lang = 'en') => partOf(PACK, name, lang) + '\n';

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
