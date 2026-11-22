// LMS 用の SCORM 1.2 の包み（spec bindings/scorm12.md §1）：再生専用の Egatari ファイルを、そのまま index.html として 1 つの SCO の zip に入れる。
// node: も fs も使わない（CLI の build --scorm と編集アプリの「エクスポート ▸ LMS 用（SCORM）…」が同じバイトを作る）
//
//   scormPackage(html, { checks }?) → { zip: Uint8Array, manifest, docId, title, steps, completion }
//     html：再生専用の Egatari ファイル（kit/core/portable.mjs の playOnly の出力）。バイトを変えずに index.html にする
//     checks：確認問題の条件（format spec §9.2 completion.checks）を、包む前に再生専用の写しの deck-meta.completion に書く。
//       "answered" | "correct" で書き、null で消す。省けば（undefined）写しのまま。書いた写しを、バイトを変えずに index.html にする
//   withChecks(html, checks) → deck-meta.completion.checks を書き換えた再生専用の写し（上の checks と同じ。ほかはバイトのまま）
//   scormManifest({ docId, title }) → imsmanifest.xml の文字列（包み方 §1 の形のまま）
//   SCORM_EXT：書き出す zip の拡張子（名前は kit/core/export-name.mjs の exportName(題名, 既定, SCORM_EXT)）
//
// 断るもの（ScormError、code 付き）：Egatari ファイルでない・deck-meta.tracking に scorm12 がない（§2）・
// 再開データ（cmi.suspend_data、3 つの bitset）が 4096 字を超えうる（§2.2。数えると 8064 ステップより多いとき。包み方の「about 3000」は控えめに過ぎる）・索引を持つ（編集できる Egatari ファイル。再生専用にしてから包む）
//
// 終えた判定（§3）は再生器（kit/track.js）が deck-meta.completion から決め、cmi.core.lesson_status を completed にする。
// 確認問題（パーツの問い、format spec §8.4 ctx.answer）があれば、再生器が点数（cmi.core.score.raw、正解した割合）も送る（§2.1）。
// 包みの側には何も書かない：adlcp:masteryscore は点数と比べて passed / failed を決めるためのもので、確認問題は理解の確認で
// 試験ではない（§2.1：passed / failed は使わない。答えはファイルの中にあり、学習者の端末で判定する。成績は LMS の小テストで）
import { writeZip } from './zip-write.mjs';
import { scanDocument, readDeckMeta } from './portable.mjs';
import { jsonScript } from './build-core.mjs';
import { FORMAT } from './format.mjs';

export const SCORM_EXT = '.scorm.zip';
export const SCORM_LAUNCH = 'index.html';
export const SCORM_MANIFEST = 'imsmanifest.xml';
export const SUSPEND_MAX = 4096;   // cmi.suspend_data の上限（SCORM 1.2 の CMIString4096）

export class ScormError extends Error {
  constructor(code, msg) { super(msg); this.name = 'ScormError'; this.code = code; }
}
const fail = (code, msg) => { throw new ScormError(code, msg); };

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  // XML 1.0 に書けない制御文字（タブ・改行のほか）は空白に
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, ' ');

