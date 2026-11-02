// 本（format spec §9C。v0.6.5 の E2〜E5）：本のある教材を開いたときの、編集アプリの本の働き。
//   見る（E2）：プレビューの「本」（プレビュー ▾ の表示）。読むための頁（kit/core/article-page.mjs の articlePageOf）を sandbox の枠に出す。
//     仮の見せ方：再生器の本の窓（v0.6.5 の B：panes）ができたら、組んだプレビューの中の本に替える（この枠・view() と print の口だけを差し替える）
//   合っているか（E3）：スライドと節のつながりの古さ（§9C.7。kit/core/article-links.mjs）を「本」の板に出し、確認済みにできる（egatari.json の articleLinks）
//   直す（E4）：本文のファイルを、ふつうの文字の欄で直す（§9C.2：NFC・LF で書く）。保存は作業場所に書くだけ（1 ファイルは「保存」で、
//     本文だけを組み直す：kit/core/tier-a.mjs の opts.article）。点検の誤り（§9C.8）は板に出す
//   刷る（E5）：「本を印刷」（A4 縦。ステップへのリンクは「→ スライド 5」と刷る）。本のない教材は「台本を印刷」（app/frame-shim.js の printScript）
// citeproc（引用の書式。CPAL-1.0）で引用を組んだときは、本の下と板に帰属の 1 行（CITEPROC_CREDIT。NOTICE）を出す
//
//   const book = createBook(ctx)
//   ctx = {S, $, el, T（app/i18n.js の T.book）, EN, loader（app/article-loader.js）, builder, buildTimeout(), toast, status, ask,
//          openPanel(title, body), panelOpen(id), rebuild(reason), goFragment(f)（プレビューをそのステップへ）, setView(v)（'slides' | 'book'）, viewMode()}
//   book.has(listing | files)  本文のファイルがあるか
//   book.ensure(cite)          本の道具を読み込む（ページと組み立ての Worker）
//   book.refresh()             組み直した後：本を組み直し、見せ方・板・印刷の項目を合わせる
//   book.engineArticle()       app/engine.js の article()（ページの道具）
//   book.renderForSave()       1 ファイルの保存：今の作業場所の本文を組み、誤りがあれば断る（{html} | {errors}）
//   book.togglePanel()・book.print()・book.reset()・book.state()（試験）
import { CITEPROC_CREDIT } from '../kit/core/citeproc-credit.mjs';
import { updateConfig } from '../kit/core/config-file.mjs';
import { FORMAT } from '../kit/core/format.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { previewDocument } from './preview-doc.js';
import BOOK_SHIM from './book-shim.js?text';

const CFG = FORMAT.CONFIG_FILE;
const ARTICLE_RE = /^(?:article\.md|article\/[^/]+\.md)$/;
const ARTICLE_MAX = 1 << 20;   // kit/core/article-text.mjs の ARTICLE_LIMITS.fileBytes
const filesOf = (x) => (!x ? [] : x.files instanceof Map ? [...x.files.keys()] : x instanceof Map ? [...x.keys()] : Array.isArray(x) ? x : Object.keys(x));

// 本の枠の中の信頼する仲立ち（app/book-shim.js）

