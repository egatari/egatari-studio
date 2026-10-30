// 組んだデッキをヘッドレス Chrome で検査する
// 約束事は docs/contract.md、段階の規則は skills/motion-slides/SKILL.md §4
//
//   node kit/check.mjs <deck.html> [--json]
//
// A. 体裁の検査（はみ出し・文字の大きさ・字数・表記・段階 0 の一覧）
//    ただし段階の状態は DECK.seek(i, k, Infinity) で作る（beforeprint の代わり）
//    はみ出し・切れ・字の大きさ・字数は kit/core/layout-scan.mjs（編集アプリの品質チェックと同じ関数）。箱で切れる字・スライドの外に出る
//    図の字・図の箱からはみ出す字・本文の外に置いた字は警告。わざと切るところは要素に data-clip（CLIP_ATTR）を付けて外す
//    本文の場所の限りはテーマの寸法の宣言（theme.json の metrics、contract §12）から導き、描いた箱が宣言と違えば themeMetricsDrift（警告、デッキに 1 回）。
//    読めない宣言は themeMetricsInvalid（警告、デッキに 1 回）。同梱の字体が読み込めなければ測らずに metricsFontLoad（警告、デッキに 1 回）
// B. 口述原稿（narration.md）との対応：抜け・式の読み上げ・長すぎる 1 ターン・雛形のままの仮の行とスライドの字（警告）
// C. パレットのコントラスト（WCAG）
// D. 部品の再現性（呼び出し順で絵が変わらないか）
// E. タイムラインの長さの一覧
// F. 注目の演出（{mark:…}）：目印が見つかるか、段階ごとの印の一覧
// G. モーフ（data-morph）：元のスライドと対応する data-id があるか、対応の一覧
// H. 読み上げ（a11y）：alt の無い <img>、名前（aria-label / <title>）の無い SVG の図（警告）と部品（情報）
// I. スライドの id と鍵（format spec §8.1）：id の書式、鍵の重なり、id とほかの id（目印・\htmlId）の衝突、
//    1.0 の語彙にない書き方（§8.0：色のクラス blue・red・gray、data-steps・data-anim、<html data-mode="lecture">。警告）、
//    どのスライドにも合わない narration.md の節（エラー）、{#id} の見出しとスライドの見出しの違い（情報）
// J. スライドへのリンク（format spec §9.1A）：<a href="#<id>"> と #<id>:<段階の鍵> の行き先がないか段階が範囲の外ならエラー。
//    番号（#N）・id のないスライドの鍵へのリンクは警告。ほかのファイルへのリンクは、ファイルがなければ警告
// K. 音声が古い段階（format spec §5.4）：audio/manifest.json の記録の inputHash が今の口述原稿と違うか null（警告）。inputHash の無い
//    記録（前の tts/synth.py）は TTS の控えの digest で比べる。音声は消さない
// L. 添付（format spec §3.8）：attachments/ のファイルと egatari.json の attachments（役割がない・役割が正しくない・名前が使えない・大きすぎる・ない。警告）。
//    役割ごとの型と中身（kit/core/attach-content.mjs）：仕様が MUST NOT とするもの（許されない型・実行できるもの・入れ物・音声と動画・マクロ・JavaScript の
//    ある PDF など）はエラー、断るべきもの（SHOULD：役割の条件・中身が型と違う・確かめられない）と気をつけるもの（数式として読まれる値など）は警告
// 終了コード：0 = エラーなし、1 = エラーの指摘あり（または引数・組み立ての失敗）、2 = 検査が終わっていない（ブラウザが起動できない・落ちた。JSON は status: "crashed"）
// 言語：<html lang> が ja 以外（英語など）なら、です・ます／句読点を見ず、字数は文字数（タイトル 60・結論 70 で警告）、
//       式らしさは \ ^ _ と演算子の密度だけ、長いターンは 60 語で見る
//       口述原稿の言語はスライドと別に決め（voice.json の "lang" ＞ 発言の文字 ＞ <html lang>）、式らしさと長いターンは発言ごとにその言語の規則で見る
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './browser.mjs';
import { compareRenders, domSnapshot } from './render-compare.mjs';
import { build, isJapanese, analyzeSlideIds, listFiles, nodeEnv } from './build.mjs';
import { referenceVoices, matchReference } from './core/ref-voice.mjs';
import { excludedReason } from './core/portable.mjs';
import { FORMAT } from './core/format.mjs';
import { planAttachments, inspectAttachment, ATTACH_LIMITS } from './core/attachments.mjs';
import { normalizeKey, noteProblems } from './narration.mjs';
import { readingProblems, orphanSteps, orphanDetail, formulaLike, narrationLang, textLang } from './core/narration-lint.mjs';
import { cleanErrorText, componentError } from './core/error-text.mjs';
import { partReportFinding, message, where, ruleOf } from './check-messages.mjs';
import { readRegular, readHead, READ_LIMITS } from './bounded-read.mjs';
import { audioState } from './core/audio-core.mjs';
import { layoutScan, metricsProbe, metricsFonts, CLIP_ATTR, ANNOT_ATTR, OVERLAP_ATTR } from './core/layout-scan.mjs';
import { placeholderSteps, templateTextIn } from './core/template-text.mjs';
import { legacyVocabulary } from './core/legacy-vocab.mjs';

// ---------------------------------------------------------------- 引数
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const ti = args.indexOf('--theme'), theme = ti >= 0 ? args[ti + 1] : undefined;
const li = args.indexOf('--lang'), langArg = li >= 0 ? args[li + 1] : undefined;   // 知らせの言葉（ja | en。既定はデッキの言語）
const src = args.find((a, i) => !a.startsWith('--') && !(ti >= 0 && i === ti + 1) && !(li >= 0 && i === li + 1));
if (!src) {
  console.error('usage: node kit/check.mjs <deck.html> [--theme name] [--lang ja|en] [--json]');
  process.exit(1);
}

// ---------------------------------------------------------------- 結果の置き場
// slide: null（デッキ全体）または {i, title}。sev: 'error' | 'warn' | 'info'
const results = [];
// code：kit/check-messages.mjs の知らせ。a：その値。step：段階の鍵（0・1・…・concl）か null。言葉は最後に作る（どこか＋何が違うか＋どう直すか）
function report(slide, sev, code, a = {}, step = null) { results.push({ slide, sev, code, a, step }); }
const SEV_RANK = { error: 0, warn: 1, info: 2 };

