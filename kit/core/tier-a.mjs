// 段 A の編集（format spec §7.2）：組み直さずに、持ち運べる 1 ファイル（名前と識別子は kit/core/format.mjs）の決まった場所だけを書き換える。
// Node にもブラウザにも依存しない（kit/core/portable.mjs と同じ）。何も実行しない（parse5 で文字列として読むだけ）
//
//   tierA(original, files, opts) → {ok: true, html, index, deckMeta, changes, warnings} | {ok: false, code, reason, details}
//     original  開いている（または前に保存した）1 ファイルの文字列
//     files     作業場所の今のファイル：{path: Uint8Array} か Map（audio/manifest.json を含む。控え・コメントなど保存しないものは無視する）
//     opts.identity  {docId, derivedFrom}：新しい教材として保存する（docId と derivedFrom も書き換える。§7.3）
//     opts.fonts     {faces(key) → [{w, family, file, range}], load(file) → Promise<base64>}：字の分割ファイル（@fontsource）。key は 'biz' | 'sans3'
//
// 書き換えるのは §7.2 が挙げる場所だけ：
//   実行系の JSON（deck-narration・deck-marks・deck-timing・deck-audio）の、変わった段階の項目だけ（ほかの項目のバイトはそのまま）
//   読める層（§2.1）の、変わった段階の <div data-step-key> だけ
//   deck-meta の sourceSha256（新しい教材として保存するときは docId も）
//   索引（files・blobs・audio の変わった記録・requires・sourceSha256・拡張・新しい教材の docId と derivedFrom）と data-sha256
//   塊（新しい中身を足し、どこからも参照されなくなったものを除く）
//   字の補い：新しい <style id="<前置><n>">（今の文書の字が持たない字の分割ファイルだけ。既にある字のバイトは触らない。要らなければ足さない）
// それ以外のバイト（実行系・スライド・ほかの書き手や版が書いた注釈など）は 1 バイトも変えない。
// 段 A でできない変更（スライドの原稿が変わった・組んだ教材と原稿が食い違う・場所が見つからない）は ok: false と理由を返す（呼び手は段 B へ）
import { parse as parseHtml } from 'parse5';
import { FORMAT } from './format.mjs';
import {
  readPortable, sha256Hex, sourceSha256, cmpCodePoint, mimeOf, htmlSafeJson, toBase64, parseJsonStrict, manifestFromAudio, inputHash,
  readableStep, readableStepOrder, extensionsFrom, excludedReason, LIMITS, RE, KNOWN, copyUnknown, validateDeckMeta,
} from './portable.mjs';
import { parseNarration, narrationMap, marksMap, splitKey } from './narration-core.mjs';
import { isJapanese, LATIN_MAX, parseRange, fontFaceCss } from './build-core.mjs';

const IX_ID = FORMAT.INDEX_ID, BP = FORMAT.BLOB_PREFIX, SCHEME = FORMAT.URI_SCHEME, RD_ID = FORMAT.READABLE_ID, CFG = FORMAT.CONFIG_FILE;
const SUP = FORMAT.FONT_SUPPLEMENT_PREFIX;
const BLOCKS = ['deck-narration', 'deck-marks', 'deck-audio', 'deck-timing', 'deck-meta'];
// 段 A で変わってよい原稿のファイル（音声 audio/ は記録として別に扱う）。FORMAT.CONFIG_FILE は docId と権利の表示が索引と同じときだけ
const TIER_A_FILES = new Set(['narration.md', 'timeline.json', CFG]);
// 索引の項目の並び（足すときの位置。書き出し（exportPortable）と同じ順）
const INDEX_ORDER = ['format', 'version', 'profile', 'requires', 'contracts', 'generator', 'docId', 'entry', 'sourceSha256', 'files', 'blobs', 'audio', 'components', 'themes', 'metadata', 'excluded', 'extensions'];
const META_RIGHTS = ['title', 'license', 'copyright', 'attribution', 'creators'];

const dict = () => Object.create(null);
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dec = new TextDecoder();
const eqBytes = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
// 値が同じか（object の項目の順は問わない）
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => own(b, k) && deepEqual(a[k], b[k]));
}
class Refuse extends Error { constructor(code, reason, details) { super(reason); this.code = code; this.details = details; } }
const refuse = (code, reason, details) => { throw new Refuse(code, reason, details); };

