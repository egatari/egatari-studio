// 開いたデッキの組み立てと判定を Worker（app/build-worker.js）で動かす口。期限（既定 60 秒）を過ぎたら Worker を止めて（terminate）断る
// （build-timeout。次の組み立ては新しい Worker で）。組み立ての上限（kit/core/build-core.mjs の BUILD_LIMITS）は Worker の中でも同じ
//   const b = createBuildClient(RES, loadLazy)
//   await b.build(ws, listing, file, opts, prefix, {timeout})   → {html, trusted, stats, slides, reasons}
//   await b.exportIndex(ws, file, opts, {timeout})              → {index}
//   await b.scan(files, entry, {timeout})                       → 理由の配列
//   b.probe(name)                                               試験：Worker の大域変数
// 作業場所（ws）の読み出しは Worker からの問い合わせに答える（ws.readBytes・ws.list）。Worker は作業場所に書けない
import WORKER_SRC from 'virtual:build-worker';

export const BUILD_TIMEOUT_MS = 60000;
// 一覧（{files: Map(rel → {m, s, h?}), dirs}）を Worker に渡せる形に（ファイルのハンドルなどは渡さない。大きさと時刻だけ）
const plain = (L) => ({ files: new Map([...L.files].map(([k, f]) => [k, { m: f.m, s: f.s }])), dirs: new Set(L.dirs) });

export function createBuildClient(res, loadLazy) {
  let worker = null, seq = 0, wsSeq = 0;
  const waiting = new Map();
  const wsIds = new WeakMap(), wsById = new Map();
  const idOf = (ws) => {
    if (!wsIds.has(ws)) { const id = ++wsSeq; wsIds.set(ws, id); wsById.set(id, ws); while (wsById.size > 4) wsById.delete(wsById.keys().next().value); }
    return wsIds.get(ws);
  };
  const fail = (code, message) => {
    for (const w of waiting.values()) w.reject(Object.assign(new Error(message), { code }));
    waiting.clear();
    if (worker) { worker.terminate(); worker = null; }
  };
  async function answer(m) {
    const reply = (ok, value, err) => { if (worker) worker.postMessage(ok ? { rpcReply: m.rpc, ok: true, value } : { rpcReply: m.rpc, ok: false, error: { code: (err && err.code) || 'error', message: String((err && err.message) || err) } }); };
    try {
      if (m.op === 'lazy') return reply(true, await loadLazy(m.arg));
      const ws = wsById.get(m.arg.ws);
      if (!ws) throw Object.assign(new Error('the workspace was closed'), { code: 'ENOENT' });
      if (m.op === 'read') return reply(true, await ws.readBytes(m.arg.rel));
      if (m.op === 'list') return reply(true, plain(await ws.list(m.arg.o)));
      throw new Error('unknown request ' + m.op);
    } catch (err) { reply(false, null, err); }
  }
  function getWorker() {
    if (worker) return worker;
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    worker = new Worker(url, { name: 'deck-builder' });
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.rpc) { answer(m); return; }
      const w = waiting.get(m.id); if (!w) return;
      waiting.delete(m.id);
      if (m.ok) w.resolve(m.value); else w.reject(Object.assign(new Error(m.error.message), { code: m.error.code }));
    };
    worker.onerror = (e) => { e.preventDefault(); fail('worker', 'build worker failed: ' + (e.message || 'error')); };
    worker.postMessage({ init: true, res });
    return worker;
  }
  function call(msg, timeout = BUILD_TIMEOUT_MS) {
    let t = 0;
    return new Promise((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject });
      try { getWorker().postMessage({ ...msg, id }); } catch (e) { waiting.delete(id); reject(e); return; }
      t = setTimeout(() => fail('build-timeout', `building took longer than ${Math.round(timeout / 1000)} s (stopped)`), timeout);
    }).finally(() => clearTimeout(t));
  }
  return {
    build: (ws, listing, file, opts, prefix, o = {}) => call({ op: 'build', ws: idOf(ws), listing: plain(listing), file, opts, prefix }, o.timeout),
    exportIndex: (ws, file, opts, o = {}) => call({ op: 'exportIndex', ws: idOf(ws), file, opts }, o.timeout),
    scan: (files, entry, o = {}) => call({ op: 'scan', files, entry }, o.timeout),
    probe: (name) => call({ op: 'probe', name }),
    terminate: () => fail('cancelled', 'cancelled'),
  };
}
