// チャットの AI への指示（AI instruction pack）を組み立てる。Node にもブラウザにも依存しない（純粋な ESM）
// 指示は「共通の本体」（規格 R-…・大きさ・出力の形・標準の部品）と、束ごとの専門の部品の指示（stats・data・math・maps・kokugo・english・music・business・tools …。
// パーツライブラリ 2.0 の manifest の set）からなる。特殊（extra）の部品は入れない（handoff/parts-tiers-2026-10-27.md §1、backlog #125）。
// 材料（kit/core/llm-pack-data.mjs）は tools/make-llm-guide.mjs が tools/llm-guide/・docs/contract・部品の README から作る（手で直さない）。
// 同じ関数を、編集アプリの「AI への指示をコピー」（app/llm.js）・コマンド（kit/llm-pack.mjs）・docs の書き出し（tools/make-llm-guide.mjs）・
// 修正依頼（kit/core/llm-fix.mjs）が使う
//
//   buildPack({sets, lang, plan, exclude, off}) → 文字列   sets：束の名前の配列（[] なら共通の本体だけ）か 'all'（全部。比べる・CI 用）か 'a,b'。
//                                                plan：'free'（既定。中核の 4 つのほかの標準の部品は一覧の 1 行だけ）| 'paid'（どの部品も詳しく）
//   SETS                                        束の名前（決まった順）
//   PACK_VERSION                                指示のバージョン（材料の SHA-256 の先頭 8 字。指示のはじめの行に出る）
//   commonBody(lang, opts?)・setPart(name, lang, opts?)  共通の本体・1 つの束の部分（docs/authoring-with-llms*.md・docs/llm-parts/*.md と同じ中身は plan: 'paid'。
//                                                opts：{exclude, sets, off, plan}）
//   PURPOSES                                     言いたいこと（新規作成の札と指示の表の材料。kit/core/purposes.mjs）
//   requestBody(lang)                            最後に付く「頼みたいこと」（記入欄の付いた頼み方。docs/authoring-with-llms*.md の最後と同じ）
//   setOf(tag)                                   部品（'m-kpi'）の居場所：'standard' か束の名前（指示にない部品・特殊の部品は null）
//   componentsIn(html)                           デッキで使っている、指示にある部品（名前の並び）
//   setsForDeck(html)                            デッキの部品・テーマから推した束（スライドの挿入の既定の選び方）
//   componentNotes(names, lang)                  部品の説明（共通の本体・束にあるものと同じ文章。拡張の節も付ける）。修正依頼が使う
//   packSize(text)                               UTF-8 のバイト数
//   kbOf(bytes)・packKb(text)                    大きさの表示（KB、小数 1 桁。CLI の --list と編集アプリが同じ計算）
//   PLANS・FREE_CORE・BRIEF                      お使いの AI のプラン・無料のプランでも詳しく書く中核の 4 つ・無料のプランで一覧の 1 行だけの標準の部品
//   PACK_CAP_KB・PAID_PACK_KB                   指示の大きさの上限（{free, paid}。kit/core/llm-pack-assemble.mjs）
//   FREE_PASTE_UNITS・pasteUnits(text)          無料のプランのもう 1 つの上限：貼り付けの長さ（UTF-16 の単位の数＋改行の数）が 31,000 まで
//   fitSize(text, plan)                          目安に収める物差し（fitPlan・fitPack の sizeOf に使う）：無料のプランは 45 KB と 31,000 の近いほう（バイトに換算）
//   assemble(data, {sets, lang, plan})           buildPack の本体（材料を渡す。tools/make-llm-guide.mjs が作りたての材料で使う）
//   TIERS                                       パーツの段と束（パーツライブラリ 2.0 の manifest から。{catalogue, parts: {タグ: {tier, set?, purposes}}, purposes}。
//                                                新規作成 ④ のパーツの一覧：kit/core/new-deck.mjs）
//   loadedParts(sets)                            その束で組み立てに入る部品（標準と、選んだ束の部品）
//   trimCandidates・fitPlan・fitPack             無料のプランの目安に収める（中核の 4 つを短く → 専門のパーツを外す候補に）。fitSample は「このサンプルを参考に作る」の収め方。編集アプリ（kit/core/new-deck.mjs が出し直す）と
//                                                コマンド（kit/llm-pack.mjs）が同じ関数を使う
//   partsPackOpts(tags, plan, {short, full})     選んだパーツだけの指示の組み立ての引数 {sets, exclude, plan, short?, full?}（buildPack・packWithRequest に渡す。
//                                                選んだ専門のパーツの束を入れ、選ばないパーツは除く。プランは詳しさだけを変える。short：無料のプランで中核の 4 つも短く）
import { PACK } from './llm-pack-data.mjs';
import { assemble, normalizeSets as norm, commonOf, partOf, requestOf, membersOf, langOf, partSpans, PACK_CAP_KB, PAID_PACK_KB, FREE_PASTE_UNITS, pasteUnits, fitSize, PLANS, FREE_CORE, STANDARD, briefParts, planName, trimCandidates as trimCandidatesOf, SINGLE_SET_DROP_ORDER, fitPlan as fitPlanOf, fitPack as fitPackOf, fitSample as fitSampleOf, packOptsOf } from './llm-pack-assemble.mjs';