// ---------------------------------------------------------------- 文書の場所（parse5 の位置。スクリプトは実行しない）
export function scanLayout(text) {
  const doc = parseHtml(text, { scriptingEnabled: false, sourceCodeLocationInfo: true });
  const blocks = new Map(), dupBlocks = new Set(), chunks = [], styles = [], slideKeys = new Set();
  let index = null, readable = null, headEnd = null;
  const attr = (n, k) => (n.attrs || []).find((a) => a.name === k)?.value;
  const loc = (n) => {
    const L = n.sourceCodeLocation;
    if (!L || !L.startTag) return null;
    return { start: L.startOffset, end: L.endOffset, cStart: L.startTag.endOffset, cEnd: L.endTag ? L.endTag.startOffset : L.endOffset, hasEnd: !!L.endTag };
  };
  const visit = (n, inTemplate) => {
    if (n.tagName && n.namespaceURI === 'http://www.w3.org/1999/xhtml' && !inTemplate) {
      const id = attr(n, 'id');
      if (n.tagName === 'script' && id && BLOCKS.includes(id)) { if (blocks.has(id)) dupBlocks.add(id); else blocks.set(id, loc(n)); }
      else if (n.tagName === 'script' && id === IX_ID) index = loc(n);
      else if (n.tagName === 'script' && id && RE.chunkId.test(id)) chunks.push({ id, ...loc(n) });
      else if (n.tagName === 'style') styles.push({ id: id || null, ...loc(n) });
      else if (n.tagName === 'section' && id === RD_ID && !readable) readable = readableOf(n, loc(n));
      else if (n.tagName === 'section' && /(?:^|\s)slide(?:\s|$)/.test(attr(n, 'class') || '') && attr(n, 'data-key') != null) slideKeys.add(attr(n, 'data-key'));
      else if (n.tagName === 'head' && n.sourceCodeLocation && n.sourceCodeLocation.endTag) headEnd = n.sourceCodeLocation.endTag.startOffset;
    }
    for (const c of n.childNodes || []) visit(c, inTemplate);
    if (n.content) visit(n.content, true);
  };
  function readableOf(sec, L) {
    const articles = new Map(), dupArticles = new Set();
    for (const a of sec.childNodes || []) {
      if (a.tagName !== 'article') continue;
      const key = attr(a, 'data-slide-key');
      if (key == null) continue;
      if (articles.has(key)) { dupArticles.add(key); continue; }
      const al = loc(a), divs = new Map(), dupDivs = new Set();
      let after = al.cStart;   // 新しい段階を入れる位置（見出しの後）
      for (const c of a.childNodes || []) {
        if (c.tagName === 'h2' && c.sourceCodeLocation) after = c.sourceCodeLocation.endOffset;
        if (c.tagName !== 'div') continue;
        const k = attr(c, 'data-step-key');
        if (k == null) continue;
        if (divs.has(k)) dupDivs.add(k); else divs.set(k, loc(c));
      }
      articles.set(key, { ...al, after, divs, dupDivs });
    }
    return { ...L, articles, dupArticles };
  }
  visit(doc, false);
  return { blocks, dupBlocks, index, chunks, styles, readable, headEnd, slideKeys };
}

