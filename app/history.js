// 元に戻す・やり直し（handoff #86）：開いている文書の操作の履歴。スライドの操作（app/slides-panel.js）・原稿と台本の確定（app/devapi.js）・
// 最後に保存した状態に戻す・置換を、ファイルの前と後の中身で記録する。保存しても消さない。別の文書・フォルダを開いたら消す（clear）
// ブラウザの API を使わない（作業場所の口だけ。Node の単体の試験でも動く：tools/test-history.mjs）
//
//   const h = createHistory({ depth?, bytes?, onChange? })
//   h.record({ label, files: [{rel, before, after, max?}], at?, redoAt?, kind?, undo?(), redo?(), merge? })
//       before・after：文字列（テキスト）・Uint8Array（バイト）・null（ファイルがない）。前と後が同じファイルは記録しない
//       undo()・redo()：ファイルを書いた後に呼ぶ（メモリの上の状態を戻す・やり直す）。at：元に戻した後に見せる枚。redoAt：やり直した後
//       merge：直前の記録が同じ 1 つのファイルだけで、その後の中身がこの前の中身なら、直前の記録に足す（台本の保存の後の読み方の追加）
//       新しい記録はやり直しの列を消す。深さ（既定 100）と、持つ中身の大きさの合計（既定 64 MiB）を超えたら古いものから捨てる
//   await h.undo(ws, {live?}) / h.redo(ws, {live?}) → {ok: true, entry} | {ok: false, why: 'empty' | 'changed'}
//       書く前に、触るファイルが今も記録の後（やり直しは前）の中身かを確かめる。違えば書かずに 'changed' を返し、その列を捨てる
//       （その下の記録も、この記録の後の中身の上に積んだものなので）
//   h.canUndo()・h.canRedo()・h.peek('undo' | 'redo')・h.clear()・h.state()
//   filesMatch(ws, files, side)・writeFiles(ws, files, from, to, live)：作業場所の口で比べる・書く（ほかの道でも使う）
export const HISTORY_DEPTH = 100;
export const HISTORY_BYTES = 64 * 1024 * 1024;

const sizeOf = (v) => (v == null ? 0 : typeof v === 'string' ? v.length * 2 : v.byteLength);
export function same(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'string' || typeof b === 'string') return false;
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}
const cancelled = () => Object.assign(new Error('cancelled'), { name: 'Cancelled' });

// 今のファイルが want（文字列・バイト・null）と同じか。読めない（上限を超える）ときは違うものとする
async function matches(ws, f, want) {
  try {
    if (want == null) return !(await ws.exists(f.rel));
    if (typeof want === 'string') return (await ws.readText(f.rel, f.max ? { max: f.max } : undefined)) === want;
    if (!(await ws.exists(f.rel))) return false;
    return same(await ws.readBytes(f.rel, { max: f.max || Infinity }), want);
  } catch { return false; }
}
export async function filesMatch(ws, files, side) {
  for (const f of files) if (!(await matches(ws, f, f[side]))) return false;
  return true;
}
// files の各ファイルを from の中身から to の中身に書く（テキストは前に .cache/edits/ に控える。ないファイルにするものは消す：remove が控える）
export async function writeFiles(ws, files, from, to, live = () => true) {
  for (const f of files) {
    const a = f[from], b = f[to];
    if (!live()) throw cancelled();
    if (b == null) { if (await ws.exists(f.rel)) await ws.remove(f.rel, { live, max: f.max || Infinity }); continue; }
    if (typeof b === 'string') {
      if (typeof a === 'string') await ws.backup(f.rel, f.max ? { max: f.max } : {});
      if (!live()) throw cancelled();
      await ws.writeText(f.rel, b, { live });
    } else await ws.writeBytes(f.rel, b, { live });
  }
}

export function createHistory({ depth = HISTORY_DEPTH, bytes = HISTORY_BYTES, onChange = null } = {}) {
  let undo = [], redo = [];
  const changed = () => { if (onChange) onChange(); };
  const total = () => [...undo, ...redo].reduce((n, e) => n + e.size, 0);
  const sized = (e) => { e.size = e.files.reduce((n, f) => n + sizeOf(f.before) + sizeOf(f.after), 0); return e; };
  function trim() {
    while (undo.length > depth) undo.shift();
    // いちばん新しい 1 つは、大きくても残す
    while (undo.length > 1 && total() > bytes) undo.shift();
  }
  function record(e) {
    const files = (e.files || []).filter((f) => f && f.after !== undefined && !same(f.before, f.after));
    if (!files.length) return false;
    const top = undo[undo.length - 1];
    if (e.merge && top && !redo.length && top.files.length === 1 && files.length === 1 && top.files[0].rel === files[0].rel && same(top.files[0].after, files[0].before)) {
      top.files[0].after = files[0].after;
      sized(top);
      trim(); changed();
      return true;
    }
    undo.push(sized({ label: String(e.label || ''), files: files.map((f) => ({ rel: f.rel, before: f.before, after: f.after, max: f.max })),
      at: e.at, redoAt: e.redoAt === undefined ? e.at : e.redoAt, kind: e.kind || null, undo: e.undo || null, redo: e.redo || null }));
    redo = [];
    trim(); changed();
    return true;
  }
  async function step(dir, ws, { live = () => true } = {}) {
    const from = dir === 'undo' ? undo : redo, to = dir === 'undo' ? redo : undo;
    const e = from[from.length - 1];
    if (!e) return { ok: false, why: 'empty' };
    const [have, want] = dir === 'undo' ? ['after', 'before'] : ['before', 'after'];
    // 後ろから書くので、確かめも同じ順に（元に戻すは記録の逆順に、やり直しは記録の順に書く）
    const files = dir === 'undo' ? [...e.files].reverse() : e.files;
    if (!(await filesMatch(ws, files, have))) {
      if (dir === 'undo') undo = []; else redo = [];
      changed();
      return { ok: false, why: 'changed', entry: e };
    }
    if (!live()) throw cancelled();
    await writeFiles(ws, files, have, want, live);
    from.pop(); to.push(e);
    if (dir === 'undo' && e.undo) e.undo(); else if (dir === 'redo' && e.redo) e.redo();
    changed();
    return { ok: true, entry: e };
  }
  return {
    record,
    undo: (ws, o) => step('undo', ws, o),
    redo: (ws, o) => step('redo', ws, o),
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
    peek: (dir) => { const l = dir === 'redo' ? redo : undo; return l[l.length - 1] || null; },
    clear: () => { if (!undo.length && !redo.length) return; undo = []; redo = []; changed(); },
    state: () => ({ undo: undo.map((e) => e.label), redo: redo.map((e) => e.label), bytes: total() }),
  };
}
