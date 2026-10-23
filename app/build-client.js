// 開いたデッキの組み立てと判定を Worker（app/build-worker.js）で動かす口。期限（既定 60 秒）を過ぎたら Worker を止めて（terminate）断る
// （build-timeout。次の組み立ては新しい Worker で）。組み立ての上限（kit/core/build-core.mjs の BUILD_LIMITS）は Worker の中でも同じ
//   const b = createBuildClient(RES, loadLazy)
//   await b.build(ws, listing, file, opts, prefix, {timeout})   → {html, trusted, stats, slides, theme, reasons}
//   await b.exportIndex(ws, file, opts, {timeout})              → {index}
//   await b.exportHtml(ws, file, opts, {timeout})               → {html}（持ち運べる 1 ファイル。AI の返事の貼り付け）
//   await b.scan(files, entry, {timeout})                       → 理由の配列
//   b.probe(name)                                               試験：Worker の大域変数
//   b.setThemes(tws)                                            利用者のテーマのフォルダ（app/theme-folder.js の themeFolderWorkspace。null で使わない）
// 作業場所（ws）の読み出しは Worker からの問い合わせに答える（ws.readBytes・ws.list）。Worker は作業場所に書けない
import WORKER_SRC from 'virtual:build-worker';

export const BUILD_TIMEOUT_MS = 60000;
// 一覧（{files: Map(rel → {m, s, h?}), dirs}）を Worker に渡せる形に（ファイルのハンドルなどは渡さない。大きさと時刻だけ）
const plain = (L) => ({ files: new Map([...L.files].map(([k, f]) => [k, { m: f.m, s: f.s }])), dirs: new Set(L.dirs) });