// ---------------------------------------------------------------- JSON の項目の場所と書き換え（ほかの項目のバイトを変えない）
function skipWs(t, i) { while (i < t.length && (t[i] === ' ' || t[i] === '\n' || t[i] === '\r' || t[i] === '\t')) i++; return i; }
function skipString(t, i) { i++; while (i < t.length) { if (t[i] === '\\') i += 2; else if (t[i] === '"') return i + 1; else i++; } throw new Error('unterminated string'); }
function skipValue(t, i) {
  i = skipWs(t, i);
  const c = t[i];
  if (c === '"') return skipString(t, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (; i < t.length; i++) {
      const x = t[i];
      if (x === '"') { i = skipString(t, i) - 1; continue; }
      if (x === '{' || x === '[') depth++;
      else if (x === '}' || x === ']') { depth--; if (!depth) return i + 1; }
    }
    throw new Error('unterminated value');
  }
  while (i < t.length && !',}] \n\r\t'.includes(t[i])) i++;
  return i;
}
// t[at] が { の object の項目：{open, close, members: [{key, keyStart, valStart, valEnd}]}
function objectAt(t, at) {
  if (t[at] !== '{') throw new Error('not an object at ' + at);
  const members = [];
  let i = skipWs(t, at + 1);
  if (t[i] === '}') return { open: at, close: i, members };
  for (;;) {
    i = skipWs(t, i);
    const keyStart = i, keyEnd = skipString(t, i);
    const key = JSON.parse(t.slice(keyStart, keyEnd));
    i = skipWs(t, keyEnd);
    if (t[i] !== ':') throw new Error('expected : at ' + i);
    const valStart = skipWs(t, i + 1), valEnd = skipValue(t, valStart);
    members.push({ key, keyStart, valStart, valEnd });
    i = skipWs(t, valEnd);
    if (t[i] === ',') { i++; continue; }
    if (t[i] === '}') return { open: at, close: i, members };
    throw new Error('expected , or } at ' + i);
  }
}
// path の項目を value にする（undefined なら消す）。order：その深さで、項目が並ぶべき順の鍵（足す位置を決める）。
// 途中の object がなければ作る。prune：消した後に空になった親の object も消す（deck-narration のスライド）
function jsonSet(t, path, value, order = [], prune = false) {
  const unit = /\n([ \t]+)"/.exec(t)?.[1] || null;   // 字下げ（索引は JSON.stringify(…, null, 1)。実行系の JSON は字下げなし）
  const ind = (d) => (unit ? unit.repeat(d) : '');
  const nl = (d) => (unit ? '\n' + ind(d) : '');
  const ser = (v, d) => htmlSafeJson(unit ? JSON.stringify(v, null, unit).replace(/\n/g, '\n' + ind(d)) : JSON.stringify(v));
  const member = (k, v, d) => htmlSafeJson(JSON.stringify(k)) + (unit ? ': ' : ':') + ser(v, d);
  let at = skipWs(t, 0), depth = 1;
  const parents = [];
  for (let n = 0; n < path.length; n++, depth++) {
    const o = objectAt(t, at), key = path[n], last = n === path.length - 1;
    const m = o.members.find((x) => x.key === key);
    if (!last && m && t[m.valStart] === '{') { parents.push({ o, m }); at = m.valStart; continue; }
    // 置き換え・消す・足す（足すのが途中の深さなら、残りの道筋を入れ子の object にして足す）
    let v = value;
    if (!last) { if (value === undefined) return t; for (let j = path.length - 1; j > n; j--) v = { [path[j]]: v }; }
    if (m) {
      if (v === undefined) {
        const i = o.members.indexOf(m);
        let s;
        if (o.members.length === 1) {
          if (prune && parents.length) return jsonSet(t, path.slice(0, n), undefined, [], prune);
          s = t.slice(0, o.open) + '{}' + t.slice(o.close + 1);
        } else if (i < o.members.length - 1) s = t.slice(0, m.keyStart) + t.slice(o.members[i + 1].keyStart);
        else s = t.slice(0, o.members[i - 1].valEnd) + t.slice(m.valEnd);
        return s;
      }
      return t.slice(0, m.valStart) + ser(v, depth) + t.slice(m.valEnd);
    }
    if (v === undefined) return t;
    const text = member(key, v, depth);
    if (!o.members.length) return t.slice(0, o.open) + '{' + nl(depth) + text + nl(depth - 1) + '}' + t.slice(o.close + 1);
    // 並ぶべき順で前にある鍵のうち、今ある最後のものの後に。なければ先頭に
    const pos = order.indexOf(key);
    let prev = null;
    if (pos > 0) for (let j = pos - 1; j >= 0 && !prev; j--) prev = o.members.find((x) => x.key === order[j]) || null;
    if (prev) return t.slice(0, prev.valEnd) + ',' + nl(depth) + text + t.slice(prev.valEnd);
    if (pos < 0) { const lastM = o.members[o.members.length - 1]; return t.slice(0, lastM.valEnd) + ',' + nl(depth) + text + t.slice(lastM.valEnd); }
    return t.slice(0, o.open + 1) + nl(depth) + text + ',' + t.slice(o.open + 1);
  }
  return t;
}

// ---------------------------------------------------------------- 字（今の文書が持つ字の範囲）
function fontFacesOf(text, styles) {
  const faces = [];
  for (const s of styles) {
    const css = text.slice(s.cStart, s.cEnd);
    for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const b = m[1];
      const fam = /font-family\s*:\s*(?:"([^"]+)"|'([^']+)'|([^;]+))/.exec(b);
      if (!fam) continue;
      const w = /font-weight\s*:\s*(\d+)/.exec(b);
      const r = /unicode-range\s*:\s*([^;]+)/.exec(b);
      faces.push({ family: (fam[1] || fam[2] || fam[3]).trim(), w: w ? +w[1] : 400, range: r ? parseRange(r[1].trim()) : null });
    }
  }
  return faces;
}
const inRange = (range, c) => range.some(([a, b]) => c >= a && c <= b);
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (isObj(v)) Object.values(v).forEach((x) => strings(x, out)); return out; };

// ---------------------------------------------------------------- 本体
export async function tierA(original, files, opts = {}) {
  try { return await run(original, files, opts); }
  catch (e) {
    if (e instanceof Refuse) return { ok: false, code: e.code, reason: e.message, details: e.details || null };
    if (e && e.name === 'FormatError') return { ok: false, code: 'unreadable', reason: e.message, details: { code: e.code } };
    throw e;
  }
}

