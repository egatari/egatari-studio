// 添付の板（編集アプリの横の板 #panel。format spec §3.8）：作業フォルダ・1 ファイル（.ega.html）の attachments/ の一覧、足す・消す・名前を替える、
// 役割（source・pdf・code・data・supplement）・題・説明。役割・題・説明は設定のファイル（FORMAT.CONFIG_FILE）の FORMAT.ATTACH_KEY に書く（kit/core/attachments.mjs）。
// 添付はこの画面では開かない・プレビューにも渡さない（読むのは大きさを確かめて作業場所に書くときだけ）。
// 1 ファイルでは作業場所はメモリの上なので、「保存」で段 A（kit/core/tier-a.mjs：添付の場所と索引だけ）の保存になる
//
//   const panel = createAttachPanel({ws(), generation(), lang, el, openPanel, isOpen(), toast, ask, beforeWrite() → null | 断る理由, afterWrite()})
//   足す・名前を替える・役割を替えるときは、§3.8 の役割ごとの型と中身の条件（kit/core/attach-content.mjs）で確かめ、合わなければ理由を言って断る
//   知らせの言葉は品質チェックと同じ（kit/check-messages.mjs の attach…）
//   panel.open() / panel.refresh()
import { FORMAT } from '../kit/core/format.mjs';
import { planAttachments, configEntries, attachPathProblem, attachMediaProblem, ATTACH_LIMITS, ATTACH_ROLES, ATTACH_PREFIX, isAttachPath,
  inspectAttachment, nameProblem, roleProblem, blocking, kindOfName, roleAllows, descriptionProblem, titleProblem, clipChars } from '../kit/core/attachments.mjs';
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { readFileBounded } from './bounded-read.js';
import { message } from '../kit/check-messages.mjs';

