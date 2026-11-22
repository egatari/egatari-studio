// 画像を挿入…（スライド ▾。handoff #85）：対象のスライドの本文に画像を 1 つ足す窓
// 入れ方：「画像を選ぶ…」・窓への貼り付け・窓へのドロップ（編集パネルの HTML の欄へのドロップもこの窓をそのファイルで開く：server/editor-ui.js の imageDrop）。
// 置き方（自由な配置はしない）・代替テキスト（必須。飾りなら alt=""）・出すステップを選び、原稿に <img src="data:…"> を書く（kit/core/image-insert.mjs）。
// 作業フォルダでも 1 ファイルでも同じ data: で埋め込む（figs/ には書かない。どちらでも同じ原稿になり、そのまま Egatari ファイルに入る）。
// 背景（#226 の data-background）は、プレーヤーと仕様にまだないので選択肢に出さない。
// 書き込みはスライドの操作と同じ流れ（app/slides-panel.js の apply）：読んだときのままか確かめて書き、組み直し、「元に戻す」で戻る
//
//   createImageInsert(ctx)   ctx = {T, el, ask, toast, apply(fn), at()（対象のスライド | null）, pos()（プレビューの位置 {i, max}）, guard() → 断る理由 | null,
//                                   readDeck() → 原稿の文字列 | null}
//                            → {open(file?)}
import { READ_LIMITS, ReadOverError, readFileBounded } from './bounded-read.js';
import { IMAGE_TYPES, PLACEMENTS, imageType, dataUrl, sizeNotice, slideSteps, insertImage } from '../kit/core/image-insert.mjs';

const MiB = 1048576;
// 原稿の上限（READ_LIMITS.source）に base64（4/3 倍）が収まる大きさまで読む
const FILE_MAX = Math.floor(READ_LIMITS.source * 3 / 4);
const MAX_STEPS = 30;
const utf8Length = (s) => new TextEncoder().encode(s).length;
const mb = (n) => (Math.round((n / MiB) * 10) / 10).toFixed(1);

