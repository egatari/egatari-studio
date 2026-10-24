// 編集アプリ（インストール不要。Chrome / Edge の File System Access API でデッキのフォルダを開く。持ち運べる 1 ファイルはフォルダなしで開ける）
// 開発サーバー（server/dev.mjs）の代わりに、ブラウザの中で組み、プレビューし、原稿・口述原稿・コメントを書き戻す
// 説明は docs/editor.md。触るのは選んだフォルダか開いたファイルだけで、外へは繋がらない（アプリ自身の読み込みを除く）
// 読み書きはすべて作業場所（workspace.js：フォルダ／メモリの上のフォルダ）を通す。編集の画面（server/editor-ui.js）はこのページにあり、
// プレビュー（sandbox の iframe）は「どこを直したいか」を知らせる（server/hints.js）だけで、書き込みを頼む口を持たない
import RES from 'virtual:resources';
import SHIM_SRC from './frame-shim.js?text';
import { withLayoutScan } from '../kit/core/layout-scan.mjs';
import { createEngine, bytesToBase64 } from './engine.js';
import { previewDocument, trustedPrefix } from './preview-doc.js';
import { createDevApi } from './devapi.js';
import { createEditorUI } from '../server/editor-ui.js';
import { createAudioPanel } from './audio-panel.js';
import { createRecMode } from './rec-mode.js';
import { createAttachPanel } from './attachments-panel.js';
import { createLivePanel } from './live-panel.js';
import { createSlidesPanel } from './slides-panel.js';
import { addLive, liveRuntime } from '../kit/core/live.mjs';
import { parseNarration } from '../kit/core/narration-core.mjs';
import LIVE_POLICY_SRC from '../kit/core/live-policy.mjs?text';
import LIVE_JS from '../kit/live.js?text';
import { createTtsClient } from './tts-client.js';
import { loadLame } from './mp3-loader.js';
import { writeFile, cancelledError, hasPermission, askPermission, recentList, recentAdd, recentRemove } from './fsx.js';
import { folderWorkspace, memoryWorkspace } from './workspace.js';
import { readInWorker, probeWorker, workspaceFromPortable, archiveFiles, writeToDirectory, registryProblems, staleSteps } from './portable.js';
import { rightsOf } from './rights.js';
import { CONTRACTS, LIMITS, newDocId, playOnly, exportedState, FORMAT_VERSION } from '../kit/core/portable.mjs';
import { modelCacheSection } from './model-cache-ui.js';
import { tierA } from '../kit/core/tier-a.mjs';
import { draftLeftovers } from '../kit/core/template-text.mjs';
import { createBuildClient, BUILD_TIMEOUT_MS } from './build-client.js';
import { FORMAT } from '../kit/core/format.mjs';
import { updateConfig, merge as configMerge } from '../kit/core/config-file.mjs';
import { exportName, titleOf } from '../kit/core/export-name.mjs';
import { AUDIO_LIMITS } from '../kit/core/audio-core.mjs';
import { readFileBounded, fetchBounded, READ_LIMITS } from './bounded-read.js';
import { TEMPLATES } from '../kit/core/slide-ops.mjs';
import { outlineOf, remaining as outlineLeft, nextBatch as outlineNext } from '../kit/core/llm-outline.mjs';
import { T, EN, LANG_KEY, applyTexts } from './i18n.js';
import { setupLlm } from './llm.js';
import { slowWait, createWaitOverlay } from './wait-logo.js';
import { mountVersionUi } from './version-ui.js';
import { themeFolderWorkspace, themeNames, permissionOf, requestRead, loadThemeFolder, loadThemeFolderAt, saveThemeFolder, forgetThemeFolder } from './theme-folder.js';
import { readThemeZip, themeZipErrorKind, pickZipFile, THEME_ZIP_LIMITS } from './theme-zip.js';
import { mergedThemeWorkspace, themeNamesOf, themeLabelOf, loadMyThemes, putMyTheme, forgetMyThemes } from './my-themes.js';
// プレビューの中の仲立ち：品質チェックの体裁の検査（kit/core/layout-scan.mjs。コマンド版と同じ関数）を渡す形に包む
const SHIM = withLayoutScan(SHIM_SRC);

