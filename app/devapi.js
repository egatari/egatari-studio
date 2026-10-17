// 開発サーバー（server/dev.mjs）の /__dev/… と同じ問い合わせを、作業場所（workspace.js：選んだフォルダか、持ち運べる 1 ファイルを開いたメモリの上のフォルダ）に対して答える
// 呼ぶのはアプリ自身の編集の画面（server/editor-ui.js）だけ。プレビュー（デッキの iframe）からは呼べない（プレビューは知らせを送るだけ）。
// 読み書きするのは原稿（deck.html）・narration.md・comments.json と、控えの .cache/edits/ だけ
import { short } from '../kit/core/sha1.mjs';
import { rewriteNarration, narrationRev, rawTurns, splitKey, isStepKey } from '../kit/core/narration-core.mjs';

function parseRange(s) {
  const m = /^(\d+)-(\d+)$/.exec(String(s || ''));
  if (!m) return null;
  const a = +m[1], b = +m[2];
  return a <= b ? [a, b] : null;
}
function rid() {
  const b = new Uint8Array(2); crypto.getRandomValues(b);
  return 'c' + Date.now().toString(36) + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ctx = {ws, generation?(), deckFile(), slideOrder(), editable(range), afterWrite(), msg, beforeWrite?}。slideOrder() は build の slides（{key, id, heading}）の配列。
// editable(range)：今のプレビューの組み立てで直せる要素（data-src を付けたもの）の範囲か
// beforeWrite(kind)：原稿（'source'・'narration'）を書く前に呼ぶ。文字列を返したら書かずに 403 で断る（権利の確認・読むだけの文書）
// generation()：作業場所を替えるたびに増える数。問い合わせは始めたときの作業場所（ctx.ws）と generation に結び付け、
//   途中の await（権利の確認・控え）の間に替わったら、何も書かずに 410（取り消し）で終える（替わった先の作業場所には書かない）
// 書き込みは 1 つずつ（前の保存が終わってから次）。書く直前に原稿をもう一度読み、確かめたときと違えば 409（上書きしない）。
// 書き込みそのものにも live を渡す（書いている途中で替われば、フォルダのファイルは入れ替えずに取り消す）
export function createDevApi(ctx) {
  const M = ctx.msg;
  const ok = (body) => ({ ...body, _status: 200 });
  const err = (status, error) => ({ error, _status: status });
  const gen = () => (ctx.generation ? ctx.generation() : 0);
  let chain = Promise.resolve();
  const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  async function readComments(ws) {
    const t = await ws.readText('comments.json');
    if (t === null) return [];
    try { const j = JSON.parse(t); return Array.isArray(j) ? j : []; } catch { return []; }
  }
  const writeComments = (ws, list, live) => ws.writeText('comments.json', JSON.stringify(list, null, 2) + '\n', { live });

  return async function handle(method, url, body) {
    let u;
    try { u = new URL(String(url), 'http://app.invalid'); } catch { return err(400, 'bad request'); }
    const p = u.pathname;
    body = body && typeof body === 'object' ? body : {};
    // 始めたときの作業場所と generation（書き込みはこの 2 つが今も同じときだけ）
    const ws = ctx.ws, g = gen();
    const live = () => ctx.ws === ws && gen() === g;
    const CANCEL = () => err(410, M.cancelled);
    if (!ws) return err(404, M.notFound);
    try {
      if (method === 'GET' && p === '/__dev/source') {
        const r = parseRange(u.searchParams.get('range'));
        const src = await ws.readText(ctx.deckFile());
        if (!live()) return CANCEL();
        if (src === null) return err(404, M.notFound);
        if (!r || r[1] > src.length) return err(400, M.badRange);
        if (ctx.editable && !ctx.editable(`${r[0]}-${r[1]}`)) return err(409, M.conflict);
        const text = src.slice(r[0], r[1]);
        return ok({ text, h: short(text) });
      }
      if (method === 'POST' && p === '/__dev/edit') {
        const file = ctx.deckFile();
        return await serial(async () => {
          if (!live()) return CANCEL();
          const r = parseRange(body.range);
          if (!r || typeof body.text !== 'string') return err(400, M.badRange);
          const src = await ws.readText(file);
          if (!live()) return CANCEL();
          if (src === null) return err(404, M.notFound);
          if ((ctx.editable && !ctx.editable(`${r[0]}-${r[1]}`)) || r[1] > src.length || short(src.slice(r[0], r[1])) !== body.h) return err(409, M.conflict);
          const no = ctx.beforeWrite && await ctx.beforeWrite('source');
          if (!live()) return CANCEL();
          if (no) return err(403, no);
          await ws.backup(file);
          // 書く直前に：作業場所が同じで、原稿が確かめたときのままか（控えの間に外で変わっていれば上書きしない）
          if (!live()) return CANCEL();
          if ((await ws.readText(file)) !== src) return err(409, M.conflict);
          if (!live()) return CANCEL();
          await ws.writeText(file, src.slice(0, r[0]) + body.text + src.slice(r[1]), { live });
          const failed = live() ? await ctx.afterWrite() : false;
          return ok({ ok: true, error: failed ? M.savedButFailed : null });
        });
      }
      if (method === 'GET' && p === '/__dev/info') return ok({ slides: ctx.slideOrder(), warn: [] });
      if (method === 'GET' && p === '/__dev/narration') {
        const [sk, st] = splitKey(u.searchParams.get('key') || '');
        const text = await ws.readText('narration.md');
        if (!live()) return CANCEL();
        return ok({ key: `${sk}:${st}`, slideKey: sk, stepKey: st, rev: narrationRev(text ?? '', sk, st), ...rawTurns(text, sk, st) });
      }
      if (method === 'POST' && p === '/__dev/narration') {
        const order = ctx.slideOrder();
        return await serial(async () => {
          if (!live()) return CANCEL();
          if (!body.slideKey || !isStepKey(body.stepKey) || !Array.isArray(body.turns)) return err(400, M.badNarr);
          if (typeof body.rev !== 'string') return err(400, M.noRev);
          const sk = String(body.slideKey), st = String(body.stepKey);
          if (!order.some((x) => x.key === sk)) return err(400, M.badNarr);
          const cur = await ws.readText('narration.md');
          if (!live()) return CANCEL();
          const text = cur ?? M.narrHead;
          if (narrationRev(text, sk, st) !== body.rev) return err(409, M.narrConflict);
          const turns = body.turns.filter((t) => t && typeof t === 'object').map((t) => ({ role: String(t.role || ''), text: String(t.text ?? '') }));
          const out = rewriteNarration(text, sk, st, turns, order);
          if (out !== text) {
            const no = ctx.beforeWrite && await ctx.beforeWrite('narration');
            if (!live()) return CANCEL();
            if (no) return err(403, no);
            if (cur !== null) await ws.backup('narration.md');
            if (!live()) return CANCEL();
            if ((await ws.readText('narration.md')) !== cur) return err(409, M.narrConflict);
            if (!live()) return CANCEL();
            await ws.writeText('narration.md', out, { live });
            if (live()) await ctx.afterWrite();
          }
          return ok({ ok: true, changed: out !== text, rev: narrationRev(out, sk, st) });
        });
      }
      if (method === 'GET' && p === '/__dev/comments') {
        const list = await readComments(ws);
        if (!live()) return CANCEL();
        return Object.assign(list, { _status: 200 });
      }
      if (method === 'POST' && p === '/__dev/comment') {
        return await serial(async () => {
          if (!live()) return CANCEL();
          if (!body.comment || !String(body.comment).trim()) return err(400, M.emptyComment);
          const list = await readComments(ws);
          if (!live()) return CANCEL();
          const c = { id: rid(), created: new Date().toISOString(), key: String(body.key || ''), range: body.range || null,
            quote: String(body.quote || '').slice(0, 200), comment: String(body.comment).trim(), status: 'open' };
          list.push(c); await writeComments(ws, list, live);
          if (live()) ctx.onComment && ctx.onComment();
          return ok(c);
        });
      }
      if (method === 'POST' && p === '/__dev/comment/resolve') {
        return await serial(async () => {
          if (!live()) return CANCEL();
          const list = await readComments(ws); const c = list.find((x) => x.id === body.id);
          if (!live()) return CANCEL();
          if (!c) return err(404, M.noComment);
          c.status = 'resolved'; c.resolved = new Date().toISOString(); await writeComments(ws, list, live);
          if (live()) ctx.onComment && ctx.onComment();
          return ok(c);
        });
      }
      return err(404, 'not found');
    } catch (e) {
      // 書いている途中で作業場所が替わった（書き込みを入れ替えずに取り消した）
      if (e && e.name === 'Cancelled') return CANCEL();
      console.error(e);
      return err(500, String((e && e.message) || e));
    }
  };
}