// ---------------------------------------------------------------- 字数（全角 1・半角 0.5）
function units(s) {
  return [...s].reduce((a, ch) => a + (/[\u0000-ÿ]/.test(ch) ? 0.5 : 1), 0);
}

// 式らしさ（読み上げ原稿としての警告用）と口述原稿の言語は kit/core/narration-lint.mjs（formulaLike・narrationLang・textLang）

// ---------------------------------------------------------------- WCAG コントラスト
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastOf(rgbA, rgbB) {
  const a = luminance(rgbA), b = luminance(rgbB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- 1. ビルド（メモリ上）
let built;
try { built = build(src, theme ? { theme } : {}); }
catch (e) { console.error('ビルド失敗: ' + e.message); process.exit(1); }
// 言語：<html lang> が ja か、lang が無ければ日本語の規則。それ以外（英語など）は英語の規則
const lang = built.html.match(/<html[^>]*\slang="([^"]*)"/)?.[1] || '';
const JA = isJapanese(lang);
const ML = langArg === 'en' || langArg === 'ja' ? langArg : JA ? 'ja' : 'en';
// テーマの寸法の宣言（theme.json の metrics。kit/core/theme-metrics.mjs）：本文の場所の限りに使い、描いた箱と比べる（A）
const themeInfo = built.theme || { name: built.stats.theme, metrics: null, declared: false };
const metricsWarn = [];
for (const w of built.stats.warn) {
  // 目印の有無は F で、部品が作った要素も含めて実際の画面で調べる（build は原稿の文字列だけを見る）
  if (/^mark: 目印/.test(w)) continue;
  // 読めない寸法の宣言は、デッキに 1 回の themeMetricsInvalid にまとめる
  if (/^theme-metrics: /.test(w)) { metricsWarn.push(w.replace(/^theme-metrics: /, '')); continue; }
  // 鍵の重なりは I でエラーにする（build は「#n」を付けて組めるようにしただけ）
  if (/^slide key: /.test(w)) continue;
  // narration.md の見出しがどのスライドにも対応しない → 原稿と見出しがずれている重大な不整合
  report(null, /^narration:/.test(w) ? 'error' : 'warn', 'build', { w });
}
if (metricsWarn.length) report(null, 'warn', 'themeMetricsInvalid', { theme: themeInfo.name, list: metricsWarn });

// ================================================================ I. スライドの id と鍵
{
  const ids = analyzeSlideIds(readRegular(src, { max: READ_LIMITS.source }).toString('utf8'));   // 原稿：通常のファイルだけ、上限つきで（kit/bounded-read.mjs）
  for (const p of ids.problems) report(p.slide, p.sev, 'slideId', { msg: p.msg });
  // 旧来の鍵（format spec §8.1）：手書きの data-key と s<n>（見出しも id もない）。鍵は変えずに知らせるだけ
  for (const s of ids.slides) {
    if (s.rule === 'data-key') report(s.index, 'warn', 'legacyDataKey', { key: s.key, line: s.line });
    else if (s.rule === 'index') report(s.index, 'warn', 'legacyIndex', { key: s.key, line: s.line });
  }
  // 1.0 の語彙にない書き方（format spec §8.0）：色のクラス blue・red・gray、data-steps・data-anim、<html data-mode="lecture">。警告だけ（教材は組める）
  for (const x of legacyVocabulary(readRegular(src, { max: READ_LIMITS.source }).toString('utf8'))) report(null, 'warn', x.code, x);
  // {#id} で指したスライドの見出しと、narration.md の見出しの文字列が違う（id が勝つので、知らせるだけ）
  const byKey = new Map(built.slides.map((s, i) => [s.key, { ...s, i }]));
  for (const sec of built.segs.sections || []) {
    if (!sec.id) continue;
    const s = byKey.get(sec.key);
    if (s && sec.heading && normalizeKey(sec.heading) !== normalizeKey(s.heading)) {
      report(s.i, 'info', 'narrHeadingDiffers', { line: sec.line, heading: sec.heading, slide: s.heading, id: sec.id });
    }
  }
}

// ================================================================ K. 音声が古い段階
{
  const deckDir = fs.realpathSync(path.dirname(path.resolve(src)));
  // 原稿のフォルダの中の通常のファイルだけ、上限つきで（kit/bounded-read.mjs）。なければ・読めなければ null
  const readJson = (rel) => {
    const p = path.join(deckDir, rel);
    try { if (!fs.existsSync(p) || !fs.realpathSync(p).startsWith(deckDir + path.sep)) return null; return JSON.parse(readRegular(p, { max: READ_LIMITS.json }).toString('utf8')); } catch { return null; }
  };
  const man = readJson(path.join('audio', 'manifest.json'));
  const segments = man && typeof man.segments === 'object' && man.segments && !Array.isArray(man.segments) ? man.segments : {};
  const byKey = new Map(built.segs.map((s) => [`${s.slideKey}:${s.stepKey}`, s]));
  const slideOf = new Map(built.slides.map((s, i) => [s.key, i]));
  for (const [k, e] of Object.entries(segments)) {
    const seg = byKey.get(k);
    if (!seg) continue;   // 口述原稿にない段階の音声は組み立てが使わない（tts/synth.py が manifest から消す）
    const sj = e && typeof e === 'object' && !('inputHash' in e) && /^[0-9a-f]{1,64}$/.test(String(e.digest || '')) ? readJson(path.join('audio', `seg_${e.digest}.json`)) : null;
    if ((await audioState(e, seg, sj)) === 'stale') {
      const i = slideOf.has(seg.slideKey) ? slideOf.get(seg.slideKey) : null;
      report(i, 'warn', `audio: stale — 段階 ${k} の音声は今の口述原稿から作ったものではない（${e && e.kind === 'recorded' ? '録音' : e && e.kind === 'imported' ? '取り込み' : 'TTS'}。編集アプリの「音声」で録り直すか、tts/synth.py で作り直す）`);
    }
  }
}

// ================================================================ L. 添付（attachments/。format spec §3.8）
// 1 ファイル（.ega.html）への書き出しと同じ規則（kit/core/attachments.mjs）：役割のないもの・名前の使えないもの・大きすぎるもの・ないもの
{
  const deckDir = fs.realpathSync(path.dirname(path.resolve(src)));
  const aDir = path.join(deckDir, FORMAT.ATTACH_DIR);
  let conf = null;
  const cfgPath = path.join(deckDir, FORMAT.CONFIG_FILE);
  try { if (fs.existsSync(cfgPath)) conf = JSON.parse(readRegular(cfgPath, { max: READ_LIMITS.json }).toString('utf8')); } catch (e) { report(null, 'warn', 'attachBadConfig', { why: `${FORMAT.CONFIG_FILE}: ${e.message}` }); }
  for (const name of ['live', 'embed']) {
    const v = conf?.extensions?.[name]?.v;
    if (Number.isInteger(v) && v > 1) report(null, 'info', 'extensionVersion', { name, v, supported: 1 });
  }
  const found = [];
  let isLink = false;
  try { isLink = fs.lstatSync(aDir).isSymbolicLink(); } catch { /* ない */ }
  if (isLink) report(null, 'warn', 'attachBadName', { path: FORMAT.ATTACH_DIR + '/', why: 'a symbolic link (not followed)' });
  else if (fs.existsSync(aDir)) {
    for (const abs of listFiles(aDir)) {
      // 先頭の 64 バイト（音声・動画を中身で見分ける。kit/core/attachments.mjs の sniffMedia）
      let head = null;
      try { head = readHead(abs, 64); } catch { head = null; }
      const rel = path.relative(deckDir, abs).split(path.sep).join('/'), size = fs.statSync(abs).size;
      // 中身（上限の内のものだけを読む。大きすぎるものは planAttachments が知らせる）
      let problems = [];
      if (size <= ATTACH_LIMITS.fileBytes) { try { problems = (await inspectAttachment(rel, readRegular(abs, { max: ATTACH_LIMITS.fileBytes }))).problems; } catch { problems = []; } }
      found.push({ path: rel, size, head, problems });
    }
    // ドットで始まる名前・リンクは一覧に入らない（書き出しも入れない）：知らせる
    const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n), st = fs.lstatSync(p), rel = path.relative(deckDir, p).split(path.sep).join('/');
      if (st.isSymbolicLink()) report(null, 'warn', 'attachBadName', { path: rel, why: 'a symbolic link (not followed)' });
      else if (n.startsWith('.')) report(null, 'warn', 'attachExcluded', { path: rel, why: 'hidden file' });
      else if (st.isDirectory()) walk(p); } };
    try { walk(aDir); } catch { /* 読めない */ }
  }
  if (found.length || (conf && conf[FORMAT.ATTACH_KEY] !== undefined)) {
    const plan = planAttachments(found, conf);
    for (const x of plan.problems) report(null, x.level === 'must' ? 'error' : 'warn', x.code, x);
    if (plan.include.length) report(null, 'info', 'attachList', { n: plan.include.length, listed: plan.list.length, size: plan.total < 1048576 ? `${(plan.total / 1024).toFixed(0)} KB` : `${(plan.total / 1048576).toFixed(1)} MiB` });
  }
}

