// スライドと本文の節のつながりと、その古さ（format spec §9C.5・§9C.7）。
//   つながっている組（linked pair）：スライドの data-article がその節を挙げる、または節の原稿にそのスライドへの {step} のリンクがある。
//   記録：egatari.json と index の articleLinks[スライドの鍵][節の id] = {article, slide}（つないだ・確かめたときの 2 つの hash。SHA-256 の 16 進の小文字）
//     article：節の原稿の字（節の見出しの行から、同じかより上の段の次の見出しの前まで。次の見出しの (…)= の行は除く）
//     slide：JSON.stringify([deck.html のそのスライドの <section>…</section>, narration.md のそのスライドの「## 」の行から次の「## 」の前まで])
//     どれも NFC・LF にして前後の空白を除く。描いた字（番号）は使わない（ほかの図の番号が変わっただけで古くならないように）
//   状態：ok（記録と今が同じ）・article（節が変わった：スライドが古いかもしれない）・slide（スライドが変わった：節が古いかもしれない）・
//     both・unconfirmed（記録がない）。編集アプリは「スライドと本が合っていないかもしれません」と出す。どちらの字も自動では直さない（§9C.7）
//   組み立て（1 ファイルへの書き出し）は、もうつながっていない組の記録を外す。記録を足すのは npm run ids（つないだ組）と、確かめたとき
// 編集アプリと共有する（node: の読み込み・fs を使わない。hash は crypto.subtle）。
import { visit } from './article-text.mjs';
import { parseStep } from './article.mjs';
import { parseHeading } from './narration-parse.mjs';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const HEX64 = /^[0-9a-f]{64}$/;
const norm = (s) => String(s).normalize('NFC').replace(/\r\n?/g, '\n').trim();

// つながっている組：[{slide, section}]（本文の順、その中はスライドの data-article・{step} の順。重ねない）。
// article：readArticle の結果。dataArticle：kit/core/article.mjs の dataArticleOf の結果（[{slide, ids}]）
export function linkedPairs(article, dataArticle = []) {
  const sections = new Set(), out = [], seen = new Set();
  const add = (slide, section) => { const k = `${slide}\u0000${section}`; if (!seen.has(k)) { seen.add(k); out.push({ slide, section }); } };
  for (const f of article.files) for (const top of f.tree.children || []) if (top.type === 'heading' && top.depth === 2 && top.label) sections.add(String(top.label));
  for (const f of article.files) {
    let section = null;
    for (const top of f.tree.children || []) {
      if (top.type === 'heading' && top.depth === 2) section = top.label ? String(top.label) : null;
      if (!section) continue;
      visit(top, (n) => { if (n.type === 'mystRole' && n.name === 'step') { const s = parseStep(n.value); if (s) add(s.slideKey, section); } });
    }
  }
  for (const d of dataArticle) for (const id of d.ids) if (sections.has(id)) add(d.slide, id);
  return out;
}

// 節の原稿の字（§9C.7 の article）。返すもの：{節の id → 字}
export function sectionSources(article) {
  const out = {};
  for (const f of article.files) {
    const lines = String(f.source || '').replace(/^﻿/, '').split(/\r?\n/);
    const off = f.lineOffset || 0;
    const heads = (f.tree.children || []).filter((n) => n.type === 'heading' && n.position);
    heads.forEach((h, j) => {
      if (h.depth !== 2 || !h.label) return;
      const start = h.position.start.line + off;   // 1 から
      const next = heads.slice(j + 1).find((x) => x.depth <= h.depth);
      let end = next ? next.position.start.line + off - 1 : lines.length;   // 含まない（1 から数えた行の番号のひとつ前まで）
      if (next && next.label && end > start && /^\s*\([^()\s]+\)=\s*$/.test(lines[end - 1])) end--;
      out[String(h.label)] = norm(lines.slice(start - 1, end).join('\n'));
    });
  }
  return out;
}