export function scormManifest({ docId, title }) {
  const t = xml(title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${FORMAT.NAME}-${xml(docId)}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>${t}</title>
      <item identifier="item" identifierref="res">
        <title>${t}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res" type="webcontent" adlcp:scormtype="sco" href="${SCORM_LAUNCH}">
      <file href="${SCORM_LAUNCH}"/>
    </resource>
  </resources>
</manifest>
`;
}

// 再開データの長さの上限（kit/track.js の suspendData と同じ形で、すべてのビットを立てたとき。base64url は = なし）
export function suspendLength(n) {
  const k = Math.ceil(n / 8), b = Math.floor(k / 3) * 4 + (k % 3 ? k % 3 + 1 : 0), bits = 'A'.repeat(b);
  return JSON.stringify({ v: 1, n, h: '00000000', seen: bits, stage: bits, text: bits }).length;
}

// ステップの数：読める層（format spec §2.4）のスライドの項目の中の data-step-key（どのステップも 1 つ）と、台本（deck-narration）のステップの多い方。
// 再生器はスライドの data-step からタイムラインを作るので、台本のないステップは読める層にも台本にもないことがある（上限の確かめには足りる：上限は 3000 前後）
export function stepCount(html) {
  const keys = new Set();
  const at = html.search(new RegExp(`<section\\b[^>]*\\bid="${FORMAT.READABLE_ID}"`));
  if (at >= 0) {
    const rest = html.slice(at), stop = rest.search(/<\/section>|<article\b[^>]*\bid="[^"]*-article"/);
    for (const m of (stop >= 0 ? rest.slice(0, stop) : rest).matchAll(/\bdata-step-key="([^"]*)"/g)) keys.add(m[1]);
  }
  let narr = 0;
  const dn = html.match(/<script\b[^>]*\bid="deck-narration"[^>]*>([\s\S]*?)<\/script>/);
  if (dn) {
    try { const o = JSON.parse(dn[1]); for (const s of Object.values(o || {})) if (s && typeof s === 'object') narr += Object.keys(s).length; } catch { /* 数えない */ }
  }
  return Math.max(keys.size, narr);
}

export function scormPackage(html, opts = {}) {
  if (typeof html !== 'string') fail('scorm-not-egatari', 'not an Egatari file');
  if (opts.checks !== undefined) html = withChecks(html, opts.checks);
  const scan = scanDocument(html);
  const meta = readDeckMeta(scan);
  if (!meta || meta.format !== FORMAT.FORMAT_ID) fail('scorm-not-egatari', `not a ${FORMAT.DISPLAY_NAME} file (no deck-meta with format "${FORMAT.FORMAT_ID}")`);
  if (scan.byId.has(FORMAT.INDEX_ID)) fail('scorm-not-play-only', `the file still carries its editable source (${FORMAT.INDEX_ID}); package the play-only copy`);
  if (!Array.isArray(meta.tracking) || !meta.tracking.includes('scorm12')) fail('scorm-no-tracking', 'the player in this file does not report progress through SCORM 1.2 (deck-meta.tracking has no "scorm12")');
  if (typeof meta.docId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(meta.docId)) fail('scorm-no-docid', 'deck-meta.docId is not a UUID');
  const title = typeof meta.title === 'string' && meta.title.trim() ? meta.title : 'Untitled';
  const steps = stepCount(html);
  if (suspendLength(steps) > SUSPEND_MAX) fail('scorm-too-many-steps', `${steps} steps: the resume data (cmi.suspend_data) could exceed ${SUSPEND_MAX} characters (SCORM 1.2 binding §2.2)`);
  const manifest = scormManifest({ docId: meta.docId, title });
  const zip = writeZip([[SCORM_MANIFEST, manifest], [SCORM_LAUNCH, html]]);
  return { zip, manifest, docId: meta.docId, title, steps, completion: meta.completion || null };
}

// 再生専用の写しの deck-meta.completion.checks を書き換える（checks："answered" | "correct" | null）。ほかの項目と、deck-meta の外はバイトのまま。
// completion がほかに何も持たなくなったら completion ごと消す（{} は規則のない completion：schema が断る）
export const CHECKS = Object.freeze(['answered', 'correct']);
export function withChecks(html, checks) {
  if (checks !== null && !CHECKS.includes(checks)) throw new TypeError(`checks: not one of ${CHECKS.join(', ')} or null`);
  const scan = scanDocument(html);
  const meta = readDeckMeta(scan), el = scan.byId.get('deck-meta');
  if (!meta || meta.format !== FORMAT.FORMAT_ID || !el || el.start == null) fail('scorm-not-egatari', `not a ${FORMAT.DISPLAY_NAME} file (no deck-meta with format "${FORMAT.FORMAT_ID}")`);
  const c = meta.completion && typeof meta.completion === 'object' && !Array.isArray(meta.completion) ? { ...meta.completion } : {};
  if ((c.checks ?? null) === checks) return html;
  if (checks) c.checks = checks; else delete c.checks;
  const nm = { ...meta };
  if (Object.keys(c).length) nm.completion = c; else delete nm.completion;
  return html.slice(0, el.start) + jsonScript('deck-meta', nm) + html.slice(el.end);
}

// 終えた判定（deck-meta.completion、format spec §9.2）を平たい言葉で。編集アプリの窓と CLI の出力が使う
//   kind：'all' | 'fraction' | 'end'、percent（fraction のとき）、played（再生したステップだけを数える）、
//   checks：確認問題の条件（null | 'answered' | 'correct'）
export function completionRule(c) {
  const r = { kind: 'all', percent: 100, played: false, checks: null };
  if (c && typeof c === 'object') {
    if (c.reachedEnd === true) r.kind = 'end';
    else if (typeof c.visitedFraction === 'number' && c.visitedFraction > 0 && c.visitedFraction < 1) { r.kind = 'fraction'; r.percent = Math.round(c.visitedFraction * 1000) / 10; }
    if (c.played === true) r.played = true;
    if (CHECKS.includes(c.checks)) r.checks = c.checks;
  }
  return r;
}