// ================================================================ M. 参照音声（AI 音声が声をまねる元の録音。format spec §5 の recipe）
// voice.json が指す、作業フォルダの中の参照音声（kit/core/ref-voice.mjs。名前の声は IRODORI_REF_DIR が作業フォルダの中のとき）。
// エクスポート（kit/core/portable.mjs）は教材に入れない：スライドが使えば断る（エラー）、段階の音声・添付なら外す（警告）、ほかの所は知らせるだけ（情報）
{
  const deckDir = fs.realpathSync(path.dirname(path.resolve(src)));
  let refs = [];
  try { refs = referenceVoices(nodeEnv, deckDir, { refDir: process.env.IRODORI_REF_DIR }); } catch { refs = []; }
  if (refs.length) {
    // スライドが使うもの：組み立てた HTML に、その録音の中身が埋め込まれている（data: の URI。名前を変えた写しも当たる）
    const usedBySlides = new Set();
    for (const r of refs) {
      const b = r.load();
      if (b && b.length && built.html.includes(Buffer.from(b.subarray(0, 3 * 1024)).toString('base64'))) usedBySlides.add(r.rel);
    }
    // 段階の音声（audio/manifest.json の file）
    const inAudio = new Set();
    try {
      const man = JSON.parse(readRegular(path.join(deckDir, 'audio', 'manifest.json'), { max: READ_LIMITS.json }).toString('utf8'));
      for (const v of Object.values(man.segments || man)) {
        if (!v || typeof v.file !== 'string') continue;
        const m = matchReference(refs, path.relative(deckDir, path.resolve(deckDir, 'audio', v.file)).split(path.sep).join('/'));
        if (m) inAudio.add(m.rel);
      }
    } catch { /* ない・読めない */ }
    for (const r of refs) {
      if (excludedReason(r.rel)) continue;   // 隠しフォルダ（.cache など）・out/ など：エクスポートも作業フォルダの写しも見ない所
      const where = usedBySlides.has(r.rel) ? 'slides' : inAudio.has(r.rel) ? 'audio' : r.rel.startsWith(FORMAT.ATTACH_DIR + '/') ? 'attachments' : 'folder';
      report(null, where === 'slides' ? 'error' : where === 'folder' ? 'info' : 'warn', 'refVoice', { path: r.rel, where });
    }
  }
}

// ---------------------------------------------------------------- 2. 一時ファイルへ書き出し、ヘッドレス Chrome で開く
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macs-check-'));
const tmpFile = path.join(tmpDir, 'deck.html');
fs.writeFileSync(tmpFile, built.html);
const url = 'file://' + tmpFile;

// ブラウザが起動できない・検査の途中で落ちた（ブラウザの例外）ときは、検査が終わっていない。「エラー 0」と見分けがつくように、
// 終了コード 2（指摘があるときの 1 とは別）・JSON は status: "crashed"（指摘なし。ok は false）にする。
// 落ちた理由は stderr だけに出す（指摘の言葉にしない：修正依頼に混ざらない）
let browserPhase = false;
const crashed = (e) => {
  if (!browserPhase) { console.error(e && e.stack ? e.stack : String(e)); process.exit(1); }   // ブラウザの前の例外は今までどおり（終了コード 1）
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 消せなくてよい */ }
  console.error((ML === 'en' ? 'check did not finish: the headless browser failed to launch or crashed (this is not "0 errors").\n' : '検査が終わっていない：ヘッドレスのブラウザが起動できないか、途中で落ちた（「エラー 0」ではない）。\n') + String(e && e.message ? e.message : e));
  if (asJson) console.log(JSON.stringify({ ok: false, status: 'crashed', lang: ML, counts: { error: 0, warn: 0, info: 0 }, results: [] }, null, 2));
  process.exit(2);
};
process.on('uncaughtException', crashed);
process.on('unhandledRejection', crashed);
browserPhase = true;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// コンソールのエラーとページの例外は、読み込み直後だけでなく検査の全体（後の seek・再現性の確認・開き直し）を通して集め、最後にまとめて報告する
const consoleErrors = [];
let phase = '読み込み';
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${phase}] ${m.text()}`); });
page.on('pageerror', (e) => consoleErrors.push(`[${phase}] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
await page.evaluate(() => document.fonts.ready);

