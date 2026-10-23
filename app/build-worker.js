// デッキを組む・コードが動くかを決める Worker（tools/build-app.mjs が 1 本にまとめて main.js に文字列で入れる。app/build-client.js が使う）。
// 開いたデッキ（フォルダ・持ち運べる 1 ファイル）の組み立て（kit/core/build-core.mjs）と判定（kit/core/code-scan.mjs）を、ページの外で動かす：
// 重い原稿でもページは固まらず、期限を過ぎれば親が Worker ごと止める（terminate。解析の途中でも止まる）。何も実行しない（DOM もない）
//
// 親から：{init, res}（同梱の資源。Worker を作るたびに 1 回）
//         {id, op: 'build', ws, listing, file, opts, prefix}   組んで {html, trusted, stats, slides, theme, previewAudio, reasons}（theme：テーマの名前と寸法の宣言 {name, metrics, declared}。previewAudio：opts.previewAudio のときの音声の印。reasons：prefix（信頼する先頭部分）+ 組んだ文書から決めた理由）
//         {id, op: 'exportIndex', ws, file, opts}               持ち運べる形式に書き出したときの索引だけ（部品庫の照合に使う）
//         {id, op: 'exportHtml', ws, file, opts}                持ち運べる形式に書き出した文書（AI の返事の貼り付け。app/llm.js）
//         {id, op: 'scan', files, entry}                        取り出した原稿の全体の理由（codeReasons）
//         {id, op: 'probe', name}                               試験：Worker の大域変数
// 作業場所のファイルは親に問い合わせて読む（{rpc, gen, op: 'read' | 'list' | 'lazy', arg} → 親が {rpcReply, gen, ok, value}）。
// read・list の arg には、その読み出しを要る要求の番号（req）を付ける（親はその要求の作業場所だけを読む）。代（gen）の違う答えは捨てる
// 利用者のテーマのフォルダ（要求の themes：親が選んだフォルダの番号か null。app/theme-folder.js）も同じく親に問い合わせて読む（'tlist' | 'tread'。読むだけ）
import { createEngine } from './engine.js';
import { documentReasons, codeReasons } from '../kit/core/code-scan.mjs';

let engine = null, wsId = null, seq = 0, gen = 0, proxy = null, themesId = null, tproxy = null;
const pend = new Map();
const rpc = (op, arg) => new Promise((resolve, reject) => {
  const id = ++seq;
  pend.set(id, { resolve, reject });
  self.postMessage({ rpc: id, gen, op, arg });
});
// 作業場所の代わり。req は今の要求の番号（要求のたびに替える。読んだ中身の覚えは作業場所が同じなら残す）
const proxyWs = (id) => { const w = { kind: 'proxy', req: null, readBytes: (rel, o) => rpc('read', { ws: id, req: w.req, rel, max: o && Number.isFinite(o.max) ? o.max : null }), list: (o) => rpc('list', { ws: id, req: w.req, o: o || {} }) }; return w; };

const proxyThemes = (id) => { const w = { kind: 'proxy-themes', req: null, readBytes: (rel, o) => rpc('tread', { ws: id, req: w.req, rel, max: o && Number.isFinite(o.max) ? o.max : null }), list: () => rpc('tlist', { ws: id, req: w.req }) }; return w; };

// 表示する文書（信頼する先頭部分 + 組んだデッキ）から決める（main.js の renderedReasons と同じ）
function rendered(r, pre) {
  const trusted = [{ name: 'prefix', start: 0, end: pre.length }, ...(r.trusted || []).map((t) => ({ ...t, start: t.start + pre.length, end: t.end + pre.length }))];
  const out = new Set(documentReasons(pre + r.html, trusted));
  for (const x of r.stats.codeReasons || []) out.add(x);
  return [...out];
}

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.rpcReply) {
    if (m.gen !== gen) return;
    const p = pend.get(m.rpcReply); if (!p) return;
    pend.delete(m.rpcReply);
    if (m.ok) p.resolve(m.value); else p.reject(Object.assign(new Error(m.error.message), { code: m.error.code }, Number.isFinite(m.error.n) ? { n: m.error.n } : {}));
    return;
  }
  if (m.init) { gen = m.gen; engine = createEngine(m.res, (p) => rpc('lazy', p)); return; }
  try {
    let value = null;
    if (m.op === 'probe') value = self[m.name] === undefined ? null : String(self[m.name]);
    else if (m.op === 'scan') value = codeReasons(m.files, { entry: m.entry });
    else {
      if (m.ws !== wsId) { proxy = proxyWs(m.ws); engine.setWorkspace(proxy); wsId = m.ws; }
      proxy.req = m.id;
      const tid = m.themes == null ? null : m.themes;
      if (tid !== themesId) { tproxy = tid === null ? null : proxyThemes(tid); engine.setThemeWorkspace(tproxy); themesId = tid; }
      if (tproxy) tproxy.req = m.id;
      if (m.op === 'build') {
        engine.setListing(m.listing);
        const r = await engine.build(m.file, m.opts || {});
        value = { html: r.html, trusted: r.trusted, stats: r.stats, slides: r.slides, theme: r.theme || null, previewAudio: r.previewAudio || null, reasons: typeof m.prefix === 'string' ? rendered(r, m.prefix) : null };
      } else if (m.op === 'exportIndex') {
        const r = await engine.exportPortable(m.file, m.opts || {});
        value = { index: r.index, registryEquivalent: r.registryEquivalent || [], yanked: (r.stats && r.stats.yanked) || [] };
      } else if (m.op === 'exportHtml') {
        // 持ち運べる 1 ファイルそのもの（AI の返事の貼り付け：メモリの上の原稿を、開く前に 1 ファイルにする。app/llm.js）
        const r = await engine.exportPortable(m.file, m.opts || {});
        value = { html: r.html };
      } else throw new Error('unknown op ' + m.op);
    }
    self.postMessage({ id: m.id, ok: true, value });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: { code: (err && err.code) || 'error', message: String((err && err.message) || err) } });
  }
};