const $ = (id) => document.getElementById(id);
const POLL_MS = 1500;
const SUPPORTED = typeof window.showDirectoryPicker === 'function';
// 約 1 秒を超える待ち（見本・ファイルを開く）にだけ、はじめの画面の上にロゴを描く（app/wait-logo.js）
const wait = createWaitOverlay($('wait'));

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
  $('welcome').hidden = false; $('deck').hidden = true; $('tools').hidden = true; $('deckname').textContent = ''; $('notice').hidden = true; $('saveloc').hidden = true;
  $('top').classList.remove('has-deck');
  $('unsupported').hidden = SUPPORTED;
  $('w-open').disabled = !SUPPORTED;   // 「新規作成…」（チャットの AI に書いてもらう）はフォルダがなくても使える
  showExamples();
  const list = await recentList();
  // 最近のファイル：なくても見出しは出す（「まだありません」）
  $('recent').hidden = false; $('recent-none').hidden = list.length > 0;
  // ファイルを選ぶ画面がない（Safari・iPad など）：保存はダウンロードになり、保存のたびに新しいファイルができる
  $('save-note').hidden = !!window.showSaveFilePicker;
  const ul = $('recent-list'); ul.innerHTML = '';
  for (const r of list) {
    const file = r.handle && r.handle.kind === 'file';
    ul.append(el('li', { 'data-kind': file ? 'file' : 'folder' }, [
      el('span', { cls: 'nm', text: r.name }),
      el('span', { cls: 'kind', text: file ? T.recentFile : T.recentFolder }),
      el('span', { cls: 'when', text: new Date(r.opened).toLocaleString(EN ? 'en-US' : 'ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }),
      el('button', { type: 'button', text: T.reopen, onclick: async () => {
        // 1 ファイルは読む許可だけを求める（上書きの許可は「保存」のときに求める）
        const mode = file ? 'read' : 'readwrite';
        try { if (!(await hasPermission(r.handle, mode)) && !(await askPermission(r.handle, mode))) { toast(T.noPermission, true); return; } }
        catch { toast(file ? T.cannotOpenRecentFile : T.cannotOpen, true); return; }
        if (file) { if (!(await openPortable({ handle: r.handle })) && !$('welcome').hidden) showWelcome(); }
        else openFolder(r.handle);
      } }),
      el('button', { type: 'button', cls: 'ghost', text: '✕', title: T.forget, 'aria-label': T.forget, onclick: async () => { await recentRemove(r.id); showWelcome(); } }),
    ]));
  }
}
// 見本の教材（配信版の dist/examples/。tools/build-app.mjs が組んで一覧を RES.examples に入れる）：同じサイトから読み、
// ほかのファイルと同じ道（openPortable：Worker で検査して取り出し、中身からコードを探す）で開く。file://（1 ファイル版）では出さない
function showExamples() {
  const list = Array.isArray(RES.examples) ? RES.examples : [];
  const on = list.length > 0 && /^https?:$/.test(location.protocol);
  $('examples').hidden = !on;
  const ul = $('examples-list'); ul.innerHTML = '';
  if (!on) return;
  for (const x of list) {
    ul.append(el('li', { 'data-example': x.name }, [
      el('span', { cls: 'ex-text' }, [
        el('span', { cls: 'nm', text: x.title, ...(x.lang ? { lang: x.lang } : {}) }),
        el('span', { cls: 'meta', text: `${x.file} · ` + T.exampleMeta(x.slides, (x.bytes / 1048576).toFixed(1), x.profile === 'extended') }),
      ]),
      el('button', { type: 'button', text: T.exampleOpen, 'aria-label': `${T.exampleOpen}: ${x.title}`, onclick: () => openExample(x) }),
    ]));
  }
}
async function openExample(x) {
  const end = wait.begin();
  try { return await openExampleNow(x); } finally { end(); }
}
async function openExampleNow(x) {
  let bytes;
  // 大きさは読む前（Content-Length）と読みながら、開ける上限（LIMITS.fileBytes）と比べる（app/bounded-read.js）
  try { bytes = await fetchBounded(new URL('examples/' + encodeURIComponent(x.file), document.baseURI), { max: LIMITS.fileBytes, what: x.file }); }
  catch (e) { toast(T.exampleFailed + ': ' + (e.message || e), true); return false; }
  return openPortable({ bytes, name: x.file });
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
  autoSeq++; clearTimeout(autoTimer); showBadge(0, 0);
  S.ws = ws; S.portable = portable; S.base = null; S.preview = null; S.error = null; S.sig = ''; S.pos = null; S.fresh = true; S.ranges = new Set(); S.yanked = []; S.yankedDone = null; S.themePinned = []; S.themeDone = null; S.codeOk = null; S.allowed = false; S.codeAsking = null; S.gen = (S.gen || 0) + 1;
  closePresenter();
  slidesPanel.reset();
  engine.setWorkspace(ws);
  rec.reset();
  audio.reset();
  ui.reset();
  if ($('attach-panel')) closePanel();
  // 前のデッキのプレビューを消す（次のデッキのコードは、確かめてから読み込む）
  blankPreview();
}
// プレビューを空にする：iframe を新しいもの（何も読み込まない）に取り替える。srcdoc を変えるだけでは、新しい文書が読み込まれるまで
// 前のデッキが見え、そのコードも動き続ける。取り替えれば前の文書はすぐに消え、確かめの窓の後ろには何も出ない
function blankPreview() {
  const f = $('preview'), g = document.createElement('iframe');
  for (const a of f.attributes) if (a.name !== 'srcdoc' && a.name !== 'src') g.setAttribute(a.name, a.value);
  g.addEventListener('load', onPreviewLoad);
  f.replaceWith(g);
}
function focusPreview() { try { $('preview').focus(); } catch { /* 無視 */ } }
// 読み込み終わったプレビューに focus を移す（キーがデッキに届くように）。ただし道具の列の一覧（開く・保存・書き出す ▾）にある focus は
// 奪わない：読み込みが終わるのは一覧を開いた後のことがあり（大きなデッキ・遅い機械）、奪うと ↑↓・Esc がデッキへ行き、一覧が開いたまま残る。
// 音声の板・録音モードの focus も奪わない（音声を書くと組み直して読み込み直す。録音モードを閉じて板の「● 録音」に戻した focus が飛ばないように）
function onPreviewLoad(e) {
  if (e.target.hasAttribute('srcdoc')) { S.frameLoaded = S.loads; sendPreviewAudio(e.target, S.baseAudio, S.loads); scheduleAutoCheck(); }   // 何回目の読み込みまで表示し終えたか（空の iframe の load は数えない）
  const a = document.activeElement;
  if (a && a.closest && a.closest('.menu, #dev-audio, #rec-mode')) return;
  focusPreview();
}
// プレビューの音声（backlog #49）：組み立てが置いた印（refs：[{src, rel, size}]、app/engine.js の previewAudio）の音声を作業場所から読み、
// 読み込み終わったプレビューに送る（中の仲立ち app/frame-shim.js がその文書の blob: にする。親の blob: は sandbox の枠から読めない）。
// 読んだバイトは印の大きさと時刻が同じ間は覚えておく（作業場所が替われば捨てる）。1 つは音声の板と同じ上限（AUDIO_LIMITS.fileBytes）、合わせて PREVIEW_AUDIO_MAX バイトまで
const PREVIEW_AUDIO_MAX = 512 * 1048576;
const PA = { ws: null, cache: new Map() };   // rel → {sig, bytes}
const AUDIO_MIME = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };
async function sendPreviewAudio(frame, refs, load) {
  const ws = S.ws;
  if (PA.ws !== ws) { PA.ws = ws; PA.cache.clear(); }
  if (!ws || !refs || !refs.length) return;
  const items = [], used = new Set();
  let total = 0;
  try {
    for (const x of refs) {
      const sig = x.src.slice(x.src.indexOf('.') + 1);
      if (x.size > AUDIO_LIMITS.fileBytes) { console.warn('[editor] preview audio: ' + x.rel + ' is over the audio file limit; not played'); continue; }
      total += x.size;
      if (total > PREVIEW_AUDIO_MAX) { console.warn('[editor] preview audio: over the limit; the rest is not played'); break; }
      let c = PA.cache.get(x.rel);
      if (!c || c.sig !== sig) {
        const bytes = await ws.readBytes(x.rel, { max: x.size });
        c = { sig, bytes };
        PA.cache.set(x.rel, c);
      }
      used.add(x.rel);
      const ext = (/\.([a-z0-9]+)$/i.exec(x.rel) || [])[1];
      items.push({ src: x.src, mime: AUDIO_MIME[(ext || '').toLowerCase()] || '', bytes: c.bytes.slice().buffer });
    }
  } catch (e) { console.warn('[editor] preview audio: could not read', e); return; }
  for (const rel of [...PA.cache.keys()]) if (!used.has(rel)) PA.cache.delete(rel);
  if (S.ws !== ws || S.loads !== load || !frame.contentWindow) return;   // 読む間に別の読み込みになった（その読み込みが送る）
  frame.contentWindow.postMessage({ type: 'app-audio', items }, '*');
}
function showDeck(label, title) {
  wait.pause();
  $('welcome').hidden = true; $('deck').hidden = false; $('tools').hidden = false;
  $('top').classList.add('has-deck');
  for (const e of document.querySelectorAll('.only-folder')) e.hidden = !!S.portable;
  for (const e of document.querySelectorAll('.only-portable')) e.hidden = !S.portable;
  // 「保存」：作業フォルダはその場で書くので押せない形で残す（押すとわけを出す）。見つけられるように隠さない
  $('b-save').setAttribute('aria-disabled', S.portable ? 'false' : 'true');
  $('b-save').title = S.portable ? '' : T.saveFolderAuto;
  S.label = label;
  updateName();
  document.title = title + ' — Egatari Studio';
  showNotice();
  closePanel();
  // スライド一覧：前に開いていたら（この画面の覚え。localStorage）開く。キーボードの位置はプレビューのまま
  if (slidesPanel.wantOpen() && !slidesPanel.isOpen()) slidesPanel.toggle(true, false);
}
function updateName() {
  const dirty = S.portable && S.ws && S.ws.dirty;
  $('deckname').textContent = (dirty ? '● ' : '') + (S.label || '');
  $('deckname').title = (S.label || '') + (dirty ? ' — ' + T.unsaved : '');
  // 保存していない変更：「ファイル ▾」のボタンに印（保存は一覧の中にある）
  $('b-filemenu').classList.toggle('dirty', !!dirty);
  updateSaveLoc();
}
// 今どこに保存されているか（#46）：作業フォルダ（その場で書く。保存のボタンはなく、配るときは書き出す）・1 ファイル（上書き / ダウンロード）・
// 保存していない変更・まだファイルにしていない（メモリの上だけ）
function updateSaveLoc() {
  const e = $('saveloc');
  if (!S.ws || $('deck').hidden) { e.hidden = true; return; }
  const P = S.portable;
  let text, tip, cls;
  // 下の帯の左に出す（道具の列は 1280 px で 1 行に収める）。説明は title に
  const where = P ? P.name : (S.ws.name || '');
  if (!P) { text = T.locFolder(where); tip = T.locFolderTip; cls = 'ok'; }
  else if ((P.sourceOnly || P.neverSaved) && !P.handle && !P.saved) { text = T.locNever; tip = T.locNeverTip; cls = 'never'; }
  else if (S.ws.dirty) { text = T.locDirty; tip = T.locDirtyTip; cls = 'dirty'; }
  else if (P.handle) { text = T.locFile(where); tip = T.locFileTip; cls = 'ok'; }
  else { text = T.locFileDl(where); tip = T.locFileDlTip; cls = ''; }
  e.textContent = text; e.title = text + ' — ' + tip; e.className = 'saveloc ' + cls; e.hidden = false;
}
// 持ち運べる 1 ファイルの知らせ（その文書のコード・読むだけ）。プレビューの外（エディタの画面）に出す
function showNotice() {
  const P = S.portable, lines = [];
  if (P && P.extended) lines.push(['notice-extended', T.extendedNotice]);
  if (P && P.mislabelled) lines.push(['notice-mislabel', T.codeMislabelled]);
  if (P && P.readOnly) lines.push(['notice-readonly', T.readOnlyNotice(P.readOnly)]);
  else if (P && P.tierAOnly) lines.push(['notice-tier-a', T.tierAOnlyNotice(P.tierAOnly)]);
  if (P && !P.readOnly && P.sourceMatches === false) lines.push(['notice-mismatch', T.mismatchNotice]);
  if (P && P.sourceOnly && !P.handle) lines.push(['notice-source-only', T.sourceOnlyNotice]);
  const n = $('notice'); n.innerHTML = '';
  for (const [id, text] of lines) n.append(el('p', { id, text }));
  // 作業フォルダから書き出した写し（index.exportedFrom、format spec §3.1）：ここで直してもフォルダに入らないと知らせ、作業フォルダに書き出すボタン（メニューと同じ名前）を出す。
  // 編集は断らない。写しの今の sourceSha256 が書き出したときの値と違えば、書き出しの後にこの写しで直した（hash で比べる。時刻は持たない）
  const xs = P ? exportedState(P.index) : null;
  if (xs) n.append(el('p', { id: 'notice-exported', text: T.exportedNotice + (xs.copyEdited ? ' ' + T.exportedEdited : '') + ' ' },
    [el('button', { type: 'button', id: 'b-exported-unpack', text: T.exportFolder, onclick: () => exportFolder() })]));
  // 部品庫が取り下げた版（format spec §6）：知らせて、置き換え先の版で組み直すボタンを出す。黙って置き換えない
  const yk = yankedNow();
  if (yk.length) {
    const reps = [...new Set(yk.filter((y) => y.replacementAvailable).map((y) => y.replacement))];
    n.append(el('p', { id: 'notice-yanked', text: T.yankedNotice(yk.map((y) => `${y.tag} ${y.version}`).join(' · '), reps.join(' / ') || yk[0].replacement) + ' ' },
      reps.length === 1 && S.ws && !(S.portable && S.portable.readOnly) ? [el('button', { type: 'button', id: 'b-yanked-rebuild', cls: 'pri', text: T.yankedRebuild(reps[0]), onclick: () => rebuildYanked(reps[0]) })] : []));
  }
  if (S.yankedDone) n.append(el('p', { id: 'notice-yanked-done', text: S.yankedDone }));
  const ol = S.outline && S.ws ? outlineLeft(S.outline) : 0;
  if (ol > 0) {
    const b = outlineNext(S.outline);
    n.append(el('p', { id: 'notice-outline', text: T.outlineNotice(ol, S.outline.rows.length) + ' ' },
      [el('button', { type: 'button', id: 'b-outline-next', cls: 'pri', text: T.outlineNextBtn(b.size), onclick: () => llm.nextBatch() })]));
  }
  // 教材が記録した前の版の同梱のテーマ（themes.lock.json。kit/core/themes-lock.mjs）：その版で組んでいると知らせ、変わる色（前 → 今、色見本つき）と
  // 「テーマを更新」を出す。黙って新しい色にしない（部品庫の取り下げた版と同じ）
  for (const u of S.themePinned || []) {
    const rows = u.tokens.map((x) => el('li', {}, [el('code', { text: x.token }), document.createTextNode(' '), swatch(x.from), document.createTextNode(` ${x.from} → `), swatch(x.to), document.createTextNode(` ${x.to}`)]));
    n.append(el('div', { id: 'notice-theme-pinned', 'data-theme-name': u.name }, [
      el('p', { text: T.themePinnedNotice(u.name, u.from, u.to) + (u.tokens.length ? '' : ' ' + T.themeNoColorChange) }),
      rows.length ? el('ul', { cls: 'theme-changes' }, rows) : null,
      S.ws && !(S.portable && S.portable.readOnly) ? el('p', {}, [el('button', { type: 'button', id: 'b-theme-update', cls: 'pri', text: T.themeUpdate, onclick: () => updateThemes() })]) : null,
    ]));
  }
  if (S.themeDone) n.append(el('p', { id: 'notice-theme-done', text: S.themeDone }));
  // 見つからないテーマ（組み立ての知らせ）：テーマのフォルダを選ぶ・前に選んだものを読む許可を求める
  const missing = missingThemes(S.warn);
  if (missing.length && S.ws) n.append(el('p', { id: 'notice-theme', text: T.themeMissing(missing, TF.handle ? TF.state : 'none', TF.handle ? TF.handle.name : '') + ' ' }, themeButtons()));
  n.hidden = !n.childNodes.length;
}
// 取り下げた版を記録している部品庫の部品：プレビューの組み立てと、開いた 1 ファイルの索引で組んだ（記録の版で）もの。タグで重ねる
function yankedNow() {
  const m = new Map();
  for (const y of [...((S.portable && S.portable.yankedRecorded) || []), ...(S.yanked || [])]) m.set(y.tag, y);
  return [...m.values()];
}
// 「{版} で組み直す」：egatari.json の components をその版にし（利用者が押したときだけ）、開いた 1 ファイルなら記録（carry）の部品も新しい組み立てのものに替える。
// 同一性の hash が変わる部品は、知らせに書く（format spec §6：黙って置き換えない）
async function rebuildYanked(version) {
  const ws = S.ws, P = S.portable;
  const todo = yankedNow().filter((y) => y.replacement === version && y.replacementAvailable);
  if (!ws || !todo.length) return;
  try {
    const CFG = FORMAT.CONFIG_FILE;
    // 設定のファイルの components だけを変える（ほかの項目はバイトのまま。読めないファイルは上書きせずに断る。kit/core/config-file.mjs）
    const text = updateConfig(await ws.readText(CFG, { max: READ_LIMITS.json }), { components: configMerge(Object.fromEntries(todo.map((y) => [y.name, y.replacement]))) });
    if (await ws.exists(CFG)) await ws.backup(CFG, { max: READ_LIMITS.json });
    await ws.writeText(CFG, text);
    if (P) {
      const tags = new Set(todo.map((y) => y.tag));
      const carry = { ...P.index, components: (P.index.components || []).filter((c) => !tags.has(c.tag)) };
      const dry = await builder.exportIndex(ws, S.deckFile, { carry }, { timeout: buildTimeout() });
      const fresh = (dry.index.components || []).filter((c) => tags.has(c.tag));
      P.index = { ...P.index, components: [...carry.components, ...fresh] };
      P.yankedRecorded = (P.yankedRecorded || []).filter((y) => !tags.has(y.tag));
      const probs = registryProblems(P.index, dry.index, dry.registryEquivalent);
      if (P.tierAReg) { P.tierAOnly = probs.length ? T.roRegistry(probs.join('; ')) : null; P.tierAReg = !!probs.length; }
    }
    S.yanked = []; S.yankedDone = T.yankedDone(version, todo.filter((y) => y.sha256Changes).map((y) => y.tag), todo.filter((y) => !y.sha256Changes).map((y) => y.tag));
    await rebuild('components');
  } catch (e) { toast(T.yankedFailed(String((e && e.message) || e)), true); }
}
// 色見本（値は themes.lock.json の #RRGGBB だけ。CSP の下でも効くように style は CSSOM で）
function swatch(c) {
  const e = el('span', { cls: 'swatch', 'aria-hidden': 'true' });
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) e.style.backgroundColor = c;
  return e;
}
// プレビューと書き出しの組み立てに渡すテーマの版（開いた 1 ファイルが記録した版。作業フォルダは egatari.json の themes を組み立てが読む）
const themeOpts = () => (S.portable && S.portable.themePins ? { themeVersions: S.portable.themePins } : {});
// 「テーマを更新」：egatari.json の themes を今の版にし（利用者が押したときだけ）、開いた 1 ファイルなら記録（carry）のテーマも新しい組み立てのものに替える。
// 変わる色は知らせに書いたもの（format spec §7.2：記録したテーマで組み直す。黙って替えない）
async function updateThemes() {
  const ws = S.ws, P = S.portable;
  const todo = (S.themePinned || []).slice();
  if (!ws || !todo.length) return;
  try {
    const CFG = FORMAT.CONFIG_FILE;
    // 設定のファイルの themes だけを変える（ほかの項目はバイトのまま。読めないファイルは上書きせずに断る。kit/core/config-file.mjs）
    const text = updateConfig(await ws.readText(CFG, { max: READ_LIMITS.json }), { themes: configMerge(Object.fromEntries(todo.map((u) => [u.name, u.to]))) });
    if (await ws.exists(CFG)) await ws.backup(CFG, { max: READ_LIMITS.json });
    await ws.writeText(CFG, text);
    if (P) {
      const names = new Set(todo.map((u) => u.name));
      const carry = { ...P.index, themes: (P.index.themes || []).filter((t) => !names.has(t.name)) };
      const dry = await builder.exportIndex(ws, S.deckFile, { carry, updateThemes: true }, { timeout: buildTimeout() });
      const fresh = (dry.index.themes || []).filter((t) => names.has(t.name));
      P.index = { ...P.index, themes: [...carry.themes, ...fresh] };
      P.themePins = dry.themeVersions && Object.keys(dry.themeVersions).length ? dry.themeVersions : null;
      const probs = registryProblems(P.index, dry.index, dry.registryEquivalent);
      if (P.tierAReg) { P.tierAOnly = probs.length ? T.roRegistry(probs.join('; ')) : null; P.tierAReg = !!probs.length; }
    }
    S.themePinned = []; S.themeDone = T.themeUpdateDone(todo.map((u) => `${u.name} ${u.from} → ${u.to}`).join('・'));
    await rebuild('theme');
  } catch (e) { toast(T.themeUpdateFailed(String((e && e.message) || e)), true); }
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
// theme：組み立てが返したテーマの名前と寸法の宣言（品質チェックの本文の場所の限りと themeMetricsDrift。kit/core/theme-metrics.mjs）
function previewHtml(base) { return withShim(base, { dev: true, load: S.loads, ...(S.theme ? { theme: S.theme } : {}), ...(S.previewMode && S.previewMode !== 'talk' ? { query: '?mode=' + S.previewMode } : {}) }, '\n' + RES.hints); }
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
      // 組み立てが約 1 秒を超えたらロゴを描く（舞台は暗いので dark）
      const stopWait = slowWait($('loading'), { tone: 'dark' });
      try {
        const ws0 = S.ws, g0 = S.gen;
        const listing = await S.ws.list();
        engine.setListing(listing); S.sig = signature(listing);
        if (!S.portable) S.deckFile = engine.deckFile() || S.deckFile;
        // 組み立てと判定は Worker で（期限を過ぎれば止めて失敗にする）。理由は Worker が組んだ文書（表示するバイト）から決める
        const r = await builder.build(S.ws, listing, S.deckFile, { dev: true, previewAudio: true, ...themeOpts() }, reasonsPrefix(), { timeout: buildTimeout() });
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
        S.slides = r.slides; S.warn = r.stats.warn.slice(); S.yanked = r.stats.yanked || []; S.themePinned = r.stats.themePinned || []; S.theme = r.theme || null;
        if (S.portable) {
          // 読み取りの知らせと、音声が古い段階（§5.4。作り直さず、消さず、知らせるだけ）
          S.warn.push(...S.portable.warnings);
          // 前の保存（段 A）の知らせ：段階ごと消した口述原稿の音声を消した・行き先のない口述原稿など
          S.warn.push(...(S.portable.saveWarnings || []));
          updateName();
        }
        // 音声が古い段階（フォルダも。音声の板で録り直すか TTS で作り直す）
        const stale = await staleSteps(S.ws).catch(() => []);
        if (S.ws !== ws0 || S.gen !== g0) continue;
        S.stale = stale;
        // 構成案（egatari.json の studio.outline。長い教材を 6 枚ずつ作る途中）：残りがあれば知らせに「次の 6 枚を頼む」
        try { S.outline = outlineOf(await S.ws.readText(FORMAT.CONFIG_FILE, { max: READ_LIMITS.json })); } catch { S.outline = null; }
        if (S.ws !== ws0 || S.gen !== g0) continue;
        for (const k of stale) S.warn.push(T.staleStep(k));
        const changed = r.html !== S.base;
        S.base = r.html; S.baseAudio = r.previewAudio || [];
        S.ranges = new Set([...r.html.matchAll(/ data-src="(\d+-\d+)" data-src-h="[0-9a-f]{8}"/g)].map((m) => m[1]));
        S.preview = true;
        showError(null);
        showWarn();
        slidesPanel.refresh();
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
      } finally { stopWait(); $('viewer').classList.remove('busy'); }
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
$('preview').addEventListener('load', onPreviewLoad);
function showError(err) {
  $('errbox').hidden = !err;
  $('errtext').textContent = err || '';
}
// 組み立ての警告（と保存の警告）の数を、道具の列の「品質チェック」の札に出す（一覧は品質チェックの板の先頭）
// 道具の列の「品質チェック」の札：ブラウザ版の品質チェックの数（エラーと警告）。エラーがあればエラーの色。組み立てと保存の警告は板の先頭の一覧に
// （札には数えない）。品質チェックは、プレビューを読み込み終えたたびに少し待ってから、組み立てが終わっているときだけかける（autoCheck）
function showBadge(errs, warns) {
  const b = $('b-check-badge'), n = errs + warns;
  b.hidden = !n;
  b.textContent = n ? T.checkBadge(errs, warns) : '';
  b.classList.toggle('bad', errs > 0);
  S.badge = { errs, warns };
}
const AUTO_CHECK_MS = 1000;
let autoTimer = 0, autoSeq = 0;
function scheduleAutoCheck() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(autoCheck, (window.__APP_TEST && window.__APP_TEST.autoCheckMs) || AUTO_CHECK_MS);
}
async function autoCheck() {
  if (!S.base || !S.allowed || !S.ws) return;
  if (S.building || S.again || S.frameLoaded !== S.loads) { scheduleAutoCheck(); return; }   // 組み立て・読み込みの途中：終わってから
  const seq = ++autoSeq, ws = S.ws, load = S.loads;
  const results = await checkResults();
  if (seq !== autoSeq || S.ws !== ws || S.loads !== load || !results) return;   // 途中で次の読み込みになった（その読み込みがかけ直す）
  showBadge(results.filter((r) => r.sev === 'error').length, results.filter((r) => r.sev === 'warn').length);
  S.autoChecks = (S.autoChecks || 0) + 1;
}
function showWarn() {
  if (!$('panel').hidden && $('check-panel')) $('check-buildwarn')?.replaceWith(buildWarnBox());
  showNotice();
}
// 組み立ての警告の一覧（見つからないテーマの知らせには「テーマのフォルダを選ぶ…」。前に選んだものがあれば「使う」）
function buildWarnBox() {
  if (!S.warn.length) return el('div', { id: 'check-buildwarn', hidden: '' });
  return el('details', { id: 'check-buildwarn', cls: 'buildwarn', open: '' }, [el('summary', { text: T.checkBuildWarn(S.warn.length) }),
    el('ul', {}, S.warn.map((w) => el('li', { text: w }, THEME_MISSING.test(w) ? [el('div', { cls: 'row theme-warn' }, themeButtons())] : [])))]);
}

