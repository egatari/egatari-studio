// 試験用の授業の部屋（tools/test-live.mjs と tools/test-app.mjs が使う）：通信の約束（FORMAT.LIVE_VENDOR_DIR の写し）を話す小さな WebSocket のサーバー。
// 依存なし（RFC 6455 の手渡しと文字のフレームだけ）。ループバックだけで待ち受け、ネットワークは使わない
//   const srv = await startFakeLive({requireApproval})
//   srv.endpoint（http://127.0.0.1:<port>）・srv.connections（{url, origin, query}）・srv.messages（学ぶ人から届いた JSON）・srv.http（ws でない要求）
//   srv.drop(code)：つながっている全員を code で切る。srv.rejectNext(code)：次の接続を、手渡しの後すぐ code で切る。srv.admitAll()。srv.send(obj)。srv.close()
// 返事：welcome（写しの fixtures/server-learner/welcome*.json を、この部屋と pid に合わせて）・ask と vote と confused には ack（ref を返す）・name には ack・ping には pong
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMAT } from '../kit/core/format.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PROTOCOL_DIR = path.join(ROOT, ...FORMAT.LIVE_VENDOR_DIR.split('/'));
export const fixture = (rel) => JSON.parse(fs.readFileSync(path.join(PROTOCOL_DIR, 'fixtures', ...rel.split('/')), 'utf8'));
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(op, payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : null;
  if (!head) throw new Error('frame too large for the fake server');
  return Buffer.concat([head, payload]);
}
function closeFrame(code) { const b = Buffer.alloc(2); b.writeUInt16BE(code); return frame(8, b); }

export async function startFakeLive(opts = {}) {
  const connections = [], messages = [], httpReqs = [], socks = new Set();
  let reject = null, requireApproval = !!opts.requireApproval;
  const srv = http.createServer((req, res) => { httpReqs.push(req.url); res.writeHead(404); res.end(); });
  srv.on('upgrade', (req, sock) => {
    const u = new URL(req.url, 'http://x');
    const conn = { url: req.url, origin: req.headers.origin ?? null, query: Object.fromEntries(u.searchParams), open: true };
    connections.push(conn);
    if (u.pathname !== '/ws' || !req.headers['sec-websocket-key']) { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const c = { sock, conn, status: requireApproval ? 'waiting' : 'admitted' };
    socks.add(c);
    const sendObj = (o) => { try { sock.write(frame(1, Buffer.from(JSON.stringify(o)))); } catch { /* gone */ } };
    c.send = sendObj;
    // 閉じる：close のフレームを送り、相手の close を待ってから TCP を閉じる（先に切ると、ブラウザには 1006 に見える）
    c.close = (code) => { if (!conn.open) return; conn.open = false; conn.closedWith = code; c.closing = true; try { sock.write(closeFrame(code)); } catch { /* gone */ } setTimeout(() => sock.destroy(), 2000); socks.delete(c); };
    sock.on('close', () => { conn.open = false; socks.delete(c); });
    sock.on('error', () => {});
    if (reject) { const code = reject; reject = null; setTimeout(() => c.close(code), 20); return; }
    const w = fixture(c.status === 'admitted' ? 'server-learner/welcome.json' : 'server-learner/welcome-waiting.json');
    sendObj({ ...w, room: conn.query.room, pid: conn.query.pid, window: opts.window || w.window });
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 15, masked = buf[1] & 128;
        let n = buf[1] & 127, off = 2;
        if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); off = 4; } else if (n === 127) { c.close(4400); return; }
        const need = off + (masked ? 4 : 0) + n;
        if (buf.length < need) return;
        const mask = masked ? buf.subarray(off, off + 4) : null;
        const p = Buffer.from(buf.subarray(off + (masked ? 4 : 0), need));
        if (mask) for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
        buf = buf.subarray(need);
        if (op === 8) { conn.open = false; conn.closedByClient = p.length >= 2 ? p.readUInt16BE(0) : 1005; if (!c.closing) { try { sock.write(closeFrame(1000)); } catch { /* gone */ } } sock.end(); socks.delete(c); return; }
        if (op === 9) { sock.write(frame(10, p)); continue; }
        if (op !== 1) continue;
        let m;
        try { m = JSON.parse(p.toString('utf8')); } catch { c.close(4400); return; }
        messages.push(m);
        const ref = m.ref ? { ref: m.ref } : {};
        if (m.t === 'ping') sendObj({ v: 1, t: 'pong' });
        else if (m.t === 'name') sendObj({ v: 1, t: 'ack', ...ref });
        else if (c.status !== 'admitted') sendObj({ v: 1, t: 'error', code: 'not_admitted', ...ref });
        else if (m.t === 'ask') sendObj({ v: 1, t: 'ack', ...ref, item: 'q-' + 'abcdefghij' });
        else if (m.t === 'vote' || m.t === 'confused') sendObj({ v: 1, t: 'ack', ...ref });
        else { sendObj({ v: 1, t: 'error', code: 'unknown_type', ...ref }); c.close(4400); }
      }
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${srv.address().port}`;
  return {
    endpoint, connections, messages, http: httpReqs,
    get open() { return [...socks].filter((c) => c.conn.open).length; },
    drop(code) { for (const c of [...socks]) c.close(code); },
    rejectNext(code) { reject = code; },
    setApproval(on) { requireApproval = !!on; },
    admitAll() { for (const c of socks) if (c.status === 'waiting') { c.status = 'admitted'; c.send({ v: 1, t: 'admitted', shown: [] }); } },
    send(o) { for (const c of socks) c.send(o); },
    reset() { connections.length = 0; messages.length = 0; httpReqs.length = 0; },
    close() { for (const c of [...socks]) { try { c.sock.destroy(); } catch { /* gone */ } } return new Promise((r) => srv.close(r)); },
  };
}
