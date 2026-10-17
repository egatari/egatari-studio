// 開発サーバー（server/dev.mjs）の /__dev/… と同じ問い合わせを、選んだフォルダに対して答える
// server/client.js（デッキの iframe の中）は運び手（postMessage）を通してここを呼ぶ。読み書きするのは
// 原稿（deck.html）・narration.md・comments.json と、控えの .cache/edits/ だけ
import { short } from '../kit/core/sha1.mjs';
import { rewriteNarration, narrationRev, rawTurns, splitKey, isStepKey } from '../kit/core/narration-core.mjs';
import { readText, writeText, backup } from './fsx.js';

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

// ctx = {root, deckFile(), slideOrder(), afterWrite(), msg}。slideOrder() は build の slides（{key, id, heading}）の配列
export function createDevApi(ctx) {
  const M = ctx.msg;
  const ok = (body) => ({ ...body, _status: 200 });
  const err = (status, error) => ({ error, _status: status });
  async function readComments() {
    const t = await readText(ctx.root, 'comments.json');
    if (t === null) return [];
    try { const j = JSON.parse(t); return Array.isArray(j) ? j : []; } catch { return []; }
  }
  const writeComments = (list) => writeText(ctx.root, 'comments.json', JSON.stringify(list, null, 2) + '\n');

  return async function handle(method, url, body) {
    let u;
    try { u = new URL(String(url), 'http://app.invalid'); } catch { return err(400, 'bad request'); }
    const p = u.pathname;
    body = body && typeof body === 'object' ? body : {};
    try {
      if (method === 'GET' && p === '/__dev/source') {
        const r = parseRange(u.searchParams.get('range'));
        const src = await readText(ctx.root, ctx.deckFile());
        if (src === null) return err(404, M.notFound);
        if (!r || r[1] > src.length) return err(400, M.badRange);
        const text = src.slice(r[0], r[1]);
        return ok({ text, h: short(text) });
      }
      if (method === 'POST' && p === '/__dev/edit') {
        const r = parseRange(body.range);
        if (!r || typeof body.text !== 'string') return err(400, M.badRange);
        const file = ctx.deckFile();
        const src = await readText(ctx.root, file);
        if (src === null) return err(404, M.notFound);
        if (r[1] > src.length || short(src.slice(r[0], r[1])) !== body.h) return err(409, M.conflict);
        await backup(ctx.root, file);
        await writeText(ctx.root, file, src.slice(0, r[0]) + body.text + src.slice(r[1]));
        const failed = await ctx.afterWrite();
        return ok({ ok: true, error: failed ? M.savedButFailed : null });
      }
      if (method === 'GET' && p === '/__dev/narration') {
        const [sk, st] = splitKey(u.searchParams.get('key') || '');
        const text = await readText(ctx.root, 'narration.md');
        return ok({ key: `${sk}:${st}`, slideKey: sk, stepKey: st, rev: narrationRev(text ?? '', sk, st), ...rawTurns(text, sk, st) });
      }
      if (method === 'POST' && p === '/__dev/narration') {
        if (!body.slideKey || !isStepKey(body.stepKey) || !Array.isArray(body.turns)) return err(400, M.badNarr);
        if (typeof body.rev !== 'string') return err(400, M.noRev);
        const sk = String(body.slideKey), st = String(body.stepKey);
        const cur = await readText(ctx.root, 'narration.md');
        const text = cur ?? M.narrHead;
        if (narrationRev(text, sk, st) !== body.rev) return err(409, M.narrConflict);
        const turns = body.turns.filter((t) => t && typeof t === 'object').map((t) => ({ role: String(t.role || ''), text: String(t.text ?? '') }));
        const out = rewriteNarration(text, sk, st, turns, ctx.slideOrder());
        if (out !== text) { if (cur !== null) await backup(ctx.root, 'narration.md'); await writeText(ctx.root, 'narration.md', out); await ctx.afterWrite(); }
        return ok({ ok: true, changed: out !== text, rev: narrationRev(out, sk, st) });
      }
      if (method === 'GET' && p === '/__dev/comments') {
        const list = await readComments();
        return Object.assign(list, { _status: 200 });
      }
      if (method === 'POST' && p === '/__dev/comment') {
        if (!body.comment || !String(body.comment).trim()) return err(400, M.emptyComment);
        const list = await readComments();
        const c = { id: rid(), created: new Date().toISOString(), key: String(body.key || ''), range: body.range || null,
          quote: String(body.quote || '').slice(0, 200), comment: String(body.comment).trim(), status: 'open' };
        list.push(c); await writeComments(list);
        ctx.onComment && ctx.onComment();
        return ok(c);
      }
      if (method === 'POST' && p === '/__dev/comment/resolve') {
        const list = await readComments(); const c = list.find((x) => x.id === body.id);
        if (!c) return err(404, M.noComment);
        c.status = 'resolved'; c.resolved = new Date().toISOString(); await writeComments(list);
        ctx.onComment && ctx.onComment();
        return ok(c);
      }
      return err(404, 'not found');
    } catch (e) {
      console.error(e);
      return err(500, String((e && e.message) || e));
    }
  };
}
