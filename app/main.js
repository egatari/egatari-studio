// 編集アプリ（インストール不要。Chrome / Edge の File System Access API でデッキのフォルダを開く）
// 開発サーバー（server/dev.mjs）の代わりに、ブラウザの中で組み、プレビューし、原稿・口述原稿・コメントを書き戻す
// 説明は docs/editor.md。触るのは選んだフォルダだけで、外へは繋がらない（アプリ自身の読み込みを除く）
import RES from 'virtual:resources';
import SHIM from './frame-shim.js?text';
import { createEngine, bytesToBase64 } from './engine.js';
import { createDevApi } from './devapi.js';
import { walk, writeText, readText, hasPermission, askPermission, recentList, recentAdd, recentRemove } from './fsx.js';
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
const S = {
  root: null, deckFile: null, base: null, preview: null, slides: [], warn: [], error: null,
  frameStore: {}, sig: '', building: null, again: false, poll: 0, builds: 0, loads: 0, pos: null,
  presWin: null, checks: new Map(), lastBuildMs: 0,
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
  $('welcome').hidden = false; $('deck').hidden = true; $('tools').hidden = true; $('deckname').textContent = '';
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
  stopPoll();
  // 別のフォルダ：プレビューは読み込み直さずに入れ替える（前のデッキの未保存の入力は待たない）
  S.root = handle; S.base = null; S.preview = null; S.error = null; S.sig = ''; S.frameStore = {}; S.pos = null; S.fresh = true;
  engine.setRoot(handle);
  const listing = await walk(handle);
  engine.setListing(listing);
  S.deckFile = engine.deckFile();
  if (!S.deckFile) { toast(T.noDeck, true); S.root = null; return false; }
  S.sig = signature(listing);
  recentAdd(handle);
  $('welcome').hidden = true; $('deck').hidden = false; $('tools').hidden = false;
  $('deckname').textContent = handle.name + ' / ' + S.deckFile;
  $('deckname').title = $('deckname').textContent;
  document.title = handle.name + ' — Motion Slides Editor';
  closePanel();
  await rebuild('open');
  startPoll();
  return true;
}
function signature(listing) {
  return [...listing.files].filter(([rel]) => rel !== 'comments.json').map(([rel, f]) => rel + ':' + f.m + ':' + f.s).sort().join('\n');
}