export function createImageInsert(ctx) {
  const { T, el } = ctx;

  async function open(file) {
    const why = await ctx.guard();
    if (why) { ctx.toast(why, true); return false; }
    const i = ctx.at();
    if (i === null) { ctx.toast(T.noSlide, true); return false; }
    let steps = { max: 0, isStatic: false, concl: false };
    try { const d = await ctx.readDeck(); if (d) steps = slideSteps(d, i); } catch { /* 数えられない：最初からと 1 だけ */ }
    // パーツのステップは原稿からは数えられない：プレビューがその枚にいれば、その数（結論の行を除く）も見る
    const p = ctx.pos();
    if (!steps.isStatic && p && p.i === i && Number.isFinite(p.max)) steps.max = Math.max(steps.max, p.max - (steps.concl ? 1 : 0));

    const S = { bytes: null, mime: null, url: null };
    // ---------------------------------------------------------------- ファイル
    const input = el('input', { type: 'file', id: 'img-file', accept: IMAGE_TYPES.join(','), hidden: '', 'aria-label': T.imgPick });
    const pick = el('button', { type: 'button', id: 'img-pick', text: T.imgPick, onclick: () => input.click() });
    const name = el('span', { id: 'img-name', cls: 'hint' });
    const preview = el('img', { id: 'img-preview', alt: '', hidden: '' });
    const big = el('p', { id: 'img-big', cls: 'note warn', role: 'status', hidden: '' });
    const err = el('p', { id: 'img-err', cls: 'note bad', role: 'alert', hidden: '' });
    async function setFile(f) {
      err.hidden = true;
      let bytes;
      try { bytes = await readFileBounded(f, { max: FILE_MAX, what: f.name }); }
      catch (e) { err.textContent = e instanceof ReadOverError || (e && e.code === 'read-over') ? T.imgTooLarge(mb(f.size)) : String((e && e.message) || e); err.hidden = false; return; }
      const mime = imageType(bytes);
      if (!mime) { err.textContent = T.imgBadType; err.hidden = false; return; }
      S.bytes = bytes; S.mime = mime; S.url = dataUrl(bytes, mime);
      name.textContent = f.name || '';
      preview.src = S.url; preview.hidden = false;
      const n = sizeNotice(bytes.length);
      big.textContent = n ? T.imgBig(n) : ''; big.hidden = !n;
      sync();
    }
    input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; if (f) setFile(f); });

    // ---------------------------------------------------------------- 置き方
    const radio = (k) => el('label', {}, [el('input', { type: 'radio', name: 'img-place', value: k, id: 'img-place-' + k, ...(k === 'half' ? { checked: '' } : {}) }), el('span', { text: T.imgPlaces[k] })]);
    const place = el('fieldset', { id: 'img-place', cls: 'paste-kind img-place' }, [el('legend', { text: T.imgPlace }), ...PLACEMENTS.map(radio)]);

    // ---------------------------------------------------------------- 代替テキスト
    const alt = el('input', { type: 'text', id: 'img-alt', autocomplete: 'off', 'aria-required': 'true' });
    const deco = el('input', { type: 'checkbox', id: 'img-deco' });
    alt.addEventListener('input', () => sync());
    deco.addEventListener('change', () => { alt.disabled = deco.checked; sync(); });

    // ---------------------------------------------------------------- ステップ
    const step = el('select', { id: 'img-step' }, [el('option', { value: '0', text: T.imgStepStart }),
      ...(steps.isStatic ? [] : Array.from({ length: Math.min(MAX_STEPS, steps.max + 1) }, (_, k) => el('option', { value: String(k + 1), text: T.imgStepN(k + 1) })))]);
    if (steps.isStatic) step.disabled = true;

    // ---------------------------------------------------------------- 押せるか
    const goNote = el('span', { id: 'img-go-note', cls: 'hint paste-go-note', role: 'status' });
    const missing = () => (!S.url ? T.imgWhyFile : !deco.checked && !alt.value.trim() ? T.imgWhyAlt : '');
    function sync() {
      const b = document.getElementById('dlg-insert');
      if (!b || !wrap.isConnected) return;
      const m = missing();
      b.disabled = !!m;
      goNote.textContent = m; goNote.hidden = !m;
      if (b.previousSibling !== goNote) b.before(goNote);
      b.setAttribute('aria-describedby', 'img-go-note');
    }

    const wrap = el('div', { id: 'img-dialog', cls: 'img-dialog' }, [
      el('div', { cls: 'row img-file-row' }, [pick, name, input]), preview, big, err,
      place,
      el('label', { for: 'img-alt', id: 'img-alt-label', text: T.imgAlt }), alt,
      el('label', { cls: 'confirm', id: 'img-deco-label' }, [deco, el('span', { text: T.imgDeco })]),
      el('div', { cls: 'img-step-row' }, [el('label', { for: 'img-step', text: T.imgStep }), step]),
    ]);
    const asked = ctx.ask({ title: T.imgTitle, body: [wrap], buttons: [{ id: 'cancel', label: T.cancel }, { id: 'insert', label: T.imgGo, pri: true }],
      validate: (id) => id !== 'insert' || !missing() });
    // 窓（#dlg）への貼り付けとドロップ：画像のファイルだけを受ける（字の貼り付けはそのまま欄へ）
    const dlg = wrap.closest('dialog');
    const fileOf = (list) => [...(list || [])].find((f) => f && (IMAGE_TYPES.includes(f.type) || /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|svg)$/i.test(f.name || '')));
    const onPaste = (e) => {
      if (!wrap.isConnected) return;
      const items = e.clipboardData ? [...e.clipboardData.items || []].filter((x) => x.kind === 'file').map((x) => x.getAsFile()) : [];
      const f = fileOf(items.length ? items : e.clipboardData && e.clipboardData.files);
      if (f) { e.preventDefault(); setFile(f); }
    };
    const onOver = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
    const onDrop = (e) => { const f = e.dataTransfer && fileOf(e.dataTransfer.files); if (f || (e.dataTransfer && e.dataTransfer.files.length)) e.preventDefault(); if (f) setFile(f); else if (e.dataTransfer && e.dataTransfer.files.length) { err.textContent = T.imgBadType; err.hidden = false; } };
    if (dlg) { dlg.addEventListener('paste', onPaste); dlg.addEventListener('dragover', onOver); dlg.addEventListener('drop', onDrop); }
    sync();
    if (file) setFile(file); else pick.focus();
    let v;
    try { v = await asked; } finally { if (dlg) { dlg.removeEventListener('paste', onPaste); dlg.removeEventListener('dragover', onOver); dlg.removeEventListener('drop', onDrop); } }
    if (v !== 'insert' || !S.url) return false;
    const opts = { src: S.url, alt: deco.checked ? '' : alt.value, placement: (place.querySelector('input:checked') || {}).value || 'half', step: Number(step.value) || 0 };
    return ctx.apply(async (b, slides) => {
      if (!slides[i]) return null;
      const deck = insertImage(b.deck, i, opts);
      if (utf8Length(deck) > READ_LIMITS.source) { ctx.toast(T.imgTooLarge(mb(S.bytes.length)), true); return null; }
      return { deck, narr: b.narr, man: b.man, at: i, undoAt: i, label: T.imgUndo, done: T.imgDone };
    });
  }
  return { open };
}