const CFG = FORMAT.CONFIG_FILE, KEY = FORMAT.ATTACH_KEY;
const MB = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const STR = {
  ja: {
    title: '添付（下書き・試行）', lead: `下書き・試行（形式の §3.8 の案）。読み手のためのファイル：PDF は PDF、データは CSV・TSV・JSON・テキスト・xlsx、コードはプログラムの原稿・ipynb・環境の定義、元の原稿は TeX・Markdown・テキスト・docx、補足は PNG・JPEG・WebP・PDF・テキスト。足すときに中身を確かめ、JavaScript や文書の外へ出る動作のある PDF・マクロや外への参照のある Office・実行できるもの・OS がスクリプトとして開く拡張子（.js・.bat など。JavaScript の原稿は .mjs・.cjs・.ts）・HTML・SVG・ZIP・音声と動画は断ります。${ATTACH_PREFIX} に置き、役割・題・説明は ${CFG} に書きます。1 ファイル（${FORMAT.FILE_EXT}）の再生ではダウンロードだけで（開かない・実行しない）、再生専用には入りません`,
    limits: `1 つ ${MB(ATTACH_LIMITS.fileBytes)}・合わせて ${MB(ATTACH_LIMITS.totalBytes)}・${ATTACH_LIMITS.count} 個まで`,
    none: 'まだありません', add: 'ファイルを足す…', role: '役割', noRole: '（役割なし：一覧に出ない）', titleL: '題', rename: '名前を替える…', remove: '消す',
    roles: { source: '元の原稿', pdf: 'PDF', code: 'コード', data: 'データ', supplement: '補足資料' },
    renameAsk: '新しい名前（attachments/ の下）', removeAsk: (p) => `「${p}」を消しますか？（作業フォルダでは .cache/edits/ に控えを残します）`,
    exists: (p) => `「${p}」はもうあります。先に消すか、名前を替えてください`, bad: (p, w) => `「${p}」は使えない名前です（${w}）`,
    tooLarge: (p, n) => `「${p}」は大きすぎます（${MB(n)}。1 つ ${MB(ATTACH_LIMITS.fileBytes)} まで）`, total: `添付を合わせると ${MB(ATTACH_LIMITS.totalBytes)} を超えます`,
    count: `添付は ${ATTACH_LIMITS.count} 個までです`, added: (n) => `${n} 個足しました`, removed: (p) => `消しました：${p}`, renamed: (a, b) => `名前を替えました：${a} → ${b}`,
    saved: '役割と題を書きました', portableNote: '1 ファイルに残すには「保存」を押してください（添付の場所だけを書き換えます）', fail: 'できませんでした：', cancel: '取消', ok: 'OK',
    problems: '気をつけること',
    media: (p, k) => `「${p}」は${k === 'video' ? '動画' : '音声'}です。音声と動画は添付にできません`, titles: '題（ダウンロードの一覧に出す短い名前。要ります）', needTitle: '題は要ります', add1: '足す',
    descL: '説明', descPh: '説明（1〜2 文）', refused: '断りました：', checking: '中身を確かめています…'
  },
  en: {
    title: 'Attachments (draft, experimental)', lead: `Draft, experimental (spec §3.8 draft). Files for readers: pdf takes PDF; data takes CSV, TSV, JSON, text and xlsx; code takes program source, ipynb and environment definitions; source takes TeX, Markdown, text and docx; supplement takes PNG, JPEG, WebP, PDF and text. Files are checked when added: PDFs with JavaScript or actions that leave the document, Office files with macros or external references, executables, extensions that operating systems run as scripts (.js, .bat, …; attach JavaScript source as .mjs, .cjs or .ts), HTML, SVG, ZIP, audio and video are refused. They live in ${ATTACH_PREFIX}; roles, titles and descriptions are written to ${CFG}. In a single file (${FORMAT.FILE_EXT}) the player only offers them for download (never opened or run); play-only files do not carry them`,
    limits: `up to ${MB(ATTACH_LIMITS.fileBytes)} each, ${MB(ATTACH_LIMITS.totalBytes)} together, ${ATTACH_LIMITS.count} files`,
    none: 'None yet', add: 'Add files…', role: 'Role', noRole: '(no role: not listed)', titleL: 'Title', rename: 'Rename…', remove: 'Remove',
    roles: { source: 'Source', pdf: 'PDF', code: 'Code', data: 'Data', supplement: 'Supplement' },
    renameAsk: 'New name (under attachments/)', removeAsk: (p) => `Remove “${p}”? (In a working folder a backup is kept in .cache/edits/.)`,
    exists: (p) => `“${p}” already exists: remove or rename it first`, bad: (p, w) => `“${p}” is not an allowed name (${w})`,
    tooLarge: (p, n) => `“${p}” is too large (${MB(n)}; at most ${MB(ATTACH_LIMITS.fileBytes)} each)`, total: `The attachments would be over ${MB(ATTACH_LIMITS.totalBytes)} together`,
    count: `At most ${ATTACH_LIMITS.count} attachments`, added: (n) => `Added ${n}`, removed: (p) => `Removed ${p}`, renamed: (a, b) => `Renamed ${a} → ${b}`,
    saved: 'Role and title written', portableNote: 'Press Save to keep it in the file (only the attachment regions are rewritten)', fail: 'Failed: ', cancel: 'Cancel', ok: 'OK',
    problems: 'Notes',
    media: (p, k) => `“${p}” is ${k === 'video' ? 'a video' : 'audio'}: audio and video cannot be attached`, titles: 'Titles (short names for the download list; required)', needTitle: 'A title is required', add1: 'Add',
    descL: 'Description', descPh: 'Description (one or two sentences)', refused: 'Refused: ', checking: 'Checking the contents…'
  },
};
// 足したファイルの役割の案（名前の型から、その型を受ける役割。書くのは選んだ役割）。どの役割にもない型は null（足せない）
export function guessRole(name) {
  const k = kindOfName(ATTACH_PREFIX + String(name));
  if (!k || !k.kind) return null;
  if (/\.bib$/i.test(String(name))) return 'source';
  const order = { pdf: 'pdf', png: 'supplement', jpeg: 'supplement', webp: 'supplement', text: 'supplement', csv: 'data', tsv: 'data', json: 'data', xlsx: 'data',
    code: 'code', env: 'code', ipynb: 'code', tex: 'source', markdown: 'source', docx: 'source' };
  return order[k.kind] || ATTACH_ROLES.find((r) => roleAllows(r, k.kind)) || null;
}
// ファイル名を添付のパスに（危ない字は _ に。名前の規則は kit/core/attachments.mjs）
export const attachPathOf = (name) => ATTACH_PREFIX + String(name).normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\\/:*?"<>|]/g, '_').replace(/[. ]+$/, '_').trim();

