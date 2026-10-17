// 編集アプリ（インストール不要。Chrome / Edge の File System Access API でデッキのフォルダを開く。持ち運べる 1 ファイルはフォルダなしで開ける）
// 開発サーバー（server/dev.mjs）の代わりに、ブラウザの中で組み、プレビューし、原稿・口述原稿・コメントを書き戻す
// 説明は docs/editor.md。触るのは選んだフォルダか開いたファイルだけで、外へは繋がらない（アプリ自身の読み込みを除く）
// 読み書きはすべて作業場所（workspace.js：フォルダ／メモリの上のフォルダ）を通す。編集の画面（server/editor-ui.js）はこのページにあり、
// プレビュー（sandbox の iframe）は「どこを直したいか」を知らせる（server/hints.js）だけで、書き込みを頼む口を持たない
import RES from 'virtual:resources';
import SHIM from './frame-shim.js?text';
import { createEngine, bytesToBase64 } from './engine.js';
import { previewDocument, trustedPrefix } from './preview-doc.js';
import { createDevApi } from './devapi.js';
import { createEditorUI } from '../server/editor-ui.js';
import { writeText, writeFile, cancelledError, readText, hasPermission, askPermission, recentList, recentAdd, recentRemove } from './fsx.js';
import { folderWorkspace } from './workspace.js';
import { readInWorker, probeWorker, workspaceFromPortable, archiveFiles, writeToDirectory, registryProblems, staleSteps } from './portable.js';
import { rightsOf } from './rights.js';
import { CONTRACTS, LIMITS, newDocId } from '../kit/core/portable.mjs';
import { tierA } from '../kit/core/tier-a.mjs';
import { createBuildClient, BUILD_TIMEOUT_MS } from './build-client.js';
import { FORMAT } from '../kit/core/format.mjs';
import { newDeckFiles } from '../kit/templates/new-deck.mjs';
import { T, EN, LANG_KEY, applyTexts } from './i18n.js';

const $ = (id) => document.getElementById(id);
const POLL_MS = 1500;
const SUPPORTED = typeof window.showDirectoryPicker === 'function';