// ---------------------------------------------------------------- 組み立てとプレビュー
const enc = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
function withShim(html, cfg) {
  const tag = `<script>${SHIM}(${enc(cfg)});</script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + tag) : tag + html;
}
function previewHtml(base, warn) {
  const html = withShim(base, { dev: true, store: S.frameStore, load: S.loads });
  const inject = `<script>window.__DEV_WARN=${enc(warn)};</script>\n<script>${RES.client}</script>\n`;
  const at = html.lastIndexOf('</body>');
  return at >= 0 ? html.slice(0, at) + inject + html.slice(at) : html + inject;
}
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
        const listing = await walk(S.root);
        engine.setListing(listing); S.sig = signature(listing);
        S.deckFile = engine.deckFile() || S.deckFile;
        const r = await engine.build(S.deckFile, { dev: true });
        S.lastBuildMs = Math.round(performance.now() - t0);
        S.builds++;
        const wasError = !!S.error;
        S.error = null; failed = false;
        S.slides = r.slides; S.warn = r.stats.warn;
        const changed = r.html !== S.base;
        S.base = r.html;
        S.preview = previewHtml(r.html, r.stats.warn);
        showError(null);
        showWarn();
        $('st-info').textContent = `${T.slidesN(r.stats.slides)} · ${(r.html.length / 1048576).toFixed(1)} MB · ${S.lastBuildMs} ms`;
        if (reason !== 'poll' || changed || wasError) status(T.rebuilt(time(), reason));
        if (changed || !S.loads) refreshFrame();
        if (changed && S.presWin && !S.presWin.closed) loadPresenter();
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
// プレビューを新しい中身にする：まだ読み込んでいなければ直接、読み込んでいれば client.js に知らせる（未保存の入力があれば待つ）
function refreshFrame() {
  const f = $('preview');
  if (!S.loads || S.fresh || !f.contentWindow) return loadFrame();
  f.contentWindow.postMessage({ type: 'app-reload' }, '*');
}
function loadFrame() {
  if (!S.preview) return;
  const f = $('preview');
  S.loads++; S.fresh = false;
  S.frameStore['dev-restore'] = 1;
  f.srcdoc = previewHtml(S.base, S.warn);
}
$('preview').addEventListener('load', () => { try { $('preview').focus(); } catch { /* 無視 */ } });
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
    if (!S.root || S.building) return;
    try {
      const listing = await walk(S.root);
      const sig = signature(listing);
      if (sig !== S.sig) { S.sig = sig; await rebuild('poll'); }
    } catch (e) { console.warn('[editor] poll failed', e); }
  }, POLL_MS);
}
function stopPoll() { clearInterval(S.poll); S.poll = 0; }

// ---------------------------------------------------------------- デッキの iframe とのやり取り
const api = createDevApi({
  get root() { return S.root; },
  deckFile: () => S.deckFile,
  slideOrder: () => S.slides || [],   // {key, id, heading}：id のあるスライドの新しい節は「## 見出し {#id}」
  afterWrite: async () => { const failed = await rebuild('save'); return failed; },
  msg: T.api,
});
window.addEventListener('message', async (e) => {
  const m = e.data || {};
  const frame = $('preview').contentWindow;
  if (e.source === frame) {
    if (m.type === 'app-api') {
      const body = await api(String(m.method || 'GET'), String(m.url || ''), m.body);
      frame.postMessage({ type: 'app-api-reply', id: m.id, body }, '*');
    } else if (m.type === 'app-reload-now') loadFrame();
    else if (m.type === 'app-store' && typeof m.k === 'string') { if (m.v === null) delete S.frameStore[m.k]; else S.frameStore[m.k] = m.v; }
    else if (m.type === 'app-open-presenter') openPresenter();
    else if (m.type === 'app-check-result' && S.checks.has(m.id)) { S.checks.get(m.id)(m.results || []); S.checks.delete(m.id); }
    else if (typeof m.type === 'string' && /^deck-/.test(m.type)) {
      if (m.type === 'deck-pos') S.pos = m;
      if (S.presWin && !S.presWin.closed) S.presWin.postMessage({ type: 'app-pres-down', m }, '*');
    }
  } else if (S.presWin && e.source === S.presWin && m.type === 'app-pres-up' && m.m && typeof m.m.type === 'string' && /^deck-/.test(m.m.type)) {
    if (frame) frame.postMessage(m.m, '*');
  }
});
const sendKey = (key) => { const f = $('preview').contentWindow; if (f) { f.postMessage({ type: 'app-key', key }, '*'); $('preview').focus(); } };

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
function openPresenter() {
  if (!S.base) return;
  const w = window.open('', 'motion-presenter', 'width=1400,height=820');
  if (!w) { toast(T.popupBlocked, true); return; }
  S.presWin = w;
  w.document.open(); w.document.write(PRES_DOC); w.document.close();
  loadPresenter();
}
function loadPresenter() {
  const w = S.presWin;
  const f = w && !w.closed && w.document.getElementById('pf');
  if (!f) return;
  w.document.title = (EN ? 'Presenter — ' : '発表者ビュー — ') + (S.root ? S.root.name : '');
  f.srcdoc = withShim(S.base, { query: '?presenter=1', opener: true, html: S.base, shim: SHIM });
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
  if (!S.root) return;
  status(T.exporting);
  let r;
  try { r = await engine.build(S.deckFile, { dev: false }); }
  catch (e) { toast(T.exportFailed + ': ' + (e.message || e), true); return; }
  const name = S.deckFile.replace(/\.html?$/i, '') + '.html';
  try {
    let h = window.__APP_TEST && window.__APP_TEST.saveHandle;
    if (!h && window.showSaveFilePicker) {
      h = await window.showSaveFilePicker({ suggestedName: name, startIn: S.root, types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] });
    }
    if (h) { const w = await h.createWritable(); await w.write(r.html); await w.close(); }
    else {
      const a = el('a', { href: URL.createObjectURL(new Blob([r.html], { type: 'text/html' })), download: name });
      document.body.append(a); a.click(); a.remove();
    }
    status(T.exported(time(), (r.html.length / 1048576).toFixed(1)));
    toast(T.exportedToast);
  } catch (e) { if (e && e.name !== 'AbortError') toast(String(e.message || e), true); status(''); }
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
$('w-open').onclick = async () => { const h = await pickFolder(); if (h) openFolder(h); };
$('b-open').onclick = async () => { const h = await pickFolder(); if (h) openFolder(h); };
$('w-new').onclick = () => showNewForm(true);
$('n-cancel').onclick = () => showNewForm(false);
$('n-go').onclick = createDeck;
$('b-edit').onclick = () => sendKey('e');
$('b-narr').onclick = () => sendKey('n');
$('b-comments').onclick = () => sendKey('c');
$('b-check').onclick = quickCheck;
$('b-export').onclick = exportHtml;
$('b-print').onclick = () => { const f = $('preview').contentWindow; if (f) f.postMessage({ type: 'app-print' }, '*'); };
$('b-presenter').onclick = openPresenter;
$('b-full').onclick = () => { const f = $('preview'); (f.requestFullscreen ? f.requestFullscreen() : Promise.reject()).then(() => f.focus(), () => toast(T.noFullscreen, true)); };
$('b-warn').onclick = showWarnings;
$('b-help').onclick = showHelp;
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const item = [...(e.dataTransfer.items || [])].find((i) => i.kind === 'file');
  if (!item || !item.getAsFileSystemHandle) { toast(T.dropFolder, true); return; }
  const h = await item.getAsFileSystemHandle();
  openFolder(h);
});
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('w-open').click(); } });

// 確かめ方（tools/test-app.mjs）：OPFS などのフォルダのハンドルを渡して開く・状態を読む・書き出し先を渡す
window.__APP_TEST = {
  open: (h) => openFolder(h),
  saveHandle: null,
  state: () => ({ deckFile: S.deckFile, builds: S.builds, loads: S.loads, error: S.error, warn: S.warn.slice(), pos: S.pos, open: !!S.root }),
  build: async (opts) => (await engine.build(S.deckFile, opts || {})).html,
  rebuild: () => rebuild('test'),
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
  try { if (S.root) sessionStorage.setItem('motion-editor-reopen', '1'); } catch { /* 使えない環境 */ }
  const u = new URL(location.href); u.searchParams.set('lang', to); location.href = u.href;
};
(async () => {
  let reopen = false;
  try { reopen = sessionStorage.getItem('motion-editor-reopen') === '1'; sessionStorage.removeItem('motion-editor-reopen'); } catch { /* 使えない環境 */ }
  if (reopen) {
    const r = (await recentList())[0];
    if (r && (await hasPermission(r.handle).catch(() => false))) { openFolder(r.handle); return; }
  }
  showWelcome();
})();