// スライドの一覧（番号・鍵・タイトル・段階数・static か・部品の数）
const meta = await page.evaluate(() => DECK.slides.map((s, i) => ({
  i,
  key: s._key,
  max: s._max,
  cstep: s._cstep,
  static: s.classList.contains('static'),
  comps: s._comps.length,
  id: s.id || null,
  // 段階を DOM から数える（実行系とは別に。部品が例外で止まっても data-step と .concl は数える）：番号の段階の最大と、結論の行があるか
  domMax: [...s.querySelectorAll('[data-step]:not([data-concl])')].reduce((a, e) => { const n = +e.getAttribute('data-step'); return Number.isInteger(n) && n >= 0 ? Math.max(a, n) : a; }, 0),
  domConcl: !!s.querySelector('.concl'),
  // 見出しの字（隠れているスライドでは innerText が空になるので textContent。KaTeX の読み上げ用の MathML は除く）
  title: (() => { const h = s.querySelector('h2, h1'); if (!h) return ''; const c = h.cloneNode(true); c.querySelectorAll('.katex-mathml').forEach((x) => x.remove()); c.querySelectorAll('br').forEach((x) => x.replaceWith(' ')); return c.textContent.replace(/\s+/g, ' ').trim(); })(),
})));
const titleOf = (i) => (meta[i] ? meta[i].title : '');
// 口述原稿と合わせる段階：実行系の数（_max・_cstep）と DOM から数えたものの大きいほう（数えられないもの（NaN）は DOM のほう）
for (const m of meta) {
  const hasC = !m.static && (m.cstep >= 0 || m.domConcl);
  const rtNum = Number.isFinite(m.max) ? (m.cstep >= 0 ? m.max - 1 : m.max) : 0;
  const num = Math.max(rtNum, m.domMax);
  m.smax = m.static ? 0 : num + (hasC ? 1 : 0);
  m.scstep = hasC ? m.smax : -1;
}
// 配置などの知らせは、画面を開き直す前にも集める。後の検査で初めて見えたスライドの知らせも失わず、同じものは 1 回にする。
const seenPartReports = new Set();
async function collectPartReports() {
  for (const r of await page.evaluate(() => JSON.parse(JSON.stringify(DECK.componentReports || [])))) {
    const f = partReportFinding(r), sig = JSON.stringify([r.slide, r.tag, r.index, r.code, r.msg]);
    if (!f || seenPartReports.has(sig)) continue;
    seenPartReports.add(sig);
    report(f.slide, f.sev, f.code, { ...f.a, msg: cleanErrorText(r.msg) });
  }
}
await collectPartReports();

// 部品のデータの形（kit/deck.js の DECK.componentErrors）：スライドごとに、どの部品の何が違うか
const compErrors = await page.evaluate(() => (DECK.componentErrors || []).map((r) => JSON.parse(JSON.stringify(r))));
const badComps = new Map();
for (const r of compErrors) {
  report(r.slide, 'error', 'compData', { ...r, msg: r.msg === undefined ? undefined : cleanErrorText(r.msg) });
  if (!badComps.has(r.slide)) badComps.set(r.slide, []);
  badComps.get(r.slide).push(r.tag);
}