export { assemble, PACK_CAP_KB, PAID_PACK_KB, FREE_PASTE_UNITS, pasteUnits, fitSize, PLANS, FREE_CORE, STANDARD, SINGLE_SET_DROP_ORDER };
export const BRIEF = briefParts(PACK, 'free');   // 無料のプランで一覧の 1 行だけの標準の部品
export const SETS = PACK.sets;
export const TIERS = PACK.tiers;
export const normalizeSets = (sets) => norm(sets, PACK);
// その束で組み立てに入る部品（標準と、選んだ束の部品。どちらのプランでも同じ。無料のプランの BRIEF も一覧に入る）
export function loadedParts(sets = []) {
  const ss = norm(sets, PACK);
  return Object.keys(PACK.en.components).sort().filter((t) => { const s = PACK.en.components[t].set; return s === STANDARD || ss.includes(s); });
}
export const partsPackOpts = (tags, plan = 'free', opts = {}) => packOptsOf(PACK, tags, plan, opts);
// 目安に収める（本体は kit/core/llm-pack-assemble.mjs。材料はこの指示の PACK）
export const trimCandidates = trimCandidatesOf;
export const fitPlan = (ticked, plan, opts) => fitPlanOf(PACK, ticked, plan, opts);
export const fitPack = (ticked, plan, opts) => fitPackOf(PACK, ticked, plan, opts);
export const fitSample = (ticked, plan, opts) => fitSampleOf(PACK, ticked, plan, opts);

export const PACK_VERSION = PACK.version;   // 指示のバージョン（指示のはじめの「Pack version」の行と同じ。tools/make-llm-guide.mjs が材料から決める）

export const buildPack = (opts) => assemble(PACK, opts);
// sets：入っている束（表が指す部品。省くと [] = 標準だけ）。off：外した札。plan：'free'（既定）| 'paid'
export const commonBody = (lang = 'en', { exclude = [], sets = [], off = [], plan = 'free' } = {}) => commonOf(PACK, lang, { exclude, sets, off, plan }) + '\n';
export const setPart = (name, lang = 'en', { exclude = [] } = {}) => partOf(PACK, name, lang, { exclude }) + '\n';
export const PURPOSES = PACK.purposes;   // 言いたいこと（kit/core/purposes.mjs の形。source が 'manifest' か 'fallback'）
export const requestBody = (lang = 'en') => requestOf(PACK, lang) + '\n';

export function setOf(tag) {
  const c = PACK.en.components[String(tag).toLowerCase()];
  return c ? c.set : null;
}
// 束の部品（'standard' なら標準の部品）
export const membersOfSet = (name) => membersOf(PACK.en, name);

// 指示にある部品のうち、デッキに出てくるもの（コメントの中も数える。軽い見積もりでよい）
export function componentsIn(html) {
  const found = new Set();
  for (const m of String(html || '').matchAll(/<(m-[a-z0-9-]+)[\s>/]/gi)) { const t = m[1].toLowerCase(); if (PACK.en.components[t]) found.add(t); }
  return [...found].sort();
}
// デッキの専門の部品の束と、テーマ・縦書きから推した束（business・sumi のテーマはビジネス、kokugo のテーマか縦書きは国語）
export function setsForDeck(html) {
  const s = new Set(componentsIn(html).map((t) => setOf(t)).filter((x) => x && x !== STANDARD));
  const h = String(html || '');
  const theme = (h.match(/<html[^>]*\sdata-theme\s*=\s*["']?([\w-]+)/i) || [])[1];
  if (theme === 'business' || theme === 'sumi') s.add('business');
  if (theme === 'kokugo' || /class\s*=\s*["'][^"']*\blayout-tate\b/i.test(h)) s.add('kokugo');
  return PACK.sets.filter((x) => s.has(x));
}

// 部品の説明（buildPack に入るものと同じ文章）。拡張の節（m-flow のお金の流れなど）も付ける
export function componentNotes(names, lang = 'en') {
  const D = langOf(PACK, lang);
  return names.filter((n) => D.components[n]).map((n) => {
    const c = D.components[n];
    const ext = Object.entries(c.ext || {}).map(([, t]) => D.extHead.replace('{name}', n) + '\n\n' + t);
    return partSpans([c.entry, ...ext].join('\n\n'), []);   // 印（<!--part:…-->）だけを外す
  }).join('\n\n');
}

export const packSize = (text) => new TextEncoder().encode(String(text)).length;
// 大きさの表示（KB = UTF-8 のバイト数 / 1024、小数 1 桁）。node kit/llm-pack.mjs --list と編集アプリの貼り付けの窓が同じ計算を使う
export const kbOf = (bytes) => (bytes / 1024).toFixed(1);
export const packKb = (text) => kbOf(packSize(text));
