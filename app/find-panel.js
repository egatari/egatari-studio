// 検索と置換（handoff #86）：スライド（原稿）と台本をまたいで 1 つの窓。道具の列の虫眼鏡のボタンと ⌘F・Ctrl+F（編集アプリの中にフォーカスがあるとき）で開く。
// 窓はモーダルにしない（開いたまま、プレビューで一致したスライドを見られる）。探す場所と置き換え方は kit/core/find-replace.mjs
// （タグ・属性・<script>・<style>・注釈・台本の見出しやステップの印は探さない。置換でマークアップを壊さない）。
// 次へ・前へ：一致のスライドへ（原稿の一致はその枚の最後のステップ、台本の一致はそのステップ）。
// 置換・すべて置換：スライドの操作と同じ流れ（ctx.apply = app/slides-panel.js の apply：読んだときのままか確かめて書き、履歴に 1 つ記録し、組み直す）。
// すべて置換は確かめてから。元に戻すで戻せる
//
//   createFindPanel(ctx)
//     ctx = {T（app/i18n.js の T.find）, el, cancel（キャンセルの言葉）, ws(), deckFile(), apply(fn), ask, toast, at()（今のスライドの番号）,
//            goSlide(i)（その枚の最後のステップへ）, goStep(slideKey, stepKey), enabled()（文書を開いているか）}
//   panel.open()・close()・isOpen()・state()（試験）
import { READ_LIMITS } from '../kit/core/bounded-read-core.mjs';
import { findMatches, replaceMatches } from '../kit/core/find-replace.mjs';