// ================================================================ J. スライドへのリンク
phase = 'J リンク';
{
  const links = await page.evaluate(() => DECK.slides.flatMap((s, i) => [...s.querySelectorAll('a[href]')].map((a) => {
    const href = a.getAttribute('href'), f = DECK.linkFragment(a);
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (f === null) return { i, href, text, other: true };
    const r = f ? DECK.resolveFragment(f) : { error: 'empty' };
    return { i, href, text, f, r: r.error ? r : { i: r.i, k: r.k, legacy: !!r.legacy, id: r.id, key: r.key } };
  })));
  const deckDir = path.dirname(path.resolve(src));
  for (const l of links) {
    const L = { text: l.text || l.href, href: l.href };
    if (l.other) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(l.href) || l.href.startsWith('//')) continue;   // http: mailto: など
      const file = decodeURIComponent(l.href.replace(/[?#].*$/, ''));
      if (file && !fs.existsSync(path.resolve(deckDir, file))) report(l.i, 'warn', 'linkFileMissing', { ...L, file });
      continue;
    }
    const r = l.r;
    if (r.error === 'empty') report(l.i, 'warn', 'linkEmpty', L);
    else if (r.error === 'unknown slide') report(l.i, 'error', 'linkUnknown', { ...L, slide: r.slide });
    else if (r.error === 'slide number out of range') report(l.i, 'error', 'linkNumberRange', { ...L, slide: r.slide, count: meta.length });
    else if (r.error === 'no concl step') report(l.i, 'error', 'linkNoConcl', { ...L, slide: r.slide });
    else if (r.error === 'step out of range') report(l.i, 'error', 'linkStepRange', { ...L, slide: r.slide, step: r.step, max: r.max, concl: !!(meta[r.i] && meta[r.i].max > r.max) });
    else if (r.error) report(l.i, 'error', 'linkBadStep', { ...L, step: r.step });
    else if (r.legacy) report(l.i, 'warn', 'linkNumber', L);
    else if (!r.id) report(l.i, 'warn', 'linkNoId', { ...L, key: r.key });
  }
  const ok = links.filter((l) => !l.other && l.r && !l.r.error).length;
  if (links.length) report(null, 'info', 'linkCount', { ok, other: links.filter((l) => l.other).length });
}

// ================================================================ A. 体裁の検査
phase = 'A 体裁';
// 体裁の検査の関数（kit/core/layout-scan.mjs）をページに入れる（文字列で。デッキの決まり（CSP）に依らない）
await page.evaluate(`window.__layoutScan = ${layoutScan}`);
const aOut = await page.evaluate(([metaList, JA, CLIP, ANNOT, OVERLAP, METRICS]) => {
  const S = DECK.slides;
  const step0 = [], punct = [];
  const style = [], soft = [];

  // 1. 段階 0 で見えている本文（static でないスライドだけ）
  metaList.forEach((m) => {
    if (m.static) return;
    DECK.seek(m.i, 0, Infinity);
    const body = S[m.i].querySelector('.body');
    if (!body) return;
    const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let n, t = '';
    while ((n = tw.nextNode())) {
      const e = n.parentElement;
      if (e.closest('.katex-mathml') || e.closest('svg') || e.closest('script')) continue;
      let hid = false;
      for (let a = e; a && a !== body; a = a.parentElement) {
        if (a.hasAttribute('data-step') && !a.classList.contains('on')) { hid = true; break; }
      }
      if (!hid) t += n.textContent;
    }
    step0.push({ i: m.i, text: t.replace(/\s+/g, '').slice(0, 80) });
  });

  // 2. 各スライドを最終段階まで出した状態で体裁を調べる
  metaList.forEach((m) => {
    DECK.seek(m.i, m.max, Infinity);
    const s = S[m.i];
    const issues = [], warns = [];
    const body = s.querySelector('.body');
    // はみ出し・切れ・字の大きさ・字数（kit/core/layout-scan.mjs。編集アプリの品質チェックと同じ関数）
    for (const f of window.__layoutScan(s, { JA, refRe: '文献', clip: CLIP, annot: ANNOT, overlap: OVERLAP, metrics: METRICS })) (f.sev === 'error' ? issues : warns).push([f.code, f.a]);
    if (body) {
      const txt = (() => { const c = body.cloneNode(true); c.querySelectorAll('.katex-mathml').forEach((x) => x.remove()); document.body.appendChild(c); c.style.cssText = 'position:absolute;left:-99999px;width:' + body.clientWidth + 'px'; const r = c.innerText; c.remove(); return r; })();
      // 句読点はデッキの中でそろっていればよい（どちらにするかは元の原稿に合わせる）。数えて後で比べる
      // 句読点とです・ますは日本語のデッキだけ
      if (JA) punct.push({ i: m.i, jp: (txt.match(/[、。]/g) || []).length, en: (txt.match(/[，．]/g) || []).length });
      const dm = JA && txt.match(/[^\n。．]{0,14}(です|ます)(?=[。．、，」）\s]|$)/m);
      if (dm) issues.push(['desuMasu', { t: dm[0].trim() }]);
      const rm = txt.match(/\\\(|\\\[|\$[^$]+\$/);
      if (rm) issues.push(['rawMath', { t: txt.slice(rm.index, rm.index + 24).trim() }]);
      const ke = body.querySelector('.katex-error');
      if (ke) issues.push(['katexError', { t: (ke.getAttribute('title') || ke.textContent || '').slice(0, 60) }]);
    }
    if (issues.length) style.push({ i: m.i, issues });
    if (warns.length) soft.push({ i: m.i, issues: warns });
  });
  return { step0, style, soft, punct };
}, [meta, JA, CLIP_ATTR, ANNOT_ATTR, OVERLAP_ATTR, themeInfo.metrics]);

// テーマの寸法の宣言と描いた箱（見えない見本のスライドで 1 回測る。宣言がなければ既定と比べる）
// 測るのは同梱の字体が読み込まれてから（代わりの字体では測らない。読み込めなければ metricsFontLoad を知らせて測らない）
// （測れない文書、たとえば体裁の CSS を消したデッキでは測らない。検査そのものは止めない）
await page.evaluate(`window.__metricsProbe = ${metricsProbe}; window.__metricsFonts = ${metricsFonts}`);
const mfonts = await page.evaluate(async () => { try { return await window.__metricsFonts(document); } catch (e) { return { ok: false, missing: [String(e && e.message || e)] }; } });
const probe = mfonts.ok ? await page.evaluate((M) => { try { return window.__metricsProbe(document, M); } catch { return { items: [] }; } }, themeInfo.metrics) : { items: [] };
if (!mfonts.ok) report(null, 'warn', 'metricsFontLoad', { theme: themeInfo.name, fonts: mfonts.missing });
if (mfonts.foreign && mfonts.foreign.length) report(null, 'warn', 'fontNotEmbedded', { fonts: mfonts.foreign });
if (probe.items.length) report(null, 'warn', 'themeMetricsDrift', { theme: themeInfo.name, declared: !!themeInfo.declared, items: probe.items });
for (const { i, text } of aOut.step0) report(i, 'info', 'step0', { t: text }, '0');
for (const { i, issues } of aOut.style) for (const [code, a] of issues) report(i, 'error', code, a);
for (const { i, issues } of aOut.soft) for (const [code, a] of issues) report(i, 'warn', code, a);
await collectPartReports();
{
  const tot = aOut.punct.reduce((a, p) => ({ jp: a.jp + p.jp, en: a.en + p.en }), { jp: 0, en: 0 });
  if (tot.jp && tot.en) {
    const major = tot.jp >= tot.en ? 'jp' : 'en', minor = major === 'jp' ? 'en' : 'jp';
    const name = { jp: '「、。」', en: '「，．」' };
    for (const p of aOut.punct) if (p[minor]) report(p.i, 'warn', 'punctMixed', { minor: name[minor], major: name[major], n: p[minor] });
  }
}

// ================================================================ B. 口述原稿
phase = 'B 口述原稿';
const narrInfo = await page.evaluate((metaList) => {
  const out = [];
  // static のスライド（表紙など。段階は 0 だけ）も段階 0 の口述原稿を見る
  metaList.forEach((m) => {
    const s = DECK.slides[m.i];
    for (let k = 0; k <= (m.static ? 0 : m.max); k++) {
      const full = DECK.stepKey(m.i, k);
      const sk = full.slice(s._key.length + 1);
      const turns = (DECK.NARRATION[s._key] || {})[sk] || [];
      out.push({ i: m.i, stepKey: sk, turns });
    }
  });
  return out;
}, meta);

// 口述原稿の言語はスライドの言語と別に決める（voice.json の "lang" ＞ 発言の文字 ＞ <html lang>）。規則は発言ごとにその言語で選ぶ
let voiceLang;
try { voiceLang = JSON.parse(readRegular(path.join(path.dirname(path.resolve(src)), 'voice.json'), { max: READ_LIMITS.json }).toString('utf8'))?.lang; } catch { /* なし・読めない */ }
const NL = narrationLang({ voiceLang, deckLang: lang, texts: narrInfo.flatMap((n) => n.turns.map((t) => t.text)) });
if (isJapanese(NL.lang) !== JA) report(null, 'info', 'narrLang', { lang: NL.lang, deck: lang || 'ja', source: NL.source });
for (const { i, stepKey, turns } of narrInfo) {
  if (turns.length === 0) { report(i, 'warn', 'narrMissing', { step: stepKey }, stepKey); continue; }
  for (const t of turns) {
    const tl = textLang(t.text, NL.lang);
    if (formulaLike(t.text, tl)) report(i, 'warn', 'narrFormula', { t: t.text.slice(0, 40) }, stepKey);
    if (tl === 'ja' && t.text.length > 200) report(i, 'info', 'turnLong', { n: t.text.length, unit: '字' }, stepKey);
    const words = t.text.trim().split(/\s+/).length;
    if (tl !== 'ja' && words > 60) report(i, 'info', 'turnLong', { n: words, unit: '語' }, stepKey);
  }
}

// スライドにない段階の口述原稿（[k] が段階の数を超える・結論のないスライドの [concl]・結論の段階を番号で書いた）：読まれないのでエラー
let narrText = '';
try { narrText = readRegular(path.join(path.dirname(path.resolve(src)), 'narration.md'), { max: READ_LIMITS.narration }).toString('utf8'); } catch { /* なければ行は出さない */ }
const stepMeta = meta.map((m) => ({ key: m.key, max: m.smax, cstep: m.scstep, static: m.static }));
for (const o of orphanSteps(built.segs, stepMeta)) {
  const i = meta.findIndex((m) => m.key === o.slideKey);
  const max = stepMeta[i].max, hasConcl = !meta[i].static && stepMeta[i].cstep >= 0;
  const st = meta[i].static ? '（static）' : '', stEn = meta[i].static ? ' (static)' : '';
  const range = hasConcl ? { ja: (max > 1 ? `0〜${max - 1} と concl` : '0 と concl') + st, en: (max > 1 ? `steps 0–${max - 1} and concl` : 'step 0 and concl') + stEn }
    : { ja: (max ? `0〜${max}` : '0 だけ') + st, en: (max ? `steps 0–${max}` : 'step 0 only') + stEn };
  report(i, 'error', 'narrOrphan', { step: o.stepKey, line: o.line, end: o.end, range, static: meta[i].static, ...orphanDetail(o, stepMeta[i], narrText), comps: badComps.get(i) || [] }, o.stepKey);
}
// 雛形のまま（kit/core/template-text.mjs。編集アプリのスライド一覧が足した雛形）：仮の口述原稿の行（「✎ 」）と、スライドに残った雛形の字。
// 直し忘れると TTS が読み、字幕・読める層にも出るので知らせる（警告。止めない）
for (const p of placeholderSteps(narrText)) {
  const i = meta.findIndex((m) => m.key === p.slideKey);
  if (i >= 0) report(i, 'warn', 'narrPlaceholder', { line: p.line, t: p.text }, p.stepKey);
}
for (const t of templateTextIn(readRegular(src, { max: READ_LIMITS.source }).toString('utf8'))) if (meta[t.index]) report(t.index, 'warn', 'templateText', { list: t.texts.map((x) => `「${x}」`).join(''), listEn: t.texts.map((x) => `“${x}”`).join(', '), n: t.texts.length });
// 読みの指定 {x|y} は 1 つの記号か用語だけ（式や記号の組を 1 つの読みにしない）
for (const seg of built.segs) {
  const i = meta.findIndex((m) => m.key === seg.slideKey);
  if (i < 0) continue;
  for (const t of seg.turns) for (const p of noteProblems(t.raw)) {
    report(i, 'error', 'narrNote', { t: p.text, line: seg.line }, seg.stepKey);
  }
  for (const t of seg.turns) for (const p of readingProblems(t.raw)) {
    report(i, 'warn', p.why === 'operator' ? 'readingExpr' : 'readingSeveral', { t: p.text, line: seg.line }, seg.stepKey);
  }
}

// ================================================================ C. パレットのコントラスト
phase = 'C パレット';
// oklch() や color-mix() は getComputedStyle だけでは rgb に落ちないことがあるので、
// 一度 1x1 の canvas に塗って画素として読み、実際に表示される sRGB 値を得る
const palette = await page.evaluate(() => {
  const vars = ['--fg', '--term', '--emph', '--muted', '--title', '--accent2', '--bg'];
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
  document.body.appendChild(probe);
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const out = {};
  for (const v of vars) {
    probe.style.color = `var(${v})`;
    const css = getComputedStyle(probe).color;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[v] = { css, rgb: [d[0], d[1], d[2]] };
  }
  probe.remove();
  return out;
});
const bgRgb = palette['--bg'].rgb;
report(null, 'info', 'palette', { v: '--bg', css: palette['--bg'].css, rgb: bgRgb.join(',') });
for (const v of ['--fg', '--term', '--emph', '--title', '--accent2']) {
  const { css, rgb } = palette[v];
  const ratio = contrastOf(rgb, bgRgb);
  report(null, 'info', 'palette', { v, css, rgb: rgb.join(','), ratio: ratio.toFixed(2) });
  if (ratio < 4.5) report(null, 'error', 'contrastLow', { v, ratio: ratio.toFixed(2), min: 4.5 });
}
{
  const { css, rgb } = palette['--muted'];
  const ratio = contrastOf(rgb, bgRgb);
  report(null, 'info', 'palette', { v: '--muted', css, rgb: rgb.join(','), ratio: ratio.toFixed(2) });
  if (ratio < 3) report(null, 'warn', 'contrastLow', { v: '--muted', ratio: ratio.toFixed(2), min: 3 });
}

// ================================================================ D. 部品の再現性（呼び出し順に依存していないか）
phase = 'D 再現性';
const CLIP = { x: 0, y: 0, width: 1280, height: 720 };
// 撮る前に字と描画が落ち着くのを待つ（docs/contract.md §1：seek の後に requestAnimationFrame を 2 回）
// 埋め込みの字はスライドが見えたときに初めて読まれるので、先に全部読んでおく
const settle = () => page.evaluate(() => Promise.all([...document.fonts].map((f) => f.load().catch(() => {})))
  .then(() => document.fonts.ready).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
// 1 つの段階について、(A) 開き直して 1 回だけ seek した絵と、(B) 別の段階へ飛び回ってから seek した絵が違うか
// 操作の帯（kit/tools.js の #dt-cb）は開いたときに一度出て SHOW_MS（2.5 秒）で消えるので、撮る時刻で写ったり写らなかったりする。
// 遅い機械では A（開いてすぐ）にだけ写り、B（飛び回った後）では消えていて、部品と関係なく「呼び出し順に依存」になっていた。部品の絵だけを比べるため、
// 舞台の上に重なる時刻依存の飾り（操作の帯・短い知らせ）は撮る前に消しておく
const HIDE_CHROME = '#dt-cb,#deck-toast{display:none!important}';
async function orderDiffers(m, k) {
  await collectPartReports();
  await page.goto(url);
  await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });
  await page.addStyleTag({ content: HIDE_CHROME });
  await settle();
  await page.evaluate(([i, k]) => DECK.seek(i, k, 0.4), [m.i, k]);
  await settle();
  const bufA = await page.screenshot({ clip: CLIP }), domA = await domSnapshot(page, m.i);
  await page.evaluate(([i, max]) => DECK.seek(i, max, Infinity), [m.i, m.max]);
  await page.evaluate(([i]) => DECK.seek(i, 0, Infinity), [m.i]);
  await page.evaluate(([i, k]) => DECK.seek(i, k, 0.4), [m.i, k]);
  await settle();
  let bufB = await page.screenshot({ clip: CLIP });
  if (!bufA.equals(bufB)) { await settle(); bufB = await page.screenshot({ clip: CLIP }); }   // 描画の遅れによる誤検出を避ける
  // まず部品の DOM を比べる。DOM がバイトまで同じで、違いが NOISE_BOUNDS の内側（どれも図形の縁の 1 px・部品の箱の中、数が部品の面積の 0.1 % かつ 200 以下。縁から遠い画素は、ばらばらでわずか（各チャンネル 24/255 以下）なものを 4 個まで）なら、
  // 描き方の揺れ（アンチエイリアス。Linux の Chrome は描き直しを重ねると描き方を切り替える）で、呼び出し順への依存ではない（info の compOrderNoise に記録する）。
  // DOM が違う・比べる DOM のない部品（canvas など）は、今までどおり、はっきり違う画素が 40 を超えたら依存とみなす
  // （kit/render-compare.mjs。tools/test-components.mjs の決定性と同じ基準）
  if (bufA.equals(bufB)) return false;
  const r = await compareRenders(page, bufA, bufB, domA, await domSnapshot(page, m.i));
  if (r.same && r.kind === 'noise') report(m.i, 'info', 'compOrderNoise', { k, n: r.n, cap: r.cap, faint: r.faint || 0 }, String(k));   // 揺れとして通したものは必ず記録する
  lastOrderNote = r.note;
  return !r.same;
}
let lastOrderNote = '';   // 最後に違ったときの説明（compOrder のエラーに添える：DOM が違うのか、どこの何画素か）
for (const m of meta) {
  if (!m.comps) continue;
  for (let k = 1; k <= m.max; k++) {
    // 呼び出し順への依存は、何度やっても同じ絵の違いになる。最初の 1 回だけ違い、開き直すと揃うのは、遅い機械で A と B の間に時刻で変わるもの
    // （操作の帯が消えるなど。上の HIDE_CHROME）が挟まった誤報なので、念のため 3 回続けて違ったときだけ報告する
    let differs = true;
    for (let n = 0; n < 3 && differs; n++) differs = await orderDiffers(m, k);
    if (differs) { report(m.i, 'error', 'compOrder', { k }, String(k)); report(m.i, 'info', 'compOrderDetail', { k, note: lastOrderNote }, String(k)); }
  }
}
// 検査のために何度も飛び回ったので、最後にもう一度最初から開き直しておく（念のため）
await collectPartReports();
await page.goto(url);
await page.waitForFunction(() => window.DECK && DECK.ready, null, { timeout: 15000 });

// ================================================================ F. 注目の演出
phase = 'F 注目の演出';
const markInfo = await page.evaluate(() => {
  const out = [];
  DECK.slides.forEach((s, i) => {
    for (let k = 0; k <= s._max; k++) {
      const m = DECK.marks(i, k);
      if (m.length) out.push({ i, key: DECK.stepKey(i, k), marks: m });
    }
  });
  return out;
});
const fmtT = (x) => (x === null || x === Infinity ? '段階の終わり' : `${(+x).toFixed(2)} s`);
for (const { i, key, marks } of markInfo) {
  const sk = key.slice(meta[i].key.length + 1);
  for (const m of marks) if (!m.found) report(i, 'warn', 'markMissing', { id: m.id }, sk);
  report(i, 'info', 'marks', { list: marks.map((m) => `${m.id}/${m.effect} ${fmtT(m.start)}〜${fmtT(m.end)}`).join(', ') }, sk);
}

// ================================================================ G. モーフ（data-morph）
phase = 'G モーフ';
const morphInfo = await page.evaluate(() => DECK.slides.map((s, i) => ({ i, m: DECK.morph(i) })).filter((x) => x.m));
for (const { i, m } of morphInfo) {
  if (!m.src) { report(i, 'warn', 'morphNoSrc', { want: m.want }); continue; }
  if (!m.ids.length) report(i, 'warn', 'morphNoIds', { src: m.src });
  else report(i, 'info', 'morphPairs', { src: m.src, ids: m.ids.join(', ') });
  if (m.later.length) report(i, 'info', 'morphLater', { ids: m.later.join(', ') });
  for (const id of m.dupSrc) report(i, 'warn', 'morphDupSrc', { id });
  for (const id of m.dupDst) report(i, 'warn', 'morphDupDst', { id });
}

// ================================================================ H. 読み上げ（画像と図の名前）
phase = 'H 読み上げ';
const a11y = await page.evaluate(() => {
  const named = (e, root) => {
    for (let a = e; a && a !== root; a = a.parentElement) {
      if ((a.getAttribute('aria-label') || '').trim() || a.hasAttribute('aria-labelledby')) return true;
      if (a.tagName === 'FIGURE' && a.querySelector('figcaption')) return true;
    }
    return !!e.querySelector(':scope > title') && !!e.querySelector(':scope > title').textContent.trim();
  };
  const hidden = (e, root) => { for (let a = e; a && a !== root; a = a.parentElement) if (a.getAttribute('aria-hidden') === 'true' || /^(presentation|none)$/.test(a.getAttribute('role') || '')) return true; return false; };
  return DECK.slides.map((s, i) => {
    const imgs = [...s.querySelectorAll('img')].filter((e) => !e.hasAttribute('alt') && !hidden(e, s)).map((e) => (e.getAttribute('src') || '').replace(/^data:([^;,]+).*/, 'data:$1').slice(0, 60));
    const comps = s._comps.filter((c) => !hidden(c, s) && !named(c, s) && !(c.getAttribute('title') || '').trim()).map((c) => c.tagName.toLowerCase());
    // 部品の外の、ある程度の大きさの SVG（KaTeX・注目の演出・入れ子の SVG は除く）
    const svgs = [...s.querySelectorAll('svg')].filter((g) => {
      if (g.parentElement.closest('svg') || g.closest('.katex') || g.classList.contains('marks') || hidden(g, s)) return false;
      if (s._comps.some((c) => c.contains(g))) return false;
      const r = g.getBoundingClientRect();
      return r.width * r.height >= 120 * 80 && !named(g, s);
    }).length;
    return { i, imgs, comps, svgs };
  });
});
for (const { i, imgs, comps, svgs } of a11y) {
  if (imgs.length) report(i, 'warn', 'imgAlt', { n: imgs.length, list: imgs.join(', ') });
  if (svgs) report(i, 'warn', 'svgName', { n: svgs });
  if (comps.length) report(i, 'info', 'compName', { list: [...new Set(comps)].join(', ') });
}

// ================================================================ E. タイムライン
phase = 'E タイムライン';
const tl = await page.evaluate(() => DECK.timeline());
const total = tl.length ? tl[tl.length - 1].start + tl[tl.length - 1].dur : 0;
report(null, 'info', 'timelineTotal', { s: total.toFixed(2), n: tl.length });
const perSlide = new Map();
for (const seg of tl) perSlide.set(seg.i, (perSlide.get(seg.i) || 0) + seg.dur);
for (const [i, dur] of perSlide) report(i, 'info', 'slideLength', { s: dur.toFixed(2) });

await collectPartReports();

// 遅れて届くエラーも拾うため、閉じる前に少し待つ
await page.waitForTimeout(100);
await browser.close();
browserPhase = false;   // ここから先は検査の結果を作るだけ（ブラウザは使わない）
fs.rmSync(tmpDir, { recursive: true, force: true });
// スタックの行とファイルの場所は除き、言葉だけにする。部品の例外（古い形の「M-CURVES TypeError: …」）は部品のデータの知らせにする
const compTags = new Set(compErrors.map((r) => r.tag));
for (const e of [...new Set(consoleErrors.map(cleanErrorText))]) {
  const c = componentError(e);
  if (c && compTags.has(c.tag)) continue;   // 実行系が DECK.componentErrors で知らせたもの
  if (c) report(null, 'error', 'compData', { tag: c.tag, kind: 'exception', msg: c.msg, dataLike: /is not a function|is not iterable|Cannot read propert|undefined|null/.test(c.msg) });
  else report(null, 'error', 'consoleError', { e });
}

// ================================================================ 出力
const counts = { error: 0, warn: 0, info: 0 };
for (const r of results) counts[r.sev]++;
const ok = counts.error === 0;

// 言葉を作る：どこか（スライドの番号・見出し・id、段階）＋何が違うか＋どう直すか（kit/check-messages.mjs）
const sep = ML === 'en' ? ': ' : '：';
const placeOf = (r) => ({ n: r.slide === null ? null : r.slide + 1, id: r.slide === null ? null : (meta[r.slide] && meta[r.slide].id) || null, title: r.slide === null ? null : titleOf(r.slide), step: r.step });
for (const r of results) { r.what = message(ML, r.code, r.a); r.msg = where(ML, placeOf(r)) + sep + r.what; }
if (asJson) {
  // 形は docs/reference.md「品質チェック」：slide は 1 から（デッキ全体は null）、id はスライドの id（なければ null）、key はスライドの鍵、
  // title は見出しの字、step は段階の鍵（0・1・…・concl、なければ null）、code は指摘の種類、rule は規格の名前（なければ null）、data はその指摘の値（はみ出しの px など）
  const out = results.map((r) => ({
    slide: r.slide === null ? null : r.slide + 1,
    id: r.slide === null ? null : (meta[r.slide] && meta[r.slide].id) || null,
    key: r.slide === null ? null : (meta[r.slide] && meta[r.slide].key) || null,
    title: r.slide === null ? null : titleOf(r.slide),
    step: r.step,
    sev: r.sev,
    code: r.code,
    rule: ruleOf(r.code, r.a),
    data: r.a,
    msg: r.msg,
  }));
  console.log(JSON.stringify({ ok, lang: ML, counts, results: out }, null, 2));
} else {
  // スライド番号順（null＝デッキ全体は先頭）にグループ化し、各グループ内は error → warn → info。見出しの行にスライドがあるので、行には段階と言葉だけ
  const groups = new Map();
  for (const r of results) {
    const key = r.slide === null ? -1 : r.slide;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const keys = [...groups.keys()].sort((a, b) => a - b);
  const EN = ML === 'en';
  const MARK = EN ? { error: 'error', warn: 'warning', info: 'info' } : { error: 'エラー', warn: '警告', info: '情報' };
  const stepOf = (s) => (s === null ? '' : EN ? (s === 'concl' ? 'conclusion: ' : `step ${s}: `) : (s === 'concl' ? '結論の段階：' : `段階 ${s}：`));
  for (const key of keys) {
    const id = key >= 0 && meta[key] && meta[key].id;
    const label = key === -1 ? (EN ? '■ Whole deck' : '■ デッキ全体') : `■ ${key + 1}: ${titleOf(key)}${id ? ` (${id})` : ''}`;
    console.log(label);
    const items = groups.get(key).sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
    for (const r of items) console.log(`  [${MARK[r.sev]}] ${stepOf(r.step)}${r.what}`);
  }
  console.log('');
  console.log(EN ? `${counts.error} errors, ${counts.warn} warnings, ${counts.info} info` : `エラー ${counts.error}　警告 ${counts.warn}　情報 ${counts.info}`);
}
// 出力を書き終えてから終える（stdout がパイプのとき、process.exit は書きかけの出力（64 KiB を超える分）を捨てる。--json の大きな結果が途中で切れていた）
process.stdout.write('', () => process.exit(ok ? 0 : 1));