export function createAttachPanel(o) {
  const X = STR[o.lang === 'en' ? 'en' : 'ja'];
  const el = o.el;
  let busy = false;
  const msgOf = (x) => message(o.lang === 'en' ? 'en' : 'ja', x.code, x);
  // 中身の検査（§3.8）の結果：パスと大きさごとに覚える（板を描き直すたびに読み直さない。書き込みで消す）
  const content = new Map();
  async function contentOf(ws, f) {
    const c = content.get(f.path);
    if (c && c.size === f.size) return c.problems;
    let problems = [];
    if (f.size <= ATTACH_LIMITS.fileBytes) { try { problems = (await inspectAttachment(f.path, await ws.readBytes(f.path, { max: ATTACH_LIMITS.fileBytes }))).problems; } catch { problems = []; } }
    content.set(f.path, { size: f.size, problems });
    return problems;
  }

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
    for (const f of files) f.problems = await contentOf(ws, f);
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
    content.clear();
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

  // 題の案：ファイル名から拡張子を除いたもの（なければファイル名）
  const titleOf = (name) => { const n = String(name).normalize('NFC').trim(); const t = n.replace(/\.[^.]+$/, '').trim(); return clipChars(t || n, ATTACH_LIMITS.titleChars); };
  const addFiles = held(async (list) => {
    // 読む前に断れるもの：名前・音声と動画（拡張子）・1 つの大きさ
    for (const f of list) {
      const p = attachPathOf(f.name);
      const why = attachPathProblem(p);
      if (why) { o.toast(X.bad(p, why), true); return; }
      const media = attachMediaProblem(p);
      if (media) { o.toast(X.media(p, media.kind), true); return; }
      // 形式（§3.8）：名前から許されない型・どの役割にもない型は、題を尋ねる前に断る
      const np = nameProblem(p);
      if (np) { o.toast(X.refused + msgOf(np), true); return; }
      if (f.size > ATTACH_LIMITS.fileBytes) { o.toast(X.tooLarge(p, f.size), true); return; }
    }
    // 題（要る）：ファイル名から埋めておき、直せる
    const inputs = list.map((f, i) => el('input', { type: 'text', id: 'attach-new-title-' + i, value: titleOf(f.name), maxlength: String(ATTACH_LIMITS.titleChars), 'aria-label': X.titleL + ' ' + f.name }));
    const v = await o.ask({ title: X.title, body: [el('p', { id: 'attach-titles', text: X.titles }), ...list.map((f, i) => el('label', {}, [el('span', { text: f.name }), inputs[i]]))], buttons: [{ id: 'cancel', label: X.cancel }, { id: 'ok', label: X.add1, pri: true }] });
    if (v !== 'ok') return;
    const titles = inputs.map((x) => clipChars(x.value.trim(), ATTACH_LIMITS.titleChars));
    if (titles.some((t) => !t)) { o.toast(X.needTitle, true); return; }
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
      // 中身で音声・動画を見分け、§3.8 の役割ごとの型と条件で確かめる（全部読んでから、どれも書く前に。断る理由は品質チェックと同じ言葉）
      const read = [], notes = [];
      for (const { p, f } of adds) {
        const bytes = await readFileBounded(f, { max: ATTACH_LIMITS.fileBytes, what: f.name });
        const media = attachMediaProblem(p, bytes.subarray(0, 64));
        if (media) { o.toast(X.media(p, media.kind), true); return null; }
        const role = guessRole(f.name);
        const probs = [...(await inspectAttachment(p, bytes)).problems, roleProblem(p, role)].filter(Boolean);
        const bad = probs.find(blocking);
        if (bad) { o.toast(X.refused + msgOf(bad), true); return null; }
        for (const x of probs) notes.push(msgOf(x));
        read.push({ p, f, bytes, role, title: titles[list.indexOf(f)] });
      }
      for (const { p, bytes, role, title } of read) {
        await st.ws.writeBytes(p, bytes);
        entries.push({ path: p, role, title });
      }
      await writeConfig(st.ws, st.conf, entries);
      return X.added(adds.length) + (notes.length ? ' · ' + notes.join(' · ') : '');
    });
  });
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
    const media = attachMediaProblem(q);
    if (media) { o.toast(X.media(q, media.kind), true); return; }
    const np = nameProblem(q);
    if (np) { o.toast(X.refused + msgOf(np), true); return; }
    await write(async (st) => {
      if (st.files.some((f) => f.path.toLowerCase() === q.toLowerCase())) { o.toast(X.exists(q), true); return null; }
      const bytes = await st.ws.readBytes(p, { max: ATTACH_LIMITS.fileBytes });
      // 新しい名前の型で、中身と役割を確かめ直す（拡張子を替えると型が変わる）
      const cur = st.entries.get(p);
      const probs = [...(await inspectAttachment(q, bytes)).problems, roleProblem(q, cur && ATTACH_ROLES.includes(cur.role) ? cur.role : guessRole(q))].filter(Boolean);
      const bad = probs.find(blocking);
      if (bad) { o.toast(X.refused + msgOf(bad), true); return null; }
      await st.ws.writeBytes(q, bytes);
      await st.ws.remove(p, { max: ATTACH_LIMITS.fileBytes });
      const entries = listOf(st);
      const e = entries.find((x) => x.path === p);
      if (e) e.path = q; else entries.push({ path: q, role: guessRole(q), title: titleOf(q.split('/').pop()) });
      await writeConfig(st.ws, st.conf, entries);
      return X.renamed(p, q);
    });
  });
  async function setMeta(p, role, title, description) {
    // 役割と型の組（§3.8）・題と説明の形（120 字・300 字まで、1 行）：書く前に断る
    const rp = role ? roleProblem(p, role) : null;
    if (rp) { o.toast(X.refused + msgOf(rp), true); if (o.isOpen()) await render(); return; }
    const tp = title ? titleProblem(title) : null;
    if (tp) { o.toast(X.refused + msgOf({ code: 'attachBadTitle', path: p, why: tp, max: ATTACH_LIMITS.titleChars }), true); if (o.isOpen()) await render(); return; }
    const dp = description ? descriptionProblem(description) : null;
    if (dp) { o.toast(X.refused + msgOf({ code: 'attachBadDescription', path: p, why: dp, max: ATTACH_LIMITS.descriptionChars }), true); if (o.isOpen()) await render(); return; }
    await write(async (st) => {
      const entries = listOf(st);
      let e = entries.find((x) => x.path === p);
      if (!e) { e = { path: p }; entries.push(e); }
      if (role) e.role = role; else delete e.role;
      if (title) e.title = title; else delete e.title;
      if (description) e.description = description; else delete e.description;
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
      // 説明（description。1〜2 文。ダウンロードの一覧の題の下に出る）
      const desc = el('input', { type: 'text', 'data-attach-desc': f.path, 'aria-label': X.descL + ' ' + f.path, placeholder: X.descPh, maxlength: String(ATTACH_LIMITS.descriptionChars) });
      desc.value = typeof e.description === 'string' ? e.description : '';
      const commit = () => {
        const t = title.value.trim(), d = desc.value.trim();
        if (!t && typeof e.title === 'string' && e.title.trim()) { o.toast(X.needTitle, true); title.value = e.title; return; }
        if (sel.value !== (ATTACH_ROLES.includes(e.role) ? e.role : '') || t !== (typeof e.title === 'string' ? e.title : '') || d !== (typeof e.description === 'string' ? e.description : '')) setMeta(f.path, sel.value, t, d);
      };
      sel.addEventListener('change', commit); title.addEventListener('change', commit); desc.addEventListener('change', commit);
      return el('li', { cls: 'attach-row', 'data-attach': f.path }, [
        el('div', { cls: 'attach-name' }, [el('b', { text: f.path.slice(ATTACH_PREFIX.length) }), el('span', { cls: 'hint', text: ' · ' + MB(f.size) })]),
        el('div', { cls: 'attach-meta' }, [sel, title]),
        el('div', { cls: 'attach-desc' }, [desc]),
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