// スライドの原稿の字（§9C.7 の slide の材料）：deck.html のそのスライドの要素（<section から対応する </section> まで）。なければ null
export function slideElementText(deckHtml, slideKey) {
  const src = String(deckHtml);
  const tagRe = /<(\/?)section\b[^>]*>/gi;
  let m, start = -1, depth = 0;
  while ((m = tagRe.exec(src))) {
    if (start < 0) {
      if (m[1]) continue;
      const t = m[0];
      if (!/\bclass\s*=\s*["']?[^"'>]*\bslide\b/i.test(t)) continue;
      const id = (t.match(/\sid\s*=\s*["']([^"']*)["']/i) || t.match(/\sid\s*=\s*([^\s>"']+)/i) || [])[1];
      const key = (t.match(/\sdata-key\s*=\s*["']([^"']*)["']/i) || [])[1];
      if (id !== slideKey && key !== slideKey) continue;
      start = m.index; depth = 1;
    } else if (m[1]) { if (--depth === 0) return src.slice(start, m.index + m[0].length); }
    else depth++;
  }
  return null;
}
// narration.md のそのスライドの段（「## 」の見出しの行から次の「## 」の前まで）。なければ ''
export function narrationBlockText(narration, slideKey) {
  const lines = String(narration || '').split(/\r?\n/);
  let from = -1;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^##\s+(.+?)\s*$/);
    if (!h) continue;
    if (from >= 0) return lines.slice(from, i).join('\n');
    const p = parseHeading(h[1]);
    if (p.key === slideKey || p.id === slideKey) from = i;
  }
  return from >= 0 ? lines.slice(from).join('\n') : '';
}

export async function sha256HexText(s) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// 今の hash：{スライドの鍵: {節の id: {article, slide}}}（つながっている組だけ。スライドの要素が見つからなければ slide は null）
export async function currentLinkHashes(article, pairs, deckHtml, narration) {
  const secs = sectionSources(article);
  const slideHash = new Map(), out = {};
  for (const { slide, section } of pairs) {
    if (!own(secs, section)) continue;
    if (!slideHash.has(slide)) {
      const el = slideElementText(deckHtml, slide);
      slideHash.set(slide, el === null ? null : await sha256HexText(JSON.stringify([norm(el), norm(narrationBlockText(narration, slide))])));
    }
    if (!own(out, slide)) out[slide] = {};
    out[slide][section] = { article: await sha256HexText(secs[section]), slide: slideHash.get(slide) };
  }
  return out;
}

// 記録の形（egatari.json・index の articleLinks）が正しいか。返すもの：誤りの字の配列
export function articleLinksProblems(links) {
  const e = [];
  if (!isObj(links)) return ['articleLinks: not an object'];
  for (const [s, m] of Object.entries(links)) {
    if (!isObj(m)) { e.push(`articleLinks["${s}"]: not an object`); continue; }
    for (const [sec, r] of Object.entries(m)) {
      if (!isObj(r) || !HEX64.test(String(r.article)) || !HEX64.test(String(r.slide))) e.push(`articleLinks["${s}"]["${sec}"]: not {article, slide} (lowercase hex SHA-256)`);
    }
  }
  return e;
}
// 組ごとの状態：[{slide, section, state}]（pairs の順）。recorded：記録（形の誤りは記録なしとみなす）。current：currentLinkHashes の結果
export function linkStates(recorded, current, pairs) {
  const rec = isObj(recorded) ? recorded : {};
  const out = [];
  for (const { slide, section } of pairs) {
    const c = current[slide] && current[slide][section];
    if (!c) continue;
    const r = isObj(rec[slide]) && isObj(rec[slide][section]) ? rec[slide][section] : null;
    let state = 'ok';
    if (!r || !HEX64.test(String(r.article)) || !HEX64.test(String(r.slide))) state = 'unconfirmed';
    else {
      const a = r.article !== c.article, s = c.slide !== null && r.slide !== c.slide;
      state = a && s ? 'both' : a ? 'article' : s ? 'slide' : 'ok';
    }
    out.push({ slide, section, state });
  }
  return out;
}
// もうつながっていない組の記録を外したもの（§9C.7：組み立てのとき）。返すもの：{links（記録が 1 つもなければ null）, removed: [{slide, section}]}
export function pruneLinks(recorded, pairs) {
  if (!isObj(recorded)) return { links: null, removed: [] };
  const want = new Set(pairs.map((p) => `${p.slide}\u0000${p.section}`));
  const links = {}, removed = [];
  for (const [s, m] of Object.entries(recorded)) {
    if (!isObj(m)) continue;
    for (const [sec, r] of Object.entries(m)) {
      if (!want.has(`${s}\u0000${sec}`)) { removed.push({ slide: s, section: sec }); continue; }
      if (!own(links, s)) links[s] = {};
      links[s][sec] = r;
    }
  }
  return { links: Object.keys(links).length ? links : null, removed };
}
// 記録を付ける：mode 'missing'（記録のない組だけ。つないだとき）・'all'（つながっている組すべてを今の hash で。確かめたとき）。
// only：確かめる組を絞る（[{slide, section?}]。section がなければそのスライドの組すべて）。返すもの：{links, added: [{slide, section}]}
export function recordLinks(recorded, current, pairs, { mode = 'missing', only = null } = {}) {
  const pr = pruneLinks(recorded, pairs);
  const links = pr.links || {};
  const added = [];
  const pick = (p) => !only || only.some((o) => o.slide === p.slide && (!o.section || o.section === p.section));
  for (const p of pairs) {
    const c = current[p.slide] && current[p.slide][p.section];
    if (!c || c.slide === null || !pick(p)) continue;
    const r = isObj(links[p.slide]) ? links[p.slide][p.section] : undefined;
    const valid = isObj(r) && HEX64.test(String(r.article)) && HEX64.test(String(r.slide));
    if (mode === 'missing' && valid) continue;
    if (valid && r.article === c.article && r.slide === c.slide) continue;
    if (!own(links, p.slide)) links[p.slide] = {};
    links[p.slide][p.section] = { article: c.article, slide: c.slide };
    added.push({ slide: p.slide, section: p.section });
  }
  return { links: Object.keys(links).length ? links : null, added, removed: pr.removed };
}