// ---------------------------------------------------------------- 利用者のテーマのフォルダ（app/theme-folder.js。読むだけ）
// TF.handle：選んだフォルダ（IndexedDB に残したもの）。TF.state：'granted'（組み立てに渡している）| 'prompt'（次に使うときに許可を求める）| 'denied'。TF.at：選んだ時刻
// TZ.themes：自分のテーマ（app/my-themes.js。中身ごと IndexedDB に残す。今は zip から読み込んだもの）。名前 → {files, at, source, from}。フォルダと同じ名前なら、新しいほうを使う
const TF = { handle: null, state: 'none', at: 0 };
const TZ = { themes: new Map() };
const THEME_MISSING = /^theme not found: "([^"]+)"/;
const missingThemes = (warn) => [...new Set((warn || []).map((w) => (THEME_MISSING.exec(w) || [])[1]).filter(Boolean))];
// 知らせのボタン：前に選んだフォルダがあって許可がまだなら「「名前」を使う」と「ほかのフォルダを選ぶ…」、なければ「テーマのフォルダを選ぶ…」。
// どのブラウザでも「テーマを zip から読み込む…」（フォルダを選べないブラウザではこれだけ）
function themeButtons() {
  const zip = el('button', { type: 'button', id: 'b-theme-zip', cls: SUPPORTED ? '' : 'pri', text: T.themeZipLoad, onclick: () => chooseThemeZip() });
  if (!SUPPORTED) return [zip];
  if (TF.handle && TF.state !== 'granted') return [
    el('button', { type: 'button', id: 'b-theme-allow', cls: 'pri', text: T.themeUse(TF.handle.name), onclick: () => allowThemeFolder() }), ' ',
    el('button', { type: 'button', id: 'b-theme-choose', text: T.themeChange, onclick: () => chooseThemeFolder() }), ' ', zip];
  return [el('button', { type: 'button', id: 'b-theme-choose', cls: TF.handle ? '' : 'pri', text: TF.handle ? T.themeChange : T.themeChoose, onclick: () => chooseThemeFolder() }), ' ', zip];
}
// 組み立てに渡す作業場所：許可のあるテーマのフォルダと zip のテーマ（どちらもなければ null）
function userThemesWs() {
  const f = TF.handle && TF.state === 'granted' ? themeFolderWorkspace(TF.handle) : null;
  return TZ.themes.size ? mergedThemeWorkspace(f, TF.at, TZ.themes) : f;
}
// 組み立てに渡す（null で使わない）。開いているデッキがあれば組み直す
async function useThemeFolder(h, again = true) {
  const w = userThemesWs();
  engine.setThemeWorkspace(w); builder.setThemes(w);
  if (h) TF.state = 'granted'; else if (!TF.handle) TF.state = 'none';
  showThemeState();
  if (again && S.ws) await rebuild('themes');
}
// zip とフォルダの両方にある名前（知らせ用）
async function folderClash(names) {
  if (!(TF.handle && TF.state === 'granted')) return [];
  let have = [];
  try { have = await themeNames(TF.handle); } catch { have = []; }
  return names.filter((n) => have.includes(n));
}
// テーマの zip を読み込む（どのブラウザでも）。中身はこのブラウザに残す。同じ名前のテーマは今読み込んだものに替わる
async function chooseThemeZip() {
  let file;
  try { file = await ((window.__APP_TEST && window.__APP_TEST.themeZipPicker) || pickZipFile)(); } catch { file = null; }
  if (!file) return false;
  const zn = String(file.name || 'theme.zip');
  let themes;
  try { themes = await readThemeZip(await readFileBounded(file, { max: THEME_ZIP_LIMITS.zipBytes, what: zn }), zn); }
  catch (e) {
    const k = themeZipErrorKind(e);
    toast(k === 'too-large' ? T.themeZipTooLarge(zn) : k === 'no-theme' ? T.themeZipEmpty(zn) : k === 'refused' ? T.themeZipRefused(zn, e.entry, e.why) : T.themeZipBroken(zn), true);
    return false;
  }
  const at = Date.now(), names = [...themes.keys()];
  for (const [n, files] of themes) TZ.themes.set(n, (await putMyTheme(n, files, { source: 'zip', from: zn, at })) || { files, at, source: 'zip', from: zn });
  const clash = await folderClash(names);
  toast(T.themeZipLoaded(zn, names) + (clash.length ? ' ' + T.themeClash(clash, 'zip') : ''));
  await useThemeFolder(null);
  return true;
}
async function forgetMyThemesUi() {
  await forgetMyThemes();
  TZ.themes.clear();
  toast(T.themeMineForgot);
  await useThemeFolder(null);
}
async function chooseThemeFolder() {
  if (!SUPPORTED) { toast(T.unsupported, true); return false; }
  let h;
  try { h = await ((window.__APP_TEST && window.__APP_TEST.themePicker) || ((o) => window.showDirectoryPicker(o)))({ id: 'egatari-themes', mode: 'read' }); }
  catch (e) { if (e && e.name !== 'AbortError') toast(String(e.message || e), true); return false; }
  if (!h || h.kind !== 'directory') return false;
  if ((await permissionOf(h)) !== 'granted' && !(await requestRead(h))) { toast(T.themeNoPermission, true); return false; }
  let names = [];
  try { names = await themeNames(h); } catch { /* 読めない */ }
  if (!names.length) { toast(T.themeEmpty(h.name), true); return false; }
  TF.handle = h; TF.state = 'granted'; TF.at = Date.now();
  await saveThemeFolder(h, TF.at);
  const clash = names.filter((n) => TZ.themes.has(n));
  toast(T.themeChosen(h.name, names.length) + (clash.length ? ' ' + T.themeClash(clash, 'folder') : ''));
  await useThemeFolder(h);
  return true;
}
// 前に選んだフォルダ：読む許可をもう一度求める（人の操作の中で）
async function allowThemeFolder() {
  if (!TF.handle) return chooseThemeFolder();
  if (!(await requestRead(TF.handle))) { TF.state = await permissionOf(TF.handle); toast(T.themeNoPermission, true); showNotice(); return false; }
  TF.state = 'granted';
  await useThemeFolder(TF.handle);
  return true;
}
async function forgetTheme() {
  await forgetThemeFolder();
  TF.handle = null; TF.state = 'none'; TF.at = 0;
  toast(T.themeForgot);
  await useThemeFolder(null);
}
function showThemeState() {
  const st = $('w-themes-state');
  if (st) st.textContent = [TF.handle ? T.themeFolderNow(TF.handle.name, TF.state === 'granted') : '', TZ.themes.size ? T.themeMineNames([...TZ.themes.keys()].sort()) : ''].filter(Boolean).join(' ');
  if (!$('welcome').hidden || !S.ws) return;
  showNotice();
}
// 設定の窓（「開く ▾」の「テーマのフォルダ…」・はじめの画面）：今のフォルダとテーマの名前、替える・忘れる。zip のテーマ：読み込む・忘れる
async function themeDialog() {
  const zipNames = [...TZ.themes.keys()].sort();
  let names = null;
  if (TF.handle && TF.state === 'granted') { try { names = await themeNames(TF.handle); } catch { names = null; } }
  const v = await ask({ title: T.themeFolderTitle, body: [
    el('p', { text: T.themeFolderLead }),
    el('p', { id: 'theme-now', cls: 'note', text: TF.handle ? T.themeFolderNow(TF.handle.name, TF.state === 'granted') : T.themeFolderNone }),
    names ? el('p', { id: 'theme-names', cls: 'hint', text: T.themeFolderNames(names) }) : null,
    el('p', { cls: 'hint', text: T.themeFolderKeep }),
    el('p', { id: 'theme-mine-names', cls: 'note', text: T.themeMineNames(zipNames) }),
    el('p', { cls: 'hint', text: T.themeMineKeep })],
  buttons: [...(TF.handle ? [{ id: 'forget', label: T.themeForget }] : []),
    ...(zipNames.length ? [{ id: 'forget-mine', label: T.themeMineForget }] : []),
    ...(TF.handle && TF.state !== 'granted' ? [{ id: 'allow', label: T.themeUse(TF.handle.name) }] : []),
    ...(SUPPORTED ? [{ id: 'choose', label: TF.handle ? T.themeChange : T.themeChoose }] : []),
    { id: 'zip', label: T.themeZipLoad },
    { id: 'close', label: T.close, pri: true }] });
  if (v === 'forget') await forgetTheme();
  else if (v === 'forget-mine') await forgetMyThemesUi();
  else if (v === 'zip') await chooseThemeZip();
  else if (v === 'allow') await allowThemeFolder();
  else if (v === 'choose') await chooseThemeFolder();
}
// 新規作成の ② テーマの選択肢：同梱のテーマ（見せる名前）と、読む許可のある自分のテーマのフォルダ・zip のテーマ（theme.json の title・name、なければフォルダの名前）
async function themeOptions() {
  const out = RES.themes.map((t) => ({ value: t, label: (T.themeNames && T.themeNames[t]) || t }));
  const w = userThemesWs();
  if (w) {
    let names = [];
    try { names = await themeNamesOf(w); } catch { names = []; }
    for (const n of names) if (!out.some((x) => x.value === n)) out.push({ value: n, label: await themeLabelOf(w, n), user: true });
  }
  return out;
}
// 起動時：前に選んだフォルダを IndexedDB から。許可が残っていれば（同じページの間など）すぐ使い、なければ次に使うときに求める
async function initThemeFolder() {
  const h = await loadThemeFolder();
  TF.handle = h;
  TF.state = h ? await permissionOf(h) : 'none';
  TF.at = h ? await loadThemeFolderAt() : 0;
  TZ.themes = await loadMyThemes();
  await useThemeFolder(TF.state === 'granted' ? h : null, false);
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
  volatileComments: () => !!S.portable,
  beforeEdit: (kind) => beforeEditing(kind),
  reload: async () => { await rebuild('reload'); loadFrame(); },
  extra: { open: () => audio.isOpen(), editing: () => audio.isBusy() || rec.isOpen() },
  // Esc で閉じる窓（#48）：音声の板と横の板（品質チェック・警告・添付・使い方）。開いた順は ui.mark で
  panels: () => [{ name: 'audio', isOpen: () => audio.isOpen() && !audio.isBusy(), close: () => audio.toggle(false) },
    { name: 'rec', isOpen: () => rec.isOpen(), close: () => rec.close() },
    { name: 'panel', isOpen: () => !$('panel').hidden, close: () => closePanel() }],
  onPos: () => audio.onPos(),
  onRecord: () => { rec.open().then((on) => { if (on) ui.mark('rec', true); }); },
});
// 音声の板（app/audio-panel.js）：信頼する横の板の中。マイク・TTS はこのページだけで動き、プレビューからは何も受け取らない
const tts = createTtsClient({
  lang: EN ? 'en' : 'ja', test: () => window.__APP_TEST && window.__APP_TEST.tts,
  helperUrl: () => (window.__APP_TEST && window.__APP_TEST.ttsHelper) || 'lab/tts-helper.html',
  // 初めて TTS の窓を開く前に：何を取得するか（大きさ）と、窓に渡すもの（読む文と声の名前だけ）を見せて確かめる
  confirm: async (label) => (await ask({ title: T.ttsTitle, body: [el('p', { id: 'tts-what', text: label }), el('p', { cls: 'hint', text: T.ttsPrivacy })],
    buttons: [{ id: 'cancel', label: T.cancel }, { id: 'ok', label: T.ttsGo, pri: true }] })) === 'ok',
});
// 教材の識別子（docId）：1 ファイルは索引、作業フォルダは設定のファイル（まだなければ null）。Colab の往復で別の教材の zip を取り違えないために使う
async function colabDocId() {
  if (S.portable) return typeof S.portable.index.docId === 'string' ? S.portable.index.docId : null;
  try { const c = JSON.parse((await S.ws.readText(FORMAT.CONFIG_FILE, { max: READ_LIMITS.json })) || 'null'); return c && typeof c.docId === 'string' ? c.docId : null; } catch { return null; }
}
// 台本を書き出した教材の題（別の教材の音声を取り込もうとしたときの断り書きに使う）
async function colabTitle() {
  if (S.portable) return S.portable.index.metadata?.title || S.portable.index.title || (S.base ? titleOf(S.base) : '') || null;
  try { const c = JSON.parse((await S.ws.readText(FORMAT.CONFIG_FILE, { max: READ_LIMITS.json })) || 'null'); if (c && c.metadata && typeof c.metadata.title === 'string' && c.metadata.title) return c.metadata.title; } catch { /* 題はなくてもよい */ }
  return S.base ? titleOf(S.base) || null : null;
}
const audio = createAudioPanel({
  ui, lang: EN ? 'en' : 'ja', tts, yomi: RES.yomi || null,
  loadMp3: () => loadLame({ test: () => window.__APP_TEST && window.__APP_TEST.mp3 }),
  ws: () => S.ws, generation: () => S.gen,
  deckLang: () => (S.base && /<html[^>]*\slang="([^"]*)"/.exec(S.base)?.[1]) || (EN ? 'en' : 'ja'),
  beforeOpen: () => beforeEditing('audio'),
  beforeTts: (keys) => leftoverGate('tts', keys),   // 雛形の仮の行（✎）のままの段階を、TTS の前に見せる
  // 音声の板の「● 録音 (r)」：その段階で録音モードを開く（録り方は録音モードだけ。#82。ツールバーには置かない：1 行に収まらなくなる）
  recMode: { title: T.recTip, open: (opts) => rec.open(opts).then((on) => { if (on) ui.mark('rec', true); }) },
  beforeWrite: async () => {
    if (!S.portable) return null;
    if (S.portable.readOnly) return T.readOnlyNoEdit;
    return (await ensureRights()) ? null : T.rightsDeclined;   // 音声は段 A の場所（段 A の編集だけの文書でも直せる）
  },
  afterWrite: async () => { await rebuild('save'); updateName(); },
  // TTS が約 1 秒を超えたら（モデルの取得・合成）、隅にロゴを描く（画面は止めない）
  wait: () => slowWait($('wait-badge')),
  // Colab で音声を作る（WebGPU のない PC）：原稿の文が Google の環境で処理されるので、書き出す前に 1 度確かめる
  colab: {
    t: T.colab, version: RES.version,
    docId: colabDocId, title: colabTitle,
    confirm: async (title, body, go) => (await ask({ title, body: [el('p', { id: 'colab-privacy', text: body })], buttons: [{ id: 'cancel', label: T.cancel }, { id: 'ok', label: go, pri: true }] })) === 'ok',
  },
});
// 録音モード（app/rec-mode.js）：キーボードだけで段階ごとに録る。信頼する編集の画面の中の幅広い板（プレビューは横に細くして、その段階の舞台を見せる）。
// 音声の板（audio）の peek / commit / revert を通すので、書き方（audio/manifest.json・権利の確認・前に戻す）は音声の板と同じ
const rec = createRecMode({
  ui, panel: audio, T: T.rec, host: $('deck'), top: $('top'),
  ws: () => S.ws, generation: () => S.gen,
  slideIndex: (key) => { const i = (S.slides || []).findIndex((x) => x.key === key); return i < 0 ? null : i; },
  enabled: () => !!(S.ws && S.base && !$('deck').hidden),
  beforeOpen: () => beforeEditing('audio'),
  // 1 つのテイクの上限（既定 600 秒）。試験だけ短くできる
  maxSeconds: () => (window.__APP_TEST && window.__APP_TEST.recMaxSeconds) || null,
});
// 添付の板（app/attachments-panel.js。§3.8）：横の板（#panel）に、作業場所の attachments/ と設定のファイルの役割・題。添付は開かない
const attach = createAttachPanel({
  lang: EN ? 'en' : 'ja', el, ask, toast, ws: () => S.ws, generation: () => S.gen,
  // 「ファイル ▾」の「教材の情報…」：題・ライセンス・作り手の下に、添付の板
  openPanel: (title, body) => openPanel(T.infoTitle, [infoSection(), el('h3', { cls: 'info-h', text: title }), ...[].concat(body)]), isOpen: () => !$('panel').hidden && !!$('attach-panel'),
  beforeWrite: async () => {
    if (!S.portable) return null;
    if (S.portable.readOnly) return T.readOnlyNoEdit;
    return (await ensureRights()) ? null : T.rightsDeclined;   // 添付は段 A の場所（段 A の編集だけの文書でも直せる）
  },
  afterWrite: async () => { await rebuild('save'); updateName(); },
});
let liveHost = null;
// 授業の部屋を付けて配る（app/live-panel.js。拡張 live）。「参加者用（再生のみ）…」の窓の「ライブ（質問・投票）を付ける」で、その窓の中に出す：横の板に、部屋・鍵・窓・活動。この画面はつながらない。教材に残すのは鍵のない設定だけ
const livePanel = createLivePanel({
  lang: EN ? 'en' : 'ja', el, toast, ws: () => S.ws, generation: () => S.gen,
  // 「参加者用（再生のみ）…」の窓の中に出す（liveHost）
  openPanel: (title, body) => { if (liveHost) liveHost.replaceChildren(...[].concat(body).filter(Boolean)); else openPanel(title, body); },
  isOpen: () => !!$('live-panel'), embedded: () => !!liveHost,
  portable: () => !!S.portable,
  beforeWrite: async () => {
    if (!S.portable) return null;
    if (S.portable.readOnly) return T.readOnlyNoEdit;
    return (await ensureRights()) ? null : T.rightsDeclined;
  },
  afterWrite: async () => { await rebuild('save'); updateName(); },
  currentStep: () => (S.pos && typeof S.pos.key === 'string' ? S.pos.key : null),
  // 授業の部屋の結果を取り込む：添付の板を開いて、そこで確かめて足す（一覧に要約が出る）
  importResults: async (file) => { await attach.open(); await attach.importLive(file); },
  stepKeys: async () => {
    const keys = (S.slides || []).map((x) => x.key + ':0');
    try { for (const g of parseNarration(await S.ws.readText('narration.md', { max: READ_LIMITS.json }))) keys.push(`${g.slideKey}:${g.stepKey}`); } catch { /* 口述原稿なし */ }
    return [...new Set(keys)];
  },
  slides: () => (S.slides || []).map((x) => ({ key: x.key, heading: x.heading || '' })),
  exportLive: (live, opts) => exportPlayOnlyFile(live, opts),
  problemText: T.liveProblem,
});
// スライド一覧（app/slides-panel.js。backlog #79）：左の板。足す・複製・削除・並べ替えは原稿・口述原稿・音声の記録を書き、組み直す（段 B）
// 1 ファイルの段 A の保存はスライドの原稿の変更を断る（kit/core/tier-a.mjs の source-changed）ので、次の「保存」は組み直しになる
async function slideGuard() {
  if (!S.ws || !S.base) return T.sl.notReady;
  if (S.portable && S.portable.readOnly) return T.readOnlyNoEdit;
  if (S.portable && S.portable.tierAOnly) return T.tierAOnlyNoSlides;
  if (ui.busy() || audio.isBusy() || rec.isOpen()) return T.sl.editing;
  if (S.portable && !(await ensureRights())) return T.rightsDeclined;
  return null;
}
const slidesPanel = createSlidesPanel({
  T: T.sl, el, host: $('slides'),
  lang: (src) => { const m = /<html\b[^>]*\slang\s*=\s*["']?([A-Za-z-]+)/i.exec(src || ''); return m && !/^ja\b/i.test(m[1]) ? 'en' : 'ja'; },
  ws: () => S.ws, generation: () => S.gen, deckFile: () => S.deckFile,
  slides: () => S.slides || [], pos: () => S.pos,
  go: (i) => { const f = $('preview').contentWindow; if (f && S.allowed) f.postMessage({ type: 'app-go', i, k: 0 }, '*'); },
  goAfter: (i) => ui.goIndex(i, 0),
  // 縮図の文書：プレビューと同じ決まり（CSP）の先頭部分＋縮図の仲立ち＋組んだデッキ。デッキのコードを動かしてよいとき（S.allowed）だけ
  thumbsDoc: (cfg) => (S.allowed && S.base ? previewDocument(S.base, `${SHIM}(${enc({ strip: cfg })});`) : null),
  guard: slideGuard, building: () => S.building,
  rebuild: async () => { const failed = await rebuild('save'); updateName(); return failed; },
  check: () => quickCheck(), ask, toast, audio, stale: () => S.stale || [],
  aiInsert: (after) => llm.insertWithAi(after),
  onToggle: (on, byUser) => { const b = $('b-slides'); b.setAttribute('aria-expanded', on ? 'true' : 'false'); if (!on && byUser) b.focus(); },
});
// 信頼する編集の板（#dev-side：編集モードの札・原稿の欄・コメント・口述原稿）は、プレビューの隣、横の板（#panel）の前に置く
new MutationObserver(() => { const d = $('dev-side'), p = $('panel'); if (d && d.nextSibling !== p) $('deck').insertBefore(d, p); }).observe($('deck'), { childList: true });
{ const d = $('dev-side'), p = $('panel'); if (d && d.nextSibling !== p) $('deck').insertBefore(d, p); }
window.addEventListener('message', (e) => {
  const m = e.data || {};
  const frame = $('preview').contentWindow;
  if (e.source === frame) {
    ui.message(e);
    // デッキの p：開いていれば閉じる（kit/deck.js と同じ入り切り。発表者ビューから抜けられないとき、本体の窓に戻って p）
    if (m.type === 'app-open-presenter') { if (S.presWin && !S.presWin.closed) closePresenter(); else openPresenter(); }
    else if (m.type === 'app-check-result' && S.checks.has(m.id)) {
      const w = S.checks.get(m.id);
      if (m.load === w.load && w.load === S.loads) { S.checks.delete(m.id); w.res(Array.isArray(m.results) ? m.results : []); }
    }
    else if (typeof m.type === 'string' && /^deck-/.test(m.type)) {
      if (m.type === 'deck-pos') { S.pos = m; slidesPanel.onPos(); }
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
function closeMe(){
  if(document.fullscreenElement){ if(document.exitFullscreen) document.exitFullscreen().catch(function(){}); return; }
  try{ if(opener&&!opener.closed) opener.focus(); }catch(e){}
  window.close();
}
function into(){ try{ f.focus(); f.contentWindow&&f.contentWindow.focus(); }catch(e){} }
f.addEventListener("load",function(){ into(); setTimeout(function(){ if(!document.hasFocus()&&f.contentWindow) f.contentWindow.postMessage({type:"app-pres-tap"},"*"); },300); });
addEventListener("focus",function(){ if(document.activeElement===f||document.activeElement===document.body) into(); });
addEventListener("keydown",function(e){
  if(e.target!==f&&!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&(e.key==="Escape"||e.key==="p")){ if(e.key==="p"||!document.fullscreenElement) e.preventDefault(); closeMe(); }
});
addEventListener("message",function(e){
  if(e.source===f.contentWindow&&e.data&&e.data.type==="app-pres-close"){ closeMe(); return; }
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
  ui.mark('panel', true);
  const b = $('panel-body'); b.innerHTML = ''; b.append(...[].concat(body));
}
function closePanel() { $('panel').hidden = true; }
$('panel-close').onclick = closePanel;

// 今の読み込み（S.loads）のプレビューに頼む。組み直し・読み込み直しの途中（置き換えの直後など）は、その読み込みが終わるのを待ってから送る。
// 読み込み中の iframe に送った頼みは前の文書に届いて消えるので、答えの来ないうちに読み込みが替わったら、新しい文書に送り直す
// （答えは頼んだ読み込みのものだけを受け取る。期限は全体で 20 秒）
const CHECK_MS = 20000;
async function askCheck() {
  const t0 = Date.now(), tick = () => new Promise((r) => setTimeout(r, 50));
  while (Date.now() - t0 < CHECK_MS) {
    if (S.building || !S.allowed || !S.loads || S.frameLoaded !== S.loads) { await tick(); continue; }
    const f = $('preview').contentWindow, load = S.loads, id = 'q' + Date.now() + '-' + load;
    if (!f) { await tick(); continue; }
    const got = new Promise((res) => S.checks.set(id, { res, load }));
    f.postMessage({ type: 'app-check', id }, '*');
    for (;;) {
      const r = await Promise.race([got, tick().then(() => undefined)]);
      if (r !== undefined) return r;
      if (S.loads !== load || Date.now() - t0 >= CHECK_MS) break;   // 読み込みが替わった（新しい文書に送り直す）・期限
    }
    S.checks.delete(id);
  }
  return null;
}
// 品質チェックの結果を集める（板には出さない。「修正…」の修正依頼も使う）。プレビューが答えなければ null
async function checkResults() {
  if (!$('preview').contentWindow || !S.base) return null;
  const results = await askCheck();
  if (!results) return null;
  results.push(...(await llm.extraChecks()));   // 読みの指定（narration.md の元の文字列から。app/llm.js）
  // 雛形のまま（スライド一覧の雛形の字・仮の口述原稿「✎ 」。kit/core/template-text.mjs。kit/check.mjs と同じ）：作業場所の原稿から
  {
    const left = await leftovers();
    const title = (i) => (i === null || !S.slides[i] ? '' : S.slides[i].heading || '');
    for (const x of left.slides) results.push({ sev: 'warn', code: 'templateText', arg: x.texts.join('」「'), i: x.index, title: title(x.index) });
    for (const p of left.steps) { const i = (S.slides || []).findIndex((x) => x.key === p.slideKey); results.push({ sev: 'warn', code: 'narrPlaceholder', arg: p.stepKey, i: i < 0 ? null : i, title: title(i < 0 ? null : i) }); }
  }
  // 音声が古い段階（§5.4）：この画面が作業場所から決めたもの（プレビューの答えではない）
  for (const k of S.stale || []) { const sk = k.slice(0, k.lastIndexOf(':')), i = (S.slides || []).findIndex((x) => x.key === sk); results.push({ sev: 'warn', code: 'audioStale', arg: k, i: i < 0 ? null : i, title: i < 0 ? '' : S.slides[i].heading || '' }); }
  return results;
}
async function quickCheck() {
  if (!$('preview').contentWindow || !S.base) return;
  openPanel(T.checkTitle, [el('p', { id: 'check-panel', text: T.checking }), buildWarnBox()]);
  const results = await checkResults();
  const f = $('preview').contentWindow;
  if (!results) { openPanel(T.checkTitle, [el('p', { id: 'check-panel', text: T.checkFailed }), buildWarnBox()]); return; }
  const errs = results.filter((r) => r.sev === 'error').length, warns = results.filter((r) => r.sev === 'warn').length;
  showBadge(errs, warns);
  const items = results.map((r) => el('div', { cls: 'res ' + r.sev, onclick: () => { if (r.i !== null) f.postMessage({ type: 'app-go', i: r.i, k: 0 }, '*'); } }, [
    el('span', { cls: 'sev', text: r.sev === 'error' ? T.sevError : T.sevWarn }),
    el('span', { text: T.checkMsg(r.code, r.arg) }),
    el('div', { cls: 'where', text: r.i === null ? T.wholeDeck : T.slideN(r.i + 1, r.title) }),
  ]));
  openPanel(T.checkTitle, [
    el('div', { id: 'check-panel', cls: 'sum', text: T.checkSummary(errs, warns) }),
    buildWarnBox(),
    el('p', { cls: 'hint', text: T.checkNote(llm.texts.fix, results.length > 0) }),
    // 修正…（チャットの AI に直してもらう。app/llm.js）：結果がなくても出す（① に直してほしいことを書ける）。道具の列は 1 行に収める決まりなので、ここに置く
    el('div', { cls: 'fixrow' }, [llm.reviseButton(), ...(results.length ? [llm.fixButton(results)] : [])]),
    ...items,
  ]);
}
// ---------------------------------------------------------------- 雛形のまま（kit/core/template-text.mjs）：品質チェック・TTS の前・書き出しの前
// 作業場所の原稿（deck.html）と口述原稿から、スライド一覧の雛形の字と仮の口述原稿の行（「✎ 」）を探す。読めなければ何もないことにする
async function leftovers() {
  if (!S.ws) return { steps: [], slides: [] };
  let deck = null, narr = null;
  try { deck = await S.ws.readText(S.deckFile, { max: READ_LIMITS.source }); } catch { deck = null; }
  try { narr = await S.ws.readText('narration.md', { max: READ_LIMITS.narration }); } catch { narr = null; }
  try { return draftLeftovers(deck, narr); } catch { return { steps: [], slides: [] }; }
}
// 見せて、続けるかを聞く（kind：'tts' | 'export'。keys：TTS で作る段階の鍵（null ならすべて））。何もなければ聞かずに true
async function leftoverGate(kind, keys = null) {
  const L = await leftovers();
  const want = keys ? new Set(keys) : null;
  const steps = L.steps.filter((p) => !want || want.has(`${p.slideKey}:${p.stepKey}`));
  const slides = kind === 'export' ? L.slides : [];
  if (!steps.length && !slides.length) return true;
  const idx = (key) => (S.slides || []).findIndex((x) => x.key === key);
  const head = (i) => (i >= 0 && S.slides[i] ? S.slides[i].heading || '' : '');
  const lines = [
    ...slides.map((x) => T.leftSlide(x.index + 1, head(x.index), x.texts)),
    ...steps.map((p) => { const i = idx(p.slideKey); return T.leftStep(i + 1, head(i), p.stepKey, p.text); }),
  ];
  const MAX = 8;
  const v = await ask({ title: kind === 'tts' ? T.leftTitleTts : T.leftTitleExport, kind: 'warn', body: [
    el('p', { id: 'left-lead', text: kind === 'tts' ? T.leftLeadTts : T.leftLeadExport }),
    el('ul', { id: 'left-list' }, [...lines.slice(0, MAX).map((t) => el('li', { text: t })), ...(lines.length > MAX ? [el('li', { text: T.leftMore(lines.length - MAX) })] : [])]),
    el('p', { cls: 'hint', text: T.leftHint })],
  buttons: [{ id: 'cancel', label: T.cancel, pri: true }, { id: 'go', label: kind === 'tts' ? T.leftGoTts : T.leftGoExport }] });
  return v === 'go';
}
function showHelp() {
  const h = T.help;
  // 作業フォルダ・1 ファイル・再生専用・組み立てた HTML の違い（最初の画面から移した）
  const kinds = el('table', { id: 'help-kinds', cls: 'kinds' }, [['kindFolder', 'kindFolderText'], ['kindFile', 'kindFileText'], ['kindPlay', 'kindPlayText'], ['kindBuilt', 'kindBuiltText']]
    .map(([k, t]) => el('tr', {}, [el('th', { scope: 'row', text: T[k] }), el('td', { text: T[t] })])));
  openPanel(T.helpTitle, [
    el('h3', { text: T.kindsTitle }), kinds,
    ...h.map(([title, lines]) => [el('h3', { text: title }), el('ul', {}, lines.map((l) => { const li = el('li'); li.innerHTML = l; return li; }))]).flat(),
    el('p', { id: 'help-format', cls: 'muted', text: T.helpFormat(RES.specSnapshot) }),   // 従う仕様の版（vendor/egatari-spec/SOURCE.json の snapshot。ビルド時に読む）
    modelCacheSection({ el, EN, ask, toast }),   // ブラウザの TTS のモデル：使用量と「モデルを消す」（app/model-cache-ui.js）
  ]);
}

// ---------------------------------------------------------------- 書き出し
// 「組み立てた HTML」（再生だけの .html）は編集アプリからは外した（コマンドの node kit/build.mjs に残す。ui-redesign）
const deckBase = () => (S.deckFile || 'deck').split('/').pop().replace(/\.html?$/i, '');

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
// validate(id)：押したボタンで閉じてよいか（false なら開いたまま。「参加者用（再生のみ）…」のライブの直すことなど）
function ask({ title, body, buttons, confirmText = null, kind = '', validate = null }) {
  if (askPending) { const r = askPending; askPending = null; r('cancel'); }
  wait.pause();
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
      const btn = el('button', { type: 'button', id: 'dlg-' + x.id, cls: x.pri ? 'pri' : '', text: x.label, onclick: async () => { if (validate && !(await validate(x.id))) return; if (askPending === resolve) d.close(x.id); } });
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
// key：言葉を選ぶ鍵（既定は code。索引のない文書は、何かで分ける：'play-only'・'built-output'。sourceKind）
function refusal(code, message, key = code) {
  return [el('p', { id: 'refuse-reason', 'data-kind': key, text: T.refuse(key) }), el('pre', { cls: 'tech', text: `[${code}] ${message}` })];
}
// 索引のない文書の、知らせの言葉の鍵（kit/core/portable.mjs の sourceKind：'play-only' | 'built' | 'source' | 'other'）
const noSourceKey = (e) => (e.code !== 'no-source' ? e.code : e.kind === 'play-only' ? 'play-only' : e.kind === 'built' ? 'built-output' : 'no-source');
// input：{handle?: FileSystemFileHandle, file?: File, bytes?: Uint8Array, name?, fresh?（AI の返事を貼り付けて作った文書：権利の確認を出さない）, replacing?（今の文書を置き換える）}（app/llm.js）
async function openPortable(input) {
  if (!input) return false;
  const end = wait.begin();
  try { return await openPortableNow(input); } finally { end(); }
}
async function openPortableNow(input) {
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
    // File は app/bounded-read.js で：File.size を読む前に、読んだ後も実際のバイト数を上限と比べる（大きさは見積もり）
    bytes = input.bytes ? new Uint8Array(input.bytes) : await readFileBounded(file, { max: LIMITS.fileBytes, what: name });
  } catch (e) { toast(T.cannotReadFile + ': ' + (e.message || e), true); return false; }
  // replacing：AI の返事で今の文書を置き換える（今の作業場所の中身から作ったので、保存していない変更も入っている。app/llm.js）
  if (!input.replacing && !(await leavePortable())) return false;
  status(T.reading(name));
  let r;
  const readerTimeout = (window.__APP_TEST && window.__APP_TEST.readerTimeout) || undefined;
  try { r = await readInWorker(bytes, { timeout: readerTimeout }); }
  catch (e) {
    status('');
    // 知らない major の版・知らない必須の機能：編集も書き出し（作り直し）もしないが、1.x の規則で索引と塊が検査を通れば原稿をフォルダに
    // 取り出せる（§7.1・§3.5・§9.3。取り出しは書き出しではない）。通らなければ取り出しも断る
    // デッキの原稿（deck.html）：断らずに、フォルダを開くか、このファイルだけを開くかを聞く
    if (e.code === 'no-source' && e.kind === 'source') return openSource(name, bytes);
    const extract = (e.code === 'unsupported-version' || e.code === 'unknown-feature') && !!window.showDirectoryPicker;
    // 組んだ発表の HTML（out/deck.html）：原稿のフォルダを開ける
    const folder = e.code === 'no-source' && e.kind === 'built' && SUPPORTED;
    const v = await ask({ title: T.cannotOpenFile(name), kind: 'warn', body: refusal(e.code, e.message, noSourceKey(e)),
      buttons: [...(extract ? [{ id: 'extract', label: T.exportFolder }] : []), ...(folder ? [{ id: 'folder', label: T.sourceFolder }] : []), { id: 'ok', label: T.ok, pri: true }] });
    if (v === 'folder') { const h = await pickFolder(); return h ? openFolder(h) : false; }
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
  const P = { index: r.index, deckMeta: r.deckMeta, name, handle, warnings: r.warnings, readOnly: null, tierAOnly: null, rightsOk: !!input.fresh, extended, mislabelled, codeReasons: reasons, codeOk: true, saved: null,
    neverSaved: !!input.fresh && !handle && !(input.replacing && S.portable && !S.portable.neverSaved),   // AI の返事を貼り付けて作った：まだどのファイルにもない
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
      const probs = registryProblems(r.index, dry.index, dry.registryEquivalent);
      if (probs.length) { P.tierAOnly = T.roRegistry(probs.join('; ')); P.tierAReg = true; }
      P.yankedRecorded = dry.yanked || [];
      // 記録した版の同梱のテーマ（themes.lock.json）：プレビューと書き出しも、その版で組む（黙って新しい色にしない。「テーマを更新」で今の版に）
      P.themePins = dry.themeVersions && Object.keys(dry.themeVersions).length ? dry.themeVersions : null;
    } catch (e) { P.readOnly = T.roBuild(String(e.message || e)); }
  }
  if (P.tierAOnly && !r.sourceMatches && !P.readOnly) P.readOnly = T.roNoTier(P.tierAOnly);
  if (handle) recentAdd(handle);   // ファイルのハンドルがあれば「最近開いたもの」に（Safari などで <input> から開いたものにはない）
  showDeck(name, name);
  await rebuild('open');
  return true;
}

// ---------------------------------------------------------------- デッキの原稿（deck.html）を 1 つだけ開く
// 「ファイルを開く」・ドロップで原稿の deck.html が来たとき：口述原稿・音声・そのデッキだけの部品は同じフォルダにあるので、
// フォルダを開くか、このファイルだけを開くかを聞く。このファイルだけ：メモリの上の作業場所（deck.html だけ）を Worker で持ち運べる
// 1 ファイルにし（AI の返事の貼り付けと同じ。app/llm.js）、ほかの開いたファイルと同じ道（openPortable：中身からコードを探して、あれば
// 動かす前に確かめる）で開く。部品庫の部品とテーマは使え、そのデッキだけの部品がなければ組み立ての知らせに出る。新しい docId で、
// どこにも保存していない（保存で、1 ファイルか空のフォルダかを選ぶ）
async function openSource(name, bytes) {
  const v = await ask({ title: T.sourceTitle(name), body: [el('p', { id: 'source-lead', text: T.sourceLead }), el('p', { cls: 'hint', text: T.sourceHint })],
    buttons: [{ id: 'cancel', label: T.cancel }, { id: 'only', label: T.sourceOnly }, ...(SUPPORTED ? [{ id: 'folder', label: T.sourceFolder, pri: true }] : [])] });
  if (v === 'folder') { const h = await pickFolder(); return h ? openFolder(h) : false; }
  if (v !== 'only') return false;
  status(T.building);
  let html;
  try { html = (await builder.exportHtml(memoryWorkspace('deck', { 'deck.html': bytes }), 'deck.html', {}, { timeout: buildTimeout() })).html; }
  catch (e) {
    status('');
    await ask({ title: T.cannotOpenFile(name), kind: 'warn', body: refusal(e.code || 'error', String((e && e.message) || e)), buttons: [{ id: 'ok', label: T.ok, pri: true }] });
    return false;
  }
  status('');
  // 未保存の変更は、このファイルを読む前に確かめた（openPortable）ので、ここでは聞き直さない（replacing）
  const ok = await openPortable({ bytes: new TextEncoder().encode(html), name: name.replace(/\.html?$/i, '') + FORMAT.FILE_EXT, fresh: true, replacing: true });
  if (!ok) return false;
  S.portable.sourceOnly = true;
  // 保存するまでどこにも書いていない（「保存していない変更」にする）
  try { await S.ws.writeText('deck.html', (await S.ws.readText('deck.html', { max: READ_LIMITS.source })) || ''); } catch { /* 無視 */ }
  updateName(); showNotice();
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
  // deck.html だけを開いて、まだどこにも保存していない：1 ファイルに保存するか、空のフォルダに書き出すかを選ぶ
  if (P.sourceOnly && !P.handle && mode === 'save') {
    const v = await ask({ title: T.saveWhereTitle, body: [el('p', { id: 'save-where', text: T.saveWhereLead })],
      buttons: [{ id: 'cancel', label: T.cancel }, ...(window.showDirectoryPicker ? [{ id: 'folder', label: T.saveToFolder }] : []), { id: 'file', label: T.saveAsFile, pri: true }] });
    if (!live()) { cancelled(); return; }
    if (v === 'folder') { await exportFolder(ws); return; }
    if (v !== 'file') return;
  }
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
    // docId と metadata.derivedFrom だけを変える（ほかの項目はバイトのまま。kit/core/config-file.mjs）
    const old = files.has(CFG) ? new TextDecoder().decode(files.get(CFG)) : null;
    try { cfgText = updateConfig(old, { docId: identity.docId, metadata: configMerge({ derivedFrom: identity.derivedFrom }) }); }
    catch (e) { status(''); toast(String((e && e.message) || e), true); return; }
    files.set(CFG, new TextEncoder().encode(cfgText));
  }
  let html, index, deckMeta, tier, narrB = null;
  try {
    const a = await tierA(P.original, files, { identity, fonts: engine.fonts });
    if (!live()) { cancelled(); return; }
    if (a.ok) { html = a.html; index = a.index; deckMeta = a.deckMeta; tier = 'A'; P.lastTierA = a.changes; saveWarnings = a.warnings || []; if (typeof a.config === 'string') cfgText = a.config; }
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
      narrB = await ws.readText('narration.md', { max: READ_LIMITS.narration });
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
      if (h) { P.handle = h; P.name = h.name; S.label = h.name; document.title = h.name + ' — Egatari Studio'; recentAdd(h); }
      else P.name = name;
    }
    // ここまでで書いた。この後の作業場所の書き込みと「保存した」は、今も同じ作業場所のときだけ（最後の確かめの後）
    if (!live()) throw cancelledError();
    // 新しい教材：作業場所の設定のファイルも新しい docId に（この後の保存も新しい教材に）。段 A が添付の一覧を揃えた設定のファイル（§3.3）も同じ。
    // 保存したものに入っているので、保存の途中で編集がなかったときは、この書き込みの後の版を保存した版とする
    if (cfgText) {
      const before = ws.revision;
      const wp = ws.writeText(CFG, cfgText, { live });
      if (rev !== null && before === rev) rev = ws.revision;
      await wp;
      if (!live()) throw cancelledError();
    }
    const clean = rev !== null && ws.markClean(rev);
    P.index = index; P.deckMeta = deckMeta; P.saved = html; P.original = html; P.lastTier = tier; P.sourceMatches = true;
    slidesPanel.saved();   // スライド一覧の「元に戻す」は保存まで
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
  if (!(await leftoverGate('export'))) return;
  const ws0 = S.ws, g0 = S.gen;
  status(T.exporting);
  let r;
  try { r = await engine.exportPortable(S.deckFile, { fromFolder: true }); }   // 作業フォルダからの書き出し：書き出しの印（exportedFrom、§3.1）を書く
  catch (e) { status(''); toast(T.exportFailed + ': ' + (e.message || e), true); return; }
  const live = () => S.ws === ws0 && S.gen === g0;
  if (!live()) { status(''); toast(T.api.cancelled, true); return; }
  // 授業の部屋の結果（学ぶ人の質問と答え。kit/core/live-results.mjs）が入る：人に渡すなら外す。外して書き出すのを 1 回で選べる
  if (r.stats && Array.isArray(r.stats.liveResults) && r.stats.liveResults.length) {
    const v = await ask({ title: T.liveResultsTitle, kind: 'warn',
      body: [el('p', { id: 'live-results-export-warn', text: T.liveResultsWarn }), el('ul', {}, r.stats.liveResults.map((p) => el('li', { text: p })))],
      buttons: [{ id: 'cancel', label: T.cancel }, { id: 'with', label: T.liveResultsWith }, { id: 'without', label: T.liveResultsWithout, pri: true }] });
    if (v === 'cancel' || !live()) { status(''); return; }
    if (v === 'without') {
      try { r = await engine.exportPortable(S.deckFile, { fromFolder: true, withoutLiveResults: true }); }
      catch (e) { status(''); toast(T.exportFailed + ': ' + (e.message || e), true); return; }
      if (!live()) { status(''); toast(T.api.cancelled, true); return; }
    }
  }
  try {
    const name = exportName(r.index?.metadata?.title || titleOf(r.html), deckBase(), FORMAT.FILE_EXT);   // 教材の題名（egatari.json の題 ＞ <title>）、なければデッキの名前
    if (window.__APP_TEST) window.__APP_TEST.lastSaveName = name;
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

// ---------------------------------------------------------------- 再生専用（学生に配る形）を書き出す（kit/core/portable.mjs の playOnly、§3.7）
// 1 ファイル：保存したもの（P.original）から。保存していない変更があれば、先に保存を求める。作業フォルダ：1 ファイルに組んでから
// room：授業の部屋（拡張 live。app/live-panel.js が作る、鍵を含む完全なもの）。あれば派生に CSP の <meta> と再生器を足す（kit/core/live.mjs）
async function exportPlayOnlyFile(room = null, opts = {}) {
  if (!S.ws) return;
  const ws0 = S.ws, g0 = S.gen, P = S.portable;
  const live = () => S.ws === ws0 && S.gen === g0;
  if (P && ws0.dirty) { toast(T.playOnlyUnsaved, true); return; }
  if (!(await leftoverGate('export'))) return;
  if (!live()) return;
  status(T.exporting);
  let html, name, writes = {}, srcSha = null;
  try {
    if (P) { html = playOnly(P.original); name = P.name; srcSha = P.index && P.index.sourceSha256; }
    else { const r = await engine.exportPortable(S.deckFile, { withoutLiveResults: true }); html = playOnly(r.html); writes = r.writes; srcSha = r.index && r.index.sourceSha256; name = exportName(r.index?.metadata?.title || titleOf(r.html), deckBase(), FORMAT.FILE_EXT); }   // 1 ファイルの書き出しと同じ名前
    // 教材の版（sourceSha256）も拡張に入れる：質問を教材のその版に結び付ける（再生専用の deck-meta からは消えるため）
    if (room) html = addLive(html, { ...room, ...(typeof srcSha === 'string' ? { sourceSha256: srcSha } : {}) }, liveRuntime(LIVE_POLICY_SRC, LIVE_JS));
  } catch (e) { status(''); toast(T.exportFailed + ': ' + (e.message || e), true); return; }
  if (!live()) { status(''); toast(T.api.cancelled, true); return; }
  // ライブ付き：題名の側に印（「題名（ライブ 10-30）.play.ega.html」。日付はライブの開始の日、この機械の時間帯）。拡張子は変えない
  name = (name.toLowerCase().endsWith(FORMAT.FILE_EXT) ? name.slice(0, -FORMAT.FILE_EXT.length) : name.replace(/\.html?$/i, '')) + (room ? liveMark(room) : '') + FORMAT.PLAY_EXT;
  if (window.__APP_TEST) window.__APP_TEST.lastSaveName = name;
  try {
    const th = window.__APP_TEST && window.__APP_TEST.saveHandle;
    const h = th ? (await writeHandle(th, html, live), th) : await saveWithPicker(name, html, P ? null : ws0.handle, live);
    if (!live()) throw cancelledError();
    for (const [rel, text] of Object.entries(writes)) await ws0.writeText(rel, text, { live });   // 作業フォルダ：初めて作った docId を残す
    status(T.exported(time(), (html.length / 1048576).toFixed(1)));
    toast(h ? (room ? (opts.oneWay ? T.playOnlyLiveSetupToast(room.room) : T.playOnlyLiveToast(room.room)) : T.playOnlyToast) : T.downloadedToast(name));
  } catch (e) {
    if (e && e.name === 'Cancelled') { status(''); toast(T.api.cancelled, true); return; }
    if (e && e.name !== 'AbortError') toast(String(e.message || e), true); status('');
  }
}

function liveMark(room) {
  const t = Date.parse((room.window && room.window.from) || '');
  if (!isFinite(t)) return '';
  const d = new Date(t), pad = (n) => String(n).padStart(2, '0');
  return T.liveMark(`${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}
// 「ファイル ▾」→「書き出し ▸」→「参加者用（再生のみ）…」：窓に「ライブ（質問・投票）を付ける」。付けたら、ライブの設定（app/live-panel.js）を同じ窓に出す
async function participantExport() {
  if (!S.ws) return;
  if (S.portable && S.ws.dirty) { toast(T.playOnlyUnsaved, true); return; }
  const box = el('div', { id: 'play-live-box', hidden: '' });
  const cb = el('input', { type: 'checkbox', id: 'play-live' });
  cb.addEventListener('change', async () => {
    box.hidden = !cb.checked;
    $('dlg').classList.toggle('wide', cb.checked);
    if (cb.checked && !box.firstChild) { liveHost = box; await livePanel.open(); }
  });
  let v;
  try {
    v = await ask({ title: T.playTitle, body: [el('p', { id: 'play-lead', text: T.playLead }), el('label', { cls: 'confirm', id: 'play-live-label' }, [cb, el('span', { text: T.playLive })]), box],
      buttons: [{ id: 'cancel', label: T.cancel }, { id: 'export', label: T.playGo, pri: true }],
      validate: async (id) => id !== 'export' || !cb.checked || livePanel.ready() });
  } finally { liveHost = null; }
  if (v !== 'export') return;
  let room = null;
  if (cb.checked) { room = await livePanel.prepare(); if (!room) return; }
  await exportPlayOnlyFile(room, room ? { oneWay: livePanel.oneWay() } : {});
}

// ---------------------------------------------------------------- 教材の情報…（題・ライセンス・作り手・添付）
// 題・ライセンス・作り手は設定のファイル（egatari.json の metadata）から読むだけ（ここでは書き換えない）。1 ファイルで設定のファイルになければ索引の metadata
let INFO = null;
async function readInfo() {
  let m = null;
  try { const c = JSON.parse((await S.ws.readText(FORMAT.CONFIG_FILE, { max: READ_LIMITS.json })) || 'null'); if (c && typeof c.metadata === 'object') m = c.metadata; } catch { m = null; }
  if (!m && S.portable) m = S.portable.index.metadata || null;
  const R = rightsOf(m || {});
  // 形式の版（ファイルの version。作業フォルダはこの Studio が書く版）と、作った Studio（ファイルの generator.version。作業フォルダはこの Studio）
  const ix = S.portable ? S.portable.index : null;
  const v = ix && ix.version && Number.isInteger(ix.version.major) ? ix.version : FORMAT_VERSION;
  const gen = ix && ix.generator && typeof ix.generator.version === 'string' ? ix.generator.version : null;
  return { ...R, title: R.title || (S.base ? titleOf(S.base) : ''), format: T.infoFormat(FORMAT.DISPLAY_NAME, `${v.major}.${Number.isInteger(v.minor) ? v.minor : 0}`, snapshotText(RES.specSnapshot)),
    studio: S.portable ? (gen ? T.infoMadeWith(gen) : T.infoMadeUnknown) : T.infoThisStudio(RES.version) };
}
// 仕様の写しの版：文字列（"WD 2026-10-24"）か {status|stage, date}。なければ null（形式は「Egatari 1.0」だけ）
function snapshotText(sn) {
  if (!sn) return null;
  if (typeof sn === 'string') return sn.trim() || null;
  if (typeof sn === 'object') { const st = sn.status || sn.stage || '', d = sn.date || ''; return `${st} ${d}`.trim() || null; }
  return null;
}
function infoSection() {
  const R = INFO || {};
  const rows = [[T.rTitle, R.title], [T.rLicense, R.license], [T.rCreators, (R.creators || []).join(', ')], [T.rCopyright, R.copyright], [T.rAttribution, R.attribution]];
  return el('div', { id: 'info-panel' }, [
    el('p', { cls: 'hint', text: T.infoLead }),
    el('dl', { id: 'info-list', cls: 'info-list' }, rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { cls: v ? '' : 'none', text: v || T.infoNone })])),
    el('p', { cls: 'hint', text: S.portable ? T.infoEditFile : T.infoEditFolder }),
    el('p', { id: 'info-format', text: R.format || '' }),
    el('p', { id: 'info-studio', text: R.studio || '' }),
    el('p', { cls: 'hint', id: 'info-player', text: T.infoPlayer }),
  ]);
}
async function lessonInfo() {
  if (!S.ws) return;
  if (S.portable && S.portable.readOnly) { toast(T.readOnlyNoEdit, true); return; }
  INFO = await readInfo();
  await attach.open();
}

// ---------------------------------------------------------------- スライド ▾（挿入・複製・削除・修正）
// 対象のスライド：一覧を開いていれば選んだもの、閉じていればプレビューに出ている枚
function slideAt() {
  const n = (S.slides || []).length;
  if (!n) return null;
  const s = slidesPanel.selected();
  if (s !== null) return s;
  const i = S.pos && Number.isFinite(S.pos.i) ? S.pos.i : 0;
  return Math.min(Math.max(0, i), n - 1);
}
// スライドの挿入…：雛形から（kit/core/slide-ops.mjs の雛形）か、チャットの AI に書いてもらう（app/llm.js）。対象のスライドの後ろに
async function insertDialog() {
  const why = await slideGuard();
  if (why) { toast(why, true); return; }
  const at = slideAt(), s = at === null ? null : S.slides[at];
  const pick = (id) => () => $('dlg').close(id);
  const v = await ask({ title: T.insertTitle, body: [
    el('p', { id: 'insert-lead', text: T.insertLead(at === null ? 0 : at + 1, s ? s.heading || '' : '') }),
    el('div', { id: 'insert-choices', cls: 'choices-grid' }, [
      el('h3', { text: T.sl.fromTpl }),
      el('div', { cls: 'row tpl-row' }, TEMPLATES.map((k) => el('button', { type: 'button', id: 'insert-' + k, text: T.sl.tpl[k], onclick: pick('tpl:' + k) }))),
      el('h3', { text: llm.texts.method }),
      el('div', { cls: 'row' }, [el('button', { type: 'button', id: 'insert-ai', cls: 'pri', text: T.sl.byAi, onclick: pick('ai') })]),
    ])],
  buttons: [{ id: 'cancel', label: T.cancel }] });
  if (v === 'ai') llm.insertWithAi(at);
  else if (v.startsWith('tpl:')) await slidesPanel.add(v.slice(4), at);
}

// ---------------------------------------------------------------- プレビュー ▾：表示のモード（スライドショー・授業・動画）。授業と動画はプレビューを ?mode= で読み込み直す
// スライドショーは全画面にもする（f と同じ）。発表は保存した .ega.html をブラウザで開いて行う
const MODE_ITEMS = { talk: 'b-full', lecture: 'b-lecturemode', video: 'b-videomode' };
function setPreviewMode(mode) {
  const was = S.previewMode || 'talk';
  S.previewMode = mode;
  for (const [m, id] of Object.entries(MODE_ITEMS)) $(id).setAttribute('aria-checked', m === mode ? 'true' : 'false');
  $('viewer').dataset.mode = mode;
  status(mode === 'talk' ? '' : T.modeOn[mode]);
  if (was !== mode && S.base && S.allowed) loadFrame();
}
function fullScreen() { const f = $('preview'); (f.requestFullscreen ? f.requestFullscreen() : Promise.reject()).then(() => f.focus(), () => toast(T.noFullscreen, true)); }

// ---------------------------------------------------------------- 新規作成…：チャットの AI に書いてもらう（app/llm.js）。白紙とスライドの形のテンプレートは新規作成から外した
// （テンプレートはスライドの挿入に残す。作業フォルダの新しいデッキはコマンドの npm run new）
async function newChoice() { await llm.newWithAi(); }
// Claude Code・Cowork で作る人への案内の行き先（説明のページか README かは未定。ここだけを直す）
const WITH_CLAUDE_URL = 'https://github.com/egatari/egatari-studio/blob/main/docs/' + (EN ? 'with-claude.md' : 'with-claude.ja.md');

// ---------------------------------------------------------------- つなぎ
applyTexts();
document.querySelector('#top .brand').title = T.brand;
// 版の案内（凍結した写し /vX.Y.Z/ の知らせ・根の前の版の一覧。サイトの versions.json があるときだけ）
mountVersionUi({ version: RES.version, lang: EN ? 'en' : 'ja' });
$('w-open').onclick = async () => { const h = await pickFolder(); if (h) openFolder(h); };
$('b-open').onclick = async () => { const h = await pickFolder(); if (h) openFolder(h); };
$('w-new').onclick = () => newChoice().catch((e) => toast(String(e.message || e), true));
$('b-new').onclick = () => newChoice().catch((e) => toast(String(e.message || e), true));
$('w-claude').href = WITH_CLAUDE_URL;
$('b-slides').onclick = () => slidesPanel.toggle();
$('b-slides').title = T.slidesTip;
$('b-edit').onclick = () => ui.toggleEdit();
$('b-narr').onclick = () => ui.toggleNarr();
$('w-openfile').onclick = async () => openPortable(await pickPortable());
$('b-openfile').onclick = async () => openPortable(await pickPortable());
$('b-save').onclick = () => { if (!S.portable) { toast(T.saveFolderAuto); return; } savePortable('save'); };
// 名前を付けて保存…（1 ファイル）：「新しい教材として保存する」に印を付ければ新しい docId（前の「新しい教材として保存…」）
async function saveAsDialog() {
  const cb = el('input', { type: 'checkbox', id: 'saveas-new' });
  const v = await ask({ title: T.saveAsTitle, body: [el('label', { cls: 'confirm', id: 'saveas-new-label' }, [cb, el('span', { text: T.saveNew })]), el('p', { cls: 'hint', text: T.saveNewHint })],
    buttons: [{ id: 'cancel', label: T.cancel }, { id: 'save', label: T.saveAsGo, pri: true }] });
  if (v === 'save') await savePortable(cb.checked ? 'new' : 'copy');
}
$('b-saveas').onclick = () => saveAsDialog().catch((e) => toast(String(e.message || e), true));
$('b-unpack').onclick = () => exportFolder();
$('b-export-portable').onclick = exportPortableFile;
$('b-export-play').onclick = () => participantExport().catch((e) => toast(String(e.message || e), true));
$('b-info').onclick = () => lessonInfo().catch((e) => toast(String(e.message || e), true));
$('b-insert').onclick = () => insertDialog().catch((e) => toast(String(e.message || e), true));
$('b-dup').onclick = () => { const i = slideAt(); if (i === null) { toast(T.noSlide, true); return; } slidesPanel.duplicateAt(i); };
$('b-del').onclick = () => { const i = slideAt(); if (i === null) { toast(T.noSlide, true); return; } slidesPanel.removeAt(i); };
$('b-revise-cmd').onclick = () => llm.revise();
$('b-videomode').onclick = () => setPreviewMode(S.previewMode === 'video' ? 'talk' : 'video');
$('b-lecturemode').onclick = () => setPreviewMode(S.previewMode === 'lecture' ? 'talk' : 'lecture');
$('b-comments').onclick = () => ui.toggleComments();
$('b-audio').onclick = async () => { ui.mark('audio', await audio.toggle()); };
$('b-check').onclick = quickCheck;
$('b-print').onclick = () => { const f = $('preview').contentWindow; if (f) f.postMessage({ type: 'app-print' }, '*'); };
$('b-presenter').onclick = openPresenter;
$('b-full').onclick = () => { fullScreen(); setPreviewMode('talk'); };
// 道具の列のボタンをマウスで押したら、フォーカスを残さない（Space で同じボタンを押し直さない。矢印・b などはプレビューへ送る：server/editor-ui.js）。
// キーボードで押したとき（detail = 0）は残す。一覧を開くボタン・一覧の項目は一覧の側でフォーカスを動かすので触らない
$('top').addEventListener('click', (e) => {
  if (e.detail === 0) return;
  const b = e.target.closest && e.target.closest('button');
  if (!b || b.hasAttribute('aria-haspopup') || b.closest('[role=menu]')) return;
  if (document.activeElement === b) b.blur();
});
// 道具の列の一覧（ARIA のメニューボタン）：ファイル ▾・スライド ▾・プレビュー ▾ と、入れ子の「書き出し ▸」
// ボタン：Enter・Space・↓ で開いて最初の項目へ、↑ で最後の項目へ。一覧：↑↓（端で回る）・Home・End・字（その字で始まる項目へ）。
// 入れ子の項目は → か Enter で開き（最初の項目へ）、← か Esc で閉じて元の項目へ。Esc で一覧を閉じてボタンへ。Tab・外を押す・項目を選ぶと閉じる。
// 項目は tabindex=-1（Tab で一覧に入らない）。一覧の中のキーはプレビューにも、e・n・c・r の切り替えにも渡さない（server/editor-ui.js は既定の動きを
// 止めたキーを見ない。一覧の中は role=menu なので送りもしない）。マウスで選んだら focus を残さない（キーはプレビューへ）、キーボードで選んだらボタンに返す
const MENUS = [...document.querySelectorAll('#tools .menu > button[aria-haspopup=menu]')].map((btn) => ({ btn, list: $(btn.getAttribute('aria-controls')) }));
const SUBS = [...document.querySelectorAll('#tools .menu-list .sub > button[aria-haspopup=menu]')].map((btn) => ({ btn, list: $(btn.getAttribute('aria-controls')), sub: true }));
const menuItems = (M) => [...M.list.querySelectorAll(':scope > [role^=menuitem], :scope > .sub > [role^=menuitem], :scope > [role=group] > [role^=menuitem]')].filter((b) => !b.hidden);
for (const M of [...MENUS, ...SUBS]) for (const b of menuItems(M)) b.tabIndex = -1;
function closeMenu(M, focusBtn) {
  for (const X of SUBS) if (X !== M && M.list.contains(X.list)) closeMenu(X);
  if (M.list.hidden) return;
  M.list.hidden = true; M.btn.setAttribute('aria-expanded', 'false');
  if (focusBtn) M.btn.focus();
}
const closeMenus = () => MENUS.forEach((M) => closeMenu(M));
const openMenuOf = () => MENUS.find((M) => !M.list.hidden) || null;
function openMenu(M, where = 'first') {
  if (!M.sub) closeMenus();
  M.list.hidden = false; M.btn.setAttribute('aria-expanded', 'true');
  const items = menuItems(M), f = where === 'last' ? items[items.length - 1] : items[0];
  if (f) f.focus();
}
for (const M of [...MENUS, ...SUBS]) {
  M.btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (M.list.hidden) openMenu(M); else if (M.sub) menuItems(M)[0]?.focus(); else closeMenu(M);
  });
  if (!M.sub) M.btn.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(M, e.key === 'ArrowUp' ? 'last' : 'first'); }
    else if (e.key === 'Escape' && !M.list.hidden) { e.preventDefault(); closeMenu(M, true); }
  });
  else M.btn.parentElement.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && M.list.hidden) { M.list.hidden = false; M.btn.setAttribute('aria-expanded', 'true'); } });
  if (M.sub) M.btn.parentElement.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !M.list.contains(document.activeElement)) closeMenu(M); });
  M.list.addEventListener('keydown', (e) => {
    const items = menuItems(M), i = items.indexOf(e.target);
    if (i < 0) return;                                   // 入れ子の一覧の中のキー（その一覧が受ける）
    const n = items.length, go = (j) => items[(j + n) % n].focus();
    const k = e.key, cur = items[i];
    const sub = cur.getAttribute('aria-haspopup') === 'menu' ? SUBS.find((X) => X.btn === cur) : null;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(n - 1); }
    else if (k === 'ArrowRight' && sub) { e.preventDefault(); openMenu(sub); }
    else if ((k === 'ArrowLeft' || k === 'Escape') && M.sub) { e.preventDefault(); e.stopPropagation(); closeMenu(M, true); }
    else if (k === 'Escape') { e.preventDefault(); closeMenu(M, true); }
    else if (k === 'Tab') closeMenus();
    else if (k.length === 1 && k !== ' ') {
      // 字：その字で始まる次の項目へ（見つからなくても、一覧の中では e・n・c・r などの切り替えにしない）
      e.preventDefault();
      const lc = k.toLowerCase(), order = [...items.slice(i + 1), ...items.slice(0, i + 1)];
      const hit = order.find((b) => (b.textContent || '').trim().toLowerCase().startsWith(lc));
      if (hit) hit.focus();
    }
  });
  M.list.addEventListener('click', (e) => {
    const b = e.target.closest('[role^=menuitem]');
    if (!b || b.getAttribute('aria-haspopup') === 'menu' || !M.list.contains(b) || (!M.sub && SUBS.some((X) => X.list.contains(b)))) return;
    const top = MENUS.find((X) => X.list.contains(b));
    closeMenus();
    // キーボードで選んだ（detail = 0）：ボタンに返す（選んだものが窓を開いたら、窓が受ける）。マウス：focus を残さない
    if (e.detail === 0 && top && !document.querySelector('dialog[open]')) top.btn.focus();
    else if (document.activeElement === b) b.blur();
  });
}
document.addEventListener('click', (e) => { if (!e.target.closest('#tools .menu')) closeMenus(); });
$('b-help').onclick = showHelp;
$('w-themes').onclick = themeDialog;
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
  state: () => ({ deckFile: S.deckFile, builds: S.builds, loads: S.loads, gen: S.gen, error: S.error, warn: S.warn.slice(), pos: S.pos, open: !!S.ws, kind: S.ws ? S.ws.kind : null,
    allowed: !!S.allowed, presenter: !!(S.presWin && !S.presWin.closed), presLoads: S.presLoads || 0, frameLoaded: S.frameLoaded || 0,
    portable: S.portable ? { components: (S.portable.index.components || []).map((c) => ({ tag: c.tag, version: c.version, sha256: c.sha256 })), themes: (S.portable.index.themes || []).map((t) => ({ name: t.name, version: t.version, sha256: t.sha256 })), themePins: S.portable.themePins || null, docId: S.portable.index.docId, profile: S.portable.index.profile, extended: !!S.portable.extended, mislabelled: !!S.portable.mislabelled, codeReasons: (S.portable.codeReasons || []).slice(), readOnly: S.portable.readOnly, tierAOnly: S.portable.tierAOnly, rightsOk: S.portable.rightsOk, dirty: S.ws.dirty, name: S.portable.name, stale: (S.stale || []).slice(),
      lastTier: S.portable.lastTier, lastTierA: S.portable.lastTierA || null, saveWarnings: (S.portable.saveWarnings || []).slice(), lastRefusal: S.portable.lastRefusal || null, sourceOnly: !!S.portable.sourceOnly, derivedFrom: (S.portable.index.metadata && S.portable.index.metadata.derivedFrom) || null } : null }),
  openFile: (input) => openPortable(input),
  attachBusy: () => attach.isBusy(),
  saved: () => (S.portable ? S.portable.saved : null),
  save: (mode) => savePortable(mode || 'save'),
  api: (method, url, body) => api(method, url, body),
  files: () => (S.ws && S.ws.snapshot ? Object.fromEntries([...S.ws.snapshot()].map(([k, v]) => [k, bytesToBase64(v)])) : null),
  workerProbe: (name) => probeWorker(name),
  buildWorkerProbe: (name) => builder.probe(name),
  buildTimeout: 0,
  themePicker: null,  // 試験：テーマのフォルダを選ぶ画面の代わり（(opts) → ハンドル）
  themeFolder: () => ({ name: TF.handle ? TF.handle.name : null, state: TF.state, inBuild: !!engine.themeWorkspace, mine: [...TZ.themes.keys()].sort() }),
  initThemeFolder: () => initThemeFolder(),
  build: async (opts) => (await engine.build(S.deckFile, opts || {})).html,
  rebuild: () => rebuild('test'),
  slides: () => slidesPanel.state(),
  reloadPreview: () => loadFrame(),
  ui: () => ui.state(),
  audio: () => audio.state(),
  audioPanel: audio,
  rec: () => rec.state(),
  badge: () => ({ ...(S.badge || { errs: 0, warns: 0 }), text: $('b-check-badge').textContent, hidden: $('b-check-badge').hidden, bad: $('b-check-badge').classList.contains('bad'), autoChecks: S.autoChecks || 0 }),
  autoCheckMs: 0,
  menuOpen: () => { const M = openMenuOf(); return M ? M.list.id : null; },
  mp3: undefined,     // 試験：'off' で MP3 のエンコーダを読み込まない（1 ファイル版と同じく WAV で保存する）
  tts: null,          // 試験：ブラウザの TTS の代わり（{info(lang), synth({lang, text, role, voices, onProgress})}。モデルを取りに行かない）
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
window.addEventListener('beforeunload', (e) => { if ((S.portable && S.ws && S.ws.dirty) || audio.unsaved() || audio.isBusy() || rec.isBusy()) { e.preventDefault(); e.returnValue = ''; } });
(async () => {
  await initThemeFolder().catch(() => {});
  let reopen = false;
  try { reopen = sessionStorage.getItem('motion-editor-reopen') === '1'; sessionStorage.removeItem('motion-editor-reopen'); } catch { /* 使えない環境 */ }
  if (reopen) {
    const r = (await recentList())[0];
    if (r && r.handle.kind === 'directory' && (await hasPermission(r.handle).catch(() => false))) { openFolder(r.handle); return; }
  }
  showWelcome();
})();

// ---------------------------------------------------------------- チャットの AI との行き来（貼り付け・修正依頼。app/llm.js）
const llm = setupLlm({ S, $, el, ask, toast, status, T, EN, builder, buildTimeout, openPortable, rebuild, quickCheck, checkResults, updateName, slides: slidesPanel, themes: RES.themes, themeOptions, loadOtherTheme: SUPPORTED ? () => chooseThemeFolder() : null, loadThemeZip: () => chooseThemeZip() });
window.__APP_TEST.paste = (text, mode) => llm.importText(text, mode || 'new');
window.__APP_TEST.insertAi = (after) => llm.insertWithAi(after);
window.__APP_TEST.fixRequest = async () => { await quickCheck(); const b = $('b-fixreq'); if (b) b.click(); };