async function run(original, filesIn, opts) {
  const warnings = [];
  const NEW = filesIn instanceof Map ? filesIn : new Map(Object.entries(filesIn || {}));
  const r = await readPortable(original);
  if (r.extractOnly) refuse('extract-only', 'the file can only be extracted (unknown version or feature)');
  if (!r.sourceMatches) refuse('source-mismatch', 'the compiled lesson and its source disagree (sourceSha256): tier A edits are not allowed (§3.4)');
  const ix = r.index, old = r.files;
  const identity = opts.identity || null;
  const docId = identity ? identity.docId : ix.docId;
  if (identity && !(typeof identity.docId === 'string' && RE.docId.test(identity.docId))) refuse('bad-identity', 'identity.docId is not a lowercase UUID');

  // 1. どの原稿が変わったか。段 A の場所だけで済むもの（口述原稿・timeline.json・設定のファイル）のほかは断る
  const changed = [];
  for (const p of new Set([...Object.keys(old), ...NEW.keys()])) {
    if (p === 'audio/manifest.json' || p.startsWith('audio/')) continue;
    const a = own(old, p) ? old[p] : null, b = NEW.get(p) || null;
    if (!a && b && excludedReason(p)) continue;              // 保存するファイルに入らないもの（コメント・控えなど）
    if (eqBytes(a, b)) continue;
    changed.push(p);
  }
  const outside = changed.filter((p) => !TIER_A_FILES.has(p));
  if (outside.length) refuse('source-changed', `slide source changed (${outside.join(', ')}): the lesson must be rebuilt (tier B)`, outside);
  if (changed.includes(CFG)) {
    let c;
    try { c = NEW.get(CFG) ? parseJsonStrict(dec.decode(NEW.get(CFG))) : null; } catch (e) { refuse('config-changed', `${CFG}: ${e.message}`); }
    if (!isObj(c) || c.docId !== docId) refuse('config-changed', `${CFG}: docId differs from the document`);
    const cm = isObj(c.metadata) ? c.metadata : dict(), im = isObj(ix.metadata) ? ix.metadata : dict();
    for (const k of Object.keys(cm)) {
      const want = k === 'derivedFrom' ? (identity ? identity.derivedFrom : im.derivedFrom) : im[k];
      if (!deepEqual(cm[k], want)) refuse('config-changed', `${CFG}: metadata.${k} differs from the document (the lesson must be rebuilt)`);
    }
    for (const k of META_RIGHTS) if (k !== 'title' && own(im, k) && !own(cm, k)) refuse('config-changed', `${CFG}: metadata.${k} is missing`);
  }
  if (identity && !changed.includes(CFG) && own(old, CFG)) refuse('config-changed', `${CFG}: the new docId is not in the configuration file`);

  // 2. 口述原稿：変わった段階（表示・注目の演出・拡張の行）
  const text = (m, p) => (m instanceof Map ? (m.get(p) ? dec.decode(m.get(p)) : '') : (own(m, p) ? dec.decode(m[p]) : ''));
  const oldSegs = parseNarration(text(old, 'narration.md')), newSegs = parseNarration(text(NEW, 'narration.md'));
  const oldMap = narrationMap(oldSegs), newMap = narrationMap(newSegs);
  const oldMarks = marksMap(oldSegs), newMarks = marksMap(newSegs);
  const stepKeys = (m) => Object.keys(m).flatMap((s) => Object.keys(m[s]).map((st) => [s, st]));
  const narrChanged = [];
  for (const [s, st] of [...stepKeys(oldMap), ...stepKeys(newMap)]) {
    const k = `${s}:${st}`;
    if (narrChanged.some((x) => x.k === k)) continue;
    if (!deepEqual(oldMap[s]?.[st], newMap[s]?.[st])) narrChanged.push({ k, s, st });
  }
  const marksChanged = [...new Set([...Object.keys(oldMarks), ...Object.keys(newMarks)])].filter((k) => !deepEqual(oldMarks[k], newMarks[k]));

  // 3. 秒数の上書き（deck-timing は timeline.json そのもの。§5.5 の長さは実行系が上書きから計算する）
  const timing = (m) => {
    const t = text(m, 'timeline.json');
    if (!t) return dict();
    let v;
    try { v = JSON.parse(t); } catch (e) { refuse('timeline', `timeline.json: ${e.message}`); }
    if (!isObj(v)) refuse('timeline', 'timeline.json is not an object');
    return v;
  };
  const oldT = timing(old), newT = timing(NEW);
  const timingChanged = [...new Set([...Object.keys(oldT), ...Object.keys(newT)])].filter((k) => !deepEqual(oldT[k], newT[k]));

  // 4. 音声の記録：作業場所の audio/manifest.json（展開したフォルダと同じ形）から、書き出しと同じ規則で
  const oldAudio = isObj(ix.audio) ? ix.audio : dict();
  let man = dict();
  if (NEW.get('audio/manifest.json')) {
    try { const j = parseJsonStrict(dec.decode(NEW.get('audio/manifest.json'))); man = isObj(j.segments) ? j.segments : j; }
    catch (e) { refuse('audio-manifest', `audio/manifest.json: ${e.message}`); }
  }
  const segByKey = new Map(newSegs.map((s) => [`${s.slideKey}:${s.stepKey}`, s]));
  const bytesOf = (p) => NEW.get(p) || (own(old, p) ? old[p] : null);
  const newAudio = dict(), audioChanged = [];
  for (const k of Object.keys(man)) {
    const v = man[k];
    if (!isObj(v) || typeof v.file !== 'string') continue;
    const apath = 'audio/' + v.file;
    if (!bytesOf(apath)) continue;                                  // 組み立てと同じく、ないファイルは使わない
    if (!segByKey.has(k)) { if (own(oldAudio, k)) warnings.push(`audio for "${k}" has no narration step any more; not included (as a rebuild would)`); continue; }
    if (!(typeof v.dur === 'number' && v.dur > 0)) continue;
    const o = oldAudio[k];
    if (o && o.file === apath && eqBytes(NEW.get(apath) || old[apath], old[apath]) && deepEqual(JSON.parse(manifestFromAudio({ [k]: o })).segments[k], JSON.parse(JSON.stringify(v)))) {
      newAudio[k] = o;   // 変わっていない記録はそのまま（口述原稿が変わった段階は inputHash が合わなくなり、古いと分かる。§5.4）
      continue;
    }
    const rcd = { file: apath, dur: v.dur, cues: v.sync === 'none' ? [] : (v.cues || []), sync: v.sync || 'auto', kind: v.kind || 'tts' };
    if (typeof v.inputHash === 'string' && RE.sha256.test(v.inputHash)) rcd.inputHash = v.inputHash;
    else if (own(v, 'inputHash') && v.inputHash === null) rcd.inputHash = null;
    else rcd.inputHash = await inputHash(segByKey.get(k));
    if (rcd.kind === 'tts') rcd.recipe = isObj(v.recipe) ? v.recipe : { engine: String(v.engine || 'unknown'), model: 'unknown', voice: {}, seed: null, dictionary: null, processing: 'unknown' };
    if (v.digest) rcd.recipeDigest = String(v.digest);
    copyUnknown(rcd, o, KNOWN.audio);
    newAudio[k] = rcd;
    audioChanged.push(k);
  }
  for (const k of Object.keys(oldAudio)) if (!own(newAudio, k)) audioChanged.push(k);

  // 5. 原稿のファイル・塊・sourceSha256（変わっていない塊はそのまま。新しい中身は sha256 の先頭 32 字を id に）
  const finalFiles = dict();
  for (const p of Object.keys(old)) if (!p.startsWith('audio/') && (NEW.has(p) || !TIER_A_FILES.has(p))) finalFiles[p] = NEW.get(p) || old[p];
  for (const p of changed) if (!own(finalFiles, p) && NEW.get(p)) finalFiles[p] = NEW.get(p);
  for (const a of Object.values(newAudio)) {
    for (const f of [a.file, ...(Array.isArray(a.alternatives) ? a.alternatives.map((x) => x.file) : [])]) {
      const b = bytesOf(f);
      if (!b) refuse('layout', `audio file ${f} is missing`);
      finalFiles[f] = b;
    }
  }
  const paths = Object.keys(finalFiles).sort(cmpCodePoint);
  const oldSha = (p) => (own(ix.files, p) && eqBytes(finalFiles[p], old[p]) ? ix.blobs[ix.files[p]].sha256 : null);
  const shas = dict();
  for (const p of paths) shas[p] = oldSha(p) || await sha256Hex(finalFiles[p]);
  const srcSha = await sourceSha256(Object.fromEntries(paths.filter((p) => !p.startsWith('audio/')).map((p) => [p, shas[p]])));
  const idBySha = new Map(Object.entries(ix.blobs).map(([id, b]) => [b.sha256, id]));
  const fileMap = dict(), blobs = dict(), newChunks = [];
  for (const p of paths) {
    const keep = own(ix.files, p) && eqBytes(finalFiles[p], old[p]) ? ix.files[p] : null;
    const id = keep || idBySha.get(shas[p]) || shas[p].slice(0, 32);
    fileMap[p] = id;
    if (own(blobs, id)) continue;
    if (own(ix.blobs, id)) {
      if (ix.blobs[id].sha256 !== shas[p]) refuse('layout', `blob id collision at ${id}`);
      blobs[id] = ix.blobs[id];
      continue;
    }
    const b = finalFiles[p], ids = [], n = Math.max(1, Math.ceil(b.length / LIMITS.chunkBytes));
    for (let j = 0; j < n; j++) {
      ids.push(`${BP}${id}-${j}`);
      newChunks.push(`<script type="application/octet-stream" id="${BP}${id}-${j}">${toBase64(b.subarray(j * LIMITS.chunkBytes, (j + 1) * LIMITS.chunkBytes))}</script>`);
    }
    blobs[id] = { mime: p.startsWith('audio/') ? (mimeOf(p) === 'application/octet-stream' ? 'audio/mpeg' : mimeOf(p)) : mimeOf(p), bytes: b.length, sha256: shas[p], chunks: ids };
    idBySha.set(shas[p], id);
  }
  // 参照されなくなった塊。実行系が別の場所から <scheme><id> で参照していれば残す（ほかの書き手の文書）
  const L = scanLayout(original);
  if (L.dupBlocks.size) refuse('layout', `duplicate runtime blocks: ${[...L.dupBlocks].join(', ')}`);
  for (const b of BLOCKS) if (!L.blocks.has(b) || !L.blocks.get(b).hasEnd) refuse('layout', `runtime block ${b} not found`);
  if (!L.index) refuse('layout', 'index element not found');
  const blockText = (id) => original.slice(L.blocks.get(id).cStart, L.blocks.get(id).cEnd);
  const dropped = Object.keys(ix.blobs).filter((id) => !own(blobs, id));
  for (const id of dropped) {
    const ref = SCHEME + id, count = (s) => s.split(ref).length - 1;
    const outsideRefs = count(original) - count(blockText('deck-audio')) - count(original.slice(L.index.start, L.index.end));
    if (outsideRefs > 0) { blobs[id] = ix.blobs[id]; warnings.push(`blob ${id} is no longer in files but the runtime refers to it; kept`); }
  }

  // 6. 索引：変わった項目だけを書き換える（ほかの項目・知らない項目はバイトのまま）
  let ixText = original.slice(L.index.cStart, L.index.cEnd);
  const ixOrig = ixText;
  const setIx = (path, v, order) => { ixText = jsonSet(ixText, path, v, order || (path.length === 1 ? INDEX_ORDER : [])); };
  if (srcSha !== ix.sourceSha256) setIx(['sourceSha256'], srcSha);
  if (!deepEqual(fileMap, ix.files)) setIx(['files'], fileMap);
  if (!deepEqual(Object.keys(blobs).sort(), Object.keys(ix.blobs).sort())) setIx(['blobs'], blobs);
  const hasAudio = Object.keys(newAudio).length > 0;
  const req = Array.isArray(ix.requires) ? ix.requires.slice() : [];
  if (hasAudio && !req.includes('audio-v1')) req.push('audio-v1');
  if (!hasAudio && req.includes('audio-v1')) req.splice(req.indexOf('audio-v1'), 1);
  if (!deepEqual(req, ix.requires)) setIx(['requires'], req);
  if (!hasAudio) { if (own(ix, 'audio')) setIx(['audio'], undefined); }
  else if (!own(ix, 'audio')) setIx(['audio'], newAudio);
  else for (const k of audioChanged) setIx(['audio', k], own(newAudio, k) ? newAudio[k] : undefined, Object.keys(newAudio));
  if (identity) {
    setIx(['docId'], identity.docId);
    if (identity.derivedFrom) setIx(['metadata', 'derivedFrom'], identity.derivedFrom, [...KNOWN.metadata]);
    else if (isObj(ix.metadata) && own(ix.metadata, 'derivedFrom')) setIx(['metadata', 'derivedFrom'], undefined);
  }
  // 拡張の行から作る拡張（§9A）：行が変わった名前だけ。段階の鍵でない項目と v は元のまま
  const exOld = extensionsFrom(oldSegs), exNew = extensionsFrom(newSegs), exCur = isObj(ix.extensions) ? ix.extensions : dict();
  const exChanged = [...new Set([...Object.keys(exOld), ...Object.keys(exNew)])].filter((n) => !deepEqual(exOld[n], exNew[n]));
  if (exChanged.length) {
    const target = dict();
    for (const n of Object.keys(exCur)) target[n] = exCur[n];
    for (const n of exChanged) {
      if (!own(exNew, n)) { delete target[n]; continue; }
      const v = exNew[n];
      if (isObj(exCur[n])) for (const f of Object.keys(exCur[n])) if (!RE.stepKey.test(f) && (f === 'v' || !own(v, f))) v[f] = exCur[n][f];
      target[n] = v;
    }
    if (!Object.keys(target).length) setIx(['extensions'], undefined);
    else if (!own(ix, 'extensions')) setIx(['extensions'], target);
    else for (const n of exChanged) setIx(['extensions', n], target[n], Object.keys(target));
  }
  const newIndex = parseJsonStrict(ixText);

  // 7. 実行系の JSON：変わった段階の項目だけ
  const blockEdits = new Map();
  const edit = (id, fn) => { const cur = blockEdits.has(id) ? blockEdits.get(id) : blockText(id); blockEdits.set(id, fn(cur)); };
  for (const { s, st } of narrChanged) edit('deck-narration', (t) => {
    const v = newMap[s]?.[st];
    if (v !== undefined && !own(parseJsonStrict(t), s)) return jsonSet(t, [s], { [st]: v }, Object.keys(newMap));
    return jsonSet(t, [s, st], v, newMap[s] ? Object.keys(newMap[s]) : [], true);
  });
  for (const k of marksChanged) edit('deck-marks', (t) => jsonSet(t, [k], newMarks[k], Object.keys(newMarks)));
  for (const k of timingChanged) edit('deck-timing', (t) => jsonSet(t, [k], newT[k], Object.keys(newT)));
  const deckAudio = (a) => { const id = fileMap[a.file]; return { src: SCHEME + id, mime: blobs[id].mime, dur: a.dur, cues: a.sync === 'none' ? [] : a.cues, ...(a.sync && a.sync !== 'auto' ? { sync: a.sync } : {}) }; };
  for (const k of audioChanged) edit('deck-audio', (t) => jsonSet(t, [k], own(newAudio, k) ? deckAudio(newAudio[k]) : undefined, Object.keys(newAudio)));
  if (srcSha !== ix.sourceSha256) edit('deck-meta', (t) => jsonSet(t, ['sourceSha256'], srcSha));
  if (identity) edit('deck-meta', (t) => jsonSet(t, ['docId'], identity.docId));

  // 8. 字の補い：変わった段階の表示の字のうち、今の文書の字（@font-face）が持たないもの
  let supplement = null;
  const lang = (r.deckMeta && r.deckMeta.lang) || (isObj(ix.metadata) && ix.metadata.lang) || 'ja';
  const need = new Set();
  for (const { s, st } of narrChanged) for (const x of strings(newMap[s]?.[st])) for (const ch of x) if (ch.codePointAt(0) >= 0x20) need.add(ch.codePointAt(0));
  if (need.size) {
    const have = fontFacesOf(original, L.styles);
    // 範囲（unicode-range）のない字（字を絞り込んだもの）は、元の口述原稿の字だけを持つとみなす（足りなければ補う。多めに足すことはあっても欠けない）
    const known = new Set();
    for (const x of strings(parseJsonStrict(blockText('deck-narration')))) for (const ch of x) known.add(ch.codePointAt(0));
    const covered = (c, family, w) => have.some((f) => f.family === family && f.w === w && (f.range ? inRange(f.range, c) : known.has(c)));
    const families = { biz: 'BIZ UDPGothic', sans3: 'Source Sans 3' };
    const facesOf = (key) => (opts.fonts ? opts.fonts.faces(key) : null);
    const sans = isJapanese(lang) ? null : facesOf('sans3');
    const inSans = (c) => !!sans && sans.some((f) => inRange(f.range, c));
    const add = [], seen = new Set(), missing = [];
    for (const c of [...need].sort((a, b) => a - b)) {
      const key = isJapanese(lang) ? 'biz' : inSans(c) ? 'sans3' : c > LATIN_MAX ? 'biz' : null;
      if (!key) continue;
      for (const w of [400, 700]) {
        if (covered(c, families[key], w)) continue;
        const list = facesOf(key);
        if (!list) { missing.push(c); continue; }
        const f = list.find((x) => x.w === w && inRange(x.range, c));
        if (f && !seen.has(f.file)) { seen.add(f.file); add.push({ f, key }); }
      }
    }
    if (missing.length) refuse('fonts', `glyphs for ${missing.length} new characters are needed but no font source was given`);
    if (add.length) {
      // 分割ファイルの並び（組み立てと同じ：字の種類 → 太さ → 分割の順）
      const order = new Map();
      for (const key of ['sans3', 'biz']) (facesOf(key) || []).forEach((f, j) => order.set(f.file, (key === 'sans3' ? 0 : 1e6) + j));
      add.sort((a, b) => order.get(a.f.file) - order.get(b.f.file));
      let css = '';
      for (const { f } of add) css += fontFaceCss(f, await opts.fonts.load(f.file));
      const nums = L.styles.map((s) => s.id && s.id.startsWith(SUP) ? s.id.slice(SUP.length) : null).filter((x) => x !== null && /^(0|[1-9]\d*)$/.test(x)).map(Number);
      const n = nums.length ? Math.max(...nums) + 1 : 0;
      supplement = { id: SUP + n, files: add.map((x) => x.f.file), chars: [...need].filter((c) => add.some((x) => inRange(x.f.range, c))).map((c) => String.fromCodePoint(c)).join(''), css };
    }
  }

  // 9. 文書に差し込む（後ろから。ほかのバイトはそのまま）
  const ops = [];   // [start, end, text]
  for (const [id, t] of blockEdits) { const b = L.blocks.get(id); if (t !== original.slice(b.cStart, b.cEnd)) ops.push([b.cStart, b.cEnd, t]); }
  if (ixText !== ixOrig) {
    const startTag = original.slice(L.index.start, L.index.cStart);
    const h = await sha256Hex(ixText), oldH = /data-sha256\s*=\s*"([0-9a-f]{64})"/.exec(startTag);
    if (!oldH) refuse('layout', 'index start tag without a quoted data-sha256');
    const at = L.index.start + oldH.index + oldH[0].indexOf(oldH[1]);
    ops.push([at, at + 64, h]);
    ops.push([L.index.cStart, L.index.cEnd, ixText]);
  }
  // 読める層：変わった段階の div（足す・書き直す・消す）
  if (narrChanged.length) {
    const R = L.readable;
    if (!R) refuse('layout', `readable layer (#${RD_ID}) not found`);
    const inserts = new Map();
    const newBySlide = new Map();
    for (const sg of newSegs) { if (!newBySlide.has(sg.slideKey)) newBySlide.set(sg.slideKey, []); newBySlide.get(sg.slideKey).push(sg); }
    for (const { k, s, st } of narrChanged) {
      const art = R.articles.get(s);
      if (!art) { if (L.slideKeys.has(s)) refuse('layout', `readable layer has no article for slide "${s}"`); continue; }
      if (R.dupArticles.has(s) || art.dupDivs.has(k)) refuse('layout', `readable layer has duplicate entries for "${k}"`);
      const seg = segByKey.get(k), div = art.divs.get(k);
      const html = seg ? readableStep(seg).replace(/\r\n?/g, '\n') : null;
      if (div && html) ops.push([div.start, div.end, html]);
      else if (div) ops.push(original[div.end] === '\n' ? [div.start, div.end + 1, ''] : [div.start - (original[div.start - 1] === '\n' ? 1 : 0), div.end, '']);
      else if (html) {
        const steps = (newBySlide.get(s) || []).slice().sort((a, b) => readableStepOrder(a.stepKey) - readableStepOrder(b.stepKey));
        let after = art.after;
        for (const x of steps) { if (x.stepKey === st) break; const d = art.divs.get(`${s}:${x.stepKey}`); if (d && !narrChanged.some((c) => c.k === `${s}:${x.stepKey}` && !segByKey.has(c.k))) after = d.end; }
        if (!inserts.has(after)) inserts.set(after, []);
        inserts.get(after).push({ o: readableStepOrder(st), html });
      }
    }
    for (const [at, list] of inserts) ops.push([at, at, list.sort((a, b) => a.o - b.o).map((x) => '\n' + x.html).join('')]);
  }
  // 塊
  const dropSet = new Set(Object.keys(ix.blobs).filter((id) => !own(blobs, id)));
  for (const c of L.chunks) {
    const id = RE.chunkId.exec(c.id)[1];
    if (!dropSet.has(id)) continue;
    ops.push(original[c.end] === '\n' ? [c.start, c.end + 1, ''] : [c.start - (original[c.start - 1] === '\n' ? 1 : 0), c.end, '']);
  }
  if (newChunks.length) {
    const kept = L.chunks.filter((c) => !dropSet.has(RE.chunkId.exec(c.id)[1]));
    const at = kept.length ? Math.max(...kept.map((c) => c.end)) : L.index.end;
    ops.push([at, at, '\n' + newChunks.join('\n')]);
  }
  // 字の補い：前の補いの後、なければ組み立ての字（deck-base）の後、なければ </head> の前
  if (supplement) {
    const sups = L.styles.filter((s) => s.id && s.id.startsWith(SUP));
    const base = L.styles.find((s) => s.id === 'deck-base');
    const at = sups.length ? Math.max(...sups.map((s) => s.end)) : base ? base.end : L.headEnd;
    if (at == null) refuse('layout', 'no place for a font supplement (no deck-base style and no </head>)');
    ops.push([at, at, `\n<style id="${supplement.id}">\n${supplement.css}</style>`]);
  }
  ops.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (let i = 1; i < ops.length; i++) if (ops[i][1] > ops[i - 1][0] && ops[i][0] !== ops[i][1]) refuse('layout', 'overlapping edits');
  let html = original;
  for (const [s, e, t] of ops) html = html.slice(0, s) + t + html.slice(e);

  // 10. 確かめ：読み直して、索引・塊・sourceSha256 が合うこと
  let back;
  try { back = await readPortable(html); } catch (e) { refuse('verify', `the edited file does not read back: ${e.message}`); }
  if (!back.sourceMatches) refuse('verify', 'the edited file does not read back with a matching sourceSha256');
  const me = back.deckMeta ? validateDeckMeta(back.deckMeta) : ['no deck-meta'];
  if (me.length) refuse('verify', me.join('; '));
  if (back.index.docId !== docId || back.deckMeta.docId !== docId) refuse('verify', 'docId was not kept');
  return {
    ok: true, html, index: newIndex, deckMeta: back.deckMeta, warnings: [...warnings],
    changes: {
      files: changed, narration: narrChanged.map((x) => x.k), marks: marksChanged, timing: timingChanged, audio: audioChanged,
      extensions: exChanged, blobsAdded: newChunks.length ? Object.keys(blobs).filter((id) => !own(ix.blobs, id)) : [], blobsDropped: [...dropSet],
      supplement: supplement ? { id: supplement.id, files: supplement.files.map((f) => String(f).split('/').pop()), chars: supplement.chars } : null,
      identity: !!identity, unchanged: html === original,
    },
  };
}

// 段 A の場所の一覧（試験と、ほかの道具が「どこが変わってよいか」を知るため）
export const TIER_A_REGIONS = Object.freeze({ blocks: BLOCKS, index: IX_ID, chunkPrefix: BP, readable: RD_ID, supplementPrefix: SUP, files: [...TIER_A_FILES] });
export { splitKey, objectAt as jsonObjectAt };