// ---------------------------------------------------------------- 状態
const loadLazy = async (p) => {
  if (window.__FONTPACK && window.__FONTPACK[p]) return window.__FONTPACK[p];
  const r = await fetch(new URL(p.replace(/^\/repo\//, ''), document.baseURI));
  if (!r.ok) throw new Error('font not found: ' + p);
  return bytesToBase64(new Uint8Array(await r.arrayBuffer()));
};
const engine = createEngine(RES, loadLazy);
// 開いたデッキの組み立てと判定は Worker で（app/build-client.js。ページを固めず、期限を過ぎたら止める）。保存・書き出しの組み立ては
// このページの engine で（確かめた後のデッキ。組み立ての上限は同じ）
const builder = createBuildClient(RES, loadLazy);
const buildTimeout = () => (window.__APP_TEST && window.__APP_TEST.buildTimeout) || BUILD_TIMEOUT_MS;
// ws：作業場所（folderWorkspace / memoryWorkspace）。portable：持ち運べる 1 ファイルを開いているとき
//   {index, deckMeta, name, handle, warnings, readOnly（理由の文字列か null）, tierAOnly（段 A の編集だけ：理由か null）, rightsOk, extended,
//    original（開いた・前に保存した文書の文字列。段 A の編集の元）, narr0（その narration.md）, saved, lastTier（'A' | 'B'）, sourceMatches}
const S = {
  ws: null, portable: null, deckFile: null, base: null, preview: null, slides: [], warn: [], error: null,
  sig: '', building: null, again: false, poll: 0, builds: 0, loads: 0, pos: null,
  presWin: null, checks: new Map(), lastBuildMs: 0, ranges: new Set(), codeOk: null,
};

// ---------------------------------------------------------------- 画面の部品
let toastTimer = 0;
function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, bad ? 6000 : 2800);
}
function status(msg) { $('st-msg').textContent = msg; }
function el(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') e.textContent = v; else if (k === 'cls') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const c of kids) if (c) e.append(c);
  return e;
}
const time = () => new Date().toLocaleTimeString(EN ? 'en-US' : 'ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ---------------------------------------------------------------- はじめの画面
async function showWelcome() {
  $('welcome').hidden = false; $('deck').hidden = true; $('tools').hidden = true; $('deckname').textContent = ''; $('notice').hidden = true;
  $('top').classList.remove('has-deck');
  $('unsupported').hidden = SUPPORTED;
  $('w-open').disabled = !SUPPORTED; $('w-new').disabled = !SUPPORTED;
  const list = await recentList();
  $('recent').hidden = !list.length;
  const ul = $('recent-list'); ul.innerHTML = '';
  for (const r of list) {
    ul.append(el('li', {}, [
      el('span', { cls: 'nm', text: r.name }),
      el('span', { cls: 'when', text: new Date(r.opened).toLocaleString(EN ? 'en-US' : 'ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }),
      el('button', { type: 'button', text: T.reopen, onclick: async () => {
        try { if (!(await hasPermission(r.handle)) && !(await askPermission(r.handle))) { toast(T.noPermission, true); return; } }
        catch { toast(T.cannotOpen, true); return; }
        openFolder(r.handle);
      } }),
      el('button', { type: 'button', cls: 'ghost', text: '✕', title: T.forget, 'aria-label': T.forget, onclick: async () => { await recentRemove(r.id); showWelcome(); } }),
    ]));
  }
}
async function pickFolder() {
  try { return await window.showDirectoryPicker({ id: 'motion-deck', mode: 'readwrite' }); }
  catch (e) { if (e && e.name !== 'AbortError') toast(String(e.message || e), true); return null; }
}

// ---------------------------------------------------------------- フォルダを開く
async function openFolder(handle) {
  if (!handle || handle.kind !== 'directory') { toast(T.dropFolder, true); return false; }
  if (!(await hasPermission(handle)) && !(await askPermission(handle))) { toast(T.noPermission, true); return false; }
  if (!(await leavePortable())) return false;
  stopPoll();
  // 別のフォルダ：プレビューは読み込み直さずに入れ替える（前のデッキの未保存の入力は待たない）
  const ws = folderWorkspace(handle);
  resetDeck(ws, null);
  const listing = await ws.list();
  engine.setListing(listing);
  S.deckFile = engine.deckFile();
  if (!S.deckFile) { toast(T.noDeck, true); S.ws = null; return false; }
  S.sig = signature(listing);
  recentAdd(handle);
  showDeck(handle.name + ' / ' + S.deckFile, handle.name);
  // 原稿のフォルダの部品やスクリプト（そのデッキのコード）があれば、プレビューで動かす前に知らせて確かめる（§6）。
  // 確かめは組んだ文書から決めるので、組み立て（rebuild）の中で聞く。取り消したらはじめの画面に戻る
  await rebuild('open');
  if (S.ws === ws && S.codeOk === false) { S.ws = null; showWelcome(); return false; }
  startPoll();
  return true;
}
// 作業場所を替える（プレビューの状態は捨てる）
function resetDeck(ws, portable) {
  S.ws = ws; S.portable = portable; S.base = null; S.preview = null; S.error = null; S.sig = ''; S.pos = null; S.fresh = true; S.ranges = new Set(); S.codeOk = null; S.allowed = false; S.codeAsking = null; S.gen = (S.gen || 0) + 1;
  closePresenter();
  engine.setWorkspace(ws);
  ui.reset();
  // 前のデッキのプレビューを消す（次のデッキのコードは、確かめてから読み込む）
  blankPreview();
}
// プレビューを空にする：iframe を新しいもの（何も読み込まない）に取り替える。srcdoc を変えるだけでは、新しい文書が読み込まれるまで
// 前のデッキが見え、そのコードも動き続ける。取り替えれば前の文書はすぐに消え、確かめの窓の後ろには何も出ない
function blankPreview() {
  const f = $('preview'), g = document.createElement('iframe');
  for (const a of f.attributes) if (a.name !== 'srcdoc' && a.name !== 'src') g.setAttribute(a.name, a.value);
  g.addEventListener('load', focusPreview);
  f.replaceWith(g);
}
function focusPreview() { try { $('preview').focus(); } catch { /* 無視 */ } }
function showDeck(label, title) {
  $('welcome').hidden = true; $('deck').hidden = false; $('tools').hidden = false;
  $('top').classList.add('has-deck');
  for (const e of document.querySelectorAll('.only-folder')) e.hidden = !!S.portable;
  for (const e of document.querySelectorAll('.only-portable')) e.hidden = !S.portable;
  S.label = label;
  updateName();
  document.title = title + ' — Motion Slides Editor';
  showNotice();
  closePanel();
}
function updateName() {
  const dirty = S.portable && S.ws && S.ws.dirty;
  $('deckname').textContent = (dirty ? '● ' : '') + (S.label || '');
  $('deckname').title = (S.label || '') + (dirty ? ' — ' + T.unsaved : '');
  if (S.portable) $('b-save').classList.toggle('pri', !!dirty);
}
// 持ち運べる 1 ファイルの知らせ（その文書のコード・読むだけ）。プレビューの外（エディタの画面）に出す
function showNotice() {
  const P = S.portable, lines = [];
  if (P && P.extended) lines.push(['notice-extended', T.extendedNotice]);
  if (P && P.mislabelled) lines.push(['notice-mislabel', T.codeMislabelled]);
  if (P && P.readOnly) lines.push(['notice-readonly', T.readOnlyNotice(P.readOnly)]);
  else if (P && P.tierAOnly) lines.push(['notice-tier-a', T.tierAOnlyNotice(P.tierAOnly)]);
  if (P && !P.readOnly && P.sourceMatches === false) lines.push(['notice-mismatch', T.mismatchNotice]);
  const n = $('notice'); n.innerHTML = '';
  for (const [id, text] of lines) n.append(el('p', { id, text }));
  n.hidden = !lines.length;
}
function signature(listing) {
  return [...listing.files].filter(([rel]) => rel !== 'comments.json').map(([rel, f]) => rel + ':' + f.m + ':' + f.s).sort().join('\n');
}

// ---------------------------------------------------------------- 組み立てとプレビュー
const enc = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
// プレビューの文書：信頼する先頭部分（決まり（CSP）と仲立ちのスクリプト）の後ろに、組んだデッキをそのまま続ける（app/preview-doc.js。
// デッキの文書の中を探して決まりを入れることはしない）
// プレビューでは、知らせの部品（server/hints.js）も信頼する先頭部分に入れる（デッキの文書の中の </body> を探して入れない）
function withShim(html, cfg, extra = '') { return previewDocument(html, `${SHIM}(${enc(cfg)});${extra}`); }
function previewHtml(base) { return withShim(base, { dev: true, load: S.loads }, '\n' + RES.hints); }
// 表示する文書（信頼する先頭部分 + 組んだデッキのバイトそのもの）から、そのデッキのコードが動くかを決める（format spec §6）。
// 先頭部分（決まりと仲立ち）と組み立てが入れた実行系の部分（r.trusted）だけを除いて読む。先頭部分は読み込むたびに数（load）だけが変わり、
// 解析の状態は同じなので、ここで読むものと表示するものは同じ。原稿のフォルダの部品（組み立てが実行系の中に入れる）は組み立てが数える
// 読むのは Worker（app/build-worker.js の rendered。ここは先頭部分の文字列を渡す）
const reasonsPrefix = () => trustedPrefix(`${SHIM}(${enc({ dev: true, load: 0 })});\n${RES.hints}`);
// 組み直す（同時に 1 つだけ。途中で頼まれたら終わってからもう一度）。戻り値：失敗したら true
async function rebuild(reason) {
  if (S.building) { S.again = true; return S.building; }
  S.building = (async () => {
    let failed = false;
    do {
      S.again = false;
      const t0 = performance.now();
      $('viewer').classList.add('busy');
      try {
        const ws0 = S.ws, g0 = S.gen;
        const listing = await S.ws.list();
        engine.setListing(listing); S.sig = signature(listing);
        if (!S.portable) S.deckFile = engine.deckFile() || S.deckFile;
        // 組み立てと判定は Worker で（期限を過ぎれば止めて失敗にする）。理由は Worker が組んだ文書（表示するバイト）から決める
        const r = await builder.build(S.ws, listing, S.deckFile, { dev: true }, reasonsPrefix(), { timeout: buildTimeout() });
        // コードの確かめ（codeConsent）は、この組み立ての文書（表示するバイト）から決める。確かめが済むまで S.base（プレビューと
        // 発表者ビューが読むもの）を替えない（確かめている間に別の読み込みが新しい文書を読み込まないように）
        const reasons = [...new Set([...r.reasons, ...jsFiles(listing)])];
        S.reasons = reasons;
        const allow = await codeConsent(reasons);
        if (S.ws !== ws0 || S.gen !== g0) continue;          // 確かめている間に別の作業場所になった（その組み立ては捨てる）
        S.lastBuildMs = Math.round(performance.now() - t0);
        S.builds++;
        const wasError = !!S.error;
        S.error = null; failed = false;
        S.slides = r.slides; S.warn = r.stats.warn.slice();
        if (S.portable) {
          // 読み取りの知らせと、音声が古い段階（§5.4。作り直さず、消さず、知らせるだけ）
          S.warn.push(...S.portable.warnings);
          // 前の保存（段 A）の知らせ：段階ごと消した口述原稿の音声を消した・行き先のない口述原稿など
          S.warn.push(...(S.portable.saveWarnings || []));
          const stale = await staleSteps(S.ws);
          S.stale = stale;
          for (const k of stale) S.warn.push(T.staleStep(k));
          updateName();
        }
        const changed = r.html !== S.base;
        S.base = r.html;
        S.ranges = new Set([...r.html.matchAll(/ data-src="(\d+-\d+)" data-src-h="[0-9a-f]{8}"/g)].map((m) => m[1]));
        S.preview = true;
        showError(null);
        showWarn();
        $('st-info').textContent = `${T.slidesN(r.stats.slides)} · ${(r.html.length / 1048576).toFixed(1)} MB · ${S.lastBuildMs} ms`;
        if (reason !== 'poll' || changed || wasError) status(T.rebuilt(time(), reason));
        // プレビューも発表者ビューも、コードの確かめ（codeConsent）を通ったときだけ読み込む
        S.allowed = allow;
        if (allow && (changed || !S.loads || S.fresh)) refreshFrame();
        if (allow && changed && S.presWin && !S.presWin.closed) loadPresenter();
      } catch (e) {
        failed = true;
        S.error = String((e && (e.stack || e.message)) || e);
        showError(S.error);
        status(T.buildFailedAt(time()));
        console.warn('[editor] build failed', e);
      } finally { $('viewer').classList.remove('busy'); }
    } while (S.again);
    S.building = null;
    return failed;
  })();
  return S.building;
}
// プレビューを新しい中身にする。入力中の欄はこのページ（編集の画面）にあるので、待たずに読み込み直してよい（同じ位置に戻す）
function refreshFrame() { loadFrame(); }
function loadFrame() {
  if (!S.preview || !S.base || !S.allowed) return;
  const f = $('preview');
  ui.frameLoading(!S.fresh);
  S.loads++; S.fresh = false;
  f.srcdoc = previewHtml(S.base);
}
$('preview').addEventListener('load', focusPreview);
function showError(err) {
  $('errbox').hidden = !err;
  $('errtext').textContent = err || '';
}
function showWarn() {
  const b = $('b-warn');
  b.hidden = !S.warn.length;
  b.textContent = T.warnings(S.warn.length);
}

// ---------------------------------------------------------------- 外での変更（Claude Code など）を見張る
function startPoll() {
  stopPoll();
  S.poll = setInterval(async () => {
    if (!S.ws || S.portable || S.building) return;
    try {
      const listing = await S.ws.list();
      const sig = signature(listing);
      if (sig !== S.sig) { S.sig = sig; await rebuild('poll'); }
    } catch (e) { console.warn('[editor] poll failed', e); }
  }, POLL_MS);
}
function stopPoll() { clearInterval(S.poll); S.poll = 0; }

// ---------------------------------------------------------------- 編集の画面（このページ）と、デッキの iframe とのやり取り
// 書き込みの口（devapi）を呼ぶのは編集の画面だけ。プレビューからの知らせ（edit-hint・deck-pos）は欄を開くだけで、書き込みにはならない
const api = createDevApi({
  get ws() { return S.ws; },
  generation: () => S.gen,
  beforeWrite: async (kind) => {
    if (!S.portable) return null;
    if (S.portable.readOnly) return T.readOnlyNoEdit;
    // 段 A の編集だけの文書（実行系の約束の版・部品庫の hash が違う。§6・§7.2）：スライドの原稿は直せない
    if (S.portable.tierAOnly && kind === 'source') return T.tierAOnlyNoSlides;
    return (await ensureRights()) ? null : T.rightsDeclined;
  },
  deckFile: () => S.deckFile,
  slideOrder: () => S.slides || [],   // {key, id, heading}：id のあるスライドの新しい節は「## 見出し {#id}」
  editable: (range) => S.ranges.has(range),
  afterWrite: async () => { const failed = await rebuild('save'); updateName(); return failed; },
  msg: T.api,
});
const ui = createEditorUI({
  frame: () => $('preview'),
  api: (method, url, body) => (S.ws ? api(method, url, body) : { _status: 404 }),
  lang: EN ? 'en' : 'ja',
  drawerHost: $('deck'),
  enabled: () => !!(S.ws && S.base && !$('deck').hidden),
  beforeEdit: (kind) => beforeEditing(kind),
  reload: async () => { await rebuild('reload'); loadFrame(); },
});
// 信頼する編集の板（#dev-side：編集モードの札・原稿の欄・コメント・口述原稿）は、プレビューの隣、横の板（#panel）の前に置く
new MutationObserver(() => { const d = $('dev-side'), p = $('panel'); if (d && d.nextSibling !== p) $('deck').insertBefore(d, p); }).observe($('deck'), { childList: true });
{ const d = $('dev-side'), p = $('panel'); if (d && d.nextSibling !== p) $('deck').insertBefore(d, p); }
window.addEventListener('message', (e) => {
  const m = e.data || {};
  const frame = $('preview').contentWindow;
  if (e.source === frame) {
    ui.message(e);
    if (m.type === 'app-open-presenter') openPresenter();
    else if (m.type === 'app-check-result' && S.checks.has(m.id)) { S.checks.get(m.id)(m.results || []); S.checks.delete(m.id); }
    else if (typeof m.type === 'string' && /^deck-/.test(m.type)) {
      if (m.type === 'deck-pos') S.pos = m;
      if (S.presWin && !S.presWin.closed) S.presWin.postMessage({ type: 'app-pres-down', m }, '*');
    }
  } else if (S.presWin && e.source === S.presWin && m.type === 'app-pres-up' && m.m && typeof m.m.type === 'string' && /^deck-/.test(m.m.type)) {
    if (frame) frame.postMessage(m.m, '*');
  }
});

// ---------------------------------------------------------------- 発表者ビュー（アプリが開く窓の中に、sandbox の iframe で）
// 本体（プレビュー）との postMessage はアプリが中継する。発表者ビューの中の 2 つの画面は frame-shim.js が srcdoc で入れる
const PRES_DOC = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Presenter</title>
<style>html,body{margin:0;height:100%;background:#1b1b1b;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe id="pf" sandbox="allow-scripts allow-modals" title="presenter"></iframe><script>
var f=document.getElementById("pf");
addEventListener("message",function(e){
  if(e.source===f.contentWindow){ if(opener&&!opener.closed) opener.postMessage({type:"app-pres-up",m:e.data},"*"); }
  else if(e.source===opener&&e.data&&e.data.type==="app-pres-down"){ f.contentWindow&&f.contentWindow.postMessage(e.data.m,"*"); }
});
</script></body></html>`;
function closePresenter() { if (S.presWin && !S.presWin.closed) S.presWin.close(); S.presWin = null; }
function openPresenter() {
  if (!S.base) return;
  if (!S.allowed) { toast(T.codeDeclined, true); return; }
  const w = window.open('', 'motion-presenter', 'width=1400,height=820');
  if (!w) { toast(T.popupBlocked, true); return; }
  S.presWin = w;
  w.document.open(); w.document.write(PRES_DOC); w.document.close();
  loadPresenter();
}
function loadPresenter() {
  if (!S.allowed) return;
  const w = S.presWin;
  const f = w && !w.closed && w.document.getElementById('pf');
  if (!f) return;
  w.document.title = (EN ? 'Presenter — ' : '発表者ビュー — ') + (S.ws ? S.ws.name : '');
  S.presLoads = (S.presLoads || 0) + 1;
  f.srcdoc = withShim(S.base, { query: '?presenter=1', opener: true, html: S.base, shim: SHIM, prefix: trustedPrefix() });
}

// ---------------------------------------------------------------- 横の板（検査・警告・使い方）
function openPanel(title, body) {
  $('panel').hidden = false; $('panel-title').textContent = title;
  const b = $('panel-body'); b.innerHTML = ''; b.append(...[].concat(body));
}
function closePanel() { $('panel').hidden = true; }
$('panel-close').onclick = closePanel;

async function quickCheck() {
  const f = $('preview').contentWindow;
  if (!f || !S.base) return;
  openPanel(T.checkTitle, [el('p', { text: T.checking })]);
  const id = 'q' + Date.now();
  const results = await new Promise((res) => { S.checks.set(id, res); f.postMessage({ type: 'app-check', id }, '*'); setTimeout(() => { if (S.checks.has(id)) { S.checks.delete(id); res(null); } }, 20000); });
  if (!results) { openPanel(T.checkTitle, [el('p', { text: T.checkFailed })]); return; }
  const errs = results.filter((r) => r.sev === 'error').length, warns = results.filter((r) => r.sev === 'warn').length;
  const items = results.map((r) => el('div', { cls: 'res ' + r.sev, onclick: () => { if (r.i !== null) f.postMessage({ type: 'app-go', i: r.i, k: 0 }, '*'); } }, [
    el('span', { cls: 'sev', text: r.sev === 'error' ? T.sevError : T.sevWarn }),
    el('span', { text: T.checkMsg(r.code, r.arg) }),
    el('div', { cls: 'where', text: r.i === null ? T.wholeDeck : T.slideN(r.i + 1, r.title) }),
  ]));
  openPanel(T.checkTitle, [
    el('div', { cls: 'sum', text: T.checkSummary(errs, warns) }),
    el('p', { cls: 'hint', text: T.checkNote }),
    ...items,
  ]);
}
function showWarnings() {
  openPanel(T.warnTitle, [el('ul', {}, S.warn.map((w) => el('li', { text: w })))]);
}
function showHelp() {
  const h = T.help;
  openPanel(T.helpTitle, [
    ...h.map(([title, lines]) => [el('h3', { text: title }), el('ul', {}, lines.map((l) => { const li = el('li'); li.innerHTML = l; return li; }))]).flat(),
  ]);
}

// ---------------------------------------------------------------- 書き出し・印刷
async function exportHtml() {
  if (!S.ws) return;
  status(T.exporting);
  let r;
  try { r = await builder.build(S.ws, await S.ws.list(), S.deckFile, { dev: false }, null, { timeout: buildTimeout() }); }
  catch (e) { toast(T.exportFailed + ': ' + (e.message || e), true); return; }
  const name = S.deckFile.replace(/\.html?$/i, '') + '.html';
  try {
    let h = window.__APP_TEST && window.__APP_TEST.saveHandle;
    if (!h && window.showSaveFilePicker) {
      h = await window.showSaveFilePicker({ suggestedName: name, ...(S.ws.handle ? { startIn: S.ws.handle } : {}), types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] });
    }
    if (h) await writeHandle(h, r.html);
    else download(name, r.html);
    status(T.exported(time(), (r.html.length / 1048576).toFixed(1)));
    toast(T.exportedToast);
  } catch (e) { if (e && e.name !== 'AbortError') toast(String(e.message || e), true); status(''); }
}

// ---------------------------------------------------------------- 保存の口（ファイルのハンドル・ダウンロード）
const writeHandle = (h, data, live) => writeFile(h, data, live);   // fsx.js：live() が false になれば入れ替えずに取り消す
function download(name, text) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/html' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const portableTypes = () => [{ description: T.portableType, accept: { 'text/html': [FORMAT.FILE_EXT, '.html'] } }];
// 名前を付けて保存：ファイルを選ぶ画面（Chrome / Edge）か、なければダウンロード。返すもの：書いたハンドル（ダウンロードなら null）
// live()：選ぶ画面を待つ間に作業場所が替わったら書かない（書き込みの中でも確かめる）
async function saveWithPicker(name, html, startIn, live = () => true) {
  if (window.showSaveFilePicker) {
    const h = await window.showSaveFilePicker({ id: 'motion-portable', suggestedName: name, ...(startIn ? { startIn } : {}), types: portableTypes() });
    if (!live()) throw cancelledError();
    await writeHandle(h, html, live);
    return h;
  }
  if (!live()) throw cancelledError();
  download(name, html);
  return null;
}

// ---------------------------------------------------------------- 確かめの窓（エディタの画面の中。プレビューのものではない）
// buttons：[{id, label, pri, needsConfirm}]。confirmText があればチェックボックス（入れるまで needsConfirm のボタンは押せない）
// 前の確かめが開いたまま次を聞くとき（別の作業場所を開いたなど）は、前のものを「取り消し」で終える（待ったままにしない）
let askPending = null;
function ask({ title, body, buttons, confirmText = null, kind = '' }) {
  if (askPending) { const r = askPending; askPending = null; r('cancel'); }
  return new Promise((resolve) => {
    askPending = resolve;
    const d = $('dlg');
    d.className = kind;
    $('dlg-title').textContent = title;
    const b = $('dlg-body'); b.innerHTML = ''; b.append(...body.filter(Boolean));
    let cb = null;
    if (confirmText) { cb = el('input', { type: 'checkbox', id: 'dlg-confirm' }); b.append(el('label', { cls: 'confirm' }, [cb, el('span', { text: confirmText })])); }
    const row = $('dlg-buttons'); row.innerHTML = '';
    for (const x of buttons) {
      const btn = el('button', { type: 'button', id: 'dlg-' + x.id, cls: x.pri ? 'pri' : '', text: x.label, onclick: () => d.close(x.id) });
      if (x.needsConfirm && cb) { btn.disabled = true; cb.addEventListener('change', () => { btn.disabled = !cb.checked; }); }
      row.append(btn);
    }
    d.returnValue = '';
    d.onclose = () => { if (askPending === resolve) askPending = null; resolve(d.returnValue || 'cancel'); };
    d.showModal();
  });
}

// ---------------------------------------------------------------- 権利（format spec §7.3）：最初の編集の前に、ライセンス・著作権・クレジットを見せる
async function ensureRights() {
  const P = S.portable;
  if (!P || P.rightsOk) return true;
  if (P.rightsPending) return P.rightsPending;
  P.rightsPending = (async () => {
    const R = rightsOf(P.index.metadata);
    const rows = [[T.rTitle, R.title], [T.rCreators, R.creators.join(', ')], [T.rCopyright, R.copyright], [T.rLicense, R.license || T.rNoLicense], [T.rAttribution, R.attribution]];
    const dl = el('dl', { id: 'rights-list' }, rows.filter(([, v]) => v).flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
    const v = await ask({
      title: T.rightsTitle, kind: R.noDerivatives ? 'warn' : '',
      body: [el('p', { text: T.rightsLead }), dl,
        R.noDerivatives ? el('p', { id: 'rights-nd', cls: 'note bad', text: R.reason === 'nd-license' ? T.rNdLicense : T.rNdCopyright }) : null,
        el('p', { cls: 'hint', text: T.rKeep }), el('p', { cls: 'hint', text: T.rClaims })],
      buttons: [{ id: 'cancel', label: T.cancel }, { id: 'ok', label: T.rContinue, pri: true, needsConfirm: R.noDerivatives }],
      confirmText: R.noDerivatives ? T.rConfirm : null,
    });
    P.rightsPending = null;
    if (v !== 'ok') { toast(T.rightsDeclined, true); return false; }
    P.rightsOk = true;
    return true;
  })();
  return P.rightsPending;
}
// そのデッキのコード（§6）：申告（index.profile）ではなく中身から決める（kit/core/code-scan.mjs：データの type のない <script>・on… の属性・
// javascript: の URL・srcdoc・取り込む SVG や HTML の中のもの・JavaScript のファイル・部品の式）。
// プレビューと発表者ビューで動かす前に知らせ、はっきり「プレビューを始める」を押してもらう（作業場所ごとに 1 回）
// 中身は、組んだ文書そのもの（Worker の rendered：取り込み・前処理の後、拡張子によらずすべての依存を含む、表示するのと同じバイト）から決める。
// 作業場所をもう一度読んで調べることはしない（読むたびに中身が変わりうるので、調べたものと表示するものが食い違う）。
// 補いとして、作業場所の JavaScript のファイル（名前だけ。組み立てが使わなくても、少しでも疑わしければ聞く）も数える
function jsFiles(listing) {
  return [...listing.files.keys()].filter((rel) => /\.(m|c)?js$/i.test(rel) && !rel.split('/').some((x) => x.startsWith('.'))).slice(0, 5).map((rel) => 'script file ' + rel);
}
function codeDialog(lead, reasons, mislabelled) {
  return ask({ title: T.codeTitle, kind: 'warn', body: [
    el('p', { id: 'code-lead', text: lead }),
    mislabelled ? el('p', { id: 'code-mislabel', cls: 'note bad', text: T.codeMislabelled }) : null,
    reasons && reasons.length ? el('p', { id: 'code-why', cls: 'hint', text: T.codeWhy(reasons.slice(0, 5).join(', ') + (reasons.length > 5 ? ' …' : '')) }) : null,
    el('p', { cls: 'hint', text: T.codeSandbox })],
  buttons: [{ id: 'cancel', label: T.cancel }, { id: 'run', label: T.codeRun, pri: true }] });
}
// S.codeOk：null（まだ聞いていない）・true（始めてよい）・false（断った：この作業場所ではプレビューも発表者ビューも読み込まない）
// reasons：その組み立ての文書から決めた理由（Worker の rendered）。持ち運べる 1 ファイルは開く前に同じ規則で決めて聞いた（openPortable。
// 聞いて「始める」を押したなら S.codeOk は true）。コードがなかった文書を直してコードが現れたら、そのときに聞く（フォルダと同じ）
async function codeConsent(reasons) {
  if (S.codeOk !== null) return S.codeOk;
  if (!reasons || !reasons.length) return true;          // コードが現れたら（Claude Code が部品を足したなど）そのときに聞く
  // 同時に頼まれても（開く・見張りの組み直し）確かめは 1 つだけ
  if (S.codeAsking) return S.codeAsking;
  const ws = S.ws;
  const job = S.codeAsking = (async () => {
    const v = await codeDialog(S.portable ? T.codeLeadFile : T.codeLeadFolder, reasons, false);
    if (S.ws !== ws) return false;
    S.codeOk = v === 'run';
    if (!S.codeOk) {
      toast(T.codeDeclined, true);
      // 断った：今のプレビューと発表者ビューも閉じる（前の中身も、この後の組み直しも読み込まない）
      S.allowed = false; blankPreview(); closePresenter();
    }
    return S.codeOk;
  })();
  try { return await job; } finally { if (S.codeAsking === job) S.codeAsking = null; }
}

// 編集モード・口述原稿を開く前に：読むだけの文書なら断り、まだなら権利を見せる
async function beforeEditing(kind) {
  if (!S.portable) return true;
  if (S.portable.readOnly) { toast(T.readOnlyNoEdit, true); return false; }
  if (S.portable.tierAOnly && kind === 'edit') { toast(T.tierAOnlyNoSlides, true); return false; }
  return ensureRights();
}

// ---------------------------------------------------------------- 持ち運べる 1 ファイルを開く
// 開いたファイルはバイト列として Worker に渡すだけ（このページでは読み込まない・実行しない）
async function pickPortable() {
  if (window.showOpenFilePicker) {
    try { const [h] = await window.showOpenFilePicker({ id: 'motion-portable', types: portableTypes(), multiple: false }); return h ? { handle: h } : null; }
    catch (e) { if (e && e.name === 'AbortError') return null; if (!(e instanceof TypeError)) { toast(String(e.message || e), true); return null; } }
  }
  return new Promise((res) => {
    const i = el('input', { type: 'file', accept: `${FORMAT.FILE_EXT},.html,text/html`, hidden: '' });
    i.addEventListener('change', () => { res(i.files && i.files[0] ? { file: i.files[0] } : null); i.remove(); });
    document.body.append(i); i.click();
  });
}
// 未保存の変更があれば、捨ててよいか聞く。戻り値：先へ進んでよいか
async function leavePortable() {
  if (!S.portable || !S.ws || !S.ws.dirty) return true;
  return (await ask({ title: T.unsavedTitle, body: [el('p', { text: T.unsavedLead })], buttons: [{ id: 'cancel', label: T.cancel }, { id: 'discard', label: T.discard, pri: true }] })) === 'discard';
}
function refusal(code, message) {
  return [el('p', { id: 'refuse-reason', text: T.refuse(code) }), el('pre', { cls: 'tech', text: `[${code}] ${message}` })];
}
// input：{handle?: FileSystemFileHandle, file?: File, bytes?: Uint8Array, name?}
async function openPortable(input) {
  if (!input) return false;
  let bytes, name;
  const handle = input.handle || null;
  try {
    const file = input.file || (handle ? await handle.getFile() : null);
    name = input.name || (file && file.name) || 'lesson' + FORMAT.FILE_EXT;
    // 大きさは読む前に（File.size。読んでから比べると、断るファイルでもまず全部を確保してしまう。§11）
    const size = input.bytes ? input.bytes.byteLength : file ? file.size : 0;
    if (!(size <= LIMITS.fileBytes)) {
      await ask({ title: T.cannotOpenFile(name), kind: 'warn', body: refusal('file-too-large', `file is larger than ${LIMITS.fileBytes} bytes (${size})`), buttons: [{ id: 'ok', label: T.ok, pri: true }] });
      return false;
    }
    bytes = input.bytes ? new Uint8Array(input.bytes) : new Uint8Array(await file.arrayBuffer());
  } catch (e) { toast(T.cannotReadFile + ': ' + (e.message || e), true); return false; }
  if (!(await leavePortable())) return false;
  status(T.reading(name));
  let r;
  const readerTimeout = (window.__APP_TEST && window.__APP_TEST.readerTimeout) || undefined;
  try { r = await readInWorker(bytes, { timeout: readerTimeout }); }
  catch (e) {
    status('');
    // 知らない major の版・知らない必須の機能：編集も書き出し（作り直し）もしないが、1.x の規則で索引と塊が検査を通れば原稿をフォルダに
    // 取り出せる（§7.1・§3.5・§9.3。取り出しは書き出しではない）。通らなければ取り出しも断る
    const extract = (e.code === 'unsupported-version' || e.code === 'unknown-feature') && !!window.showDirectoryPicker;
    const v = await ask({ title: T.cannotOpenFile(name), kind: 'warn', body: refusal(e.code, e.message),
      buttons: [...(extract ? [{ id: 'extract', label: T.exportFolder }] : []), { id: 'ok', label: T.ok, pri: true }] });
    if (v === 'extract') {
      try { const x = await readInWorker(bytes, { extract: true, timeout: readerTimeout }); await exportFolder(workspaceFromPortable(name, x)); }
      catch (err) { await ask({ title: T.cannotOpenFile(name), kind: 'warn', body: refusal(err.code, err.message), buttons: [{ id: 'ok', label: T.ok, pri: true }] }); }
    }
    return false;
  }
  // 独自のコード：申告（index.profile）を信じず、取り出した原稿の中身から決める（§6）。中のコードが動く前に知らせる。
  // 申告が core なのに中身にコードがあれば、コードを含むものとして聞き、申告が食い違うことも知らせる。
  // プレビューは空にしてから聞く（前の文書も後ろに見せない）。取り消せば開かない（今開いているものはそのまま。そのプレビューを読み込み直す）
  // 中身は、取り出した原稿の全体（拡張子によらず）と、それを組んだ文書そのもの（取り込み・前処理の後。表示するのと同じ規則）の両方から。
  // 組めなければ確かめられないので、コードを含むものとして聞く
  // 判定と組み立ては Worker で（期限を過ぎれば止めて、開かずに断る）
  let reasons;
  try {
    reasons = await builder.scan(r.files, r.index.entry, { timeout: buildTimeout() });
    const pws = workspaceFromPortable(name, r);
    try {
      const pr = await builder.build(pws, await pws.list(), r.index.entry, { dev: true }, reasonsPrefix(), { timeout: buildTimeout() });
      for (const x of pr.reasons) if (!reasons.includes(x)) reasons.push(x);
    } catch (e) { if (e.code === 'build-timeout') throw e; reasons.push('cannot build the lesson to check it: ' + String(e && e.message || e).slice(0, 120)); }
  } catch (e) {
    status('');
    await ask({ title: T.cannotOpenFile(name), kind: 'warn', body: refusal(e.code || 'error', String(e.message || e)), buttons: [{ id: 'ok', label: T.ok, pri: true }] });
    return false;
  }
  const mislabelled = r.index.profile !== 'extended' && reasons.length > 0;
  const extended = r.index.profile === 'extended' || reasons.length > 0;
  if (mislabelled) r.warnings = [...r.warnings, T.codeMislabelled];
  if (extended) {
    blankPreview();
    const v = await codeDialog(T.codeLeadFile, reasons, mislabelled);
    if (v !== 'run') { status(''); toast(T.codeDeclined, true); if (S.ws && S.base && S.codeOk !== false) loadFrame(); return false; }
  }
  stopPoll();
  const ws = workspaceFromPortable(name, r);
  const narr0 = r.files.get ? r.files.get('narration.md') : r.files['narration.md'];
  const P = { index: r.index, deckMeta: r.deckMeta, name, handle, warnings: r.warnings, readOnly: null, tierAOnly: null, rightsOk: false, extended, mislabelled, codeReasons: reasons, codeOk: true, saved: null,
    original: new TextDecoder().decode(bytes), narr0: narr0 ? new TextDecoder().decode(narr0) : null, sourceMatches: r.sourceMatches, lastTier: null };
  resetDeck(ws, P);
  S.deckFile = r.index.entry;
  if (extended) S.codeOk = true;                          // 開く前に聞いて「始める」を押した
  // 作り直して保存できるか（段 B）：実行系の約束の版が同じで、部品庫・テーマ庫の部品がこのエディタのものと同じ hash であること（§6・§7.2）。
  // できなければ段 A の編集（口述原稿・音声・秒数）だけ。組み立てられない文書と、段 A も段 B もできない文書は読むだけ
  if (!r.index.contracts || r.index.contracts.runtime !== CONTRACTS.runtime) P.tierAOnly = T.roRuntime(r.index.contracts && r.index.contracts.runtime, CONTRACTS.runtime);
  else {
    try {
      const dry = await builder.exportIndex(S.ws, S.deckFile, { carry: r.index }, { timeout: buildTimeout() });
      const probs = registryProblems(r.index, dry.index);
      if (probs.length) P.tierAOnly = T.roRegistry(probs.join('; '));
    } catch (e) { P.readOnly = T.roBuild(String(e.message || e)); }
  }
  if (P.tierAOnly && !r.sourceMatches && !P.readOnly) P.readOnly = T.roNoTier(P.tierAOnly);
  showDeck(name, name);
  await rebuild('open');
  return true;
}

// ---------------------------------------------------------------- 持ち運べる 1 ファイルを保存する
// mode：'save'（同じファイルに。docId を変えず、derivedFrom を付けも変えもしない）・'copy'（別のファイルに。docId は同じ）・
//       'new'（新しい教材として：新しい docId と derivedFrom。権利の表示と作り手はそのまま。§3.6.1・§7.3）
// 口述原稿・音声・秒数だけが変わったなら段 A（組み直さずに決まった場所だけを書き換える。kit/core/tier-a.mjs、§7.2）。
// スライドの原稿が変わった（など段 A でできない）なら段 B（このエディタの版で組み直す）で、保存の前にそのことを知らせて確かめる
// 保存は 1 つずつ。始めたときの作業場所と文書に結び付け、途中（組み直し・確かめの窓・書き込み）で別のものを開いたら、
// その後の作業場所の書き込みと状態の更新はしない（開いた先には何も書かない）
async function savePortable(mode = 'save') {
  if (S.saving) { toast(T.api.busySave, true); return; }
  S.saving = true;
  try { await savePortableBound(mode); } finally { S.saving = false; }
}
async function savePortableBound(mode) {
  const P = S.portable, ws = S.ws, g = S.gen;
  if (!P) return;
  // 始めたときの文書・作業場所・代のままか。await（組み立て・確かめの窓・権利の確認・ファイルを選ぶ画面・書き込み）の後のたびに確かめ、
  // 書き込みにも渡す（途中で替われば入れ替えずに取り消す）。替わっていたら、その後は何も書かず状態も変えない
  const live = () => S.portable === P && S.ws === ws && S.gen === g;
  const cancelled = () => { status(''); toast(T.api.cancelled, true); };
  if (P.readOnly) { toast(T.readOnlyNoSave, true); return; }
  if (S.building) await S.building;
  if (!live()) { cancelled(); return; }
  status(T.saving);
  P.lastRefusal = null; P.lastTierA = null;
  let saveWarnings = [];
  const CFG = FORMAT.CONFIG_FILE;
  let identity = null, cfgText = null;
  // 保存するものの版（memfs の revision）。保存の途中で編集があれば版が変わるので、終わっても「保存した」にしない
  let rev = ws.revision;
  const files = ws.snapshot();
  if (mode === 'new') {
    identity = { docId: newDocId(), derivedFrom: { docId: P.index.docId, sourceSha256: P.index.sourceSha256 } };
    let cfg = {};
    try { cfg = JSON.parse(new TextDecoder().decode(files.get(CFG) || new Uint8Array())); } catch { cfg = {}; }
    const m = cfg && typeof cfg.metadata === 'object' && cfg.metadata ? { ...cfg.metadata } : {};
    m.derivedFrom = identity.derivedFrom;
    cfgText = JSON.stringify({ ...cfg, docId: identity.docId, metadata: m }, null, 2) + '\n';
    files.set(CFG, new TextEncoder().encode(cfgText));
  }
  let html, index, deckMeta, tier, narrB = null;
  try {
    const a = await tierA(P.original, files, { identity, fonts: engine.fonts });
    if (!live()) { cancelled(); return; }
    if (a.ok) { html = a.html; index = a.index; deckMeta = a.deckMeta; tier = 'A'; P.lastTierA = a.changes; saveWarnings = a.warnings || []; }
    else {
      P.lastRefusal = { code: a.code, reason: a.reason };
      if (P.tierAOnly) { status(''); await ask({ title: T.tierAOnlyTitle, kind: 'warn', body: [el('p', { id: 'tier-a-only', text: T.tierAOnlySave(P.tierAOnly) }), el('pre', { cls: 'tech', text: `[${a.code}] ${a.reason}` })], buttons: [{ id: 'ok', label: T.ok, pri: true }] }); return; }
      const v = await ask({ title: T.tierBTitle, kind: 'warn',
        body: [el('p', { id: 'tier-b-warn', text: T.tierBWarn }), el('p', { cls: 'hint', text: T.tierBWhy(a.code) }), el('p', { cls: 'hint', text: T.tierBGap })],
        buttons: [{ id: 'cancel', label: T.cancel }, { id: 'rebuild', label: T.tierBGo, pri: true }] });
      if (v !== 'rebuild') { status(''); return; }
      if (!live()) { cancelled(); return; }
      // 段 B は今の作業場所から組む：組み始めの版を保存するものの版にし、組んでいる間に編集があれば（混ざりうるので）「保存した」にしない
      rev = ws.revision;
      narrB = await ws.readText('narration.md');
      if (ws.revision !== rev || !live()) { if (!live()) { cancelled(); return; } rev = null; }
      const r = await engine.exportPortable(S.deckFile, { carry: P.index, identity, originalNarration: P.narr0 });
      if (ws.revision !== rev) rev = null;
      html = r.html; index = r.index; deckMeta = r.deckMeta; tier = 'B';
    }
  } catch (e) { status(''); toast(T.saveFailed + ': ' + (e.message || e), true); return; }
  if (!live()) { cancelled(); return; }
  try {
    let h = mode === 'save' ? P.handle : null, wrote = false;
    if (h) {
      try {
        if (!(await hasPermission(h)) && !(await askPermission(h))) throw new Error(T.noPermission);
        if (!live()) throw cancelledError();                 // 権利の確認を待つ間に替わった
        await writeFile(h, html, live); wrote = true;
      } catch (e) { if (e && (e.name === 'AbortError' || e.name === 'Cancelled')) throw e; console.warn('[editor] cannot overwrite the file, asking where to save', e); h = null; }
    }
    if (!wrote) {
      if (!live()) throw cancelledError();
      const th = window.__APP_TEST && window.__APP_TEST.saveHandle;
      const name = mode === 'new' ? T.newLessonName(P.name) : P.name;
      h = th ? (await writeFile(th, html, live), th) : await saveWithPicker(name, html, null, live);
      if (!live()) throw cancelledError();
      if (h) { P.handle = h; P.name = h.name; S.label = h.name; document.title = h.name + ' — Motion Slides Editor'; }
      else P.name = name;
    }
    // ここまでで書いた。この後の作業場所の書き込みと「保存した」は、今も同じ作業場所のときだけ（最後の確かめの後）
    if (!live()) throw cancelledError();
    // 新しい教材：作業場所の設定のファイルも新しい docId に（この後の保存も新しい教材に）。保存したものに入っているので、
    // 保存の途中で編集がなかったときは、この書き込みの後の版を保存した版とする
    if (cfgText) {
      const before = ws.revision;
      const wp = ws.writeText(CFG, cfgText, { live });
      if (rev !== null && before === rev) rev = ws.revision;
      await wp;
      if (!live()) throw cancelledError();
    }
    const clean = rev !== null && ws.markClean(rev);
    P.index = index; P.deckMeta = deckMeta; P.saved = html; P.original = html; P.lastTier = tier; P.sourceMatches = true;
    P.saveWarnings = saveWarnings;
    // 段 A の元の口述原稿：保存したもの（保存の途中の編集は入れない）。段 B は組み始めの作業場所から組んだので、そのときのもの
    const nb = files.get('narration.md');
    P.narr0 = tier === 'A' ? (nb ? new TextDecoder().decode(nb) : null) : narrB;
    updateName();
    const mb = (html.length / 1048576).toFixed(1);
    status(tier === 'A' ? T.savedAtA(time(), mb) : T.savedAtB(time(), mb));
    if (!clean) console.warn('[editor] edited while saving: the newer edits are not in the saved file (still unsaved)');
    // 段 A の知らせ（音声も消した段階など）は警告の一覧に入れ、保存の知らせ（toast）にも件数を出す
    if (saveWarnings.length) { for (const w of saveWarnings) console.warn('[editor] save:', w); S.warn.push(...saveWarnings); showWarn(); }
    toast((h ? T.savedToast(P.name) : T.downloadedToast(P.name)) + (mode === 'new' ? T.newLessonToast : '') + (saveWarnings.length ? T.saveWarned(saveWarnings.length) : ''), saveWarnings.length > 0);
    showNotice();
  } catch (e) {
    if (e && e.name === 'Cancelled') { cancelled(); return; }
    if (e && e.name !== 'AbortError') toast(String(e.message || e), true); status('');
  }
}

// ---------------------------------------------------------------- フォルダに書き出す（空のフォルダにだけ。npm run portable -- unpack と同じ中身）
async function exportFolder(ws = S.ws) {
  if (!ws) return;
  if (!window.showDirectoryPicker) { toast(T.noFolderPicker, true); return; }
  let dir;
  try { dir = (window.__APP_TEST && window.__APP_TEST.dirHandle) || await window.showDirectoryPicker({ id: 'motion-unpack', mode: 'readwrite' }); }
  catch (e) { if (e && e.name !== 'AbortError') toast(String(e.message || e), true); return; }
  if (!(await hasPermission(dir)) && !(await askPermission(dir))) { toast(T.noPermission, true); return; }
  try {
    const n = await writeToDirectory(dir, archiveFiles(ws));
    status(T.unpackedAt(time(), n, dir.name));
    toast(T.unpackedToast(n, dir.name));
  } catch (e) { toast(e.code === 'not-empty' ? T.notEmpty(dir.name) : String(e.message || e), true); }
}

// ---------------------------------------------------------------- フォルダのデッキを持ち運べる 1 ファイルに書き出す
async function exportPortableFile() {
  if (!S.ws || S.portable) return;
  const ws0 = S.ws, g0 = S.gen;
  status(T.exporting);
  let r;
  try { r = await engine.exportPortable(S.deckFile); }
  catch (e) { status(''); toast(T.exportFailed + ': ' + (e.message || e), true); return; }
  const live = () => S.ws === ws0 && S.gen === g0;
  if (!live()) { status(''); toast(T.api.cancelled, true); return; }
  try {
    const name = S.deckFile.replace(/\.html?$/i, '') + FORMAT.FILE_EXT;
    const th = window.__APP_TEST && window.__APP_TEST.saveHandle;
    const h = th ? (await writeHandle(th, r.html, live), th) : await saveWithPicker(name, r.html, ws0.handle, live);
    if (!live()) throw cancelledError();
    // docId を初めて作ったときは、原稿のフォルダの設定のファイルに残す（次の書き出しでも同じ文書）。書き出しを書いた後、今も同じ作業場所のときだけ
    for (const [rel, text] of Object.entries(r.writes)) await ws0.writeText(rel, text, { live });
    status(T.exported(time(), (r.html.length / 1048576).toFixed(1)));
    toast(h ? T.portableExportedToast : T.downloadedToast(name));
  } catch (e) {
    if (e && e.name === 'Cancelled') { status(''); toast(T.api.cancelled, true); return; }
    if (e && e.name !== 'AbortError') toast(String(e.message || e), true); status('');
  }
}

// ---------------------------------------------------------------- 新しいデッキ
function showNewForm(on) {
  $('newform').hidden = !on;
  if (on) {
    const sel = $('n-theme'); sel.innerHTML = '';
    for (const t of RES.themes) sel.append(el('option', { value: t, text: t }));
    $('n-lang').value = EN ? 'en' : 'ja';
    $('n-title').value = ''; $('n-title').placeholder = EN ? 'Untitled deck' : '新しいデッキ';
    $('n-title').focus();
  }
}
async function createDeck() {
  const opts = { lang: $('n-lang').value, theme: $('n-theme').value, title: $('n-title').value.trim() || null };
  const dir = await pickFolder();
  if (!dir) return;
  if (!(await hasPermission(dir)) && !(await askPermission(dir))) { toast(T.noPermission, true); return; }
  let target = dir, empty = true;
  for await (const _ of dir.keys()) { empty = false; break; }
  if (!empty) {
    // 空でないフォルダには書かない：中に新しいフォルダを作る
    const baseName = (opts.title || (opts.lang === 'en' ? 'new-deck' : 'new-deck')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 60) || 'new-deck';
    let name = baseName, n = 2;
    for (;;) { try { await dir.getDirectoryHandle(name); name = `${baseName}-${n++}`; } catch { break; } }
    target = await dir.getDirectoryHandle(name, { create: true });
  }
  const files = newDeckFiles(opts);
  for (const [rel, text] of Object.entries(files)) {
    if ((await readText(target, rel)) !== null) { toast(T.exists(rel), true); return; }
    await writeText(target, rel, text);
  }
  showNewForm(false);
  toast(T.created(target.name));
  await openFolder(target);
}

// ---------------------------------------------------------------- つなぎ
applyTexts();
document.querySelector('#top .brand').title = T.brand;
$('w-open').onclick = async () => { const h = await pickFolder(); if (h) openFolder(h); };
$('b-open').onclick = async () => { const h = await pickFolder(); if (h) openFolder(h); };
$('w-new').onclick = () => showNewForm(true);
$('n-cancel').onclick = () => showNewForm(false);
$('n-go').onclick = createDeck;
$('b-edit').onclick = () => ui.toggleEdit();
$('b-narr').onclick = () => ui.toggleNarr();
$('w-openfile').onclick = async () => openPortable(await pickPortable());
$('b-openfile').onclick = async () => openPortable(await pickPortable());
$('b-save').onclick = () => savePortable('save');
$('b-savenew').onclick = () => savePortable('new');
$('b-saveas').onclick = () => savePortable('copy');
$('b-unpack').onclick = () => exportFolder();
$('b-export-portable').onclick = exportPortableFile;
$('b-comments').onclick = () => ui.toggleComments();
$('b-check').onclick = quickCheck;
$('b-export').onclick = exportHtml;
$('b-print').onclick = () => { const f = $('preview').contentWindow; if (f) f.postMessage({ type: 'app-print' }, '*'); };
$('b-presenter').onclick = openPresenter;
$('b-full').onclick = () => { const f = $('preview'); (f.requestFullscreen ? f.requestFullscreen() : Promise.reject()).then(() => f.focus(), () => toast(T.noFullscreen, true)); };
$('b-warn').onclick = showWarnings;
// 道具の列の一覧（「開く ▾」「保存 ▾」「書き出す ▾」）：開くと最初の項目に。↑↓ で移り、Esc・外を押す・項目を選ぶと閉じる
const MENUS = [['b-openmenu', 'm-open'], ['b-savemenu', 'm-save'], ['b-exportmenu', 'm-export']].map(([b, m]) => ({ btn: $(b), list: $(m) }));
const menuItems = (M) => [...M.list.querySelectorAll('button')].filter((b) => !b.hidden);
function closeMenu(M, focusBtn) { if (M.list.hidden) return; M.list.hidden = true; M.btn.setAttribute('aria-expanded', 'false'); if (focusBtn) M.btn.focus(); }
const closeMenus = () => MENUS.forEach((M) => closeMenu(M));
for (const M of MENUS) {
  M.btn.onclick = (e) => {
    e.stopPropagation();
    const was = !M.list.hidden;
    closeMenus();
    if (was) return;
    M.list.hidden = false; M.btn.setAttribute('aria-expanded', 'true');
    const f = menuItems(M)[0]; if (f) f.focus();
  };
  M.list.addEventListener('click', (e) => { if (e.target.closest('button')) closeMenu(M); });
  M.list.addEventListener('keydown', (e) => {
    const list = menuItems(M), i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(M, true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = list.length; if (n) list[((i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].focus(); }
    else if (e.key === 'Tab') closeMenu(M);
  });
}
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
$('b-help').onclick = showHelp;
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const item = [...(e.dataTransfer.items || [])].find((i) => i.kind === 'file');
  if (!item) { toast(T.dropFolder, true); return; }
  // 項目は drop の間しか読めないので、ハンドルとファイルを先に取る
  const hp = item.getAsFileSystemHandle ? item.getAsFileSystemHandle() : null;
  const file = item.getAsFile();
  const h = hp ? await hp.catch(() => null) : null;
  if (h && h.kind === 'directory') { openFolder(h); return; }
  // ファイル：持ち運べる 1 ファイルとして開く（ドロップのハンドルがあれば、保存でそのファイルに上書きできる）
  if (h && h.kind === 'file') openPortable({ handle: h });
  else if (file) openPortable({ file });
  else toast(T.dropFolder, true);
});
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('w-open').click(); } });

// 確かめ方（tools/test-app.mjs）：OPFS などのフォルダのハンドルを渡して開く・状態を読む・書き出し先を渡す
window.__APP_TEST = {
  open: (h) => openFolder(h),
  saveHandle: null,
  dirHandle: null,
  state: () => ({ deckFile: S.deckFile, builds: S.builds, loads: S.loads, error: S.error, warn: S.warn.slice(), pos: S.pos, open: !!S.ws, kind: S.ws ? S.ws.kind : null,
    allowed: !!S.allowed, presenter: !!(S.presWin && !S.presWin.closed), presLoads: S.presLoads || 0,
    portable: S.portable ? { docId: S.portable.index.docId, profile: S.portable.index.profile, extended: !!S.portable.extended, mislabelled: !!S.portable.mislabelled, codeReasons: (S.portable.codeReasons || []).slice(), readOnly: S.portable.readOnly, tierAOnly: S.portable.tierAOnly, rightsOk: S.portable.rightsOk, dirty: S.ws.dirty, name: S.portable.name, stale: (S.stale || []).slice(),
      lastTier: S.portable.lastTier, lastTierA: S.portable.lastTierA || null, saveWarnings: (S.portable.saveWarnings || []).slice(), lastRefusal: S.portable.lastRefusal || null, derivedFrom: (S.portable.index.metadata && S.portable.index.metadata.derivedFrom) || null } : null }),
  openFile: (input) => openPortable(input),
  saved: () => (S.portable ? S.portable.saved : null),
  save: (mode) => savePortable(mode || 'save'),
  api: (method, url, body) => api(method, url, body),
  files: () => (S.ws && S.ws.snapshot ? Object.fromEntries([...S.ws.snapshot()].map(([k, v]) => [k, bytesToBase64(v)])) : null),
  workerProbe: (name) => probeWorker(name),
  buildWorkerProbe: (name) => builder.probe(name),
  buildTimeout: 0,
  build: async (opts) => (await engine.build(S.deckFile, opts || {})).html,
  rebuild: () => rebuild('test'),
  ui: () => ui.state(),
};
window.__APP_TEST_OPEN = (h) => openFolder(h);

// ---------------------------------------------------------------- 言葉の切り替え（English / 日本語）
// ページを ?lang= 付きで読み直す。デッキを開いていたら、読み直した後に同じフォルダを開き直す
const langBtn = $('b-lang');
langBtn.textContent = EN ? '日本語' : 'English';
langBtn.setAttribute('lang', EN ? 'ja' : 'en');
langBtn.setAttribute('aria-label', EN ? '日本語に切り替える' : 'Switch to English');
langBtn.onclick = () => {
  const to = EN ? 'ja' : 'en';
  try { localStorage.setItem(LANG_KEY, to); } catch { /* 使えない環境 */ }
  // 持ち運べる 1 ファイルはメモリの上にあるので、読み直すと閉じる（未保存の変更があれば確かめる）
  if (S.portable && S.ws.dirty && !window.confirm(T.unsavedLang)) return;
  try { if (S.ws && !S.portable) sessionStorage.setItem('motion-editor-reopen', '1'); } catch { /* 使えない環境 */ }
  const u = new URL(location.href); u.searchParams.set('lang', to); location.href = u.href;
};
window.addEventListener('beforeunload', (e) => { if (S.portable && S.ws && S.ws.dirty) { e.preventDefault(); e.returnValue = ''; } });
(async () => {
  let reopen = false;
  try { reopen = sessionStorage.getItem('motion-editor-reopen') === '1'; sessionStorage.removeItem('motion-editor-reopen'); } catch { /* 使えない環境 */ }
  if (reopen) {
    const r = (await recentList())[0];
    if (r && (await hasPermission(r.handle).catch(() => false))) { openFolder(r.handle); return; }
  }
  showWelcome();
})();