// Worker ごとの代（generation）：問い合わせ（rpc）と答えは、それを出した Worker の代に結び付ける。止めた（terminate）・古い Worker からの
// メッセージは捨て、その問い合わせには答えない（答えは出した Worker にだけ送る。新しい Worker に古い答えが届かない）。要求の番号は代をまたいで一意。
// 作業場所の読み出しは、その Worker に出した組み立ての要求（req）に結び付け、その要求の作業場所だけを読む。同時に読むのは代ごとに READ_CONCURRENCY まで、
// Worker を止めたら、まだ始めていない読み出しは始めない
export const READ_CONCURRENCY = 8;
export function createBuildClient(res, loadLazy, { WorkerClass = (typeof Worker === 'function' ? Worker : null) } = {}) {
  let worker = null, gen = 0, seq = 0, wsSeq = 0, themeWs = null;
  const waiting = new Map();          // 要求の番号 → {resolve, reject, gen, ws}
  const wsIds = new WeakMap();
  const idOf = (ws) => { if (!wsIds.has(ws)) wsIds.set(ws, ++wsSeq); return wsIds.get(ws); };
  const fail = (code, message, g = gen) => {
    if (g !== gen) return;            // もう替わった Worker の失敗（その要求はもう断ってある）
    for (const [id, w] of waiting) if (w.gen === g) { waiting.delete(id); w.reject(Object.assign(new Error(message), { code })); }
    if (worker) { const old = worker; worker = null; old.terminate(); }
  };
  // 代ごとの読み出しの数の上限
  function limiter(alive) {
    let active = 0; const queue = [];
    const pump = () => {
      while (active < READ_CONCURRENCY && queue.length) {
        const { fn, resolve, reject } = queue.shift();
        if (!alive()) { reject(Object.assign(new Error('cancelled: the build worker was stopped'), { code: 'cancelled' })); continue; }
        active++;
        Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; pump(); });
      }
    };
    return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump(); });
  }
  async function answer(me, g, lim, m) {
    const alive = () => worker === me && gen === g;
    const reply = (ok, value, err) => {
      if (!alive()) return;           // 止めた Worker には答えない
      me.postMessage(ok ? { rpcReply: m.rpc, gen: g, ok: true, value } : { rpcReply: m.rpc, gen: g, ok: false, error: { code: (err && err.code) || 'error', message: String((err && err.message) || err), ...(err && Number.isFinite(err.n) ? { n: err.n } : {}) } });
    };
    if (!alive()) return;
    try {
      if (m.op === 'lazy') return reply(true, await loadLazy(m.arg));
      // 利用者のテーマのフォルダ：今選んでいるフォルダで、この Worker にまだ終わっていない要求があるときだけ（読むだけ）
      if (m.op === 'tlist' || m.op === 'tread') {
        const tw = themeWs;
        if (!tw || idOf(tw) !== (m.arg && m.arg.ws) || ![...waiting.values()].some((w) => w.gen === g)) throw Object.assign(new Error('no theme folder for this build'), { code: 'ENOENT' });
        if (m.op === 'tlist') return reply(true, plain(await lim(() => tw.list())));
        return reply(true, await lim(() => tw.readBytes(m.arg.rel, Number.isFinite(m.arg.max) ? { max: m.arg.max } : {})));
      }
      if (m.op !== 'read' && m.op !== 'list') throw new Error('unknown request ' + m.op);
      // その Worker に出した、まだ終わっていない要求の作業場所だけ（要求の番号の要求か、同じ Worker に出した同じ作業場所の要求。
      // Worker の中で 2 つの要求が重なると、番号は後のものになる）
      const bound = (w) => w && w.gen === g && w.ws && idOf(w.ws) === (m.arg && m.arg.ws);
      let req = waiting.get(m.arg && m.arg.req);
      if (!bound(req)) req = [...waiting.values()].find(bound);
      if (!req) throw Object.assign(new Error('no pending build for this workspace'), { code: 'ENOENT' });
      const ws = req.ws;
      // max：読んでよいバイト数（Worker の組み立てが残りの上限から決める。作業場所が File.size で確かめ直す）
      if (m.op === 'read') return reply(true, await lim(() => ws.readBytes(m.arg.rel, Number.isFinite(m.arg.max) ? { max: m.arg.max } : {})));
      return reply(true, plain(await lim(() => ws.list(m.arg.o))));
    } catch (err) { reply(false, null, err); }
  }
  function getWorker() {
    if (worker) return worker;
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const me = new WorkerClass(url, { name: 'deck-builder' }), g = ++gen;
    worker = me;
    const lim = limiter(() => worker === me && gen === g);
    me.onmessage = (e) => {
      if (worker !== me || gen !== g) return;      // 止めた・古い Worker から
      const m = e.data || {};
      if (m.rpc) { answer(me, g, lim, m); return; }
      const w = waiting.get(m.id); if (!w || w.gen !== g) return;
      waiting.delete(m.id);
      if (m.ok) w.resolve(m.value); else w.reject(Object.assign(new Error(m.error.message), { code: m.error.code }));
    };
    me.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); if (worker !== me) return; fail('worker', 'build worker failed: ' + ((e && e.message) || 'error'), g); };
    me.postMessage({ init: true, res, gen: g });
    return me;
  }
  function call(msg, ws, timeout = BUILD_TIMEOUT_MS) {
    // メモリの上の作業場所（開いたファイル・deck.html だけ・AI の返事）では、ないファイルを知らせて空のまま組む（kit/core/build-core.mjs）
    if (ws && ws.kind === 'memory' && 'opts' in msg) msg = { ...msg, opts: { missingFiles: 'warn', ...(msg.opts || {}) } };
    if (ws) msg = { ...msg, themes: themeWs ? idOf(themeWs) : null };
    let t = 0;
    return new Promise((resolve, reject) => {
      const id = ++seq;
      let me;
      try { me = getWorker(); } catch (e) { reject(e); return; }
      const g = gen;
      waiting.set(id, { resolve, reject, gen: g, ws });
      try { me.postMessage({ ...msg, id }); } catch (e) { waiting.delete(id); reject(e); return; }
      t = setTimeout(() => { if (waiting.has(id)) fail('build-timeout', `building took longer than ${Math.round(timeout / 1000)} s (stopped)`, g); }, timeout);
    }).finally(() => clearTimeout(t));
  }
  return {
    build: (ws, listing, file, opts, prefix, o = {}) => call({ op: 'build', ws: idOf(ws), listing: plain(listing), file, opts, prefix }, ws, o.timeout),
    exportIndex: (ws, file, opts, o = {}) => call({ op: 'exportIndex', ws: idOf(ws), file, opts }, ws, o.timeout),
    exportHtml: (ws, file, opts, o = {}) => call({ op: 'exportHtml', ws: idOf(ws), file, opts }, ws, o.timeout),
    scan: (files, entry, o = {}) => call({ op: 'scan', files, entry }, null, o.timeout),
    probe: (name) => call({ op: 'probe', name }, null),
    setThemes: (tws) => { themeWs = tws || null; },
    terminate: () => fail('cancelled', 'cancelled'),
    get generation() { return gen; },
  };
}
