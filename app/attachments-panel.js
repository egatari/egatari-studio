// 添付の板（編集アプリの横の板 #panel。format spec §9C.3）：作業フォルダ・1 ファイル（.ega.html）の attachments/ の一覧、足す・消す・名前を替える、
// 役割（source・pdf・code・data・supplement）と題。役割と題は設定のファイル（FORMAT.CONFIG_FILE）の FORMAT.ATTACH_KEY に書く（kit/core/attachments.mjs）。
// 添付はこの画面では開かない・プレビューにも渡さない（読むのは大きさを確かめて作業場所に書くときだけ）。
// 1 ファイルでは作業場所はメモリの上なので、「保存」で段 A（kit/core/tier-a.mjs：添付の場所と索引だけ）の保存になる
//
//   const panel = createAttachPanel({ws(), generation(), lang, el, openPanel, isOpen(), toast, ask, beforeWrite() → null | 断る理由, afterWrite()})
//   知らせの言葉は検査器と同じ（kit/check-messages.mjs の attach…）
//   panel.open() / panel.refresh()
import { FORMAT } from '../kit/core/format.mjs';
import { planAttachments, configEntries, attachPathProblem, ATTACH_LIMITS, ATTACH_ROLES, ATTACH_PREFIX, isAttachPath } from '../kit/core/attachments.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { readFileBounded } from './bounded-read.js';
import { message } from '../kit/check-messages.mjs';

const CFG = FORMAT.CONFIG_FILE, KEY = FORMAT.ATTACH_KEY;
const MB = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const STR = {
  ja: {
    title: '添付（試行）', lead: `試行：入れてよい中身は後の版で狭まることがあります（形式の §3.8 の案）。読み手のためのファイル（元の原稿・PDF・コード・データ・補足）。${ATTACH_PREFIX} に置き、役割と題は ${CFG} に書きます。1 ファイル（${FORMAT.FILE_EXT}）の再生ではダウンロードだけで（開かない・実行しない）、再生専用には入りません`,
    limits: `1 つ ${MB(ATTACH_LIMITS.fileBytes)}・合わせて ${MB(ATTACH_LIMITS.totalBytes)}・${ATTACH_LIMITS.count} 個まで`,
    none: 'まだありません', add: 'ファイルを足す…', role: '役割', noRole: '（役割なし：一覧に出ない）', titleL: '題', rename: '名前を替える…', remove: '消す',
    roles: { source: '元の原稿', pdf: 'PDF', code: 'コード', data: 'データ', supplement: '補足資料' },
    renameAsk: '新しい名前（attachments/ の下）', removeAsk: (p) => `「${p}」を消しますか？（作業フォルダでは .cache/edits/ に控えを残します）`,
    exists: (p) => `「${p}」はもうあります。先に消すか、名前を替えてください`, bad: (p, w) => `「${p}」は使えない名前です（${w}）`,
    tooLarge: (p, n) => `「${p}」は大きすぎます（${MB(n)}。1 つ ${MB(ATTACH_LIMITS.fileBytes)} まで）`, total: `添付を合わせると ${MB(ATTACH_LIMITS.totalBytes)} を超えます`,
    count: `添付は ${ATTACH_LIMITS.count} 個までです`, added: (n) => `${n} 個足しました`, removed: (p) => `消しました：${p}`, renamed: (a, b) => `名前を替えました：${a} → ${b}`,
    saved: '役割と題を書きました', portableNote: '1 ファイルに残すには「保存」を押してください（添付の場所だけを書き換えます）', fail: 'できませんでした：', cancel: '取消', ok: 'OK',
    problems: '気をつけること',
  },
  en: {
    title: 'Attachments (experimental)', lead: `Experimental: the allowed contents may be narrowed in a later version (spec §3.8 draft). Files for readers (original source, PDF, code, data, supplements). They live in ${ATTACH_PREFIX}; roles and titles are written to ${CFG}. In a single file (${FORMAT.FILE_EXT}) the player only offers them for download (never opened or run); play-only files do not carry them`,
    limits: `up to ${MB(ATTACH_LIMITS.fileBytes)} each, ${MB(ATTACH_LIMITS.totalBytes)} together, ${ATTACH_LIMITS.count} files`,
    none: 'None yet', add: 'Add files…', role: 'Role', noRole: '(no role: not listed)', titleL: 'Title', rename: 'Rename…', remove: 'Remove',
    roles: { source: 'Source', pdf: 'PDF', code: 'Code', data: 'Data', supplement: 'Supplement' },
    renameAsk: 'New name (under attachments/)', removeAsk: (p) => `Remove “${p}”? (In a working folder a backup is kept in .cache/edits/.)`,
    exists: (p) => `“${p}” already exists: remove or rename it first`, bad: (p, w) => `“${p}” is not an allowed name (${w})`,
    tooLarge: (p, n) => `“${p}” is too large (${MB(n)}; at most ${MB(ATTACH_LIMITS.fileBytes)} each)`, total: `The attachments would be over ${MB(ATTACH_LIMITS.totalBytes)} together`,
    count: `At most ${ATTACH_LIMITS.count} attachments`, added: (n) => `Added ${n}`, removed: (p) => `Removed ${p}`, renamed: (a, b) => `Renamed ${a} → ${b}`,
    saved: 'Role and title written', portableNote: 'Press Save to keep it in the file (only the attachment regions are rewritten)', fail: 'Failed: ', cancel: 'Cancel', ok: 'OK',
    problems: 'Notes',
  },
};
// 足したファイルの役割の案（拡張子から。書くのは選んだ役割）
export function guessRole(name) {
  const ext = (String(name).match(/\.([^./]+)$/)?.[1] || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['tex', 'bib', 'doc', 'docx', 'odt', 'md', 'rtf', 'pptx', 'key'].includes(ext)) return 'source';
  if (['py', 'ipynb', 'js', 'mjs', 'ts', 'r', 'jl', 'm', 'c', 'h', 'cpp', 'rs', 'go', 'java', 'sh', 'zip', 'tar', 'gz'].includes(ext)) return 'code';
  if (['csv', 'tsv', 'json', 'xlsx', 'xls', 'parquet', 'h5', 'hdf5', 'npz', 'npy', 'sqlite', 'db', 'xml'].includes(ext)) return 'data';
  return 'supplement';
}
// ファイル名を添付のパスに（危ない字は _ に。名前の規則は kit/core/attachments.mjs）
export const attachPathOf = (name) => ATTACH_PREFIX + String(name).normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/g, '_').replace(/[. ]+$/, '_').trim();