export function createFindPanel(ctx) {
  const { T, el } = ctx;
  let dlg = null, q, r, cs, count, posEl, res = { matches: [], slides: 0, script: 0 }, cur = -1, seq = 0, timer = 0, busy = false;
  const scope = () => (dlg.querySelector('input[name=find-scope]:checked') || {}).value || 'all';

  function build() {
    q = el('input', { type: 'text', id: 'find-q', autocomplete: 'off', spellcheck: 'false' });
    r = el('input', { type: 'text', id: 'find-r', autocomplete: 'off', spellcheck: 'false' });
    cs = el('input', { type: 'checkbox', id: 'find-case' });
    count = el('span', { id: 'find-count' });
    posEl = el('span', { id: 'find-pos', cls: 'hint' });
    const radio = (v, label, on) => el('label', { cls: 'find-radio' }, [el('input', { type: 'radio', name: 'find-scope', id: 'find-scope-' + v, value: v, ...(on ? { checked: '' } : {}) }), el('span', { text: label })]);
    const btn = (id, label, fn) => el('button', { type: 'button', id, text: label, onclick: () => fn() });
    dlg = el('dialog', { id: 'find-dlg', 'aria-labelledby': 'find-title' }, [
      el('div', { cls: 'find-head' }, [el('h2', { id: 'find-title', text: T.title }), el('button', { type: 'button', id: 'find-close', cls: 'ghost', 'aria-label': T.close, title: T.close, text: '✕', onclick: () => close() })]),
      el('div', { cls: 'find-grid' }, [el('label', { for: 'find-q', text: T.find }), q, el('label', { for: 'find-r', text: T.with }), r]),
      el('div', { role: 'radiogroup', id: 'find-scope', 'aria-label': T.scope, cls: 'find-scope' }, [radio('all', T.all, true), radio('slides', T.slides), radio('script', T.script)]),
      el('label', { cls: 'find-case' }, [cs, el('span', { text: T.matchCase })]),
      el('p', { cls: 'find-status', role: 'status', 'aria-live': 'polite' }, [count, ' ', posEl]),
      el('div', { cls: 'row find-buttons' }, [btn('find-prev', T.prev, () => move(-1)), btn('find-next', T.next, () => move(1)), btn('find-replace', T.replace, () => replaceOne()), btn('find-all', T.replaceAll, () => replaceAll())]),
    ]);
    document.body.append(dlg);
    const later = () => { clearTimeout(timer); timer = setTimeout(() => { cur = -1; refresh(); }, 120); };
    q.addEventListener('input', later);
    cs.addEventListener('change', later);
    dlg.querySelector('#find-scope').addEventListener('change', later);
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target === q) { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Enter' && e.target === r && !e.shiftKey) { e.preventDefault(); replaceOne(); }
    });
    // 道具の列のキー（e・n・c、プレビューへの送り）にしない
    dlg.addEventListener('keyup', (e) => e.stopPropagation());
  }
  async function read() {
    const ws = ctx.ws();
    if (!ws) return { deck: null, narr: null };
    return { deck: await ws.readText(ctx.deckFile(), { max: READ_LIMITS.source }), narr: await ws.readText('narration.md', { max: READ_LIMITS.narration }) };
  }
  const opts = () => ({ query: q.value, matchCase: cs.checked, scope: scope() });
  // 今の原稿と台本で数え直す
  async function refresh() {
    const s = ++seq;
    let f;
    try { f = await read(); } catch { f = { deck: null, narr: null }; }
    if (s !== seq || !dlg) return res;
    res = findMatches({ deck: f.deck, narr: f.narr, ...opts() });
    if (cur >= res.matches.length) cur = res.matches.length ? res.matches.length - 1 : -1;
    draw();
    return res;
  }
  function draw() {
    const n = res.matches.length;
    count.textContent = !q.value ? '' : n ? T.count(n, res.slides, res.script) : T.none;
    posEl.textContent = n && cur >= 0 ? `${cur + 1} / ${n}` : '';
    for (const id of ['find-prev', 'find-next', 'find-replace', 'find-all']) dlg.querySelector('#' + id).disabled = !n || busy;
  }
  function show(m) {
    if (!m) return;
    if (m.file === 'deck') { if (Number.isFinite(m.slide)) ctx.goSlide(m.slide); }
    else if (m.slideKey != null && m.slide != null) ctx.goStep(m.slideKey, m.stepKey);
  }
  async function move(d) {
    await refresh();
    const n = res.matches.length;
    if (!n) return;
    if (cur < 0) {
      // 初めの 1 回：今のスライドから（前へなら、今のスライドより前の最後の一致）
      const at = ctx.at() || 0;
      if (d > 0) { cur = res.matches.findIndex((m) => m.slide != null && m.slide >= at); if (cur < 0) cur = 0; }
      else { cur = -1; res.matches.forEach((m, i) => { if (m.slide != null && m.slide < at) cur = i; }); if (cur < 0) cur = n - 1; }
    } else cur = (cur + d + n) % n;
    draw();
    show(res.matches[cur]);
  }
  // 1 つ置換：選んでいる一致（まだなければ、次の一致を選ぶだけ）
  async function replaceOne() {
    if (busy) return;
    await refresh();
    if (cur < 0 || !res.matches[cur]) { await move(1); return; }
    const want = res.matches[cur], o = opts(), rep = r.value, i = cur;
    await write((b) => {
      const m = findMatches({ deck: b.deck, narr: b.narr, ...o }).matches[i];
      if (!m || m.file !== want.file || m.start !== want.start || m.end !== want.end) return null;
      return { list: [m], at: m.slide };
    }, rep);
    await refresh();
    show(res.matches[cur]);
  }
  async function replaceAll() {
    if (busy) return;
    await refresh();
    const n = res.matches.length;
    if (!n) return;
    const v = await ctx.ask({ title: T.replaceAll, body: [el('p', { id: 'find-confirm', text: T.confirmAll(n) })], buttons: [{ id: 'cancel', label: ctx.cancel }, { id: 'replace', label: T.replaceAll, pri: true }] });
    if (v !== 'replace') return;
    const o = opts(), rep = r.value;
    await write((b) => {
      const all = findMatches({ deck: b.deck, narr: b.narr, ...o }).matches;
      return all.length ? { list: all, at: ctx.at() } : null;
    }, rep);
    cur = -1;
    await refresh();
  }
  // pick(読んだときの中身) → {list: 一致, at} | null
  async function write(pick, rep) {
    busy = true; draw();
    try {
      await ctx.apply(async (b) => {
        const p = pick(b);
        if (!p || !p.list.length) return null;
        const deck = p.list.some((m) => m.file === 'deck') ? replaceMatches(b.deck, p.list, rep, 'deck') : b.deck;
        const narr = p.list.some((m) => m.file === 'narr') ? replaceMatches(b.narr, p.list, rep, 'narr') : b.narr;
        const at = Number.isFinite(p.at) ? p.at : ctx.at() || 0;
        return { deck, narr, man: b.man, at, undoAt: at, label: T.undo, done: T.done(p.list.length), quiet: true };
      });
    } finally { busy = false; draw(); }
  }
  function open() {
    if (!ctx.enabled()) return false;
    if (!dlg) build();
    if (!dlg.open) dlg.show();
    q.focus(); q.select();
    refresh();
    return true;
  }
  function close() {
    if (!dlg || !dlg.open) return;
    clearTimeout(timer);
    dlg.close();
  }
  return {
    open, close, isOpen: () => !!(dlg && dlg.open),
    state: () => ({ open: !!(dlg && dlg.open), n: res.matches.length, slides: res.slides, script: res.script, cur, busy, count: count ? count.textContent : '' }),
  };
}