export function createBook(ctx) {
  const { S, $, el, T, EN, loader, builder } = ctx;
  const B = {
    present: false,     // 今の教材に本文のファイルがあるか
    cite: false,        // 文献の一覧（references.json）があるか
    last: null,         // 最後に組んだ本（app/engine.js の article の結果）
    error: null,        // 組めなかったわけ
    gen: 0,             // 組み直しの代（古い答えを捨てる）
    file: null,         // 板で直している本文のファイル
    loaded: null,       // その欄に読み込んだときの中身（ほかで変わったかを見る）
    dirty: false,
    renders: 0,
  };

  const has = (x) => filesOf(x).some((p) => ARTICLE_RE.test(p));
  const hasRefs = (x) => filesOf(x).includes('references.json');

  // ---------------------------------------------------------------- 道具
  // cite：文献を引く本か（citeproc も読み込む）。渡さなければ今の作業場所の references.json で決める
  async function ensure(cite) {
    if (cite === undefined) { try { cite = S.ws ? hasRefs(await S.ws.list()) : B.cite; } catch { cite = B.cite; } }
    await loader.tools();
    if (cite) await loader.csl();
    builder.setExtra(await loader.workerPrelude(cite));
  }
  function engineArticle() {
    const tools = globalThis.__egatariArticle;
    if (!tools) return null;
    return { tools, csl: globalThis.__egatariCSL ? tools.cslWith(globalThis.__egatariCSL) : null, steps: ctx.askSteps };
  }

  // 組んだデッキの <html lang> と <title>（kit/core/portable.mjs の書き出しと同じ取り方：本の題と言葉が書き出しと同じになる）
  const deckLang = () => ((S.base || '').match(/<html[^>]*\slang\s*=\s*["']([^"']*)["']/i)?.[1] || 'ja').trim() || 'ja';
  const deckTitle = () => {
    const t = (S.base || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    const plain = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    return plain(t) || plain((S.slides && S.slides[0] && (S.slides[0].title || S.slides[0].heading)) || '');
  };
  // 読むための頁の色（組んだデッキの :root の色の変数だけ。kit/core/article-page.mjs の themeTokens が選ぶ）
  const themeCss = () => [...(S.base || '').matchAll(/:root\s*\{[^{}]*\}/g)].map((m) => m[0]).join('\n').slice(0, 20000);
  const opts = (extra = {}) => ({ lang: deckLang(), title: deckTitle(), themeCss: themeCss(), uiLang: EN ? 'en' : 'ja', ...extra });

  async function render(extra) {
    return builder.article(S.ws, S.deckFile, opts(extra), { timeout: ctx.buildTimeout() });
  }

  // ---------------------------------------------------------------- 組み直した後
  // listing：組み立てが読んだ作業場所の一覧（app/main.js の rebuild。もう一度フォルダを歩かない）
  async function refresh(listing0 = null) {
    const ws = S.ws, g = ++B.gen;
    let listing = listing0;
    if (!listing) { try { listing = ws ? await ws.list() : null; } catch { listing = null; } }
    if (S.ws !== ws || g !== B.gen) return;
    // 本のない教材：本の道具に触れずに終える（読み込まない・Worker を作り直さない）
    if (!(listing && has(listing)) && !B.present && !B.last) { B.present = false; B.cite = false; showControls(); return; }
    B.present = !!listing && has(listing);
    B.cite = !!listing && hasRefs(listing);
    showControls();
    if (!B.present) { B.last = null; B.error = null; view(); if (panelShown()) closeBookPanel(); return; }
    try {
      await ensure(B.cite);
      if (S.ws !== ws || g !== B.gen) return;
      const r = await render();
      if (S.ws !== ws || g !== B.gen) return;
      B.last = r; B.error = null; B.renders++;
    } catch (e) {
      if (S.ws !== ws || g !== B.gen) return;
      B.error = String((e && e.message) || e);
      console.warn('[editor] book', e);
    }
    view();
    if (panelShown()) drawPanel();
    ctx.onChange && ctx.onChange();
  }
  function reset() {
    B.gen++; B.present = false; B.cite = false; B.last = null; B.error = null; B.file = null; B.loaded = null; B.dirty = false;
    showControls(); view();
  }

  // ---------------------------------------------------------------- 見せ方（E2）と項目
  function showControls() {
    for (const e of document.querySelectorAll('.only-book')) e.hidden = !B.present;
    const pb = $('b-print-book');
    if (pb) pb.textContent = B.present ? T.printBook : T.printScript;
    if (!B.present && ctx.viewMode() === 'book') ctx.setView('slides');
  }
  let frameHtml = null;
  // 本の枠：本のある教材を開いたときに作る（本のない教材のページには枠を足さない）。sandbox は allow-scripts（信頼する仲立ちだけ。頁はスクリプトを持たない）と
  // allow-modals（印刷）。名前 book-view（プレビューの枠と見分ける）
  function frame() {
    let f = $('book-view');
    if (f && !B.present) { f.remove(); frameHtml = null; return null; }   // 本のない教材に替わった
    if (f || !B.present) return f;
    f = document.createElement('iframe');
    f.id = 'book-view'; f.name = 'book-view'; f.title = T.panelTitle;
    f.setAttribute('sandbox', 'allow-scripts allow-modals');
    $('book-box').prepend(f);
    return f;
  }
  function view() {
    const f = frame(), on = B.present && ctx.viewMode() === 'book';
    const box = $('book-box');
    box.hidden = !on;
    box.setAttribute('aria-hidden', on ? 'false' : 'true');
    const html = B.last && B.last.page ? B.last.page : '';
    if (f && html && html !== frameHtml) { frameHtml = html; f.srcdoc = previewDocument(html, BOOK_SHIM); }
    if (f && !html && frameHtml !== null) { frameHtml = null; f.removeAttribute('srcdoc'); }
    const note = $('book-note');
    note.textContent = B.error ? T.renderFailed(B.error) : B.last && !B.last.page ? T.empty : '';
    note.hidden = !note.textContent;
    const credit = $('book-credit');
    credit.textContent = CITEPROC_CREDIT;
    credit.hidden = !(B.last && B.last.citeproc);
  }
  // 本の枠からの知らせ（ステップへのリンク）：スライドの表示にして、そのステップへ
  function message(e) {
    const f = $('book-view');
    if (!f || e.source !== f.contentWindow) return false;
    const m = e.data || {};
    if (m.type === 'book-step' && typeof m.step === 'string' && /^[A-Za-z0-9_-]+:(?:\d{1,3}|concl)$/.test(m.step)) { ctx.setView('slides'); ctx.goFragment(m.step); }
    return true;
  }

  // ---------------------------------------------------------------- 刷る（E5）
  function slideNumbers() {
    const out = {};
    (S.slides || []).forEach((s, i) => { if (s.key) out[s.key] = i + 1; if (s.id) out[s.id] = i + 1; });
    return out;
  }
  function print() {
    if (!B.present) { const f = $('preview').contentWindow; if (f) f.postMessage({ type: 'app-print', what: 'script' }, '*'); return; }
    const f = $('book-view');
    if (!B.last || !B.last.page || !f || !f.contentWindow) { ctx.toast(B.error ? T.renderFailed(B.error) : T.notReady, true); return; }
    f.contentWindow.postMessage({ type: 'book-print', slides: slideNumbers(), word: T.printTo }, '*');
  }

  // ---------------------------------------------------------------- 「本」の板（E3・E4）
  const panelShown = () => !!$('book-panel') && !$('panel').hidden;
  function closeBookPanel() { if (panelShown()) $('panel').hidden = true; }
  async function togglePanel(on) {
    if (on === undefined) on = !panelShown();
    if (!on) { if (B.dirty && !(await discardOk())) return; closeBookPanel(); return; }
    if (!B.present) { ctx.toast(T.noBook, true); return; }
    if (!B.file || !(B.last && B.last.files.includes(B.file))) B.file = B.last && B.last.files.length ? B.last.files[0] : null;
    await loadText();
    drawPanel();
  }
  async function discardOk() {
    const v = await ctx.ask({ title: T.discardTitle, kind: 'warn', body: [el('p', { text: T.discardLead })], buttons: [{ id: 'cancel', label: T.cancel }, { id: 'discard', label: T.discard, pri: true }] });
    if (v === 'discard') { B.dirty = false; return true; }
    return false;
  }
  async function loadText() {
    B.loaded = null; B.dirty = false;
    if (!B.file || !S.ws) return;
    try { B.loaded = await S.ws.readText(B.file, { max: ARTICLE_MAX }); } catch (e) { B.loaded = null; ctx.toast(T.readFailed(B.file, String((e && e.message) || e)), true); }
  }
  // 状態の言葉（§9C.7）：節が変わった・スライドか台本が変わった・両方・まだ確認していない
  const stateText = (st) => ({ article: T.changedSection, slide: T.changedSlide, both: T.changedBoth, unconfirmed: T.unconfirmed })[st] || '';
  function staleRows() {
    const L = B.last && B.last.links;
    if (!L) return [];
    const secs = new Map((B.last.sections || []).map((x) => [x.id, x]));
    const sl = new Map((B.last.slides || []).map((x, i) => [x.key, { ...x, n: (S.slides || []).findIndex((s) => s.key === x.key || (x.id && s.id === x.id)) + 1 || i + 1 }]));
    return L.states.filter((x) => x.state !== 'ok').map((x) => ({ ...x, sec: secs.get(x.section) || null, sl: sl.get(x.slide) || null }));
  }
  function drawPanel() {
    const r = B.last;
    const body = [];
    if (B.error) body.push(el('p', { cls: 'bad', id: 'book-error', text: T.renderFailed(B.error) }));
    // E3：合っていないかもしれない組
    const rows = staleRows();
    if (rows.length) {
      const list = el('ul', { cls: 'book-stale-list' });
      for (const x of rows) {
        const slideName = x.sl ? T.slideName(x.sl.n, x.sl.title) : x.slide;
        const secName = x.sec ? T.sectionName(x.sec.heading) : x.section;
        list.append(el('li', {}, [
          el('span', { cls: 'pair', text: `${slideName} ↔ ${secName}` }),
          el('span', { cls: 'why', text: stateText(x.state) }),
          el('button', { type: 'button', cls: 'book-confirm', text: T.confirm, title: T.confirmTip, onclick: () => confirmLinks([{ slide: x.slide, section: x.section }]) }),
        ]));
      }
      body.push(el('section', { id: 'book-stale', cls: 'book-stale', role: 'status', 'aria-labelledby': 'book-stale-h' }, [
        el('h3', { id: 'book-stale-h', text: T.mayNotMatch }),
        el('p', { cls: 'hint', text: T.mayNotMatchLead }),
        list,
        ...(rows.length > 1 ? [el('button', { type: 'button', id: 'book-confirm-all', text: T.confirmAll, onclick: () => confirmLinks(rows.map((x) => ({ slide: x.slide, section: x.section }))) })] : []),
      ]));
    }
    // 点検の誤りと警告（§9C.8）
    const probs = r ? r.problems.filter((p) => p.sev === 'error' || p.sev === 'warn') : [];
    if (probs.length) {
      const errs = probs.filter((p) => p.sev === 'error').length;
      body.push(el('details', { id: 'book-problems', cls: 'book-problems', ...(errs ? { open: '' } : {}) }, [
        el('summary', { text: T.problems(errs, probs.length - errs) }),
        el('ul', {}, probs.slice(0, 50).map((p) => el('li', { cls: p.sev === 'error' ? 'bad' : '', text: p.text }))),
      ]));
    }
    // E4：本文を文字の欄で直す
    const files = r ? r.files : [];
    const sel = el('select', { id: 'book-file', 'aria-label': T.fileLabel });
    for (const f of files) { const o = el('option', { value: f, text: f }); if (f === B.file) o.selected = true; sel.append(o); }
    sel.onchange = async () => {
      if (B.dirty && !(await discardOk())) { sel.value = B.file; return; }
      B.file = sel.value; await loadText(); drawPanel();
    };
    const ta = el('textarea', { id: 'book-text', spellcheck: 'false', 'aria-label': T.textLabel(B.file || ''), lang: deckLang() });
    ta.value = B.loaded === null ? '' : B.loaded;
    if (B.loaded === null) ta.disabled = true;
    const save = el('button', { type: 'button', id: 'book-save', cls: 'pri', text: T.save, onclick: () => saveText(ta.value) });
    const revert = el('button', { type: 'button', id: 'book-revert', text: T.revert, title: T.revertTip, onclick: () => { ta.value = B.loaded || ''; B.dirty = false; mark(); } });
    const mark = () => { save.disabled = !B.dirty; revert.disabled = !B.dirty; $('book-dirty').hidden = !B.dirty; };
    ta.addEventListener('input', () => { B.dirty = ta.value !== (B.loaded || ''); mark(); });
    ta.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (B.dirty) saveText(ta.value); }
      e.stopPropagation();   // 文字の欄のキーをプレビューに送らない
    });
    const ro = S.portable && (S.portable.readOnly || S.portable.tierAOnly);
    if (ro) { ta.readOnly = true; save.hidden = true; revert.hidden = true; }
    body.push(el('section', { id: 'book-edit', cls: 'book-edit' }, [
      el('div', { cls: 'row' }, [el('label', { for: 'book-file', text: T.fileLabelShort }), sel]),
      ta,
      el('div', { cls: 'row' }, [save, revert, el('span', { id: 'book-dirty', cls: 'hint', text: T.unsaved, hidden: '' }), el('span', { cls: 'sp' })]),
      el('p', { cls: 'hint', text: ro ? T.readOnly : S.portable ? T.saveHintFile : T.saveHintFolder }),
    ]));
    if (r && r.citeproc) body.push(el('p', { id: 'book-panel-credit', cls: 'hint credit', text: CITEPROC_CREDIT }));
    const wrap = el('div', { id: 'book-panel' }, body);
    ctx.openPanel(T.panelTitle, wrap);
    mark();
  }

  // 本文を作業場所に書く（§9C.2：NFC・LF・BOM なし）。読み込んだ後にほかで変わっていれば書かない
  async function saveText(text) {
    if (!B.file || !S.ws) return;
    const ws = S.ws, file = B.file;
    const out = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').normalize('NFC');
    if (new TextEncoder().encode(out).length > ARTICLE_MAX) { ctx.toast(T.tooLarge, true); return; }
    let now;
    try { now = await ws.readText(file, { max: ARTICLE_MAX }); } catch { now = null; }
    if (S.ws !== ws) return;
    if (now !== B.loaded) { ctx.toast(T.changedOutside, true); return; }
    try {
      if (ws.kind === 'folder') await ws.backup(file, { max: ARTICLE_MAX });
      await ws.writeText(file, out);
    } catch (e) { ctx.toast(T.saveFailed(String((e && e.message) || e)), true); return; }
    if (S.ws !== ws) return;
    B.loaded = out; B.dirty = false;
    ctx.status(T.savedText(file));
    if (ctx.afterWrite) ctx.afterWrite();
    await ctx.rebuild('book');
    if (S.ws === ws && panelShown()) drawPanel();
  }

  // E3：確認済みにする（今の hash を記録する。§9C.7。どちらの字も変えない）。記録は egatari.json の articleLinks
  async function confirmLinks(only) {
    if (!S.ws) return;
    if (S.portable && (S.portable.readOnly || S.portable.tierAOnly)) { ctx.toast(T.readOnly, true); return; }
    const ws = S.ws;
    let r;
    try { await ensure(); r = await render({ checkSteps: false }); } catch (e) { ctx.toast(T.renderFailed(String((e && e.message) || e)), true); return; }
    if (S.ws !== ws || !r || !r.links) return;
    const tools = await loader.tools();
    const rec = tools.recordLinks(r.links.recorded, r.links.current, r.links.pairs, { mode: 'all', only });
    const dir = S.deckFile && S.deckFile.includes('/') ? S.deckFile.slice(0, S.deckFile.lastIndexOf('/') + 1) : '';
    let cfgText = null;
    try { cfgText = await ws.readText(dir + CFG, { max: READ_LIMITS.json }); } catch { cfgText = null; }
    let next;
    try { next = updateConfig(cfgText, { articleLinks: rec.links || undefined }); } catch (e) { ctx.toast(String((e && e.message) || e), true); return; }
    if (S.ws !== ws) return;
    if (next !== cfgText) {
      try { if (ws.kind === 'folder' && cfgText !== null) await ws.backup(dir + CFG, { max: READ_LIMITS.json }); await ws.writeText(dir + CFG, next); }
      catch (e) { ctx.toast(T.saveFailed(String((e && e.message) || e)), true); return; }
    }
    ctx.toast(T.confirmed(only.length));
    if (ctx.afterWrite) ctx.afterWrite();
    await ctx.rebuild('book');
  }

  // 1 ファイルの保存（app/main.js の savePortableBound）：今の作業場所の本文を組む。誤り（§9C.8）があれば保存しない
  async function renderForSave() {
    await ensure();
    const r = await render();
    if (!r) return { html: null, errors: [] };
    const errors = r.problems.filter((p) => p.sev === 'error');
    return errors.length ? { errors } : { html: r.html, citeproc: r.citeproc };
  }

  return {
    has, hasRefs, ensure, refresh, reset, engineArticle, renderForSave, print, togglePanel, message, view,
    present: () => B.present, dirty: () => B.dirty,
    state: () => ({ present: B.present, cite: B.cite, renders: B.renders, error: B.error, file: B.file, dirty: B.dirty, citeproc: !!(B.last && B.last.citeproc),
      files: B.last ? B.last.files.slice() : [], problems: B.last ? B.last.problems.map((p) => ({ sev: p.sev, code: p.code })) : [],
      states: B.last && B.last.links ? B.last.links.states.slice() : [], view: ctx.viewMode(), panel: panelShown(), loaded: loader.loaded(), extra: builder.extra.length > 0 }),
  };
}