export function createAttachPanel(o) {
  const X = STR[o.lang === 'en' ? 'en' : 'ja'];
  const el = o.el;
  let busy = false;

  async function readConfig(ws) {
    let text = null;
    try { text = await ws.readText(CFG, { max: READ_LIMITS.json }); } catch { text = null; }
    if (text == null) return { conf: {}, text: null };
    try { const c = JSON.parse(text); return { conf: c && typeof c === 'object' && !Array.isArray(c) ? c : {}, text }; } catch { return { conf: {}, text, bad: true }; }
  }
  async function state() {
    const ws = o.ws();
    const L = await ws.list();
    const files = [...L.files].filter(([rel]) => isAttachPath(rel)).map(([rel, f]) => ({ path: rel, size: f.s }));
    const { conf, bad } = await readConfig(ws);
    const plan = planAttachments(files, conf);
    const { entries } = configEntries(conf);
    return { ws, files, conf, bad, plan, entries };
  }
  // 設定のファイルの添付の一覧を書き直す（ほかの項目と、各項目の知らない項目はそのまま。消えたファイルの項目は消す）
  async function writeConfig(ws, conf, list) {
    const out = { ...conf };
    if (list.length) out[KEY] = list; else delete out[KEY];
    const text = JSON.stringify(out, null, 2) + '\n';
    if (await ws.exists(CFG)) await ws.backup(CFG, { max: READ_LIMITS.json });
    await ws.writeText(CFG, text);
  }
  const listOf = (st) => [...st.entries.values()].map((e) => ({ ...e }));
  // 書き込み：作業場所と代が始めたときのままのときだけ。権利の確認（1 ファイル）は beforeWrite。
  // 書き込みは 1 つずつ順に（前の書き込みと組み直しが終わる前の操作も捨てない。どれも始めるときの状態を読み直す）
  let queue = Promise.resolve(), pending = 0;
  const hold = () => { pending++; busy = true; return () => { if (--pending === 0) busy = false; }; };
  // 確かめる窓（名前を替える・消す）を開いているあいだも busy（窓を閉じてから書き始めるまでのすきまを作らない）
  const held = (f) => async (...a) => { const release = hold(); try { return await f(...a); } finally { release(); } };
  function write(fn, done) {
    const release = hold();
    const run = queue.then(() => writeNow(fn, done));
    queue = run.catch((e) => o.toast(X.fail + ((e && e.message) || e), true)).finally(release);
    return queue;
  }
  async function writeNow(fn, done) {
    const why = await o.beforeWrite();
    if (why) { o.toast(why, true); return; }
    const ws = o.ws(), g = o.generation();
    if (!ws) return;
    try {
      const st = await state();
      if (o.ws() !== ws || o.generation() !== g) return;
      const msg = await fn(st);
      if (msg === null) return;
      await o.afterWrite();
      if (msg) o.toast(msg + (ws.kind === 'memory' ? ' · ' + X.portableNote : ''));
      if (done) done();
    } catch (e) { o.toast(X.fail + (e.message || e), true); }
    finally { if (o.isOpen()) await render(); }
  }

  async function addFiles(list) {
    await write(async (st) => {
      const have = new Map(st.files.map((f) => [f.path.toLowerCase(), f]));
      let total = st.plan.total, n = st.plan.include.length;
      const entries = listOf(st);
      const adds = [];
      for (const f of list) {
        const p = attachPathOf(f.name);
        const why = attachPathProblem(p);
        if (why) { o.toast(X.bad(p, why), true); return null; }
        if (have.has(p.toLowerCase()) || adds.some((a) => a.p.toLowerCase() === p.toLowerCase())) { o.toast(X.exists(p), true); return null; }
        if (f.size > ATTACH_LIMITS.fileBytes) { o.toast(X.tooLarge(p, f.size), true); return null; }
        if (total + f.size > ATTACH_LIMITS.totalBytes) { o.toast(X.total, true); return null; }
        if (++n > ATTACH_LIMITS.count) { o.toast(X.count, true); return null; }
        total += f.size;
        adds.push({ p, f });
      }
      for (const { p, f } of adds) {
        const bytes = await readFileBounded(f, { max: ATTACH_LIMITS.fileBytes, what: f.name });
        await st.ws.writeBytes(p, bytes);
        entries.push({ path: p, role: guessRole(f.name) });
      }
      await writeConfig(st.ws, st.conf, entries);
      return X.added(adds.length);
    });
  }
  const remove = held(async (p) => {
    const v = await o.ask({ title: X.title, body: [el('p', { id: 'attach-remove-ask', text: X.removeAsk(p) })], buttons: [{ id: 'cancel', label: X.cancel }, { id: 'ok', label: X.remove, pri: true }] });
    if (v !== 'ok') return;
    await write(async (st) => {
      if (st.files.some((f) => f.path === p)) await st.ws.remove(p, { max: ATTACH_LIMITS.fileBytes });
      await writeConfig(st.ws, st.conf, listOf(st).filter((e) => e.path !== p));
      return X.removed(p);
    });
  });
  const rename = held(async (p) => {
    const input = el('input', { type: 'text', id: 'attach-rename-input', value: p.slice(ATTACH_PREFIX.length) });
    const v = await o.ask({ title: X.rename, body: [el('label', {}, [el('span', { text: X.renameAsk }), input])], buttons: [{ id: 'cancel', label: X.cancel }, { id: 'ok', label: X.ok, pri: true }] });
    if (v !== 'ok') return;
    const q = ATTACH_PREFIX + input.value.trim().normalize('NFC');
    if (q === p) return;
    const why = attachPathProblem(q);
    if (why) { o.toast(X.bad(q, why), true); return; }
    await write(async (st) => {
      if (st.files.some((f) => f.path.toLowerCase() === q.toLowerCase())) { o.toast(X.exists(q), true); return null; }
      const bytes = await st.ws.readBytes(p, { max: ATTACH_LIMITS.fileBytes });
      await st.ws.writeBytes(q, bytes);
      await st.ws.remove(p, { max: ATTACH_LIMITS.fileBytes });
      const entries = listOf(st);
      const e = entries.find((x) => x.path === p);
      if (e) e.path = q; else entries.push({ path: q, role: guessRole(q) });
      await writeConfig(st.ws, st.conf, entries);
      return X.renamed(p, q);
    });
  });
  async function setMeta(p, role, title) {
    await write(async (st) => {
      const entries = listOf(st);
      let e = entries.find((x) => x.path === p);
      if (!e) { e = { path: p }; entries.push(e); }
      if (role) e.role = role; else delete e.role;
      if (title) e.title = title.slice(0, ATTACH_LIMITS.titleChars); else delete e.title;
      await writeConfig(st.ws, st.conf, entries);
      return X.saved;
    });
  }

  async function render() {
    const ws = o.ws();
    if (!ws) return;
    let st;
    try { st = await state(); } catch (e) { o.openPanel(X.title, [el('p', { text: X.fail + (e.message || e) })]); return; }
    const fileInput = el('input', { type: 'file', id: 'attach-file', multiple: 'multiple', hidden: 'hidden' });
    fileInput.addEventListener('change', () => { const fs = [...(fileInput.files || [])]; fileInput.value = ''; if (fs.length) addFiles(fs); });
    const rows = st.files.length ? st.files.map((f) => {
      const e = st.entries.get(f.path) || {};
      const sel = el('select', { 'data-attach-role': f.path, 'aria-label': X.role + ' ' + f.path }, [el('option', { value: '', text: X.noRole }), ...ATTACH_ROLES.map((r) => el('option', { value: r, text: X.roles[r] }))]);
      sel.value = ATTACH_ROLES.includes(e.role) ? e.role : '';
      const title = el('input', { type: 'text', 'data-attach-title': f.path, 'aria-label': X.titleL + ' ' + f.path, placeholder: X.titleL, maxlength: String(ATTACH_LIMITS.titleChars) });
      title.value = typeof e.title === 'string' ? e.title : '';
      const commit = () => { const t = title.value.trim(); if (sel.value !== (ATTACH_ROLES.includes(e.role) ? e.role : '') || t !== (typeof e.title === 'string' ? e.title : '')) setMeta(f.path, sel.value, t); };
      sel.addEventListener('change', commit); title.addEventListener('change', commit);
      return el('li', { cls: 'attach-row', 'data-attach': f.path }, [
        el('div', { cls: 'attach-name' }, [el('b', { text: f.path.slice(ATTACH_PREFIX.length) }), el('span', { cls: 'hint', text: ' · ' + MB(f.size) })]),
        el('div', { cls: 'attach-meta' }, [sel, title]),
        el('div', { cls: 'row' }, [el('button', { type: 'button', 'data-attach-rename': f.path, text: X.rename, onclick: () => rename(f.path) }), el('button', { type: 'button', 'data-attach-remove': f.path, text: X.remove, onclick: () => remove(f.path) })]),
      ]);
    }) : [el('li', { cls: 'hint', text: X.none })];
    const probs = st.plan.problems.filter((x) => x.code !== 'attachNoRole');
    o.openPanel(X.title, [el('div', { id: 'attach-panel' }, [
      el('p', { cls: 'hint', text: X.lead }),
      el('div', { cls: 'row' }, [el('button', { type: 'button', id: 'attach-add', cls: 'pri', text: X.add, onclick: () => fileInput.click() }), el('span', { cls: 'hint', text: X.limits })]),
      fileInput,
      el('ul', { id: 'attach-list', cls: 'attach-list' }, rows),
      probs.length ? el('div', { id: 'attach-problems' }, [el('b', { text: X.problems }), el('ul', {}, probs.map((x) => el('li', { text: message(o.lang === 'en' ? 'en' : 'ja', x.code, x) })))]) : null,
    ])]);
  }
  return { open: render, refresh: () => (o.isOpen() ? render() : null), isBusy: () => busy, guessRole };
}
